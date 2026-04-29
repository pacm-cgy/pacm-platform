/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/db-setup-staff.js — staff_chat_messages 테이블 초기화 v2       ║
 * ║                                                                      ║
 * ║  GET  : 테이블 존재 여부 확인 + manual SQL 반환                     ║
 * ║  POST : 테이블 생성 시도 (admin JWT / CRON_SECRET 인증)             ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
export const config = { runtime: 'edge' }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const H = () => ({
  apikey:         SB_KEY,
  Authorization:  `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (d, s = 200) =>
  new Response(JSON.stringify(d, null, 2), {
    status: s, headers: { 'Content-Type': 'application/json', ...CORS },
  })

// ── 테이블 존재 확인 ─────────────────────────────────────────────────
async function tableExists() {
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/staff_chat_messages?limit=1&select=id`,
      { headers: H() }
    )
    return r.status !== 404 && r.status !== 400
  } catch { return false }
}

// ── 테이블 생성 SQL (단일 문장들로 분리) ──────────────────────────────
const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS public.staff_chat_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room          text        NOT NULL DEFAULT 'general',
  sender_key    text        NOT NULL,
  sender_name   text        NOT NULL,
  sender_emoji  text,
  sender_color  text,
  sender_team   text,
  message       text        NOT NULL CHECK (char_length(message) <= 2000),
  msg_type      text        NOT NULL DEFAULT 'chat',
  reply_to      uuid        REFERENCES public.staff_chat_messages(id) ON DELETE SET NULL,
  is_deleted    boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
)`

const CREATE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_scm_room_time ON public.staff_chat_messages(room, created_at DESC)`
const CREATE_INDEX2_SQL = `CREATE INDEX IF NOT EXISTS idx_scm_sender ON public.staff_chat_messages(sender_key)`
const ENABLE_RLS_SQL = `ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY`
const DROP_POLICY1_SQL = `DROP POLICY IF EXISTS scm_service_all ON public.staff_chat_messages`
const DROP_POLICY2_SQL = `DROP POLICY IF EXISTS scm_admin_all ON public.staff_chat_messages`
const DROP_POLICY3_SQL = `DROP POLICY IF EXISTS scm_admin_read ON public.staff_chat_messages`
const DROP_POLICY4_SQL = `DROP POLICY IF EXISTS scm_admin_write ON public.staff_chat_messages`
const CREATE_POLICY1_SQL = `CREATE POLICY scm_service_all ON public.staff_chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true)`
const CREATE_POLICY2_SQL = `CREATE POLICY scm_admin_all ON public.staff_chat_messages FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))`

// Admin에 표시할 전체 manual SQL
const MANUAL_SQL = `-- Supabase SQL Editor에서 실행하세요
CREATE TABLE IF NOT EXISTS public.staff_chat_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room          text        NOT NULL DEFAULT 'general',
  sender_key    text        NOT NULL,
  sender_name   text        NOT NULL,
  sender_emoji  text,
  sender_color  text,
  sender_team   text,
  message       text        NOT NULL CHECK (char_length(message) <= 2000),
  msg_type      text        NOT NULL DEFAULT 'chat',
  reply_to      uuid        REFERENCES public.staff_chat_messages(id) ON DELETE SET NULL,
  is_deleted    boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scm_room_time ON public.staff_chat_messages(room, created_at DESC);
ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scm_service_all ON public.staff_chat_messages;
CREATE POLICY scm_service_all ON public.staff_chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS scm_admin_all ON public.staff_chat_messages;
CREATE POLICY scm_admin_all ON public.staff_chat_messages FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));`

// ── profiles 테이블 컬럼 확인 및 추가 ────────────────────────────────
const ALTER_PROFILES_SQL = `ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_ai_account boolean NOT NULL DEFAULT false`
const ALTER_PROFILES_SQL2 = `ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_locked boolean NOT NULL DEFAULT false`

// ── admin JWT 확인 ────────────────────────────────────────────────────
async function checkAdminJWT(token) {
  if (!token || !SB_URL || !SB_KEY) return false
  try {
    const r = await fetch(`${SB_URL}/rest/v1/profiles?select=role&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return false
    const rows = await r.json().catch(() => [])
    return Array.isArray(rows) && rows[0]?.role === 'admin'
  } catch { return false }
}

// ── Supabase Management API로 SQL 실행 ───────────────────────────────
function getRef(url) {
  return url?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
}

async function execViaManagement(sql) {
  const ref = getRef(SB_URL)
  if (!ref) return { ok: false, status: 0, note: 'no project ref' }
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query: sql }),
  })
  const text = await r.text().catch(() => '')
  return { ok: r.ok, status: r.status, resp: text.slice(0, 300) }
}

// ── RPC exec_sql 호출 ────────────────────────────────────────────────
async function execViaRPC(sql) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
    method:  'POST',
    headers: { ...H(), Prefer: 'return=minimal' },
    body:    JSON.stringify({ sql }),
  })
  return { ok: r.ok, status: r.status }
}

// ── 단일 SQL 실행 (fallback 순서: Management API → exec_sql RPC) ──────
async function execSQL(sql) {
  try {
    const mgmt = await execViaManagement(sql)
    if (mgmt.ok) return { ...mgmt, method: 'management' }
  } catch (_) {}
  try {
    const rpc = await execViaRPC(sql)
    if (rpc.ok || rpc.status === 204) return { ...rpc, method: 'exec_sql_rpc' }
  } catch (_) {}
  return { ok: false, status: 0, method: 'none', note: 'all methods failed' }
}

// ── 여러 SQL 문을 순서대로 실행 ──────────────────────────────────────
async function execSQLStatements(statements) {
  const results = []
  for (const sql of statements) {
    const r = await execSQL(sql.trim())
    results.push({ sql: sql.slice(0, 60) + '...', ...r })
    // 테이블 생성 실패 시 중단
    if (!r.ok && sql.toUpperCase().includes('CREATE TABLE')) break
  }
  return results
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  if (req.method === 'GET') {
    const exists = await tableExists()
    return json({
      ok:           true,
      engine:       'db-setup-staff-v2',
      table_exists: exists,
      table:        'staff_chat_messages',
      description:  '직원 전용 채팅방 메시지 테이블',
      columns:      ['id','room','sender_key','sender_name','sender_emoji','sender_color','sender_team','message','msg_type','reply_to','is_deleted','created_at'],
      rls_policy:   '관리자(admin) 또는 service_role 접근 허용',
      // 테이블 없을 때 Admin이 SQL Editor에서 직접 실행할 수 있는 SQL
      manual_sql:   exists ? null : MANUAL_SQL,
      supabase_url: exists ? null : 'https://supabase.com/dashboard/project/itcbantrpkjpkfhnriom/sql',
    })
  }

  if (req.method === 'POST') {
    const authHeader  = req.headers.get('authorization') || ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const isCron =
      authHeader === `Bearer ${CRON_SECRET}` ||
      req.headers.get('x-cron-secret') === CRON_SECRET ||
      req.headers.get('x-vercel-cron') === '1'
    const isAdminJWT = (!isCron && bearerToken)
      ? await checkAdminJWT(bearerToken) : false
    const isAuthed = isCron || isAdminJWT
    if (!isAuthed) return json({ error: 'Unauthorized' }, 401)
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing env vars' }, 500)

    // 이미 테이블이 있으면 스킵
    const alreadyExists = await tableExists()
    if (alreadyExists) {
      return json({
        ok:           true,
        engine:       'db-setup-staff-v2',
        timestamp:    new Date().toISOString(),
        table_exists: true,
        message:      '✅ staff_chat_messages 테이블이 이미 존재합니다',
      })
    }

    // SQL 문들을 순서대로 실행
    const statements = [
      ALTER_PROFILES_SQL,
      ALTER_PROFILES_SQL2,
      CREATE_TABLE_SQL,
      CREATE_INDEX_SQL,
      CREATE_INDEX2_SQL,
      ENABLE_RLS_SQL,
      DROP_POLICY1_SQL,
      DROP_POLICY2_SQL,
      DROP_POLICY3_SQL,
      DROP_POLICY4_SQL,
      CREATE_POLICY1_SQL,
      CREATE_POLICY2_SQL,
    ]

    const stmtResults = await execSQLStatements(statements)

    // 실행 후 테이블 존재 확인
    const exists = await tableExists()

    return json({
      ok:           exists,
      engine:       'db-setup-staff-v2',
      timestamp:    new Date().toISOString(),
      table_exists: exists,
      stmt_results: stmtResults,
      message:      exists
        ? '✅ staff_chat_messages 테이블 생성 완료!'
        : '❌ 자동 생성 실패 — 아래 SQL을 Supabase SQL Editor에서 직접 실행하세요',
      manual_sql:   exists ? null : MANUAL_SQL,
      supabase_url: exists ? null : 'https://supabase.com/dashboard/project/itcbantrpkjpkfhnriom/sql',
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
