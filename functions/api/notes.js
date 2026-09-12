// rcj-lab · 手记（在线便签 API，/note 页面专用）
// GET    /api/notes           -> 全部便签（按时间倒序，公开读）
// POST   /api/notes           -> 新增 {text}（需登录，自动记时间）
// DELETE /api/notes?id=xx     -> 删除（需登录）
// 存储：复用 rcj-analytics-d1 的 notes 表（纯文字，惰性建表）

const DB = 'b3198ef2-6e7c-424e-8a0f-a7b21afc1828'; // rcj-analytics-d1

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function hmac(value, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  const b = new Uint8Array(buf);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
async function verifyAuth(request, env) {
  const cookie = getCookie(request, 'rcj_admin');
  if (cookie && env.ADMIN_PASSWORD) {
    const [ts, sig] = cookie.split('.');
    if (!ts || !sig) return false;
    // 毫秒时间戳（login.js Date.now()），7 天有效
    if (Date.now() - Number(ts) > 7 * 24 * 60 * 60 * 1000) return false;
    if ((await hmac(ts, env.ADMIN_PASSWORD)) === sig) return true;
  }
  return false; // 移除 ?password= URL 明文参数
}

async function d1(env, sql, params = []) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/d1/database/${DB}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(j.errors?.[0]?.message || 'D1 查询失败');
  return j.result[0].results;
}

async function ensureTable(env) {
  await d1(env, 'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, created_at TEXT NOT NULL)');
}

export async function onRequestGet({ request, env }) {
  try {
    await ensureTable(env);
    const rows = await d1(env, 'SELECT id, text, created_at FROM notes ORDER BY id DESC');
    return json({ ok: true, notes: rows });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!(await verifyAuth(request, env))) return json({ error: '未登录' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON 格式错误' }, 400); }
  const text = String(body.text || '').trim();
  if (!text) return json({ error: '内容不能为空' }, 400);
  if (text.length > 5000) return json({ error: '内容过长（最多 5000 字）' }, 400);
  try {
    await ensureTable(env);
    const created_at = new Date().toISOString();
    await d1(env, 'INSERT INTO notes (text, created_at) VALUES (?, ?)', [text, created_at]);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  if (!(await verifyAuth(request, env))) return json({ error: '未登录' }, 401);
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: '缺少 id' }, 400);
  try {
    await ensureTable(env);
    await d1(env, 'DELETE FROM notes WHERE id = ?', [id]);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
