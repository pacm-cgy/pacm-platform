/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/db-setup-staff.js — staff_chat_messages 테이블 초기화          ║
 * ║                                                                      ║
 * ║  GET  : 테이블 존재 여부 확인                                       ║
 * ║  POST : 테이블 생성 + RLS 정책 설정 (CRON_SECRET 필요)             ║
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

// ── 테이블 생성 SQL ───────────────────────────────────────────────────
const CREATE_SQL = `
-- staff_chat_messages 테이블
CREATE TABLE IF NOT EXISTS staff_chat_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room          text        NOT NULL DEFAULT 'general',
  sender_key    text        NOT NULL,
  sender_name   text        NOT NULL,
  sender_emoji  text,
  sender_color  text,
  sender_team   text,
  message       text        NOT NULL CHECK (char_length(message) <= 2000),
  msg_type      text        NOT NULL DEFAULT 'chat',
  reply_to      uuid        REFERENCES staff_chat_messages(id) ON DELETE SET NULL,
  is_deleted    boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_scm_room_time
  ON staff_chat_messages(room, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scm_sender
  ON staff_chat_messages(sender_key);

-- RLS 활성화
ALTER TABLE staff_chat_messages ENABLE ROW LEVEL SECURITY;

-- 기존 정책 제거 후 재생성
DROP POLICY IF EXISTS scm_admin_read  ON staff_chat_messages;
DROP POLICY IF EXISTS scm_admin_write ON staff_chat_messages;

-- 관리자(role = 'admin') 또는 AI 계정(is_ai_account = true)만 접근
CREATE POLICY scm_admin_read ON staff_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR is_ai_account = true)
    )
  );

CREATE POLICY scm_admin_write ON staff_chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR is_ai_account = true)
    )
  );
`

// ── profiles 테이블 컬럼 확인 및 추가 ────────────────────────────────
const ALTER_PROFILES_SQL = `
-- is_ai_account 컬럼 (없으면 추가)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_ai_account boolean NOT NULL DEFAULT false;

-- admin_locked 컬럼 (없으면 추가) — AI 계정 role 변경 방지 플래그
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS admin_locked boolean NOT NULL DEFAULT false;
`

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

async function execSQLViaManagement(sql) {
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

// ── Supabase RPC exec_sql 호출 (fallback) ────────────────────────────
async function execSQL(sql) {
  // 1차: Management API
  const mgmt = await execSQLViaManagement(sql)
  if (mgmt.ok) return mgmt
  // 2차: RPC exec_sql (있는 경우)
  const r = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
    method:  'POST',
    headers: { ...H(), Prefer: 'return=minimal' },
    body:    JSON.stringify({ sql }),
  })
  return { ok: r.ok, status: r.status }
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  if (req.method === 'GET') {
    const exists = await tableExists()
    return json({
      ok:             true,
      engine:         'db-setup-staff-v1',
      table_exists:   exists,
      table:          'staff_chat_messages',
      description:    '직원 전용 채팅방 메시지 테이블',
      columns:        ['id','room','sender_key','sender_name','sender_emoji','sender_color','sender_team','message','msg_type','reply_to','is_deleted','created_at'],
      rls_policy:     '관리자(admin) 또는 AI 계정(is_ai_account) 접근 허용',
    })
  }

  if (req.method === 'POST') {
    const authHeader  = req.headers.get('authorization') || ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const isCron =
      authHeader === `Bearer ${CRON_SECRET}` ||
      req.headers.get('x-cron-secret') === CRON_SECRET
    const isAdminJWT = (!isCron && bearerToken)
      ? await checkAdminJWT(bearerToken) : false
    const isAuthed = isCron || isAdminJWT
    if (!isAuthed) return json({ error: 'Unauthorized' }, 401)
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing env' }, 500)

    const results = {}

    // 1. profiles 컬럼 추가
    const profilesR = await execSQL(ALTER_PROFILES_SQL)
    results.profiles_alter = profilesR

    // 2. staff_chat_messages 테이블 생성
    const tableR = await execSQL(CREATE_SQL)
    results.table_create = tableR

    // 3. 테이블 존재 확인
    const exists = await tableExists()
    results.table_exists = exists

    return json({
      ok:        tableR.ok,
      engine:    'db-setup-staff-v1',
      timestamp: new Date().toISOString(),
      results,
      message:   exists
        ? '✅ staff_chat_messages 테이블 준비 완료'
        : '❌ 테이블 생성 실패 — Supabase SQL Editor에서 직접 실행 필요',
      manual_sql_hint: !exists ? 'Supabase Dashboard → SQL Editor → CREATE TABLE staff_chat_messages ...' : null,
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
