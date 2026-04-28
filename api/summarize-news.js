/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP NEWS AI ENGINE v6.0                                    ║
 * ║  설계서 v1.0 기반 — 완전 자체 개발 / 외부 API 0원                   ║
 * ║                                                                      ║
 * ║  핵심 능력:                                                          ║
 * ║  1. BM25 문장 랭킹         — 핵심 문장 정밀 추출                    ║
 * ║  2. 지식 그래프 확장       — 창업 도메인 개념 연결 추론              ║
 * ║  3. 이벤트 분류기 v2       — 7개 유형 × 복합 도메인 탐지            ║
 * ║  4. 품질 필터              — 노이즈/광고성 문장 자동 제거            ║
 * ║  5. 청소년 시사점 합성기   — What→Why→So What 구조 동적 생성        ║
 * ║  6. 숫자 인텔리전스        — 투자액/성장률/규모 자동 강조            ║
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
// §1. NLP 코어 — 한국어 형태소 분석 + BM25 (ai-mentor.js 동급)
// ══════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','위해','통해',
  '대한','관련','따른','있는','없는','되는','하는','있다','없다',
  '된다','한다','이다','있으며','되며','하며','이번','지난','올해',
  '작년','이달','오늘','어제','최근','현재','지금','특히','또','더',
  '가장','매우','모두','함께','이미','아직','약','총','전','후','당',
  '각','제','본','해당','기자','특파원','뉴스','보도','발표',
  '밝혔다','말했다','전했다','설명했다','밝혀졌다','알려졌다',
  '한편','이와','이에','위와','아래와','다음과','오는','지난해',
])

// 한국어 토크나이저 (유니그램 + 바이그램)
function tokenize(text, withBigram = false) {
  if (!text) return []
  const cleaned = text.replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g, ' ').toLowerCase()
  const uni = (cleaned.match(/[가-힣]{2,}|[a-z]{3,}|[0-9]+/g) || [])
    .filter(t => !STOPWORDS.has(t) && t.length >= 2)
  if (!withBigram) return uni
  const bi = []
  for (let i = 0; i < uni.length - 1; i++) bi.push(uni[i] + '|' + uni[i + 1])
  return [...uni, ...bi]
}

// BM25 스코어링 (K1=1.5, B=0.75)
const K1 = 1.5, B_PARAM = 0.75
function bm25Score(qToks, dToks, avgLen, N, df) {
  const len = dToks.length
  const tf = {}
  for (const t of dToks) tf[t] = (tf[t] || 0) + 1
  let score = 0
  for (const q of qToks) {
    if (!tf[q]) continue
    const idf = Math.log((N - (df[q] || 0) + 0.5) / ((df[q] || 0) + 0.5) + 1)
    const tfw = (tf[q] * (K1 + 1)) / (tf[q] + K1 * (1 - B_PARAM + B_PARAM * len / avgLen))
    score += idf * tfw
  }
  return score
}

// ══════════════════════════════════════════════════════════════════════
// §2. 지식 그래프 — 창업 도메인 개념 관계 맵
// ══════════════════════════════════════════════════════════════════════

const KNOWLEDGE_GRAPH = {
  '창업':      [['스타트업',0.95],['아이디어',0.9],['팀',0.8],['자금',0.7],['MVP',0.85]],
  '투자':      [['VC',0.9],['펀딩',0.95],['시리즈',0.85],['엔젤',0.75],['트랙션',0.8]],
  '스타트업':  [['창업',0.95],['유니콘',0.8],['피봇',0.75],['성장',0.85],['투자',0.8]],
  '청소년':    [['청년',0.9],['학생',0.85],['교육',0.8],['창업',0.8],['해커톤',0.75]],
  '정부':      [['지원',0.95],['공모',0.85],['중기부',0.9],['창진원',0.9],['정책',0.8]],
  'AI':        [['인공지능',0.95],['딥러닝',0.85],['플랫폼',0.7],['기술',0.8],['데이터',0.75]],
  '펀딩':      [['투자',0.95],['시리즈A',0.85],['시드',0.8],['라운드',0.85],['억원',0.8]],
  '유니콘':    [['스타트업',0.9],['IPO',0.8],['기업가치',0.85],['투자',0.8]],
  '에듀테크':  [['교육',0.9],['학습',0.85],['스타트업',0.8],['AI',0.75]],
  '핀테크':    [['금융',0.9],['결제',0.85],['스타트업',0.8],['투자',0.75]],
}

function expandWithGraph(tokens) {
  const expanded = new Set(tokens)
  for (const tok of tokens) {
    const related = KNOWLEDGE_GRAPH[tok] || []
    for (const [concept, weight] of related) {
      if (weight >= 0.85) expanded.add(concept.toLowerCase())
    }
  }
  return [...expanded]
}

// ══════════════════════════════════════════════════════════════════════
// §3. 이벤트·도메인 분류기 v2
// ══════════════════════════════════════════════════════════════════════

const EVENT_TYPES = {
  funding:     { kw: ['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC','엔젤'], label: '💰 투자 유치',       color: '#10B981' },
  product:     { kw: ['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈','런칭'], label: '🚀 제품/서비스 출시', color: '#3B82F6' },
  policy:      { kw: ['정부','지원','공모','선발','과기부','중기부','창진원','예산','규제','정책','공고'], label: '📋 정책/지원',      color: '#8B5CF6' },
  acquisition: { kw: ['인수','합병','M&A','지분','매각','인수합병'], label: '🤝 인수/합병',       color: '#F59E0B' },
  research:    { kw: ['연구','논문','결과','조사','분석','보고서','데이터','통계','발표','리포트'], label: '🔬 연구/조사',       color: '#06B6D4' },
  person:      { kw: ['대표','CEO','창업자','설립자','인터뷰','스토리','수상','선정'], label: '👤 창업가 스토리',   color: '#EC4899' },
  market:      { kw: ['시장','성장','규모','트렌드','전망','예측','확대','점유율','글로벌'], label: '📊 시장/트렌드',    color: '#F97316' },
}

const DOMAINS = {
  investment: { kw: ['투자','펀딩','시리즈A','시리즈B','억원','조원','VC','엑셀러레이터'], ko: '투자·금융',     cat: 'trend' },
  tech:       { kw: ['AI','인공지능','딥러닝','반도체','GPU','클라우드','SaaS','기술'], ko: '기술·AI',       cat: 'trend' },
  youth:      { kw: ['청소년','청년','대학생','고등학생','창업교육','해커톤','비즈쿨'], ko: '청소년·교육',   cat: 'insight' },
  policy:     { kw: ['정부','지원','공모','과기부','중기부','창진원','규제'], ko: '정책·지원',     cat: 'insight' },
  esg:        { kw: ['ESG','탄소중립','친환경','임팩트','소셜벤처','그린'], ko: 'ESG·임팩트',    cat: 'insight' },
  startup:    { kw: ['스타트업','창업','유니콘','피봇','글로벌','스케일업'], ko: '창업·비즈니스', cat: 'news' },
  edutech:    { kw: ['에듀테크','교육플랫폼','학습','온라인교육','이러닝'], ko: '에듀테크',      cat: 'insight' },
  fintech:    { kw: ['핀테크','결제','금융','블록체인','암호화폐','NFT'], ko: '핀테크',        cat: 'trend' },
  health:     { kw: ['헬스케어','의료','바이오','디지털헬스','건강'], ko: '헬스케어',      cat: 'trend' },
}

// 청소년 창업가 시사점 (설계서 §4.4 "인사이트 아티클" 기준)
const INSIGHT_TEMPLATES = {
  funding:     '투자 동향은 시장의 온도계입니다. 어느 분야에 돈이 몰리는지를 추적하면 내 창업 아이디어의 타이밍을 검증할 수 있습니다. 투자받은 기업의 문제 정의 방식과 성장 전략을 분석하고, 비슷한 문제를 다른 각도에서 접근해 보세요.',
  product:     '새 제품·서비스 출시는 시장이 실제로 원하는 것을 보여주는 가장 생생한 증거입니다. "왜 지금 이 문제인가", "기존 대안과 무엇이 다른가"를 직접 분석하면 제품 기획 역량이 빠르게 성장합니다. 출시 방식과 MVP 전략도 참고해 보세요.',
  policy:      '정책 지원을 전략적으로 활용하면 초기 창업의 가장 큰 허들인 자본과 네트워크를 동시에 해결할 수 있습니다. 지원 자격과 신청 시기를 미리 파악하고, 지금 바로 사업계획서 작성을 시작하세요. 예비창업패키지, 비즈쿨 등이 대표적입니다.',
  acquisition: 'M&A는 스타트업의 또 다른 출구 전략입니다. "이 회사에 인수되고 싶다"는 목표로 사업을 설계하는 역발상 창업 전략도 유효합니다. 인수된 기업이 무엇을 가지고 있었는지 분석하면 경쟁 우위를 찾는 힌트가 됩니다.',
  research:    '데이터와 연구는 가설을 사실로 바꾸는 힘입니다. 이 연구 결과를 바탕으로 "만약 내가 이 문제를 해결하는 제품을 만든다면?"이라는 질문을 던져보세요. 리서치 기반 창업 아이디어는 투자자에게도 설득력이 높습니다.',
  person:      '성공한 창업가의 스토리에서 가장 중요한 것은 실패와 피봇의 순간입니다. 전환점에서 어떤 판단을 내렸는지 집중해서 읽으면 진짜 창업 교육이 됩니다. 나이는 장애물이 아닌 경쟁 우위가 될 수 있습니다.',
  market:      '시장 트렌드 분석은 타이밍의 예술입니다. 지금 이 시장이 성장하는 이유를 3가지로 정리할 수 있다면, 그 교차점에서 창업 아이디어가 탄생합니다. "5년 후 이 시장은 어떤 모습일까?"를 상상하며 아이디어를 발전시켜 보세요.',
  general:     '모든 성공한 스타트업에는 반드시 남들이 놓친 문제를 발견한 순간이 있었습니다. 오늘의 뉴스를 그냥 읽지 말고, "이 문제를 내가 해결한다면?"이라는 창업가의 시선으로 다시 읽어 보세요.',
}

// 용어 설명 사전 (어려운 전문 용어 자동 풀이)
const TERM_DICT = {
  'IPO':        'IPO(기업공개, 주식시장 첫 상장)',
  'VC':         'VC(벤처캐피털, 스타트업 전문 투자사)',
  '시리즈A':    '시리즈A(초기 대규모 투자 단계)',
  '시리즈B':    '시리즈B(성장 단계 투자)',
  '시리즈C':    '시리즈C(확장 단계 투자)',
  '유니콘':     '유니콘(기업가치 1조원 이상 비상장 스타트업)',
  'SaaS':       'SaaS(인터넷으로 제공하는 구독형 소프트웨어)',
  'B2B':        'B2B(기업 간 거래)',
  'B2C':        'B2C(기업과 소비자 간 거래)',
  'MVP':        'MVP(최소 기능 제품, 빠른 검증용)',
  'PMF':        'PMF(제품-시장 적합성)',
  'TAM':        'TAM(전체 시장 규모)',
  'M&A':        'M&A(기업 인수·합병)',
  'CVC':        'CVC(기업형 벤처캐피털)',
  'TIPS':       'TIPS(기술창업 정부 지원 프로그램)',
  '엑셀러레이터':'엑셀러레이터(초기 스타트업 육성 기관)',
  '데카콘':     '데카콘(기업가치 10조원 이상 스타트업)',
  'ARR':        'ARR(연간 반복 수익)',
  'MRR':        'MRR(월간 반복 수익)',
}

// ══════════════════════════════════════════════════════════════════════
// §4. 텍스트 정제 · 문장 분리 · 품질 필터
// ══════════════════════════════════════════════════════════════════════

function cleanText(text) {
  return (text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/공유하기|페이스북|트위터|카카오|인스타그램|네이버 밴드|URL 복사/g, '')
    .replace(/기자\s*[가-힣]{2,4}\s*기자/g, '')
    .replace(/입력\s*\d{4}\.\d{2}\.\d{2}/g, '')
    .replace(/수정\s*\d{4}\.\d{2}\.\d{2}/g, '')
    .replace(/저작권자\s*©[^가-힣]{0,50}/g, '')
    .replace(/무단전재\s*및\s*재배포\s*금지/g, '')
    .replace(/[^\w\s가-힣.!?%,·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitSentences(text) {
  // 한국어 문장 분리: 다/요/임/음/다. 뒤 공백
  return text
    .replace(/([.!?])\s+/g, '$1\n')
    .replace(/([다요임음])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length >= 20 && s.length <= 300)
}

function isNoiseSentence(sent) {
  const noisePatterns = [
    /^[가-힣]{1,3}\s*기자/,               // 기자명으로 시작
    /무단\s*(전재|배포|복제)/,             // 저작권 문구
    /copyright|all rights reserved/i,
    /구독|좋아요|댓글|공유/,              // SNS 액션 유도
    /광고|협찬|PR|홍보/,
    /^\s*\d+\s*$/,                          // 숫자만
    /^[\s.,;:!?]+$/,                        // 구두점만
  ]
  return noisePatterns.some(p => p.test(sent))
}

function hasNumberValue(sent) {
  return /([\d,]+억|[\d,]+조|[\d,]+만\s*원|[\d]+%|[\d]+배|[\d,]+만\s*명|[\d]+위)/.test(sent)
}

function isCausalSentence(sent) {
  return /(때문에|이유로|원인은|배경에는|결과로|따라서|이로\s*인해|덕분에|탓에|여파로)/.test(sent)
}

// ══════════════════════════════════════════════════════════════════════
// §5. 문장 품질 스코어러 (위치 + 길이 + 수치 + 인과관계 + BM25)
// ══════════════════════════════════════════════════════════════════════

function scoreSentences(sentences, titleTokens) {
  const toks = sentences.map(s => tokenize(s, true))
  const N = sentences.length
  if (N === 0) return []

  // 문서 빈도 계산
  const df = {}
  for (const ts of toks) for (const t of new Set(ts)) df[t] = (df[t] || 0) + 1
  const avgLen = toks.reduce((s, t) => s + t.length, 0) / N

  return sentences.map((sent, i) => {
    if (isNoiseSentence(sent)) return { sent, score: -1, idx: i }

    // BM25 기반 타이틀 관련성
    const bm = bm25Score(titleTokens, toks[i], avgLen, N, df)

    // 위치 보너스 (앞 문장이 더 중요)
    const posBonus = i < 2 ? 1.5 : i < 5 ? 1.25 : i < 10 ? 1.1 : 1.0

    // 길이 보너스 (40~150자 최적)
    const len = sent.length
    const lenBonus = (len >= 40 && len <= 150) ? 1.3 : (len > 200) ? 0.7 : 1.0

    // 수치 포함 가산
    const numBonus = hasNumberValue(sent) ? 1.4 : 1.0

    // 인과관계 문장 가산
    const causeBonus = isCausalSentence(sent) ? 1.25 : 1.0

    // 따옴표/인용 패널티 (부정확 가능성)
    const quotePenalty = /["'"']/.test(sent) ? 0.9 : 1.0

    // 인용동사로 끝나는 문장 패널티
    const quoteVerbPenalty = /(밝혔다|말했다|전했다|설명했다)\s*$/.test(sent) ? 0.75 : 1.0

    const score = bm * posBonus * lenBonus * numBonus * causeBonus * quotePenalty * quoteVerbPenalty
    return { sent, score, idx: i }
  })
}

// ══════════════════════════════════════════════════════════════════════
// §6. 이벤트·도메인 감지
// ══════════════════════════════════════════════════════════════════════

function detectEvent(title, bodySnippet) {
  const text = (title + ' ' + bodySnippet.slice(0, 500)).toLowerCase()
  const priority = ['funding', 'acquisition', 'product', 'policy', 'research', 'person', 'market']
  const scores = {}
  for (const type of priority) {
    const { kw } = EVENT_TYPES[type]
    scores[type] = kw.filter(k => text.includes(k)).length
    scores[type] += kw.filter(k => title.toLowerCase().includes(k)).length // 제목 2배 가중
  }
  const best = priority.reduce((a, b) => scores[a] >= scores[b] ? a : b)
  return scores[best] > 0 ? best : 'general'
}

function detectDomain(title, bodySnippet) {
  const text = (title + ' ' + bodySnippet.slice(0, 600)).toLowerCase()
  let best = 'startup', bestScore = 0
  for (const [domain, { kw }] of Object.entries(DOMAINS)) {
    const score = kw.filter(k => text.includes(k.toLowerCase())).length
    if (score > bestScore) { best = domain; bestScore = score }
  }
  return best
}

// 신뢰도 기반 카테고리 자동 분류
function mapCategory(domain, eventType) {
  const domainCat = DOMAINS[domain]?.cat || 'news'
  // 정책/청소년 기사는 insight 우선
  if (eventType === 'policy' || domain === 'youth') return 'insight'
  // 투자/시장은 trend
  if (eventType === 'funding' || eventType === 'market') return 'trend'
  // 창업가 스토리
  if (eventType === 'person') return 'magazine'
  return domainCat
}

// ══════════════════════════════════════════════════════════════════════
// §7. AI 요약 생성기 — What→Why→So What 구조
// ══════════════════════════════════════════════════════════════════════

function applyTermExplanations(text, usedTerms) {
  let result = text
  for (const [term, expl] of Object.entries(TERM_DICT)) {
    if (result.includes(term) && !usedTerms.has(term)) {
      result = result.replace(term, expl)
      usedTerms.add(term)
      break // 한 번에 하나씩만 (가독성 유지)
    }
  }
  return result
}

function buildSummary(title, body) {
  const cleanBody = cleanText(body)
  const domain    = detectDomain(title, cleanBody)
  const eventType = detectEvent(title, cleanBody)
  const sentences = splitSentences(cleanBody)

  // 빈 본문 fallback
  if (sentences.length === 0) {
    return buildFallback(title, domain, eventType)
  }

  // BM25 기반 문장 스코어링
  const titleToks = expandWithGraph(tokenize(title, true))
  const scored    = scoreSentences(sentences, titleToks)
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return buildFallback(title, domain, eventType)

  // 상위 4개 추출 → 원문 순서 복원
  const topIdxs = new Set(scored.slice(0, 4).map(x => x.idx))
  const orderedTop = sentences.filter((_, i) => topIdxs.has(i)).slice(0, 3)

  // 수치 문장 (최대 2개, 중복 제외)
  const numSents = sentences
    .filter(s => hasNumberValue(s) && !orderedTop.includes(s))
    .slice(0, 2)

  // 인과관계 문장 (최대 1개, 중복 제외)
  const causalSents = sentences
    .filter(s => isCausalSentence(s) && !orderedTop.includes(s) && !numSents.includes(s))
    .slice(0, 1)

  const evtInfo    = EVENT_TYPES[eventType] || EVENT_TYPES.market
  const domainInfo = DOMAINS[domain] || DOMAINS.startup
  const insight    = INSIGHT_TEMPLATES[eventType] || INSIGHT_TEMPLATES.general
  const usedTerms  = new Set()

  // ── What (핵심 내용) ──────────────────────────────────────────────
  const lines = [
    `**${title.trim()}**`,
    '',
    `${evtInfo.label} · ${domainInfo.ko}`,
    '',
    '**핵심 내용**',
    '',
    ...orderedTop.map(s => applyTermExplanations(s, usedTerms)),
    '',
  ]

  // ── Why (주요 수치) ───────────────────────────────────────────────
  if (numSents.length > 0) {
    lines.push('**주요 수치**', '')
    numSents.forEach(s => lines.push(`→ ${applyTermExplanations(s, usedTerms)}`))
    lines.push('')
  }

  // ── Context (배경·맥락) ───────────────────────────────────────────
  if (causalSents.length > 0) {
    lines.push('**배경과 맥락**', '')
    lines.push(applyTermExplanations(causalSents[0], usedTerms))
    lines.push('')
  }

  // ── So What (창업가 시사점) ───────────────────────────────────────
  lines.push('**창업가 시사점**', '', insight, '')
  lines.push(`*ai: insightship-v6 · domain: ${domain} · event: ${eventType}*`)

  return lines.join('\n')
}

function buildFallback(title, domain, eventType) {
  const evtInfo    = EVENT_TYPES[eventType] || EVENT_TYPES.market
  const domainInfo = DOMAINS[domain] || DOMAINS.startup
  const insight    = INSIGHT_TEMPLATES[eventType] || INSIGHT_TEMPLATES.general
  return [
    `**${title.trim()}**`,
    '',
    `${evtInfo.label} · ${domainInfo.ko}`,
    '',
    '**핵심 내용**',
    '',
    title.trim(),
    '',
    '**창업가 시사점**',
    '',
    insight,
    '',
    `*ai: insightship-v6 · domain: ${domain} · event: ${eventType}*`,
  ].join('\n')
}

// ══════════════════════════════════════════════════════════════════════
// §8. 중복 감지 — 코사인 유사도 (설계서 §8 중복 제거 기준 0.85)
// ══════════════════════════════════════════════════════════════════════

function cosineSim(a, b) {
  const setA = new Set(a), setB = new Set(b)
  const intersection = [...setA].filter(x => setB.has(x)).length
  const denom = Math.sqrt(setA.size) * Math.sqrt(setB.size)
  return denom > 0 ? intersection / denom : 0
}

function isDuplicateTitle(title, existingTitles) {
  const tToks = tokenize(title)
  for (const existing of existingTitles) {
    const eToks = tokenize(existing)
    if (cosineSim(tToks, eToks) >= 0.72) return true
  }
  return false
}

// ══════════════════════════════════════════════════════════════════════
// §9. 읽기 시간 추정
// ══════════════════════════════════════════════════════════════════════

function estimateReadTime(text) {
  const charCount = (text || '').length
  // 한국어 평균 읽기 속도 ~350자/분
  return Math.max(1, Math.ceil(charCount / 350))
}

// ══════════════════════════════════════════════════════════════════════
// §10. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  // GET: 엔진 상태 확인
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      engine: 'insightship-news-ai-v6',
      version: '6.0.0',
      features: ['BM25', 'KnowledgeGraph', 'EventClassifier', 'DomainDetector', 'InsightSynthesizer', 'DuplicateFilter'],
      cost: 0,
      external_api: false,
      status: 'ready',
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // 인증
  const cronHeader = req.headers.get('x-vercel-cron')
  const authHeader = req.headers.get('authorization')
  const secretHeader = req.headers.get('x-cron-secret')
  const isAuth = cronHeader === '1'
    || authHeader === `Bearer ${CRON_SECRET}`
    || secretHeader === CRON_SECRET

  if (!isAuth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if (!SB_URL || !SB_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 })
  }

  const H = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  }

  // 파라미터 파싱 (reprocess 모드)
  let params = {}
  try {
    if (req.method === 'POST') {
      const ct = req.headers.get('content-type') || ''
      if (ct.includes('application/json')) params = await req.json().catch(() => ({}))
    }
  } catch {}

  const reprocessAll = params.reprocess === true
  const batchLimit   = Math.min(params.limit || 50, 100)
  const cutoffDays   = params.days || 7  // 기본 7일 이내

  // 처리할 기사 조회
  let articles = []
  try {
    if (reprocessAll) {
      // 전체 재처리 모드: ai_version이 v6 미만인 것
      const url = `${SB_URL}/rest/v1/articles`
        + `?select=id,title,body,excerpt,ai_version`
        + `&status=eq.published`
        + `&order=published_at.desc`
        + `&limit=${batchLimit}`
      const res = await fetch(url, { headers: H })
      const all = await res.json()
      // v6 미처리 우선
      articles = Array.isArray(all)
        ? all.filter(a => !a.ai_version || !a.ai_version.includes('v6'))
        : []
      if (articles.length === 0) articles = Array.isArray(all) ? all.slice(0, batchLimit) : []
    } else {
      // 일반 모드: cutoffDays 이내 미처리 기사
      const cutoff = new Date(Date.now() - cutoffDays * 86400 * 1000).toISOString()
      const url = `${SB_URL}/rest/v1/articles`
        + `?published_at=gte.${cutoff}`
        + `&select=id,title,body,excerpt,ai_version`
        + `&order=published_at.desc`
        + `&limit=${batchLimit}`
      const res = await fetch(url, { headers: H })
      const all = await res.json()
      // v6 미처리 우선, 없으면 전부
      const unprocessed = Array.isArray(all)
        ? all.filter(a => !a.ai_version || !a.ai_version.includes('v6'))
        : []
      articles = unprocessed.length > 0 ? unprocessed : (Array.isArray(all) ? all : [])
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }

  if (!articles.length) {
    return new Response(JSON.stringify({
      message: '처리할 기사 없음 (모두 v6 완료)',
      processed: 0, skipped: 0, errors: [],
      timestamp: new Date().toISOString(),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  // 중복 제목 감지용 캐시
  const processedTitles = []
  const results = { processed: 0, skipped: 0, duplicates: 0, errors: [] }

  for (const article of articles) {
    try {
      const { id, title, body, excerpt } = article
      if (!title) { results.skipped++; continue }

      // 중복 제목 체크
      if (isDuplicateTitle(title, processedTitles)) {
        results.duplicates++
        results.skipped++
        continue
      }
      processedTitles.push(title)

      const bodyText = (body && body.length > 100) ? body : (excerpt || title)
      const summary  = buildSummary(title, bodyText)
      const domain   = detectDomain(title, cleanText(bodyText))
      const eventType = detectEvent(title, cleanText(bodyText))
      const category = mapCategory(domain, eventType)
      const readTime = estimateReadTime(bodyText)

      const patchRes = await fetch(
        `${SB_URL}/rest/v1/articles?id=eq.${id}`,
        {
          method: 'PATCH',
          headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({
            ai_summary:      summary,
            category,
            ai_version:      'insightship-v6',
            ai_processed_at: new Date().toISOString(),
            read_time:       readTime,
            // ai_category: 도메인 기반 세분류
            ai_category: domain,
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
    engine: 'insightship-v6',
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
