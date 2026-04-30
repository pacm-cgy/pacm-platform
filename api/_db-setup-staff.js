/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/db-setup-staff.js — staff_chat_messages 테이블 초기화 v3       ║
 * ║                                                                      ║
 * ║  GET  : 테이블 존재 여부 + manual SQL 항상 반환                     ║
 * ║  POST : exec_sql RPC 시도 → 실패 시 즉시 manual SQL + 안내 반환    ║
 * ║                                                                      ║
 * ║  v3 변경:                                                            ║
 * ║  - Management API 완전 제거 (service_role 키로 항상 401)            ║
 * ║  - exec_sql RPC 1회만 시도, 없으면 즉시 수동 안내로 전환           ║
 * ║  - GET/POST 모두 manual_sql 항상 반환 (테이블 없을 때)             ║
 * ║  - AdminPage에서 SQL 즉시 표시 + 원클릭 복사 지원                  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */


const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const SUPABASE_PROJECT_ID = 'itcbantrpkjpkfhnriom'
const SUPABASE_SQL_URL    = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/sql/new`

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

// ══════════════════════════════════════════════════════════════════════
// SQL 상수
// ══════════════════════════════════════════════════════════════════════

const MANUAL_SQL = `-- Supabase SQL Editor에서 실행하세요
-- 프로젝트: https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/sql/new

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
CREATE INDEX IF NOT EXISTS idx_scm_room_time
  ON public.staff_chat_messages(room, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scm_sender
  ON public.staff_chat_messages(sender_key);
ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scm_service_all ON public.staff_chat_messages;
CREATE POLICY scm_service_all ON public.staff_chat_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS scm_admin_all ON public.staff_chat_messages;
CREATE POLICY scm_admin_all ON public.staff_chat_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );`

// exec_sql RPC용 — 단일 트랜잭션으로 전체 DDL
const DDL_FOR_RPC = `
CREATE TABLE IF NOT EXISTS public.staff_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room text NOT NULL DEFAULT 'general',
  sender_key text NOT NULL,
  sender_name text NOT NULL,
  sender_emoji text,
  sender_color text,
  sender_team text,
  message text NOT NULL CHECK (char_length(message) <= 2000),
  msg_type text NOT NULL DEFAULT 'chat',
  reply_to uuid REFERENCES public.staff_chat_messages(id) ON DELETE SET NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scm_room_time ON public.staff_chat_messages(room, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scm_sender ON public.staff_chat_messages(sender_key);
ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scm_service_all ON public.staff_chat_messages;
CREATE POLICY scm_service_all ON public.staff_chat_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS scm_admin_all ON public.staff_chat_messages;
CREATE POLICY scm_admin_all ON public.staff_chat_messages FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
`.trim()

// ══════════════════════════════════════════════════════════════════════
// 헬퍼
// ══════════════════════════════════════════════════════════════════════

async function tableExists() {
  if (!SB_URL || !SB_KEY) return false
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/staff_chat_messages?limit=1&select=id`,
      { headers: H() }
    )
    // 200 또는 206 → 존재, 404/400/PGRST → 없음
    if (r.status === 200 || r.status === 206) return true
    if (r.status === 404 || r.status === 400) return false
    // 그 외(401 등) → 키 문제지 테이블 자체는 있을 수 있음
    return r.status < 500
  } catch { return false }
}

async function checkAdminJWT(token) {
  if (!token || !SB_URL || !SB_KEY) return false
  try {
    // 1) token으로 user.id 조회 (Supabase Auth)
    const r1 = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r1.ok) return false
    const user = await r1.json().catch(() => null)
    if (!user?.id) return false
    // 2) service_role 키로 해당 user.id의 role 확인 (RLS 우회)
    const r2 = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    )
    if (!r2.ok) return false
    const rows = await r2.json().catch(() => [])
    return Array.isArray(rows) && rows[0]?.role === 'admin'
  } catch { return false }
}

// exec_sql RPC — Supabase에 미리 만들어 둔 경우만 동작
async function tryExecSqlRpc() {
  if (!SB_URL || !SB_KEY) return { ok: false, reason: 'missing env' }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
      method:  'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body:    JSON.stringify({ sql: DDL_FOR_RPC }),
    })
    if (r.ok || r.status === 204) return { ok: true, method: 'exec_sql_rpc' }
    const body = await r.text().catch(() => '')
    return { ok: false, status: r.status, reason: body.slice(0, 200) }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}

// ══════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export async function handleDbSetupStaff(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // ── GET: 상태 확인 ────────────────────────────────────────────────
  if (req.method === 'GET') {
    const exists = await tableExists()
    return json({
      ok:           true,
      engine:       'db-setup-staff-v3',
      table_exists: exists,
      table:        'staff_chat_messages',
      // 테이블 없을 때 항상 manual_sql 반환 (AdminPage가 즉시 표시)
      manual_sql:   exists ? null : MANUAL_SQL,
      supabase_url: SUPABASE_SQL_URL,
      message:      exists
        ? '✅ staff_chat_messages 테이블 정상'
        : '⚠️ 테이블 없음 — 아래 SQL을 Supabase SQL Editor에서 실행하세요',
    })
  }

  // ── POST: 테이블 생성 시도 ────────────────────────────────────────
  if (req.method === 'POST') {
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env vars' }, 500)

    const authHeader  = req.headers.get('authorization') || ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const isCron =
      authHeader === `Bearer ${CRON_SECRET}` ||
      req.headers.get('x-cron-secret') === CRON_SECRET ||
      req.headers.get('x-vercel-cron') === '1'
    const isAdminJWT = (!isCron && bearerToken)
      ? await checkAdminJWT(bearerToken) : false
    if (!isCron && !isAdminJWT) return json({ error: 'Unauthorized' }, 401)

    // 이미 존재하면 즉시 성공
    if (await tableExists()) {
      return json({
        ok:           true,
        engine:       'db-setup-staff-v3',
        table_exists: true,
        message:      '✅ staff_chat_messages 테이블이 이미 존재합니다',
        timestamp:    new Date().toISOString(),
      })
    }

    // exec_sql RPC 시도 (Supabase에 함수가 있는 경우만 성공)
    const rpcResult = await tryExecSqlRpc()

    if (rpcResult.ok) {
      // RPC 성공 → 재확인
      const nowExists = await tableExists()
      return json({
        ok:           nowExists,
        engine:       'db-setup-staff-v3',
        table_exists: nowExists,
        method:       'exec_sql_rpc',
        message:      nowExists
          ? '✅ exec_sql RPC로 테이블 생성 완료!'
          : '⚠️ RPC 실행됐으나 테이블 확인 실패 — 수동 SQL을 실행하세요',
        manual_sql:   nowExists ? null : MANUAL_SQL,
        supabase_url: SUPABASE_SQL_URL,
        timestamp:    new Date().toISOString(),
      })
    }

    // ── 모든 자동화 실패 → 즉시 수동 SQL 안내 ──────────────────────
    return json({
      ok:           false,
      engine:       'db-setup-staff-v3',
      table_exists: false,
      method:       'manual_required',
      // 실패 이유 (디버깅용)
      rpc_result:   rpcResult,
      message:      '❌ 자동 생성 불가 — Supabase SQL Editor에서 아래 SQL을 직접 실행하세요 (30초면 완료)',
      manual_sql:   MANUAL_SQL,
      supabase_url: SUPABASE_SQL_URL,
      steps: [
        `1. 아래 "SQL Editor 열기" 버튼 클릭`,
        `2. manual_sql 전체를 복사하여 SQL Editor에 붙여넣기`,
        `3. Run (F5 또는 Ctrl+Enter) 실행`,
        `4. "테이블 확인" 버튼으로 생성 확인`,
      ],
      timestamp: new Date().toISOString(),
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
