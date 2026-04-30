// 어드민 전용 작업 API - service_role 키 사용 (RLS 우회)
// 인증: Bearer CRON_SECRET (cron/서버) 또는 Bearer <user_jwt> (admin 유저)


const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY  // service_role: RLS 우회
const CRON_SECRET = process.env.CRON_SECRET

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// service_role 헤더
const H = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
})

// JWT로 admin 여부 검증 (Supabase Auth + profiles)
async function verifyAdmin(jwt) {
  try {
    // 1) JWT 유저 정보 조회
    const r1 = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${jwt}`,
      },
    })
    if (!r1.ok) return null
    const user = await r1.json()
    if (!user?.id) return null

    // 2) profiles에서 role=admin 확인
    const r2 = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,role&limit=1`,
      { headers: H() }
    )
    const profiles = await r2.json()
    if (!Array.isArray(profiles) || profiles.length === 0) return null
    if (profiles[0].role !== 'admin') return null
    return user.id
  } catch {
    return null
  }
}

export async function handleAdminAction(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })

  const auth  = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''

  // 인증: CRON_SECRET 직접 일치 OR admin JWT
  const isCron     = token === CRON_SECRET
  const adminUserId = isCron ? null : await verifyAdmin(token)

  if (!isCron && !adminUserId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
  }

  let body
  try { body = await req.json() }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS }) }

  const { action, id, data } = body

  try {
    switch (action) {

      // ── 회원 정지 / 해제 ─────────────────────────────────────────
      case 'ban_user':
      case 'ban_user_force': {
        const banned = data?.banned === true
        const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${id}`, {
          method: 'PATCH', headers: H(),
          body: JSON.stringify({ is_banned: banned }),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'ban_user', id, banned })
      }

      // ── 역할 변경 ───────────────────────────────────────────────
      case 'change_role':
      case 'change_role_force': {
        const role = data?.role
        if (!['reader','writer','admin'].includes(role)) throw new Error('유효하지 않은 역할')
        const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${id}`, {
          method: 'PATCH', headers: H(),
          body: JSON.stringify({ role }),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'change_role', id, role })
      }

      // ── 구독자 삭제 ─────────────────────────────────────────────
      case 'delete_subscriber': {
        const r = await fetch(`${SB_URL}/rest/v1/newsletter_subscribers?id=eq.${id}`, {
          method: 'DELETE', headers: H(),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'delete_subscriber', id })
      }

      // ── 아티클 삭제 ─────────────────────────────────────────────
      case 'delete_article': {
        const r = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${id}`, {
          method: 'DELETE', headers: H(),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'delete_article', id })
      }

      // ── 공지글 게시 (RLS 우회, service_role) ─────────────────────
      case 'post_notice': {
        const { title, content, tags, author_id } = data || {}
        if (!title || !content || !author_id) throw new Error('title, content, author_id 필수')
        const r = await fetch(`${SB_URL}/rest/v1/community_posts`, {
          method: 'POST',
          headers: { ...H(), Prefer: 'return=representation' },
          body: JSON.stringify({
            title, content,
            post_type: 'notice',
            author_id,
            tags: tags || [],
            is_pinned: true,
            is_deleted: false,
            created_at: new Date().toISOString(),
          }),
        })
        const txt = await r.text()
        if (r.status !== 201) throw new Error(`DB 오류 ${r.status}: ${txt.slice(0,120)}`)
        const d = JSON.parse(txt)
        return ok({ action: 'post_notice', id: d?.[0]?.id })
      }

      // ── 공지글 소프트 삭제 ───────────────────────────────────────
      case 'delete_notice': {
        const r = await fetch(`${SB_URL}/rest/v1/community_posts?id=eq.${id}`, {
          method: 'PATCH', headers: H(),
          body: JSON.stringify({ is_deleted: true, is_pinned: false }),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'delete_notice', id })
      }

      // ── 신고 처리 (RLS 우회 필수) ─────────────────────────────────
      // id: report.id
      // data.action: 'delete_content' | 'resolved' | 'dismissed'
      // data.target_type: 'post' | 'comment'
      // data.target_id: uuid
      case 'handle_report': {
        const { action: reportAction, target_type, target_id } = data || {}
        if (!id) throw new Error('report id 필수')

        // Step 1 — 콘텐츠 삭제
        if (reportAction === 'delete_content') {
          if (target_type === 'post') {
            const r1 = await fetch(
              `${SB_URL}/rest/v1/community_posts?id=eq.${target_id}`,
              { method: 'PATCH', headers: H(), body: JSON.stringify({ is_deleted: true }) }
            )
            if (!r1.ok && r1.status !== 204) {
              const t = await r1.text()
              throw new Error(`게시글 삭제 오류 ${r1.status}: ${t.slice(0,80)}`)
            }
          } else {
            // 댓글: 소프트 삭제 → 실패 시 하드 삭제
            const r2 = await fetch(
              `${SB_URL}/rest/v1/comments?id=eq.${target_id}`,
              { method: 'PATCH', headers: H(), body: JSON.stringify({ is_deleted: true }) }
            )
            if (!r2.ok && r2.status !== 204) {
              const r3 = await fetch(
                `${SB_URL}/rest/v1/comments?id=eq.${target_id}`,
                { method: 'DELETE', headers: H() }
              )
              if (!r3.ok && r3.status !== 204) {
                const t = await r3.text()
                throw new Error(`댓글 삭제 오류 ${r3.status}: ${t.slice(0,80)}`)
              }
            }
          }
        }

        // Step 2 — reports 상태 업데이트 (resolved_at 포함 시도, 없으면 status만)
        const newStatus = reportAction === 'dismissed' ? 'dismissed' : 'resolved'

        const patchWithResolvedAt = await fetch(
          `${SB_URL}/rest/v1/reports?id=eq.${id}`,
          {
            method: 'PATCH', headers: H(),
            body: JSON.stringify({ status: newStatus, resolved_at: new Date().toISOString() }),
          }
        )
        if (!patchWithResolvedAt.ok && patchWithResolvedAt.status !== 204) {
          // resolved_at 컬럼 없을 수 있음 → status만 재시도
          const patchStatusOnly = await fetch(
            `${SB_URL}/rest/v1/reports?id=eq.${id}`,
            { method: 'PATCH', headers: H(), body: JSON.stringify({ status: newStatus }) }
          )
          if (!patchStatusOnly.ok && patchStatusOnly.status !== 204) {
            const t = await patchStatusOnly.text()
            throw new Error(`신고 상태 업데이트 오류 ${patchStatusOnly.status}: ${t.slice(0,80)}`)
          }
        }

        return ok({
          action: 'handle_report',
          report_id: id,
          report_status: newStatus,
          content_deleted: reportAction === 'delete_content',
          target_type,
          target_id,
        })
      }

      // ── 커뮤니티 게시글/댓글 삭제 (관리자용 직접 삭제) ──────────
      case 'delete_post': {
        const r = await fetch(`${SB_URL}/rest/v1/community_posts?id=eq.${id}`, {
          method: 'PATCH', headers: H(),
          body: JSON.stringify({ is_deleted: true }),
        })
        if (!r.ok && r.status !== 204) throw new Error(`DB 오류 ${r.status}`)
        return ok({ action: 'delete_post', id })
      }

      case 'delete_comment': {
        // 소프트 삭제 시도 → 실패 시 하드 삭제
        const r1 = await fetch(`${SB_URL}/rest/v1/comments?id=eq.${id}`, {
          method: 'PATCH', headers: H(),
          body: JSON.stringify({ is_deleted: true }),
        })
        if (!r1.ok && r1.status !== 204) {
          const r2 = await fetch(`${SB_URL}/rest/v1/comments?id=eq.${id}`, {
            method: 'DELETE', headers: H(),
          })
          if (!r2.ok && r2.status !== 204) throw new Error(`DB 오류 ${r2.status}`)
        }
        return ok({ action: 'delete_comment', id })
      }

      default:
        return new Response(
          JSON.stringify({ error: `알 수 없는 action: ${action}` }),
          { status: 400, headers: CORS }
        )
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
}

function ok(data) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200, headers: { 'Content-Type': 'application/json', ...CORS }
  })
}
