// 어드민 전용 작업 API - service_role 키 사용 (RLS 우회)
// 회원 정지/해제, 구독자 삭제 등
export const config = { runtime: 'edge' }

const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY  // service_role: RLS 우회
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const H = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }

  let body
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }) }

  const { action, id, data } = body

  try {
    switch (action) {

      // 회원 정지 / 해제
      case 'ban_user': {
        const banned = data?.banned === true
        const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${id}`, {
          method: 'PATCH', headers: H,
          body: JSON.stringify({ is_banned: banned }),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'ban_user', id, banned })
      }

      // 역할 변경
      case 'change_role': {
        const role = data?.role
        if (!['reader','writer','admin'].includes(role)) throw new Error('유효하지 않은 역할')
        const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${id}`, {
          method: 'PATCH', headers: H,
          body: JSON.stringify({ role }),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'change_role', id, role })
      }

      // 구독자 삭제
      case 'delete_subscriber': {
        const r = await fetch(`${SB_URL}/rest/v1/newsletter_subscribers?id=eq.${id}`, {
          method: 'DELETE', headers: H,
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'delete_subscriber', id })
      }

      // 아티클 삭제
      case 'delete_article': {
        const r = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${id}`, {
          method: 'DELETE', headers: H,
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'delete_article', id })
      }

      default:
        return new Response(JSON.stringify({ error: `알 수 없는 action: ${action}` }), { status: 400 })
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
}

function ok(data) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}
