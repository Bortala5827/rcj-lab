// rcj-lab · 统一访问统计埋点接收端（公开，无需后台登录）
// POST/GET /api/track?site=xxx  →  写入 rcj-analytics-d1.visits(site, day, ip, n)
// 所有站点（hub/training/aux/xf/facetalk/exam/speak 系列）共用一个库、一张表、一条管道。
// Token 仅存服务端 env（CF_API_TOKEN + CF_ACCOUNT_ID），仅供本 Function 写统一库使用。

const SITES = ['hub', 'solospeak', 'letout', 'training', 'aux', 'xf', 'facetalk', 'exam', 'shop'];
const ANALYTICS_DB = 'b3198ef2-6e7c-424e-8a0f-a7b21afc1828'; // rcj-analytics-d1

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const site = (url.searchParams.get('site') || '').trim();
  if (!SITES.includes(site)) {
    return new Response(JSON.stringify({ ok: false, error: 'unknown site' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...cors() } });
  }
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
    return new Response(JSON.stringify({ ok: false, error: 'server misconfig' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...cors() } });
  }

  const ip = (request.headers.get('CF-Connecting-IP')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || '0.0.0.0');
  const day = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const ipSql = ip.replace(/'/g, "''");

  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/d1/database/${ANALYTICS_DB}/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: `INSERT INTO visits(site, day, ip, n) VALUES('${site}', '${day}', '${ipSql}', 1) ON CONFLICT(site, day, ip) DO UPDATE SET n = n + 1`,
        }),
      }
    );
    const j = await r.json();
    if (!j.success) throw new Error(j.errors?.[0]?.message || 'db error');
    return new Response(JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...cors() } });
  } catch (e) {
    // 埋点失败不影响用户浏览，静默返回
    return new Response(JSON.stringify({ ok: false, error: e.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...cors() } });
  }
}
