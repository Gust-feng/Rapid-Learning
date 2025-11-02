// Background service worker: routes AI requests and provides cross-origin fetch

const fetchWithTimeout = async (resource, options = {}) => {
  const { timeout = 120000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(resource, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
};

const toHeaderString = (headers) => {
  try {
    const entries = Array.from(headers.entries());
    return entries.map(([k, v]) => `${k}: ${v}`).join('\r\n');
  } catch {
    return '';
  }
};

/**
 * 从 AI 响应中提取最终答案
 * 支持思考模型（OpenAI o1, DeepSeek 等）
 * @param {Object} data - API 响应数据
 * @returns {string} 提取的答案
 * @throws {Error} 当响应无效或包含错误时抛出异常
 */
const extractAnswer = (data) => {
  // 检查 API 错误响应
  if (data.error) {
    const errMsg = data.error.message || data.error.code || JSON.stringify(data.error);
    throw new Error(`API Error: ${errMsg}`);
  }
  
  // 检查是否有有效的 choices
  if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error('API 响应中没有有效的 choices');
  }
  
  let answer = '';
  const choice = data?.choices?.[0];
  
  if (!choice || !choice.message) {
    return answer;
  }
  
  const message = choice.message;
  
  // 获取内容
  if (message.content) {
    answer = message.content;
    
    // 处理 DeepSeek 等模型的 <think>...</think> 标签
    // 移除思考过程，只保留最终答案
    const thinkRegex = /<think>[\s\S]*?<\/think>/gi;
    if (thinkRegex.test(answer)) {
      answer = answer.replace(thinkRegex, '').trim();
    }
    
    // 处理可能的 markdown 代码块包裹
    // 有些模型会用代码块包裹答案
    const codeBlockRegex = /```(?:\w+)?\n?([\s\S]*?)\n?```/;
    const codeMatch = answer.match(codeBlockRegex);
    if (codeMatch && codeMatch[1] && codeMatch[1].length < answer.length * 0.8) {
      // 只有当代码块内容明显更短时才提取（避免误判）
      const extracted = codeMatch[1].trim();
      if (extracted && extracted.length > 0) {
        answer = extracted;
      }
    }
    
    // 移除可能的 <answer>...</answer> 标签
    const answerTagRegex = /<answer>([\s\S]*?)<\/answer>/i;
    const answerMatch = answer.match(answerTagRegex);
    if (answerMatch && answerMatch[1]) {
      answer = answerMatch[1].trim();
    }
  }
  
  // 最终清理：移除多余的空白和换行
  answer = answer.trim();
  
  return answer;
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'GM_fetch_resource') {
      try {
        const res = await fetchWithTimeout(msg.url, { method: 'GET' });
        const text = await res.text();
        sendResponse({ ok: res.ok, status: res.status, text });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
      return;
    }

    if (msg.type === 'GM_xmlhttpRequest') {
      try {
        const o = msg.options || {};
        const method = (o.method || 'GET').toUpperCase();
        const headers = o.headers || {};
        const body = o.data;
        const timeout = o.timeout || 120000;
        const res = await fetchWithTimeout(o.url, { method, headers, body, timeout, redirect: 'follow' });
        const finalUrl = res.url;
        const status = res.status;
        const statusText = res.statusText;
        const responseHeaders = toHeaderString(res.headers);
        const responseText = await res.text();
        sendResponse({ finalUrl, status, statusText, responseHeaders, responseText });
      } catch (e) {
        sendResponse({ error: String(e && e.message || e) });
      }
      return;
    }

    if (msg.type === 'ai_answer') {
      const startTime = Date.now();
      const logEntry = {
        timestamp: startTime,
        status: 'pending',
        url: '',
        model: '',
        requestBody: null,
        response: null,
        answer: '',
        error: null,
        duration: 0
      };
      
      try {
        const conf = await new Promise((resolve)=> chrome.storage.local.get({
          ai_api_url: 'https://api.moonshot.cn/v1/chat/completions',
          ai_api_key: '',
          ai_model: 'kimi-k2-turbo-preview',
          ai_temperature: 0.3,
          ai_system_prompt: ''
        }, resolve));
        
        logEntry.url = conf.ai_api_url;
        logEntry.model = conf.ai_model;
        
        if (!conf.ai_api_key) { 
          logEntry.status = 'error';
          logEntry.error = 'NO_API_KEY';
          logEntry.duration = Date.now() - startTime;
          saveDebugLog(logEntry);
          sendResponse({ error: 'NO_API_KEY' }); 
          return; 
        }
        
        const body = {
          model: conf.ai_model,
          temperature: conf.ai_temperature,
          messages: [
            conf.ai_system_prompt ? { role:'system', content: conf.ai_system_prompt } : null,
            { role:'user', content: String(msg.payload?.prompt || '') }
          ].filter(Boolean),
          max_tokens: 4096
        };
        
        logEntry.requestBody = body;
        
        const resp = await fetchWithTimeout(conf.ai_api_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${conf.ai_api_key}`
          },
          body: JSON.stringify(body),
          timeout: 120000
        });
        
        // 检查 HTTP 状态码
        if (!resp.ok) {
          const errorText = await resp.text().catch(() => '');
          logEntry.status = 'error';
          logEntry.error = `HTTP ${resp.status}: ${errorText.slice(0, 200)}`;
          logEntry.duration = Date.now() - startTime;
          saveDebugLog(logEntry);
          sendResponse({ error: logEntry.error });
          return;
        }
        
        const data = await resp.json().catch(()=>({}));
        logEntry.response = data;
        
        // 使用统一的答案提取函数（会检查 data.error 和 choices）
        const answer = extractAnswer(data);
        
        logEntry.answer = answer;
        logEntry.status = 'success';
        logEntry.duration = Date.now() - startTime;
        
        saveDebugLog(logEntry);
        sendResponse({ answer });
      } catch (e) {
        logEntry.status = 'error';
        logEntry.error = String(e && e.message || e);
        logEntry.duration = Date.now() - startTime;
        saveDebugLog(logEntry);
        sendResponse({ error: String(e && e.message || e) });
      }
      return;
    }

    if (msg.type === 'ai_test') {
      try {
        const p = msg.payload || {};
        const url = p.ai_api_url || 'https://api.moonshot.cn/v1/chat/completions';
        const key = p.ai_api_key || '';
        const model = p.ai_model || 'kimi-k2-turbo-preview';
        const temperature = p.ai_temperature ?? 0.3;
        const systemPrompt = p.ai_system_prompt || '';
        if (!key) { sendResponse({ error: 'NO_API_KEY' }); return; }
        const body = {
          model,
          temperature,
          messages: [
            systemPrompt ? { role:'system', content: systemPrompt } : null,
            { role:'user', content: 'ping' }
          ].filter(Boolean),
          max_tokens: 16
        };
        const resp = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(body),
          timeout: 30000
        });
        if (!resp.ok) {
          const text = await resp.text();
          sendResponse({ error: `HTTP ${resp.status}: ${text.slice(0,200)}` });
          return;
        }
        const data = await resp.json().catch(()=>({}));
        
        // 使用统一的答案提取函数
        const answer = extractAnswer(data);
        
        sendResponse({ ok: true, answer });
      } catch (e) {
        sendResponse({ error: String(e && e.message || e) });
      }
      return;
    }

    if (msg.type === 'openOptions') {
      try {
        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
      return;
    }
  })();

  // indicate async sendResponse
  return true;
});

// Click toolbar icon to open options
try {
  chrome.action.onClicked.addListener(() => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  });
} catch (_) {}

// Keyboard command to toggle panel
try {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-panel') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'toggle_panel' });
  });
} catch (_) {}

// Open options on install (first time)
try {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    }
  });
} catch (_) {}

// Function to save debug logs
function saveDebugLog(logEntry) {
  chrome.storage.local.get(['apiDebugLogs'], (result) => {
    const logs = result.apiDebugLogs || [];
    logs.push(logEntry);
    // Keep only last 100 logs to avoid storage overflow
    if (logs.length > 100) {
      logs.shift();
    }
    chrome.storage.local.set({ apiDebugLogs: logs });
  });
}
