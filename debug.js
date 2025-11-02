// Debug backend script for API logging

let logs = [];
let stats = {
  total: 0,
  success: 0,
  error: 0,
  times: []
};
let currentFilter = 'all';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadLogs();
  setupEventListeners();
  startLogPolling();
});

function setupEventListeners() {
  // Clear button
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm('确定要清空所有日志吗？')) {
      clearLogs();
    }
  });

  // Export button
  document.getElementById('exportBtn').addEventListener('click', exportLogs);

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderLogs();
    });
  });
}

function loadLogs() {
  chrome.storage.local.get(['apiDebugLogs'], (result) => {
    logs = result.apiDebugLogs || [];
    calculateStats();
    renderLogs();
  });
}

function startLogPolling() {
  // Poll for new logs every second
  setInterval(loadLogs, 1000);
}

function calculateStats() {
  stats.total = logs.length;
  stats.success = logs.filter(log => log.status === 'success').length;
  stats.error = logs.filter(log => log.status === 'error').length;
  
  const times = logs.filter(log => log.duration).map(log => log.duration);
  stats.times = times;
  
  updateStatsDisplay();
}

function updateStatsDisplay() {
  document.getElementById('totalRequests').textContent = stats.total;
  document.getElementById('successRequests').textContent = stats.success;
  document.getElementById('errorRequests').textContent = stats.error;
  
  if (stats.times.length > 0) {
    const avg = stats.times.reduce((a, b) => a + b, 0) / stats.times.length;
    document.getElementById('avgTime').textContent = Math.round(avg) + 'ms';
  } else {
    document.getElementById('avgTime').textContent = '0ms';
  }
}

function renderLogs() {
  const container = document.getElementById('logContainer');
  
  // Filter logs
  let filteredLogs = logs;
  if (currentFilter !== 'all') {
    filteredLogs = logs.filter(log => log.status === currentFilter);
  }
  
  if (filteredLogs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📡</div>
        <div class="empty-state-text">${currentFilter === 'all' ? '等待 API 调用...' : '没有 ' + currentFilter + ' 的日志'}</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filteredLogs.reverse().map(log => createLogEntry(log)).join('');
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
    <div class="log-entry">
      <div class="log-header">
        <span class="log-timestamp">[${timestamp}] ${duration}</span>
        <span class="log-status ${statusClass}">${statusText}</span>
      </div>
      
      ${log.url ? `
        <div class="log-section">
          <div class="log-section-title">请求地址</div>
          <div class="log-content log-url">${escapeHtml(log.url)}</div>
        </div>
      ` : ''}
      
      ${log.model ? `
        <div class="log-section">
          <div class="log-section-title">模型</div>
          <div class="log-content log-model">${escapeHtml(log.model)}</div>
        </div>
      ` : ''}
      
      ${log.requestBody ? `
        <div class="log-section">
          <div class="log-section-title">请求数据</div>
          <div class="log-content json">${formatJson(log.requestBody)}</div>
        </div>
      ` : ''}
      
      ${log.response ? `
        <div class="log-section">
          <div class="log-section-title">响应数据</div>
          <div class="log-content json">${formatJson(log.response)}</div>
        </div>
      ` : ''}
      
      ${log.error ? `
        <div class="log-section">
          <div class="log-section-title">错误信息</div>
          <div class="log-content" style="color: #ff4444;">${escapeHtml(log.error)}</div>
        </div>
      ` : ''}
      
      ${log.answer ? `
        <div class="log-section">
          <div class="log-section-title">解析答案</div>
          <div class="log-content" style="color: #00ff41;">${escapeHtml(log.answer)}</div>
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

function clearLogs() {
  logs = [];
  chrome.storage.local.set({ apiDebugLogs: [] }, () => {
    calculateStats();
    renderLogs();
  });
}

function exportLogs() {
  const dataStr = JSON.stringify(logs, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `api-debug-logs-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
