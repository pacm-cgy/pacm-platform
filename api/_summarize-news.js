/**
 * api/_summarize-news.js
 * INSIGHTSHIP LONGFORM NEWS ENGINE v18.0
 *
 * 핵심 원칙:
 *   1. 외부 LLM API 일절 사용하지 않음 (Gemini / Anthropic / OpenAI 모두 제거)
 *   2. 본문(body) 정제 후 200자 미만 기사 → 완전 스킵 (ai_summary 생성 안 함)
 *   3. 본문 문장을 직접 분석 — 인과·수치·인용·목적·맥락 문장을 추출해 스토리로 재구성
 *   4. 고정 템플릿 문구 0개 — 기사마다 완전히 다른 결과물
 *
 * POST /api/summarize-news  (x-cron-secret 또는 x-vercel-cron: 1)
 * GET  /api/summarize-news  → 엔진 상태 확인
 */

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const CURRENT_VERSION = 'insightship-longform-v18'

// ══════════════════════════════════════════════════════════════════════
// §1. 구버전 패턴 감지 (v8~v17)
// ══════════════════════════════════════════════════════════════════════

const LEGACY_MARKERS = [
  'insightship-longform-v8',  'insightship-longform-v9',
  'insightship-longform-v10', 'insightship-longform-v11',
  'insightship-longform-v12', 'insightship-longform-v13',
  'insightship-longform-v14', 'insightship-longform-v15',
  'insightship-longform-v16', 'insightship-longform-v17',
]

// 고정 템플릿 지문 — 이 문구가 들어있으면 구버전 결과물로 판정
const LEGACY_PHRASES = [
  '[핵심 내용]', '[배경 및 분석]', '[투자 시장 심층 분석',
  '[청소년 창업가를 위한', '[핵심 포인트]',
  '이번 투자 소식은 해당 기업의 기술력과 성장 가능성을 시장이 인정한',
  '스타트업 투자는 보통 시드(초기) →',
  '투자금은 통상 제품 개발 가속화, 핵심 인재 채용',
  '이 뉴스 뒤에 더 큰 이야기가 있습니다',
  '비즈니스 세계에서 아무것도 우연히 일어나지 않습니다',
  '한 회사의 결정, 한 시장의 변화가 연결되고 연결되어',
  '새로운 것이 나왔습니다.',
  '**무슨 일이 일어났나요?**',
  '국내 투자·펀딩 생태계에서 새로운 움직임이 포착됐습니다',
  '청소년 창업 분야에서 주목할 만한 소식입니다',
  '&amp;', '&lt;', '&gt;', '&quot;', '&#39;',
]

function isLegacy(text) {
  if (!text) return true
  if (LEGACY_MARKERS.some(m => text.includes(m))) return true
  if (LEGACY_PHRASES.some(p => text.includes(p))) return true
  return false
}

function needsProcess(ai_summary) {
  if (!ai_summary) return true
  if (ai_summary.includes(CURRENT_VERSION)) return false
  return isLegacy(ai_summary)
}

// ══════════════════════════════════════════════════════════════════════
// §2. 텍스트 정제
// ══════════════════════════════════════════════════════════════════════

function cleanBody(raw) {
  return (raw || '')
    // HTML 태그·스크립트
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    // HTML 엔티티
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&[a-zA-Z]{2,8};/g, '').replace(/&#x?[0-9a-fA-F]+;/g, '')
    // URL
    .replace(/https?:\/\/\S+/g, '')
    // 이메일
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, '')
    // 기자 서명 패턴
    .replace(/[가-힣]{2,4}\s*기자\s*=?/g, '')
    .replace(/\[([가-힣]+=[가-힣\s]+)\]/g, '')
    .replace(/\(사진=[^\)]+\)/g, '')
    .replace(/\(이미지[^)]+\)/g, '')
    // 날짜·입력 메타
    .replace(/입력\s*\d{4}[.\-]\d{2}[.\-]\d{2}.*$/gm, '')
    .replace(/수정\s*\d{4}[.\-]\d{2}[.\-]\d{2}.*$/gm, '')
    .replace(/승인\s*\d{4}\.\d{2}\.\d{2}.*$/gm, '')
    .replace(/\d{4}\.\d{2}\.\d{2}\s*\d{2}:\d{2}/g, '')
    // 저작권
    .replace(/저작권자\s*©.*$/gm, '')
    .replace(/무단전재\s*및\s*재배포\s*금지/g, '')
    .replace(/\*재판매\s*및\s*DB\s*금지/g, '')
    // UI/네비 텍스트
    .replace(/공유하기|페이스북|트위터|카카오톡\s*공유|인스타그램|네이버\s*밴드|URL\s*복사/g, '')
    .replace(/기사\s*읽어주기|다시듣기|글씨\s*크기|프린트|댓글\s*\d*|바로가기|본문\s*글씨/g, '')
    .replace(/이전\s*기사보기|다음\s*기사보기|스크롤\s*이동/g, '')
    .replace(/가\s+가\s+가(\s+가)*/g, '')
    // 광고·협찬
    .replace(/광고|협찬|sponsored|PR\b/gi, '')
    // 연속 공백·줄바꿈
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 문장 분리
function splitSentences(text) {
  return text
    .replace(/([.!?])\s+/g, '$1\n')
    .replace(/([다요임음했다였다됩니다합니다])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length >= 15 && s.length <= 500)
}

// 노이즈 문장 판별
function isNoise(s) {
  return /무단\s*(전재|배포|복제)|copyright|all rights reserved|구독|좋아요|댓글|광고|협찬|\[사진\]|\[영상\]|기사보기/i.test(s)
    || /^(가\s*){2,}/.test(s)
    || s.split(' ').length < 3
}

// ══════════════════════════════════════════════════════════════════════
// §3. 문장 유형 분류기 — 고정 라벨 대신 기사 문장 자체를 사용
// ══════════════════════════════════════════════════════════════════════

function classifySentence(s) {
  if (isNoise(s)) return 'noise'
  // 수치/통계 문장
  if (/[\d,]+억|[\d,]+조|[\d,]+만\s*원|[\d]+%|[\d]+배|[\d,]+만\s*명|[\d,]+개|[\d]+위/.test(s)) return 'stat'
  // 인용문
  if ((s.includes('"') || s.includes('\u201c') || s.includes('\u201d') || s.includes("'")) &&
      /(밝혔다|말했다|전했다|강조했다|설명했다|덧붙였다|언급했다|표명했다|전망했다)/.test(s)) return 'quote'
  // 인과·배경 문장
  if (/(때문에|이유로|원인은|배경에는|결과로|따라서|이로\s*인해|덕분에|영향으로|위해|통해|바탕으로)/.test(s)) return 'causal'
  // 목표·계획 문장
  if (/(목표|계획|예정|방침|전략|추진|노력|위해|구상|이다\.?\s*$)/.test(s)) return 'goal'
  // 설명·정의 문장
  if (/(이란|이는|뜻하는|의미하는|해당하는|것으로서|알려진|는데)/.test(s)) return 'explain'
  return 'fact'
}

// ══════════════════════════════════════════════════════════════════════
// §4. 토크나이저 & BM25 (문장 중요도 점수)
// ══════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','위해','통해',
  '있는','없는','되는','하는','있다','없다','된다','한다','이다',
  '있으며','되며','하며','이번','지난','올해','작년','최근','현재',
  '특히','또','더','가장','매우','모두','함께','이미','아직','약','총',
  '기자','특파원','뉴스','보도','발표','밝혔다','말했다','전했다',
  '대한','관련','따른','이달','오늘','어제','지금','전','후','당',
  '각','제','본','해당','설명했다','밝혀졌다','알려졌다','한편',
])

function tokenize(text) {
  if (!text) return []
  return (text.replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g, ' ').toLowerCase()
    .match(/[가-힣]{2,}|[a-zA-Z]{3,}|[0-9]+/g) || [])
    .filter(t => !STOPWORDS.has(t) && t.length >= 2)
}

const K1 = 1.5, BP = 0.75

function bm25Score(queryToks, docToks, avgLen, N, df) {
  const tf = {}
  for (const t of docToks) tf[t] = (tf[t] || 0) + 1
  let score = 0
  for (const q of queryToks) {
    if (!tf[q]) continue
    const idf = Math.log((N - (df[q] || 0) + 0.5) / ((df[q] || 0) + 0.5) + 1)
    const tfw = (tf[q] * (K1 + 1)) / (tf[q] + K1 * (1 - BP + BP * docToks.length / avgLen))
    score += idf * tfw
  }
  return score
}

function rankSentences(sentences, titleToks) {
  const toks = sentences.map(s => tokenize(s))
  const N = sentences.length || 1
  const df = {}
  for (const ts of toks) for (const t of new Set(ts)) df[t] = (df[t] || 0) + 1
  const avgLen = toks.reduce((s, t) => s + t.length, 0) / N || 1

  return sentences.map((sent, i) => {
    const type = classifySentence(sent)
    if (type === 'noise') return { sent, score: -1, type, idx: i }
    const bm = bm25Score(titleToks, toks[i], avgLen, N, df)
    // 위치 가중치 (앞 문장 중요)
    const pos = i < 3 ? 1.6 : i < 7 ? 1.3 : i < 15 ? 1.1 : 1.0
    // 유형 가중치
    const typeW = { stat: 1.5, quote: 1.4, causal: 1.3, goal: 1.2, explain: 1.1, fact: 1.0 }[type] || 1.0
    // 길이 가중치
    const l = sent.length
    const lenW = (l >= 40 && l <= 200) ? 1.3 : l > 300 ? 0.8 : 1.0
    return { sent, score: bm * pos * typeW * lenW, type, idx: i }
  }).sort((a, b) => b.score - a.score)
}

// 중복 문장 제거 (코사인 유사도)
function dedupSentences(ranked, threshold = 0.7) {
  const kept = []
  const keptToks = []
  for (const item of ranked) {
    if (item.score < 0) continue
    const toks = new Set(tokenize(item.sent))
    let dup = false
    for (const kt of keptToks) {
      const inter = [...toks].filter(x => kt.has(x)).length
      const denom = Math.sqrt(toks.size) * Math.sqrt(kt.size)
      if (denom > 0 && inter / denom >= threshold) { dup = true; break }
    }
    if (!dup) {
      kept.push(item)
      keptToks.push(toks)
    }
  }
  return kept
}

// ══════════════════════════════════════════════════════════════════════
// §5. 이벤트·도메인 분류
// ══════════════════════════════════════════════════════════════════════

const EVENT_TYPES = {
  funding:     { kw: ['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC','엔젤','달러','Pre-A','CVC','브릿지'], emoji: '💰', label: '투자 유치' },
  product:     { kw: ['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈','런칭','배포','상용화','신기능'], emoji: '🚀', label: '제품/서비스 출시' },
  policy:      { kw: ['정부','지원','공모','선발','과기부','중기부','창진원','예산','규제','정책','공고','모집','개최','경진대회','프로그램','바우처','R&D'], emoji: '📋', label: '정책/지원' },
  acquisition: { kw: ['인수','합병','M&A','지분','매각','인수합병','피인수','전략적투자'], emoji: '🤝', label: '인수/합병' },
  research:    { kw: ['연구','논문','결과','조사','분석','보고서','데이터','통계','발표','리포트','설문'], emoji: '🔬', label: '리서치/분석' },
  person:      { kw: ['대표','CEO','창업자','설립자','인터뷰','스토리','수상','선정','창업가','강연','멘토'], emoji: '👤', label: '창업가 스토리' },
  market:      { kw: ['시장','성장','규모','트렌드','전망','예측','확대','점유율','글로벌','산업','진출','수출'], emoji: '📊', label: '시장/트렌드' },
  ipo:         { kw: ['IPO','상장','코스닥','코스피','증권','기업공개','프리IPO'], emoji: '📈', label: 'IPO/상장' },
}

const DOMAINS = {
  tech:       { kw: ['AI','인공지능','딥러닝','반도체','GPU','클라우드','SaaS','소프트웨어','로봇','자율주행','LLM','생성형'], ko: '기술·AI' },
  investment: { kw: ['투자','펀딩','시리즈','억원','조원','달러','VC','벤처','자본','CVC'], ko: '투자·금융' },
  policy:     { kw: ['정부','지원','공모','과기부','중기부','창진원','규제','정책','지자체','공공','바우처'], ko: '정책·지원' },
  health:     { kw: ['헬스케어','의료','바이오','디지털헬스','건강','제약','메디컬','임상','신약'], ko: '헬스케어·바이오' },
  climate:    { kw: ['기후','탄소','친환경','에너지','태양광','수소','클린테크','신재생','배터리','전기차'], ko: '기후·에너지' },
  fintech:    { kw: ['핀테크','결제','금융','블록체인','암호화폐','뱅크','디파이'], ko: '핀테크' },
  esg:        { kw: ['ESG','탄소중립','임팩트','소셜벤처','그린','지속가능'], ko: 'ESG·임팩트' },
  youth:      { kw: ['청소년','청년','대학생','고등학생','창업교육','해커톤','학생창업','여성창업'], ko: '청소년·교육' },
  startup:    { kw: ['스타트업','창업','유니콘','피봇','스케일업','창업팀'], ko: '창업·비즈니스' },
}

function detectEvent(title, bodyClean) {
  const text = (title + ' ' + bodyClean.slice(0, 800)).toLowerCase()
  let best = 'general', bestScore = 0
  for (const [type, { kw }] of Object.entries(EVENT_TYPES)) {
    let score = kw.filter(k => text.includes(k.toLowerCase())).length
    score += kw.filter(k => title.toLowerCase().includes(k.toLowerCase())).length * 1.5
    if (score > bestScore) { best = type; bestScore = score }
  }
  return bestScore > 0 ? best : 'general'
}

function detectDomain(title, bodyClean) {
  const text = (title + ' ' + bodyClean.slice(0, 800)).toLowerCase()
  let best = 'startup', bestScore = 0
  for (const [domain, { kw }] of Object.entries(DOMAINS)) {
    const score = kw.filter(k => text.includes(k.toLowerCase())).length
    if (score > bestScore) { best = domain; bestScore = score }
  }
  return best
}

function mapCategory(domain, eventType) {
  if (eventType === 'policy' || domain === 'youth' || domain === 'policy') return 'insight'
  if (eventType === 'funding' || eventType === 'market' || eventType === 'ipo') return 'trend'
  if (eventType === 'person') return 'magazine'
  return 'news'
}

function estimateReadTime(text) {
  return Math.max(3, Math.ceil((text || '').length / 300))
}

// ══════════════════════════════════════════════════════════════════════
// §6. 제목 파싱 (NER — 기사 내용 분석 보조용)
// ══════════════════════════════════════════════════════════════════════

const GEO_KW = ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','전북','전남','경북','경남','제주','미국','중국','일본','글로벌','해외','유럽','동남아','싱가포르','이스라엘','영국','독일']
const INVESTMENT_STAGES = ['시드','Pre-A','시리즈A','시리즈B','시리즈C','시리즈D','프리IPO']

function parseTitle(title) {
  const amounts = (title.match(/[\d,]+억\s*달러|[\d,]+만\s*달러|[\d,]+조\s*원|[\d,]+억\s*원|[\d,]+만\s*원|\d+억|\d+조|\d[\d,]*\s*달러/g) || [])
  const geo     = GEO_KW.filter(g => title.includes(g))
  const stage   = INVESTMENT_STAGES.find(s => title.includes(s)) || null
  const orgMatch = title.match(/^([^,，·\[\]\s]{2,14}(?:테크|솔루션|랩스?|스튜디오|플랫폼|바이오|AI|ai|Inc|Corp)?)\s*[,，·]/)
  const org     = (orgMatch && orgMatch[1].trim().length >= 2) ? orgMatch[1].trim() : null
  return { amounts, geo, stage, org }
}

// ══════════════════════════════════════════════════════════════════════
// §7. 용어 사전 (기사 본문에 등장한 용어만 선택적으로 삽입)
// ══════════════════════════════════════════════════════════════════════

const TERM_DICT = {
  'IPO':     '기업이 처음으로 주식시장에 상장해 일반 투자자에게 주식을 공개하는 것.',
  'VC':      '스타트업 전문 투자회사로, 고위험·고수익을 목표로 초기 기업에 집중 투자한다.',
  '시리즈A': '제품·시장 적합성(PMF)이 검증된 후 팀·마케팅 확장을 위한 첫 번째 대규모 투자 단계.',
  '시리즈B': '검증된 수익 모델을 바탕으로 빠른 성장을 추진하는 투자 단계.',
  '유니콘':  '기업가치 1조원 이상의 비상장 스타트업을 지칭하는 표현.',
  'SaaS':    '월정액을 내고 인터넷으로 이용하는 구독형 소프트웨어 모델.',
  'M&A':     '한 기업이 다른 기업을 인수하거나 합병하는 것. 스타트업의 주요 엑싯 경로 중 하나.',
  'ESG':     '환경(E), 사회(S), 지배구조(G) 기준으로 기업의 지속가능성을 평가하는 지표.',
  'LLM':     'GPT, Gemini 같은 대규모 언어 모델. 텍스트를 읽고 생성하는 AI 핵심 기술.',
  'CVC':     '대기업이 직접 운영하는 벤처투자 조직.',
  'MVP':     '시장 반응을 빠르게 확인하기 위해 핵심 기능만 담은 첫 번째 제품 버전.',
  'B2B':     '기업이 기업을 대상으로 제품·서비스를 제공하는 비즈니스 모델.',
  'R&D':     '연구개발(Research & Development). 새로운 기술·제품 개발을 위한 투자 활동.',
}

function pickTerms(bodyClean, max = 2) {
  return Object.entries(TERM_DICT)
    .filter(([term]) => bodyClean.includes(term) || bodyClean.includes(term.toLowerCase()))
    .slice(0, max)
}

// ══════════════════════════════════════════════════════════════════════
// §8. 핵심 스토리 빌더 — 본문 문장 직접 분석으로 스토리 생성
//
//  원칙:
//   - 고정 문구 없음. 모든 단락은 기사 본문 문장에서 추출
//   - 추출 문장을 흐름에 맞게 재배열하고 섹션 제목만 붙임
//   - 문장이 부족해도 패딩 문구 삽입 금지
// ══════════════════════════════════════════════════════════════════════

function buildStory(title, bodyClean) {
  const sentences   = splitSentences(bodyClean).filter(s => !isNoise(s))
  const titleToks   = tokenize(title)
  const ranked      = rankSentences(sentences, titleToks)
  const deduped     = dedupSentences(ranked)

  // 유형별 버킷 분류 (원본 순서 유지)
  const byType = { stat: [], quote: [], causal: [], goal: [], explain: [], fact: [] }
  for (const item of deduped) {
    if (item.score < 0) continue
    if (byType[item.type]) byType[item.type].push(item)
  }

  // 중요도 상위 문장을 원본 순서(idx)로 정렬해 리드로 사용
  const leadPool = deduped
    .filter(d => d.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .sort((a, b) => a.idx - b.idx)

  const parts = []

  // ── 리드 (상위 핵심 문장 2~3개, 원문 그대로) ──────────────────────
  const leadSents = leadPool.slice(0, 3).map(d => d.sent)
  if (leadSents.length > 0) {
    parts.push('## 📌 무슨 일인가')
    for (const s of leadSents) parts.push(s)
    parts.push('')
  }

  // ── 수치·통계 (기사의 실제 숫자 사실) ────────────────────────────
  const stats = byType.stat.slice(0, 4).sort((a, b) => a.idx - b.idx).map(d => d.sent)
  if (stats.length > 0) {
    parts.push('## 📊 주요 사실과 숫자')
    for (const s of stats) parts.push(s)
    parts.push('')
  }

  // ── 인용문 (기사에 나온 실제 발언) ───────────────────────────────
  const quotes = byType.quote.slice(0, 3).sort((a, b) => a.idx - b.idx).map(d => d.sent)
  if (quotes.length > 0) {
    parts.push('## 💬 직접 발언')
    for (const s of quotes) parts.push(`> ${s}`)
    parts.push('')
  }

  // ── 인과·배경 (왜 이 일이 일어났는가) ───────────────────────────
  const causals = byType.causal.slice(0, 4).sort((a, b) => a.idx - b.idx).map(d => d.sent)
  if (causals.length > 0) {
    parts.push('## 🗺️ 왜, 어떻게')
    for (const s of causals) parts.push(s)
    parts.push('')
  }

  // ── 목표·계획 (앞으로의 방향) ────────────────────────────────────
  const goals = byType.goal.slice(0, 4).sort((a, b) => a.idx - b.idx).map(d => d.sent)
  if (goals.length > 0) {
    parts.push('## 🚀 앞으로의 방향')
    for (const s of goals) parts.push(s)
    parts.push('')
  }

  // ── 보충 사실 (나머지 중요 문장들) ───────────────────────────────
  const usedIdxs = new Set([
    ...leadPool.map(d => d.idx),
    ...byType.stat.slice(0, 4).map(d => d.idx),
    ...byType.quote.slice(0, 3).map(d => d.idx),
    ...byType.causal.slice(0, 4).map(d => d.idx),
    ...byType.goal.slice(0, 4).map(d => d.idx),
  ])
  const extra = deduped
    .filter(d => d.score > 0 && !usedIdxs.has(d.idx))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .sort((a, b) => a.idx - b.idx)
    .map(d => d.sent)

  if (extra.length > 0) {
    parts.push('## 📎 추가 맥락')
    for (const s of extra) parts.push(s)
    parts.push('')
  }

  // ── 용어 해설 (본문에 등장한 전문용어만) ─────────────────────────
  const terms = pickTerms(bodyClean)
  if (terms.length > 0) {
    parts.push('## 📖 용어 이해')
    for (const [term, def] of terms) {
      parts.push(`**${term}** — ${def}`)
    }
    parts.push('')
  }

  // ── 버전 마커 (구버전 감지용, 노출 안 됨) ────────────────────────
  parts.push(`<!-- ${CURRENT_VERSION} -->`)

  return parts.join('\n')
}

// ══════════════════════════════════════════════════════════════════════
// §9. 중복 제목 감지
// ══════════════════════════════════════════════════════════════════════

function cosineSim(a, b) {
  const sa = new Set(a), sb = new Set(b)
  const inter = [...sa].filter(x => sb.has(x)).length
  const denom = Math.sqrt(sa.size) * Math.sqrt(sb.size)
  return denom > 0 ? inter / denom : 0
}

function isDupTitle(title, seen) {
  const toks = tokenize(title)
  return seen.some(s => cosineSim(toks, s) >= 0.72)
}

// ══════════════════════════════════════════════════════════════════════
// §10. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

const H = {
  apikey:        SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
}

export const config = { maxDuration: 60 }

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cron-secret, x-vercel-cron',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // GET — 엔진 상태
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      engine:    CURRENT_VERSION,
      version:   '18.0.0',
      principle: '외부 LLM 미사용. 본문 문장 직접 분석 (BM25 + 유형 분류). 본문 200자 미만 기사 스킵.',
      status:    'ready',
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // POST — 인증
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  const cronHeader   = req.headers.get('x-cron-secret') || req.headers.get('x-vercel-cron')
  const authHeader   = req.headers.get('authorization') || ''
  const bearerToken  = authHeader.replace(/^Bearer\s+/i, '')
  const isCron       = cronHeader === CRON_SECRET || cronHeader === '1'
  const isAdmin      = !isCron && bearerToken ? await checkAdminJWT(bearerToken) : false

  if (!isCron && !isAdmin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 파라미터 파싱
  let body = {}
  try { body = await req.json() } catch { /* no body */ }
  const fixLegacy    = body.fixLegacy    === true
  const reprocessAll = body.reprocessAll === true
  const batchLimit   = Math.min(Number(body.limit)  || 30, 100)
  const offset       = Number(body.offset) || 0
  const cutoffDays   = Number(body.days)   || 30

  if (!SB_URL || !SB_KEY) {
    return new Response(JSON.stringify({ error: 'Supabase 환경변수 누락' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── 기사 조회 ──────────────────────────────────────────────────────
  let articles = []
  try {
    if (fixLegacy) {
      // 레거시 ai_summary가 있는 기사들
      const url = `${SB_URL}/rest/v1/articles`
        + `?select=id,title,body,excerpt,ai_summary`
        + `&ai_summary=not.is.null`
        + `&order=published_at.desc`
        + `&limit=${batchLimit}&offset=${offset}`
      const res = await fetch(url, { headers: H })
      const all = await res.json()
      articles = Array.isArray(all) ? all.filter(a => needsProcess(a.ai_summary)) : []
    } else if (reprocessAll) {
      const url = `${SB_URL}/rest/v1/articles`
        + `?select=id,title,body,excerpt,ai_summary`
        + `&order=published_at.desc`
        + `&limit=${batchLimit}&offset=${offset}`
      const res = await fetch(url, { headers: H })
      const all = await res.json()
      articles = Array.isArray(all) ? all.filter(a => !a.ai_summary?.includes(CURRENT_VERSION)) : []
    } else {
      const cutoff = new Date(Date.now() - cutoffDays * 86400 * 1000).toISOString()
      const [resRecent, resNull] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/articles`
          + `?published_at=gte.${cutoff}`
          + `&select=id,title,body,excerpt,ai_summary`
          + `&order=published_at.desc`
          + `&limit=${batchLimit}&offset=${offset}`,
          { headers: H }),
        fetch(`${SB_URL}/rest/v1/articles`
          + `?published_at=gte.${cutoff}`
          + `&select=id,title,body,excerpt,ai_summary`
          + `&ai_summary=is.null`
          + `&order=published_at.desc`
          + `&limit=50`,
          { headers: H }),
      ])
      const recent   = await resRecent.json()
      const nullArts = await resNull.json()
      const combined = [
        ...(Array.isArray(recent)   ? recent   : []),
        ...(Array.isArray(nullArts) ? nullArts : []),
      ]
      const seen = new Set()
      articles = combined.filter(a => {
        if (seen.has(a.id)) return false
        seen.add(a.id)
        return needsProcess(a.ai_summary)
      })
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!articles.length) {
    return new Response(JSON.stringify({
      message: '처리할 기사 없음',
      processed: 0, skipped: 0, errors: [],
      engine: CURRENT_VERSION,
      timestamp: new Date().toISOString(),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ── 기사별 처리 ────────────────────────────────────────────────────
  const seenTitles = []  // 중복 제목 감지용 토큰 배열
  const results = { processed: 0, skipped: 0, skipped_no_body: 0, duplicates: 0, errors: [] }

  for (const article of articles) {
    try {
      const { id, title, body: rawBody, excerpt } = article
      if (!title || title.trim().length < 5) { results.skipped++; continue }

      // 중복 제목 체크
      const titleToks = tokenize(title)
      if (isDupTitle(title, seenTitles)) { results.duplicates++; results.skipped++; continue }
      seenTitles.push(titleToks)

      // 본문 정제
      const bodyClean = cleanBody(rawBody || excerpt || '')

      // ★ 핵심 규칙: 정제 후 200자 미만이면 완전 스킵
      if (bodyClean.length < 200) {
        results.skipped_no_body++
        results.skipped++
        continue
      }

      // 스토리 생성
      const summary   = buildStory(title, bodyClean)
      const domain    = detectDomain(title, bodyClean)
      const eventType = detectEvent(title, bodyClean)
      const category  = mapCategory(domain, eventType)
      const readTime  = estimateReadTime(summary)

      // DB 저장
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

      if (patchRes.ok || patchRes.status === 204) {
        results.processed++
      } else {
        const err = await patchRes.text()
        results.errors.push(`[${id}] HTTP${patchRes.status} ${err.slice(0, 200)}`)
      }
    } catch (e) {
      results.errors.push(e.message?.slice(0, 100) || 'unknown error')
    }
  }

  return new Response(JSON.stringify({
    ...results,
    total:     articles.length,
    engine:    CURRENT_VERSION,
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ══════════════════════════════════════════════════════════════════════
// §11. Admin JWT 검증
// ══════════════════════════════════════════════════════════════════════

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
      `${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,role&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    )
    if (!r2.ok) return false
    const rows = await r2.json().catch(() => [])
    return Array.isArray(rows) && rows[0]?.role === 'admin'
  } catch { return false }
}
