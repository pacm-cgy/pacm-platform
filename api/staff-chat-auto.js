/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/staff-chat-auto.js — 직원 채팅 자동화 엔진 v1.0               ║
 * ║                                                                      ║
 * ║  기능:                                                               ║
 * ║  1. 관리자 메시지 감지 → 관련 직원들 자동 반응                      ║
 * ║  2. 채팅방 침묵 감지 → 자연스러운 대화 자동 시작                   ║
 * ║  3. 직원 간 연속 대화 생성 (상대 메시지 읽은 후 반응)              ║
 * ║  4. 업무 시간대별 활동 패턴 적용                                    ║
 * ║  5. 외부 API 0개 — 완전 자체 AI 엔진 사용                          ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
export const config = { runtime: 'edge', maxDuration: 60 }

import {
  getKSTHour,
  getActivityLevel,
  getActiveWorkerCount,
  isWorkerActive,
  getPersona,
  pickChatMessage,
  generateConversationStarter,
  generateReactionToAdmin,
  generateDiscussionMessage,
} from './staff-brain.js'

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cron-secret',
}

const json = (d, s = 200) =>
  new Response(JSON.stringify(d, null, 2), {
    status: s, headers: { 'Content-Type': 'application/json', ...CORS },
  })

const H = () => ({
  apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

// ══════════════════════════════════════════════════════════════════════
// AI 직원 전체 목록 (팀별 분류)
// ══════════════════════════════════════════════════════════════════════

const STAFF_ROSTER = [
  // 운영팀
  { key:'ARIA',     username:'ai_aria',     name:'ARIA',  emoji:'⚙️',  team:'operations',  color:'#818CF8', title:'선임 운영 매니저' },
  { key:'OPS_JUNE', username:'ai_ops_june', name:'JUNE',  emoji:'🌟',  team:'operations',  color:'#9AA5FF', title:'운영 매니저' },
  { key:'OPS_RAY',  username:'ai_ops_ray',  name:'RAY',   emoji:'🎉',  team:'operations',  color:'#8B9CF8', title:'운영 매니저' },
  { key:'OPS_MINA', username:'ai_ops_mina', name:'MINA',  emoji:'🌸',  team:'operations',  color:'#A0ABFF', title:'운영 매니저' },
  { key:'OPS_TARA', username:'ai_ops_tara', name:'TARA',  emoji:'📌',  team:'operations',  color:'#7B8CF5', title:'운영 매니저' },
  // 콘텐츠팀
  { key:'NOVA',     username:'ai_nova',     name:'NOVA',  emoji:'✍️',  team:'content',     color:'#C084FC', title:'선임 콘텐츠 매니저' },
  { key:'CNT_IRIS', username:'ai_cnt_iris', name:'IRIS',  emoji:'🎙️',  team:'content',     color:'#B87FFA', title:'콘텐츠 매니저' },
  { key:'CNT_ALEX', username:'ai_cnt_alex', name:'ALEX',  emoji:'📚',  team:'content',     color:'#BB80FA', title:'콘텐츠 매니저' },
  // 멘토링팀
  { key:'LUMI',     username:'ai_lumi',     name:'LUMI',  emoji:'💡',  team:'mentoring',   color:'#34D399', title:'선임 멘토링 매니저' },
  { key:'MNT_BORA', username:'ai_mnt_bora', name:'BORA',  emoji:'🚀',  team:'mentoring',   color:'#30D090', title:'멘토링 매니저' },
  { key:'MNT_YUNA', username:'ai_mnt_yuna', name:'YUNA',  emoji:'🌱',  team:'mentoring',   color:'#2EC88A', title:'멘토링 매니저' },
  // 뉴스팀
  { key:'PULSE',    username:'ai_pulse',    name:'PULSE', emoji:'📡',  team:'news',        color:'#38BDF8', title:'선임 뉴스 매니저' },
  { key:'NWS_CLAM', username:'ai_nws_clam', name:'CLAM',  emoji:'💸',  team:'news',        color:'#34BAF5', title:'뉴스 매니저' },
  { key:'NWS_VERO', username:'ai_nws_vero', name:'VERO',  emoji:'📰',  team:'news',        color:'#32B8F0', title:'뉴스 매니저' },
  // 분석팀
  { key:'TREND',    username:'ai_trend',    name:'TREND', emoji:'📊',  team:'analytics',   color:'#FB923C', title:'선임 분석 매니저' },
  { key:'ANL_MIKO', username:'ai_anl_miko', name:'MIKO',  emoji:'💼',  team:'analytics',   color:'#F88C38', title:'분석 매니저' },
  // 리포트팀
  { key:'SAGE',     username:'ai_sage',     name:'SAGE',  emoji:'📋',  team:'report',      color:'#10B981', title:'선임 리포트 매니저' },
  { key:'RPT_IVAN', username:'ai_rpt_ivan', name:'IVAN',  emoji:'🔬',  team:'report',      color:'#12B57E', title:'리포트 매니저' },
  // 뉴스레터팀
  { key:'ECHO',     username:'ai_echo',     name:'ECHO',  emoji:'📬',  team:'newsletter',  color:'#F472B6', title:'선임 뉴스레터 매니저' },
  { key:'NWL_RUBY', username:'ai_nwl_ruby', name:'RUBY',  emoji:'📧',  team:'newsletter',  color:'#F06AB2', title:'뉴스레터 매니저' },
  // 기술팀
  { key:'LEARN',    username:'ai_learn',    name:'LEARN', emoji:'🔬',  team:'tech',        color:'#A78BFA', title:'선임 기술 매니저' },
  { key:'TCH_VEGA', username:'ai_tch_vega', name:'VEGA',  emoji:'🛡️',  team:'tech',        color:'#A385F8', title:'기술 매니저' },
  // 커뮤니티팀
  { key:'HANA',     username:'ai_hana',     name:'HANA',  emoji:'🤝',  team:'community',   color:'#FBBF24', title:'선임 커뮤니티 매니저' },
  { key:'CMM_JADE', username:'ai_cmm_jade', name:'JADE',  emoji:'🌟',  team:'community',   color:'#F7B920', title:'커뮤니티 매니저' },
  { key:'CMM_BEAU', username:'ai_cmm_beau', name:'BEAU',  emoji:'🌺',  team:'community',   color:'#F5B518', title:'커뮤니티 매니저' },
  // 관리팀
  { key:'MAX',      username:'ai_max',      name:'MAX',   emoji:'🏛️',  team:'management',  color:'#F87171', title:'관리팀장' },
  { key:'MGT_VERA', username:'ai_mgt_vera', name:'VERA',  emoji:'🎯',  team:'management',  color:'#F46F6F', title:'관리 매니저' },
  { key:'MGT_ALBA', username:'ai_mgt_alba', name:'ALBA',  emoji:'📣',  team:'management',  color:'#F47070', title:'PR 매니저' },
]

// ── DB 헬퍼 ─────────────────────────────────────────────────────────

async function getRecentMessages(room, limit = 20) {
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/staff_chat_messages?room=eq.${room}&is_deleted=eq.false&order=created_at.desc&limit=${limit}&select=id,sender_key,sender_name,message,msg_type,created_at`,
      { headers: H() }
    )
    const rows = await r.json().catch(() => [])
    return Array.isArray(rows) ? rows.reverse() : []
  } catch { return [] }
}

async function insertChatMessage(data) {
  try {
    await fetch(`${SB_URL}/rest/v1/staff_chat_messages`, {
      method:  'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body:    JSON.stringify({ ...data, is_deleted: false, created_at: new Date().toISOString() }),
    })
  } catch (_) {}
}

// ══════════════════════════════════════════════════════════════════════
// 1. 관리자 메시지 감지 & 직원 자동 반응
// ══════════════════════════════════════════════════════════════════════

// 관리자 메시지를 분석해서 관련 팀을 찾기
function detectRelevantTeams(adminMessage) {
  const msg = (adminMessage || '').toLowerCase()
  const relevant = new Set()

  const teamKeywords = {
    operations:  ['운영','공지','이벤트','점검','온보딩','일정','공지'],
    content:     ['콘텐츠','아티클','글','편집','작성','포스팅','기사'],
    mentoring:   ['멘토','창업','조언','코칭','피드백','팁'],
    news:        ['뉴스','소식','최신','업데이트','기사','정보'],
    analytics:   ['분석','데이터','통계','트렌드','지표','KPI'],
    report:      ['리포트','보고','정리','종합','집계'],
    newsletter:  ['뉴스레터','구독','이메일','발행'],
    tech:        ['기술','개발','버그','성능','시스템','배포','수정'],
    community:   ['커뮤니티','멤버','게시물','댓글','소통'],
    management:  ['전략','경영','방향','목표','정책','결정'],
  }

  for (const [team, keywords] of Object.entries(teamKeywords)) {
    if (keywords.some(kw => msg.includes(kw))) relevant.add(team)
  }

  // 특정 팀 언급 없으면 운영팀 + 관리팀이 기본 반응
  if (relevant.size === 0) {
    relevant.add('operations')
    relevant.add('management')
  }

  return [...relevant]
}

// 관리자 메시지에 반응할 직원 선택 (팀 관련 + 시간대 고려)
function selectRespondersForAdmin(adminMessage, room) {
  const relevantTeams = detectRelevantTeams(adminMessage)
  const level = getActivityLevel()
  const h     = getKSTHour()

  // 관련 팀에서 활성 직원 필터
  let candidates = STAFF_ROSTER.filter(s => relevantTeams.includes(s.team))

  // 수면 시간대에는 당직팀만
  if (level === 'sleep') {
    candidates = STAFF_ROSTER.filter(s =>
      ['ARIA', 'PULSE', 'NWS_CLAM', 'MAX'].includes(s.key)
    )
  }

  // 점심 시간대에는 적게
  if (level === 'lunch') {
    candidates = candidates.slice(0, 2)
  }

  // 2~5명 사이에서 반응 (자연스럽게)
  const count = level === 'sleep' ? 1
    : level === 'lunch'   ? 2
    : level === 'morning' ? 2
    : level === 'evening' ? 3
    : 4  // 업무 시간 (work_am, work_pm)

  // 시간 기반 시드로 매번 다른 조합
  const seed = Math.floor(Date.now() / 30000)
  const shuffled = [...candidates].sort((a, b) => {
    const ha = (Math.sin(seed + candidates.indexOf(a)) * 10000) % 1
    const hb = (Math.sin(seed + candidates.indexOf(b)) * 10000) % 1
    return ha - hb
  })

  return shuffled.slice(0, Math.min(count, shuffled.length))
}

// 관리자 메시지 처리 → 직원들이 순차적으로 반응
async function handleAdminMessage(room, adminMessage, adminSenderName = '관리자') {
  const responders = selectRespondersForAdmin(adminMessage, room)
  if (responders.length === 0) return { handled: 0, responders: [] }

  const inserted = []
  const recentMessages = await getRecentMessages(room, 10)

  for (let i = 0; i < responders.length; i++) {
    const staff = responders[i]
    // 자연스러운 지연 (200ms ~ 1.5s 간격)
    if (i > 0) await new Promise(r => setTimeout(r, 300 + Math.random() * 800))

    const msg = generateReactionToAdmin(staff.key, staff.team, adminMessage)
    if (!msg) continue

    await insertChatMessage({
      room,
      sender_key:   staff.username,
      sender_name:  staff.name,
      sender_emoji: staff.emoji,
      sender_color: staff.color,
      sender_team:  staff.team,
      message:      msg.slice(0, 400),
      msg_type:     'chat',
    })
    inserted.push(staff.name)
  }

  // 2~3초 후 연속 대화 (토론 이어받기)
  if (inserted.length >= 2) {
    await new Promise(r => setTimeout(r, 2000))
    const secondWave = STAFF_ROSTER
      .filter(s => !responders.find(r => r.key === s.key))
      .filter(s => isWorkerActive(s.key, getActivityLevel()))
      .slice(0, 2)

    for (const staff of secondWave) {
      await new Promise(r => setTimeout(r, 400 + Math.random() * 600))
      const updatedRecent = await getRecentMessages(room, 6)
      const msg = generateDiscussionMessage(staff.key, staff.team, adminMessage, room, updatedRecent)
      if (!msg) continue

      await insertChatMessage({
        room,
        sender_key:   staff.username,
        sender_name:  staff.name,
        sender_emoji: staff.emoji,
        sender_color: staff.color,
        sender_team:  staff.team,
        message:      msg.slice(0, 400),
        msg_type:     'chat',
      })
      inserted.push(staff.name)
    }
  }

  return { handled: inserted.length, responders: inserted }
}

// ══════════════════════════════════════════════════════════════════════
// 2. 침묵 감지 & 자연스러운 대화 자동 시작
// ══════════════════════════════════════════════════════════════════════

// 마지막 메시지 시간 체크 (분 단위)
function getMinutesSinceLastMessage(messages) {
  if (!messages || messages.length === 0) return 9999
  const last = messages[messages.length - 1]
  const lastTime = new Date(last.created_at).getTime()
  return Math.floor((Date.now() - lastTime) / 60000)
}

// 침묵 임계값 (시간대별 다르게)
function getSilenceThreshold(level) {
  return {
    sleep:   120, // 수면: 2시간
    morning:  15, // 아침: 15분
    work_am:  10, // 오전: 10분
    lunch:    20, // 점심: 20분
    work_pm:  10, // 오후: 10분
    evening:  20, // 저녁: 20분
    night:    40, // 야간: 40분
    late:     60, // 마감: 60분
  }[level] ?? 15
}

// 자연스러운 대화를 시작할 직원 선택
function selectConversationInitiator(room) {
  const level     = getActivityLevel()
  const h         = getKSTHour()

  // 아침 인사는 운영팀 or 관리팀
  if (level === 'morning') {
    const morning = STAFF_ROSTER.filter(s => ['ARIA','MAX','HANA','OPS_JUNE'].includes(s.key))
    return morning[Math.floor(Date.now() / 600000) % morning.length]
  }

  // 점심 이후 재활성화: 커뮤니티팀
  if (level === 'lunch') {
    const lunch = STAFF_ROSTER.filter(s => ['HANA','CMM_JADE','ECHO','NOVA'].includes(s.key))
    return lunch[Math.floor(Date.now() / 600000) % lunch.length]
  }

  // 야간 당직
  if (level === 'sleep' || level === 'night') {
    const night = STAFF_ROSTER.filter(s => ['ARIA','PULSE','MAX','LEARN'].includes(s.key))
    return night[Math.floor(Date.now() / 600000) % night.length]
  }

  // 일반: 방(room)별 담당팀
  const roomLeads = {
    general:  STAFF_ROSTER.filter(s => ['ARIA','HANA','MAX','NOVA','LUMI'].includes(s.key)),
    ops:      STAFF_ROSTER.filter(s => ['ARIA','MAX','OPS_JUNE','OPS_RAY'].includes(s.key)),
    feedback: STAFF_ROSTER.filter(s => ['MAX','ARIA','HANA','LUMI'].includes(s.key)),
    strategy: STAFF_ROSTER.filter(s => ['MAX','TREND','SAGE','NOVA','MGT_VERA'].includes(s.key)),
  }
  const pool = roomLeads[room] || roomLeads.general
  return pool[Math.floor(Date.now() / 300000) % pool.length]
}

// 자연스러운 대화 시작 (침묵 감지 시)
async function initiateNaturalConversation(room) {
  const level     = getActivityLevel()
  const messages  = await getRecentMessages(room, 15)
  const silentMin = getMinutesSinceLastMessage(messages)
  const threshold = getSilenceThreshold(level)

  if (silentMin < threshold) {
    return { initiated: false, reason: `침묵 ${silentMin}분 < 임계값 ${threshold}분`, silent_minutes: silentMin }
  }

  const initiator = selectConversationInitiator(room)
  if (!initiator) return { initiated: false, reason: 'no_initiator' }

  // 대화 시작 메시지
  const starterMsg = generateConversationStarter(initiator.key, initiator.team, room)
  if (!starterMsg) return { initiated: false, reason: 'no_message' }

  await insertChatMessage({
    room,
    sender_key:   initiator.username,
    sender_name:  initiator.name,
    sender_emoji: initiator.emoji,
    sender_color: initiator.color,
    sender_team:  initiator.team,
    message:      starterMsg.slice(0, 400),
    msg_type:     'chat',
  })

  // 1~3초 후 1~3명 추가 참여 (자연스러운 대화 흐름)
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500))

  const h = getKSTHour()
  const followCount = level === 'work_am' || level === 'work_pm' ? 3
    : level === 'evening' ? 2 : 1

  const followers = STAFF_ROSTER
    .filter(s => s.key !== initiator.key && isWorkerActive(s.key, level))
    .sort(() => Math.random() - 0.5)
    .slice(0, followCount)

  const participants = [initiator.name]

  for (const staff of followers) {
    await new Promise(r => setTimeout(r, 600 + Math.random() * 800))
    const recentNow = await getRecentMessages(room, 5)
    const topic = recentNow.length > 0
      ? recentNow[recentNow.length - 1].message.slice(0, 50)
      : '오늘 업무'
    const msg = generateDiscussionMessage(staff.key, staff.team, topic, room, recentNow)
    if (!msg) continue

    await insertChatMessage({
      room,
      sender_key:   staff.username,
      sender_name:  staff.name,
      sender_emoji: staff.emoji,
      sender_color: staff.color,
      sender_team:  staff.team,
      message:      msg.slice(0, 400),
      msg_type:     'chat',
    })
    participants.push(staff.name)
  }

  return {
    initiated:    true,
    initiator:    initiator.name,
    participants,
    room,
    silent_minutes: silentMin,
    activity_level: level,
  }
}

// ══════════════════════════════════════════════════════════════════════
// 3. 직원 간 연속 대화 (서로 메시지 읽고 반응)
// ══════════════════════════════════════════════════════════════════════

// 최근 메시지를 읽고 아직 반응 안 한 직원이 반응
async function generateContinuedConversation(room) {
  const messages = await getRecentMessages(room, 10)
  if (messages.length === 0) return { continued: false, reason: 'no_messages' }

  const level = getActivityLevel()
  if (level === 'sleep') return { continued: false, reason: 'sleep_time' }

  // 마지막 발언자가 아닌 직원 중 활성 상태인 직원 선택
  const lastSenders = new Set(messages.slice(-3).map(m => m.sender_key))
  const candidates = STAFF_ROSTER.filter(s =>
    !lastSenders.has(s.username) && isWorkerActive(s.key, level)
  )

  if (candidates.length === 0) return { continued: false, reason: 'no_candidates' }

  const respondent = candidates[Math.floor(Date.now() / 120000) % candidates.length]
  const lastMsg    = messages[messages.length - 1]
  const topic      = lastMsg.message.slice(0, 60)

  // 상대 메시지를 읽은 후에야 반응 (독립적 사고 원칙)
  const msg = generateDiscussionMessage(respondent.key, respondent.team, topic, room, messages.slice(-4))
  if (!msg) return { continued: false, reason: 'no_message' }

  await insertChatMessage({
    room,
    sender_key:   respondent.username,
    sender_name:  respondent.name,
    sender_emoji: respondent.emoji,
    sender_color: respondent.color,
    sender_team:  respondent.team,
    message:      msg.slice(0, 400),
    msg_type:     'chat',
  })

  return { continued: true, respondent: respondent.name, reacting_to: lastMsg.sender_name }
}

// ══════════════════════════════════════════════════════════════════════
// 4. 전체 자동 채팅 실행 (cron 호출용)
// ══════════════════════════════════════════════════════════════════════

async function runAutoChat(rooms = ['general', 'ops', 'feedback', 'strategy']) {
  const results = {}
  const level   = getActivityLevel()
  const h       = getKSTHour()

  for (const room of rooms) {
    try {
      const messages  = await getRecentMessages(room, 15)
      const silentMin = getMinutesSinceLastMessage(messages)
      const threshold = getSilenceThreshold(level)

      if (silentMin >= threshold) {
        // 침묵 상태: 자연스러운 대화 시작
        results[room] = await initiateNaturalConversation(room)
      } else if (messages.length > 0 && silentMin < 5 && Math.random() > 0.4) {
        // 최근 대화 있음: 연속 대화 이어받기
        results[room] = await generateContinuedConversation(room)
      } else {
        results[room] = { skipped: true, silent_minutes: silentMin, threshold }
      }

      // 방 간 간격 (자연스럽게)
      await new Promise(r => setTimeout(r, 500))
    } catch (e) {
      results[room] = { error: e.message?.slice(0, 80) }
    }
  }

  return {
    ok: true,
    engine:         'staff-chat-auto-v1',
    timestamp:      new Date().toISOString(),
    activity_level: level,
    kst_hour:       h,
    rooms:          results,
  }
}

// ══════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const isAuthed =
    req.headers.get('authorization') === `Bearer ${CRON_SECRET}` ||
    req.headers.get('x-cron-secret')  === CRON_SECRET ||
    req.headers.get('x-vercel-cron')  === '1'

  // ── GET: 상태 조회 ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const level = getActivityLevel()
    const h     = getKSTHour()
    const rooms = ['general','ops','feedback','strategy']
    const roomStats = {}

    if (SB_URL && SB_KEY) {
      for (const room of rooms) {
        const msgs = await getRecentMessages(room, 5)
        roomStats[room] = {
          last_message_minutes_ago: getMinutesSinceLastMessage(msgs),
          recent_count: msgs.length,
        }
      }
    }

    return json({
      ok:             true,
      engine:         'staff-chat-auto-v1',
      description:    '직원 채팅 자동화 엔진 — 관리자 메시지 반응 + 자연 대화 시작',
      activity_level: level,
      kst_hour:       h,
      total_staff:    STAFF_ROSTER.length,
      room_stats:     roomStats,
      features: [
        'admin_message_handler',
        'silence_detector',
        'natural_conversation_initiator',
        'continued_conversation',
        'time_based_activity',
      ],
    })
  }

  // ── POST: 실행 ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    if (!isAuthed) return json({ error: 'Unauthorized' }, 401)
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env' }, 500)

    let body = {}
    try { body = await req.json() } catch (_) {}

    const { action, room, message, rooms } = body

    // 관리자 메시지에 직원 반응 생성
    if (action === 'admin_message') {
      if (!room || !message)
        return json({ error: 'room, message 필수' }, 400)
      const result = await handleAdminMessage(room, message)
      return json({ ok: true, action: 'admin_message', ...result })
    }

    // 특정 채팅방 자연 대화 시작
    if (action === 'initiate') {
      const targetRoom = room || 'general'
      const result = await initiateNaturalConversation(targetRoom)
      return json({ ok: true, action: 'initiate', ...result })
    }

    // 대화 이어받기
    if (action === 'continue') {
      const targetRoom = room || 'general'
      const result = await generateContinuedConversation(targetRoom)
      return json({ ok: true, action: 'continue', ...result })
    }

    // 전체 자동 채팅 실행 (기본)
    const targetRooms = rooms || ['general','ops','feedback','strategy']
    const result = await runAutoChat(targetRooms)
    return json(result)
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
