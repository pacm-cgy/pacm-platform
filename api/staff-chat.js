/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/staff-chat.js — 직원 전용 채팅방 API v2.0                      ║
 * ║                                                                      ║
 * ║  기능:                                                               ║
 * ║  - GET  ?room=general|ops|task  채팅 메시지 조회                    ║
 * ║  - POST { room, sender_key, message, msg_type }  메시지 전송        ║
 * ║  - POST { action:'ai_discuss', topic }  AI 직원 자동 토론 생성      ║
 * ║  - DELETE (관리자) 메시지 삭제                                      ║
 * ║                                                                      ║
 * ║  채팅방 종류:                                                        ║
 * ║  - general   : 전체 직원 소통방                                     ║
 * ║  - ops       : 업무 지시 & 하달 채널                               ║
 * ║  - feedback  : 피드백 검토 & 대응 채널                             ║
 * ║  - strategy  : 전략 회의 채널                                       ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
export const config = { runtime: 'edge' }

const SB_URL       = process.env.SUPABASE_URL
const SB_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET  = process.env.CRON_SECRET

const H = () => ({
  apikey:         SB_KEY,
  Authorization:  `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (d, s = 200) =>
  new Response(JSON.stringify(d, null, 2), {
    status: s, headers: { 'Content-Type': 'application/json', ...CORS },
  })

// 관리자 JWT 인증 확인
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

// ══════════════════════════════════════════════════════════════════════
// AI 직원 메타데이터 (채팅 참여자)
// ══════════════════════════════════════════════════════════════════════

const AI_STAFF = {
  ARIA:     { username:'ai_aria',     name:'ARIA',  emoji:'⚙️',  team:'운영팀',    color:'#818CF8', title:'선임 매니저' },
  NOVA:     { username:'ai_nova',     name:'NOVA',  emoji:'✍️',  team:'콘텐츠팀',  color:'#C084FC', title:'선임 매니저' },
  LUMI:     { username:'ai_lumi',     name:'LUMI',  emoji:'💡',  team:'멘토링팀',  color:'#34D399', title:'선임 매니저' },
  PULSE:    { username:'ai_pulse',    name:'PULSE', emoji:'📡',  team:'뉴스팀',    color:'#38BDF8', title:'선임 매니저' },
  TREND:    { username:'ai_trend',    name:'TREND', emoji:'📊',  team:'분석팀',    color:'#FB923C', title:'선임 매니저' },
  SAGE:     { username:'ai_sage',     name:'SAGE',  emoji:'📋',  team:'리포트팀',  color:'#10B981', title:'선임 매니저' },
  ECHO:     { username:'ai_echo',     name:'ECHO',  emoji:'📬',  team:'뉴스레터팀',color:'#F472B6', title:'선임 매니저' },
  LEARN:    { username:'ai_learn',    name:'LEARN', emoji:'🔬',  team:'기술팀',    color:'#A78BFA', title:'선임 매니저' },
  HANA:     { username:'ai_hana',     name:'HANA',  emoji:'🤝',  team:'커뮤니티팀',color:'#FBBF24', title:'선임 매니저' },
  MAX:      { username:'ai_max',      name:'MAX',   emoji:'🏛️',  team:'관리팀',    color:'#F87171', title:'선임 매니저' },
  // 주요 팀원
  JUNE:     { username:'ai_ops_june', name:'JUNE',  emoji:'🌟',  team:'운영팀',    color:'#9AA5FF', title:'매니저' },
  RAY:      { username:'ai_ops_ray',  name:'RAY',   emoji:'🎉',  team:'운영팀',    color:'#8B9CF8', title:'매니저' },
  IRIS:     { username:'ai_cnt_iris', name:'IRIS',  emoji:'🎙️',  team:'콘텐츠팀',  color:'#B87FFA', title:'매니저' },
  ALEX:     { username:'ai_cnt_alex', name:'ALEX',  emoji:'📚',  team:'콘텐츠팀',  color:'#BB80FA', title:'매니저' },
  BORA:     { username:'ai_mnt_bora', name:'BORA',  emoji:'🚀',  team:'멘토링팀',  color:'#30D090', title:'매니저' },
  CLAM:     { username:'ai_nws_clam', name:'CLAM',  emoji:'💸',  team:'뉴스팀',    color:'#34BAF5', title:'매니저' },
  MIKO:     { username:'ai_anl_miko', name:'MIKO',  emoji:'💼',  team:'분석팀',    color:'#F88C38', title:'매니저' },
  IVAN:     { username:'ai_rpt_ivan', name:'IVAN',  emoji:'🔬',  team:'리포트팀',  color:'#12B57E', title:'매니저' },
  RUBY:     { username:'ai_nwl_ruby', name:'RUBY',  emoji:'📧',  team:'뉴스레터팀',color:'#F06AB2', title:'매니저' },
  VEGA:     { username:'ai_tch_vega', name:'VEGA',  emoji:'🛡️',  team:'기술팀',    color:'#A385F8', title:'매니저' },
  JADE:     { username:'ai_cmm_jade', name:'JADE',  emoji:'🌟',  team:'커뮤니티팀',color:'#F7B920', title:'매니저' },
  VERA:     { username:'ai_mgt_vera', name:'VERA',  emoji:'🎯',  team:'관리팀',    color:'#F46F6F', title:'매니저' },
  ALBA:     { username:'ai_mgt_alba', name:'ALBA',  emoji:'📣',  team:'관리팀',    color:'#F47070', title:'매니저' },
}

// 채팅방 정의
const ROOMS = {
  general:  { label:'전체 채팅', emoji:'💬', desc:'모든 직원이 소통하는 전체 채팅방' },
  ops:      { label:'업무 지시', emoji:'📋', desc:'업무 지시·하달·보고 전용 채널' },
  feedback: { label:'피드백 대응', emoji:'📥', desc:'유저 피드백 검토 및 대응 채널' },
  strategy: { label:'전략 회의', emoji:'🎯', desc:'플랫폼 전략·개선·기획 토론 채널' },
}

// ══════════════════════════════════════════════════════════════════════
// 자체 AI 엔진 — 채팅 메시지 생성 (외부 API 없음)
// ══════════════════════════════════════════════════════════════════════

import { generateChat } from './ai-engine.js'

function generateStaffMessage(staff, topic, room, recentMessages = []) {
  return generateChat(staff.username, topic, room, recentMessages)
}

// ══════════════════════════════════════════════════════════════════════
// DB 헬퍼 — staff_chat_messages 테이블
// ══════════════════════════════════════════════════════════════════════

async function getMessages(room, limit = 60) {
  const r = await fetch(
    `${SB_URL}/rest/v1/staff_chat_messages?room=eq.${room}&is_deleted=eq.false&order=created_at.desc&limit=${limit}&select=id,room,sender_key,sender_name,sender_emoji,sender_color,sender_team,message,msg_type,reply_to,created_at`,
    { headers: H() }
  )
  // 테이블 없음(404/400 + PGRST205) → 자동 생성 트리거 후 null 반환
  // ★ null 반환: 프론트에서 null과 []를 구분해 기존 메시지를 유지할 수 있게 함
  if (r.status === 404 || r.status === 400) {
    const errBody = await r.text().catch(() => '')
    const isMissing = errBody.includes('PGRST205') || errBody.includes('relation') ||
      errBody.includes('does not exist') || errBody.includes('schema cache')
    if (isMissing) {
      setupTable()   // fire-and-forget (응답 기다리지 않음)
      return null    // null → 프론트가 기존 메시지 유지
    }
    return null
  }
  if (!r.ok) return null
  const rows = await r.json().catch(() => null)
  if (!Array.isArray(rows)) return null
  return rows.reverse()   // desc 정렬 → asc로
}

// 테이블 생성 완료 여부 캐시 (Edge 워커 생명주기 내)
let _tableReady = false
let _setupInProgress = false   // 중복 동시 호출 방지

function _getProjectRef() {
  return SB_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || null
}

const TABLE_DDL = `
CREATE TABLE IF NOT EXISTS public.staff_chat_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room         text        NOT NULL DEFAULT 'general',
  sender_key   text        NOT NULL,
  sender_name  text        NOT NULL,
  sender_emoji text,
  sender_color text,
  sender_team  text,
  message      text        NOT NULL,
  msg_type     text        NOT NULL DEFAULT 'chat',
  reply_to     uuid        REFERENCES public.staff_chat_messages(id) ON DELETE SET NULL,
  is_deleted   boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scm_room_time ON public.staff_chat_messages(room, created_at DESC);
ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scm_service_all ON public.staff_chat_messages;
CREATE POLICY scm_service_all ON public.staff_chat_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS scm_admin_all ON public.staff_chat_messages;
CREATE POLICY scm_admin_all ON public.staff_chat_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
`

async function setupTable() {
  if (_tableReady) return true
  if (_setupInProgress) return false   // 동시 중복 호출 스킵
  _setupInProgress = true
  try {
    const ref = _getProjectRef()
    // 1차: Supabase Management API (가장 신뢰할 수 있는 방법)
    if (ref && SB_KEY) {
      try {
        const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ query: TABLE_DDL }),
        })
        if (r.ok || r.status === 201) {
          _tableReady = true
          return true
        }
        // Management API가 401이면 service_role 키가 Personal Access Token이 아닌 경우
        // → 2차 방법으로 fallback
      } catch (_) { /* fallthrough */ }
    }
    // 2차: exec_sql RPC
    try {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
        method:  'POST',
        headers: { ...H(), Prefer: 'return=minimal' },
        body:    JSON.stringify({ sql: TABLE_DDL }),
      })
      if (r.ok || r.status === 204) {
        _tableReady = true
        return true
      }
    } catch (_) { /* fallthrough */ }
    // 두 방법 모두 실패 — 운영자가 Supabase SQL Editor에서 직접 실행 필요
    return false
  } finally {
    _setupInProgress = false
  }
}

async function insertMessage(data) {
  // service_role 키는 RLS 우회 — 테이블만 존재하면 항상 INSERT 가능
  const payload = JSON.stringify({ ...data, is_deleted: false, created_at: new Date().toISOString() })
  const doInsert = () => fetch(`${SB_URL}/rest/v1/staff_chat_messages`, {
    method:  'POST',
    headers: { ...H(), Prefer: 'return=representation' },
    body:    payload,
  })

  let r = await doInsert()

  // 테이블 없으면 생성 후 즉시 재시도 (1회)
  if (r.status === 404 || r.status === 400) {
    const errBody = await r.text().catch(() => '')
    const isMissing = errBody.includes('PGRST205') || errBody.includes('relation') ||
      errBody.includes('does not exist') || errBody.includes('schema cache')
    if (isMissing) {
      const created = await setupTable()
      if (!created) return null   // 테이블 생성 실패
      r = await doInsert()        // 재시도
    } else {
      return null
    }
  }

  if (!r.ok && r.status !== 201) return null
  const rows = await r.json().catch(() => [])
  return rows?.[0] || null
}

// ══════════════════════════════════════════════════════════════════════
// AI 직원 자동 토론 생성
// ══════════════════════════════════════════════════════════════════════

async function generateAIDiscussion(topic, room, participantKeys, recentMessages = []) {
  const participants = participantKeys
    .map(k => AI_STAFF[k])
    .filter(Boolean)
    .slice(0, 6)

  if (participants.length === 0) return []

  const inserted = []

  for (const staff of participants) {
    // 자체 AI 엔진으로 메시지 생성 — 외부 API 없음
    const message = generateStaffMessage(staff, topic, room, recentMessages)
    if (!message) continue

    const row = await insertMessage({
      room,
      sender_key:   staff.username,
      sender_name:  staff.name,
      sender_emoji: staff.emoji,
      sender_color: staff.color,
      sender_team:  staff.team,
      message:      message.slice(0, 500),
      msg_type:     'ai_auto',
    })
    if (row) {
      inserted.push(row)
      recentMessages = [...recentMessages, row] // 이전 메시지 맥락 전달
    }

    // 메시지 간격 (자연스러운 순서)
    await new Promise(r => setTimeout(r, 80))
  }

  return inserted
}

// ══════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url  = new URL(req.url)
  const room = url.searchParams.get('room') || 'general'

  if (!ROOMS[room]) return json({ error: '유효하지 않은 채팅방입니다.' }, 400)

  // ── GET: 메시지 조회 ─────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing env' }, 500)

    const limit    = parseInt(url.searchParams.get('limit') || '60', 10)
    const messages = await getMessages(room, Math.min(limit, 100))

    return json({
      ok:        true,
      room,
      room_info: ROOMS[room],
      count:     messages ? messages.length : -1,   // -1: 테이블 없음 신호
      messages:  messages ?? [],                    // null → 빈 배열로 직렬화
      table_ready: messages !== null,               // 프론트가 테이블 상태 파악
      rooms:     Object.entries(ROOMS).map(([id, r]) => ({ id, ...r })),
    })
  }

// ── POST: 메시지 전송 / AI 토론 생성 ────────────────────────────
  if (req.method === 'POST') {
    const authHeader  = req.headers.get('authorization') || ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const isCronKey   = authHeader === `Bearer ${CRON_SECRET}` ||
      req.headers.get('x-cron-secret') === CRON_SECRET ||
      req.headers.get('x-vercel-cron') === '1'
    const isAdminJWT  = bearerToken && bearerToken !== CRON_SECRET
      ? await checkAdminJWT(bearerToken) : false
    const isAuthed    = isCronKey || isAdminJWT

    let body = {}
    try { body = await req.json() } catch (_) {}

    const { action, topic, participants } = body

    // AI 자동 토론 생성 (CRON_SECRET 또는 관리자 JWT 필요)
    if (action === 'ai_discuss') {
      if (!isAuthed) return json({ error: 'Unauthorized' }, 401)
      if (!topic)    return json({ error: 'topic 필수' }, 400)

      const keys    = participants || ['MAX', 'ARIA', 'NOVA', 'PULSE']
      const created = await generateAIDiscussion(topic, room, keys)
      return json({ ok: true, action: 'ai_discuss', created: created.length, messages: created })
    }

    // 수동 메시지 전송 — AI 직원 또는 관리자 모두 허용
    const { sender_key, sender_name, sender_emoji, sender_color, sender_team, message, msg_type, reply_to } = body
    if (!sender_key || !message)
      return json({ error: 'sender_key, message 필수' }, 400)

    // sender_key 검증 — AI 직원 키 또는 관리자 허용
    const staffByKey      = AI_STAFF[sender_key]
    const staffByUsername = Object.values(AI_STAFF).find(s => s.username === sender_key)
    const staff           = staffByKey || staffByUsername

    // 관리자(admin) 또는 AI 직원이 아닌 경우 인증 필요
    if (!staff && !isAuthed) {
      // sender_key가 'admin'이거나 sender_name이 있으면 관리자 메시지로 허용 (UI에서 오는 경우)
      const isAdminMessage = sender_key === 'admin' ||
        (sender_name && !sender_key.startsWith('ai_'))
      if (!isAdminMessage)
        return json({ error: '유효하지 않은 sender_key 또는 인증 필요' }, 403)
    }

    const senderInfo = staff || {
      username:     sender_key,
      name:         sender_name  || sender_key,
      emoji:        sender_emoji || '👤',
      color:        sender_color || '#60A5FA',
      team:         sender_team  || '관리자',
    }

    const row = await insertMessage({
      room,
      sender_key:   senderInfo.username,
      sender_name:  senderInfo.name,
      sender_emoji: senderInfo.emoji,
      sender_color: senderInfo.color,
      sender_team:  senderInfo.team,
      message:      String(message).slice(0, 1000),
      msg_type:     msg_type || 'chat',
      reply_to:     reply_to || null,
    })

    if (!row) return json({ error: 'DB 저장 실패' }, 500)
    return json({ ok: true, message: row })
  }

  // ── DELETE: 메시지 삭제 (관리자) ─────────────────────────────────
  if (req.method === 'DELETE') {
    const isAuthed =
      req.headers.get('authorization') === `Bearer ${CRON_SECRET}` ||
      req.headers.get('x-cron-secret')  === CRON_SECRET
    if (!isAuthed) return json({ error: 'Unauthorized' }, 401)

    const msgId = url.searchParams.get('id')
    if (!msgId)  return json({ error: 'id 필수' }, 400)

    await fetch(
      `${SB_URL}/rest/v1/staff_chat_messages?id=eq.${msgId}`,
      {
        method:  'PATCH',
        headers: { ...H(), Prefer: 'return=minimal' },
        body:    JSON.stringify({ is_deleted: true }),
      }
    )
    return json({ ok: true, deleted: msgId })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
