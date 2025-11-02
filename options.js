(function () {
  const $ = (id) => document.getElementById(id);
  const setMsg = (node, text, ok) => { node.textContent = text; node.className = ok ? 'hint ok' : 'hint err'; };

  const KEYS = [
    'ai_api_url', 'ai_api_key', 'ai_model', 'ai_temperature', 'ai_system_prompt', 'answer_interval', 'auto_start', 'compact_mode'
  ];

  // Tab switching
  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        // Remove active class from all tabs and contents
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        // Add active class to clicked tab and its content
        tab.classList.add('active');
        document.getElementById('tab-' + targetTab).classList.add('active');
        
        // If switching to debug tab, load logs
        if (targetTab === 'debug') {
          loadDebugLogs();
        }
        // If switching to help tab, load markdown
        if (targetTab === 'help') {
          loadHelpContent();
        }
      });
    });
  }

  function load() {
    chrome.storage.local.get(KEYS, (vals) => {
      $('ai_api_url').value = vals.ai_api_url || 'https://api.moonshot.cn/v1/chat/completions';
      $('ai_api_key').value = vals.ai_api_key || '';
      $('ai_model').value = vals.ai_model || 'kimi-k2-turbo-preview';
      $('ai_temperature').value = vals.ai_temperature ?? 0.3;
      $('ai_system_prompt').value = vals.ai_system_prompt || '你是一个专业的在线教育答题助手。请根据题目内容，直接给出正确答案。对于选择题，只返回选项字母（如A、B、C、D）；对于判断题，返回"正确"或"错误"；对于填空题，如有多个空，请用英文逗号、中文逗号、顿号或空格分隔答案（例如：答案1,答案2,答案3 或 答案1、答案2、答案3 或 答案1 答案2 答案3）；不要解释，只返回答案。';
      $('answer_interval').value = vals.answer_interval ?? 3;
      $('auto_start').checked = !!vals.auto_start;
      const cm = document.getElementById('compact_mode'); if (cm) cm.checked = !!vals.compact_mode;
    });
  }

  function save() {
    const data = {
      ai_api_url: $('ai_api_url').value.trim(),
      ai_api_key: $('ai_api_key').value.trim(),
      ai_model: $('ai_model').value.trim(),
      ai_temperature: parseFloat($('ai_temperature').value),
      ai_system_prompt: $('ai_system_prompt').value,
      answer_interval: Math.max(1, parseInt($('answer_interval').value || '3', 10)),
      auto_start: $('auto_start').checked,
      compact_mode: (document.getElementById('compact_mode')?.checked) || false
    };
    chrome.storage.local.set(data, () => {
      setMsg($('msg_simple'), '已保存', true);
      setTimeout(() => setMsg($('msg_simple'), '', true), 2000);
    });
  }

  async function testAPI() {
    const payload = {
      ai_api_url: $('ai_api_url').value.trim(),
      ai_api_key: $('ai_api_key').value.trim(),
      ai_model: $('ai_model').value.trim(),
      ai_temperature: parseFloat($('ai_temperature').value) || 0.3,
      ai_system_prompt: $('ai_system_prompt').value.trim()
    };
    const msg = $('msg_simple');
    msg.textContent = '测试中...'; msg.className = 'hint';
    try {
      const resp = await new Promise((resolve, reject)=>{
        chrome.runtime.sendMessage({ type:'ai_test', payload }, (res)=>{
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          resolve(res);
        });
      });
      if (resp && !resp.error) {
        msg.textContent = '测试成功'; msg.className = 'hint ok';
      } else {
        msg.textContent = '测试失败：' + (resp && resp.error || '未知错误'); msg.className = 'hint err';
      }
    } catch (e) {
      msg.textContent = '测试失败：' + (e && e.message || e); msg.className = 'hint err';
    }
  }

  // Debug log functionality
  let debugLogs = [];
  let currentFilter = 'all';
  let autoRefreshEnabled = true;
  let autoRefreshTimer = null;
  let startTime = Date.now();
  const MAX_RENDER_LOGS = 50; // 最多渲染50条，避免卡顿

  function loadDebugLogs() {
    chrome.storage.local.get(['apiDebugLogs'], (result) => {
      debugLogs = result.apiDebugLogs || [];
      
      // 自动清理：超过200条时，删除3天前的日志
      if (debugLogs.length > 200) {
        const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
        const originalLength = debugLogs.length;
        debugLogs = debugLogs.filter(log => log.timestamp > threeDaysAgo);
        
        // 如果清理后还是超过200条，只保留最新的200条
        if (debugLogs.length > 200) {
          debugLogs = debugLogs.slice(-200);
        }
        
        // 保存清理后的日志
        if (debugLogs.length < originalLength) {
          chrome.storage.local.set({ apiDebugLogs: debugLogs });
          console.log(`[Auto Clean] Removed ${originalLength - debugLogs.length} old logs`);
        }
      }
      
      updateDebugStats();
      renderDebugLogs();
    });
  }

  function updateDebugStats() {
    const total = debugLogs.length;
    const success = debugLogs.filter(log => log.status === 'success').length;
    const error = debugLogs.filter(log => log.status === 'error').length;
    const times = debugLogs.filter(log => log.duration).map(log => log.duration);
    
    // 总请求 - 白色
    $('totalRequests').textContent = total;
    $('totalRequests').style.color = '#e6edf3';
    
    // 成功 - 青色
    $('successRequests').textContent = success;
    $('successRequests').style.color = '#3fb950';
    
    // 失败 - 红色
    $('errorRequests').textContent = error;
    $('errorRequests').style.color = '#f85149';
    
    // 平均耗时 - 根据时间设置颜色
    if (times.length > 0) {
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      $('avgTime').textContent = avg + 'ms';
      
      if (avg < 600) {
        $('avgTime').style.color = '#3fb950'; // 青色
      } else if (avg < 1000) {
        $('avgTime').style.color = '#e6edf3'; // 白色
      } else {
        $('avgTime').style.color = '#f85149'; // 红色
      }
    } else {
      $('avgTime').textContent = '0ms';
      $('avgTime').style.color = '#e6edf3';
    }
    
    // 运行时间 - 白色
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    $('uptime').textContent = uptime + 's';
    $('uptime').style.color = '#e6edf3';
  }

  function renderDebugLogs() {
    const container = $('logContainer');
    let filteredLogs = debugLogs;
    
    if (currentFilter !== 'all') {
      filteredLogs = debugLogs.filter(log => log.status === currentFilter);
    }
    
    if (filteredLogs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          ${currentFilter === 'all' ? '等待 API 调用...' : '没有' + currentFilter + '的日志'}
        </div>
      `;
      return;
    }
    
    // 性能优化：只渲染最新的 MAX_RENDER_LOGS 条
    const logsToRender = filteredLogs.slice(-MAX_RENDER_LOGS).reverse();
    const skippedCount = filteredLogs.length - logsToRender.length;
    
    let html = '';
    if (skippedCount > 0) {
      html += `<div style="color:#8b949e; text-align:center; padding:10px; border-bottom:1px solid #21262d; font-size:11px;">
        ··· 已隐藏 ${skippedCount} 条旧记录（显示最新 ${MAX_RENDER_LOGS} 条）···
      </div>`;
    }
    
    html += logsToRender.map(log => createLogEntry(log)).join('');
    container.innerHTML = html;
  }

  function createLogEntry(log) {
    const timestamp = new Date(log.timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
    
    const statusClass = log.status || 'pending';
    const statusText = {
      success: '成功',
      error: '失败',
      pending: '进行中'
    }[statusClass] || '未知';
    
    const duration = log.duration ? `${log.duration}ms` : '-';
    
    return `
      <div class="log-entry ${statusClass}">
        <div class="log-header">
          <span class="log-timestamp">${timestamp} +${duration}</span>
          <span class="log-status ${statusClass}">${statusText}</span>
        </div>
        
        ${log.model ? `
          <div class="log-section">
            <div class="log-section-title">模型</div>
            <div class="log-content">${escapeHtml(log.model)}</div>
          </div>
        ` : ''}
        
        ${log.requestBody ? `
          <div class="log-section">
            <div class="log-section-title">请求</div>
            <div class="log-content json">${formatJson(log.requestBody)}</div>
          </div>
        ` : ''}
        
        ${log.response ? `
          <div class="log-section">
            <div class="log-section-title">响应</div>
            <div class="log-content json">${formatJson(log.response)}</div>
          </div>
        ` : ''}
        
        ${log.error ? `
          <div class="log-section">
            <div class="log-section-title">错误</div>
            <div class="log-content" style="color: #f85149;">${escapeHtml(log.error)}</div>
          </div>
        ` : ''}
        
        ${log.answer ? `
          <div class="log-section">
            <div class="log-section-title">答案</div>
            <div class="log-content" style="color: #3fb950;">${escapeHtml(log.answer)}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function formatJson(obj) {
    try {
      if (typeof obj === 'string') {
        obj = JSON.parse(obj);
      }
      return escapeHtml(JSON.stringify(obj, null, 2));
    } catch (e) {
      return escapeHtml(String(obj));
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function clearDebugLogs() {
    if (confirm('确定要清空所有日志吗？')) {
      debugLogs = [];
      chrome.storage.local.set({ apiDebugLogs: [] }, () => {
        updateDebugStats();
        renderDebugLogs();
      });
    }
  }

  function exportDebugLogs() {
    const dataStr = JSON.stringify(debugLogs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `api-debug-logs-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleAutoRefresh() {
    autoRefreshEnabled = !autoRefreshEnabled;
    const btn = $('autoRefreshToggle');
    
    if (autoRefreshEnabled) {
      btn.textContent = '自动刷新: 开启';
      btn.style.borderColor = '#58a6ff';
      startAutoRefresh();
    } else {
      btn.textContent = '自动刷新: 关闭';
      btn.style.borderColor = '#f85149';
      stopAutoRefresh();
    }
  }

  function startAutoRefresh() {
    if (autoRefreshTimer) return;
    
    // 每秒刷新一次
    autoRefreshTimer = setInterval(() => {
      if (autoRefreshEnabled) {
        loadDebugLogs();
      }
    }, 1000);
  }

  function stopAutoRefresh() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  }

  function initDebugControls() {
    const clearBtn = $('clearBtn');
    const exportBtn = $('exportBtn');
    const autoRefreshToggle = $('autoRefreshToggle');
    
    if (clearBtn) clearBtn.addEventListener('click', clearDebugLogs);
    if (exportBtn) exportBtn.addEventListener('click', exportDebugLogs);
    if (autoRefreshToggle) autoRefreshToggle.addEventListener('click', toggleAutoRefresh);
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        renderDebugLogs();
      });
    });
    
    // 启动自动刷新
    startAutoRefresh();
  }

  // Load help content from README.md
  let helpContentLoaded = false;
  function loadHelpContent() {
    if (helpContentLoaded) return;
    
    fetch(chrome.runtime.getURL('README.md'))
      .then(response => response.text())
      .then(markdown => {
        $('helpContent').innerHTML = convertMarkdownToHtml(markdown);
        helpContentLoaded = true;
      })
      .catch(error => {
        console.error('加载README.md失败:', error);
        $('helpContent').innerHTML = '<p style="color:#f85149;">加载失败，请检查README.md文件</p>';
      });
  }

  // Simple markdown to HTML converter
  function convertMarkdownToHtml(markdown) {
    let lines = markdown.split('\n');
    let html = '';
    let i = 0;
    
    while (i < lines.length) {
      let line = lines[i];
      
      // Check for badge lines (collect consecutive badge lines)
      if (line.includes('[![') && line.match(/\[!\[.*?\]\(.*?\)\]\(.*?\)/)) {
        let allBadges = [];
        
        // Collect all consecutive badge lines
        while (i < lines.length && lines[i].includes('[![') && lines[i].match(/\[!\[.*?\]\(.*?\)\]\(.*?\)/)) {
          const badgeMatches = lines[i].match(/\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g);
          if (badgeMatches) {
            allBadges.push(...badgeMatches);
          }
          i++;
        }
        
        // Render all badges in one centered flex container
        if (allBadges.length > 0) {
          html += '<div style="text-align: center; margin: 20px 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;">';
          allBadges.forEach(badge => {
            const match = badge.match(/\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/);
            if (match) {
              const altText = match[1];
              const imgUrl = match[2];
              const linkUrl = match[3];
              html += `<a href="${linkUrl}" target="_blank" style="display: inline-block;"><img src="${imgUrl}" alt="${altText}" style="display: block;" /></a>`;
            }
          });
          html += '</div>\n';
        }
        continue;
      }
      
      // Check for table
      if (line.trim().startsWith('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
        let tableLines = [line];
        let j = i + 1;
        
        // Collect all table lines
        while (j < lines.length && lines[j].trim().startsWith('|')) {
          tableLines.push(lines[j]);
          j++;
        }
        
        // Parse table
        if (tableLines.length >= 2) {
          const headers = tableLines[0].split('|').map(h => h.trim()).filter(h => h);
          const rows = tableLines.slice(2).map(line => 
            line.split('|').map(cell => cell.trim()).filter(cell => cell)
          );
          
          html += '<table><thead><tr>';
          headers.forEach(header => {
            html += `<th>${header}</th>`;
          });
          html += '</tr></thead><tbody>';
          
          rows.forEach(row => {
            if (row.length > 0) {
              html += '<tr>';
              row.forEach(cell => {
                html += `<td>${cell}</td>`;
              });
              html += '</tr>';
            }
          });
          
          html += '</tbody></table>\n';
          i = j;
          continue;
        }
      }
      
      // Headers
      if (line.startsWith('### ')) {
        html += '<h3>' + line.substring(4) + '</h3>\n';
      } else if (line.startsWith('## ')) {
        html += '<h2>' + line.substring(3) + '</h2>\n';
      } else if (line.startsWith('# ')) {
        html += '<h1>' + line.substring(2) + '</h1>\n';
      }
      // Horizontal rule
      else if (line.trim() === '---') {
        html += '<hr>\n';
      }
      // Blockquote
      else if (line.startsWith('> ')) {
        html += '<blockquote>' + line.substring(2) + '</blockquote>\n';
      }
      // Lists
      else if (line.match(/^[\*\-] /)) {
        let listItems = '';
        while (i < lines.length && lines[i].match(/^[\*\-] /)) {
          listItems += '<li>' + lines[i].substring(2) + '</li>\n';
          i++;
        }
        html += '<ul>' + listItems + '</ul>\n';
        continue;
      }
      else if (line.match(/^\d+\. /)) {
        let listItems = '';
        while (i < lines.length && lines[i].match(/^\d+\. /)) {
          listItems += '<li>' + lines[i].replace(/^\d+\. /, '') + '</li>\n';
          i++;
        }
        html += '<ol>' + listItems + '</ol>\n';
        continue;
      }
      // Code blocks
      else if (line.trim().startsWith('```')) {
        let codeBlock = '';
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeBlock += lines[i] + '\n';
          i++;
        }
        html += '<pre><code>' + escapeHtml(codeBlock) + '</code></pre>\n';
      }
      // Paragraph
      else if (line.trim() !== '') {
        html += '<p>' + line + '</p>\n';
      } else {
        html += '\n';
      }
      
      i++;
    }
    
    // Process inline markdown
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Process regular links (but not badges which were already processed)
    html = html.replace(/(?<!\!)\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    return html;
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize everything
  initTabs();
  initDebugControls();
  load();
  
  $('save_simple').addEventListener('click', save);
  const testBtn = document.getElementById('test_api');
  if (testBtn) testBtn.addEventListener('click', testAPI);
})();
