/**
 * api/report.js
 * Insightship 신고 처리 API v1.0
 *
 * POST /api/report  → 신고 접수
 *   body: { target_type: 'post'|'comment'|'article'|'user', target_id, reason }
 *   Authorization: Bearer <access_token>
 *
 * GET  /api/report  → 관리자 전용 신고 목록 조회
 *   ?status=pending|resolved|dismissed&limit=50&offset=0
 *   Authorization: Bearer <access_token>  (admin만)
 */
export const config = { runtime: 'edge' }

const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// Supabase JWT로 유저 확인
async function getUser(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${token}`,
      },
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

// 관리자 여부 확인
async function isAdmin(userId) {
  if (!userId) return false
  const r = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=role&limit=1`,
    {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
    }
  )
  const d = await r.json().catch(() => [])
  return Array.isArray(d) && d[0]?.role === 'admin'
}

const H = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const authHeader = req.headers.get('authorization')

  // ── POST: 신고 접수 ────────────────────────────────────────────────
  if (req.method === 'POST') {
    const user = await getUser(authHeader)
    if (!user?.id) return json({ error: '로그인이 필요합니다' }, 401)

    let body
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

    const { target_type, target_id, reason } = body || {}

    // 입력 검증
    if (!target_type || !target_id || !reason) {
      return json({ error: 'target_type, target_id, reason 필수' }, 400)
    }
    if (!['post', 'comment', 'article', 'user'].includes(target_type)) {
      return json({ error: '유효하지 않은 target_type' }, 400)
    }
    if (typeof reason !== 'string' || reason.trim().length < 10) {
      return json({ error: '신고 사유는 10자 이상 입력해주세요' }, 400)
    }
    if (reason.trim().length > 500) {
      return json({ error: '신고 사유는 500자 이하입니다' }, 400)
    }

    // 중복 신고 방지 (같은 유저가 같은 대상에 이미 pending 신고 있으면 차단)
    const dupCheck = await fetch(
      `${SB_URL}/rest/v1/reports?reporter_id=eq.${user.id}&target_id=eq.${target_id}&status=eq.pending&select=id&limit=1`,
      { headers: H() }
    )
    const dup = await dupCheck.json().catch(() => [])
    if (Array.isArray(dup) && dup.length > 0) {
      return json({ error: '이미 신고 접수된 대상입니다. 처리 중입니다.' }, 409)
    }

    // 자기 자신 신고 방지 (게시글/댓글 작성자 확인)
    if (target_type === 'post') {
      const postR = await fetch(
        `${SB_URL}/rest/v1/community_posts?id=eq.${target_id}&select=author_id&limit=1`,
        { headers: H() }
      )
      const post = await postR.json().catch(() => [])
      if (post[0]?.author_id === user.id) {
        return json({ error: '자신의 게시글은 신고할 수 없습니다' }, 400)
      }
    } else if (target_type === 'comment') {
      const commentR = await fetch(
        `${SB_URL}/rest/v1/comments?id=eq.${target_id}&select=author_id&limit=1`,
        { headers: H() }
      )
      const comment = await commentR.json().catch(() => [])
      if (comment[0]?.author_id === user.id) {
        return json({ error: '자신의 댓글은 신고할 수 없습니다' }, 400)
      }
    }

    // 신고 삽입
    const insertR = await fetch(`${SB_URL}/rest/v1/reports`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'return=representation' },
      body: JSON.stringify({
        reporter_id: user.id,
        target_type,
        target_id,
        reason: reason.trim(),
        status: 'pending',
        created_at: new Date().toISOString(),
      }),
    })

    if (insertR.status !== 201 && insertR.status !== 200) {
      const err = await insertR.text()
      // reports 테이블 없으면 안내
      if (err.includes('does not exist') || err.includes('relation')) {
        return json({ error: '신고 테이블이 존재하지 않습니다. DB 설정이 필요합니다.', setup_needed: true }, 500)
      }
      return json({ error: `DB 오류: ${err.slice(0, 100)}` }, 500)
    }

    const inserted = await insertR.json().catch(() => [{}])
    return json({
      ok: true,
      message: '신고가 접수되었습니다. 관리자가 검토 후 처리합니다.',
      report_id: inserted?.[0]?.id,
    })
  }

  // ── GET: 관리자 신고 목록 조회 ─────────────────────────────────────
  if (req.method === 'GET') {
    const user = await getUser(authHeader)
    if (!user?.id) return json({ error: '로그인이 필요합니다' }, 401)

    const admin = await isAdmin(user.id)
    if (!admin) return json({ error: '관리자 권한이 필요합니다' }, 403)

    const url = new URL(req.url)
    const status = url.searchParams.get('status') || 'all'
    const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0)

    let query = `${SB_URL}/rest/v1/reports?select=id,target_type,target_id,reason,status,created_at,resolved_at,reporter_id,profiles!reporter_id(display_name,username,avatar_url)&order=created_at.desc&limit=${limit}&offset=${offset}`
    if (status !== 'all') query += `&status=eq.${status}`

    const r = await fetch(query, {
      headers: { ...H(), Prefer: 'count=exact' },
    })
    const reports = await r.json().catch(() => [])
    const total = parseInt(r.headers.get('content-range')?.split('/')[1] || '0')

    // 통계
    const [pendingR, resolvedR, dismissedR] = await Promise.allSettled([
      fetch(`${SB_URL}/rest/v1/reports?status=eq.pending&select=id&limit=1`, { headers: { ...H(), Prefer: 'count=exact' } }),
      fetch(`${SB_URL}/rest/v1/reports?status=eq.resolved&select=id&limit=1`, { headers: { ...H(), Prefer: 'count=exact' } }),
      fetch(`${SB_URL}/rest/v1/reports?status=eq.dismissed&select=id&limit=1`, { headers: { ...H(), Prefer: 'count=exact' } }),
    ])
    const getCount = r => r.status === 'fulfilled'
      ? parseInt(r.value.headers?.get?.('content-range')?.split('/')?.[1] || '0') : 0

    return json({
      reports: Array.isArray(reports) ? reports : [],
      total,
      stats: {
        pending: getCount(pendingR),
        resolved: getCount(resolvedR),
        dismissed: getCount(dismissedR),
      },
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
