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
// runtime: Node.js serverless
import {
  getPersona,
  pickChatMessage,
  generateConversationStarter,
  generateDiscussionMessage,
} from './_staff-brain.js'
export const config = { maxDuration: 30 }

// ══════════════════════════════════════════════════════════════════════
// Top-level imports (ES Module 규칙: 반드시 파일 최상단)
// ai-engine.js 통합 후 staff-brain.js 직접 사용
// ══════════════════════════════════════════════════════════════════════

// ── 입력값 sanitize (XSS / SQL Injection 방어) ──────────────────────
const SAFE_KEY_RE  = /^[a-z0-9_]{1,64}$/i
const SAFE_ROOM_RE = /^[a-z0-9_]{1,32}$/i
function sanitizeText(v, maxLen = 2000) {
  if (typeof v !== 'string') return ''
  return v
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')          // HTML 태그 제거
    .replace(/['";\\]/g, c => ({ "'": '\u2019', '"': '\u201C', ';': '\uFF1B', '\\': '\uFF3C' }[c] ?? c))
    .slice(0, maxLen)
    .trim()
}

const SB_URL       = process.env.SUPABASE_URL
const SB_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET  = process.env.CRON_SECRET
// 프로덕션 앱 URL — self-call 용 (VERCEL_URL은 커스텀 도메인을 반영 안 함)
const APP_URL      =
  process.env.APP_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` ||
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` ||
  'https://www.insightship.pacm.kr'

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

// brain key 변환: ai_aria → ARIA, ai_ops_june → OPS_JUNE
function _getBrainKey(senderUsername) {
  if (!senderUsername) return null
  return senderUsername.replace(/^ai_/, '').toUpperCase()
}

const _chatEngineHistory = new Map()
const _ENGINE_HIST = 8

function _chatFingerprint(text) {
  if (!text) return ''
  return text.replace(/[\s\W\u0000-\u00FF\u2600-\u27BF\uFE00-\uFEFF]/gu, '').slice(0, 25).toLowerCase()
}

function _isEngineRepeat(brainKey, msg) {
  const fp = _chatFingerprint(msg)
  if (!fp || fp.length < 4) return false
  const hist = _chatEngineHistory.get(brainKey) || []
  return hist.some(h => h.slice(0, 18) === fp.slice(0, 18))
}

function _rememberEngine(brainKey, msg) {
  const fp = _chatFingerprint(msg)
  if (!fp) return
  const hist = _chatEngineHistory.get(brainKey) || []
  hist.unshift(fp)
  if (hist.length > _ENGINE_HIST) hist.length = _ENGINE_HIST
  _chatEngineHistory.set(brainKey, hist)
}

const _BRAIN_TEAM_MAP = {
  ARIA:'operations', OPS:'operations',
  NOVA:'content',    CNT:'content',
  LUMI:'mentoring',  MNT:'mentoring',
  PULSE:'news',      NWS:'news',
  TREND:'analytics', ANL:'analytics',
  SAGE:'report',     RPT:'report',
  ECHO:'newsletter', NWL:'newsletter',
  LEARN:'tech',      TCH:'tech',
  HANA:'community',  CMM:'community',
  MAX:'management',  MGT:'management',
}

function generateChat(senderUsername, topic, room = 'general', recentMessages = []) {
  const brainKey = _getBrainKey(senderUsername)
  if (!brainKey) return null

  const persona = getPersona(brainKey)
  if (!persona) return null

  const teamKey = _BRAIN_TEAM_MAP[brainKey] || _BRAIN_TEAM_MAP[brainKey.split('_')[0]] || 'operations'

  for (let attempt = 0; attempt < 3; attempt++) {
    let msg = null
    if (recentMessages.length > 0) {
      const variedTopic = attempt === 0 ? topic
        : attempt === 1 ? (topic + ' 심화')
        : (topic + ' 새 관점')
      msg = generateDiscussionMessage(brainKey, teamKey, variedTopic, room, recentMessages)
    } else {
      msg = attempt === 0
        ? generateConversationStarter(brainKey, teamKey, room)
        : pickChatMessage({ room, hour: (new Date().getUTCHours() + 9) % 24 }, brainKey, room)
    }
    if (msg && !_isEngineRepeat(brainKey, msg)) {
      _rememberEngine(brainKey, msg)
      return msg
    }
  }

  const fallback = recentMessages.length > 0
    ? generateDiscussionMessage(brainKey, teamKey, topic, room, recentMessages)
    : generateConversationStarter(brainKey, teamKey, room)
  if (fallback) _rememberEngine(brainKey, fallback)
  return fallback
}

function generateStaffMessage(staff, topic, room, recentMessages = []) {
  return generateChat(staff.username, topic, room, recentMessages)
}

// ══════════════════════════════════════════════════════════════════════
// DB 헬퍼 — staff_chat_messages 테이블
// ══════════════════════════════════════════════════════════════════════

// 테이블 존재 여부 확인 (HEAD 요청으로 스키마 캐시 비용 최소화)
async function tableExists() {
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/staff_chat_messages?limit=0&select=id`,
      { method: 'HEAD', headers: H() }
    )
    // 200 or 206 → 테이블 존재, 404/400/PGRST205 → 없음
    if (r.status === 200 || r.status === 204 || r.status === 206) return true
    const errText = await r.text().catch(() => '')
    // 4xx 이지만 관계없는 에러일 수 있으므로 body 재확인
    if (errText.includes('PGRST205') || errText.includes('relation') ||
        errText.includes('does not exist')) return false
    return r.ok
  } catch { return false }
}

function _isMissingTable(status, body) {
  return (status === 404 || status === 400) && (
    body.includes('PGRST205') || body.includes('relation') ||
    body.includes('does not exist') || body.includes('schema cache')
  )
}

async function getMessages(room, limit = 60) {
  const r = await fetch(
    `${SB_URL}/rest/v1/staff_chat_messages?room=eq.${room}&is_deleted=eq.false&order=created_at.asc&limit=${limit}&select=id,room,sender_key,sender_name,sender_emoji,sender_color,sender_team,message,msg_type,reply_to,created_at`,
    { headers: H() }
  )
  if (r.status === 404 || r.status === 400) {
    const errBody = await r.text().catch(() => '')
    if (_isMissingTable(r.status, errBody)) {
      return null   // null → 프론트가 테이블 없음 감지, 기존 메시지 유지
    }
    return null
  }
  if (!r.ok) return null
  const rows = await r.json().catch(() => null)
  if (!Array.isArray(rows)) return null
  // asc 정렬로 가져오므로 reverse() 불필요 — 이미 시간순(오래된 것 먼저)
  return rows
}

// Edge 런타임 모듈 스코프 캐시 (동일 워커 인스턴스 내 중복 호출만 방지)
// ★ Edge는 요청마다 새 인스턴스일 수 있으므로 이 캐시에 의존하지 말 것
let _setupInProgress = false

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
  if (_setupInProgress) return false
  _setupInProgress = true
  try {
    // 먼저 실제 존재 여부 확인 — 이미 존재하면 즉시 true 반환
    const exists = await tableExists()
    if (exists) return true

    // exec_sql RPC 시도 (Supabase에 미리 등록된 경우만 동작)
    try {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
        method:  'POST',
        headers: { ...H(), Prefer: 'return=minimal' },
        body:    JSON.stringify({ sql: TABLE_DDL }),
      })
      if (r.ok || r.status === 204) return true
    } catch (_) { /* exec_sql 없음 → fallthrough */ }

    // 모든 방법 실패 → AdminPage 시스템 탭에서 SQL 직접 실행 필요
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

    // table_ready: messages===null 이면 테이블 없음 확정
    // 단, 프론트가 매 폴링마다 ensureTable을 호출하지 않도록
    // table_ready=false 일 때 table_missing=true 플래그를 별도 전달
    const tblMissing = messages === null
    return json({
      ok:          true,
      room,
      room_info:   ROOMS[room],
      count:       tblMissing ? -1 : messages.length,
      messages:    messages ?? [],
      table_ready: !tblMissing,
      table_missing: tblMissing,   // 프론트에서 1회만 ensureTable 호출하는 데 사용
      rooms:       Object.entries(ROOMS).map(([id, r]) => ({ id, ...r })),
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

    // ★ SECURITY: 모든 입력값 sanitize (XSS / SQL Injection 방어)
    const safeMessage = sanitizeText(String(message), 1000)
    if (!safeMessage) return json({ error: '메시지 내용이 유효하지 않습니다.' }, 400)

    const row = await insertMessage({
      room,
      sender_key:   sanitizeText(senderInfo.username, 64),
      sender_name:  sanitizeText(senderInfo.name, 100),
      sender_emoji: sanitizeText(senderInfo.emoji || '💬', 10),
      sender_color: /^#[0-9A-Fa-f]{3,6}$/.test(senderInfo.color) ? senderInfo.color : '#60A5FA',
      sender_team:  sanitizeText(senderInfo.team || '직원', 50),
      message:      safeMessage,
      msg_type:     ['chat','admin_message','ai_auto','ai_discuss','announcement'].includes(msg_type) ? msg_type : 'chat',
      reply_to:     reply_to || null,
    })

    if (!row) return json({ error: 'DB 저장 실패' }, 500)
    return json({ ok: true, message: row })
  }

  // ── DELETE: 메시지 삭제 (관리자) ─────────────────────────────────
  if (req.method === 'DELETE') {
    const delAuthHeader  = req.headers.get('authorization') || ''
    const delBearerToken = delAuthHeader.startsWith('Bearer ') ? delAuthHeader.slice(7) : ''
    const isCronAuth =
      delAuthHeader === `Bearer ${CRON_SECRET}` ||
      req.headers.get('x-cron-secret') === CRON_SECRET
    const isAdminAuth = delBearerToken && delBearerToken !== CRON_SECRET
      ? await checkAdminJWT(delBearerToken) : false
    const isAuthed = isCronAuth || isAdminAuth
    if (!isAuthed) return json({ error: 'Unauthorized' }, 401)

    const msgId = url.searchParams.get('id')
    if (!msgId) return json({ error: 'id 필수' }, 400)
    // ★ SECURITY: UUID 형식 검증 (SQL Injection / IDOR 방어)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(msgId))
      return json({ error: '유효하지 않은 메시지 ID 형식입니다.' }, 400)

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
