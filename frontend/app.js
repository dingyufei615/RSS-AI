let API_BASE = location.origin;
if (API_BASE.startsWith('file:')) {
  API_BASE = 'http://127.0.0.1:3602';
}

const q = (sel) => document.querySelector(sel);
const qa = (sel) => Array.from(document.querySelectorAll(sel));

let state = {
  page: 0,
  pageSize: 10,
  total: 0,
  items: [],
  settings: null,
  feeds: [],
  filterKeywords: [],
  filterFeed: '',
  autoRefresh: false,
  autoTimer: null,
  searchTerm: '',
  reports: [],
  reportPage: 0,
  reportPageSize: 10,
  reportTotal: 0,
  reportTypeFilter: 'hourly',
  reportGenerating: { hourly: false, daily: false },
  telegramPushMode: 'all',
  telegramPushSummary: true,
  wecomPushMode: 'all',
  wecomPushSummary: true,
};

function updateThemeToggle(theme) {
  const btn = q('#themeToggle');
  if (!btn) return;
  if (theme === 'light') {
    btn.textContent = '🌙 夜间';
    btn.setAttribute('aria-label', '切换到夜间模式');
    btn.setAttribute('title', '切换到夜间模式');
  } else {
    btn.textContent = '🌞 白天';
    btn.setAttribute('aria-label', '切换到白天模式');
    btn.setAttribute('title', '切换到白天模式');
  }
}

function applyTheme(theme, persist = true) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = nextTheme;
  document.documentElement.dataset.theme = nextTheme;
  if (persist) {
    localStorage.setItem('theme', nextTheme);
  }
  updateThemeToggle(nextTheme);
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  let current = saved === 'light' || saved === 'dark' ? saved : null;
  if (!current) {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    current = prefersLight ? 'light' : 'dark';
  }
  applyTheme(current, !saved);
}

function updateReportFilterUI(filter) {
  qa('[data-report-filter]').forEach(btn => {
    const isActive = btn.dataset.reportFilter === filter;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

function updateTelegramPushModeUI(mode) {
  const validModes = ['all', 'article_only', 'report_only'];
  const nextMode = validModes.includes(mode) ? mode : 'all';
  state.telegramPushMode = nextMode;
  const hidden = q('#tgPushMode');
  if (hidden) hidden.value = nextMode;
  qa('[data-push-mode]').forEach(btn => {
    const isActive = btn.dataset.pushMode === nextMode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function updateWeComPushModeUI(mode) {
  const validModes = ['all', 'article_only', 'report_only'];
  const nextMode = validModes.includes(mode) ? mode : 'all';
  state.wecomPushMode = nextMode;
  const hidden = q('#wecomPushMode');
  if (hidden) hidden.value = nextMode;
  qa('[data-wecom-push-mode]').forEach(btn => {
    const isActive = btn.dataset.wecomPushMode === nextMode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function toast(msg) {
  const t = q('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1600);
}

async function api(path, opts = {}) {
  const url = API_BASE + path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const data = text ? JSON.parse(text) : {};
      msg = data.detail || data.message || msg;
    } catch {}
    throw new Error(msg || '请求失败');
  }
  if (res.status === 204) {
    return null;
  }
  return res.json();
}


async function pushArticle(articleId, platforms) {
  try {
    const response = await api(`/api/articles/${articleId}/push`, {
      method: 'POST',
      body: JSON.stringify({ platforms })
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function pushReport(reportId, platforms) {
  try {
    const response = await api(`/api/reports/${reportId}/push`, {
      method: 'POST',
      body: JSON.stringify({ platforms })
    });
    return response;
  } catch (error) {
    throw error;
  }
}

async function loadArticles() {
  showSkeleton(true);
  try {
    const offset = state.page * state.pageSize;
    const feedParam = state.filterFeed ? `&feed=${encodeURIComponent(state.filterFeed)}` : '';
    const queryParam = state.searchTerm ? `&q=${encodeURIComponent(state.searchTerm)}` : '';
    const data = await api(`/api/articles?limit=${state.pageSize}&offset=${offset}${feedParam}${queryParam}`);
    state.items = data.items || [];
    state.total = data.total || 0;
    renderArticles();
  } finally {
    showSkeleton(false);
  }
}

function renderArticles() {
  const root = q('#articles');
  root.innerHTML = '';
  state.items.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'card enter';
    el.style.animationDelay = `${Math.min(idx * 30, 300)}ms`;
    const keywordList = Array.isArray(item.matched_keywords) ? item.matched_keywords : [];
    const metaParts = [];
    if (item.pub_date) metaParts.push(escapeHtml(item.pub_date));
    if (item.author) metaParts.push(escapeHtml(item.author));
    if (keywordList.length) {
      metaParts.push(`关键词：${escapeHtml(keywordList.join('、'))}`);
    }
    const metaHtml = metaParts.join(' · ');
    el.innerHTML = `
      <h3 class="title clickable" data-id="${item.id}">${escapeHtml(item.title)}</h3>
      <div class="meta">${metaHtml}</div>
      <div class="summary">${escapeHtml(item.summary_text)}</div>
      <div class="actions-row">
        <a class="link" target="_blank" rel="noopener" href="${item.link}">原文链接</a>
        <button class="ghost" data-copy="${item.link}">复制链接</button>
        <button class="ghost" data-push="${item.id}">手动推送</button>
      </div>
    `;
    root.appendChild(el);
  });
  const pages = Math.ceil(state.total / state.pageSize) || 1;
  q('#pageInfo').textContent = `${state.page + 1} / ${pages}`;

  // 绑定复制与详情
  qa('[data-copy]').forEach(b => b.addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('已复制链接'); } catch {}
  }));
  qa('.title.clickable').forEach(t => t.addEventListener('click', () => openModal(parseInt(t.dataset.id,10))));

  // 绑定推送按钮
  qa('[data-push]').forEach(b => b.addEventListener('click', async (e) => {
    const articleId = parseInt(b.dataset.push, 10);
    if (isNaN(articleId)) return;

    // 显示推送选项模态框
    showPushModal(articleId);
  }));
}

function escapeHtml(s) {
  return (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function formatDateTime(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

async function manualFetch() {
  q('#statusText').textContent = '抓取中…';
  try {
    const force = q('#forceFetch').checked;
    await api('/api/fetch', { method: 'POST', body: JSON.stringify({ force }) });
    await loadArticles();
    toast('抓取完成');
  } catch (e) {
    console.error(e);
    toast('抓取失败');
  } finally {
    q('#statusText').textContent = '';
  }
}

function formatWeComFeedWebhooks(feedWebhooks) {
  if (!feedWebhooks || typeof feedWebhooks !== 'object') {
    return '';
  }
  return Object.entries(feedWebhooks)
    .filter(([feed, key]) => String(feed || '').trim() && String(key || '').trim())
    .map(([feed, key]) => `${feed}|${key}`)
    .join('\n');
}

function parseWeComFeedWebhooks(text) {
  const result = {};
  const invalidLines = [];
  const lines = String(text || '').split('\n');
  lines.forEach((line, index) => {
    const raw = line.trim();
    if (!raw) return;
    // 兼容中文输入法下的全角竖线“｜”
    const normalized = raw.replace(/｜/g, '|');
    const sep = normalized.indexOf('|');
    if (sep <= 0 || sep >= normalized.length - 1) {
      invalidLines.push(index + 1);
      return;
    }
    const feed = normalized.slice(0, sep).trim();
    const webhookKey = normalized.slice(sep + 1).trim();
    if (!feed || !webhookKey) {
      invalidLines.push(index + 1);
      return;
    }
    result[feed] = webhookKey;
  });
  return { result, invalidLines };
}

async function clearArticlesByFeed() {
  const feed = (state.filterFeed || '').trim();
  if (!feed) {
    toast('请先在下拉框选择一个源');
    return;
  }
  const confirmed = window.confirm(`确定清空当前源的文章吗？\n\n${feed}`);
  if (!confirmed) {
    return;
  }
  q('#statusText').textContent = '清理中…';
  try {
    const data = await api(`/api/articles?feed=${encodeURIComponent(feed)}`, { method: 'DELETE' });
    state.page = 0;
    await loadArticles();
    toast(`已删除 ${data?.deleted ?? 0} 条`);
  } catch (err) {
    console.error(err);
    toast(err.message || '清理失败');
  } finally {
    q('#statusText').textContent = '';
  }
}

async function clearAllArticles() {
  const confirmed = window.confirm('确定清空全部文章吗？该操作不可恢复。');
  if (!confirmed) {
    return;
  }
  q('#statusText').textContent = '清理中…';
  try {
    const data = await api('/api/articles', { method: 'DELETE' });
    state.page = 0;
    await loadArticles();
    toast(`已删除 ${data?.deleted ?? 0} 条`);
  } catch (err) {
    console.error(err);
    toast(err.message || '清理失败');
  } finally {
    q('#statusText').textContent = '';
  }
}

async function loadSettings() {
  const s = await api('/api/settings');
  state.settings = s;
  state.feeds = s.fetch.feeds || [];
  state.filterKeywords = s.fetch.filter_keywords || [];
  q('#interval').value = s.fetch.interval_minutes;
  q('#maxItems').value = s.fetch.max_items;
  q('#perFeedLimit').value = s.fetch.per_feed_limit ?? 20;
  q('#feeds').value = (s.fetch.feeds || []).join('\n');
  q('#filterKeywords').value = state.filterKeywords.join('\n');
  q('#useArticlePage').checked = !!s.fetch.use_article_page;
  q('#articleTimeout').value = s.fetch.article_timeout_seconds ?? 15;
  q('#doNotDisturb').value = s.fetch.do_not_disturb || '';

  q('#aiEnabled').checked = !!s.ai.enabled;
  q('#aiBaseUrl').value = s.ai.base_url || '';
  q('#aiApiKey').value = ''; // 安全：不回显
  q('#aiModel').value = s.ai.model || '';
  q('#aiTemp').value = s.ai.temperature ?? 0.2;
  q('#aiTimeout').value = s.ai.timeout_seconds ?? 30;
  q('#aiSystemPrompt').value = s.ai.system_prompt || '';
  q('#aiUserPrompt').value = s.ai.user_prompt_template || '';

  q('#tgEnabled').checked = !!s.telegram.enabled;
  q('#tgToken').value = ''; // 安全：不回显
  q('#tgChatId').value = s.telegram.chat_id || '';
  updateTelegramPushModeUI(s.telegram.push_mode || 'all');
  state.telegramPushSummary = s.telegram.push_summary !== false;
  const tgPushSummary = q('#tgPushSummary');
  if (tgPushSummary) tgPushSummary.checked = state.telegramPushSummary;
  state.telegramFetchSummary = s.telegram.fetch_summary_enabled !== false;
  const tgFetchSummary = q('#tgFetchSummary');
  if (tgFetchSummary) tgFetchSummary.checked = state.telegramFetchSummary;

  // 企业微信配置
  q('#wecomEnabled').checked = !!s.wecom?.enabled;
  q('#wecomWebhookKey').value = ''; // 安全：不回显
  q('#wecomFeedWebhooks').value = formatWeComFeedWebhooks(s.wecom?.feed_webhooks || {});
  updateWeComPushModeUI(s.wecom?.push_mode || 'all');
  state.wecomPushSummary = s.wecom?.push_summary !== false;
  const wecomPushSummary = q('#wecomPushSummary');
  if (wecomPushSummary) wecomPushSummary.checked = state.wecomPushSummary;
  state.wecomFetchSummary = s.wecom?.fetch_summary_enabled !== false;
  const wecomFetchSummary = q('#wecomFetchSummary');
  if (wecomFetchSummary) wecomFetchSummary.checked = state.wecomFetchSummary;

  q('#reportHourly').checked = !!(s.reports?.hourly_enabled);
  q('#reportDaily').checked = !!(s.reports?.daily_enabled);
  q('#dailyReportTime').value = s.reports?.daily_report_time || '00:00';
  q('#reportTimeout').value = s.reports?.report_timeout_seconds ?? 60;
  q('#reportSystemPrompt').value = s.reports?.system_prompt || '';
  q('#reportUserPrompt').value = s.reports?.user_prompt_template || '';

  // 渲染筛选源
  const sel = q('#feedSelect');
  sel.innerHTML = '<option value="">全部源</option>' + state.feeds.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
  sel.value = state.filterFeed;

  const currentPassword = q('#currentPassword');
  const newPassword = q('#newPassword');
  if (currentPassword) currentPassword.value = '';
  if (newPassword) newPassword.value = '';
}

function gatherSettingsFromForm() {
  const current = state.settings;
  const feeds = q('#feeds').value.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const filterKeywords = q('#filterKeywords').value.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const wecomFeedWebhooksParsed = parseWeComFeedWebhooks(q('#wecomFeedWebhooks')?.value || '');
  if (wecomFeedWebhooksParsed.invalidLines.length) {
    throw new Error(`企业微信按源机器人格式错误，行号：${wecomFeedWebhooksParsed.invalidLines.join(', ')}（格式：feed_url|webhook_key）`);
  }
  let reportTimeout = parseInt(q('#reportTimeout').value, 10);
  if (!Number.isFinite(reportTimeout)) {
    reportTimeout = 60;
  } else {
    reportTimeout = Math.min(Math.max(reportTimeout, 10), 300);
  }
  let aiTimeout = parseInt(q('#aiTimeout').value, 10);
  if (!Number.isFinite(aiTimeout)) {
    aiTimeout = 30;
  } else {
    aiTimeout = Math.min(Math.max(aiTimeout, 5), 300);
  }
  return {
    server: current.server,
    fetch: {
      interval_minutes: parseInt(q('#interval').value, 10),
      max_items: parseInt(q('#maxItems').value, 10),
      per_feed_limit: parseInt(q('#perFeedLimit').value, 10),
      feeds,
      filter_keywords: filterKeywords,
      use_article_page: q('#useArticlePage').checked,
      article_timeout_seconds: parseInt(q('#articleTimeout').value, 10),
      do_not_disturb: q('#doNotDisturb').value.trim() || null,
    },
    ai: {
      enabled: q('#aiEnabled').checked,
      base_url: q('#aiBaseUrl').value.trim(),
      api_key: q('#aiApiKey').value.trim() || '***',
      model: q('#aiModel').value.trim(),
      temperature: parseFloat(q('#aiTemp').value),
      timeout_seconds: aiTimeout,
      system_prompt: q('#aiSystemPrompt').value,
      user_prompt_template: q('#aiUserPrompt').value,
    },
    telegram: {
      enabled: q('#tgEnabled').checked,
      bot_token: q('#tgToken').value.trim() || '***',
      chat_id: q('#tgChatId').value.trim(),
      push_mode: q('#tgPushMode')?.value || 'all',
      push_summary: q('#tgPushSummary')?.checked ?? true,
      fetch_summary_enabled: q('#tgFetchSummary')?.checked ?? true,
    },
    wecom: {
      enabled: q('#wecomEnabled').checked,
      webhook_key: q('#wecomWebhookKey').value.trim() || '***',
      feed_webhooks: wecomFeedWebhooksParsed.result,
      push_mode: q('#wecomPushMode')?.value || 'all',
      push_summary: q('#wecomPushSummary')?.checked ?? true,
      fetch_summary_enabled: q('#wecomFetchSummary')?.checked ?? true,
    },
    reports: {
      hourly_enabled: q('#reportHourly').checked,
      daily_enabled: q('#reportDaily').checked,
      daily_report_time: q('#dailyReportTime').value,
      report_timeout_seconds: reportTimeout,
      system_prompt: q('#reportSystemPrompt').value,
      user_prompt_template: q('#reportUserPrompt').value,
    },
    logging: current.logging,
  };
}

async function saveSettings(e) {
  e.preventDefault();
  const passwordInput = q('#currentPassword');
  const newPasswordInput = q('#newPassword');
  const password = passwordInput ? passwordInput.value.trim() : '';
  const newPassword = newPasswordInput ? newPasswordInput.value.trim() : '';
  const pinRule = /^\d{4}$/;
  if (!pinRule.test(password)) {
    toast('请输入4位数当前密码');
    if (passwordInput) passwordInput.focus();
    return;
  }
  if (newPassword && !pinRule.test(newPassword)) {
    toast('新密码需为4位数字');
    if (newPasswordInput) newPasswordInput.focus();
    return;
  }
  try {
    const body = gatherSettingsFromForm();
    const payload = { settings: body, password };
    if (newPassword) {
      payload.new_password = newPassword;
    }
    await api('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
    await loadSettings();
    toast('设置已保存');
    if (passwordInput) passwordInput.value = '';
    if (newPasswordInput) newPasswordInput.value = '';
  } catch (err) {
    console.error(err);
    toast(err.message || '保存失败');
  }
}

function setAutoRefresh(enabled) {
  state.autoRefresh = enabled;
  localStorage.setItem('autoRefresh', enabled ? '1' : '0');
  if (state.autoTimer) { clearInterval(state.autoTimer); state.autoTimer = null; }
  if (enabled) {
    state.autoTimer = setInterval(() => { loadArticles().catch(()=>{}); }, 60000);
  }
}

function debounce(fn, delay=300) {
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), delay); };
}

function showSkeleton(show) {
  const root = q('#articles');
  if (show) {
    root.innerHTML = Array.from({length: state.pageSize}).map(()=>`
      <div class="card skeleton">
        <div class="srect title"></div>
        <div class="srect sm"></div>
        <div class="srect"></div>
        <div class="srect"></div>
        <div class="srect half"></div>
      </div>
    `).join('');
  }
}

async function loadReports() {
  const offset = state.reportPage * state.reportPageSize;
  const typeParam = state.reportTypeFilter ? `&report_type=${encodeURIComponent(state.reportTypeFilter)}` : '';
  const data = await api(`/api/reports?limit=${state.reportPageSize}&offset=${offset}${typeParam}`);
  state.reports = data.items || [];
  state.reportTotal = data.total || 0;
  renderReports();
}

async function triggerReport(reportType) {
  const btn = reportType === 'daily' ? q('#generateDailyReport') : q('#generateHourlyReport');
  if (!btn) return;
  if (state.reportGenerating[reportType]) return;
  state.reportGenerating[reportType] = true;
  const originalText = btn.textContent;
  btn.textContent = '生成中…';
  btn.disabled = true;
  try {
    await api('/api/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ report_type: reportType }),
    });
    toast(reportType === 'daily' ? '日报已生成' : '小时报已生成');
    state.reportPage = 0;
    await loadReports();
  } catch (err) {
    console.error(err);
    toast('生成失败');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
    state.reportGenerating[reportType] = false;
  }
}

async function handleDeleteReport(reportId) {
  if (!Number.isInteger(reportId)) return;
  const confirmed = window.confirm('确定删除该报告吗？');
  if (!confirmed) {
    return;
  }
  try {
    await api(`/api/reports/${reportId}`, { method: 'DELETE' });
    toast('报告已删除');
    state.reportTotal = Math.max(0, state.reportTotal - 1);
    const maxPage = Math.max(0, Math.ceil(state.reportTotal / state.reportPageSize) - 1);
    if (state.reportPage > maxPage) {
      state.reportPage = maxPage;
    }
    await loadReports();
  } catch (err) {
    console.error(err);
    toast(err.message || '删除失败');
  }
}

function renderReports() {
  const root = q('#reportsList');
  if (!root) return;
  root.innerHTML = '';
  if (!state.reports.length) {
    root.innerHTML = '<div class="empty">暂无定时汇总报告</div>';
    q('#reportPageInfo').textContent = '0 / 0';
    return;
  }
  state.reports.forEach((report, idx) => {
    const el = document.createElement('div');
    el.className = 'card enter';
    el.style.animationDelay = `${Math.min(idx * 30, 300)}ms`;
    const typeLabel = report.report_type === 'daily' ? '日报' : '小时报';
    const start = formatDateTime(report.timeframe_start);
    const end = formatDateTime(report.timeframe_end);
    el.innerHTML = `
      <h3 class="title">${escapeHtml(report.title)}</h3>
      <div class="meta">类型：${typeLabel} · 时间范围：${escapeHtml(start)} ~ ${escapeHtml(end)} · 文章：${report.article_count}</div>
      <div class="summary">${escapeHtml(report.summary_text).replace(/\n/g,'<br/>')}</div>
      <div class="actions-row report-actions">
        <button class="ghost" data-report-push="${report.id}">手动推送</button>
        <button class="ghost danger" data-report-delete="${report.id}">删除该报告</button>
      </div>
    `;
    root.appendChild(el);
  });
  const pages = Math.ceil(state.reportTotal / state.reportPageSize) || 1;
  q('#reportPageInfo').textContent = `${state.reportPage + 1} / ${pages}`;
  qa('[data-report-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const value = parseInt(btn.dataset.reportDelete, 10);
      if (Number.isNaN(value)) return;
      handleDeleteReport(value);
    });
  });
  // 绑定报告推送按钮
  qa('[data-report-push]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const reportId = parseInt(btn.dataset.reportPush, 10);
      if (isNaN(reportId)) return;
      showPushModal(null, reportId); // 传入reportId而不是articleId
    });
  });
}

// 搜索高亮功能已移除

async function openModal(id) {
  try {
    const item = state.items.find(i=>i.id===id) || null;
    if (!item) return;
    const m = q('#modal');
    q('#modalTitle').textContent = item.title;
    const keywordList = Array.isArray(item.matched_keywords) ? item.matched_keywords : [];
    const metaParts = [];
    if (item.pub_date) metaParts.push(item.pub_date);
    if (item.author) metaParts.push(item.author);
    if (keywordList.length) {
      metaParts.push(`关键词：${keywordList.join('、')}`);
    }
    q('#modalMeta').textContent = metaParts.join(' · ');
    q('#modalSummary').innerHTML = escapeHtml(item.summary_text).replace(/\n/g,'<br/>');
    q('#modalLink').href = item.link;
    const modalContent = q('#modalContent');
    const modalContentSection = q('#modalContentSection');
    if (modalContent && modalContentSection) {
      const content = (item.content_text || '').trim();
      if (content) {
        modalContent.textContent = content;
        modalContentSection.style.display = '';
      } else {
        modalContent.textContent = '';
        modalContentSection.style.display = 'none';
      }
    }
    m.classList.add('show');
    document.body.classList.add('modal-open');
  } catch {}
}

function showPushModal(articleId, reportId = null) {
  const modal = q('#pushModal');
  if (!modal) return;

  // 保存当前ID和类型
  if (articleId) {
    modal.dataset.articleId = articleId;
    modal.dataset.type = 'article';
  } else if (reportId) {
    modal.dataset.reportId = reportId;
    modal.dataset.type = 'report';
  }

  // 显示模态框
  modal.classList.add('show');
  document.body.classList.add('modal-open');
}

function closePushModal() {
  const modal = q('#pushModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
    delete modal.dataset.articleId;
    delete modal.dataset.reportId;
    delete modal.dataset.type;
  }
}

async function handlePushConfirm() {
  const modal = q('#pushModal');
  if (!modal) return;

  const type = modal.dataset.type || 'article';
  let id;
  if (type === 'article') {
    id = parseInt(modal.dataset.articleId, 10);
  } else if (type === 'report') {
    id = parseInt(modal.dataset.reportId, 10);
  }

  if (isNaN(id)) return;

  const pushTelegram = q('#pushTelegram')?.checked;
  const pushWeCom = q('#pushWeCom')?.checked;

  if (!pushTelegram && !pushWeCom) {
    toast('请至少选择一个推送平台');
    return;
  }

  const platforms = [];
  if (pushTelegram) platforms.push('telegram');
  if (pushWeCom) platforms.push('wecom');

  try {
    // 显示加载状态
    const confirmBtn = q('#confirmPush');
    const originalText = confirmBtn.textContent;
    confirmBtn.textContent = '推送中...';
    confirmBtn.disabled = true;

    let result;
    if (type === 'article') {
      result = await pushArticle(id, platforms);
    } else if (type === 'report') {
      result = await pushReport(id, platforms);
    }

    // 恢复按钮状态
    confirmBtn.textContent = originalText;
    confirmBtn.disabled = false;

    // 显示结果
    const successCount = result.results.filter(r => r.success).length;
    const totalCount = result.results.length;

    if (successCount === totalCount) {
      toast(`成功推送到 ${successCount}/${totalCount} 个平台`);
    } else {
      toast(`推送完成: ${successCount}/${totalCount} 个平台成功`);
    }

    // 关闭模态框
    closePushModal();
  } catch (error) {
    console.error('推送失败:', error);

    // 恢复按钮状态
    const confirmBtn = q('#confirmPush');
    if (confirmBtn) {
      confirmBtn.textContent = '推送';
      confirmBtn.disabled = false;
    }

    toast('推送失败: ' + (error.message || '未知错误'));
  }
}

function bindEvents() {
  q('#refreshBtn').addEventListener('click', manualFetch);
  const clearCurrentFeedBtn = q('#clearCurrentFeedBtn');
  if (clearCurrentFeedBtn) {
    clearCurrentFeedBtn.addEventListener('click', clearArticlesByFeed);
  }
  const clearAllArticlesBtn = q('#clearAllArticlesBtn');
  if (clearAllArticlesBtn) {
    clearAllArticlesBtn.addEventListener('click', clearAllArticles);
  }
  q('#feedSelect').addEventListener('change', (e)=>{ state.filterFeed=e.target.value; state.page=0; loadArticles(); });
  const searchInput = q('#searchInput');
  const searchBtn = q('#searchBtn');
  const searchClear = q('#searchClear');
  const updateSearchControls = () => {
    if (!searchClear) return;
    const hasValue = searchInput && searchInput.value.trim().length > 0;
    const shouldShow = hasValue || !!state.searchTerm;
    searchClear.classList.toggle('visible', shouldShow);
  };
  const triggerSearch = () => {
    if (!searchInput) return;
    const value = searchInput.value.trim();
    state.searchTerm = value;
    state.page = 0;
    loadArticles().catch(()=>{});
    updateSearchControls();
  };
  if (searchInput) {
    searchInput.value = state.searchTerm;
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerSearch();
      }
    });
    searchInput.addEventListener('input', updateSearchControls);
    updateSearchControls();
  }
  if (searchBtn) {
    searchBtn.addEventListener('click', triggerSearch);
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      if (!state.searchTerm) {
        updateSearchControls();
        return;
      }
      state.searchTerm = '';
      state.page = 0;
      loadArticles().catch(()=>{});
      updateSearchControls();
    });
  }
  q('#prevPage').addEventListener('click', () => {
    if (state.page > 0) { state.page--; loadArticles(); }
  });
  q('#nextPage').addEventListener('click', () => {
    const pages = Math.ceil(state.total / state.pageSize) || 1;
    if (state.page + 1 < pages) { state.page++; loadArticles(); }
  });
  q('#settingsForm').addEventListener('submit', saveSettings);
  q('#autoRefresh').addEventListener('change', (e)=> setAutoRefresh(e.target.checked));
  q('#modal').addEventListener('click', (e)=>{ if (e.target.id==='modal' || e.target.dataset.close==='1') closeModal(); });
  q('#toTop').addEventListener('click', ()=> window.scrollTo({top:0,behavior:'smooth'}));
  const themeToggle = q('#themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
      applyTheme(next);
    });
  }
  const pushModeBtns = qa('[data-push-mode]');
  if (pushModeBtns.length) {
    pushModeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.pushMode;
        if (!mode || mode === state.telegramPushMode) return;
        updateTelegramPushModeUI(mode);
      });
    });
  }
  const tgPushSummary = q('#tgPushSummary');
  if (tgPushSummary) {
    tgPushSummary.addEventListener('change', (e) => {
      state.telegramPushSummary = !!e.target.checked;
    });
  }

  // 企业微信推送模式按钮事件处理
  const wecomPushModeBtns = qa('[data-wecom-push-mode]');
  if (wecomPushModeBtns.length) {
    wecomPushModeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.wecomPushMode;
        if (!mode || mode === state.wecomPushMode) return;
        updateWeComPushModeUI(mode);
      });
    });
  }
  const wecomPushSummary = q('#wecomPushSummary');
  if (wecomPushSummary) {
    wecomPushSummary.addEventListener('change', (e) => {
      state.wecomPushSummary = !!e.target.checked;
    });
  }
  const reportFilterBtns = qa('[data-report-filter]');
  if (reportFilterBtns.length) {
    reportFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.reportFilter || '';
        if (state.reportTypeFilter === value) return;
        state.reportTypeFilter = value;
        state.reportPage = 0;
        updateReportFilterUI(value);
        loadReports().catch(()=>{});
      });
    });
    updateReportFilterUI(state.reportTypeFilter);
  }
  const reportPrev = q('#reportPrevPage');
  const reportNext = q('#reportNextPage');
  if (reportPrev && reportNext) {
    reportPrev.addEventListener('click', () => {
      if (state.reportPage > 0) {
        state.reportPage--;
        loadReports().catch(()=>{});
      }
    });
    reportNext.addEventListener('click', () => {
      const pages = Math.ceil(state.reportTotal / state.reportPageSize) || 1;
      if (state.reportPage + 1 < pages) {
        state.reportPage++;
        loadReports().catch(()=>{});
      }
    });
  }

  const generateHourly = q('#generateHourlyReport');
  const generateDaily = q('#generateDailyReport');
  if (generateHourly) {
    generateHourly.addEventListener('click', () => triggerReport('hourly'));
  }
  if (generateDaily) {
    generateDaily.addEventListener('click', () => triggerReport('daily'));
  }

  updateTelegramPushModeUI(state.telegramPushMode);
  updateWeComPushModeUI(state.wecomPushMode);

  // 推送模态框事件
  const pushModal = q('#pushModal');
  if (pushModal) {
    // 关闭推送模态框事件
    pushModal.addEventListener('click', (e) => {
      if (e.target.id === 'pushModal' || e.target.dataset.closePush === '1') {
        closePushModal();
      }
    });

    // 确认推送按钮事件
    const confirmPushBtn = q('#confirmPush');
    if (confirmPushBtn) {
      confirmPushBtn.addEventListener('click', handlePushConfirm);
    }
  }

  // 显示/隐藏返回顶部（移动端更友好）
  const onScroll = () => {
    const btn = q('#toTop');
    if (window.scrollY > 400) btn.classList.add('show'); else btn.classList.remove('show');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

async function init() {
  initTheme();
  bindEvents();
  setAutoRefresh(localStorage.getItem('autoRefresh')==='1');
  await loadSettings();
  await loadArticles();
  await loadReports();
  updateReportFilterUI(state.reportTypeFilter);
}

init().catch(console.error);
