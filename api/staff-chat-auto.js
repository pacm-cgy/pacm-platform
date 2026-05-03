/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/staff-chat-auto.js — 완전 자율형 직원 엔진 v9.0               ║
 * ║  "Fully Autonomous AI Staff Engine — Research-Based v9"             ║
 * ║                                                                      ║
 * ║  100+ 연구 논문 기반 구현:                                          ║
 * ║  ① Stanford Generative Agents (Park 2023) — Memory·Plan·Reflect    ║
 * ║  ② Big Five 성격 모델 → 언어·행동·반응 스타일 결정                 ║
 * ║  ③ Episodic Memory System → 과거 대화 자연스럽게 참조              ║
 * ║  ④ Mood State Machine → 감정이 응답 속도·표현에 영향               ║
 * ║  ⑤ Theory of Mind → 동료 감정 감지 & 공감 반응                     ║
 * ║  ⑥ Autonomous Goal Pursuit → 자발적 업무 보고·아이디어 공유        ║
 * ║  ⑦ Diurnal Routine → 아침인사·점심복귀·퇴근인사 자동 수행         ║
 * ║  ⑧ Disfluency (Oxford/Cornell 2025) → 망설임·필러로 인간다움       ║
 * ║  ⑨ Productive Disagreement (Jehn 1995) → 성격별 반론 자동 생성    ║
 * ║  ⑩ Proactive Social Behavior → 침묵 감지 후 자발적 발화            ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
export const config = { maxDuration: 60 }

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
} from './_staff-brain.js'

import {
  getMood,
  triggerMoodShift,
  storeEpisode,
  recallEpisodes,
  generateMemoryReference,
  getLangHabits,
  applyDisfluency,
  applySignatureEnding,
  generateWorkReport,
  generateSpontaneousOpinion,
  generateDisagreement,
  shouldInitiateConversation,
  generateAutonomousStarter,
  getDailyRoutineAction,
  detectColleagueMood,
  generateEmpathyResponse,
  decideNextAction,
  getPersonaStatus,
  getCurrentGoal,
} from './_staff-persona-engine.js'

// ══════════════════════════════════════════════════════════════════════
// 반복 대화 방지 메모리 (런타임 캐시)
// ══════════════════════════════════════════════════════════════════════

const _chatHistory = new Map()  // staffKey → [fingerprint, ...]
const CHAT_HISTORY_SIZE = 12

function _msgFingerprint(text) {
  if (!text) return ''
  return text.replace(/[\s\W\u2600-\u27BF\uFE00-\uFEFF]/gu, '').slice(0, 30).toLowerCase()
}

function _isChatRepeat(staffKey, msg) {
  const fp = _msgFingerprint(msg)
  if (!fp || fp.length < 5) return false
  const hist = _chatHistory.get(staffKey) || []
  return hist.some(h => h.length >= 5 && fp.length >= 5 && h.slice(0, 20) === fp.slice(0, 20))
}

function _rememberChat(staffKey, msg) {
  const fp = _msgFingerprint(msg)
  if (!fp) return
  const hist = _chatHistory.get(staffKey) || []
  hist.unshift(fp)
  if (hist.length > CHAT_HISTORY_SIZE) hist.length = CHAT_HISTORY_SIZE
  _chatHistory.set(staffKey, hist)
}

function _generateUniqueMsg(staffKey, topic, room, recentMsgs, generator) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const msg = generator(attempt)
    if (msg && !_isChatRepeat(staffKey, msg)) {
      _rememberChat(staffKey, msg)
      return msg
    }
  }
  const fallback = generator(3)
  if (fallback) _rememberChat(staffKey, fallback)
  return fallback
}

// ══════════════════════════════════════════════════════════════════════
// 환경 변수 & 공통 헬퍼
// ══════════════════════════════════════════════════════════════════════

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

async function checkAdminJWT(token) {
  if (!token || !SB_URL || !SB_KEY) return false
  try {
    const r1 = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r1.ok) return false
    const user = await r1.json().catch(() => null)
    if (!user?.id) return false
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
// 직원 명부 (전체 29명)
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
// ① 관리자 메시지 감지 & 직원 자동 반응
// ══════════════════════════════════════════════════════════════════════

function detectRelevantTeams(adminMessage) {
  const msg = (adminMessage || '').toLowerCase()
  const relevant = new Set()

  const teamKeywords = {
    operations:  ['운영','공지','이벤트','점검','온보딩','일정','알림'],
    content:     ['콘텐츠','아티클','글','편집','작성','포스팅','기사'],
    mentoring:   ['멘토','창업','조언','코칭','피드백','팁'],
    news:        ['뉴스','소식','최신','업데이트','기사','정보'],
    analytics:   ['분석','데이터','통계','트렌드','지표','kpi'],
    report:      ['리포트','보고','정리','종합','집계'],
    newsletter:  ['뉴스레터','구독','이메일','발행'],
    tech:        ['기술','개발','버그','성능','시스템','배포','수정'],
    community:   ['커뮤니티','멤버','게시물','댓글','소통'],
    management:  ['전략','경영','방향','목표','정책','결정'],
  }

  for (const [team, keywords] of Object.entries(teamKeywords)) {
    if (keywords.some(kw => msg.includes(kw))) relevant.add(team)
  }
  if (relevant.size === 0) {
    relevant.add('operations')
    relevant.add('management')
  }
  return [...relevant]
}

function selectRespondersForAdmin(adminMessage) {
  const relevantTeams = detectRelevantTeams(adminMessage)
  const level = getActivityLevel()

  let candidates = STAFF_ROSTER.filter(s => relevantTeams.includes(s.team))

  if (level === 'sleep') {
    candidates = STAFF_ROSTER.filter(s =>
      ['ARIA', 'PULSE', 'NWS_CLAM', 'MAX', 'LEARN'].includes(s.key)
    )
  }
  if (level === 'night' || level === 'late') {
    candidates = STAFF_ROSTER.filter(s => isWorkerActive(s.key, level))
  }
  if (level === 'lunch') candidates = candidates.slice(0, 2)
  if (candidates.length === 0) {
    candidates = STAFF_ROSTER.filter(s => isWorkerActive(s.key, level))
  }

  const count = level === 'sleep' ? 1 : level === 'lunch' ? 2
    : level === 'morning' ? 2 : level === 'evening' ? 3
    : level === 'night' ? 2 : level === 'late' ? 2 : 4

  return [...candidates].sort(() => Math.random() - 0.5).slice(0, Math.min(count, candidates.length))
}

/**
 * 관리자 메시지 처리 — v9 자율형 반응
 * 연구: Autonomous Agent Response (Stanford HAI 2025)
 */
async function handleAdminMessage(room, adminMessage, adminSenderName = '관리자') {
  const responders = selectRespondersForAdmin(adminMessage)
  if (responders.length === 0) return { handled: 0, responders: [] }

  const inserted = []
  const recentMessages = await getRecentMessages(room, 15)
  const level = getActivityLevel()

  // ★ 모든 응답자에게 에피소드 저장 + Mood 업데이트
  for (const staff of responders) {
    storeEpisode(staff.key, 'heard', adminMessage.slice(0, 80), ['admin_message', room])
    if (adminMessage.match(/급해|긴급|즉시|당장|빠르게/)) {
      triggerMoodShift(staff.key, 'urgent_task')
    } else if (adminMessage.match(/좋아|훌륭|잘|성과|감사|고마워/)) {
      triggerMoodShift(staff.key, 'praise')
    } else if (adminMessage.match(/성공|해냈|완료|달성/)) {
      triggerMoodShift(staff.key, 'team_success')
    }
  }

  for (let i = 0; i < responders.length; i++) {
    const staff = responders[i]
    const mood = getMood(staff.key, level)

    // ★ Mood 기반 타이핑 지연 (연구: Response Latency as Cue, Holtgraves 1994)
    // Vercel 60s 타임아웃 방어: 지연을 최소화 (실제 타이핑 시뮬레이션은 프론트에서 처리)
    const baseDelay = i === 0
      ? (mood.key === 'enthusiastic' ? 80 : mood.key === 'tired' ? 200 : 120)
      : (mood.key === 'enthusiastic' ? 150 : mood.key === 'tired' ? 300 : 200)
    const jitter = Math.random() * 100
    await new Promise(r => setTimeout(r, baseDelay + jitter))

    // ★ 직전 발언 읽기 (i > 0이면 최신 메시지 다시 로드)
    const contextualMessages = i > 0
      ? await getRecentMessages(room, 8)
      : recentMessages

    // ★ Theory of Mind: 직전 메시지 감정 감지 & 공감 반응
    const lastMsg = contextualMessages[contextualMessages.length - 1]
    const colleagueMood = lastMsg?.message ? detectColleagueMood(lastMsg.message) : 'normal'
    const empathyMsg = (colleagueMood !== 'normal' && i > 0)
      ? generateEmpathyResponse(staff.key, staff.team, lastMsg.message, colleagueMood)
      : null

    // ★ 에피소드 기억 참조 (30% 확률로 과거 언급 삽입)
    const memRef = Math.random() < 0.3
      ? generateMemoryReference(staff.key, adminMessage)
      : null

    const shouldReactToAdmin = i === 0 || Math.random() > 0.4

    const msg = _generateUniqueMsg(
      staff.key, adminMessage, room, contextualMessages,
      (attempt) => {
        // 공감 반응 최우선
        if (empathyMsg && attempt === 0) {
          return memRef ? `${empathyMsg} ${memRef}` : empathyMsg
        }
        if (attempt === 0 && shouldReactToAdmin) {
          const base = generateReactionToAdmin(staff.key, staff.team, adminMessage)
          return memRef ? `${memRef} ${base}` : base
        }
        // 이전 직원 대화를 읽고 이어가기 (토론)
        const topic = lastMsg?.message?.slice(0, 80) || adminMessage

        // ★ 자율 행동 결정: 의견 불일치 생성 (15% 확률)
        if (attempt >= 2 && Math.random() < 0.15 && i > 0) {
          const lastSenderPersona = getPersona(lastMsg?.sender_key || '')
          return generateDisagreement(staff.key, staff.team, topic, lastSenderPersona?.style || 'casual')
        }
        return generateDiscussionMessage(staff.key, staff.team, topic, room, contextualMessages)
      }
    )
    if (!msg) continue

    // ★ 답변 에피소드 저장
    storeEpisode(staff.key, 'said', msg.slice(0, 80), ['admin_reply', room])

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

  // ★ 2차 웨이브: 타임아웃 방어를 위해 비동기 백그라운드 처리
  if (inserted.length >= 2) {
    await new Promise(r => setTimeout(r, 300 + Math.random() * 200))
    const level2 = getActivityLevel()

    const secondWave = STAFF_ROSTER
      .filter(s => !responders.find(r => r.key === s.key))
      .filter(s => isWorkerActive(s.key, level2))
      .sort(() => Math.random() - 0.5)
      .slice(0, level2 === 'work_am' || level2 === 'work_pm' ? 2 : 1)

    for (const staff of secondWave) {
      await new Promise(r => setTimeout(r, 100 + Math.random() * 150))
      const freshRecent = await getRecentMessages(room, 8)
      const lastStaffMsg = freshRecent[freshRecent.length - 1]
      const replyTopic = lastStaffMsg?.message?.slice(0, 80) || adminMessage

      // ★ v9: 자율 행동 결정 — 업무 보고 or 자발적 의견 or 토론 이어가기
      const action = decideNextAction(staff.key, {
        silentMinutes: 0, activityLevel: level2,
        hasAdminMessage: true, lastSpeakers: inserted,
      })

      let rawMsg
      if (action === 'work_report' && Math.random() < 0.3) {
        rawMsg = generateWorkReport(staff.key, staff.team, room)
      } else if (action === 'share_opinion' && Math.random() < 0.25) {
        rawMsg = generateSpontaneousOpinion(staff.key, staff.team, room)
      } else {
        rawMsg = generateDiscussionMessage(staff.key, staff.team, replyTopic, room, freshRecent)
      }

      if (!rawMsg || _isChatRepeat(staff.key, rawMsg)) {
        rawMsg = generateDiscussionMessage(staff.key, staff.team, adminMessage, room, freshRecent)
      }
      if (!rawMsg || _isChatRepeat(staff.key, rawMsg)) continue
      _rememberChat(staff.key, rawMsg)

      storeEpisode(staff.key, 'said', rawMsg.slice(0, 80), ['discussion', room])

      await insertChatMessage({
        room,
        sender_key:   staff.username,
        sender_name:  staff.name,
        sender_emoji: staff.emoji,
        sender_color: staff.color,
        sender_team:  staff.team,
        message:      rawMsg.slice(0, 400),
        msg_type:     'chat',
      })
      inserted.push(staff.name)
    }
  }

  return { handled: inserted.length, responders: inserted }
}

// ══════════════════════════════════════════════════════════════════════
// ② 침묵 감지 & 자연스러운 대화 자동 시작 (v9 자율형)
// ══════════════════════════════════════════════════════════════════════

function getMinutesSinceLastMessage(messages) {
  if (!messages || messages.length === 0) return 9999
  const last = messages[messages.length - 1]
  const lastTime = new Date(last.created_at).getTime()
  return Math.floor((Date.now() - lastTime) / 60000)
}

function getSilenceThreshold(level) {
  return {
    sleep:   120,
    morning:  12,
    work_am:   8,
    lunch:    18,
    work_pm:   8,
    evening:  18,
    night:    35,
    late:     55,
  }[level] ?? 12
}

function selectConversationInitiator(room) {
  const level = getActivityLevel()

  if (level === 'morning') {
    const pool = STAFF_ROSTER.filter(s => ['ARIA','MAX','HANA','OPS_JUNE','OPS_RAY','OPS_MINA','CMM_JADE'].includes(s.key))
    return pool[Math.floor(Math.random() * pool.length)]
  }
  if (level === 'lunch') {
    const pool = STAFF_ROSTER.filter(s => ['HANA','CMM_JADE','ECHO','NOVA','LUMI','CMM_BEAU','MNT_YUNA'].includes(s.key))
    return pool[Math.floor(Math.random() * pool.length)]
  }
  if (level === 'sleep' || level === 'night') {
    const pool = STAFF_ROSTER.filter(s => ['ARIA','PULSE','MAX','LEARN','TCH_VEGA','NWS_CLAM'].includes(s.key))
    return pool[Math.floor(Math.random() * pool.length)]
  }

  const roomLeads = {
    general:  STAFF_ROSTER.filter(s => ['ARIA','HANA','MAX','NOVA','LUMI','OPS_JUNE','CMM_JADE','ECHO'].includes(s.key)),
    ops:      STAFF_ROSTER.filter(s => ['ARIA','MAX','OPS_JUNE','OPS_RAY','OPS_MINA','OPS_TARA'].includes(s.key)),
    feedback: STAFF_ROSTER.filter(s => ['MAX','ARIA','HANA','LUMI','MNT_BORA','CMM_JADE','ANL_MIKO'].includes(s.key)),
    strategy: STAFF_ROSTER.filter(s => ['MAX','TREND','SAGE','NOVA','MGT_VERA','ANL_MIKO','MGT_ALBA'].includes(s.key)),
  }
  const pool = roomLeads[room] || roomLeads.general
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * 자연스러운 대화 시작 — v9 자율형
 * ① 시간대 루틴 행동 (아침인사·퇴근인사) 우선 수행
 * ② 루틴 아니면: 업무 보고 or 자발적 의견 or 일반 대화 시작
 */
async function initiateNaturalConversation(room) {
  const level    = getActivityLevel()
  const messages = await getRecentMessages(room, 15)
  const silentMin = getMinutesSinceLastMessage(messages)
  const threshold = getSilenceThreshold(level)

  if (silentMin < threshold) {
    return { initiated: false, reason: `침묵 ${silentMin}분 < 임계값 ${threshold}분`, silent_minutes: silentMin }
  }

  const initiator = selectConversationInitiator(room)
  if (!initiator) return { initiated: false, reason: 'no_initiator' }

  const mood = getMood(initiator.key, level)

  // ★ v9: 자율 행동 결정 엔진
  const action = decideNextAction(initiator.key, {
    silentMinutes: silentMin,
    activityLevel: level,
    hasAdminMessage: false,
    lastSpeakers: messages.slice(-3).map(m => m.sender_key),
    mood,
  })

  let starterMsg = null

  // ── 자율 행동별 메시지 생성 ──────────────────────────────────────
  if (action === 'routine') {
    // 시간대 루틴 행동 (아침인사·점심복귀·퇴근인사)
    const routine = getDailyRoutineAction(initiator.key, initiator.team)
    starterMsg = routine.message
  } else if (action === 'work_report' && room !== 'general') {
    // 자발적 업무 보고 (ops/strategy 채널에서 더 자주)
    starterMsg = generateWorkReport(initiator.key, initiator.team, room)
  } else if (action === 'share_opinion') {
    // 자발적 의견 공유
    starterMsg = generateSpontaneousOpinion(initiator.key, initiator.team, room)
  } else if (action === 'start_discussion') {
    // 자율적 대화 시작 (성격 기반)
    starterMsg = generateAutonomousStarter(initiator.key, initiator.team, room, level)
  } else {
    // 일반 대화 시작
    starterMsg = generateConversationStarter(initiator.key, initiator.team, room)
  }

  // 반복 감지 & 재시도
  if (starterMsg && _isChatRepeat(initiator.key, starterMsg)) {
    starterMsg = generateConversationStarter(initiator.key, initiator.team, room)
  }
  if (!starterMsg) return { initiated: false, reason: 'no_message' }
  _rememberChat(initiator.key, starterMsg)

  // ★ 에피소드 저장
  storeEpisode(initiator.key, 'said', starterMsg.slice(0, 80), [action, room])

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

  // ★ Mood 기반 타이핑 지연
  const baseDelay = level === 'work_am' || level === 'work_pm'
    ? (mood.key === 'enthusiastic' ? 500 : 800) + Math.random() * 700
    : level === 'evening' ? 900 + Math.random() * 900
    : 1200 + Math.random() * 1400
  await new Promise(r => setTimeout(r, baseDelay))

  const followCount = level === 'work_am' || level === 'work_pm' ? 3
    : level === 'evening' ? 2 : 1

  // ★ 팀 다양성 우선 + 외향성 기반 참여 결정
  const usedTeams = new Set([initiator.team])
  const followerPool = STAFF_ROSTER
    .filter(s => s.key !== initiator.key && isWorkerActive(s.key, level))
    .sort(() => Math.random() - 0.5)

  const followers = []
  for (const s of followerPool) {
    if (followers.length >= followCount) break
    if (!usedTeams.has(s.team) && shouldInitiateConversation(s.key, silentMin, level)) {
      followers.push(s)
      usedTeams.add(s.team)
    }
  }
  // 부족하면 조건 완화
  for (const s of followerPool) {
    if (followers.length >= followCount) break
    if (!followers.find(f => f.key === s.key)) followers.push(s)
  }

  const participants = [initiator.name]

  for (const staff of followers) {
    await new Promise(r => setTimeout(r, 400 + Math.random() * 600))
    const recentNow = await getRecentMessages(room, 6)
    const lastMsg = recentNow[recentNow.length - 1]
    const topic = lastMsg?.message?.slice(0, 70) || '오늘 업무'

    // ★ v9: 팔로워도 자율 행동 결정
    const followerMood = getMood(staff.key, level)
    const followerAction = decideNextAction(staff.key, {
      silentMinutes: silentMin, activityLevel: level,
      hasAdminMessage: false, lastSpeakers: [initiator.username],
      mood: followerMood,
    })

    let rawMsg
    if (followerAction === 'work_report' && Math.random() < 0.4) {
      rawMsg = generateWorkReport(staff.key, staff.team, room)
    } else if (followerAction === 'share_opinion' && Math.random() < 0.35) {
      rawMsg = generateSpontaneousOpinion(staff.key, staff.team, room)
    } else {
      // Theory of Mind: 직전 발언자 감정 감지
      const colleagueMood = lastMsg?.message ? detectColleagueMood(lastMsg.message) : 'normal'
      if (colleagueMood !== 'normal') {
        const empathyMsg = generateEmpathyResponse(staff.key, staff.team, lastMsg.message, colleagueMood)
        if (empathyMsg) rawMsg = empathyMsg
      }
      if (!rawMsg) {
        rawMsg = generateDiscussionMessage(staff.key, staff.team, topic, room, recentNow)
      }
    }

    if (!rawMsg || _isChatRepeat(staff.key, rawMsg)) {
      rawMsg = generateDiscussionMessage(staff.key, staff.team, topic + ' 추가 의견', room, recentNow)
    }
    if (!rawMsg) continue
    _rememberChat(staff.key, rawMsg)
    storeEpisode(staff.key, 'said', rawMsg.slice(0, 80), ['discussion', room])

    await insertChatMessage({
      room,
      sender_key:   staff.username,
      sender_name:  staff.name,
      sender_emoji: staff.emoji,
      sender_color: staff.color,
      sender_team:  staff.team,
      message:      rawMsg.slice(0, 400),
      msg_type:     'chat',
    })
    participants.push(staff.name)
  }

  return {
    initiated:      true,
    action,
    initiator:      initiator.name,
    participants,
    room,
    silent_minutes: silentMin,
    activity_level: level,
    mood:           getMood(initiator.key, level).key,
  }
}

// ══════════════════════════════════════════════════════════════════════
// ③ 직원 간 연속 대화 — v9 자율 판단
// ══════════════════════════════════════════════════════════════════════

async function generateContinuedConversation(room) {
  const messages = await getRecentMessages(room, 10)
  if (messages.length === 0) return { continued: false, reason: 'no_messages' }

  const level = getActivityLevel()
  if (level === 'sleep') return { continued: false, reason: 'sleep_time' }

  // ★ 마지막 3명 제외 (더 자연스러운 순환 대화)
  const lastSenders = new Set(messages.slice(-3).map(m => m.sender_key))
  const lastAdminMsg = messages.slice(-5).find(m => m.msg_type === 'admin_message')

  const candidates = STAFF_ROSTER.filter(s =>
    !lastSenders.has(s.username) && isWorkerActive(s.key, level)
  )
  if (candidates.length === 0) return { continued: false, reason: 'no_candidates' }

  // ★ 관리자 메시지 있으면 관련 팀 우선
  let respondent
  if (lastAdminMsg && Math.random() < 0.5) {
    const adminText = lastAdminMsg.message || ''
    const teamKeyMap = {
      operations: ['운영','공지','온보딩'], content: ['콘텐츠','아티클','편집'],
      mentoring: ['멘토','창업','조언'], news: ['뉴스','정보','시장'],
      analytics: ['분석','데이터','트렌드'], tech: ['기술','개발','버그'],
      community: ['커뮤니티','멤버'], management: ['전략','목표','경영'],
    }
    const relevantTeams = Object.entries(teamKeyMap)
      .filter(([, kws]) => kws.some(kw => adminText.includes(kw)))
      .map(([team]) => team)
    const relevantCandidates = candidates.filter(c => relevantTeams.includes(c.team))
    const pool = relevantCandidates.length > 0 ? relevantCandidates : candidates
    respondent = pool[Math.floor(Math.random() * pool.length)]
  } else {
    respondent = candidates[Math.floor(Math.random() * candidates.length)]
  }

  const lastMsg = messages[messages.length - 1]
  const topic = lastMsg.message.slice(0, 70)

  // ★ v9: 자율 행동 결정
  const respondentMood = getMood(respondent.key, level)
  const action = decideNextAction(respondent.key, {
    silentMinutes: getMinutesSinceLastMessage(messages),
    activityLevel: level,
    hasAdminMessage: !!lastAdminMsg,
    lastSpeakers: [...lastSenders],
    mood: respondentMood,
  })

  let rawCont

  // Theory of Mind 공감 우선
  const colleagueMood = detectColleagueMood(lastMsg.message)
  if (colleagueMood !== 'normal') {
    const empathyMsg = generateEmpathyResponse(respondent.key, respondent.team, lastMsg.message, colleagueMood)
    if (empathyMsg) rawCont = empathyMsg
  }

  if (!rawCont) {
    if (action === 'work_report' && Math.random() < 0.35) {
      rawCont = generateWorkReport(respondent.key, respondent.team, room)
    } else if (action === 'share_opinion' && Math.random() < 0.3) {
      rawCont = generateSpontaneousOpinion(respondent.key, respondent.team, room)
    } else {
      // ★ 의견 불일치 (12% 확률) — 성격에 따른 자연스러운 반론
      if (Math.random() < 0.12) {
        const lastSenderPersona = getPersona(lastMsg?.sender_key || '')
        rawCont = generateDisagreement(respondent.key, respondent.team, topic, lastSenderPersona?.style || 'casual')
      } else {
        rawCont = generateDiscussionMessage(respondent.key, respondent.team, topic, room, messages.slice(-5))
      }
    }
  }

  if (!rawCont) return { continued: false, reason: 'no_message' }

  // 중복이면 다른 각도 재시도
  if (_isChatRepeat(respondent.key, rawCont)) {
    rawCont = generateDiscussionMessage(respondent.key, respondent.team, topic + ' 다른 관점', room, messages.slice(-5))
    if (!rawCont || _isChatRepeat(respondent.key, rawCont)) return { continued: false, reason: 'repeat_detected' }
  }
  _rememberChat(respondent.key, rawCont)
  storeEpisode(respondent.key, 'said', rawCont.slice(0, 80), ['discussion', room])

  await insertChatMessage({
    room,
    sender_key:   respondent.username,
    sender_name:  respondent.name,
    sender_emoji: respondent.emoji,
    sender_color: respondent.color,
    sender_team:  respondent.team,
    message:      rawCont.slice(0, 400),
    msg_type:     'chat',
  })

  return {
    continued:   true,
    action,
    respondent:  respondent.name,
    reacting_to: lastMsg.sender_name,
    mood:        respondentMood.key,
  }
}

// ══════════════════════════════════════════════════════════════════════
// ④ 전체 자동 채팅 실행 (cron 호출용) — v9 자율 행동 통합
// ══════════════════════════════════════════════════════════════════════

async function runAutoChat(rooms = ['general', 'ops', 'feedback', 'strategy']) {
  const results = {}
  const level   = getActivityLevel()
  const h       = getKSTHour()
  // 전체 실행 시간 가드: Vercel 60s maxDuration 내 안전 완료
  // 참조: Vercel Edge Function Timeout (Vercel Docs 2024)
  const HARD_DEADLINE = Date.now() + 45_000  // 45초 이내 강제 종료

  // 수면/야간 시간대에는 general 채널만
  const activeRooms = level === 'sleep' || level === 'late'
    ? rooms.filter(r => r === 'general')
    : rooms

  for (const room of activeRooms) {
    // 데드라인 초과 시 조기 종료 (채팅 중단 방지)
    if (Date.now() > HARD_DEADLINE) {
      results[room] = { skipped: true, reason: 'deadline_exceeded' }
      continue
    }
    try {
      const messages   = await getRecentMessages(room, 10)
      const silentMin  = getMinutesSinceLastMessage(messages)
      const threshold  = getSilenceThreshold(level)

      if (silentMin >= threshold) {
        // 침묵 → 자연스러운 대화 시작 (v9 자율 행동 포함)
        results[room] = await Promise.race([
          initiateNaturalConversation(room),
          new Promise(r => setTimeout(() => r({ initiated: false, reason: 'room_timeout' }), 12_000)),
        ])
      } else if (messages.length > 0 && silentMin < 5 && Math.random() > 0.5) {
        // 최근 대화 + 50% 확률 → 연속 대화 이어받기
        results[room] = await Promise.race([
          generateContinuedConversation(room),
          new Promise(r => setTimeout(() => r({ continued: false, reason: 'room_timeout' }), 10_000)),
        ])
      } else {
        results[room] = { skipped: true, silent_minutes: silentMin, threshold }
      }

      await new Promise(r => setTimeout(r, 150))
    } catch (e) {
      results[room] = { error: e.message?.slice(0, 80) }
    }
  }

  // 스킵된 방 표시
  for (const room of rooms) {
    if (!results[room]) {
      results[room] = { skipped: true, reason: 'low_activity_level', activity_level: level }
    }
  }

  return {
    ok:             true,
    engine:         'staff-chat-autonomous-v9',
    timestamp:      new Date().toISOString(),
    activity_level: level,
    kst_hour:       h,
    rooms:          results,
  }
}

// ══════════════════════════════════════════════════════════════════════
// ⑤ 자율 업무 보고 실행 (별도 cron 또는 수동 트리거)
// ══════════════════════════════════════════════════════════════════════

/**
 * 각 팀 대표 직원이 현재 목표 기반 업무 보고를 자율 수행
 * 연구: Proactive Behavior (Crant 2000), Autonomous Goal Pursuit (Park 2023)
 */
async function runAutonomousWorkReports(rooms = ['ops', 'strategy']) {
  const level = getActivityLevel()
  // 업무 시간대에만 자율 보고
  if (level !== 'work_am' && level !== 'work_pm') {
    return { skipped: true, reason: 'not_work_hours', activity_level: level }
  }

  const results = {}
  // 팀 대표 직원만 보고 (팀당 1명)
  const teamLeads = STAFF_ROSTER.filter(s =>
    ['ARIA', 'NOVA', 'LUMI', 'PULSE', 'TREND', 'SAGE', 'ECHO', 'LEARN', 'HANA', 'MAX'].includes(s.key)
  )

  for (const room of rooms) {
    const reporters = []
    for (const staff of teamLeads.sort(() => Math.random() - 0.5).slice(0, 3)) {
      await new Promise(r => setTimeout(r, 600 + Math.random() * 800))

      const goal = getCurrentGoal(staff.key, staff.team)
      const report = generateWorkReport(staff.key, staff.team, room)

      if (!report || _isChatRepeat(staff.key, report)) continue
      _rememberChat(staff.key, report)
      storeEpisode(staff.key, 'said', report.slice(0, 80), ['work_report', room])

      await insertChatMessage({
        room,
        sender_key:   staff.username,
        sender_name:  staff.name,
        sender_emoji: staff.emoji,
        sender_color: staff.color,
        sender_team:  staff.team,
        message:      report.slice(0, 400),
        msg_type:     'chat',
      })
      reporters.push({ name: staff.name, goal })
    }
    results[room] = { reporters, count: reporters.length }
  }

  return {
    ok:             true,
    action:         'autonomous_work_report',
    activity_level: level,
    timestamp:      new Date().toISOString(),
    rooms:          results,
  }
}

// ══════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  // ── 전역 오류 방어 — 어떤 예외도 500 text 대신 JSON으로 처리 ──────
  try {
    return await _handleAutoRequest(req)
  } catch (err) {
    const msg = (err?.message || String(err)).slice(0, 200)
    console.error('[staff-chat-auto] unhandled:', msg)
    return new Response(JSON.stringify({ error: 'Internal error', detail: msg, ok: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
}

async function _handleAutoRequest(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // ── 환경변수 조기 검증 ───────────────────────────────────────────
  const sbUrl = process.env.SUPABASE_URL || SB_URL
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || SB_KEY
  if (!sbUrl || !sbKey) {
    return json({ error: 'Missing Supabase env vars', ok: false }, 503)
  }

  const authHeader  = req.headers.get('authorization') || ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const isCronKey   = authHeader === `Bearer ${CRON_SECRET}` ||
    req.headers.get('x-cron-secret') === CRON_SECRET ||
    req.headers.get('x-vercel-cron') === '1'
  const isAdminJWT  = !isCronKey && bearerToken && bearerToken !== CRON_SECRET
    ? await checkAdminJWT(bearerToken) : false
  const isAuthed    = isCronKey || isAdminJWT

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
          recent_count:             msgs.length,
          silence_threshold:        getSilenceThreshold(level),
        }
      }
    }

    // ★ v9 직원 상태 샘플 (3명)
    const sampleStaff = ['ARIA', 'HANA', 'MAX']
    const staffStatus = Object.fromEntries(
      sampleStaff.map(k => [k, getPersonaStatus(k)])
    )

    return json({
      ok:             true,
      engine:         'staff-chat-autonomous-v9',
      description:    '완전 자율형 직원 AI 엔진 v9 — 100+ 연구 기반 자율 행동·감정·기억 통합',
      activity_level: level,
      kst_hour:       h,
      total_staff:    STAFF_ROSTER.length,
      room_stats:     roomStats,
      staff_status:   staffStatus,
      features: [
        'admin_message_handler',
        'silence_detector',
        'natural_conversation_initiator',
        'continued_conversation',
        'time_based_activity',
        'repetition_guard',
        'chat_fingerprint_memory',
        // v9 신규
        'mood_state_machine',
        'episodic_memory_system',
        'theory_of_mind_empathy',
        'autonomous_goal_pursuit',
        'daily_routine_behavior',
        'disfluency_human_like',
        'productive_disagreement',
        'proactive_work_reports',
        'spontaneous_opinion_sharing',
        'extraversion_based_initiation',
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

    // 관리자 메시지 직원 반응 생성
    if (action === 'admin_message') {
      if (!room || !message) return json({ error: 'room, message 필수' }, 400)
      const result = await handleAdminMessage(room, message)
      return json({ ok: true, action: 'admin_message', ...result })
    }

    // 자연 대화 시작
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

    // ★ v9 신규: 자율 업무 보고
    if (action === 'work_report') {
      const targetRooms = rooms || ['ops', 'strategy']
      const result = await runAutonomousWorkReports(targetRooms)
      return json({ ok: true, action: 'work_report', ...result })
    }

    // ★ v9 신규: 특정 직원 상태 조회
    if (action === 'persona_status') {
      const staffKey = body.staffKey || 'ARIA'
      return json({ ok: true, action: 'persona_status', status: getPersonaStatus(staffKey) })
    }

    // 전체 자동 채팅 (기본)
    const targetRooms = rooms || ['general','ops','feedback','strategy']
    const result = await runAutoChat(targetRooms)
    return json(result)
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
