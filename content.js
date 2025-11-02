// Independent content script: builds its own panel, logs, and site-specific scanners

(function () {
  try { if (window.top !== window.self) return; } catch (_) {}
  if (window.__AI_INDEPENDENT_ASSISTANT__) return;
  window.__AI_INDEPENDENT_ASSISTANT__ = true;

  const S = {
    scanIntervalSec: 3,
  };

  const state = {
    visible: true,
    auto: false,
    scanning: false,
    timer: null,
    minimized: false,
  };

  // De-duplication to avoid repeated requests/loops
  const processed = new Set();
  const processing = new Set();
  let lastNoQuestionLogAt = 0;
  const parsedSet = new Set();
  let parsedQueue = [];

  const qKey = (q) => {
    const site = location.hostname.replace(/^www\./,'');
    const t = (q.text || '').slice(0, 120);
    const c = (q.choices || []).map(x=>x.text).join('|').slice(0, 200);
    return `${site}|${location.pathname}|${t}|${c}`;
  };

  // Utilities
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const cleanText = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const getRootShadow = () => {
    const root = document.querySelector('#ai-answer-assistant-root');
    return root?.shadowRoot || root;
  };

  // Logger and Panel
  const logger = {
    el: null,
    list: null,
    add(msg, level = 'info') {
      if (!this.list) return console.log('[AI助手]', msg);
      const li = document.createElement('div');
      li.className = 'log-item ' + level;
      const time = new Date().toLocaleTimeString();
      li.textContent = `[${time}] ${msg}`;
      this.list.prepend(li);
    },
    clear() { this.list && (this.list.innerHTML = ''); }
  };

  const typeName = (t) => ({ single:'单选', multiple:'多选', truefalse:'判断', fill:'填空/简答', unknown:'其它' }[t] || '其它');
  const snippet = (s, n=38) => {
    const text = cleanText(s||'');
    return text.length>n ? text.slice(0,n-1)+'…' : text;
  };
  function extractNoAndStem(text) {
    let no = '';
    let rest = text || '';
    const m = /^\s*(\d+)\s*[\.|．|、|:|：]\s*(.*)$/.exec(rest);
    if (m) { no = m[1]; rest = m[2] || ''; }
    // 去掉（单选题）等前缀
    rest = rest.replace(/^（[^）]*）\s*/,'');
    rest = sanitizeForTitle(rest);
    return { no, stem: rest };
  }

  const stripAnswerTrails = (s) => {
    let t = String(s || '');
    t = t.replace(/(?:我的答案|正确答案|参考答案|答案解析|AI讲解)[:：][\s\S]*$/g, '');
    t = t.replace(/\d+\s*分\b[\s\S]*$/g, '');
    return cleanText(t);
  };

  // 提取题干中的内联选项，如 “A. … B. … C. … D. …” 或 “A、 … B、 …”
  function extractInlineOptions(text) {
    const raw = stripAnswerTrails(text || '');
    // 先找到第一个选项起点 A. / A、 / A． / A) / A ）
    const startMatch = raw.match(/[AＡ][\.．、\)）]\s*/);
    if (!startMatch) return [];
    const startIdx = raw.indexOf(startMatch[0]);
    const optStr = raw.slice(startIdx);
    const results = [];
    // 逐个匹配 A..H 段落
    const re = /([A-HＡ-Ｈ])[\.．、\)）]\s*([\s\S]*?)(?=(?:[B-HＢ-Ｈ][\.．、\)）]\s*)|$)/g;
    let m;
    while ((m = re.exec(optStr)) !== null) {
      const key = m[1].toUpperCase().replace('Ａ','A').replace('Ｂ','B').replace('Ｃ','C').replace('Ｄ','D').replace('Ｅ','E').replace('Ｆ','F').replace('Ｇ','G').replace('Ｈ','H');
      const txt = stripAnswerTrails(cleanText(m[2] || ''));
      if (txt) results.push({ key, text: txt });
    }
    return results;
  }
  const sanitizeForTitle = (s) => {
    let t = (s||'');
    t = t.replace(/\s+[AＡ][\.|．|、]\s*[\s\S]*/,'');
    t = t.replace(/我的答案[:：].*/g,'');
    t = t.replace(/正确答案[:：].*/g,'');
    t = t.replace(/答案解析[:：].*/g,'');
    t = t.replace(/AI讲解.*/g,'');
    t = t.replace(/\d+\s*分\b.*/g,'');
    return cleanText(t);
  };
  logger.addQ = function(q){
    if (!this.list) return;
    const li = document.createElement('div');
    li.className = 'log-item q';
    const time = new Date().toLocaleTimeString();
    const head = document.createElement('div');
    head.innerHTML = `<span class="tag">题目</span>[${time}] ${typeName(q.type)}｜${snippet(sanitizeForTitle(q.text))}`;
    const detail = document.createElement('div');
    detail.className = 'detail';
    const fullQ = document.createElement('div'); fullQ.textContent = '题干：' + sanitizeForTitle(q.text||'');
    detail.appendChild(fullQ);
    const listChoices = (q.choices && q.choices.length) ? q.choices : extractInlineOptions(q.text||'');
    // 将解析后的选项保存到q对象，供后续API调用使用
    q.parsedChoices = listChoices;
    if (listChoices.length) {
      listChoices.forEach(c=>{ const line = document.createElement('span'); line.className='opt'; line.innerHTML = `<b>${c.key}.</b> ${c.text}`; detail.appendChild(line); });
    }
    li.appendChild(head);
    li.appendChild(detail);
    this.list.prepend(li);
    // 根据"显示详情"开关，避免题干在标题与详情重复显示
    try {
      const sr = getRootShadow();
      const logEl = sr?.querySelector('#log');
      const detailsOn = !!logEl && !logEl.classList.contains('details-off');
      const headEl = li.firstChild;
      const detEl = li.querySelector('.detail');
      if (detailsOn) {
        const meta = extractNoAndStem(q.text||'');
        if (headEl) headEl.innerHTML = `<span class=\"chip\">${meta.no || '题'}</span>${meta.stem}`;
        // 保留下面的选项明细（已在上方构建），不再重复“题干：”一行
        if (detEl) {
          const first = detEl.firstChild;
          // 如果第一行是“题干：…”，移除
          if (first && first.textContent && first.textContent.trim().startsWith('题干：')) {
            detEl.removeChild(first);
          }
        }
      } else {
        if (headEl) headEl.innerHTML = `<span class=\"tag\">题目</span>[${time}] ${typeName(q.type)}｜题干：${snippet(sanitizeForTitle(q.text),80)}`;
        if (detEl && detEl.parentNode===li) li.removeChild(detEl);
      }
    } catch (_) {}
  };
  logger.addAns = function(ans, q){
    if (!this.list) return;
    const li = document.createElement('div');
    li.className = 'log-item ans';
    const time = new Date().toLocaleTimeString();
    const letters = parseLetters(ans).join('') || ans;
    const meta = extractNoAndStem(q?.text || '');
    const head = document.createElement('div');
    // 与其它日志一致：时间方括号；题号/选项用边框小块明显标识
    const no = (meta.no || '-');
    head.innerHTML = `[${time}] <span class="tagbox" title="题号">${no}</span><span class="tagbox tagbox-ans" title="选项">${letters}</span>`;
    li.appendChild(head);
    this.list.prepend(li);
  };

  function createPanel() {
    const root = document.createElement('div');
    root.id = 'ai-answer-assistant-root';
    Object.assign(root.style, {
      position: 'fixed', zIndex: 100003, top: '80px', right: '20px', width: '340px', color: '#1f2d3d'
    });
    const shadow = root.attachShadow ? root.attachShadow({ mode: 'open' }) : root;
    const style = document.createElement('style');
    style.textContent = `
      :host, .card { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "PingFang SC", "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; }
      .card { background: #fff; border: 1px solid #e6e7ea; border-radius: 10px; box-shadow: 0 1px 3px rgba(16,24,40,.06); overflow: hidden; transform-origin: top right; transition: transform .18s ease, opacity .18s ease; }
      .card.hidden { transform: scale(.98); opacity: 0; pointer-events: none; }
      .header { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#fff; color:#0f172a; cursor:move; border-bottom:1px solid #e6e7ea; }
      .btns { display:flex; gap:6px; }
      button { border:1px solid #e6e7ea; background:#fff; color:#0f172a; padding:6px 10px; border-radius:8px; cursor:pointer; font-size:12px; transition: background .12s ease, transform .08s ease, border-color .12s ease; }
      button:hover { background:#f8fafc; }
      button:active { transform: translateY(1px); }
      button.primary { border-color: transparent; background:#0f172a; color:#fff; }
      button.secondary { border-color:#e6e7ea; color:#3b7a6f; }
      button.danger { border-color:#f2d6d6; color:#b91c1c; }
      button.ghost { background: transparent; color: #475569; border: 1px dashed #e2e8f0; }
      .body { padding:12px; }
      .row { display:flex; gap:6px; align-items:center; margin-bottom:8px; }
      .row label { font-size:12px; color:#374151; }
      .log { height: 220px; overflow:auto; background:#fbfbfc; border:1px solid #e6e7ea; border-radius:6px; padding:8px; }
      .log-item { font-size:12px; color:#111827; margin:3px 0; }
      .log-item .tag{ display:inline-block; padding:0 6px; height:18px; line-height:18px; border-radius:999px; font-size:11px; letter-spacing:.02em; margin-right:6px; }
      .chip{ display:inline-block; padding:0 6px; height:18px; line-height:18px; border-radius:6px; background:#eef2f6; color:#111827; font-weight:700; margin:0 6px 0 2px; }
      .log-item.q .tag{ background:#eef2f6; color:#475569; }
      .log-item.ans .tag{ background:#e9f7ef; color:#166534; }
      .ansbadge{ display:inline-block; padding:0 6px; height:18px; line-height:18px; border-radius:6px; background:#dcfce7; color:#166534; font-weight:700; margin:0 6px; }
      .tagbox{ display:inline-block; padding:0 8px; height:18px; line-height:18px; border:1px solid #e6e7ea; border-radius:6px; background:#fff; color:#0f172a; font-weight:700; margin-left:6px; }
      .tagbox-ans{ border-color:#d1fae5; background:#f7fdfa; color:#065f46; }
      .kv{ display:inline-block; padding:0 6px; height:18px; line-height:18px; border:1px solid #e6e7ea; border-radius:6px; background:#fff; color:#0f172a; margin-right:6px; }
      .kv b{ margin-right:4px; color:#475569; }
      .log-item.info { color:#111827; }
      .log-item.success { color:#065f46; }
      .log-item.warn { color:#92400e; }
      .log-item.error { color:#991b1b; }
      .detail{ margin-top:2px; color:#475569; font-size:12px; padding-left:10px; border-left:2px solid #e2e8f0; }
      .detail .opt{ display:block; line-height:1.5; }
      .detail .opt b{ font-weight:700; margin-right:4px; }
      #log.details-off .detail{ display:none; }
      .status { font-size:12px; color:#374151; }
      .hidden { display:none; }
      .link { color:#3b7a6f; cursor:pointer; text-decoration:underline; }
      .pill { background: #f2f4f7; color: #334155; border-radius: 999px; padding: 2px 8px; font-size: 12px; }
      .card.compact .body{ display:none; }
      .card.compact #clear{ display:none; }
    `;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="header" id="drag">
        <div class="btns">
          <button id="parse" class="primary">极速学习</button>
          <button id="toggle" class="secondary">自动: 关闭</button>
          <button id="clear" class="danger">清空</button>
          <button id="min" class="ghost" title="最小化">—</button>
        </div>
      </div>
      <div class="body">
        <div class="row status">当前页面：
          <span id="site" class="pill">检测中...</span>
        </div>
        <div class="row"><label><input id="autofill" type="checkbox"/> 自动填写（实验）</label></div>
        <div class="row"><label><input id="showDetails" type="checkbox"/> 显示详情</label></div>
        <div class="row"><span class="link" id="openOptions">打开设置</span></div>
        <div class="log" id="log"></div>
      </div>`;

    (shadow || root).append(style, card);
    document.documentElement.appendChild(root);
    logger.el = root; logger.list = (shadow || root).querySelector('#log');

    // drag
    const dragBar = (shadow || root).querySelector('#drag');
    let startX=0, startY=0, ox=0, oy=0, dragging=false;
    const onMove = (e) => {
      if (!dragging) return; e.preventDefault();
      const dx = (e.clientX - startX); const dy = (e.clientY - startY);
      root.style.left = (ox + dx) + 'px'; root.style.top = (oy + dy) + 'px'; root.style.right = 'auto';
    };
    dragBar.addEventListener('mousedown', (e)=>{ dragging=true; startX=e.clientX; startY=e.clientY; const rect=root.getBoundingClientRect(); ox=rect.left; oy=rect.top; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', ()=>{ dragging=false; document.removeEventListener('mousemove', onMove); }, { once:true }); });

    // buttons
    const btnParse = (shadow || root).querySelector('#parse');
    const btnToggle = (shadow || root).querySelector('#toggle');
    const btnClear = (shadow || root).querySelector('#clear');
    const btnMin = (shadow || root).querySelector('#min');
    const elSite = (shadow || root).querySelector('#site');
    const elAutofill = (shadow || root).querySelector('#autofill');
    const elShowDetails = (shadow || root).querySelector('#showDetails');
    const openOptions = (shadow || root).querySelector('#openOptions');
    btnParse.addEventListener('click', async () => {
      await parseNow(true);
      await sleep(1000);
      await solveNow(true);
    });
    btnToggle.addEventListener('click', () => setAuto(!state.auto));
    btnClear.addEventListener('click', () => logger.clear());
    openOptions.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
      else chrome.runtime.sendMessage({ type: 'openOptions' });
    });
    btnMin.addEventListener('click', () => {
      state.minimized = !state.minimized;
      card.classList.toggle('compact', state.minimized);
      btnMin.textContent = state.minimized ? '+' : '—';
      btnMin.title = state.minimized ? '展开' : '最小化';
    });

    // site label
    elSite.textContent = detectSite().name || '未知';
    
    // 自动填写开关监听器
    if (elAutofill) {
      elAutofill.addEventListener('change', () => {
        const on = !!elAutofill.checked;
        try { chrome.storage.local.set({ auto_fill: on }); } catch(_) {}
      });
    }
    
    // details toggle listener
    const logEl = (shadow || root).querySelector('#log');
    if (elShowDetails) {
      elShowDetails.addEventListener('change', () => {
        const on = !!elShowDetails.checked;
        try { chrome.storage.local.set({ log_details: on }); } catch(_) {}
        logEl.classList.toggle('details-off', !on);
      });
    }

    // receive toggle command
    chrome.runtime.onMessage.addListener((msg)=>{
      if (msg && msg.type === 'toggle_panel') {
        state.visible = !state.visible;
        if (!state.visible) { card.classList.add('hidden'); }
        else { card.classList.remove('hidden'); }
      }
    });
  }

  function setAuto(v) {
    state.auto = v;
    const shadow = getRootShadow();
    const btn = shadow?.querySelector('#toggle');
    if (btn) btn.textContent = `自动: ${v? '开启':'关闭'}`;
    logger.add(`自动答题 ${v? '开启':'关闭'}`);
    try { chrome.storage.local.set({ auto_start: !!v }); } catch(_) {}
    if (v && !state.timer) {
      state.timer = setInterval(async ()=>{
        if (state.scanning) return;
        await parseNow(false);
        await sleep(1000);
        await solveNow(false);
      }, S.scanIntervalSec * 1000);
    } else if (!v && state.timer) {
      clearInterval(state.timer); state.timer = null;
    }
  }

  // Site detectors and question extraction
  function detectSite() {
    const href = location.href;
    if (/(\.chaoxing\.com\/|\.chaoxin\.com\/)/.test(href)) return { key: 'cx', name: '超星学习通' };
    if (/\.zhihuishu\.com\//.test(href)) return { key: 'zhs', name: '智慧树/知到' };
    return { key: 'unknown', name: '未知' };
  }

  function extractQuestionsCx() {
    const res = [];
    const blocks = $all('.questionLi');
    if (blocks.length) {
      for (const el of blocks) res.push(parseQuestionBlock(el));
    } else {
      // fallback heuristics
      $all('div[class*="TiMu"], div[class*="question"], li[class*="question"]').forEach(el=>res.push(parseQuestionBlock(el)));
    }
    return res.filter(Boolean);
  }

  function extractQuestionsZhs() {
    const res = [];
    $all('[class*="exam"][class*="question"], .questionBox, .questionItem').forEach(el=>{
      res.push(parseQuestionBlock(el));
    });
    return res.filter(Boolean);
  }

  function parseQuestionBlock(root) {
    try {
      const qtext = guessQuestionText(root);
      const inputs = $all('input[type="radio"], input[type="checkbox"], textarea, input[type="text"]', root);
      if (!qtext && inputs.length===0) return null;
      const type = guessType(root, inputs, qtext);
      const choices = collectChoices(root);
      return { root, type, text: qtext, choices };
    } catch { return null; }
  }

  function guessQuestionText(root) {
    const candidates = [
      '.stem', '.Zy_TItle', '.subject', '.title', '.examTiMu', '.ques-title', '[class*="title"]', '[class*="Stem"]'
    ];
    for (const sel of candidates) {
      const n = $(sel, root);
      if (n && cleanText(n.textContent)) return cleanText(n.textContent);
    }
    // fallback: first text node of root
    return cleanText(root.textContent).slice(0, 300);
  }

  function detectTypeByText(text) {
    const t = (text||'').replace(/\s+/g,'');
    if (/多选题|多选/.test(t)) return 'multiple';
    if (/单选题|单选/.test(t)) return 'single';
    if (/判断题|判断/.test(t)) return 'truefalse';
    if (/填空题|填空|_{2,}|（\s*）|\(\s*\)/.test(t)) return 'fill';
    if (/A[\.、]\s*.+B[\.、]\s*.+/.test(text||'')) return 'single';
    return 'unknown';
  }

  function guessType(root, inputs, qtext) {
    if (inputs.some(i=> i.type==='checkbox')) return 'multiple';
    if (inputs.some(i=> i.type==='radio')) {
      const labels = getOptionLabels(root);
      const joined = labels.join('');
      if (/对|错|正确|错误|√|×/.test(joined)) return 'truefalse';
      return 'single';
    }
    if (inputs.some(i=> i.tagName==='TEXTAREA' || i.type==='text')) return 'fill';
    return detectTypeByText(qtext);
  }

  function getOptionLabels(root) {
    const opts = [];
    $all('input[type="radio"], input[type="checkbox"]', root).forEach(inp=>{
      let label='';
      const lab = inp.closest('label') || inp.parentElement;
      if (lab) label = stripAnswerTrails(cleanText(lab.textContent.replace(/^\s*[A-Ha-h][\.、]\s*/, '')));
      else label = inp.getAttribute('value') || '';
      if (label) opts.push(label);
    });
    return opts;
  }

  function collectChoices(root) {
    const labels = getOptionLabels(root);
    return labels.map((t, i)=> ({ key: String.fromCharCode(65+i), text: t }));
  }

  async function parseNow(manual=false) {
    if (state.scanning) return;
    state.scanning = true;
    try {
      const site = detectSite();
      let list = site.key==='cx' ? extractQuestionsCx() : site.key==='zhs' ? extractQuestionsZhs() : [];
      // de-dup + skip already answered, and not already parsed
      list = list.filter(q => {
        const key = qKey(q);
        return !processed.has(key) && !processing.has(key) && !parsedSet.has(key) && !isAnswered(q);
      });
      if (!list.length) {
        const now = Date.now();
        if (now - lastNoQuestionLogAt > 8000) {
          logger.add('无新题目可解析', 'info');
          lastNoQuestionLogAt = now;
        }
        return;
      }
      logger.add(`解析到 ${list.length} 道新题`);
      for (const q of list) {
        const key = qKey(q);
        parsedSet.add(key);
        parsedQueue.push(q);
        logger.addQ(q);
      }
    } catch (e) {
      logger.add('解析失败：' + (e && e.message || e), 'error');
    } finally {
      state.scanning = false;
    }
  }

  async function solveNow(manual=false) {
    if (state.scanning) return;
    if (!parsedQueue.length) { 
      if (manual) logger.add('暂无题目需要答题', 'info'); 
      return; 
    }
    state.scanning = true;
    try {
      logger.add(`准备答题：共 ${parsedQueue.length} 道`);
      const queue = parsedQueue.slice();
      parsedQueue = [];
      for (const q of queue) {
        const key = qKey(q);
        if (processed.has(key) || processing.has(key) || isAnswered(q)) continue;
        processing.add(key);
        try {
          await answerQuestion(q);
          processed.add(key);
        } catch (e) {
          // 失败则保留到下次
          parsedQueue.push(q);
        } finally {
          processing.delete(key);
        }
      }
    } catch (e) {
      logger.add('答题失败：' + (e && e.message || e), 'error');
    } finally {
      state.scanning = false;
    }
  }

  function isAnswered(q) {
    const root = q.root;
    if (!root) return true;
    const radios = $all('input[type="radio"]', root);
    const checks = $all('input[type="checkbox"]', root);
    if (radios.length || checks.length) {
      // 通用: 有选中的表单元素
      if ($all('input[type="radio"]:checked, input[type="checkbox"]:checked', root).length > 0) return true;
      // 适配: 自定义样式的“已选中”类名
      const selectedLike = ['is-checked','checked','active','selected','on'];
      if ($all(selectedLike.map(cls=>'.'+cls).join(','), root).length > 0) return true;
      return false;
    }
    const texts = $all('textarea, input[type="text"]', root);
    return texts.some(el => cleanText(el.value).length > 0);
  }

  async function answerQuestion(q) {
    try {
      const conf = await getConfig();
      if (!conf.ai_api_key) { logger.add('未配置 API Key，已跳过', 'warn'); return; }
      const prompt = buildPrompt(q);
      const ai = await askAI(conf, prompt);
      logger.addAns(ai, q);
      const filled = maybeFill(q, ai);
      if (filled) logger.add('已尝试填写');
    } catch (e) {
      logger.add('答题失败：' + (e && e.message || e), 'error');
    }
  }

  function buildPrompt(q) {
    let typeCN = { single:'单选题', multiple:'多选题', truefalse:'判断题', fill:'填空/简答' }[q.type] || '其他';
    const meta = extractNoAndStem(q.text || '');
    const title = meta.stem || sanitizeForTitle(q.text || '');
    // 优先使用解析后的选项数据
    const choicesList = q.parsedChoices || q.choices || [];
    const choices = choicesList.map(c => `${c.key}. ${stripAnswerTrails(c.text)}`).join('\n');
    // 只返回题目内容，系统提示词由 background.js 的 ai_system_prompt 配置处理
    return `题型：${typeCN}\n题目：${title}\n${choices?('选项：\n'+choices):''}`;
  }

  function parseLetters(ans) {
    const m = (ans || '').toUpperCase().match(/[A-H]/g);
    return m ? Array.from(new Set(m)) : [];
  }

  function maybeFill(q, ans) {
    const root = q.root; if (!root) return false;
    const shadow = getRootShadow();
    const auto = shadow?.querySelector('#autofill');
    if (!auto || !auto.checked) return false;
    if (q.type === 'single' || q.type === 'multiple' || q.type==='truefalse') {
      const letters = parseLetters(ans);
      const inputs = $all('input[type="radio"], input[type="checkbox"]', root);
      if (!inputs.length) return false;
      // 优先使用解析后的选项数据
      const choicesList = q.parsedChoices || q.choices || [];
      if (!letters.length && choicesList.length) {
        // fallback: try match by text
        const lower = (ans||'').toLowerCase();
        choicesList.forEach((c, idx)=>{
          if (lower.includes(c.text.toLowerCase())) letters.push(String.fromCharCode(65+idx));
        });
      }
      inputs.forEach((inp, idx)=>{
        const key = String.fromCharCode(65+idx);
        const should = letters.includes(key) || (q.type==='truefalse' && ((/正确|对|√/).test(ans) ? idx===0 : (/错误|错|×/).test(ans) ? idx===1 : false));
        if (should) { inp.click(); }
        else if (q.type==='single') { /* skip */ }
      });
      return true;
    }
    if (q.type === 'fill') {
      const parts = (ans||'').split(/[，,、;；\s]+/).filter(Boolean);
      const inputs = $all('textarea, input[type="text"]', root);
      inputs.forEach((el, i)=>{ el.value = parts[i] || parts[0] || ans || ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
      return true;
    }
    return false;
  }

  async function getConfig() {
    return new Promise((resolve)=>{
      chrome.storage.local.get({
        ai_api_url: 'https://api.moonshot.cn/v1/chat/completions',
        ai_api_key: '',
        ai_model: 'kimi-k2-turbo-preview',
        ai_temperature: 0.3,
        ai_system_prompt: ''
      }, resolve);
    });
  }

  function askAI(conf, prompt) {
    return new Promise((resolve, reject)=>{
      chrome.runtime.sendMessage({ type:'ai_answer', payload: { prompt } }, (resp)=>{
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!resp || resp.error) return reject(new Error(resp && resp.error || '请求失败'));
        resolve(resp.answer);
      });
    });
  }

  async function testAPI() {
    try {
      logger.add('正在测试 API 连接...', 'info');
      const conf = await getConfig();
      if (!conf.ai_api_key) {
        logger.add('未配置 API Key，请先在设置中配置', 'error');
        return false;
      }
      const testPrompt = '请回答：1+1等于几？只返回数字。';
      const answer = await askAI(conf, testPrompt);
      if (answer) {
        logger.add('API 测试成功 ✓', 'success');
        return true;
      }
      logger.add('API 测试失败', 'error');
      return false;
    } catch (e) {
      logger.add('API 测试失败：' + (e && e.message || e), 'error');
      return false;
    }
  }

  // Init
  createPanel();
  
  // 先进行 API 测试
  (async () => {
    await testAPI();
    
    chrome.storage.local.get({ 
      answer_interval: 3, 
      auto_start: false,     // 默认：自动答题关闭
      compact_mode: false, 
      log_details: true,     // 默认：详细信息开启
      auto_fill: false       // 默认：自动填写关闭
    }, (vals)=>{
      S.scanIntervalSec = Math.max(1, parseInt(vals.answer_interval||3,10));
      setAuto(!!vals.auto_start);
      try {
        const shadow = getRootShadow();
        const card = shadow?.querySelector('.card');
        if (card) card.classList.toggle('compact', !!vals.compact_mode);
        const logEl = shadow?.querySelector('#log');
        const elShowDetails = shadow?.querySelector('#showDetails');
        const elAutofill = shadow?.querySelector('#autofill');
        // 恢复详细信息开关状态
        if (logEl) logEl.classList.toggle('details-off', !vals.log_details);
        if (elShowDetails) elShowDetails.checked = !!vals.log_details;
        // 恢复自动填写开关状态
        if (elAutofill) elAutofill.checked = !!vals.auto_fill;
      } catch(_){}
    });
    logger.add('一切就绪，准备开始学习！');
  })();
})();
