// 此刻通勤 · 极简实时感 + 轻聊天
// 单一职责：拉快照、点 start/arrive、显示数字、时段门禁、聊天轮询。
// v20260827：主数字改为「今日完成通勤」（累计值），瞬时 active 降级为副行；
//           新增今日各小时完成人数迷你折线。文件名版本替代 ?v=（CF 忽略 query）。
(function () {
  'use strict';

  const API = '/api/moment';
  const CHAT = '/api/commute-chat';
  const LS_SESSION = 'rcj_moment_session_v1'; // {id, startedAt, mode, traffic}
  const LS_CLIENT = 'rcj_moment_client_v1';

  // 时段是否开放：以**后端返回**为准（后端已含 TEST_MODE 测试开关逻辑）。
  // 前端不再用本地时间硬判，避免和后端不一致。
  let serverOpen = true;

  // clientId：浏览器本地生成，用于 web 端软唯一性（防同一浏览器刷量）
  function getClientId() {
    let id = localStorage.getItem(LS_CLIENT);
    if (!id) {
      const b = new Uint8Array(12);
      crypto.getRandomValues(b);
      id = Array.from(b).map((x) => x.toString(36)).join('').slice(0, 16);
      localStorage.setItem(LS_CLIENT, id);
    }
    return id;
  }

  // ── 工具 ──
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString('zh-CN');
  const fmtDur = (sec) => {
    if (!sec) return '—';
    if (sec < 60) return sec + '″';
    const m = Math.floor(sec / 60);
    if (m < 60) return m + '′';
    const h = Math.floor(m / 60);
    return h + 'h' + (m % 60) + '′';
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function loadSession() {
    try { const s = JSON.parse(localStorage.getItem(LS_SESSION) || 'null'); return s || null; }
    catch { return null; }
  }
  function saveSession(s) {
    if (s) localStorage.setItem(LS_SESSION, JSON.stringify(s));
    else localStorage.removeItem(LS_SESSION);
  }

  // ── 视图：数字 / 统计 / 按钮态切换 ──
  // 冷启动优化：主数字用累计值 doneToday（随一天必然增长），
  // 瞬时 active 只在 >0 时展示为副行「此刻路上 N 人」，避免长期挂 0 的冷清感。
  // POST 响应不含 stats（只有 active），用 lastStats 兜底保持今日数字不闪跳。
  let lastStats = null;
  function renderCount(snap) {
    if (snap && snap.stats) lastStats = snap.stats;
    const active = (snap && Number(snap.active)) || 0;
    const done = lastStats ? (Number(lastStats.doneToday) || 0) : null;
    $('mNum').textContent = done === null ? '—' : fmt(done);
    const foot = $('mStatFoot');
    if (foot) {
      if (active > 0) foot.textContent = `此刻路上 ${fmt(active)} 人`;
      else if (lastStats && Number(lastStats.avgSec) > 0) foot.textContent = `今日平均 ${fmtDur(lastStats.avgSec)}`;
      else foot.textContent = '完成后计入今日数字';
    }
    if (snap && Array.isArray(snap.hourly)) renderSpark(snap.hourly);
    if (typeof snap.open === 'boolean') serverOpen = snap.open;
  }

  // 今日各小时完成人数 · 迷你折线（数据 /api/moment 本就返回，此前未用）
  function renderSpark(hourly) {
    const box = $('mSpark');
    if (!box) return;
    const max = Math.max(0, ...hourly);
    if (max <= 0) { box.hidden = true; return; }
    const W = 320, H = 48, PAD = 5;
    const pts = hourly.map((c, h) => {
      const x = (PAD + (h / 23) * (W - PAD * 2)).toFixed(1);
      const y = (H - PAD - (c / max) * (H - PAD * 2)).toFixed(1);
      return x + ',' + y;
    }).join(' ');
    box.innerHTML = '<svg width="100%" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="今日各小时完成通勤人数">'
      + '<polyline points="' + pts + '" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
      + '</svg>';
    box.hidden = false;
  }

  function showIdle() {
    $('mActionIdle').hidden = false;
    $('mActionOn').hidden = true;
  }
  function showOn(session) {
    $('mActionIdle').hidden = true;
    $('mActionOn').hidden = false;
  }

  function setBtnLoading(btn, loading, label) {
    if (!btn) return;
    btn.disabled = !!loading;
    const span = btn.querySelector('.m-btn-label');
    if (span) {
      span.textContent = label;
      if (loading) span.setAttribute('data-loading', '');
      else span.removeAttribute('data-loading');
    }
  }

  // ── 网络 ──
  async function fetchSnap() {
    const r = await fetch(API, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('网络异常 ' + r.status);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || '服务异常');
    return j;
  }
  async function postAction(body) {
    const r = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      const err = new Error(j.error || ('网络异常 ' + r.status));
      err.code = j.code || '';
      throw err;
    }
    return j;
  }

  // ── 计时器 ──
  let timerHandle = null;
  function startTimer(startedAt) {
    stopTimer();
    const tick = () => {
      const sec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      $('mTimer').textContent = `${mm}:${ss}`;
    };
    tick();
    timerHandle = setInterval(tick, 1000);
  }
  function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }

  // ── chip 单选（方式/路况）──
  let pickedMode = '';
  let pickedTraffic = '';
  function bindChips(containerId, key, getVal) {
    const box = $(containerId);
    if (!box) return;
    box.querySelectorAll('.m-chip').forEach((b) => {
      b.addEventListener('click', () => {
        const on = b.getAttribute('aria-pressed') === 'true';
        box.querySelectorAll('.m-chip').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        if (!on) { b.setAttribute('aria-pressed', 'true'); window[key] = getVal(b); }
        else { window[key] = ''; }
      });
    });
  }
  function resetChips() {
    ['mModeChips', 'mTrafficChips'].forEach((id) => {
      const box = $(id); if (box) box.querySelectorAll('.m-chip').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    });
    pickedMode = ''; pickedTraffic = '';
  }

  // ── 主流程 ──
  async function onStart() {
    const btn = $('mBtnStart');
    // 时段门禁以**后端返回**为准（含 TEST_MODE 测试开关）
    if (!serverOpen) { showErr('现在不是通勤时段（开放：早 6–10、晚 6–10）'); return; }
    setBtnLoading(btn, true, '正在加入…');
    // 立即本地起表：用本地时间起算，不等后端回包，消除点击后不计时的问题
    const localStart = Date.now();
    const session = { id: '', startedAt: new Date(localStart).toISOString(), mode: pickedMode, traffic: pickedTraffic };
    showOn(session);
    startTimer(localStart);
    try {
      const j = await postAction({ action: 'start', clientId: getClientId(), mode: pickedMode, traffic: pickedTraffic });
      session.id = j.id || session.id;
      // 若后端有更准的 startedAt 且差距不大，以本地为准（避免秒级跳动）
      saveSession(session);
      renderCount(j);
    } catch (e) {
      if (e.code === 'RECENT_EXISTS') {
        // 2h 内已记录过：复位按钮
        stopTimer(); showIdle(); resetChips(); showErr('你最近 2 小时内已经记录过一次通勤啦，稍后再来～');
        return;
      }
      // 其他错误：回退到 idle（但不清计时，已显示 on 状态；保守起见复位）
      stopTimer(); showIdle();
      showErr(e.message);
    } finally {
      setBtnLoading(btn, false, '我出发了');
    }
  }

  async function onArrive() {
    const btn = $('mBtnArrive');
    const sess = loadSession();
    if (!sess) { showErr('没有进行中的记录'); return; }
    setBtnLoading(btn, true, '记录中…');
    try {
      const j = await postAction({ action: 'arrive', id: sess.id });
      stopTimer();
      saveSession(null);
      renderCount(j);
      showIdle();
      showOk(`已记录 · 通勤 ${formatDur(j.durationSec || 0)}`);
      // POST 响应不含今日统计，补拉一次让「今日完成通勤」立即 +1
      fetchSnap().then(renderCount).catch(() => {});
    } catch (e) {
      showErr(e.message);
    } finally {
      setBtnLoading(btn, false, '我到了');
    }
  }

  async function onCancel() {
    const sess = loadSession();
    if (!sess) return;
    if (!confirm('撤销这次记录？')) return;
    try {
      const j = await postAction({ action: 'leave', id: sess.id });
      stopTimer();
      saveSession(null);
      renderCount(j);
      showIdle();
    } catch (e) {
      showErr(e.message);
    }
  }

  function formatDur(sec) {
    if (sec < 60) return `${sec} 秒`;
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m} 分钟`;
    const h = Math.floor(m / 60);
    return `${h} 小时 ${m % 60} 分钟`;
  }

  function ensureHintLine() {
    if (!$('mErr')) {
      const p = document.createElement('p');
      p.id = 'mErr'; p.className = 'm-err'; p.setAttribute('role', 'status');
      $('mHint').after(p);
    }
  }
  function showErr(msg) { ensureHintLine(); const e = $('mErr'); e.style.color = '#b91c1c'; e.textContent = msg || ''; }
  function showOk(msg) { ensureHintLine(); const e = $('mErr'); e.style.color = 'var(--ink-3)'; e.textContent = msg || ''; }

  // ════════════ 轻聊天 ════════════
  const chat = {
    items: [],
    knownIds: new Set(),
    lastCreatedAt: null,
    closed: false,
  };

  function chatTimeLabel(iso) {
    try {
      const d = new Date(iso);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    } catch { return ''; }
  }

  function renderChat(initial) {
    const win = $('mChatWindow');
    const empty = $('mChatEmpty');
    // 仅渲染新条目（追加），避免重排闪烁
    const newOnes = chat.items.filter((it) => !chat.knownIds.has(it.id));
    if (newOnes.length) {
      if (empty) empty.remove();
      const nearBottom = win.scrollHeight - win.scrollTop - win.clientHeight < 60;
      for (const it of newOnes) {
        chat.knownIds.add(it.id);
        const row = document.createElement('div');
        row.className = 'm-chat-row';
        const t = document.createElement('span');
        t.className = 'm-chat-time';
        t.textContent = chatTimeLabel(it.createdAt);
        const b = document.createElement('span');
        b.className = 'm-chat-text';
        b.textContent = it.text; // textContent 防 XSS
        row.appendChild(t); row.appendChild(b);
        win.appendChild(row);
      }
      if (initial || nearBottom) win.scrollTop = win.scrollHeight;
    }
  }

  async function loadChat() {
    try {
      const r = await fetch(CHAT, { method: 'GET', headers: { Accept: 'application/json' } });
      const j = await r.json();
      if (!j.ok) {
        if (j.code === 'CLOSED' || j.open === false) chatShowClosed();
        return;
      }
      if (j.open === false) { chatShowClosed(); return; }
      chat.testMode = !!j.testMode;
      chat.items = j.items || [];
      renderChat(true);
    } catch { /* 静默 */ }
  }

  function chatShowClosed() {
    if (chat.closed) return;
    chat.closed = true;
    const form = $('mChatForm');
    if (form) form.hidden = true;
    const win = $('mChatWindow');
    if (win) {
      win.innerHTML = '<div class="m-chat-closed">🌙 现在不是通勤时段<br>开放时间：早 6–10 点、晚 6–10 点</div>';
    }
  }

  async function sendChat() {
    const input = $('mChatInput');
    const btn = $('mChatSend');
    const text = input.value.trim();
    if (!text) return;
    btn.disabled = true;
    try {
      const r = await fetch(CHAT, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ text, clientId: getClientId() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        if (j.code === 'CLOSED') { chatShowClosed(); return; }
        if (j.code === 'RATE_LIMIT') { showChatQuota(`请 ${j.left} 秒后再发`); return; }
        if (j.code === 'BURST_LIMIT') { showChatQuota(`一分钟发言太多，请 ${j.left} 秒后再发`); return; }
        if (j.code === 'DAILY_LIMIT') { showChatQuota('今日发言已达上限'); return; }
        showChatQuota(j.error || '发送失败');
        return;
      }
      input.value = '';
      $('mChatLen').textContent = '0';
      if (!chat.testMode && typeof j.remaining === 'number') showChatQuota(`今日还可发 ${j.remaining} 条`);
      // 立即拉一次，确保自己的消息出现在窗口
      await loadChat();
    } catch {
      showChatQuota('网络异常');
    } finally {
      btn.disabled = false;
      input.focus();
    }
  }

  let quotaTimer = null;
  function showChatQuota(msg) {
    const el = $('mChatQuota');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    el.style.color = '#b91c1c';
    clearTimeout(quotaTimer);
    quotaTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }

  function bindChat() {
    const input = $('mChatInput');
    const send = $('mChatSend');
    if (input) {
      input.addEventListener('input', () => { $('mChatLen').textContent = String(input.value.length); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
      input.addEventListener('compositionstart', () => { input._composing = true; });
      input.addEventListener('compositionend', () => { input._composing = false; $('mChatLen').textContent = String(input.value.length); });
    }
    if (send) send.addEventListener('click', sendChat);
  }

  // ── 启动 ──
  async function bootstrap() {
    requestAnimationFrame(() => document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in')));

    $('mBtnStart').addEventListener('click', onStart);
    $('mBtnArrive').addEventListener('click', onArrive);
    $('mBtnCancel').addEventListener('click', onCancel);
    bindChips('mModeChips', 'pickedMode', (b) => b.dataset.mode);
    bindChips('mTrafficChips', 'pickedTraffic', (b) => b.dataset.traffic);
    bindChat();

    let snap = null;
    try { snap = await fetchSnap(); renderCount(snap); }
    catch (e) { /* 静默首屏失败，UI 仍可点 */ }
    // 非开放时段（且非测试模式）：禁用「我出发了」
    if (snap && snap.open === false) {
      const sb = $('mBtnStart');
      if (sb) { sb.disabled = true; sb.querySelector('.m-btn-label').textContent = '非通勤时段'; }
    }

    const sess = loadSession();
    if (sess) {
      try {
        const live = await postAction({ action: 'start', id: sess.id });
        pickedMode = sess.mode || '';
        pickedTraffic = sess.traffic || '';
        saveSession({ id: sess.id, startedAt: sess.startedAt, mode: pickedMode, traffic: pickedTraffic });
        showOn(sess);
        startTimer(new Date(sess.startedAt).getTime());
        renderCount(live);
        return;
      } catch (e) {
        saveSession(null);
      }
    }
    resetChips();
    showIdle();

    // 聊天：首屏加载 + 5s 轮询（测试期全开放，非时段才关闭）
    await loadChat();
    setInterval(loadChat, 5000);

    // 你懂的 · 底部左右滚动知识带（复用 exam Learn 卡 hook）
    loadYouKnow();
  }

  // ── 你懂的：复用 exam Learn 卡的 hook 字段，左右滚动，可关闭 ──
  const YK_SRC = 'https://exam.955827.xyz/learn/cards.js'; // exam Pages 的 Learn 数据
  const YK_DETAIL = 'https://exam.955827.xyz/learn/';
  function loadYouKnow() {
    // 本地已收起则不再显示
    try { if (localStorage.getItem('rcj_youknow_closed') === '1') return; } catch {}
    const section = $('mYouKnow');
    const track = $('mYkTrack');
    if (!section || !track) return;

    const render = (cards) => {
      const list = (cards || []).filter((c) => c && c.hook).map((c) => ({
        id: c.id || '',
        hook: String(c.hook).slice(0, 40),
        tags: (c.tags || []).slice(0, 2),
      }));
      if (!list.length) { section.hidden = true; return; }
      track.innerHTML = '';
      // 复制一份做无缝滚动
      const frag = document.createDocumentFragment();
      list.concat(list).forEach((it) => {
        const a = document.createElement('a');
        a.className = 'm-yk-item';
        a.href = YK_DETAIL + '?card=' + encodeURIComponent(it.id);
        a.target = '_blank';
        a.rel = 'noopener';
        a.title = it.hook;
        const tag = it.tags.length ? `<span class="m-yk-tag">${escapeHtml(it.tags[0])}</span>` : '';
        a.innerHTML = `${tag}<span class="m-yk-text">${escapeHtml(it.hook)}</span>`;
        frag.appendChild(a);
      });
      track.appendChild(frag);
      section.hidden = false;
      // 自动滚动（CSS 动画在 CSS 里定义，这里只确保 hover 暂停的 class）
      track.classList.add('is-scrolling');
    };

    // 动态注入 exam 的 cards.js（跨域 script 引入，无 CORS 限制）
    const fail = () => { section.hidden = true; };
    const prev = window.LEARN_CARDS;
    const s = document.createElement('script');
    s.src = YK_SRC + '?v=' + Date.now();
    s.async = true;
    s.onload = () => {
      const cards = window.LEARN_CARDS;
      if (Array.isArray(cards) && cards.length) render(cards);
      else fail();
    };
    s.onerror = fail;
    document.head.appendChild(s);
    // 兜底超时：3s 内未就绪则隐藏
    setTimeout(() => { if (section.hidden === false && !track.querySelector('.m-yk-item')) fail(); }, 3000);

    // 关闭按钮
    const closeBtn = $('mYkClose');
    if (closeBtn) closeBtn.addEventListener('click', () => {
      section.hidden = true;
      try { localStorage.setItem('rcj_youknow_closed', '1'); } catch {}
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // 轮询刷新：每 15s 拉一次快照
  setInterval(async () => {
    try { const s = await fetchSnap(); renderCount(s); }
    catch { /* 静默 */ }
  }, 15000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchSnap().then(renderCount).catch(() => {});
    }
  });

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
