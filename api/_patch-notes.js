/**
 * Insightship — Patch Notes API v1.0
 * ─────────────────────────────────────────────────────────────────────
 * 2주 1회 자동 패치노트 생성 + 관리자 수동 작성/수정/삭제
 *
 * 엔드포인트:
 *  GET  /api/patch-notes               — 전체 목록 (공개)
 *  GET  /api/patch-notes?id=xxx        — 단건 조회 (공개)
 *  POST /api/patch-notes  action=publish  — 수동 게시 (admin)
 *  POST /api/patch-notes  action=auto     — 자동 생성 (cron)
 *  PATCH /api/patch-notes?id=xxx       — 수정 (admin)
 *  DELETE /api/patch-notes?id=xxx      — 삭제 (admin)
 *
 * 자동 생성 스케줄: vercel.json cron → 격주 월요일 09:00 KST
 * 자동 생성 로직: ai_operations_log + work_logs 집계 → 변경 요약
 */



const SB_URL      = process.env.SUPABASE_URL         || ''
const SB_KEY      = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
const CRON_SECRET = process.env.CRON_SECRET          || ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cron-Secret',
}
const json = (d, s = 200) => new Response(JSON.stringify(d),
  { status: s, headers: { 'Content-Type': 'application/json', ...CORS } })

const SBH = () => ({
  'Content-Type':  'application/json',
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Prefer':        'return=representation',
})

// ── 관리자 JWT 검증 ───────────────────────────────────────────────────
async function verifyAdmin(token) {
  if (!token || !SB_URL || !SB_KEY) return null
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return null
    const u = await r.json()
    if (!u?.id) return null
    const pr = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${u.id}&select=role,username,display_name`, {
      headers: SBH(),
    })
    const rows = pr.ok ? await pr.json() : []
    if (!rows[0] || rows[0].role !== 'admin') return null
    return rows[0]
  } catch { return null }
}

// ── 인증 헬퍼 ─────────────────────────────────────────────────────────
async function getAuth(req) {
  const cronHeader = req.headers.get('x-cron-secret') || ''
  const authHeader = req.headers.get('authorization')  || ''
  const isCron  = CRON_SECRET && cronHeader === CRON_SECRET
  const jwt     = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const admin   = jwt ? await verifyAdmin(jwt) : null
  return { isCron, admin, isAuthed: isCron || !!admin }
}

// ── 패치노트 목록 조회 ────────────────────────────────────────────────
async function getList(limit = 20, offset = 0) {
  const r = await fetch(
    `${SB_URL}/rest/v1/patch_notes?is_published=eq.true&select=*&order=published_at.desc&limit=${limit}&offset=${offset}`,
    { headers: SBH() }
  )
  return r.ok ? await r.json() : []
}

// ── 단건 조회 ─────────────────────────────────────────────────────────
async function getOne(id) {
  const r = await fetch(
    `${SB_URL}/rest/v1/patch_notes?id=eq.${id}&select=*`,
    { headers: SBH() }
  )
  const rows = r.ok ? await r.json() : []
  return rows[0] || null
}

// ── 패치노트 삽입 ─────────────────────────────────────────────────────
async function insertNote(data) {
  const r = await fetch(`${SB_URL}/rest/v1/patch_notes`, {
    method:  'POST',
    headers: SBH(),
    body:    JSON.stringify(data),
  })
  if (!r.ok) { const e = await r.text(); return { ok: false, error: e } }
  const rows = await r.json()
  return { ok: true, row: rows[0] || rows }
}

// ── 패치노트 수정 ─────────────────────────────────────────────────────
async function updateNote(id, data) {
  const r = await fetch(`${SB_URL}/rest/v1/patch_notes?id=eq.${id}`, {
    method:  'PATCH',
    headers: SBH(),
    body:    JSON.stringify(data),
  })
  if (!r.ok) { const e = await r.text(); return { ok: false, error: e } }
  const rows = await r.json()
  return { ok: true, row: rows[0] || rows }
}

// ── 패치노트 삭제 (soft) ──────────────────────────────────────────────
async function deleteNote(id) {
  const r = await fetch(`${SB_URL}/rest/v1/patch_notes?id=eq.${id}`, {
    method:  'PATCH',
    headers: SBH(),
    body:    JSON.stringify({ is_published: false, deleted_at: new Date().toISOString() }),
  })
  return { ok: r.ok }
}

// ── KST 날짜 문자열 ───────────────────────────────────────────────────
function kstDateStr(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600_000)
    .toISOString().slice(0, 10)
}

// ── 격주 여부 확인 (ISO week 기준 짝수 주) ───────────────────────────
function isBiweeklyWeek() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const week  = Math.ceil(((now - start) / 86400_000 + start.getDay() + 1) / 7)
  return week % 2 === 0   // 짝수 주 월요일에만 실행
}

// ── 최근 2주 운영 로그 집계 ───────────────────────────────────────────
async function collectRecentOpsLogs() {
  const since = new Date(Date.now() - 14 * 86400_000).toISOString()
  const r = await fetch(
    `${SB_URL}/rest/v1/ai_operations_log?created_at=gt.${encodeURIComponent(since)}&select=task_type,result,engine,details,created_at&order=created_at.desc&limit=200`,
    { headers: SBH() }
  )
  return r.ok ? await r.json() : []
}

// ── 최근 변경 커밋 로그(work_logs) 집계 ─────────────────────────────
async function collectRecentWorkLogs() {
  const since = new Date(Date.now() - 14 * 86400_000).toISOString()
  const r = await fetch(
    `${SB_URL}/rest/v1/work_logs?created_at=gt.${encodeURIComponent(since)}&select=task_type,summary,worker_key,created_at&order=created_at.desc&limit=100`,
    { headers: SBH() }
  )
  return r.ok ? await r.json() : []
}

// ── 버전 번호 자동 계산 ───────────────────────────────────────────────
async function getNextVersion() {
  const r = await fetch(
    `${SB_URL}/rest/v1/patch_notes?select=version&order=published_at.desc&limit=1`,
    { headers: SBH() }
  )
  const rows = r.ok ? await r.json() : []
  if (!rows[0]?.version) return 'v1.0'
  // "v1.4" → "v1.5"
  const m = rows[0].version.match(/^v(\d+)\.(\d+)$/)
  if (!m) return 'v1.0'
  return `v${m[1]}.${parseInt(m[2], 10) + 1}`
}

// ── 자동 패치노트 생성 ────────────────────────────────────────────────
async function autoGeneratePatchNote() {
  const [opsLogs, workLogs] = await Promise.all([
    collectRecentOpsLogs(),
    collectRecentWorkLogs(),
  ])

  // 태스크 타입별 집계
  const opsSummary = {}
  for (const log of opsLogs) {
    const key = log.task_type || 'unknown'
    if (!opsSummary[key]) opsSummary[key] = { success: 0, error: 0, skip: 0 }
    opsSummary[key][log.result]   = (opsSummary[key][log.result]   || 0) + 1
  }

  // 주요 작업 변경 요약 추출
  const workSummary = {}
  for (const log of workLogs) {
    const key = log.task_type || 'general'
    if (!workSummary[key]) workSummary[key] = []
    if (log.summary) workSummary[key].push(log.summary)
  }

  // 마크다운 본문 생성
  const version = await getNextVersion()
  const dateStr = kstDateStr()
  const lines   = []

  lines.push(`## ${version} 패치노트 (${dateStr})`)
  lines.push('')
  lines.push('### 🤖 AI 자동 운영 현황 (최근 2주)')
  lines.push('')

  const opsKeys = Object.keys(opsSummary)
  if (opsKeys.length === 0) {
    lines.push('- 최근 2주간 운영 로그 없음')
  } else {
    for (const key of opsKeys) {
      const s = opsSummary[key]
      const total = (s.success || 0) + (s.error || 0) + (s.skip || 0)
      const rate  = total > 0 ? Math.round((s.success || 0) / total * 100) : 0
      lines.push(`- **${key}**: 총 ${total}회 실행 | 성공 ${s.success || 0}회 | 오류 ${s.error || 0}회 | 성공률 ${rate}%`)
    }
  }

  lines.push('')
  lines.push('### 🔧 주요 변경 사항')
  lines.push('')

  const workKeys = Object.keys(workSummary)
  if (workKeys.length === 0) {
    lines.push('- 이번 주기 자동 감지된 변경 없음')
  } else {
    for (const key of workKeys) {
      lines.push(`**[${key}]**`)
      for (const summary of workSummary[key].slice(0, 3)) {
        lines.push(`- ${summary}`)
      }
    }
  }

  lines.push('')
  lines.push('### 📊 시스템 안정성')
  lines.push('')
  const totalOps    = opsLogs.length
  const successOps  = opsLogs.filter(l => l.result === 'success').length
  const errorOps    = opsLogs.filter(l => l.result === 'error').length
  const overallRate = totalOps > 0 ? Math.round(successOps / totalOps * 100) : 100
  lines.push(`- 전체 AI 작업 실행: **${totalOps}회**`)
  lines.push(`- 성공: ${successOps}회 / 오류: ${errorOps}회`)
  lines.push(`- 전체 성공률: **${overallRate}%**`)

  lines.push('')
  lines.push('---')
  lines.push('*이 패치노트는 AI 시스템이 자동으로 작성했습니다.*')

  const body = lines.join('\n')

  // 태그 자동 추출
  const tags = ['자동생성', 'AI운영']
  if (errorOps > 0) tags.push('버그수정')
  if (workKeys.length > 0) tags.push('기능개선')

  // 제목 생성
  const title = `${version} — AI 자동 패치노트 (${dateStr})`

  const result = await insertNote({
    version,
    title,
    body,
    tags,
    is_published:  true,
    is_auto:       true,
    published_at:  new Date().toISOString(),
    created_at:    new Date().toISOString(),
    author:        'SYSTEM',
  })

  return { ...result, version, title, ops_count: totalOps, work_count: workLogs.length }
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────
export async function handlePatchNotes(req) {
  if (req.method === 'OPTIONS') return json({}, 204)
  if (!SB_URL || !SB_KEY) return json({ error: 'Server misconfiguration' }, 500)

  const url  = new URL(req.url)
  const id   = url.searchParams.get('id')

  // ────────────────────────────────────────────────────────────────
  // GET — 공개 목록 / 단건
  // ────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (id) {
      const note = await getOne(id)
      if (!note) return json({ error: 'Not found' }, 404)
      return json({ ok: true, note })
    }
    const limit  = Math.min(parseInt(url.searchParams.get('limit')  || '20', 10), 100)
    const offset = parseInt(url.searchParams.get('offset') || '0',  10)
    const list   = await getList(limit, offset)
    return json({ ok: true, notes: list, total: list.length })
  }

  // ────────────────────────────────────────────────────────────────
  // POST — 수동 게시 / 자동 생성
  // ────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { isCron, admin, isAuthed } = await getAuth(req)
    if (!isAuthed) return json({ error: 'Unauthorized' }, 401)

    let body
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

    const action = body.action || 'publish'

    // 자동 생성 (cron 전용)
    if (action === 'auto') {
      if (!isCron && !admin) return json({ error: 'Cron or Admin required' }, 403)

      // 격주 체크 — 강제 플래그 없을 때만
      if (!body.force && !isBiweeklyWeek()) {
        return json({ ok: true, skipped: true, reason: '비격주 (짝수 주가 아님)', engine: 'patch-notes-auto-v1' })
      }

      const result = await autoGeneratePatchNote()
      return json({ ok: result.ok, engine: 'patch-notes-auto-v1', ...result })
    }

    // 수동 게시 (admin 전용)
    if (action === 'publish') {
      if (!admin) return json({ error: 'Admin required for manual publish' }, 403)

      const { title, body: noteBody, version, tags, changes } = body
      if (!title || !noteBody) return json({ error: 'title and body required' }, 400)

      const ver = version || await getNextVersion()
      const result = await insertNote({
        version:      ver,
        title,
        body:         noteBody,
        tags:         tags || [],
        changes:      changes || [],
        is_published: true,
        is_auto:      false,
        published_at: new Date().toISOString(),
        created_at:   new Date().toISOString(),
        author:       admin.display_name || admin.username || 'admin',
      })
      return json({ ok: result.ok, version: ver, ...result })
    }

    return json({ error: 'Unknown action' }, 400)
  }

  // ────────────────────────────────────────────────────────────────
  // PATCH — 수정
  // ────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { admin } = await getAuth(req)
    if (!admin) return json({ error: 'Admin required' }, 401)
    if (!id) return json({ error: 'id required' }, 400)

    let body
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

    const allowed = ['title', 'body', 'tags', 'changes', 'is_published', 'version']
    const patch   = {}
    for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k]
    patch.updated_at = new Date().toISOString()

    const result = await updateNote(id, patch)
    return json({ ok: result.ok, ...result })
  }

  // ────────────────────────────────────────────────────────────────
  // DELETE — 소프트 삭제
  // ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { admin } = await getAuth(req)
    if (!admin) return json({ error: 'Admin required' }, 401)
    if (!id) return json({ error: 'id required' }, 400)

    const result = await deleteNote(id)
    return json({ ok: result.ok, deleted: id })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
