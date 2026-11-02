// rcj-lab · 手记（在线便签 API，/note 页面专用）
// GET    /api/notes           -> 全部便签（按时间倒序，公开读）
// POST   /api/notes           -> 新增 {text}（需登录，自动记时间）
// PUT    /api/notes           -> 修改 {id, text}（需登录，保留原 created_at，记 updated_at）
// DELETE /api/notes?id=xx     -> 删除（需登录）
// 存储：复用 rcj-analytics-d1 的 notes 表（纯文字，惰性建表，走原生绑定 env.DB）

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
    // 毫秒时间戳（login.js Date.now()），与 login.js Max-Age 对齐：1 天有效
    if (Date.now() - Number(ts) > 24 * 60 * 60 * 1000) return false;
    if ((await hmac(ts, env.ADMIN_PASSWORD)) === sig) return true;
  }
  return false; // 移除 ?password= URL 明文参数
}

async function d1(env, sql, params = []) {
  const r = await env.DB.prepare(sql).bind(...params).all();
  return r.results;
}

let tableReady = false;
async function ensureTable(env) {
  await d1(env, 'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, created_at TEXT NOT NULL)');
  if (!tableReady) {
    // 惰性补列：老表没有 updated_at，ALTER 失败（已存在）则忽略，每个隔离实例只试一次
    try { await d1(env, 'ALTER TABLE notes ADD COLUMN updated_at TEXT'); } catch (_) {}
    tableReady = true;
  }
}

export async function onRequestGet({ request, env }) {
  try {
    await ensureTable(env);
    const rows = await d1(env, 'SELECT id, text, created_at, updated_at FROM notes ORDER BY id DESC');
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

export async function onRequestPut({ request, env }) {
  if (!(await verifyAuth(request, env))) return json({ error: '未登录' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON 格式错误' }, 400); }
  const id = Number(body.id);
  const text = String(body.text || '').trim();
  if (!id) return json({ error: '缺少 id' }, 400);
  if (!text) return json({ error: '内容不能为空' }, 400);
  if (text.length > 5000) return json({ error: '内容过长（最多 5000 字）' }, 400);
  try {
    await ensureTable(env);
    const updated_at = new Date().toISOString();
    const run = () => env.DB.prepare('UPDATE notes SET text = ?, updated_at = ? WHERE id = ?')
      .bind(text, updated_at, id)
      .run();
    let r;
    try {
      r = await run();
    } catch (e) {
      // 自愈：老表若缺 updated_at 列（惰性迁移未生效），补列后重试一次
      if (!/no such column/i.test(e.message || '')) throw e;
      await env.DB.prepare('ALTER TABLE notes ADD COLUMN updated_at TEXT').run();
      r = await run();
    }
    if (!r.meta || !r.meta.changes) return json({ ok: false, error: '便签不存在' }, 404);
    // 回传更新后的行：前端直接采用，界面立即反映，不依赖随后的全量拉取
    return json({ ok: true, note: { id, text, updated_at } });
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
