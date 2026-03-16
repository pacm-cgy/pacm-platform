// 기존 AI 요약을 null로 초기화 → 다음 cron에서 새 방식으로 재요약
// 1회 실행 후 삭제
export const config = { runtime: 'edge' }
const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req) {
  if (req.headers.get('authorization') !== 'Bearer ' + CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }

  // 최근 7일치 뉴스 요약 초기화 (오래된 건 그냥 둠)
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const r = await fetch(
    `${SB_URL}/rest/v1/articles?published_at=gte.${since}&status=eq.published`,
    { method: 'PATCH', headers: H, body: JSON.stringify({ ai_summary: null }) }
  )
  return new Response(JSON.stringify({ status: r.status, ok: r.ok, message: '최근 7일 요약 초기화 완료' }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}
