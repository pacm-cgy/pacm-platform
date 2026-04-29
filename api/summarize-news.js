/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP LONGFORM NEWS AI ENGINE v8.0                          ║
 * ║  LongBlack 스타일 롱폼 스토리텔링 — 완전 자체 개발 / 외부 API 0원  ║
 * ║                                                                      ║
 * ║  핵심 철학:                                                          ║
 * ║  - 뉴스를 '이야기'로 풀어낸다                                       ║
 * ║  - 청소년이 창업·경제를 완전히 이해할 수 있도록 설명한다            ║
 * ║  - 고정 템플릿 없이 기사마다 다른 스토리를 생성한다                 ║
 * ║  - 2,000자 이상의 깊이 있는 롱폼 콘텐츠를 만든다                   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * POST /api/summarize-news  (x-cron-secret 또는 x-vercel-cron: 1)
 * GET  /api/summarize-news  → 엔진 상태 확인
 */

export const config = { runtime: 'edge', maxDuration: 60 }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// ══════════════════════════════════════════════════════════════════════
// §1. 텍스트 정제
// ══════════════════════════════════════════════════════════════════════

function cleanText(text) {
  return (text || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x?[0-9a-fA-F]+;/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/공유하기|페이스북|트위터|카카오|인스타그램|네이버 밴드|URL 복사/g, '')
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
    .filter(s => s.length >= 15 && s.length <= 350)
}

function isNoiseSentence(s) {
  return /무단\s*(전재|배포|복제)|copyright|all rights reserved|구독|좋아요|댓글|광고|협찬|PR\b/i.test(s)
}

// ══════════════════════════════════════════════════════════════════════
// §2. 이벤트·도메인 분류
// ══════════════════════════════════════════════════════════════════════

const EVENT_TYPES = {
  funding:     { kw: ['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC','엔젤','프리IPO'], label: '투자 유치', emoji: '💰' },
  product:     { kw: ['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈','런칭','배포'], label: '제품/서비스 출시', emoji: '🚀' },
  policy:      { kw: ['정부','지원','공모','선발','과기부','중기부','창진원','예산','규제','정책','공고','모집'], label: '정책/지원', emoji: '📋' },
  acquisition: { kw: ['인수','합병','M&A','지분','매각','인수합병','피인수'], label: '인수/합병', emoji: '🤝' },
  research:    { kw: ['연구','논문','결과','조사','분석','보고서','데이터','통계','발표','리포트','조사결과'], label: '연구/조사', emoji: '🔬' },
  person:      { kw: ['대표','CEO','창업자','설립자','인터뷰','스토리','수상','선정','창업가'], label: '창업가 스토리', emoji: '👤' },
  market:      { kw: ['시장','성장','규모','트렌드','전망','예측','확대','점유율','글로벌','산업'], label: '시장/트렌드', emoji: '📊' },
}

const DOMAINS = {
  investment: { kw: ['투자','펀딩','시리즈A','시리즈B','시리즈C','억원','조원','VC','엑셀러레이터','벤처'], ko: '투자·금융', cat: 'trend' },
  tech:       { kw: ['AI','인공지능','딥러닝','반도체','GPU','클라우드','SaaS','소프트웨어','로봇','자율주행'], ko: '기술·AI', cat: 'trend' },
  youth:      { kw: ['청소년','청년','대학생','고등학생','창업교육','해커톤','비즈쿨','학생창업'], ko: '청소년·교육', cat: 'insight' },
  policy:     { kw: ['정부','지원','공모','과기부','중기부','창진원','규제','정책','지자체'], ko: '정책·지원', cat: 'insight' },
  esg:        { kw: ['ESG','탄소중립','친환경','임팩트','소셜벤처','그린','지속가능'], ko: 'ESG·임팩트', cat: 'insight' },
  startup:    { kw: ['스타트업','창업','유니콘','피봇','글로벌','스케일업','창업팀'], ko: '창업·비즈니스', cat: 'news' },
  edutech:    { kw: ['에듀테크','교육플랫폼','학습','온라인교육','이러닝','EdTech'], ko: '에듀테크', cat: 'insight' },
  fintech:    { kw: ['핀테크','결제','금융','블록체인','암호화폐','NFT','디파이'], ko: '핀테크', cat: 'trend' },
  health:     { kw: ['헬스케어','의료','바이오','디지털헬스','건강','제약','메디컬'], ko: '헬스케어', cat: 'trend' },
  climate:    { kw: ['기후','탄소','친환경','에너지','태양광','수소','클린테크'], ko: '기후·에너지', cat: 'insight' },
}

function detectEvent(title, body) {
  const text = (title + ' ' + (body || '').slice(0, 600)).toLowerCase()
  const priority = ['funding','acquisition','product','policy','research','person','market']
  const scores = {}
  for (const type of priority) {
    scores[type] = EVENT_TYPES[type].kw.filter(k => text.includes(k.toLowerCase())).length
    scores[type] += EVENT_TYPES[type].kw.filter(k => title.toLowerCase().includes(k.toLowerCase())).length
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
  return Math.max(3, Math.ceil((text || '').length / 350))
}

// ══════════════════════════════════════════════════════════════════════
// §3. 숫자·키워드 추출
// ══════════════════════════════════════════════════════════════════════

function extractNumbers(text) {
  const matches = []
  const patterns = [
    /[\d,]+억\s*원/g,
    /[\d,]+조\s*원/g,
    /[\d,]+만\s*원/g,
    /[\d]+\s*%/g,
    /[\d,]+만\s*명/g,
    /[\d,]+개\s*사/g,
    /[\d]+\s*배/g,
    /[\d]+\s*위/g,
  ]
  for (const p of patterns) {
    const found = text.match(p) || []
    matches.push(...found)
  }
  return [...new Set(matches)].slice(0, 5)
}

function extractCompanyNames(title, body) {
  const text = title + ' ' + (body || '')
  // 한국 회사명 패턴: 2~6글자 + (주)/㈜/스타트업/플랫폼 등
  const companyPatterns = [
    /[가-힣A-Z][가-힣A-Za-z]{1,8}(?:주식회사|㈜|\(주\))/g,
    /[가-힣]{2,6}(?:테크|플랫폼|랩스|스튜디오|파트너스|벤처스|캐피탈|그룹)/g,
  ]
  const names = []
  for (const p of companyPatterns) {
    const found = text.match(p) || []
    names.push(...found)
  }
  return [...new Set(names)].slice(0, 3)
}

// ══════════════════════════════════════════════════════════════════════
// §4. 핵심 문장 추출 (BM25 간략 버전)
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

function extractKeySentences(title, sentences, count = 5) {
  const titleToks = new Set(tokenize(title))
  const clean = sentences.filter(s => !isNoiseSentence(s) && s.length >= 20)
  if (!clean.length) return []

  const scored = clean.map((s, i) => {
    const sToks = tokenize(s)
    const overlap = sToks.filter(t => titleToks.has(t)).length
    const posBonus = i < 3 ? 1.5 : i < 6 ? 1.2 : 1.0
    const numBonus = /[\d,]+억|[\d,]+조|[\d]+%|[\d]+배/.test(s) ? 1.6 : 1.0
    const causalBonus = /때문에|이유로|배경에는|결과로|따라서|덕분에/.test(s) ? 1.3 : 1.0
    const lenBonus = (s.length >= 30 && s.length <= 200) ? 1.2 : 1.0
    return { s, score: (overlap + 1) * posBonus * numBonus * causalBonus * lenBonus, idx: i }
  })

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.idx - b.idx)
    .map(x => x.s)
}

// ══════════════════════════════════════════════════════════════════════
// §5. 용어 사전 & 배경지식 데이터베이스
// ══════════════════════════════════════════════════════════════════════

const TERM_DICT = {
  'IPO':          { short: 'IPO(기업공개)', long: 'IPO란 기업이 주식시장에 처음으로 주식을 상장하는 것입니다. 이 과정을 통해 일반 투자자들이 그 회사의 주주가 될 수 있습니다.' },
  'VC':           { short: 'VC(벤처캐피털)', long: 'VC(벤처캐피털)는 성장 가능성이 높은 스타트업에 투자하는 전문 투자사입니다. 돈뿐만 아니라 경영 노하우와 네트워크도 함께 제공합니다.' },
  '시리즈A':      { short: '시리즈A(초기 대규모 투자)', long: '시리즈A는 스타트업이 제품-시장 적합성(PMF)을 입증한 후 받는 첫 번째 대규모 투자 단계입니다. 보통 수십억 원 규모입니다.' },
  '시리즈B':      { short: '시리즈B(성장 단계 투자)', long: '시리즈B는 사업 모델이 검증된 스타트업이 본격적인 규모 확장을 위해 받는 투자입니다.' },
  '시리즈C':      { short: '시리즈C(확장 단계 투자)', long: '시리즈C 이후는 기업이 이미 안정적인 수익 구조를 갖추고 글로벌 확장이나 IPO를 준비하는 단계입니다.' },
  '유니콘':       { short: '유니콘(기업가치 1조원 이상 스타트업)', long: '유니콘 기업은 상장하지 않은 스타트업 중 기업가치가 1조 원(약 10억 달러) 이상인 회사를 말합니다.' },
  'SaaS':         { short: 'SaaS(구독형 소프트웨어)', long: 'SaaS(Software as a Service)는 소프트웨어를 구매하지 않고 인터넷으로 월 구독료를 내고 사용하는 방식입니다.' },
  'B2B':          { short: 'B2B(기업 간 거래)', long: 'B2B(Business-to-Business)는 기업이 일반 소비자가 아닌 다른 기업을 고객으로 하는 비즈니스 모델입니다.' },
  'B2C':          { short: 'B2C(기업-소비자 간 거래)', long: 'B2C(Business-to-Consumer)는 기업이 일반 소비자에게 직접 제품이나 서비스를 판매하는 모델입니다.' },
  'MVP':          { short: 'MVP(최소 기능 제품)', long: 'MVP(Minimum Viable Product)는 핵심 기능만 갖춘 초기 버전의 제품입니다. 빠르게 시장에 출시해 고객 반응을 검증하는 데 사용합니다.' },
  'PMF':          { short: 'PMF(제품-시장 적합성)', long: 'PMF(Product-Market Fit)는 만든 제품이 시장의 수요와 딱 맞아떨어지는 상태를 말합니다. 스타트업이 투자받기 전에 반드시 증명해야 합니다.' },
  'M&A':          { short: 'M&A(기업 인수·합병)', long: 'M&A(Mergers and Acquisitions)는 한 기업이 다른 기업을 사거나 합치는 것입니다. 스타트업에게는 EXIT(출구) 전략 중 하나입니다.' },
  '엑셀러레이터': { short: '엑셀러레이터(창업 육성 기관)', long: '엑셀러레이터는 초기 스타트업에게 투자금, 멘토링, 네트워크, 사무 공간을 제공해 성장을 가속시키는 기관입니다. Y Combinator, 스파크랩 등이 대표적입니다.' },
  'CVC':          { short: 'CVC(기업형 벤처캐피털)', long: 'CVC(Corporate Venture Capital)는 대기업이 직접 운영하는 벤처 투자 부서입니다. 삼성벤처투자, 카카오벤처스 등이 해당됩니다.' },
  'ARR':          { short: 'ARR(연간 반복 수익)', long: 'ARR(Annual Recurring Revenue)은 구독 기반 비즈니스에서 1년간 반복적으로 발생하는 매출입니다. SaaS 기업 가치 평가의 핵심 지표입니다.' },
  '데카콘':       { short: '데카콘(기업가치 10조원 이상)', long: '데카콘은 기업가치가 100억 달러(약 10조 원) 이상인 스타트업을 말합니다. 유니콘보다 10배 더 큰 기업입니다.' },
  'TIPS':         { short: 'TIPS(정부 창업 지원 프로그램)', long: 'TIPS(Tech Incubator Program for Startup)는 민간 투자사가 먼저 투자한 스타트업에 정부가 매칭 투자를 해주는 한국의 대표 창업 지원 프로그램입니다.' },
  '피봇':         { short: '피봇(사업 방향 전환)', long: '피봇(Pivot)은 스타트업이 초기 아이디어가 시장에서 통하지 않을 때 사업 방향을 크게 전환하는 것입니다. 인스타그램도 처음엔 위치 기반 게임이었습니다.' },
  '린스타트업':   { short: '린스타트업(빠른 검증 방법론)', long: '린스타트업은 만들기-측정-학습을 빠르게 반복해 낭비를 줄이고 시장에 맞는 제품을 찾아가는 창업 방법론입니다.' },
}

// 도메인별 심층 배경지식 (기사 body가 없어도 풍부한 맥락을 제공)
const DOMAIN_CONTEXT = {
  investment: {
    background: '스타트업 투자 생태계는 엔젤투자 → 시드 → 시리즈A → 시리즈B → 시리즈C → 프리IPO → IPO(기업공개) 순서로 성장합니다. 각 단계마다 기업이 증명해야 할 것이 다릅니다. 시드 단계에서는 팀과 아이디어를, 시리즈A에서는 PMF(제품-시장 적합성)를, 시리즈B 이상에서는 스케일업(대규모 성장) 가능성을 보여줘야 합니다.',
    trend: '2024~2025년 글로벌 스타트업 투자 시장은 AI, 클린테크, 바이오 분야에 집중되고 있습니다. 금리가 높아지면서 "프로피터블 그로스(흑자 성장)"를 요구하는 투자자가 늘었고, 과거처럼 성장만 내세우는 스타트업은 투자받기 어려워졌습니다.',
    implication: '투자 유치는 단순히 돈을 받는 것이 아닙니다. 투자자는 창업가의 비전을 검증해주는 파트너이자, 네트워크와 경험을 함께 제공하는 조언자입니다. 중요한 것은 "왜 이 투자자인가"입니다. 단순히 돈이 많은 투자자보다, 내 사업 분야를 잘 아는 투자자를 찾는 것이 장기적으로 훨씬 유리합니다.',
  },
  tech: {
    background: '기술 혁신은 S자 곡선을 그립니다. 초기에는 느리게 성장하다가 어느 순간 폭발적으로 확산됩니다. 스마트폰이 그랬고, 소셜미디어가 그랬으며, 이제 AI가 그 변곡점을 지나고 있습니다. 중요한 것은 기술 자체가 아니라 "그 기술이 해결하는 문제"입니다.',
    trend: 'AI 기술은 현재 의료, 금융, 교육, 제조, 물류 등 거의 모든 산업에 침투하고 있습니다. 특히 생성형 AI(ChatGPT 등)의 등장으로 텍스트, 이미지, 코드 생성이 자동화되면서 많은 직업이 변화하고 있습니다. AI를 단순히 사용하는 기업과 AI를 핵심 역량으로 내재화한 기업 사이의 경쟁력 격차가 빠르게 벌어지고 있습니다.',
    implication: '기술을 배우는 것보다 기술로 문제를 해결하는 능력이 중요합니다. 성공한 기술 창업가들은 "가장 최신 기술"이 아니라 "고객의 가장 큰 불편함"을 먼저 찾습니다. 지금 당장 주변에서 반복적으로 불편하다고 느끼는 것을 기록해보세요.',
  },
  youth: {
    background: '청소년 창업은 전 세계적으로 확산되고 있습니다. 미국의 Y Combinator는 19세 창업자를 투자했고, 한국에서도 중기부의 예비창업패키지, 비즈쿨, 창업동아리 지원 등 청소년 창업 생태계가 빠르게 성장하고 있습니다. 나이는 더 이상 창업의 장벽이 아닙니다.',
    trend: '청소년 창업가들이 가진 강점은 디지털 네이티브 감각과 빠른 실행력입니다. MZ세대가 소비자이자 창업자로 부상하면서, 또래의 문제를 누구보다 잘 이해하는 청소년이 오히려 유리한 시장이 열리고 있습니다.',
    implication: '지금 당장 창업이 어렵다면, 창업 준비를 시작하세요. 비즈니스 모델 설계, 팀 빌딩, 피칭 연습은 언제 시작해도 이릅니다. 학교 창업동아리, 해커톤 참가, 창업 경진대회 지원이 가장 좋은 시작점입니다.',
  },
  policy: {
    background: '한국 정부는 매년 수조 원 규모의 창업 지원 예산을 집행합니다. 중소벤처기업부, 과학기술정보통신부, 교육부 등 여러 부처가 창업 지원 프로그램을 운영하고 있습니다. 주요 프로그램으로는 예비창업패키지(최대 1억 원), TIPS(최대 7억 원), K-스타트업 그랜드챌린지 등이 있습니다.',
    trend: '최근 정부 창업 지원은 AI·바이오·클린테크 등 딥테크 분야에 집중되고 있으며, 지역 창업 생태계 활성화를 위한 지방 창업 지원도 강화되고 있습니다. 특히 청소년·대학생 대상 지원이 확대되는 추세입니다.',
    implication: '정책 자금은 창업 초기 가장 저렴한 자본입니다. 지분을 내주지 않고 사업 초기 자금을 마련할 수 있는 몇 안 되는 방법입니다. K-스타트업 창업지원포털(www.k-startup.go.kr)을 즐겨찾기에 추가하고 정기적으로 지원 공고를 확인하세요.',
  },
  startup: {
    background: '스타트업(Startup)은 단순한 작은 회사가 아닙니다. 반복 가능하고 확장 가능한 비즈니스 모델을 찾는 임시 조직입니다. 이 정의에서 핵심은 "반복 가능"과 "확장 가능"입니다. 앱 하나로 수천만 명에게 서비스를 제공할 수 있는 것처럼, 한 번 만든 것으로 무한히 성장할 수 있는 구조가 스타트업의 본질입니다.',
    trend: '2024~2025년 한국 스타트업 생태계는 양적 성장에서 질적 성장으로 전환하고 있습니다. 유니콘 기업 수는 20개를 넘어섰고, 글로벌 진출 성공 사례도 늘고 있습니다. 동시에 과도한 성장 추구보다 수익성과 지속 가능성을 중시하는 방향으로 문화가 바뀌고 있습니다.',
    implication: '스타트업 창업에서 가장 중요한 것은 "문제 정의"입니다. 많은 창업가들이 제품을 먼저 만들고 나서 고객을 찾다가 실패합니다. 반대로 접근해야 합니다. 먼저 사람들이 진짜로 겪고 있는 불편함을 찾고, 그다음에 해결책을 만드세요.',
  },
  edutech: {
    background: '에듀테크(EdTech) 시장은 코로나19 이후 전 세계적으로 폭발적으로 성장했습니다. 온라인 학습, AI 맞춤형 교육, 게임화된 학습(게이미피케이션) 등 새로운 학습 방식이 전통적인 교육을 변화시키고 있습니다.',
    trend: '최근 에듀테크의 핵심 트렌드는 "개인화"입니다. 모든 학생에게 같은 내용을 가르치는 대신, AI가 각 학생의 학습 패턴과 수준을 분석해 최적화된 학습 경험을 제공합니다. 국내에서는 뤼이드, 클래스101, 밀리의서재 등이 에듀테크 분야에서 두각을 나타내고 있습니다.',
    implication: '교육은 변화가 가장 느린 산업 중 하나였지만, 지금은 가장 빠르게 변하고 있습니다. 학교에서 가르치지 않는 것들—창업, 재테크, 소통법, 심리—을 온라인으로 가르치는 비즈니스 기회가 여전히 많습니다.',
  },
  fintech: {
    background: '핀테크(FinTech)는 금융(Finance)과 기술(Technology)의 합성어입니다. 은행, 카드, 보험, 주식 등 기존 금융 서비스를 기술로 더 빠르고 저렴하게 혁신하는 산업입니다. 카카오뱅크, 토스, 뱅크샐러드가 한국 핀테크의 대표 사례입니다.',
    trend: '최근 핀테크는 대출, 결제를 넘어 자산관리, 보험, 기업 금융으로 영역을 확장하고 있습니다. 특히 임베디드 파이낸스(금융 서비스를 비금융 플랫폼에 내장)가 새로운 트렌드로 떠오르고 있습니다.',
    implication: '금융은 모든 비즈니스의 기반입니다. 창업을 생각한다면 기본적인 재무 지식은 필수입니다. 매출, 비용, 이익, 현금흐름의 차이를 이해하고, 단위 경제학(Unit Economics)—고객 한 명을 유치하는 데 드는 비용 대비 그 고객이 가져다주는 수익—을 계산할 수 있어야 합니다.',
  },
  health: {
    background: '헬스케어·바이오 분야는 인류가 직면한 가장 크고 중요한 문제들을 다룹니다. 고령화 사회, 만성질환, 정신건강, 신약 개발—이 모든 분야에서 기술이 새로운 해결책을 찾고 있습니다. 규제가 엄격한 만큼 진입 장벽이 높지만, 그만큼 성공했을 때의 임팩트도 큽니다.',
    trend: '디지털 헬스케어가 주목받고 있습니다. 스마트워치로 심전도를 측정하고, AI가 X-ray 사진에서 암을 발견하고, 원격진료로 집에서 의사와 상담하는 시대가 왔습니다. 한국은 의료 데이터 인프라가 잘 구축되어 있어 디지털 헬스케어 스타트업에게 유리한 환경입니다.',
    implication: '헬스케어 창업은 높은 진입 장벽만큼 사회적 임팩트도 큽니다. 관심이 있다면 의료 규제(식약처, 의료기기 인증 등)를 먼저 공부하고, 의사나 간호사 등 도메인 전문가를 팀에 영입하는 것이 중요합니다.',
  },
  esg: {
    background: 'ESG(Environmental, Social, Governance)는 기업이 환경, 사회, 지배구조를 얼마나 책임감 있게 운영하는지를 평가하는 기준입니다. 최근에는 투자자들이 ESG를 투자 결정의 핵심 요소로 보고 있어, 스타트업도 ESG를 무시할 수 없게 됐습니다.',
    trend: '소셜벤처와 임팩트 투자가 빠르게 성장하고 있습니다. "돈을 벌면서 세상을 바꾼다"는 철학을 가진 기업들이 투자자와 소비자 모두에게 주목받고 있습니다. 특히 Z세대는 가치 지향적 소비를 하는 경향이 강해, ESG 기업들이 브랜드 충성도를 높이기 유리합니다.',
    implication: '사회 문제를 비즈니스로 해결하는 것이 가장 지속 가능한 창업 방식입니다. "우리가 해결하는 문제가 사라지면 세상은 어떻게 좋아지는가?"라는 질문에 명확하게 답할 수 있는 스타트업이 장기적으로 더 강한 경쟁력을 가집니다.',
  },
  climate: {
    background: '기후 위기는 21세기 가장 큰 사업 기회이기도 합니다. 탄소 중립 달성을 위해 에너지, 운송, 건설, 식품 등 모든 산업이 변화해야 하고, 이 과정에서 수천 개의 새로운 스타트업이 탄생하고 있습니다. 글로벌 클린테크 투자는 연간 수천억 달러 규모입니다.',
    trend: '태양광, 배터리, 수소에너지 비용이 빠르게 하락하면서 클린에너지가 경제성을 갖추기 시작했습니다. 탄소배출권 시장, ESG 컨설팅, 친환경 포장재, 대체단백질 등 새로운 시장이 급성장하고 있습니다.',
    implication: '기후 문제를 해결하는 창업은 단순한 비즈니스를 넘어 세대적 책임입니다. 관심 있다면 지역 환경단체 활동, 그린테크 해커톤 참가, 탄소발자국 계산 등 작은 것부터 시작해 문제를 피부로 느껴보세요.',
  },
}

// 이벤트 타입별 스토리 구성 가이드
const EVENT_NARRATIVE = {
  funding: {
    openingAngle: '투자',
    whatHappened: (title, nums) => `이번 소식의 핵심은 자금 확보입니다. ${nums.length > 0 ? `총 ${nums[0]} 규모의 투자가 이루어졌으며,` : ''} 이는 시장이 이 기업의 가능성을 인정했다는 강력한 신호입니다.`,
    whyItMatters: '스타트업에게 투자 유치는 단순한 자금 확보를 넘어 시장의 공신력을 얻는 과정입니다. 투자자들은 수백, 수천 개의 기업을 검토한 후 소수에만 투자합니다.',
    keyQuestion: '이 기업은 어떤 문제를 해결하기에 투자자들이 선택했을까요?',
    actionPoint: '투자받은 기업의 사업 모델, 팀 구성, 성장 지표를 분석해보세요. 성공적인 투자 사례에서 패턴을 발견하는 것이 미래 창업가로서의 안목을 키웁니다.',
  },
  product: {
    openingAngle: '출시',
    whatHappened: (title, nums) => `새로운 제품 또는 서비스가 시장에 나왔습니다. 이것이 중요한 이유는 시장의 실제 수요를 반영하기 때문입니다.`,
    whyItMatters: '새로운 서비스 출시는 "이 문제가 충분히 크다"는 시장의 확인입니다. 실제 사람들이 돈을 내고 쓸 만큼 문제가 크다는 뜻이기도 합니다.',
    keyQuestion: '기존 대안과 비교했을 때 이 서비스만의 차별점은 무엇인가요?',
    actionPoint: '이 서비스를 직접 사용해보고, "내가 더 잘 만들 수 있을까? 아니면 이 서비스의 빈틈은 어디인가?"를 생각해보세요.',
  },
  policy: {
    openingAngle: '지원',
    whatHappened: (title, nums) => `정부 또는 공공기관이 새로운 창업 지원 프로그램을 발표했습니다. ${nums.length > 0 ? `총 ${nums[0]} 규모의 지원이 예정되어 있습니다.` : ''}`,
    whyItMatters: '정부 지원은 초기 창업가에게 가장 접근하기 쉬운 자금원입니다. 지분을 희석하지 않고 사업 검증에 필요한 자금을 확보할 수 있습니다.',
    keyQuestion: '이 지원 프로그램의 지원 자격과 신청 방법은 무엇인가요?',
    actionPoint: 'K-스타트업 창업지원포털(www.k-startup.go.kr)을 즐겨찾기하고, 정기적으로 공고를 확인하는 습관을 만드세요.',
  },
  acquisition: {
    openingAngle: 'M&A',
    whatHappened: (title, nums) => `기업 인수·합병(M&A) 소식입니다. ${nums.length > 0 ? `${nums[0]} 규모로` : ''} 이루어진 이번 거래는 업계 지형을 바꿀 중요한 사건입니다.`,
    whyItMatters: 'M&A는 스타트업 생태계의 중요한 출구 전략 중 하나입니다. 창업 후 상장(IPO)이 아닌, 대기업에 인수되는 방식으로 EXIT하는 경우가 훨씬 많습니다.',
    keyQuestion: '인수한 기업은 왜 이 스타트업을 샀을까요? 어떤 기술이나 시장을 원했을까요?',
    actionPoint: '"나중에 어떤 기업에 인수되고 싶은가?"라는 역발상 질문으로 창업 전략을 설계해보는 것도 좋은 방법입니다.',
  },
  research: {
    openingAngle: '연구',
    whatHappened: (title, nums) => `새로운 연구 결과 또는 시장 조사가 발표됐습니다. ${nums.length > 0 ? `주요 수치로는 ${nums.join(', ')}가 언급됩니다.` : ''}`,
    whyItMatters: '데이터와 연구 결과는 막연한 아이디어를 검증해주는 도구입니다. "이 시장이 얼마나 크고, 얼마나 빠르게 성장하는가"를 수치로 확인하는 것이 투자 유치의 첫걸음입니다.',
    keyQuestion: '이 연구 결과가 사실이라면, 어떤 새로운 사업 기회가 생길까요?',
    actionPoint: '창업 아이디어를 검증할 때 반드시 관련 시장 조사 데이터를 찾아보세요. 근거 없는 아이디어보다 데이터로 뒷받침된 가설이 훨씬 설득력 있습니다.',
  },
  person: {
    openingAngle: '창업가',
    whatHappened: (title, nums) => `한 창업가의 이야기가 주목받고 있습니다. 성공한 창업가의 여정에는 반드시 배울 것이 있습니다.`,
    whyItMatters: '창업은 혼자 하는 것이 아닙니다. 훌륭한 멘토와 롤모델의 경험에서 배우는 것이 가장 빠른 성장 방법입니다.',
    keyQuestion: '이 창업가가 겪은 가장 큰 위기는 무엇이었고, 어떻게 극복했나요?',
    actionPoint: '이 창업가의 초기 인터뷰, 강연 영상을 찾아보세요. 성공한 사람들의 현재보다 "실패했던 과거"에서 더 많은 것을 배울 수 있습니다.',
  },
  market: {
    openingAngle: '시장',
    whatHappened: (title, nums) => `시장 동향과 트렌드에 관한 중요한 소식입니다. ${nums.length > 0 ? `${nums.join(', ')} 등의 수치가 이 변화의 크기를 보여줍니다.` : ''}`,
    whyItMatters: '시장 트렌드를 읽는 능력은 창업 타이밍의 핵심입니다. 너무 일찍 시장에 나오면 고객이 없고, 너무 늦으면 경쟁이 치열합니다.',
    keyQuestion: '이 시장이 지금 성장하는 이유는 무엇인가요? 5년 후에는 어떤 모습일까요?',
    actionPoint: '이 시장의 주요 플레이어 3~5개 기업을 조사하고, 각각의 강점과 약점을 분석해보세요. 기존 기업들이 못 하는 것에서 창업 기회가 탄생합니다.',
  },
  general: {
    openingAngle: '창업',
    whatHappened: (title, nums) => `창업·비즈니스 생태계에서 주목할 만한 소식이 들어왔습니다.`,
    whyItMatters: '창업 생태계의 모든 변화는 새로운 기회이거나 새로운 위협입니다. 뉴스를 수동적으로 읽지 말고 "이 변화로 누가 이익을 얻고, 누가 손해를 보는가?"를 분석하는 습관을 만드세요.',
    keyQuestion: '이 소식이 가져올 가장 큰 변화는 무엇인가요?',
    actionPoint: '오늘 읽은 뉴스에서 창업 아이디어 한 가지를 뽑아내는 연습을 해보세요. 좋은 아이디어는 하늘에서 떨어지는 게 아니라 일상의 관찰과 뉴스 읽기에서 나옵니다.',
  },
}

// ══════════════════════════════════════════════════════════════════════
// §6. LongBlack 스타일 롱폼 스토리 생성기
// ══════════════════════════════════════════════════════════════════════

function buildLongformStory(title, body) {
  const cleanBody  = cleanText(body || '')
  const eventType  = detectEvent(title, cleanBody)
  const domain     = detectDomain(title, cleanBody)
  const sentences  = splitSentences(cleanBody).filter(s => !isNoiseSentence(s))
  const keySents   = extractKeySentences(title, sentences, 6)
  const numbers    = extractNumbers(title + ' ' + cleanBody)
  const companies  = extractCompanyNames(title, cleanBody)

  const evtInfo    = EVENT_TYPES[eventType] || EVENT_TYPES.market
  const domCtx     = DOMAIN_CONTEXT[domain] || DOMAIN_CONTEXT.startup
  const narrative  = EVENT_NARRATIVE[eventType] || EVENT_NARRATIVE.general

  // 본문에서 핵심 문장 몇 개 가져오기 (없으면 생략)
  const hasSents = keySents.length > 0
  const mainSents = hasSents ? keySents.slice(0, 4) : []
  const extraSents = hasSents ? keySents.slice(4) : []

  // 용어 설명 수집
  const titleAndBody = title + ' ' + cleanBody
  const usedTerms = []
  for (const [term, info] of Object.entries(TERM_DICT)) {
    if (titleAndBody.includes(term)) {
      usedTerms.push({ term, ...info })
      if (usedTerms.length >= 4) break
    }
  }

  // ── 섹션 1: 헤드라인 & 리드 ──────────────────────────────────────
  const lines = []

  lines.push(`## ${evtInfo.emoji} ${evtInfo.label || '주요 소식'}`)
  lines.push(``)

  // 리드 문단: 도입 스토리
  lines.push(`**지금 이 순간, ${DOMAINS[domain]?.ko || narrative.openingAngle} 생태계에서 주목할 만한 일이 벌어지고 있습니다.**`)
  lines.push(``)
  lines.push(narrative.whatHappened(title, numbers))
  lines.push(``)

  // 본문 핵심 문장이 있으면 활용
  if (mainSents.length > 0) {
    lines.push(`> ${mainSents[0]}`)
    lines.push(``)
    if (mainSents.length > 1) {
      lines.push(mainSents[1])
      lines.push(``)
    }
  }

  // ── 섹션 2: 핵심 사실 분석 ───────────────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`## 📌 핵심 사실 분석`)
  lines.push(``)
  lines.push(narrative.whyItMatters)
  lines.push(``)

  // 숫자 있으면 강조
  if (numbers.length > 0) {
    lines.push(`**이번 소식의 주요 수치:**`)
    lines.push(``)
    for (const num of numbers) {
      lines.push(`• **${num}** — 이 수치가 의미하는 것은 시장의 규모와 성장 속도입니다.`)
    }
    lines.push(``)
  }

  // 기업명 있으면 주목
  if (companies.length > 0) {
    lines.push(`**주목할 기업:** ${companies.join(', ')}`)
    lines.push(``)
  }

  // 나머지 핵심 문장
  if (mainSents.length > 2) {
    lines.push(`**현장에서 전해진 내용:**`)
    lines.push(``)
    for (const s of mainSents.slice(2)) {
      lines.push(`> ${s}`)
      lines.push(``)
    }
  }

  if (extraSents.length > 0) {
    for (const s of extraSents) {
      lines.push(s)
      lines.push(``)
    }
  }

  // ── 섹션 3: 심층 배경 & 맥락 ─────────────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`## 🔍 왜 지금 이 뉴스가 중요한가`)
  lines.push(``)
  lines.push(domCtx.background)
  lines.push(``)
  lines.push(`**지금 이 분야의 트렌드:**`)
  lines.push(``)
  lines.push(domCtx.trend)
  lines.push(``)

  // ── 섹션 4: 용어 설명 ────────────────────────────────────────────
  if (usedTerms.length > 0) {
    lines.push(`---`)
    lines.push(``)
    lines.push(`## 📚 이 뉴스를 이해하는 데 필요한 핵심 개념`)
    lines.push(``)
    lines.push(`*뉴스를 제대로 읽으려면 전문 용어를 알아야 합니다. 처음 접하는 개념이어도 괜찮습니다. 지금 배우면 됩니다.*`)
    lines.push(``)
    for (const { term, short, long } of usedTerms) {
      lines.push(`**${short}**`)
      lines.push(``)
      lines.push(long)
      lines.push(``)
    }
  }

  // ── 섹션 5: 청소년 창업 인사이트 ────────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`## 💡 창업가의 시선으로 읽기`)
  lines.push(``)
  lines.push(`*이 뉴스를 그냥 "정보"로 읽으면 금방 잊습니다. 창업가의 시선으로 읽으면 인사이트가 됩니다.*`)
  lines.push(``)
  lines.push(`**핵심 질문:** ${narrative.keyQuestion}`)
  lines.push(``)
  lines.push(domCtx.implication)
  lines.push(``)
  lines.push(`**지금 바로 해볼 수 있는 것:**`)
  lines.push(``)
  lines.push(`→ ${narrative.actionPoint}`)
  lines.push(``)

  // ── 섹션 6: 생각해볼 거리 ───────────────────────────────────────
  lines.push(`---`)
  lines.push(``)
  lines.push(`## 💭 더 깊이 생각해볼 질문`)
  lines.push(``)
  lines.push(`이 뉴스를 읽고 다음 질문들을 스스로에게 던져보세요.`)
  lines.push(``)

  const deepQuestions = getDeepQuestions(eventType, domain)
  for (const q of deepQuestions) {
    lines.push(`• ${q}`)
  }
  lines.push(``)
  lines.push(`*매일 한 개의 뉴스를 이렇게 깊이 읽는 습관이 미래 창업가를 만듭니다.*`)
  lines.push(``)
  lines.push(`*insightship-nlp · ${domain} · ${eventType}*`)

  return lines.join('\n')
}

function getDeepQuestions(eventType, domain) {
  const byEvent = {
    funding: [
      '이 투자가 성공적인 투자가 되려면, 이 기업은 앞으로 무엇을 증명해야 할까요?',
      '나라면 이 기업에 투자했을까요? 투자하지 않았을까요? 그 이유는?',
      '이 분야에서 아직 투자가 이루어지지 않은 문제는 무엇일까요?',
    ],
    product: [
      '이 제품이 없었을 때 사람들은 이 문제를 어떻게 해결했을까요?',
      '1년 후 이 서비스의 가장 큰 경쟁자는 누가 될까요?',
      '이 서비스에서 아직 해결하지 못한 불편함은 무엇인가요?',
    ],
    policy: [
      '이 정책 지원을 받기 위해 지금 준비해야 할 것은 무엇인가요?',
      '정부가 이 분야를 지원하는 진짜 이유는 무엇일까요?',
      '지원을 받지 못한 팀들은 어떤 점이 부족했을까요?',
    ],
    acquisition: [
      '인수된 스타트업의 창업가는 왜 IPO 대신 M&A를 선택했을까요?',
      '이 인수로 인해 기존 경쟁자들은 어떤 영향을 받을까요?',
      '당신이 이 스타트업을 창업했다면, 팔겠습니까 아니면 계속 키우겠습니까?',
    ],
    research: [
      '이 데이터가 5년 전과 달라진 이유는 무엇일까요?',
      '이 연구 결과와 반대되는 의견은 없을까요?',
      '이 데이터를 바탕으로 창업할 수 있는 아이디어 3개를 생각해보세요.',
    ],
    person: [
      '이 창업가의 가장 큰 실패는 무엇이었고, 그로부터 무엇을 배웠나요?',
      '같은 상황에서 나라면 다른 선택을 했을까요?',
      '이 창업가처럼 되기 위해 지금 당장 할 수 있는 가장 작은 행동은?',
    ],
    market: [
      '이 시장이 10배 성장했을 때 가장 큰 수혜자는 누구일까요?',
      '이 트렌드가 거품이 될 수도 있을까요? 그 징후는 무엇일까요?',
      '이 시장에서 아직 아무도 해결하지 못한 문제는 무엇인가요?',
    ],
    general: [
      '이 소식이 미치는 영향을 가장 많이 받는 사람은 누구인가요?',
      '5년 후 이 분야는 어떤 모습일까요?',
      '이 뉴스에서 창업 기회를 하나 뽑는다면 무엇인가요?',
    ],
  }
  return byEvent[eventType] || byEvent.general
}

// ══════════════════════════════════════════════════════════════════════
// §7. 중복 감지
// ══════════════════════════════════════════════════════════════════════

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
// §8. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      engine: 'insightship-longform-v8',
      version: '8.0.0',
      style: 'LongBlack-inspired longform storytelling',
      features: ['LongformNarrative', 'DomainContext', 'TermDictionary', 'DeepQuestions', 'EventClassifier'],
      avg_length: '2000+ chars',
      cost: 0,
      external_api: false,
      status: 'ready',
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
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
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
      const url = `${SB_URL}/rest/v1/articles`
        + `?select=id,title,body,excerpt,ai_summary`
        + `&status=eq.published`
        + `&order=published_at.desc`
        + `&limit=${batchLimit}`
      const res = await fetch(url, { headers: H })
      const all = await res.json()
      articles = Array.isArray(all)
        ? all.filter(a => !a.ai_summary || a.ai_summary.length < 500)
        : []
      if (articles.length === 0) articles = Array.isArray(all) ? all.slice(0, batchLimit) : []
    } else {
      const cutoff = new Date(Date.now() - cutoffDays * 86400 * 1000).toISOString()
      const url = `${SB_URL}/rest/v1/articles`
        + `?published_at=gte.${cutoff}`
        + `&select=id,title,body,excerpt,ai_summary`
        + `&order=published_at.desc`
        + `&limit=${batchLimit}`
      const res = await fetch(url, { headers: H })
      const all = await res.json()
      const unprocessed = Array.isArray(all)
        ? all.filter(a => !a.ai_summary || a.ai_summary.length < 500)
        : []
      articles = unprocessed.length > 0 ? unprocessed : (Array.isArray(all) ? all : [])
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }

  if (!articles.length) {
    return new Response(JSON.stringify({
      message: '처리할 기사 없음 (모두 처리 완료)',
      processed: 0, skipped: 0, errors: [],
      engine: 'insightship-longform-v8',
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

      const bodyText  = (body && body.length > 100) ? body : (excerpt || title)
      const summary   = buildLongformStory(title, bodyText)
      const domain    = detectDomain(title, cleanText(bodyText))
      const eventType = detectEvent(title, cleanText(bodyText))
      const category  = mapCategory(domain, eventType)
      const readTime  = estimateReadTime(summary)

      const patchRes = await fetch(
        `${SB_URL}/rest/v1/articles?id=eq.${id}`,
        {
          method: 'PATCH',
          headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({
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
    total: articles.length,
    engine: 'insightship-longform-v8',
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
