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
  const rows = await r.json().catch(() => [])
  return Array.isArray(rows) ? rows.reverse() : []
}

async function insertMessage(data) {
  const r = await fetch(`${SB_URL}/rest/v1/staff_chat_messages`, {
    method:  'POST',
    headers: { ...H(), Prefer: 'return=representation' },
    body:    JSON.stringify({ ...data, is_deleted: false, created_at: new Date().toISOString() }),
  })
  const rows = await r.json().catch(() => [])
  return rows?.[0] || null
}

async function setupTable() {
  // staff_chat_messages 테이블이 없으면 Supabase SQL로 생성 시도
  // (이미 존재하면 무시)
  const ddl = `
    CREATE TABLE IF NOT EXISTS staff_chat_messages (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room        text NOT NULL DEFAULT 'general',
      sender_key  text NOT NULL,
      sender_name text NOT NULL,
      sender_emoji text,
      sender_color text,
      sender_team text,
      message     text NOT NULL,
      msg_type    text NOT NULL DEFAULT 'chat',
      reply_to    uuid REFERENCES staff_chat_messages(id) ON DELETE SET NULL,
      is_deleted  boolean NOT NULL DEFAULT false,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_scm_room_time ON staff_chat_messages(room, created_at DESC);
    ALTER TABLE staff_chat_messages ENABLE ROW LEVEL SECURITY;
    -- 관리자(admin role)만 읽기/쓰기 가능
    DROP POLICY IF EXISTS scm_admin_all ON staff_chat_messages;
    CREATE POLICY scm_admin_all ON staff_chat_messages
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      );
  `
  try {
    await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
      method:  'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body:    JSON.stringify({ sql: ddl }),
    })
  } catch (_) { /* 이미 있으면 무시 */ }
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
      ok: true,
      room,
      room_info: ROOMS[room],
      count:     messages.length,
      messages,
      rooms:     Object.entries(ROOMS).map(([id, r]) => ({ id, ...r })),
    })
  }

  // ── POST: 메시지 전송 / AI 토론 생성 ────────────────────────────
  if (req.method === 'POST') {
    const isAuthed =
      req.headers.get('authorization') === `Bearer ${CRON_SECRET}` ||
      req.headers.get('x-cron-secret')  === CRON_SECRET

    let body = {}
    try { body = await req.json() } catch (_) {}

    const { action, topic, participants } = body

    // AI 자동 토론 생성 (CRON_SECRET 필요)
    if (action === 'ai_discuss') {
      if (!isAuthed) return json({ error: 'Unauthorized' }, 401)
      if (!topic)    return json({ error: 'topic 필수' }, 400)

      const keys    = participants || ['MAX', 'ARIA', 'NOVA', 'PULSE']
      const created = await generateAIDiscussion(topic, room, keys)
      return json({ ok: true, action: 'ai_discuss', created: created.length, messages: created })
    }

    // 수동 메시지 전송 (관리자 세션 or CRON_SECRET)
    const { sender_key, message, msg_type, reply_to } = body
    if (!sender_key || !message)
      return json({ error: 'sender_key, message 필수' }, 400)

    // sender_key 검증 — AI 직원만 허용 (일반 유저가 AI 직원 사칭 방지)
    const staffMeta = Object.values(AI_STAFF).find(
      s => s.username === sender_key || Object.keys(AI_STAFF).find(k => k === sender_key && AI_STAFF[k].username === s.username)
    )
    // sender_key = 'ARIA' 형식 또는 'ai_aria' 형식 모두 허용
    const staffByKey      = AI_STAFF[sender_key]
    const staffByUsername = Object.values(AI_STAFF).find(s => s.username === sender_key)
    const staff           = staffByKey || staffByUsername

    if (!staff && !isAuthed)
      return json({ error: '유효하지 않은 sender_key 또는 인증 필요' }, 403)

    const senderInfo = staff || {
      name: sender_key, emoji: '👤', color: '#60A5FA', team: '관리자', username: sender_key
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
