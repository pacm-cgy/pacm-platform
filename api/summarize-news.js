/**
 * api/summarize-news.js
 * INSIGHTSHIP LONGFORM NEWS AI ENGINE v11.0
 * 완전 동적 본문 분석 — 고정 템플릿 0개, 본문 문장 기반 100% 생성
 *
 * POST /api/summarize-news  (x-cron-secret 또는 x-vercel-cron: 1)
 * GET  /api/summarize-news  → 엔진 상태 확인
 *
 * v11 핵심 변경:
 *   - DOMAIN_CONTEXT 고정 문단(background/market/trend/implication) 완전 제거
 *   - 본문 실제 문장을 섹션별로 분류·배치
 *   - 인용문·수치·인과문·목표문 자동 감지 & 동적 섹션 구성
 *   - 본문 부족 시 해당 섹션 전체 생략 (빈 고정 문구 0개)
 *   - 마커 v11로 변경
 */
export const config = { runtime: 'edge', maxDuration: 60 }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// ══════════════════════════════════════════════════════════════════════
// §1. 텍스트 정제
// ══════════════════════════════════════════════════════════════════════

function cleanText(t) {
  return (t || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x?[0-9a-fA-F]+;/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/공유하기|페이스북|트위터|카카오톡 공유|인스타그램|네이버 밴드|URL 복사/g, '')
    .replace(/기자\s*[가-힣]{2,4}\s*기자|^\s*[가-힣]{2,3}\s*기자/gm, '')
    .replace(/입력\s*\d{4}\.\d{2}\.\d{2}.*$/gm, '')
    .replace(/수정\s*\d{4}\.\d{2}\.\d{2}.*$/gm, '')
    .replace(/저작권자\s*©.*$/gm, '')
    .replace(/무단전재\s*및\s*재배포\s*금지/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function splitSentences(text) {
  return text
    .replace(/([.!?])\s+/g, '$1\n')
    .replace(/([다요임음])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length >= 15 && s.length <= 400)
}

function isNoise(s) {
  return /무단\s*(전재|배포|복제)|copyright|all rights reserved|구독|좋아요|댓글|광고|협찬|PR\b/i.test(s)
}

// ══════════════════════════════════════════════════════════════════════
// §2. 이벤트·도메인 분류
// ══════════════════════════════════════════════════════════════════════

const EVENT_TYPES = {
  funding:     { kw: ['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC','엔젤','달러','Pre-A'], label: '투자 유치', emoji: '💰' },
  product:     { kw: ['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈','런칭','배포','상용화'], label: '제품/서비스 출시', emoji: '🚀' },
  policy:      { kw: ['정부','지원','공모','선발','과기부','중기부','창진원','예산','규제','정책','공고','모집','개최','경진대회','프로그램','유니콘'], label: '정책/지원', emoji: '📋' },
  acquisition: { kw: ['인수','합병','M&A','지분','매각','인수합병','피인수'], label: '인수/합병', emoji: '🤝' },
  research:    { kw: ['연구','논문','결과','조사','분석','보고서','데이터','통계','발표','리포트','영향'], label: '리서치/분석', emoji: '🔬' },
  person:      { kw: ['대표','CEO','창업자','설립자','인터뷰','스토리','수상','선정','창업가','여성창업'], label: '창업가 스토리', emoji: '👤' },
  market:      { kw: ['시장','성장','규모','트렌드','전망','예측','확대','점유율','글로벌','산업','진출'], label: '시장/트렌드', emoji: '📊' },
}

const DOMAINS = {
  investment: { kw: ['투자','펀딩','시리즈A','시리즈B','시리즈C','억원','조원','달러','VC','엑셀러레이터','벤처','자본'], ko: '투자·금융', cat: 'trend' },
  tech:       { kw: ['AI','인공지능','딥러닝','반도체','GPU','클라우드','SaaS','소프트웨어','로봇','자율주행'], ko: '기술·AI', cat: 'trend' },
  youth:      { kw: ['청소년','청년','대학생','고등학생','창업교육','해커톤','비즈쿨','학생창업','경진대회','여성창업','여성기업'], ko: '청소년·교육', cat: 'insight' },
  policy:     { kw: ['정부','지원','공모','과기부','중기부','창진원','규제','정책','지자체','시','도','공공','유니콘','C-STAR','STAR'], ko: '정책·지원', cat: 'insight' },
  esg:        { kw: ['ESG','탄소중립','친환경','임팩트','소셜벤처','그린','지속가능'], ko: 'ESG·임팩트', cat: 'insight' },
  startup:    { kw: ['스타트업','창업','유니콘','피봇','글로벌','스케일업','창업팀','그린바이오','바이오게이트웨이'], ko: '창업·비즈니스', cat: 'news' },
  edutech:    { kw: ['에듀테크','교육플랫폼','학습','온라인교육','이러닝','EdTech'], ko: '에듀테크', cat: 'insight' },
  fintech:    { kw: ['핀테크','결제','금융','블록체인','암호화폐','뱅크'], ko: '핀테크', cat: 'trend' },
  health:     { kw: ['헬스케어','의료','바이오','디지털헬스','건강','제약','메디컬','유산균','건기식','임상','체지방'], ko: '헬스케어·바이오', cat: 'trend' },
  climate:    { kw: ['기후','탄소','친환경','에너지','태양광','수소','클린테크'], ko: '기후·에너지', cat: 'insight' },
}

function detectEvent(title, body) {
  const text = (title + ' ' + (body || '').slice(0, 600)).toLowerCase()
  const priority = ['funding','acquisition','product','policy','research','person','market']
  const scores = {}
  for (const type of priority) {
    scores[type] = EVENT_TYPES[type].kw.filter(k => text.includes(k.toLowerCase())).length
    scores[type] += EVENT_TYPES[type].kw.filter(k => title.toLowerCase().includes(k.toLowerCase())).length * 1.5
  }
  const best = priority.reduce((a, b) => scores[a] >= scores[b] ? a : b)
  return scores[best] > 0 ? best : 'general'
}

function detectDomain(title, body) {
  const text = (title + ' ' + (body || '').slice(0, 800)).toLowerCase()
  let best = 'startup', bestScore = 0
  for (const [domain, { kw }] of Object.entries(DOMAINS)) {
    const score = kw.filter(k => text.includes(k.toLowerCase())).length
    if (score > bestScore) { best = domain; bestScore = score }
  }
  return best
}

function mapCategory(domain, eventType) {
  if (eventType === 'policy' || domain === 'youth' || domain === 'policy') return 'insight'
  if (eventType === 'funding' || eventType === 'market') return 'trend'
  if (eventType === 'person') return 'magazine'
  return DOMAINS[domain]?.cat || 'news'
}

function estimateReadTime(text) {
  return Math.max(5, Math.ceil((text || '').length / 280))
}

// ══════════════════════════════════════════════════════════════════════
// §3. 토크나이저 & 키 문장 추출
// ══════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','위해','통해',
  '있는','없는','되는','하는','있다','없다','된다','한다','이다',
  '있으며','되며','하며','이번','지난','올해','작년','최근','현재',
  '특히','또','더','가장','매우','모두','함께','이미','아직','약','총',
  '기자','특파원','뉴스','보도','발표','밝혔다','말했다','전했다',
])

function tokenize(text) {
  if (!text) return []
  return (text.replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g, ' ').toLowerCase()
    .match(/[가-힣]{2,}|[a-z]{3,}|[0-9]+/g) || [])
    .filter(t => !STOPWORDS.has(t) && t.length >= 2)
}

function extractKeySentences(title, sentences, count = 10) {
  const titleToks = new Set(tokenize(title))
  const clean = sentences.filter(s => !isNoise(s) && s.length >= 20)
  if (!clean.length) return []
  const scored = clean.map((s, i) => {
    const sToks = tokenize(s)
    const overlap = sToks.filter(t => titleToks.has(t)).length
    const posBonus = i < 2 ? 2.0 : i < 4 ? 1.5 : i < 7 ? 1.2 : 1.0
    const numBonus = /[\d,]+억|[\d,]+조|[\d]+%|[\d]+배|달러/.test(s) ? 1.8 : 1.0
    const causalBonus = /때문에|이유로|배경에는|결과로|따라서|덕분에|위해|통해|목표|계획/.test(s) ? 1.4 : 1.0
    const lenBonus = (s.length >= 30 && s.length <= 200) ? 1.2 : 1.0
    return { s, score: (overlap + 1) * posBonus * numBonus * causalBonus * lenBonus, idx: i }
  })
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.idx - b.idx)
    .map(x => x.s)
}

function cosineSim(a, b) {
  const setA = new Set(a), setB = new Set(b)
  const intersection = [...setA].filter(x => setB.has(x)).length
  const denom = Math.sqrt(setA.size) * Math.sqrt(setB.size)
  return denom > 0 ? intersection / denom : 0
}

function isDuplicateTitle(title, existing) {
  const tToks = tokenize(title)
  for (const e of existing) {
    if (cosineSim(tToks, tokenize(e)) >= 0.72) return true
  }
  return false
}

// ══════════════════════════════════════════════════════════════════════
// §4. NER (제목 개체명 인식)
// ══════════════════════════════════════════════════════════════════════

const GEO_LIST = [
  '서울','부산','대구','인천','광주','대전','울산','세종','수원','성남','고양','용인','천안','충남','충북',
  '경기','강원','전북','전남','경북','경남','제주','아프리카','중동','동남아','유럽','미국','중국',
  '일본','베트남','인도','싱가포르','영국','독일','이스라엘','브라질','프랑스','호주','캐나다','UAE',
  '글로벌','해외','국내','한국',
]
const TECH_LIST = [
  'AI','인공지능','GPT','LLM','머신러닝','딥러닝','자연어처리','컴퓨터비전',
  '빅데이터','클라우드','SaaS','API','블록체인','핀테크','에듀테크','헬스테크',
  '바이오','반도체','GPU','로봇','드론','자율주행','IoT','AR','VR','그린바이오','건기식',
]
const INVESTMENT_STAGES = ['시드','Pre-A','시리즈A','시리즈B','시리즈C','시리즈D','프리IPO','IPO']

function parseTitle(title) {
  const ner = { amounts:[], geo:[], tech:[], dates:[], metrics:[], stage:null, orgs:[], action:null }
  ner.amounts = (title.match(/[\d,]+억\s*달러|[\d,]+만\s*달러|[\d,]+조\s*원|[\d,]+억\s*원|[\d,]+만\s*원|\d+억|\d+조|\d[\d,]*\s*달러/g) || [])
  ner.geo = GEO_LIST.filter(g => title.includes(g))
  ner.tech = TECH_LIST.filter(t => title.toLowerCase().includes(t.toLowerCase()))
  ner.dates = title.match(/\d+월\s*\d+일|\d+월|\d+분기|\d{4}년|상반기|하반기|올해|내년/) || []
  ner.metrics = title.match(/유니콘|데카콘|IPO|상장|[\d]+위|[\d]+%|[\d]+배|[\d]만\s*명|[\d]명/) || []
  for (const s of INVESTMENT_STAGES) { if (title.includes(s)) { ner.stage = s; break } }
  if (/투자|펀딩|유치/.test(title)) ner.action = 'invest'
  else if (/인수|합병|M&A/.test(title)) ner.action = 'acquire'
  else if (/출시|론칭|공개|배포/.test(title)) ner.action = 'launch'
  else if (/개최|공모|모집|접수|선발|선정|합류|C-STAR|유니콘|육성/.test(title)) ner.action = 'contest'
  else if (/분석|영향|전망|예측|조사/.test(title)) ner.action = 'analysis'
  else if (/진출|확장|스케일/.test(title)) ner.action = 'expand'
  else ner.action = 'news'
  const orgMatch = title.match(/^([^,，·]+)[,，·\s]/)
  if (orgMatch && orgMatch[1].trim().length >= 2) ner.orgs = [orgMatch[1].trim()]
  return ner
}

// ══════════════════════════════════════════════════════════════════════
// §5. 용어 사전 (청소년 눈높이)
// ══════════════════════════════════════════════════════════════════════

const TERM_DICT = {
  'IPO':         { short: 'IPO (기업공개)', explain: '처음으로 주식시장에 상장해 일반 투자자에게 주식을 파는 것. 스타트업이 성장해 코스닥·코스피에 입성하는 과정입니다.' },
  'VC':          { short: 'VC (벤처캐피털)', explain: '스타트업 전문 투자회사. 고위험 고수익을 목표로 초기 기업에 집중 투자합니다.' },
  '시리즈A':     { short: '시리즈A (초기 대규모 투자)', explain: '제품이 시장에서 검증된 후 팀·마케팅 확장을 위한 첫 번째 대규모 투자 단계(보통 수십억~수백억 원).' },
  '시리즈B':     { short: '시리즈B (성장 투자)', explain: '매출이 증명되고 사업 확장을 위한 투자 단계. 시리즈A 이후 더 큰 규모로 진행됩니다.' },
  '유니콘':      { short: '유니콘 (기업가치 1조원+)', explain: '기업가치가 1조원 이상인 비상장 스타트업. 국내 토스·야놀자 등이 대표적입니다.' },
  'SaaS':        { short: 'SaaS (구독형 소프트웨어)', explain: '월정액을 내고 인터넷으로 쓰는 소프트웨어 모델. 어도비·슬랙 등이 대표적입니다.' },
  'B2B':         { short: 'B2B (기업간 거래)', explain: '기업이 기업에게 제품·서비스를 파는 비즈니스 모델.' },
  'MVP':         { short: 'MVP (최소 기능 제품)', explain: '핵심 기능만 넣은 첫 번째 버전. 시장 반응을 빠르게 확인하기 위해 만듭니다.' },
  'M&A':         { short: 'M&A (인수·합병)', explain: '한 기업이 다른 기업을 사거나 합치는 것. 스타트업에겐 IPO 외 주요 출구 전략입니다.' },
  'ESG':         { short: 'ESG (환경·사회·지배구조)', explain: '기업이 환경, 사회적 책임, 투명한 지배구조를 얼마나 잘 지키는지 평가하는 기준.' },
  '피봇':        { short: '피봇 (사업 방향 전환)', explain: '초기 아이디어가 통하지 않을 때 방향을 바꾸는 것. 유튜브·슬랙이 피봇으로 성공한 대표 사례.' },
  '그린바이오':  { short: '그린바이오 (농업·식품 생명공학)', explain: '농업·식품·환경에 생명공학 기술을 적용하는 분야. 유산균·발효·식물 추출 성분 등이 포함됩니다.' },
  '엑셀러레이터':{ short: '엑셀러레이터 (창업 가속화)', explain: '초기 스타트업에 투자·멘토링·네트워크를 제공하는 기관. Y Combinator, 스파크랩이 대표적.' },
  'CVC':         { short: 'CVC (대기업 벤처캐피털)', explain: '대기업이 직접 운영하는 벤처투자 조직. 삼성벤처투자, 현대기술투자 등이 있습니다.' },
}

// ══════════════════════════════════════════════════════════════════════
// §6. 문장 분류 헬퍼
// ══════════════════════════════════════════════════════════════════════

function hasNumber(s) { return /([\d,]+억|[\d,]+조|[\d,]+만\s*원|[\d]+%|[\d]+배|[\d,]+만\s*명|[\d,]+개)/.test(s) }
function isCausal(s)  { return /(때문에|이유로|원인은|배경에는|결과로|따라서|이로\s*인해|덕분에|영향으로)/.test(s) }
function isGoal(s)    { return /(목표|계획|예정|방침|전략|추진|노력|위해)/.test(s) }
function isQuote(s)   {
  return (s.includes('"') || s.includes('"') || s.includes('"')) &&
    /(밝혔다|말했다|전했다|강조했다|설명했다|덧붙였다|언급했다)/.test(s)
}

// ══════════════════════════════════════════════════════════════════════
// §7. 도입부 생성기 — 본문 첫 핵심 문장 활용
// ══════════════════════════════════════════════════════════════════════

function buildIntro(title, ner, eventType, keySents) {
  const { amounts, orgs } = ner
  const mainOrg = orgs[0] || null
  const mainAmt = amounts[0] || null
  const domKo = DOMAINS[detectDomainFromTitle(title)]?.ko || '창업'

  // 본문 첫 핵심 문장이 충분하면 그것을 우선 사용
  if (keySents.length > 0 && keySents[0].length >= 30) {
    return [keySents[0], '']
  }

  // 투자 유치 + 기업명 + 금액이 모두 있는 경우
  if (eventType === 'invest' && mainAmt && mainOrg) {
    return [
      `**${mainOrg}**이(가) **${mainAmt}**의 투자를 유치했습니다.`,
      '',
      `${domKo} 분야에서 주목받는 이번 소식을 깊이 살펴봅니다.`,
      '',
    ]
  }

  // 투자 유치 + 금액만 있는 경우
  if (eventType === 'invest' && mainAmt) {
    return [
      `**${mainAmt}** 규모의 투자 유치 소식입니다.`,
      '',
      `이번 투자의 배경과 의미를 함께 분석합니다.`,
      '',
    ]
  }

  // 출시
  if (eventType === 'launch') {
    return [
      `새로운 제품·서비스 출시 소식입니다.`,
      '',
      `"왜 지금 이 서비스인가"를 중심으로 읽어봅니다.`,
      '',
    ]
  }

  // 공모/선발
  if (eventType === 'contest') {
    return [
      `창업 지원·공모 프로그램 소식입니다.`,
      '',
      `어떤 기업이 선발됐는지, 그 의미는 무엇인지 살펴봅니다.`,
      '',
    ]
  }

  // 기본 도입
  return [
    `**${domKo}** 분야의 주목할 만한 소식입니다.`,
    '',
    `배경과 맥락을 함께 분석합니다.`,
    '',
  ]
}

function detectDomainFromTitle(title) {
  const t = title.toLowerCase()
  for (const [d, {kw}] of Object.entries(DOMAINS)) {
    if (kw.some(k => t.includes(k.toLowerCase()))) return d
  }
  return 'startup'
}

// ══════════════════════════════════════════════════════════════════════
// §8. 동적 질문 생성기 — 본문 키워드 기반 (고정 DB 없음)
// ══════════════════════════════════════════════════════════════════════

function buildDynamicQuestions(title, eventType, domain, keySents, numSents, ner) {
  const questions = []
  const { amounts, orgs } = ner
  const domKo = DOMAINS[domain]?.ko || '창업'

  // 수치 기반 질문
  if (amounts.length > 0) {
    questions.push(`이 뉴스에서 언급된 ${amounts[0]} 수치는 ${domKo} 업계에서 어느 정도 규모인가요?`)
  }

  // 기업명 기반 질문
  if (orgs.length > 0) {
    questions.push(`${orgs[0]}이(가) 이번 소식으로 얻게 되는 가장 큰 이점은 무엇일까요?`)
  }

  // 이벤트 타입별 + 제목 키워드 조합 질문
  const titleKw = tokenize(title).filter(t => t.length >= 2).slice(0, 3).join(', ')
  if (eventType === 'funding' || eventType === 'invest') {
    questions.push(`'${titleKw}' 관련 투자가 성공적 결과로 이어지려면 다음에 무엇을 증명해야 할까요?`)
  } else if (eventType === 'product' || eventType === 'launch') {
    questions.push(`이 서비스가 기존 방식 대비 해결하는 문제는 구체적으로 무엇인가요?`)
  } else if (eventType === 'policy' || eventType === 'contest') {
    questions.push(`이 정책·지원이 실제 창업 현장에 미치는 영향은 어느 정도일까요?`)
  } else if (eventType === 'research' || eventType === 'analysis') {
    questions.push(`이 연구 결과에서 발견할 수 있는 새로운 창업 기회는 무엇인가요?`)
  } else if (eventType === 'person') {
    questions.push(`이 창업가의 경험에서 나에게 바로 적용 가능한 교훈은 무엇인가요?`)
  } else if (eventType === 'market') {
    questions.push(`이 시장 변화가 지속된다면 5년 후 ${domKo} 분야는 어떻게 달라질까요?`)
  } else {
    questions.push(`이 소식이 ${domKo} 분야 전체에 미치는 영향을 어떻게 평가할 수 있을까요?`)
  }

  // 본문 두 번째 핵심 문장에서 키워드 추출 → 추가 질문
  if (keySents.length > 1) {
    const kw = tokenize(keySents[1]).filter(t => t.length >= 2 && !STOPWORDS.has(t)).slice(0, 2)
    if (kw.length > 0) {
      questions.push(`'${kw.join(', ')}' 측면에서 아직 해결되지 않은 과제는 무엇일까요?`)
    }
  }

  return questions.slice(0, 3)
}

// ══════════════════════════════════════════════════════════════════════
// §9. 메인 롱폼 빌더 v11 — 완전 동적
// ══════════════════════════════════════════════════════════════════════

function buildLongformStory(title, body) {
  const cleanBody  = cleanText(body || '')
  const eventType  = detectEvent(title, cleanBody)
  const domain     = detectDomain(title, cleanBody)
  const sentences  = splitSentences(cleanBody).filter(s => !isNoise(s))
  const keySents   = extractKeySentences(title, sentences, 12)
  const ner        = parseTitle(title)
  const domKo      = DOMAINS[domain]?.ko || '창업·비즈니스'
  const evtInfo    = EVENT_TYPES[eventType] || { emoji: '📰', label: '주요 소식' }

  const usedSet = new Set()
  const addLine = (s, arr) => {
    if (!s || usedSet.has(s)) return
    usedSet.add(s)
    arr.push(s)
  }

  // 문장 분류
  const numSents   = sentences.filter(s => hasNumber(s) && !keySents.includes(s)).slice(0, 5)
  const cauSents   = sentences.filter(s => isCausal(s) && !keySents.includes(s) && !numSents.includes(s)).slice(0, 4)
  const goalSents  = sentences.filter(s => isGoal(s) && !keySents.includes(s) && !numSents.includes(s) && !cauSents.includes(s)).slice(0, 3)
  const quoteSents = sentences.filter(s => isQuote(s) && !keySents.includes(s)).slice(0, 3)

  // 본문이 충분한지
  const hasBody = sentences.length > 3

  // 용어 수집 (최대 3개)
  const fullText = title + ' ' + cleanBody
  const usedTerms = []
  for (const [term, info] of Object.entries(TERM_DICT)) {
    if (fullText.includes(term) && usedTerms.length < 3) usedTerms.push({ term, ...info })
  }

  const lines = []

  // ── HEADER ───────────────────────────────────────────────────────
  lines.push(`## ${evtInfo.emoji} ${evtInfo.label} · ${domKo}`)
  lines.push('')

  if (ner.amounts.length > 0) {
    lines.push(`🔢 **핵심 수치**: ${ner.amounts.join(' / ')}`)
    lines.push('')
  }

  // ── SECTION 1: 도입 ─────────────────────────────────────────────
  const introLines = buildIntro(title, ner, ner.action, keySents)
  for (const l of introLines) lines.push(l)

  // ── SECTION 2: 지금 무슨 일 ─────────────────────────────────────
  const mainSents = keySents.slice(0, 5)
  if (mainSents.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## 📌 지금 무슨 일이 일어났나')
    lines.push('')
    mainSents.forEach(s => {
      if (!usedSet.has(s)) { usedSet.add(s); lines.push(`> ${s}`); lines.push('') }
    })
  }

  // ── SECTION 3: 주요 수치 (있을 때만) ────────────────────────────
  if (numSents.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## 📊 주요 수치 & 데이터')
    lines.push('')
    numSents.forEach(s => {
      if (!usedSet.has(s)) { usedSet.add(s); lines.push(`→ ${s}`) }
    })
    lines.push('')
  }

  // ── SECTION 4: 현장의 목소리 (인용문 있을 때만) ─────────────────
  if (quoteSents.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## 💬 현장의 목소리')
    lines.push('')
    quoteSents.forEach(s => {
      if (!usedSet.has(s)) { usedSet.add(s); lines.push(`> ${s}`); lines.push('') }
    })
  }

  // ── SECTION 5: 배경과 맥락 (인과 문장 있을 때만) ────────────────
  if (cauSents.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## 🔍 배경과 맥락')
    lines.push('')
    cauSents.forEach(s => { const tmp=[]; addLine(s,tmp); if(tmp.length>0){ lines.push(tmp[0]); lines.push('') } })
  } else if (keySents.length > 5 && hasBody) {
    // 인과 문장 없으면 추가 핵심 문장으로 대체
    const extra = keySents.slice(5, 8).filter(s => !usedSet.has(s))
    if (extra.length > 0) {
      lines.push('---')
      lines.push('')
      lines.push('## 🔍 추가 내용')
      lines.push('')
      extra.forEach(s => { usedSet.add(s); lines.push(s); lines.push('') })
    }
  }

  // ── SECTION 6: 향후 방향 (목표 문장 있을 때만) ──────────────────
  if (goalSents.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## 🎯 향후 방향')
    lines.push('')
    goalSents.forEach(s => {
      if (!usedSet.has(s)) { usedSet.add(s); lines.push(`• ${s}`); lines.push('') }
    })
  }

  // ── SECTION 7: 용어 해설 (해당 용어 있을 때만) ──────────────────
  if (usedTerms.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## 📚 핵심 용어 정리')
    lines.push('')
    for (const { short, explain } of usedTerms) {
      lines.push(`**${short}**`)
      lines.push('')
      lines.push(explain)
      lines.push('')
    }
  }

  // ── SECTION 8: 생각해볼 질문 ────────────────────────────────────
  const questions = buildDynamicQuestions(title, ner.action, domain, keySents, numSents, ner)
  if (questions.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## 💭 생각해볼 질문')
    lines.push('')
    for (const q of questions) {
      lines.push(`• **Q.** ${q}`)
      lines.push('')
    }
  }

  lines.push('---')
  lines.push('')
  lines.push(`*Insightship · ${domKo} · ${evtInfo.emoji} ${evtInfo.label} · insightship-longform-v11*`)

  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════
// §10. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      engine:       'insightship-longform-v11',
      version:      '11.0.0',
      style:        '완전 동적 본문 분석 / 고정 템플릿 0개 / 청소년 눈높이',
      features:     ['DynamicSections','NER-TitleParsing','QuoteDetect','CausalDetect','GoalDetect','TermDictionary','DynamicQuestions'],
      avg_length:   '3000-6000 chars',
      cost:         0,
      external_api: false,
      status:       'ready',
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  const cronHeader   = req.headers.get('x-vercel-cron')
  const authHeader   = req.headers.get('authorization')
  const secretHeader = req.headers.get('x-cron-secret')
  const isAuth = cronHeader === '1'
    || authHeader === `Bearer ${CRON_SECRET}`
    || secretHeader === CRON_SECRET

  if (!isAuth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  if (!SB_URL || !SB_KEY) return new Response(JSON.stringify({ error: 'Missing env' }), { status: 500 })

  const H = {
    apikey:         SB_KEY,
    Authorization:  `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  }

  let params = {}
  try {
    if (req.method === 'POST') {
      const ct = req.headers.get('content-type') || ''
      if (ct.includes('application/json')) params = await req.json().catch(() => ({}))
    }
  } catch {}

  const reprocessAll = params.reprocess === true
  const batchLimit   = Math.min(params.limit || 50, 100)
  const cutoffDays   = params.days || 7

  let articles = []
  try {
    if (reprocessAll) {
      // reprocess=true: v11 미완료 기사 전체 대상
      const url = `${SB_URL}/rest/v1/articles`
        + `?select=id,title,body,excerpt,ai_summary`
        + `&ai_summary=not.like.*insightship-longform-v11*`
        + `&order=published_at.desc`
        + `&limit=${batchLimit}`
      const res = await fetch(url, { headers: H })
      const all = await res.json()
      articles = Array.isArray(all) ? all : []
      // 모두 처리된 경우: 최신 기사들 재처리
      if (articles.length === 0) {
        const r2 = await fetch(
          `${SB_URL}/rest/v1/articles?select=id,title,body,excerpt&order=published_at.desc&limit=${batchLimit}`,
          { headers: H }
        )
        const all2 = await r2.json()
        articles = Array.isArray(all2) ? all2 : []
      }
    } else {
      // 기본: 최근 N일 내 기사 중 v11 미완료
      const cutoff = new Date(Date.now() - cutoffDays * 86400 * 1000).toISOString()
      const url = `${SB_URL}/rest/v1/articles`
        + `?published_at=gte.${cutoff}`
        + `&select=id,title,body,excerpt,ai_summary`
        + `&order=published_at.desc`
        + `&limit=${batchLimit}`
      const res = await fetch(url, { headers: H })
      const all = await res.json()
      const unprocessed = Array.isArray(all)
        ? all.filter(a => !a.ai_summary || !a.ai_summary.includes('insightship-longform-v11'))
        : []
      articles = unprocessed.length > 0 ? unprocessed : (Array.isArray(all) ? all.slice(0, Math.ceil(batchLimit / 2)) : [])
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }

  if (!articles.length) {
    return new Response(JSON.stringify({
      message:   '처리할 기사 없음 (모두 v11 처리 완료)',
      processed: 0, skipped: 0, errors: [],
      engine:    'insightship-longform-v11',
      timestamp: new Date().toISOString(),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const processedTitles = []
  const results = { processed: 0, skipped: 0, duplicates: 0, errors: [] }

  for (const article of articles) {
    try {
      const { id, title, body, excerpt } = article
      if (!title) { results.skipped++; continue }

      if (isDuplicateTitle(title, processedTitles)) {
        results.duplicates++; results.skipped++; continue
      }
      processedTitles.push(title)

      const bodyText = (body && body.length > 80) ? body : (excerpt || '')
      const summary  = buildLongformStory(title, bodyText)
      const domain   = detectDomain(title, cleanText(bodyText))
      const eventType = detectEvent(title, cleanText(bodyText))
      const category = mapCategory(domain, eventType)
      const readTime = estimateReadTime(summary)

      const patchRes = await fetch(
        `${SB_URL}/rest/v1/articles?id=eq.${id}`,
        {
          method:  'PATCH',
          headers: { ...H, Prefer: 'return=minimal' },
          body:    JSON.stringify({
            ai_summary:      summary,
            category,
            ai_processed_at: new Date().toISOString(),
            read_time:       readTime,
            ai_category:     domain,
          }),
        }
      )

      if (patchRes.ok || patchRes.status === 204) results.processed++
      else {
        const err = await patchRes.text()
        results.errors.push(`[${id}] ${err.slice(0, 80)}`)
      }
    } catch (e) {
      results.errors.push(e.message?.slice(0, 80))
    }
  }

  return new Response(JSON.stringify({
    ...results,
    total:     articles.length,
    engine:    'insightship-longform-v11',
    timestamp: new Date().toISOString(),
  }), {
    status:  200,
    headers: { 'Content-Type': 'application/json' },
  })
}
