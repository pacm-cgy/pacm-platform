// api/news-cleanup.js
// 3일 초과 뉴스 삭제 + AI v5 요약 미처리 기사 트리거
// POST /api/news-cleanup  (x-cron-secret 헤더 필요)



const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

export async function handleNewsCleanup(req) {
  // 인증
  const secret = req.headers.get('x-cron-secret') || req.headers.get('x-vercel-cron')
  if (secret !== CRON_SECRET && secret !== '1') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if (!SB_URL || !SB_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 })
  }

  const H = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }

  // 3일 전 기준
  const cutoff = new Date(Date.now() - 3 * 86400 * 1000).toISOString()
  const results = { deleted: 0, errors: [] }

  try {
    // 3일 초과 기사 삭제
    const delRes = await fetch(
      `${SB_URL}/rest/v1/articles?published_at=lt.${cutoff}&status=eq.published`,
      { method: 'DELETE', headers: H }
    )
    if (delRes.ok) {
      const cr = delRes.headers.get('Content-Range') || ''
      results.deleted = parseInt(cr.split('/')[1] || '0') || 0
    } else {
      results.errors.push(`삭제 오류: ${delRes.status}`)
    }
  } catch (e) {
    results.errors.push(e.message?.slice(0, 80))
  }

  return new Response(JSON.stringify({
    ...results,
    cutoff,
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
