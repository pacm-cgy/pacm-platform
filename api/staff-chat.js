/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/staff-chat.js — 직원 전용 채팅방 API v3.0                      ║
 * ║                                                                      ║
 * ║  기능:                                                               ║
 * ║  - GET  ?room=general|ops|task  채팅 메시지 조회                    ║
 * ║  - POST { room, sender_key, message, msg_type }  메시지 전송        ║
 * ║  - POST { action:'ai_discuss', topic }  AI 직원 자동 토론 생성      ║
 * ║  - DELETE (관리자) 메시지 삭제                                      ║
 * ║                                                                      ║
 * ║  v3.0: _staff-brain.js 의존성 완전 제거 → 인라인 AI 엔진           ║
 * ║         (Vercel Node.js 24 FUNCTION_INVOCATION_FAILED 근본 해결)    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
// NO external imports from _staff-brain.js — all inlined below
export const config = { maxDuration: 30 }

// ── 입력값 sanitize ──────────────────────────────────────────────────
function sanitizeText(v, maxLen = 2000) {
  if (typeof v !== 'string') return ''
  return v
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/['";\\]/g, c => ({ "'": '\u2019', '"': '\u201C', ';': '\uFF1B', '\\': '\uFF3C' }[c] ?? c))
    .slice(0, maxLen)
    .trim()
}

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET
const APP_URL     =
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
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
// AI 직원 메타데이터
// ══════════════════════════════════════════════════════════════════════

const AI_STAFF = {
  ARIA:  { username:'ai_aria',     name:'ARIA',  emoji:'⚙️',  team:'운영팀',    color:'#818CF8', title:'선임 매니저' },
  NOVA:  { username:'ai_nova',     name:'NOVA',  emoji:'✍️',  team:'콘텐츠팀',  color:'#C084FC', title:'선임 매니저' },
  LUMI:  { username:'ai_lumi',     name:'LUMI',  emoji:'💡',  team:'멘토링팀',  color:'#34D399', title:'선임 매니저' },
  PULSE: { username:'ai_pulse',    name:'PULSE', emoji:'📡',  team:'뉴스팀',    color:'#38BDF8', title:'선임 매니저' },
  TREND: { username:'ai_trend',    name:'TREND', emoji:'📊',  team:'분석팀',    color:'#FB923C', title:'선임 매니저' },
  SAGE:  { username:'ai_sage',     name:'SAGE',  emoji:'📋',  team:'리포트팀',  color:'#10B981', title:'선임 매니저' },
  ECHO:  { username:'ai_echo',     name:'ECHO',  emoji:'📬',  team:'뉴스레터팀',color:'#F472B6', title:'선임 매니저' },
  LEARN: { username:'ai_learn',    name:'LEARN', emoji:'🔬',  team:'기술팀',    color:'#A78BFA', title:'선임 매니저' },
  HANA:  { username:'ai_hana',     name:'HANA',  emoji:'🤝',  team:'커뮤니티팀',color:'#FBBF24', title:'선임 매니저' },
  MAX:   { username:'ai_max',      name:'MAX',   emoji:'🏛️',  team:'관리팀',    color:'#F87171', title:'선임 매니저' },
  JUNE:  { username:'ai_ops_june', name:'JUNE',  emoji:'🌟',  team:'운영팀',    color:'#9AA5FF', title:'매니저' },
  RAY:   { username:'ai_ops_ray',  name:'RAY',   emoji:'🎉',  team:'운영팀',    color:'#8B9CF8', title:'매니저' },
  IRIS:  { username:'ai_cnt_iris', name:'IRIS',  emoji:'🎙️',  team:'콘텐츠팀',  color:'#B87FFA', title:'매니저' },
  ALEX:  { username:'ai_cnt_alex', name:'ALEX',  emoji:'📚',  team:'콘텐츠팀',  color:'#BB80FA', title:'매니저' },
  BORA:  { username:'ai_mnt_bora', name:'BORA',  emoji:'🚀',  team:'멘토링팀',  color:'#30D090', title:'매니저' },
  CLAM:  { username:'ai_nws_clam', name:'CLAM',  emoji:'💸',  team:'뉴스팀',    color:'#34BAF5', title:'매니저' },
  MIKO:  { username:'ai_anl_miko', name:'MIKO',  emoji:'💼',  team:'분석팀',    color:'#F88C38', title:'매니저' },
  IVAN:  { username:'ai_rpt_ivan', name:'IVAN',  emoji:'🔬',  team:'리포트팀',  color:'#12B57E', title:'매니저' },
  RUBY:  { username:'ai_nwl_ruby', name:'RUBY',  emoji:'📧',  team:'뉴스레터팀',color:'#F06AB2', title:'매니저' },
  VEGA:  { username:'ai_tch_vega', name:'VEGA',  emoji:'🛡️',  team:'기술팀',    color:'#A385F8', title:'매니저' },
  JADE:  { username:'ai_cmm_jade', name:'JADE',  emoji:'🌟',  team:'커뮤니티팀',color:'#F7B920', title:'매니저' },
  VERA:  { username:'ai_mgt_vera', name:'VERA',  emoji:'🎯',  team:'관리팀',    color:'#F46F6F', title:'매니저' },
  ALBA:  { username:'ai_mgt_alba', name:'ALBA',  emoji:'📣',  team:'관리팀',    color:'#F47070', title:'매니저' },
}

const ROOMS = {
  general:  { label:'전체 채팅',  emoji:'💬', desc:'모든 직원이 소통하는 전체 채팅방' },
  ops:      { label:'업무 지시',  emoji:'📋', desc:'업무 지시·하달·보고 전용 채널' },
  feedback: { label:'피드백 대응',emoji:'📥', desc:'유저 피드백 검토 및 대응 채널' },
  strategy: { label:'전략 회의',  emoji:'🎯', desc:'플랫폼 전략·개선·기획 토론 채널' },
}

// ══════════════════════════════════════════════════════════════════════
// 인라인 AI 채팅 엔진 (경량화 버전 — _staff-brain.js 의존 없음)
// ══════════════════════════════════════════════════════════════════════

function _getKSTHour() {
  return (new Date().getUTCHours() + 9) % 24
}

// 페르소나 정의 (채팅 메시지 생성에 필요한 핵심 속성만)
const PERSONA = {
  ARIA:     { style:'formal_warm', values:['체계','책임','팀워크'],       voice:['확인했습니다','진행하겠습니다','공유드릴게요'],    emoji:'⚙️',  lens:'운영 효율과 안정성' },
  OPS_JUNE: { style:'cheerful',   values:['긍정','속도','실행'],          voice:['넵!','바로요!','완료!'],                         emoji:'🌟',  lens:'빠른 실행과 팀 활기' },
  OPS_RAY:  { style:'casual',     values:['현실적 접근','실용성'],        voice:['그렇죠','맞아요','오케이'],                       emoji:'🎉',  lens:'현장에서 실제 작동하는가' },
  NOVA:     { style:'creative',   values:['창의성','콘텐츠 품질','독자'], voice:['흥미롭네요','이 관점에서 보면','스토리가 있어요'], emoji:'✍️',  lens:'독자에게 어떤 가치를 주는가' },
  CNT_IRIS: { style:'expressive', values:['표현','감성','공감'],          voice:['와!','정말요?','공감해요!'],                      emoji:'🎙️',  lens:'사람의 이야기와 감정' },
  CNT_ALEX: { style:'intellectual',values:['깊이','정확성','데이터'],     voice:['연구에 따르면','사례를 보면','실증적으로'],        emoji:'📚',  lens:'근거와 데이터가 있는가' },
  LUMI:     { style:'wise',       values:['성장','경험','지혜'],          voice:['제 경험상','중요한 것은','한 가지 팁은'],          emoji:'💡',  lens:'이 사람이 진짜 무엇을 필요로 하는가' },
  MNT_BORA: { style:'warm',       values:['도전','열정','행동'],          voice:['도전해봐요!','할 수 있어요!','지금이 기회예요'],   emoji:'🚀',  lens:'지금 바로 할 수 있는 것' },
  PULSE:    { style:'fast_news',  values:['속도','정확성','트렌드'],      voice:['속보','방금 확인했는데','최신 동향으로는'],        emoji:'📡',  lens:'지금 가장 중요한 정보' },
  NWS_CLAM: { style:'brief',      values:['투자','숫자','실용'],          voice:['투자 관점에서는','숫자로 보면'],                  emoji:'💸',  lens:'돈의 흐름이 어디로 가는가' },
  TREND:    { style:'analytical', values:['데이터','패턴','예측'],        voice:['데이터를 보면','트렌드 상으로는','패턴이 보이는데'],emoji:'📊',  lens:'데이터가 무엇을 말하는가' },
  ANL_MIKO: { style:'intellectual',values:['상관관계','시장 구조'],       voice:['상관관계','통계적으로','구조적으로 보면'],         emoji:'💼',  lens:'표면 뒤에 있는 구조' },
  SAGE:     { style:'formal_wise',values:['종합','균형','심층 분석'],     voice:['종합해보면','리포트 기준으로','균형 잡힌 시각에서'],emoji:'📋', lens:'전체 그림이 어떻게 연결되는가' },
  RPT_IVAN: { style:'formal',     values:['정확성','일관성','데이터'],    voice:['보고드립니다','확인했습니다','검증됐습니다'],       emoji:'🔬',  lens:'데이터가 정확하고 일관성이 있는가' },
  ECHO:     { style:'friendly_media',values:['독자','큐레이션','콘텐츠'],voice:['독자 여러분','이번 주 하이라이트','꼭 읽어보세요'],emoji:'📬',  lens:'독자가 무엇을 얻는가' },
  NWL_RUBY: { style:'warm',       values:['독자 연결','공감','따뜻한 글'],voice:['예쁜 콘텐츠 만들어요','따뜻하게','함께해요'],     emoji:'📧',  lens:'독자가 기분 좋아지는가' },
  LEARN:    { style:'technical',  values:['기술','시스템 안정성','AI'],   voice:['시스템 상으로','기술적으로','성능 데이터에서'],    emoji:'🔬',  lens:'시스템이 올바르게 작동하는가' },
  TCH_VEGA: { style:'analytical', values:['보안','안정성','최적화'],      voice:['퍼포먼스 보면','최적화하면','보안 관점에서'],      emoji:'🛡️',  lens:'시스템 보안과 안정성' },
  HANA:     { style:'community_warm',values:['커뮤니티','포용성','연결'], voice:['멤버분들','함께해요!','모두가 소중해요'],           emoji:'🤝',  lens:'커뮤니티를 더 건강하게 만드는가' },
  CMM_JADE: { style:'cheerful',   values:['에너지','열정','행사'],        voice:['환영해요!','좋아요!','파이팅!'],                  emoji:'🌟',  lens:'지금 분위기가 살아있는가' },
  MAX:      { style:'leader',     values:['전략','장기 비전','팀 조율'],  voice:['전략적으로','팀 관점에서','큰 그림에서'],          emoji:'🏛️',  lens:'플랫폼 장기 성장에 도움이 되는가' },
  MGT_VERA: { style:'formal',     values:['목표','실행력','성과'],        voice:['목표 달성을 위해','성과 기준으로'],                emoji:'🎯',  lens:'목표에 얼마나 기여하는가' },
  MGT_ALBA: { style:'pr_style',   values:['브랜드','PR','스토리텔링'],    voice:['브랜드 관점에서','대외적으로','홍보적으로'],       emoji:'📣',  lens:'외부에서 어떻게 볼 것인가' },
}
const DEFAULT_PERSONA = {
  style:'casual', values:['소통','팀워크'], voice:['네','맞아요','감사해요'], emoji:'💬', lens:'함께 잘 해나가는 것',
}

function _getPersona(key) {
  return PERSONA[key] || DEFAULT_PERSONA
}

// brain key 변환: ai_aria → ARIA, ai_ops_june → OPS_JUNE
function _getBrainKey(username) {
  if (!username) return null
  return username.replace(/^ai_/, '').toUpperCase()
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

const TEAM_EMOJIS = {
  operations:'⚙️', content:'✍️', mentoring:'💡', news:'📡',
  analytics:'📊',  report:'📋',  newsletter:'📬', tech:'🔬',
  community:'🤝',  management:'🏛️',
}

// 인라인 채팅 메시지 생성 (성격 기반 간소화 버전)
const _chatHistory = new Map()
function _fingerprint(text) {
  return (text || '').replace(/\s+/g, '').slice(0, 20).toLowerCase()
}
function _isRepeat(key, msg) {
  const fp = _fingerprint(msg)
  const hist = _chatHistory.get(key) || []
  return hist.some(h => h === fp)
}
function _remember(key, msg) {
  const fp = _fingerprint(msg)
  const hist = _chatHistory.get(key) || []
  hist.unshift(fp)
  if (hist.length > 6) hist.length = 6
  _chatHistory.set(key, hist)
}

// 키워드 추출
function _extractKeywords(text) {
  if (!text) return []
  const stop = new Set(['이','가','을','를','은','는','의','에','에서','와','과','도','로','그','하는','있는','없는','된','한'])
  return text.split(/[\s,\.!?~\-\[\](){}]+/)
    .filter(w => w.length >= 2 && !stop.has(w))
    .slice(0, 5)
}

// 성격 기반 메시지 생성
function _generateMsg(brainKey, topic, room, priorMessages = []) {
  const persona = _getPersona(brainKey)
  const h = _getKSTHour()
  const kws = _extractKeywords(topic)
  const kw1 = kws[0] || topic.slice(0, 8) || '이 주제'
  const kw2 = kws[1] || ''
  const cv  = persona.values[Math.floor(Math.random() * persona.values.length)]
  const vw  = persona.voice[Math.floor(Math.random() * persona.voice.length)]
  const em  = persona.emoji || '💬'
  const teamEm = TEAM_EMOJIS[_BRAIN_TEAM_MAP[brainKey] || 'operations'] || ''
  const timeCtx = h < 10 ? '오전' : h < 14 ? '오후' : h < 18 ? '이번 오후' : '저녁'
  const hasKw2 = kw2 && kw2 !== kw1

  // 이전 메시지 참조
  const lastMsg = priorMessages[priorMessages.length - 1]
  const refPhrase = lastMsg?.message && Math.random() > 0.65
    ? `${lastMsg.sender_name}님 말씀처럼, ` : ''

  // 스타일별 메시지 패턴 (각 스타일당 4~6가지 패턴)
  const patterns = {
    formal_warm: [
      `${em} ${refPhrase}${kw1} 관련 상황 모니터링하고 있습니다. ${cv} 기준으로 접근할게요.`,
      `${em} ${vw} ${kw1} 건 팀과 공유하고 처리하겠습니다.`,
      `${em} ${timeCtx} ${hasKw2 ? `${kw1}과 ${kw2}` : kw1}를 함께 검토해서 방향 잡겠습니다.`,
      `${em} ${refPhrase}${kw1} 현황 파악해서 업데이트 드리겠습니다. ${cv}이 핵심입니다.`,
      `${em} 오늘 팀 분위기 너무 좋은 것 같아요! 그리고 ${kw1}에 대해서 ${cv} 관점으로 한마디 해도 될까요?`,
    ],
    cheerful: [
      `${em} ${vw} ${kw1} 바로 챙길게요! ${cv}이 제일 중요하다고 생각하거든요!`,
      `${em} ${refPhrase}${hasKw2 ? `${kw1}이랑 ${kw2}` : kw1} 다 처리할게요! 파이팅!`,
      `${em} ${kw1} 얘기 너무 좋아요! 팀이랑 다같이 나눠봐도 될 것 같아요!`,
      `${em} ${timeCtx}에 ${kw1} 기운 넘쳐요! ${cv}을 생각하면서 진행할게요!`,
    ],
    casual: [
      `${em} ${refPhrase}${kw1}${hasKw2 ? `이랑 ${kw2}` : ''} — ${cv} 관점에서 정리가 좀 필요하겠는데요.`,
      `${em} 솔직히 ${kw1} 문제는 생각보다 쉽지 않은 문제긴 해요. ${cv} 부분이 핵심인 것 같아요.`,
      `${em} 그렇죠, ${kw1}은 맞는데, 현실에서 실제로 굴러가는 걸 보면 좀 달라요.`,
      `${em} ${kw1} 확인했어요. ${cv} 관점에서 처리해볼게요.`,
    ],
    warm: [
      `${em} ${refPhrase}${kw1} 정말 잘 말씀해주셨어요. ${cv}이 있으면 분명히 잘 될 거예요.`,
      `${em} ${hasKw2 ? `${kw1}이랑 ${kw2}` : kw1}, 팀원들한테도 중요한 이야기일 것 같아요. ${cv}을 함께 나눠요.`,
      `${em} ${timeCtx}에 모두들 잘 지내고 있죠? ${cv}을 생각하며 오늘도 좋은 하루 만들어봐요.`,
      `${em} ${refPhrase}${kw1} 때문에 많이 힘드셨을 것 같아요. 같이 해결해봐요, 괜찮아요.`,
    ],
    creative: [
      `${em} ${refPhrase}${kw1}${hasKw2 ? `과 ${kw2}` : ''}를 연결하면 콘텐츠적으로 꽤 흥미로운 서사가 만들어질 것 같아요.`,
      `${em} ${kw1}의 이면에 있는 이야기를 들여다보면 더 깊은 의미가 있을 것 같아요.`,
      `${em} ${kw1}을 스토리로 풀면 독자들이 훨씬 더 공감할 수 있을 것 같아요.`,
      `${em} ${cv} 관점에서 ${kw1}을 재해석하면 콘텐츠 방향이 달라져요.`,
    ],
    expressive: [
      `${em} 와, ${kw1}${hasKw2 ? `이랑 ${kw2}` : ''} 이야기 들으니까 진짜 두근두근해요!! 이런 거 너무 좋아요!`,
      `${em} ${refPhrase}${kw1} 이야기 들으면서 진짜 엄청 공감됐어요! ${cv}이 딱 느껴지는 순간이더라고요!`,
      `${em} ${kw1} 얘기 나올 줄 알았어요! 저도 똑같이 느꼈거든요!`,
      `${em} ${hasKw2 ? `${kw1}이랑 ${kw2}` : kw1} 같이 나오니까 진짜 흥미롭잖아요! 더 들어보고 싶어요!`,
    ],
    intellectual: [
      `${em} ${refPhrase}${hasKw2 ? `${kw1}과 ${kw2}의 상관관계` : `${kw1}`}를 실증적으로 분석해보면, ${cv} 관련 패턴이 유의미하게 나타나요.`,
      `${em} ${kw1}에 대한 기존 사례들을 보면, 단순히 보이는 것보다 구조적 원인이 복잡해요.`,
      `${em} ${kw1}에 관한 데이터를 더 보면 ${cv} 측면에서 흥미로운 패턴이 있어요.`,
      `${em} ${hasKw2 ? `${kw1}과 ${kw2}를 교차 분석해보면` : `${kw1}을 자세히 보면`} ${cv}과 연결되는 지점이 보여요.`,
    ],
    wise: [
      `${em} ${refPhrase}${kw1}에 대해 진짜로 중요한 건 표면에 보이는 것 너머에 있어요. ${cv}이 그 핵심이에요.`,
      `${em} 여러 케이스를 보다 보면, ${hasKw2 ? `${kw1}이랑 ${kw2}` : kw1}를 같이 보면 결국 ${cv}으로 귀결되더라고요.`,
      `${em} 제 경험상 ${kw1} 같은 상황에서 ${cv}이 있으면 반드시 길이 보인다는 거예요.`,
      `${em} ${kw1}에 대한 제 관점은 이래요 — ${cv}이 있으면 어떤 방향이든 맞아 떨어지더라고요.`,
    ],
    fast_news: [
      `${em} ${refPhrase}${timeCtx} 기준으로 ${kw1}${hasKw2 ? `과 ${kw2}` : ''} 최신 흐름을 보면, 흥미로운 시그널이 포착되고 있어요.`,
      `${em} ${kw1} 트렌드를 모니터링하면 변화가 감지돼요. 계속 주시할게요.`,
      `${em} ${kw1}에 대한 최신 시그널이 방금 들어왔는데, 방향이 달라지고 있어요.`,
      `${em} 최신 데이터 기준으로 ${kw1} 추세를 먼저 확인할게요. ${cv} 측면에서 보면 의미가 있어요.`,
    ],
    brief: [
      `${em} ${kw1}. ${cv} 확인. 진행.`,
      `${em} ${hasKw2 ? `${kw1} + ${kw2}` : kw1}. ${cv} 기준으로 처리.`,
      `${em} 파악. ${kw1} 처리.`,
    ],
    analytical: [
      `${em} ${refPhrase}${hasKw2 ? `${kw1}과 ${kw2}의 패턴을 분석해보면` : `${kw1}의 데이터 분포를 보면`}, ${cv} 관련 이상 신호가 보여요.`,
      `${em} ${kw1} 수치를 더 세밀하게 쪼개보면 ${cv}에서 핵심이 드러날 거예요.`,
      `${em} ${hasKw2 ? `${kw1}과 ${kw2}` : kw1} 지표를 교차 분석하면 ${cv}에서 패턴이 나와요.`,
      `${em} ${kw1} 데이터 기반으로 보면 ${cv}이 가장 중요한 변수예요.`,
    ],
    formal: [
      `${em} ${kw1} 건은 내부 프로세스에 따라 처리하겠습니다.`,
      `${em} ${refPhrase}${hasKw2 ? `${kw1} 및 ${kw2}` : kw1} 관련 사항, 절차에 따라 검토 후 보고드리겠습니다.`,
      `${em} ${kw1} 관련하여 규정에 따라 검토하겠습니다. ${cv} 기준으로 처리합니다.`,
    ],
    formal_wise: [
      `${em} ${refPhrase}${hasKw2 ? `${kw1}과 ${kw2}를 종합해보면` : `${kw1}을 전체 맥락에서 종합하면`}, ${cv}이 핵심 연결고리예요.`,
      `${em} ${kw1}에 대한 리포트 기준 판단은, ${cv}이 이번 주 핵심 포인트예요.`,
      `${em} ${hasKw2 ? `${kw1}과 ${kw2}` : kw1}를 균형 있게 검토한 결과, ${cv}을 중심으로 정리하는 게 맞겠어요.`,
    ],
    technical: [
      `${em} ${refPhrase}${hasKw2 ? `${kw1}과 ${kw2}` : `${kw1}`} 기술적으로 점검할게요. 시스템 영향 먼저 확인하겠습니다.`,
      `${em} ${kw1} 이슈, 코드 레벨에서 원인 추적해볼게요.`,
      `${em} ${kw1}을 코드·시스템 레벨에서 점검하면 ${cv} 부분에서 개선점이 나올 거예요.`,
    ],
    community_warm: [
      `${em} ${refPhrase}${kw1}${hasKw2 ? `이랑 ${kw2}` : ''} 이야기, 커뮤니티 멤버분들이랑 같이 나눠봐요! 다양한 시각이 나올 것 같아요.`,
      `${em} ${kw1} 관련해서 멤버분들 의견도 한번 들어봐야 할 것 같아요. 모두가 소중하니까요.`,
      `${em} ${hasKw2 ? `${kw1}과 ${kw2}` : kw1}, 이 두 가지 모두 커뮤니티를 더 건강하게 만드는 요소예요.`,
    ],
    leader: [
      `${em} ${refPhrase}${kw1}${hasKw2 ? `과 ${kw2}` : ''}을 전략적으로 보면, 지금 우리 플랫폼의 방향성과 직결돼요.`,
      `${em} ${kw1}에 대한 결정은 팀 전체에 영향을 미쳐요. 큰 그림에서 신중하게 가야 해요.`,
      `${em} ${kw1}은 전략적으로 중요해요. 팀 전체와 공유해서 방향 잡겠습니다.`,
      `${em} ${timeCtx}에 ${kw1} 관련해서 팀 전략 방향 잡아볼게요. ${cv}이 기준이에요.`,
    ],
    pr_style: [
      `${em} ${refPhrase}${kw1}을 어떻게 대외적으로 포지셔닝할지가 중요해요. ${cv} 관점에서 접근할게요.`,
      `${em} ${hasKw2 ? `${kw1}과 ${kw2}` : kw1}, 홍보 각도에서 보면 스토리가 만들어져요.`,
      `${em} 외부 관점에서도 중요한 이슈네요. 브랜드 차원으로 접근할게요.`,
    ],
    friendly_media: [
      `${em} ${refPhrase}${kw1}${hasKw2 ? `이랑 ${kw2}` : ''} 좋은 소식, 이번 뉴스레터에 꼭 담고 싶어요! 독자분들이 반기실 것 같아요!`,
      `${em} ${kw1} 소식, 구독자분들께 따뜻하게 전달해드릴게요!`,
      `${em} ${kw1} — 독자분들이 이걸 읽고 무언가 얻어가실 수 있도록 잘 담아볼게요.`,
    ],
  }

  const pool = patterns[persona.style] || patterns.casual
  const msg = pool[Math.floor(Math.random() * pool.length)]
  return msg
}

// 외부 API: getPersona (staff-chat.js 내부 용도)
function getPersona(memberKey) { return _getPersona(memberKey) }

// 외부 API: pickChatMessage
function pickChatMessage(context, memberKey, roomId) {
  return _generateMsg(memberKey, context.topic || roomId || 'general', roomId)
}

// 외부 API: generateConversationStarter
function generateConversationStarter(memberKey, team, roomId) {
  const h = _getKSTHour()
  const topicsByRoom = {
    general:  [
      h < 10 ? '오늘 업무 시작' : h < 12 ? '오전 진행 현황' : h < 14 ? '점심 전 업무 점검' : h < 17 ? '오후 작업 상황' : '오늘 마무리',
      '이번 주 팀 상황', '팀 분위기와 최근 이슈', '플랫폼 최근 소식', '이번 달 우리 팀 목표',
      '요즘 관심 있는 스타트업 트렌드', '팀원 칭찬하기', '이번 주 배운 것 공유',
    ],
    ops:      ['운영 현황 체크','오늘 운영 이슈','사용자 온보딩 상태','주요 공지 준비','운영 개선 아이디어'],
    feedback: ['최근 유저 피드백','주요 개선 요청','긍정 반응 공유','부정 피드백 대응','피드백 트렌드'],
    strategy: ['이번 주 전략 방향','플랫폼 성장 목표','경쟁사 동향','신규 기능 기획','분기 목표 점검'],
  }
  const topics = topicsByRoom[roomId] || topicsByRoom.general
  const topic  = topics[Math.floor(Math.random() * topics.length)]
  return _generateMsg(memberKey, topic, roomId)
}

// 외부 API: generateDiscussionMessage
function generateDiscussionMessage(memberKey, team, topic, roomId, priorMessages = []) {
  for (let i = 0; i < 3; i++) {
    const msg = _generateMsg(memberKey, topic, roomId, priorMessages)
    if (msg && !_isRepeat(memberKey, msg)) {
      _remember(memberKey, msg)
      return msg
    }
  }
  const fallback = _generateMsg(memberKey, topic, roomId, priorMessages)
  _remember(memberKey, fallback)
  return fallback
}

// ══════════════════════════════════════════════════════════════════════
// 채팅 메시지 생성 (generateChat)
// ══════════════════════════════════════════════════════════════════════

const _chatEngineHistory = new Map()

function generateChat(senderUsername, topic, room = 'general', recentMessages = []) {
  const brainKey = _getBrainKey(senderUsername)
  if (!brainKey) return null

  const persona = _getPersona(brainKey)
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
        : pickChatMessage({ room, topic }, brainKey, room)
    }
    if (msg && !_isRepeat('chat_' + brainKey, msg)) {
      _remember('chat_' + brainKey, msg)
      return msg
    }
  }

  const fallback = recentMessages.length > 0
    ? generateDiscussionMessage(brainKey, teamKey, topic, room, recentMessages)
    : generateConversationStarter(brainKey, teamKey, room)
  if (fallback) _remember('chat_' + brainKey, fallback)
  return fallback
}

function generateStaffMessage(staff, topic, room, recentMessages = []) {
  return generateChat(staff.username, topic, room, recentMessages)
}

// ══════════════════════════════════════════════════════════════════════
// DB 헬퍼 — staff_chat_messages 테이블
// ══════════════════════════════════════════════════════════════════════

async function tableExists() {
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/staff_chat_messages?limit=0&select=id`,
      { method: 'HEAD', headers: H() }
    )
    if (r.status === 200 || r.status === 204 || r.status === 206) return true
    const errText = await r.text().catch(() => '')
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
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/staff_chat_messages?room=eq.${room}&is_deleted=eq.false&order=created_at.asc&limit=${limit}&select=id,room,sender_key,sender_name,sender_emoji,sender_color,sender_team,message,msg_type,reply_to,created_at`,
      { headers: H() }
    )
    if (r.status === 404 || r.status === 400) {
      const errBody = await r.text().catch(() => '')
      if (_isMissingTable(r.status, errBody)) return null
      return null
    }
    if (!r.ok) return null
    const rows = await r.json().catch(() => null)
    if (!Array.isArray(rows)) return null
    return rows
  } catch { return null }
}

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
    const exists = await tableExists()
    if (exists) return true
    try {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
        method:  'POST',
        headers: { ...H(), Prefer: 'return=minimal' },
        body:    JSON.stringify({ sql: TABLE_DDL }),
      })
      if (r.ok || r.status === 204) return true
    } catch (_) {}
    return false
  } finally {
    _setupInProgress = false
  }
}

async function insertMessage(data) {
  const payload = JSON.stringify({ ...data, is_deleted: false, created_at: new Date().toISOString() })
  const doInsert = () => fetch(`${SB_URL}/rest/v1/staff_chat_messages`, {
    method:  'POST',
    headers: { ...H(), Prefer: 'return=representation' },
    body:    payload,
  })

  let r
  try { r = await doInsert() } catch (_) { return null }

  if (r.status === 404 || r.status === 400) {
    const errBody = await r.text().catch(() => '')
    const isMissing = errBody.includes('PGRST205') || errBody.includes('relation') ||
      errBody.includes('does not exist') || errBody.includes('schema cache')
    if (isMissing) {
      const created = await setupTable()
      if (!created) return null
      r = await doInsert()
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
      recentMessages = [...recentMessages, row]
    }

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

    const tblMissing = messages === null
    return json({
      ok:            true,
      room,
      room_info:     ROOMS[room],
      count:         tblMissing ? -1 : messages.length,
      messages:      messages ?? [],
      table_ready:   !tblMissing,
      table_missing: tblMissing,
      rooms:         Object.entries(ROOMS).map(([id, r]) => ({ id, ...r })),
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

    if (action === 'ai_discuss') {
      if (!isAuthed) return json({ error: 'Unauthorized' }, 401)
      if (!topic)    return json({ error: 'topic 필수' }, 400)

      const keys    = participants || ['MAX', 'ARIA', 'NOVA', 'PULSE']
      const created = await generateAIDiscussion(topic, room, keys)
      return json({ ok: true, action: 'ai_discuss', created: created.length, messages: created })
    }

    const { sender_key, sender_name, sender_emoji, sender_color, sender_team, message, msg_type, reply_to } = body
    if (!sender_key || !message)
      return json({ error: 'sender_key, message 필수' }, 400)

    const staffByKey      = AI_STAFF[sender_key]
    const staffByUsername = Object.values(AI_STAFF).find(s => s.username === sender_key)
    const staff           = staffByKey || staffByUsername

    if (!staff && !isAuthed) {
      const isAdminMessage = sender_key === 'admin' ||
        (sender_name && !sender_key.startsWith('ai_'))
      if (!isAdminMessage)
        return json({ error: '유효하지 않은 sender_key 또는 인증 필요' }, 403)
    }

    const senderInfo = staff || {
      username: sender_key,
      name:     sender_name  || sender_key,
      emoji:    sender_emoji || '👤',
      color:    sender_color || '#60A5FA',
      team:     sender_team  || '관리자',
    }

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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(msgId))
      return json({ error: '유효하지 않은 메시지 ID 형식입니다.' }, 400)

    try {
      await fetch(
        `${SB_URL}/rest/v1/staff_chat_messages?id=eq.${msgId}`,
        {
          method:  'PATCH',
          headers: { ...H(), Prefer: 'return=minimal' },
          body:    JSON.stringify({ is_deleted: true }),
        }
      )
    } catch (_) {}
    return json({ ok: true, deleted: msgId })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
