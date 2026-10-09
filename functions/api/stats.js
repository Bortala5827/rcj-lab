// rcj-lab · 访问统计公开查询（与 track.js 同一张 visits 表）
// GET /api/stats?site=voice → { ok, site, date, uv(当日去重访客), pv(当日访问) }
const SITES = ['hub', 'solospeak', 'letout', 'training', 'aux', 'xf', 'facetalk', 'exam', 'shop', 'voice'];
const ANALYTICS_DB = 'b3198ef2-6e7c-424e-8a0f-a7b21afc1828'; // rcj-analytics-d1

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors() },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const site = (url.searchParams.get('site') || '').trim();
  if (!SITES.includes(site)) {
    return json({ ok: false, error: 'unknown site' }, 400);
  }
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
    return json({ ok: false, error: 'server misconfig' }, 500);
  }
  const day = new Date().toISOString().slice(0, 10); // UTC 当日
  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/d1/database/${ANALYTICS_DB}/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: `SELECT COUNT(DISTINCT ip) AS uv, COALESCE(SUM(n), 0) AS pv FROM visits WHERE site = '${site}' AND day = '${day}'`,
        }),
      }
    );
    const j = await r.json();
    if (!j.success) throw new Error(j.errors?.[0]?.message || 'db error');
    const row = j.result?.[0]?.results?.[0] || {};
    return json({
      ok: true,
      site,
      date: day,
      uv: Number(row.uv || 0),
      pv: Number(row.pv || 0),
    });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
