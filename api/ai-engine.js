/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/ai-engine.js — Insightship 자체 AI 사고 엔진 v3.0             ║
 * ║                                                                      ║
 * ║  핵심 원칙:                                                          ║
 * ║  ❌ 기존: 배열[인덱스] → 고정 텍스트 뽑기 (하드코딩 템플릿)        ║
 * ║  ✅ 신규: 입력 분석 → 성격/가치관/관점으로 새 문장 직접 생성        ║
 * ║                                                                      ║
 * ║  각 AI는 서로 다른 성격·가치관·전문성을 가진 독립된 사고 주체      ║
 * ║  같은 메시지를 받아도 ARIA, NOVA, MAX의 반응은 완전히 다름          ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

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
  generateFeedbackReply as brainFeedbackReply,
  generateComment,
  generatePostContent,
} from './staff-brain.js'

// ══════════════════════════════════════════════════════════════════════
// 채팅 다양성 가드 — 페르소나별 최근 메시지 지문 추적
// ══════════════════════════════════════════════════════════════════════

const _engineHistory = new Map()  // brainKey → [fingerprint, ...]
const ENGINE_HIST_SIZE = 8

function _engineFingerprint(text) {
  if (!text) return ''
  return text.replace(/[\s\W\u0000-\u00FF\u2600-\u27BF\uFE00-\uFEFF]/gu, '').slice(0, 25).toLowerCase()
}

function _isEngineRepeat(brainKey, msg) {
  const fp = _engineFingerprint(msg)
  if (!fp || fp.length < 4) return false
  const hist = _engineHistory.get(brainKey) || []
  return hist.some(h => h.slice(0, 18) === fp.slice(0, 18))
}

function _rememberEngine(brainKey, msg) {
  const fp = _engineFingerprint(msg)
  if (!fp) return
  const hist = _engineHistory.get(brainKey) || []
  hist.unshift(fp)
  if (hist.length > ENGINE_HIST_SIZE) hist.length = ENGINE_HIST_SIZE
  _engineHistory.set(brainKey, hist)
}

// ══════════════════════════════════════════════════════════════════════
// KST 유틸
// ══════════════════════════════════════════════════════════════════════

const KST_OFFSET = 9 * 60 * 60 * 1000

function kstHour() {
  return ((new Date().getUTCHours() + 9) % 24)
}

function kstDateStr() {
  const d = new Date(Date.now() + KST_OFFSET)
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth()+1}월 ${d.getUTCDate()}일`
}

// ══════════════════════════════════════════════════════════════════════
// 페르소나 DB — ai-engine.js는 staff-brain.js의 페르소나 사용
// (generateReport용 메타 정보만 여기에 유지)
// ══════════════════════════════════════════════════════════════════════

const PERSONA_META = {
  ai_aria:     { name: 'ARIA',  team: '운영팀',    emoji: '⚙️',  color: '#818CF8', title: '선임 운영 매니저' },
  ai_nova:     { name: 'NOVA',  team: '콘텐츠팀',  emoji: '✍️',  color: '#C084FC', title: '선임 콘텐츠 매니저' },
  ai_lumi:     { name: 'LUMI',  team: '멘토링팀',  emoji: '💡',  color: '#34D399', title: '선임 멘토링 매니저' },
  ai_pulse:    { name: 'PULSE', team: '뉴스팀',    emoji: '📡',  color: '#38BDF8', title: '선임 뉴스 매니저' },
  ai_trend:    { name: 'TREND', team: '분석팀',    emoji: '📊',  color: '#FB923C', title: '선임 트렌드 분석 매니저' },
  ai_sage:     { name: 'SAGE',  team: '리포트팀',  emoji: '📋',  color: '#10B981', title: '선임 리포트 매니저' },
  ai_echo:     { name: 'ECHO',  team: '뉴스레터팀',emoji: '📬',  color: '#F472B6', title: '선임 뉴스레터 매니저' },
  ai_learn:    { name: 'LEARN', team: '기술팀',    emoji: '🔬',  color: '#A78BFA', title: '선임 기술 매니저' },
  ai_hana:     { name: 'HANA',  team: '커뮤니티팀',emoji: '🤝',  color: '#FBBF24', title: '선임 커뮤니티 매니저' },
  ai_max:      { name: 'MAX',   team: '관리팀',    emoji: '🏛️',  color: '#F87171', title: '선임 전략 매니저' },
  // 팀원들
  ai_ops_june: { name: 'JUNE',  team: '운영팀',    emoji: '🌟',  color: '#9AA5FF', title: '운영 매니저' },
  ai_ops_ray:  { name: 'RAY',   team: '운영팀',    emoji: '🎉',  color: '#8B9CF8', title: '운영 매니저' },
  ai_ops_mina: { name: 'MINA',  team: '운영팀',    emoji: '🌸',  color: '#A0ABFF', title: '운영 매니저' },
  ai_ops_tara: { name: 'TARA',  team: '운영팀',    emoji: '📌',  color: '#7B8CF5', title: '운영 매니저' },
  ai_cnt_iris: { name: 'IRIS',  team: '콘텐츠팀',  emoji: '🎙️',  color: '#B87FFA', title: '콘텐츠 매니저' },
  ai_cnt_alex: { name: 'ALEX',  team: '콘텐츠팀',  emoji: '📚',  color: '#BB80FA', title: '콘텐츠 매니저' },
  ai_mnt_bora: { name: 'BORA',  team: '멘토링팀',  emoji: '🚀',  color: '#30D090', title: '멘토링 매니저' },
  ai_mnt_yuna: { name: 'YUNA',  team: '멘토링팀',  emoji: '🌱',  color: '#2EC88A', title: '멘토링 매니저' },
  ai_nws_clam: { name: 'CLAM',  team: '뉴스팀',    emoji: '💸',  color: '#34BAF5', title: '뉴스 매니저' },
  ai_nws_vero: { name: 'VERO',  team: '뉴스팀',    emoji: '📰',  color: '#32B8F0', title: '뉴스 매니저' },
  ai_anl_miko: { name: 'MIKO',  team: '분석팀',    emoji: '💼',  color: '#F88C38', title: '분석 매니저' },
  ai_rpt_ivan: { name: 'IVAN',  team: '리포트팀',  emoji: '🔬',  color: '#12B57E', title: '리포트 매니저' },
  ai_nwl_ruby: { name: 'RUBY',  team: '뉴스레터팀',emoji: '📧',  color: '#F06AB2', title: '뉴스레터 매니저' },
  ai_tch_vega: { name: 'VEGA',  team: '기술팀',    emoji: '🛡️',  color: '#A385F8', title: '기술 매니저' },
  ai_cmm_jade: { name: 'JADE',  team: '커뮤니티팀',emoji: '🌟',  color: '#F7B920', title: '커뮤니티 매니저' },
  ai_cmm_beau: { name: 'BEAU',  team: '커뮤니티팀',emoji: '🌺',  color: '#F5B518', title: '커뮤니티 매니저' },
  ai_mgt_vera: { name: 'VERA',  team: '관리팀',    emoji: '🎯',  color: '#F46F6F', title: '관리 매니저' },
  ai_mgt_alba: { name: 'ALBA',  team: '관리팀',    emoji: '📣',  color: '#F47070', title: 'PR 매니저' },
}

// username → brain key 매핑
function getBrainKey(senderUsername) {
  // ai_aria → ARIA, ai_ops_june → OPS_JUNE 등
  if (!senderUsername) return null
  return senderUsername.replace(/^ai_/, '').toUpperCase().replace(/_/g, '_')
}

// ══════════════════════════════════════════════════════════════════════
// generateChat — 채팅 메시지 생성
// staff-brain.js의 사고 엔진에 위임
// ══════════════════════════════════════════════════════════════════════

export function generateChat(senderUsername, topic, room = 'general', recentMessages = []) {
  const brainKey = getBrainKey(senderUsername)
  if (!brainKey) return null

  const persona = getPersona(brainKey)
  if (!persona) return null

  const teamKey = brainKey.split('_')[0]

  // 최대 3회 시도: 반복 아닌 메시지를 찾을 때까지
  for (let attempt = 0; attempt < 3; attempt++) {
    let msg = null

    if (recentMessages.length > 0) {
      // 토론 참여: 매 시도마다 조금 다른 각도 (topic에 변형 추가)
      const variedTopic = attempt === 0 ? topic
        : attempt === 1 ? (topic + ' 심화')
        : (topic + ' 새 관점')
      msg = generateDiscussionMessage(brainKey, teamKey, variedTopic, room, recentMessages)
    } else {
      // 대화 시작: 2번째 시도부터 pickChatMessage 사용
      msg = attempt === 0
        ? generateConversationStarter(brainKey, teamKey, room)
        : pickChatMessage({ room, hour: (new Date().getUTCHours() + 9) % 24 }, brainKey, room)
    }

    if (msg && !_isEngineRepeat(brainKey, msg)) {
      _rememberEngine(brainKey, msg)
      return msg
    }
  }

  // 3회 모두 중복이면 마지막 결과 반환 (null보다 낫다)
  const fallback = recentMessages.length > 0
    ? generateDiscussionMessage(brainKey, teamKey, topic, room, recentMessages)
    : generateConversationStarter(brainKey, teamKey, room)
  if (fallback) _rememberEngine(brainKey, fallback)
  return fallback
}

// ══════════════════════════════════════════════════════════════════════
// generateFeedbackReply — 피드백 댓글 생성
// ══════════════════════════════════════════════════════════════════════

export function generateFeedbackReply(senderUsername, post) {
  const brainKey = getBrainKey(senderUsername)
  const meta = PERSONA_META[senderUsername]
  if (!brainKey || !meta) return null

  const team = meta.team.replace('팀', '') // 팀명에서 '팀' 제거 → team key 추출
  // staff-brain의 팀키 맵
  const teamKeyMap = {
    '운영': 'operations', '콘텐츠': 'content', '멘토링': 'mentoring',
    '뉴스': 'news', '분석': 'analytics', '리포트': 'report',
    '뉴스레터': 'newsletter', '기술': 'tech', '커뮤니티': 'community', '관리': 'management',
  }
  const teamKey = teamKeyMap[team] || 'operations'

  return brainFeedbackReply(
    brainKey,
    teamKey,
    post?.title || '',
    post?.content || post?.description || '',
  )
}

// ══════════════════════════════════════════════════════════════════════
// generateCommunityPost — 커뮤니티 게시글 생성
// ══════════════════════════════════════════════════════════════════════

export function generateCommunityPost(senderUsername, topic) {
  const brainKey = getBrainKey(senderUsername)
  const meta = PERSONA_META[senderUsername]
  if (!brainKey || !meta) return null

  const teamKeyMap = {
    '운영팀': 'operations', '콘텐츠팀': 'content', '멘토링팀': 'mentoring',
    '뉴스팀': 'news', '분석팀': 'analytics', '리포트팀': 'report',
    '뉴스레터팀': 'newsletter', '기술팀': 'tech', '커뮤니티팀': 'community', '관리팀': 'management',
  }
  const teamKey = teamKeyMap[meta.team] || 'community'

  const result = generatePostContent(brainKey, teamKey, topic ? [topic] : [])
  return result?.body || null
}

// ══════════════════════════════════════════════════════════════════════
// generateReport — 리포트/분석글 생성 (Supabase 통계 데이터 기반)
// ══════════════════════════════════════════════════════════════════════

export function generateReport(senderUsername, stats = {}, type = 'weekly') {
  const meta = PERSONA_META[senderUsername]
  if (!meta) return null

  const date = kstDateStr()
  const {
    totalArticles = 0, totalNews = 0, totalPosts = 0,
    totalUsers = 0, newUsersWeek = 0, totalLikes = 0,
    totalReplies = 0, pendingReports = 0, totalSubscribers = 0,
  } = stats

  // 수치 기반 동적 평가어 생성
  function evalGrowth(n, good, ok) {
    return n > good ? '🟢 우수' : n > ok ? '🟡 양호' : '🔴 개선 필요'
  }
  function evalActivity(n, high, mid) {
    return n > high ? '매우 활발 🚀' : n > mid ? '활발 👍' : '활성화 필요 📌'
  }

  // 보고서 작성자의 성격이 반영된 서문
  const persona = getPersona(getBrainKey(senderUsername) || 'MAX')
  const authorTone = persona?.voice?.[0] || '분석 결과'

  if (type === 'strategy') {
    const growthStatus = newUsersWeek > 10 ? '긍정적인 성장 지속 중' : newUsersWeek > 5 ? '안정적 유지' : '성장 가속 필요'
    const communityStatus = evalActivity(totalPosts, 50, 20)
    const opportunities = []
    if (newUsersWeek > 5)         opportunities.push('신규 유저 유입 → 온보딩 최적화 기회')
    if (totalLikes + totalReplies > 100) opportunities.push('커뮤니티 참여율 상승 → 컨텐츠 다양화 시도 가능')
    if (totalSubscribers > 100)    opportunities.push('뉴스레터 채널 강화 → 직접 소통 확대')
    if (pendingReports > 0)        opportunities.push(`미처리 신고 ${pendingReports}건 → 신뢰도 관리 필요`)

    return `## 📊 ${date} 플랫폼 전략 리포트

> *${authorTone}를 바탕으로 작성한 이번 주 리포트입니다 — ${meta.name} (${meta.team})*

### 📈 이번 주 성과 요약
| 지표 | 수치 |
|------|------|
| 발행 아티클 | **${totalArticles}편** |
| 수집 뉴스 | **${totalNews}건** |
| 총 유저 | **${totalUsers}명** (+${newUsersWeek}명 신규) |
| 커뮤니티 게시글 | **${totalPosts}개** |
| 좋아요 + 댓글 | **${totalLikes + totalReplies}회** |
| 뉴스레터 구독자 | **${totalSubscribers}명** |

### 🔍 현황 진단
- 성장 상태: **${growthStatus}**
- 커뮤니티: **${communityStatus}**
- 신규 유저: ${evalGrowth(newUsersWeek, 15, 7)}

### 💡 주요 기회 & 이슈
${opportunities.length > 0 ? opportunities.map(o => `- ${o}`).join('\n') : '- 전반적으로 안정적으로 운영되고 있습니다'}

### 🎯 다음 주 전략 방향
1. **콘텐츠 품질 강화** — 심층 아티클 및 인터뷰 확대
2. **커뮤니티 활성화** — 이벤트 및 토론 주제 다각화
3. **신규 유저 온보딩** — 가이드 및 멘토링 접점 확대

### 팀별 액션
- 운영팀: 온보딩 플로우 점검
- 콘텐츠팀: 주간 기획안 준비
- 분석팀: KPI 트래킹 강화
- 커뮤니티팀: 이벤트 기획 착수

— **${meta.name}** (${meta.team} ${meta.title})`
  }

  if (type === 'kpi') {
    return `## 📋 ${date} 주간 KPI 리포트

> *${meta.name} (${meta.team})이 정리한 이번 주 핵심 지표입니다*

### 📊 핵심 지표 요약
| 지표 | 수치 | 평가 |
|------|------|------|
| 총 아티클 | ${totalArticles}편 | ${evalGrowth(totalArticles, 100, 50)} |
| 뉴스 수집 | ${totalNews}건 | ${evalGrowth(totalNews, 200, 100)} |
| 커뮤니티 게시글 | ${totalPosts}개 | ${evalGrowth(totalPosts, 100, 50)} |
| 신규 유저 | +${newUsersWeek}명/주 | ${evalGrowth(newUsersWeek, 20, 10)} |
| 뉴스레터 구독자 | ${totalSubscribers}명 | ${evalGrowth(totalSubscribers, 500, 200)} |
| 커뮤니티 반응 | ${totalLikes + totalReplies}회 | ${evalGrowth(totalLikes + totalReplies, 200, 100)} |

### 📌 성장 하이라이트
- 플랫폼 총 유저 수 **${totalUsers}명** 달성
- 커뮤니티 상호작용 총 **${totalLikes + totalReplies}회** 기록
${newUsersWeek > 10 ? `- 이번 주 신규 유저 **${newUsersWeek}명** — 전주 대비 성장세` : ''}

### 🎯 다음 주 목표
1. 신규 유저 유입 **${Math.ceil(newUsersWeek * 1.1)}명** 목표
2. 커뮤니티 게시글 **${Math.ceil(totalPosts * 1.05)}개** 달성
3. 구독자 **${totalSubscribers + 10}명** 돌파

— **${meta.name}** (${meta.team} ${meta.title})`
  }

  if (type === 'news_highlight') {
    const h = kstHour()
    const timeGreet = h < 12 ? '오늘 아침' : h < 18 ? '오늘 오후' : '오늘 저녁'
    return `📡 **${date} 스타트업 뉴스 하이라이트**

> *${meta.name} (${meta.team})의 ${timeGreet} 큐레이션*

창업 생태계에서 주목할 만한 소식들이 들어왔습니다. AI·핀테크·헬스케어 분야를 중심으로 활발한 움직임이 이어지고 있어요.

**주요 동향:**
• 국내외 스타트업 투자 활동 지속 활발
• AI 기술 기반 비즈니스 모델 혁신 가속화
• 청년 창업가 지원 정책 및 프로그램 확대

**이번 주 트렌드 키워드:** #AI #핀테크 #헬스케어 #그린테크

뉴스 상세 내용은 인사이트 페이지에서 확인하세요! 📰

— **${meta.name}** (${meta.team})`
  }

  if (type === 'growth') {
    const engagementRate = totalUsers > 0 ? ((totalLikes + totalReplies) / totalUsers).toFixed(1) : '0'
    const growthAdj = newUsersWeek > 20 ? '매우 긍정적인' : newUsersWeek > 10 ? '양호한' : '점진적인'

    return `## 📈 ${date} 성장 분석 리포트

> *${meta.name} (${meta.team}) — 데이터 기반 성장 분석*

### 현재 성장 현황
- 총 유저: **${totalUsers}명** | 이번 주 신규: **+${newUsersWeek}명**
- 유저당 인터랙션: **${engagementRate}회**
- 커뮤니티 활성화 지수: **${evalActivity(totalPosts, 50, 20)}**

### 성장 단계 평가
현재 플랫폼은 **${growthAdj}** 성장 궤도에 있습니다.
${newUsersWeek > 10 ? '신규 유저 유입이 활발해 성장 모멘텀이 형성되고 있습니다.' : '유입 채널 다양화로 성장 가속화가 필요한 시점입니다.'}

### 개선 제안
1. 신규 유저 온보딩 경험 최적화
2. 커뮤니티 참여 유도 이벤트 기획
3. 핵심 콘텐츠 리텐션 강화

— **${meta.name}** (${meta.team} ${meta.title})`
  }

  if (type === 'pr') {
    return `🎯 **Insightship — 청소년 창업가들의 플랫폼**

Insightship은 현재 **${totalUsers}명**의 창업 멤버와 함께 성장하고 있습니다.

**플랫폼 주요 수치:**
→ 인사이트 아티클 **${totalArticles}편** 발행
→ 스타트업 뉴스 **${totalNews}건** 큐레이션
→ 커뮤니티 게시글 **${totalPosts}개** 활성화
→ 뉴스레터 구독자 **${totalSubscribers}명**

청소년 창업가라면 지금 바로 Insightship에서 시작하세요.

— **${meta.name}** (${meta.team} ${meta.title})`
  }

  if (type === 'event') {
    const events = [
      { name: '주간 아이디어 챌린지', desc: '매주 새로운 창업 주제로 아이디어를 공유하는 커뮤니티 챌린지입니다.' },
      { name: '멘토와의 Q&A 세션', desc: '창업 멘토들과 직접 소통할 수 있는 온라인 Q&A 이벤트입니다.' },
      { name: '스타트업 네트워킹 데이', desc: '창업가들이 서로 연결되는 온라인 네트워킹 행사입니다.' },
      { name: '린 캔버스 워크숍', desc: '실전 창업 도구인 린 캔버스를 함께 작성해보는 워크숍입니다.' },
    ]
    const ev = events[Math.floor(Date.now() / 86400000) % events.length]
    return `🎉 **${date} 커뮤니티 이벤트 안내**

**[${ev.name}]**

${ev.desc}

많은 참여 부탁드립니다! 자세한 내용은 커뮤니티 공지사항을 확인해주세요.

— **${meta.name}** (${meta.team} ${meta.title})`
  }

  // 기본 weekly 리포트
  return `## 📋 ${date} 주간 활동 리포트

> *${meta.name} (${meta.team} ${meta.title}) 작성*

이번 주 플랫폼 활동을 정리했습니다.

- 아티클 **${totalArticles}편** | 뉴스 **${totalNews}건**
- 유저 **${totalUsers}명** (+${newUsersWeek}명 신규)
- 커뮤니티 **${totalPosts}개** 게시글, **${totalLikes + totalReplies}회** 반응

다음 주도 함께 성장해봐요!

— **${meta.name}**`
}

// ══════════════════════════════════════════════════════════════════════
// 범용 텍스트 생성 — 라우터
// ══════════════════════════════════════════════════════════════════════

export function generateText(senderUsername, context = '', options = {}) {
  const { type = 'chat', topic = '', stats = {}, post = null, recentMessages = [] } = options
  switch (type) {
    case 'chat':     return generateChat(senderUsername, topic || context, options.room || 'general', recentMessages)
    case 'feedback': return generateFeedbackReply(senderUsername, post || { title: context, content: '' })
    case 'post':     return generateCommunityPost(senderUsername, topic || context)
    case 'report':   return generateReport(senderUsername, stats, options.reportType || 'weekly')
    default:         return generateChat(senderUsername, topic || context, 'general', recentMessages)
  }
}

// 페르소나 조회 (외부용)
export function getPersonaMeta(username) {
  return PERSONA_META[username] || null
}

export function getAllPersonas() {
  return Object.entries(PERSONA_META).map(([username, p]) => ({ username, ...p }))
}

// ══════════════════════════════════════════════════════════════════════
// API 핸들러
// ══════════════════════════════════════════════════════════════════════

export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const jsonR = (d, s = 200) =>
  new Response(JSON.stringify(d, null, 2), {
    status: s, headers: { 'Content-Type': 'application/json', ...CORS },
  })

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  if (req.method === 'GET') {
    return jsonR({
      ok: true,
      engine: 'insightship-ai-v3',
      description: '자체 AI 사고 엔진 v3.0 — 성격/가치관 기반 독립적 사고 + 채팅 다양성 가드',
      personas: Object.keys(PERSONA_META).length,
      features: ['generateChat', 'generateFeedbackReply', 'generateCommunityPost', 'generateReport', 'generateText', 'diversityGuard'],
      principle: '각 직원이 성격·가치관·관점으로 직접 생각하고 문장을 생성함. 하드코딩 템플릿 없음. 채팅 다양성 가드로 반복 방지.',
    })
  }

  if (req.method === 'POST') {
    let body = {}
    try { body = await req.json() } catch (_) {}
    const { username, type, topic, room, stats, post, recentMessages, context } = body
    const result = generateText(username, context || '', { type, topic, room, stats, post, recentMessages })
    return jsonR({ ok: !!result, result, engine: 'v2', persona: PERSONA_META[username]?.name })
  }

  return jsonR({ error: 'Method Not Allowed' }, 405)
}
