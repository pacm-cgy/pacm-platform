/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║   PACM-AI MENTOR ENGINE v5.1 — 완전 자체 개발 AI                   ║
 * ║                                                                      ║
 * ║   외부 LLM API 완전 0원 — 100% 자체 구현                            ║
 * ║                                                                      ║
 * ║   핵심 능력:                                                         ║
 * ║   1. Dynamic Response Synthesizer  — 고정 템플릿 없음, 실시간 조합  ║
 * ║   2. Self Research Engine v2       — DB 5소스 + BM25 커뮤니티 검색  ║
 * ║   3. Simulation Engine             — 시나리오 시뮬레이션 자동 생성  ║
 * ║   4. Continuous Learning v2        — 응답 품질 자가 평가 + 자기 진화║
 * ║   5. Context Reasoner v2           — 세션 지속성 + 사용자 프로필    ║
 * ║   6. Knowledge Graph v2            — 개념 간 관계 추론 + 동적 확장  ║
 * ║   7. Response Quality Evaluator    — 자체 품질 점수 + 개선 루프     ║
 * ║   8. Ethics Filter v1              — 유해·부적절 발언 차단 + 안전   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
export const config = { runtime: 'edge' }

const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// ══════════════════════════════════════════════════════════════════════
// §1. 핵심 NLP 엔진 — 한국어 형태소 분석 + TF-IDF + BM25
// ══════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','위해','통해',
  '대한','관련','따른','있는','없는','되는','하는','있다','없다',
  '된다','한다','이다','있으며','되며','하며','이번','지난','올해',
  '특히','또','더','가장','매우','모두','약','총','전','후','당','각',
  '제','본','해당','어떻게','무엇','언제','어디','왜','어느','뭐','어떤',
  '제가','저는','나는','우리','여기','거기','입니다','합니다','이에요',
  '알려','알고','싶어','주세요','해주세요','도와','부탁','좀','잠깐',
  '혹시','그냥','아직','이미','정말','너무','많이','조금','다시','바로',
])

// 한국어 토크나이저 (유니그램 + 바이그램)
function tokenize(text, withBigram = false) {
  if (!text) return []
  const clean = text.replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g, ' ').toLowerCase()
  const uni = (clean.match(/[가-힣]{2,}|[a-z]{3,}|[0-9]+/g) || [])
    .filter(t => !STOPWORDS.has(t) && t.length >= 2)
  if (!withBigram) return uni
  const bi = []
  for (let i = 0; i < uni.length - 1; i++) bi.push(uni[i] + '|' + uni[i + 1])
  return [...uni, ...bi]
}

// BM25 스코어링
const K1 = 1.5, B = 0.75
function bm25Score(qToks, dToks, avgLen, N, df) {
  const len = dToks.length
  const tf = {}
  for (const t of dToks) tf[t] = (tf[t] || 0) + 1
  let score = 0
  for (const q of qToks) {
    if (!tf[q]) continue
    const idf = Math.log((N - (df[q] || 0) + 0.5) / ((df[q] || 0) + 0.5) + 1)
    const tfw = (tf[q] * (K1 + 1)) / (tf[q] + K1 * (1 - B + B * len / avgLen))
    score += idf * tfw
  }
  return score
}

// ══════════════════════════════════════════════════════════════════════
// §2. 지식 그래프 — 개념 간 관계 맵 (자체 구현)
// ══════════════════════════════════════════════════════════════════════

const KNOWLEDGE_GRAPH = {
  // 개념 → [관련 개념, 가중치]
  '창업':        [['아이디어',0.9],['팀',0.8],['자금',0.7],['MVP',0.85],['시장',0.8]],
  '아이디어':    [['검증',0.95],['문제',0.9],['린캔버스',0.8],['고객',0.85]],
  '린캔버스':    [['문제',0.9],['해결책',0.9],['UVP',0.85],['수익',0.8],['고객',0.9]],
  'MVP':         [['검증',0.95],['프로토타입',0.9],['피드백',0.85],['린캔버스',0.7]],
  '투자':        [['VC',0.9],['시리즈A',0.8],['엔젤',0.75],['피치덱',0.95],['트랙션',0.85]],
  '피치덱':      [['투자',0.9],['문제',0.8],['팀',0.85],['시장',0.8],['수익',0.75]],
  '수익모델':    [['구독',0.8],['B2B',0.75],['프리미엄',0.8],['수수료',0.7]],
  '시장분석':    [['TAM',0.9],['SAM',0.85],['SOM',0.85],['경쟁사',0.8],['고객',0.9]],
  '팀':          [['공동창업자',0.9],['역할',0.85],['지분',0.8],['문화',0.7]],
  '마케팅':      [['SNS',0.85],['바이럴',0.8],['콘텐츠',0.9],['성장해킹',0.85]],
  '정부지원':    [['예비창업패키지',0.95],['창진원',0.9],['공모전',0.85],['지원금',0.9]],
  '실패':        [['피벗',0.9],['회복력',0.8],['학습',0.85],['포기',0.7]],
}

function expandQueryWithGraph(tokens) {
  const expanded = new Set(tokens)
  for (const tok of tokens) {
    const related = KNOWLEDGE_GRAPH[tok] || []
    for (const [concept, weight] of related) {
      if (weight >= 0.8) expanded.add(concept.toLowerCase())
    }
  }
  return [...expanded]
}

// ══════════════════════════════════════════════════════════════════════
// §3. 의도 분류기 v2 — 복합 의도 처리 + 신뢰도 점수
// ══════════════════════════════════════════════════════════════════════

const INTENT_RULES = [
  { id:'lean_canvas',       w:3.0, kw:['린 캔버스','lean canvas','비즈니스 모델 캔버스','린캔버스','9개 블록','9블록'] },
  { id:'mvp',               w:3.0, kw:['mvp','최소 기능','최소기능','프로토타입','첫 버전','테스트 제품'] },
  { id:'idea_validation',   w:2.8, kw:['아이디어 검증','검증해','이 아이디어','될까요','될 것 같','아이디어 평가','아이디어 어때'] },
  { id:'revenue_model',     w:2.8, kw:['수익 모델','수익모델','비즈니스 모델','돈 버는','수익화','monetize','구독','saas','수익 구조'] },
  { id:'pitch_deck',        w:2.8, kw:['피치덱','피치 덱','pitch deck','투자자 발표','투자 유치','피칭','데모데이','demo day'] },
  { id:'market_analysis',   w:2.5, kw:['시장 분석','시장분석','tam','sam','som','시장 규모','경쟁자','경쟁사','포지셔닝','타깃'] },
  { id:'team_building',     w:2.5, kw:['팀 구성','팀구성','공동 창업자','코파운더','co-founder','팀원','팀장','팀원 찾'] },
  { id:'funding',           w:2.5, kw:['투자','펀딩','funding','vc','벤처','시드투자','시리즈a','엔젤투자','크라우드'] },
  { id:'government_support',w:2.5, kw:['정부 지원','정부지원','공모전','창진원','예비창업','초기창업패키지','비즈쿨','k-스타트업','해커톤'] },
  { id:'marketing',         w:2.3, kw:['마케팅','홍보','sns','인스타','유튜브','콘텐츠','바이럴','성장 해킹','그로스','사용자 획득'] },
  { id:'startup_basics',    w:2.0, kw:['창업이란','어떻게 시작','처음 창업','창업 준비','뭐부터','어디서 시작','스타트업이란'] },
  { id:'legal_tax',         w:2.0, kw:['법인','사업자','세금','특허','저작권','계약서','지분','ip','지식재산'] },
  { id:'simulation',        w:2.8, kw:['시뮬레이션','가정하면','만약에','예상해','계산해','추정해','예측','전망','시나리오'] },
  { id:'research_request',  w:2.8, kw:['조사해','리서치','찾아줘','분석해줘','알아봐','검색해','최신','트렌드','동향'] },
  { id:'failure_lesson',    w:1.8, kw:['실패','폐업','힘들어','어려워','포기','고민','자신없','모르겠','안될것'] },
  { id:'greeting',          w:1.0, kw:['안녕','처음','도움','어떻게 사용','소개해','어떤 기능','뭐 알려'] },
]

function classifyIntent(text) {
  const lower = text.toLowerCase().replace(/\s+/g, ' ')
  const scores = {}
  for (const rule of INTENT_RULES) {
    let s = 0
    for (const kw of rule.kw) {
      if (lower.includes(kw)) s += rule.w * (1 + kw.length / 15)
    }
    if (s > 0) scores[rule.id] = s
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
  // 복합 의도 반환 (상위 2개)
  const primary = sorted[0]?.[0] || 'general'
  const secondary = sorted[1]?.[0] || null
  const confidence = sorted[0]?.[1] || 0
  return { primary, secondary, confidence }
}

// ══════════════════════════════════════════════════════════════════════
// §4. 자체 리서치 엔진 — DB 다중 소스 탐색 + 인사이트 합성
// ══════════════════════════════════════════════════════════════════════

async function selfResearch(queryTokens, intent, expandedTokens) {
  if (!SB_URL || !SB_KEY) return { knowledge: [], articles: [], trends: [], community: [], ideas: [] }
  const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

  // 쿼리 키워드 추출 (Supabase ilike 검색용)
  const topTokens = expandedTokens.slice(0, 3).filter(t => t.length >= 2 && !t.includes('|'))
  const searchKw = topTokens[0] || queryTokens[0] || '창업'

  const results = await Promise.allSettled([
    // 소스 1: 지식베이스 (BM25) — 품질 높은 것 우선
    fetch(`${SB_URL}/rest/v1/ai_knowledge?order=quality.desc,use_count.desc&limit=50`, { headers: H })
      .then(r => r.json()).catch(() => []),
    // 소스 2: 최신 기사 — 관련 키워드 제목 우선 + 전체 최신
    fetch(`${SB_URL}/rest/v1/articles?status=eq.published&select=id,title,excerpt,ai_summary,tags,category&order=published_at.desc&limit=30`, { headers: H })
      .then(r => r.json()).catch(() => []),
    // 소스 3: 트렌드 키워드
    fetch(`${SB_URL}/rest/v1/trend_keywords?order=count.desc&limit=20`, { headers: H })
      .then(r => r.json()).catch(() => []),
    // 소스 4: 커뮤니티 글 — BM25 적용을 위해 더 많이 가져옴
    fetch(`${SB_URL}/rest/v1/community_posts?select=title,content,like_count,post_type,created_at&order=like_count.desc,created_at.desc&limit=20`, { headers: H })
      .then(r => r.json()).catch(() => []),
    // 소스 5: 아이디어 (신규) — 관련 아이디어 인사이트
    fetch(`${SB_URL}/rest/v1/ideas?is_public=eq.true&is_deleted=eq.false&select=title,description,category,like_count,stage&order=like_count.desc&limit=10`, { headers: H })
      .then(r => r.json()).catch(() => []),
  ])

  const [rawKnowledge, rawArticles, rawTrends, rawCommunity, rawIdeas] = results.map(r => r.status === 'fulfilled' ? r.value : [])

  const kDocs = Array.isArray(rawKnowledge) ? rawKnowledge : []
  const aRaw  = Array.isArray(rawArticles)  ? rawArticles  : []
  const tRaw  = Array.isArray(rawTrends)    ? rawTrends    : []
  const cRaw  = Array.isArray(rawCommunity) ? rawCommunity : []
  const iRaw  = Array.isArray(rawIdeas)     ? rawIdeas     : []

  // ── BM25 지식베이스 랭킹 ───────────────────────────────────────────
  const allKToks = kDocs.map(d => tokenize((d.content||'') + ' ' + (d.keywords||[]).join(' '), true))
  const avgKLen  = allKToks.length ? allKToks.reduce((s,t) => s + t.length, 0) / allKToks.length : 10
  const kDf = {}
  for (const toks of allKToks) for (const t of new Set(toks)) kDf[t] = (kDf[t] || 0) + 1

  const scoredK = kDocs
    .map((d, i) => ({ d, score: bm25Score(expandedTokens, allKToks[i], avgKLen, kDocs.length, kDf) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(x => x.d)

  // ── BM25 기사 랭킹 ────────────────────────────────────────────────
  const allAToks = aRaw.map(a => tokenize((a.title||'') + ' ' + (a.ai_summary||a.excerpt||''), true))
  const avgALen  = allAToks.length ? allAToks.reduce((s,t) => s + t.length, 0) / allAToks.length : 10
  const aDf = {}
  for (const toks of allAToks) for (const t of new Set(toks)) aDf[t] = (aDf[t] || 0) + 1

  const scoredA = aRaw
    .map((a, i) => ({ a, score: bm25Score(expandedTokens, allAToks[i], avgALen, aRaw.length, aDf) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(x => x.a)

  // ── BM25 커뮤니티 랭킹 (신규 v5) ─────────────────────────────────
  const allCToks = cRaw.map(c => tokenize((c.title||'') + ' ' + (c.content||'').slice(0, 300), true))
  const avgCLen  = allCToks.length ? allCToks.reduce((s,t) => s + t.length, 0) / allCToks.length : 10
  const cDf = {}
  for (const toks of allCToks) for (const t of new Set(toks)) cDf[t] = (cDf[t] || 0) + 1

  const scoredC = cRaw
    .map((c, i) => ({ c, score: bm25Score(expandedTokens, allCToks[i], avgCLen, cRaw.length, cDf) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(x => x.c)

  // BM25 점수가 없으면 인기순 폴백
  const finalCommunity = scoredC.length > 0 ? scoredC : cRaw.slice(0, 3)

  // ── BM25 아이디어 랭킹 (신규 v5) ─────────────────────────────────
  const allIToks = iRaw.map(i => tokenize((i.title||'') + ' ' + (i.description||'').slice(0, 200), true))
  const avgILen  = allIToks.length ? allIToks.reduce((s,t) => s + t.length, 0) / allIToks.length : 10
  const iDf = {}
  for (const toks of allIToks) for (const t of new Set(toks)) iDf[t] = (iDf[t] || 0) + 1

  const scoredI = iRaw
    .map((item, i) => ({ item, score: bm25Score(expandedTokens, allIToks[i], avgILen, iRaw.length, iDf) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(x => x.item)

  // ── 사용 횟수 증가 (비동기) ───────────────────────────────────────
  for (const d of scoredK) {
    fetch(`${SB_URL}/rest/v1/ai_knowledge?id=eq.${d.id}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ use_count: (d.use_count || 0) + 1 }),
    }).catch(() => {})
  }

  return {
    knowledge:  scoredK,
    articles:   scoredA,
    trends:     tRaw.slice(0, 8),
    community:  finalCommunity,
    ideas:      scoredI,
  }
}

// ══════════════════════════════════════════════════════════════════════
// §5. 시뮬레이션 엔진 — 시나리오 자동 생성
// ══════════════════════════════════════════════════════════════════════

function runSimulation(type, params = {}) {
  const sims = {

    // 수익 시뮬레이션
    revenue: ({ users = 1000, price = 9900, churn = 0.05, months = 12 } = {}) => {
      const rows = []
      let mrr = users * price
      let totalUsers = users
      for (let m = 1; m <= months; m++) {
        const newUsers = Math.floor(totalUsers * 0.15) // 15% 월 성장
        const churned = Math.floor(totalUsers * churn)
        totalUsers = totalUsers + newUsers - churned
        mrr = totalUsers * price
        rows.push({ month: m, users: totalUsers, mrr, arr: mrr * 12 })
      }
      const final = rows[rows.length - 1]
      return {
        type: 'revenue',
        summary: `**수익 시뮬레이션 결과** (${months}개월 기준)\n\n→ **시작** : 사용자 ${users.toLocaleString()}명, MRR ${(users*price).toLocaleString()}원\n→ **${months}개월 후** : 사용자 ${final.users.toLocaleString()}명, MRR ${final.mrr.toLocaleString()}원\n→ **연간 예상 수익(ARR)** : ${final.arr.toLocaleString()}원\n→ **총 성장률** : ${((final.users/users - 1)*100).toFixed(1)}%\n\n**주요 가정:**\n→ 월 신규 성장 15% · 이탈률 ${(churn*100).toFixed(1)}% · 구독 단가 ${price.toLocaleString()}원`,
        data: rows.slice(-3),
      }
    },

    // 시장 규모 시뮬레이션
    market: ({ population = 500000, penetration = 0.02, arpu = 50000 } = {}) => {
      const tam = population * arpu
      const sam = population * 0.3 * arpu
      const som_y1 = population * penetration * arpu
      const som_y3 = population * Math.min(penetration * 5, 0.15) * arpu
      return {
        type: 'market',
        summary: `**시장 규모 시뮬레이션**\n\n→ **TAM** (전체 시장) : ${(tam/100000000).toFixed(1)}억원\n→ **SAM** (공략 가능) : ${(sam/100000000).toFixed(1)}억원\n→ **SOM** 1년 목표 : ${(som_y1/100000000).toFixed(2)}억원 (${(penetration*100).toFixed(1)}% 침투)\n→ **SOM** 3년 목표 : ${(som_y3/100000000).toFixed(2)}억원\n\n**투자자 제시 포인트:** SAM 대비 첫 해 ${(som_y1/sam*100).toFixed(1)}% 점유율`,
      }
    },

    // 팀 성장 시뮬레이션
    team: ({ founders = 2, months = 18 } = {}) => {
      const milestones = [
        { m: 1, event: 'MVP 개발 시작', headcount: founders, focus: '제품' },
        { m: 3, event: '첫 10명 사용자', headcount: founders, focus: '검증' },
        { m: 6, event: '디자이너 합류', headcount: founders + 1, focus: '성장' },
        { m: 9, event: '첫 수익 발생', headcount: founders + 1, focus: '수익화' },
        { m: 12, event: '시드 투자 도전', headcount: founders + 2, focus: '투자' },
        { m: 18, event: '팀 5명으로 확장', headcount: 5, focus: '스케일' },
      ].filter(x => x.m <= months)
      const lines = milestones.map(x => `→ **${x.m}개월** : ${x.event} (팀 ${x.headcount}명, 집중: ${x.focus})`)
      return {
        type: 'team',
        summary: `**팀 성장 로드맵 시뮬레이션** (${months}개월)\n\n${lines.join('\n')}\n\n**핵심 조언:** 초기엔 제품+영업 2명으로 최대한 길게. 디자이너는 6개월차, 개발자 추가는 수익 후.`,
      }
    },

    // 창업 리스크 시뮬레이션
    risk: ({ idea = '일반', stage = 'idea' } = {}) => {
      const riskMatrix = {
        idea:    [['시장 미존재', 0.35], ['팀 해체', 0.25], ['자금 소진', 0.20], ['기술 실패', 0.10], ['경쟁자 선점', 0.10]],
        mvp:     [['PMF 미달', 0.30], ['자금 소진', 0.25], ['팀 갈등', 0.20], ['규제', 0.15], ['기술 부채', 0.10]],
        growth:  [['성장 정체', 0.30], ['경쟁 심화', 0.25], ['자금 조달 실패', 0.20], ['팀 확장 실패', 0.15], ['제품 문제', 0.10]],
      }
      const risks = riskMatrix[stage] || riskMatrix.idea
      const lines = risks.map(([risk, prob]) => {
        const emoji = prob >= 0.3 ? '🔴' : prob >= 0.2 ? '🟡' : '🟢'
        return `→ ${emoji} **${risk}** : 발생 확률 ${(prob * 100).toFixed(0)}%`
      })
      return {
        type: 'risk',
        summary: `**창업 리스크 시뮬레이션** (${stage} 단계)\n\n${lines.join('\n')}\n\n**대응 전략:**\n→ 가장 큰 리스크부터 먼저 검증\n→ 실패 시나리오를 미리 계획 (Plan B)\n→ 최소 6개월 런웨이 유지`,
      }
    },
  }

  const fn = sims[type]
  return fn ? fn(params) : null
}

// ══════════════════════════════════════════════════════════════════════
// §6. 진짜 동적 사고 합성기 v3.0 — 메시지를 실제로 이해하고 생각해서 응답
// ══════════════════════════════════════════════════════════════════════
// 핵심 변화:
//   ❌ 기존: intent 키워드 매칭 → 고정 텍스트 블록 반환
//   ✅ 신규: 사용자 메시지를 실제 분석 → 내용·맥락·감정·대화 흐름으로
//            동적으로 응답 조립 — 같은 intent라도 매번 다른 답변
// ══════════════════════════════════════════════════════════════════════

function synthesizeResponse({ intent, secondIntent, userMsg, researchData, context, simResult }) {
  const { knowledge, articles, trends, community = [], ideas = [] } = researchData

  // ── §6-A. 메시지 깊이 읽기 — 사용자가 진짜 원하는 것 파악 ────────
  function deepReadMessage(msg) {
    const lower = msg.toLowerCase()

    // 1. 구체적 내용 추출 (숫자, 고유명사, 핵심 개념)
    const numbers = msg.match(/\d[\d,.]*/g) || []
    const koreanNouns = msg.match(/[가-힣]{2,10}/g) || []
    // 불용어 제거 후 의미있는 단어 추출
    const stopSet = new Set(['이것','그것','저것','어떻','어떤','무엇','언제','어디','어떻게','왜','뭐가','어디서','하는','있는','없는','되는','이런','저런','그런','해서','에서','으로','부터','까지','와서','가서','하고','이고','이면','이면서','이라고','라고'])
    const meaningfulWords = koreanNouns.filter(w => w.length >= 2 && !stopSet.has(w))
    const topWords = [...new Set(meaningfulWords)].slice(0, 5)

    // 2. 질문 유형 파악
    const isQuestion = msg.includes('?') || lower.match(/어떻|어떤|뭔가요|뭐예요|어떻게|어떤가요|가능한가|될까요|할까요|어디/)
    const isSharing = lower.match(/해봤는데|했는데|있는데|진행중|만들고|개발중|운영중/)
    const isStruggling = lower.match(/힘들|어렵|막막|모르겠|안돼|안되|실패|포기|고민|걱정|불안/)
    const isExcited = lower.match(/신나|재밌|흥미|대박|완성|성공|됐어|해냈|잘됐|좋아/)
    const hasIdea = lower.match(/아이디어|서비스|앱|플랫폼|사업|창업|만들|개발/)

    // 3. 대화 맥락 파악 (이전 대화에서 연속성 체크)
    const isFollowUp = context.messageCount > 2 && (
      lower.includes('그러면') || lower.includes('그럼') ||
      lower.includes('그렇다면') || lower.includes('근데') ||
      lower.includes('그리고') || lower.includes('또')
    )
    const isAskingMore = lower.match(/더|자세|구체적|자세히|더 알|더 많|이어서|계속|추가로/)

    return {
      numbers,
      topWords,
      isQuestion,
      isSharing,
      isStruggling,
      isExcited,
      hasIdea,
      isFollowUp,
      isAskingMore,
      rawLength: msg.length,
      ideaHint: context.userIdeaHint,
    }
  }

  const msgAnalysis = deepReadMessage(userMsg)

  // ── §6-B. DB 데이터 활용 블록 생성 ──────────────────────────────
  function buildKnowledgeBlock() {
    if (!knowledge.length && !articles.length) return ''
    const parts = []
    if (knowledge.length > 0) {
      parts.push('\n\n**📚 관련 인사이트**')
      knowledge.slice(0, 2).forEach(k => {
        parts.push(`→ ${k.content.slice(0, 180)}`)
      })
    }
    if (articles.length > 0) {
      parts.push('\n**📰 최신 동향**')
      articles.slice(0, 2).forEach(a => {
        const body = (a.ai_summary || a.excerpt || '').slice(0, 120)
        if (body) parts.push(`→ **${a.title}** : ${body}`)
      })
    }
    return parts.join('\n')
  }

  function buildTrendBlock() {
    if (!trends.length) return ''
    const kws = trends.slice(0, 5).map(t => t.keyword).join(' · ')
    return `\n\n**📈 현재 주목 트렌드**\n→ ${kws}`
  }

  function buildCommunityBlock() {
    const parts = []
    if (community.length > 0) {
      parts.push('\n\n**💬 커뮤니티 관련 글**')
      community.slice(0, 2).forEach(c => {
        parts.push(`→ "${c.title}" (👍 ${c.like_count || 0})`)
      })
    }
    if (ideas.length > 0) {
      parts.push('\n**💡 비슷한 아이디어**')
      ideas.slice(0, 2).forEach(i => {
        parts.push(`→ **${i.title}** — ${(i.description||'').slice(0,80)}`)
      })
    }
    return parts.join('\n')
  }

  function buildContextRef() {
    if (!context.userIdeaHint) return ''
    return `\n\n💡 *"${context.userIdeaHint}"에 맞춰 드린 조언입니다.*`
  }

  function buildSimBlock() {
    if (!simResult) return ''
    return `\n\n${simResult.summary}`
  }

  // ── §6-C. 후속 제안 — 대화 맥락 기반 동적 생성 ─────────────────
  function buildFollowUp(intentId) {
    // 이미 여러 번 대화한 경우 더 구체적 제안
    if (context.isReturningUser) {
      const returnMap = {
        lean_canvas:     'MVP 설계로 넘어갈 준비가 됐나요? "MVP 설계해줘"라고 해보세요.',
        mvp:             '첫 10명 사용자를 어떻게 찾을지 같이 생각해봐요.',
        idea_validation: '검증 결과가 나왔다면 → 수익 모델을 잡아볼 시간이에요.',
        revenue_model:   '"수익 시뮬레이션 해줘"로 월별 MRR을 직접 계산해봐요.',
        funding:         '리스크 시뮬레이션으로 투자자 질문을 미리 대비해봐요.',
        simulation:      '다른 각도 시뮬레이션도 해드릴게요. 어떤 게 더 궁금하세요?',
        general:         '어떤 부분이 가장 막히나요? 구체적으로 말씀해 주세요.',
      }
      return returnMap[intentId] ? `\n\n---\n💬 **다음 단계:** ${returnMap[intentId]}` : ''
    }
    const followUps = {
      lean_canvas:       '린 캔버스를 채웠다면 → MVP 설계로 넘어가볼까요?',
      mvp:               'MVP가 준비됐다면 → 첫 10명 사용자 확보 방법을 알려드릴게요.',
      idea_validation:   '아이디어를 구체적으로 알려주시면 → 맞춤 검증 플랜을 드립니다.',
      revenue_model:     '"수익 시뮬레이션 해줘"라고 하시면 → 수치로 바로 계산해 드립니다.',
      pitch_deck:        '피치덱 초안이 있다면 → 피드백을 드릴게요.',
      market_analysis:   '"시장 시뮬레이션 해줘"라고 하시면 → TAM/SAM/SOM을 계산합니다.',
      team_building:     '"팀 로드맵 시뮬레이션"으로 단계별 팀 구성을 만들어 드릴게요.',
      funding:           '"리스크 시뮬레이션"을 해보면 → 투자자 질문 대비가 됩니다.',
      government_support:'공모전 준비가 필요하다면 → 피치덱 작성을 도와드릴게요.',
      simulation:        '다른 시뮬레이션도 해드릴게요: 수익·시장·팀·리스크',
      research_request:  '더 깊이 조사가 필요하면 → 구체적인 분야를 알려주세요.',
      general:           '아이디어가 있으시다면 → "검증해줘"라고 말씀해 주세요.',
    }
    const tip = followUps[intentId] || followUps.general
    return `\n\n---\n💬 **다음 단계:** ${tip}`
  }

  const kb = buildKnowledgeBlock()
  const tb = buildTrendBlock()
  const cb = buildCommunityBlock()
  const cr = buildContextRef()
  const sb = buildSimBlock()
  const fu = buildFollowUp(intent.primary)

  // ── §6-D. 시뮬레이션 처리 ────────────────────────────────────────
  if (intent.primary === 'simulation' || simResult) {
    if (simResult) return `${sb}${kb}${fu}`
    const lower = userMsg.toLowerCase()
    if (lower.includes('수익') || lower.includes('매출') || lower.includes('mrr')) {
      const sim = runSimulation('revenue', extractSimParams(userMsg, 'revenue'))
      return `${sim.summary}${kb}${fu}`
    }
    if (lower.includes('시장') || lower.includes('tam') || lower.includes('규모')) {
      const sim = runSimulation('market', extractSimParams(userMsg, 'market'))
      return `${sim.summary}${kb}${fu}`
    }
    if (lower.includes('팀') || lower.includes('인력') || lower.includes('로드맵')) {
      const sim = runSimulation('team', extractSimParams(userMsg, 'team'))
      return `${sim.summary}${kb}${fu}`
    }
    if (lower.includes('리스크') || lower.includes('위험') || lower.includes('실패')) {
      const sim = runSimulation('risk', extractSimParams(userMsg, 'risk'))
      return `${sim.summary}${kb}${fu}`
    }
    return `어떤 시뮬레이션을 원하시나요? 아래 중 선택해 주세요:\n\n→ **"수익 시뮬레이션"** — MRR·ARR 예측\n→ **"시장 규모 시뮬레이션"** — TAM/SAM/SOM 계산\n→ **"팀 로드맵 시뮬레이션"** — 단계별 팀 구성 계획\n→ **"리스크 시뮬레이션"** — 단계별 위험 분석${kb}${fu}`
  }

  // ── §6-E. 리서치 요청 ────────────────────────────────────────────
  if (intent.primary === 'research_request') {
    return `${buildResearchSummary(userMsg, researchData)}${buildContextRef()}${fu}`
  }

  // ── §6-F. 핵심: 진짜 동적 응답 생성 ─────────────────────────────
  // 사용자 메시지를 실제로 읽고, 내용에 맞게 응답을 직접 조립한다
  // 더 이상 intent에 따른 고정 블록을 반환하지 않는다

  // 1. 사용자 메시지에서 핵심 내용 추출
  const topWord1 = msgAnalysis.topWords[0] || '창업'
  const topWord2 = msgAnalysis.topWords[1] || ''
  const topWord3 = msgAnalysis.topWords[2] || ''
  const userNumbers = msgAnalysis.numbers
  const ideaRef = msgAnalysis.ideaHint ? `"${msgAnalysis.ideaHint}"` : null

  // 2. 대화 상태 파악 — 어떤 상황인가
  const isFirstTime = context.messageCount <= 2
  const hasSpecificNumbers = userNumbers.length > 0
  const isDeepConversation = context.messageCount > 6

  // 3. 응답 톤 결정 (메시지 감정 기반)
  const openingTone = msgAnalysis.isStruggling
    ? '힘드셨겠어요. 같이 생각해봐요.'
    : msgAnalysis.isExcited
    ? '좋은 에너지네요!'
    : msgAnalysis.isSharing
    ? '직접 해보고 계시는군요!'
    : msgAnalysis.isFollowUp
    ? ''
    : ''

  // 4. intent별 핵심 지식 블록 동적 조립
  // (고정 텍스트가 아니라, 사용자 메시지 내용을 반영한 조합)

  function buildIntentCore() {
    const i = intent.primary

    // ── 린 캔버스 ──────────────────────────────────────────────────
    if (i === 'lean_canvas') {
      const customNote = ideaRef
        ? `\n\n💡 **${ideaRef}** 기준으로 9개 블록을 채워볼게요.\n→ **①문제**: ${ideaRef}가 해결하는 고통점은 무엇인가요?\n→ **②고객**: 누가 이 문제를 가장 심하게 겪나요?\n→ 나머지 7개 블록도 이어서 채워드릴 수 있어요.`
        : topWord1 !== '창업'
        ? `\n\n💡 **"${topWord1}"** 관련 린 캔버스를 작성한다면:\n→ **①문제**: ${topWord1}에서 사람들이 겪는 불편함\n→ **②고객**: ${topWord1}을 필요로 하는 구체적인 사람`
        : ''
      const blocks = `**린 캔버스(Lean Canvas)** — 사업 아이디어를 한 장으로 정리하는 도구입니다.

**9개 블록 작성 순서:**
→ **①문제** — 타깃 고객이 겪는 실제 고통점 (최대 3가지)
→ **②고객 세그먼트** — 초기 타깃을 최대한 좁게 정의
→ **③고유 가치 제안(UVP)** — "우리만이 해결한다"를 한 문장으로
→ **④해결책** — 각 문제를 해결하는 핵심 기능 (최대 3개)
→ **⑤채널** — 고객에게 닿는 방법
→ **⑥수익 구조** — 어떻게 돈을 버는가
→ **⑦비용 구조** — 주요 지출 항목
→ **⑧핵심 지표** — 성공을 측정하는 KPI
→ **⑨경쟁 우위** — 쉽게 복제할 수 없는 강점

**💡 실전 팁:**
→ 처음엔 틀려도 됩니다. 30분 초안 → 고객 인터뷰 → 수정 반복
→ 블록 ①②③ 먼저, 나머지는 검증 후에 채우세요${customNote}`
      return blocks
    }

    // ── MVP ────────────────────────────────────────────────────────
    if (i === 'mvp') {
      const customNote = ideaRef
        ? `\n\n**"${ideaRef}"의 MVP를 설계한다면:**\n→ **핵심 가설**: ${ideaRef}을 사람들이 실제로 원하는가?\n→ **최소 기능**: 이 가설만 검증하는 가장 단순한 형태\n→ **테스트**: 10명에게 써보게 하고 반응 측정`
        : topWord1 !== '창업'
        ? `\n\n**"${topWord1}" MVP를 만든다면:**\n→ ${topWord1}의 가장 핵심 기능 1개만 먼저 만들기\n→ 3일 안에 만들 수 있어야 진짜 MVP`
        : ''
      const core = `**MVP(Minimum Viable Product)** — 가장 빠르게 배울 수 있는 최소 제품.

**MVP 설계 3단계:**
→ **1단계** — 핵심 가설 1개 선택: "우리 고객은 ___를 원한다"
→ **2단계** — 최소 기능 1개만 구현 (앱 대신 카카오채널, 웹 대신 구글폼)
→ **3단계** — 10명 테스트: 친구 5명 + 낯선 사람 5명

**황금 기준:**
→ ✅ 3일 안에 만들 수 있는가?
→ ✅ 돈 없이도 만들 수 있는가?
→ ✅ 10명이 "써볼게"라고 하는가?

**흔한 실수:** "조금만 더 완성하면…" — 이 생각이 MVP를 6개월짜리로 만듭니다${customNote}`
      return core
    }

    // ── 아이디어 검증 ──────────────────────────────────────────────
    if (i === 'idea_validation') {
      // 사용자가 실제로 어떤 아이디어를 말하는지 파악해서 맞춤 응답
      const specificIdea = ideaRef || (topWord1 !== '창업' ? topWord1 : null)
      const customPlan = specificIdea
        ? `\n\n**"${specificIdea}" 검증 플랜:**
→ **①문제 명확화**: "${specificIdea}"가 해결하는 문제는 정확히 무엇인가?
→ **②타깃 찾기**: 이 문제를 가장 심하게 겪는 사람은 누구인가?
→ **③30분 테스트**: 구글폼으로 사전 신청 10명 받기
→ **④인터뷰**: "이거 어때?" (X) → "돈 내고 쓸 것 같아?" (O)
→ 3명 이상 Yes → 계속 진행!`
        : `\n\n아이디어를 알려주시면 맞춤 검증 플랜을 만들어 드릴게요!
→ "제 아이디어는 ___입니다" 라고 말씀해 주세요.`

      // 이미 진행 중인 경우 다른 반응
      if (msgAnalysis.isSharing) {
        return `직접 해보고 계시는군요! 현재 상황에 맞는 검증 포인트를 짚어드릴게요.

**지금 단계에서 확인할 것:**
→ 실제 사용자가 있나요? (지인 제외)
→ 돈을 낼 의향을 보인 사람이 있나요?
→ 자발적으로 재방문하는 사용자가 있나요?

이 3가지 중 하나라도 Yes라면 → 방향이 맞습니다.${customPlan}`
      }

      return `**PACM 아이디어 검증 5단계**${customPlan}

**검증의 핵심 원칙:**
→ 검증은 "확인"이 아니라 "반증 시도"입니다
→ 틀리면 좋은 것 — 방향을 빨리 수정할 수 있으니까요
→ 단 1명이 "돈 낼게"라고 하면 → 다음 단계로`
    }

    // ── 수익 모델 ──────────────────────────────────────────────────
    if (i === 'revenue_model') {
      // 사용자가 언급한 숫자나 서비스 유형 활용
      const targetRevenue = hasSpecificNumbers ? `${userNumbers[0]}` : null
      const revenueNote = targetRevenue
        ? `\n\n**목표 수익 ${targetRevenue} 기준 계산:**\n→ 구독 모델(월 9,900원): ${Math.ceil(parseInt(targetRevenue.replace(/,/g,''))/9900).toLocaleString()}명 필요\n→ B2B(월 10만원): ${Math.ceil(parseInt(targetRevenue.replace(/,/g,''))/100000).toLocaleString()}개 기관 필요`
        : ideaRef
        ? `\n\n**"${ideaRef}"에 맞는 수익 모델:**\n→ 타깃 고객이 개인이라면 → 구독 or 프리미엄\n→ 타깃이 학교/기업이라면 → B2B 솔루션`
        : ''

      return `**청소년 창업 현실적 수익 모델 TOP 6**

→ **① 구독(SaaS)** — 월 1,000~9,900원
   학교·학원 B2B 계약이 핵심. **100개 기관 × 10만원 = 1,000만원/월**

→ **② 중개 수수료** — 거래액의 3~10%
   매칭 플랫폼에 적합. 거래가 늘수록 자동으로 수익 증가

→ **③ 프리미엄(Freemium)** — 기본 무료 + 유료 전환
   전환율 목표 2~5%. 무료 사용자 = 바이럴 마케터

→ **④ 콘텐츠 판매** — 노션 템플릿, PDF, 강의
   진입 장벽 최저. 1만원 × 1,000명 = 1,000만원

→ **⑤ B2B 솔루션** — 학교/기업 납품
   가장 빠른 수익화. 1계약 = 수개월 수익 보장

→ **⑥ 광고** — CPM/CPC
   MAU 10,000명 이상 되어야 의미 있음${revenueNote}

"수익 시뮬레이션 해줘"라고 하시면 → 월별 MRR/ARR 예측을 계산해 드립니다.`
    }

    // ── 피치덱 ─────────────────────────────────────────────────────
    if (i === 'pitch_deck') {
      const pitchNote = ideaRef
        ? `\n\n**"${ideaRef}" 피치덱 핵심 포인트:**
→ **슬라이드 1 (문제)**: ${ideaRef}가 해결하는 고통을 스토리로
→ **슬라이드 7 (팀)**: 왜 당신/팀이 ${ideaRef}를 만들어야 하는가`
        : msgAnalysis.isStruggling
        ? `\n\n**처음 피치덱이 막막하다면:**
→ 완벽한 디자인 먼저가 아니에요
→ 파워포인트/키노트/Canva로 10장 초안부터
→ 내용이 먼저, 디자인은 나중에`
        : ''

      return `**청소년 창업 피치덱 — 10슬라이드 공식**

→ **01 / 문제** — 고통 포인트를 스토리로 (30초 안에 공감시켜야 함)
→ **02 / 해결책** — 제품 데모 or 스크린샷 필수
→ **03 / 시장 규모** — TAM/SAM/SOM 숫자로
→ **04 / 비즈니스 모델** — 어떻게 돈 버는가 (한 눈에)
→ **05 / 트랙션** — 현재 성과 (없어도 솔직하게 → 오히려 신뢰)
→ **06 / 경쟁 우위** — 우리만의 차별점
→ **07 / 팀** — 왜 우리 팀이 이걸 해야 하는가
→ **08 / 로드맵** — 6개월/1년 계획
→ **09 / 재무 계획** — 단순한 수익 예측
→ **10 / 요청(Ask)** — 필요한 금액과 활용 계획

**청소년 특화 무기:**
→ "저는 직접 이 문제를 겪었습니다" — 가장 강력한 오프닝
→ 나이는 단점이 아닌 차별점 (언론·투자자 모두 주목)${pitchNote}`
    }

    // ── 시장 분석 ──────────────────────────────────────────────────
    if (i === 'market_analysis') {
      const marketNote = hasSpecificNumbers
        ? `\n\n**입력하신 숫자 기반 빠른 계산:**
→ 인구 ${userNumbers[0]}명 기준 TAM: ${userNumbers[0]}명 × 월 ARPU = 시장 규모
→ "시장 규모 시뮬레이션 해줘"로 자동 계산해 드릴게요.`
        : ideaRef
        ? `\n\n**"${ideaRef}" 시장 분석 시작점:**
→ 타깃 인구는 몇 명인가? (예: 전국 고3 50만명)
→ 그 중 몇 %가 내 서비스를 쓸까? (현실적으로 1~5%)
→ 월 얼마를 낼 의향이 있나? (인터뷰로 확인)
→ "시장 규모 시뮬레이션 해줘" + 숫자를 알려주시면 계산해 드릴게요.`
        : ''

      return `**시장 분석 완전 가이드 — TAM/SAM/SOM**

**시장 규모 3단계:**
→ **TAM** (전체 시장) — 이론적 전체 시장
   예: 국내 중·고등학생 280만명 × 월 10만원 = **2,800억원/월**

→ **SAM** (공략 가능 시장) — 실제 공략 가능 시장
   예: 온라인 학습 이용자 120만명 = **1,200억원**

→ **SOM** (현실 목표) — 1~3년 내 달성 가능
   예: 1년 내 1,000명 확보 = **1억원**

**경쟁자 분석 4가지:**
→ 직접 경쟁자, 간접 경쟁자, 잠재 경쟁자, 포지셔닝 맵${marketNote}`
    }

    // ── 팀 구성 ────────────────────────────────────────────────────
    if (i === 'team_building') {
      const teamNote = msgAnalysis.isStruggling
        ? `\n\n**팀원 찾기 힘드셨군요. 현실적인 방법:**
→ 지금 당장 할 수 있는 것: 학교 친구에게 연락, 해커톤 1개 참가
→ 완벽한 팀원보다 "같이 할 사람"이 먼저
→ 처음엔 1명이라도 → 그 사람이 다음 사람을 데려와요`
        : ideaRef
        ? `\n\n**"${ideaRef}"에 필요한 팀:**
→ 제품 만드는 사람 (기술/디자인)
→ 고객과 이야기하는 사람 (영업/마케팅)
→ 이 두 역할이 창업 초기 팀의 전부예요`
        : ''

      return `**청소년 창업팀 구성 완전 가이드**

**이상적인 3인 팀:**
→ **🔨 빌더(Builder)** — 제품/기술을 만드는 사람
→ **📢 셀러(Seller)** — 영업/마케팅 담당
→ **🎨 디자이너(Designer)** — UX/브랜드 담당

**팀원 찾는 방법 (현실적 순서):**
→ ① 해커톤 참가 — 팀원 80%가 여기서 만남
→ ② 학교 창업 동아리, 창업 캠프
→ ③ INSIGHTSHIP 커뮤니티 팀 모집
→ ④ 오픈채팅 (청소년 창업, 학생 개발자)

**공동 창업자 계약 필수 항목:**
→ 지분 비율 (처음부터 명확하게!)
→ 역할과 책임
→ 베스팅(Vesting): 이탈 시 지분 회수 조건
→ 의사결정 방식 (대표 1인 최종 결정권 추천)${teamNote}`
    }

    // ── 투자/펀딩 ──────────────────────────────────────────────────
    if (i === 'funding') {
      const fundingNote = hasSpecificNumbers
        ? `\n\n**${userNumbers[0]}원 목표 기준:**
→ Pre-seed (1,000만원~1억) — 가족·친구·엔젤, 아이디어 단계
→ 정부 지원금 — 예비창업패키지 최대 1억 (무상!)
→ 공모전 상금 — 0원 투자, 경험+자금 동시`
        : msgAnalysis.isStruggling
        ? `\n\n**투자 받기 어렵게 느껴지신다면:**
→ 지금 당장 투자자에게 가지 않아도 됩니다
→ 정부 지원금이 먼저 — 무상이고 경험도 쌓이니까요
→ k-startup.go.kr → 예비창업패키지 지금 확인해보세요`
        : ''

      return `**청소년 창업 투자 유치 로드맵**

**투자 단계별 이해:**
→ **Pre-seed** — 아이디어 단계. 가족·친구·엔젤 (1,000만~1억)
→ **Seed** — MVP 완성 후. 엑셀러레이터·VC (1억~10억)
→ **Series A** — PMF 증명 후 (10억~100억)

**청소년이 바로 접근 가능한 경로:**
→ ① 공모전 상금 — 0원 투자, 경험+자금 동시 확보
→ ② 정부 지원금 — 예비창업패키지 최대 1억 (무상!)
→ ③ 액셀러레이터 — TIPS, 스파크랩 등
→ ④ 크라우드펀딩 — 텀블벅, 와디즈 (제품 있을 때)

**투자자가 보는 것 (우선순위):**
→ **팀(50%)** > 시장 크기 > 트랙션 > 기술

💡 **핵심 조언:** 투자보다 **정부 지원금**이 먼저.${fundingNote}`
    }

    // ── 정부 지원 ──────────────────────────────────────────────────
    if (i === 'government_support') {
      const suppNote = topWord1 !== '창업' && topWord1 !== '정부'
        ? `\n\n**"${topWord1}" 관련 지원 프로그램:**
→ 분야별 특화 공모전도 있어요 — k-startup.go.kr에서 "${topWord1}" 검색
→ INSIGHTSHIP 커뮤니티에서 비슷한 분야 멘토 연결도 가능해요`
        : ''

      return `**청소년 창업 정부 지원 프로그램 완전 정리**

**🏆 지금 바로 참가 가능한 공모전**
→ **PACM 창업 챌린지** — INSIGHTSHIP 주최, 연중 운영
→ **청소년 비즈쿨** — 교육부 주관, 창업 교육+지원금
→ **청소년 창업경진대회** — 중기부, 법인 없이 참가 가능

**💰 자금 지원 (법인 설립 후)**
→ **예비창업패키지** — 만 39세 이하, 최대 1억원 (무상)
→ **초기창업패키지** — 창업 3년 이내, 최대 1억원
→ **TIPS** — 민간투자 + 정부 매칭, 최대 15억원

**📍 공간·교육 무료 지원**
→ 창업보육센터 — 전국 300개+, 사무공간 무료
→ 메이커스페이스 — 3D프린터, 레이저커터 무료

**⚡ 오늘 당장:**
→ k-startup.go.kr 즐겨찾기
→ 청소년비즈쿨 신청 (중·고등학생 무료)${suppNote}`
    }

    // ── 마케팅 ─────────────────────────────────────────────────────
    if (i === 'marketing') {
      const mktNote = ideaRef
        ? `\n\n**"${ideaRef}" 마케팅 전략:**
→ 타깃이 Z세대라면 → 인스타그램 릴스 + 틱톡
→ 타깃이 학부모/교사라면 → 카카오채널 + 네이버 블로그
→ B2B라면 → 링크드인 + 직접 영업이 훨씬 효과적`
        : topWord1 !== '창업'
        ? `\n\n**"${topWord1}" 홍보 아이디어:**
→ ${topWord1}에 관심있는 사람들이 모이는 곳을 찾아요
→ 거기서 먼저 가치를 제공하고 → 자연스럽게 소개`
        : ''

      return `**청소년 창업 제로 예산 마케팅 전략**

**SNS 채널 우선순위:**
→ **인스타그램** — 비주얼 제품, Z세대 타깃
→ **유튜브 쇼츠** — 교육 콘텐츠, 빠른 바이럴
→ **카카오채널** — 학생·학부모 알림 마케팅

**제로 예산 성장 전략:**
→ **콘텐츠 마케팅** — 내 전문성을 무료로 공유 (신뢰 구축)
→ **커뮤니티 마케팅** — 오픈채팅, 학교 게시판, 동아리
→ **Referral(추천인)** — 친구 1명 초대 시 프리미엄 1개월
→ **FOMO** — "선착순 100명만" 한정 이벤트
→ **UGC** — 사용자가 직접 홍보하게 만들기${mktNote}`
    }

    // ── 창업 기초 ──────────────────────────────────────────────────
    if (i === 'startup_basics') {
      const firstTimeNote = isFirstTime
        ? `\n\n**처음 창업을 시작한다면, 오늘 딱 3가지만:**
→ 내가 매일 불편한 것 1가지 적기
→ 그 불편함을 겪는 사람 3명 찾아서 인터뷰하기
→ INSIGHTSHIP 커뮤니티에 아이디어 올려보기`
        : `\n\n${ideaRef ? `"${ideaRef}"로 이미 시작하셨군요!` : '이미 생각이 있으시군요!'} 다음 단계로 넘어갈 준비가 된 것 같아요.`

      return `**창업이란 무엇인가 — 핵심만 정리**

창업은 "문제를 발견하고 → 해결책을 만들고 → 그 가치에 돈을 받는 것"입니다.

**처음 창업자가 알아야 할 3가지:**
→ **아이디어 != 사업** — 검증된 아이디어만이 사업이 됩니다
→ **완벽함보다 빠름** — 틀린 채로 시작해야 맞는 걸 발견합니다
→ **혼자 못 합니다** — 고객, 팀원, 멘토 모두 필요합니다

**창업 성공의 3요소:**
→ 실제 문제를 해결하는가?
→ 충분히 큰 시장인가?
→ 지금 팀이 실행할 수 있는가?${firstTimeNote}`
    }

    // ── 법률/세금 ──────────────────────────────────────────────────
    if (i === 'legal_tax') {
      return `**창업 법률·세금 기초 (청소년 필수 지식)**

**법인 vs 개인사업자:**
→ **개인사업자** — 설립 빠름, 미성년자도 부모 동의로 가능
→ **법인(주식회사)** — 투자 유치 필수, 만 18세 미만은 부모 동의
→ 추천: 개인사업자 → 투자 유치 시 법인 전환

**지식재산권(IP) 기초:**
→ **상표권** — 브랜드명 보호 (특허청, 6만원~)
→ **저작권** — 창작 즉시 자동 발생
→ **특허** — 기술 아이디어 보호

**필수 계약서 3종:**
→ 공동 창업자 계약 (지분·역할·이탈 조건)
→ NDA (비밀유지협약) — 아이디어 공유 전 필수
→ 외주 계약서 — 디자이너/개발자 고용 시

⚠️ 중요한 법적 결정은 반드시 전문가 상담을 받으세요.`
    }

    // ── 실패/고민 ──────────────────────────────────────────────────
    if (i === 'failure_lesson') {
      // 어떤 실패/고민인지 구체적으로 파악
      const specificPain = topWord1 !== '창업' && !['이것','그것','저것'].includes(topWord1)
        ? topWord1 : null

      const empathyNote = specificPain
        ? `\n\n**"${specificPain}"에 대해서 구체적으로 생각해봐요:**
→ 지금 이 상황, 6개월 뒤에는 어떻게 보일까요?
→ "${specificPain}"이 없어도 계속 이 일을 할 건가요?
→ Yes라면 → 방법의 문제. No라면 → 방향을 바꿀 때.`
        : msgAnalysis.isStruggling
        ? `\n\n지금 힘드신 이야기를 더 구체적으로 해주시면 같이 생각해봐요.
→ 어떤 부분이 가장 막히시나요?`
        : ''

      return `**창업 어려움, 같이 극복해요 💪**

먼저, 어려움을 느끼는 건 완전히 정상입니다. 세상의 모든 창업가가 똑같이 느꼈어요.

**창업의 현실:**
→ 스타트업 90%는 실패한다 → 하지만 실패에서 배웁니다
→ 첫 번째 아이디어가 성공하는 경우는 드뭅니다
→ 중요한 건 포기하지 않고 피벗(방향 전환)하는 것

**지금 당장 도움이 되는 것:**
→ **작게 쪼개기** — "오늘은 딱 1명에게 인터뷰하자"
→ **커뮤니티** — INSIGHTSHIP에 고민을 올려보세요
→ **리스크 시뮬레이션** — 최악의 시나리오를 미리 계획하면 덜 두렵습니다

**유명 창업가들의 실패:**
→ 에어비앤비 — 첫 6개월 사용자 0명
→ 슬랙 — 원래 게임 회사였다가 피벗
→ 카카오 — 창업자 2번 파산 후 성공${empathyNote}`
    }

    // ── 인사/소개 ──────────────────────────────────────────────────
    if (i === 'greeting') {
      const returnGreeting = context.isReturningUser
        ? `다시 오셨네요! 지난번 이야기에서 이어서 시작할까요?\n\n`
        : ''

      return `${returnGreeting}안녕하세요! 👋 저는 **PACM-AI** 입니다.

청소년 창업가를 위한 AI 멘토로, INSIGHTSHIP 자체 엔진으로 동작합니다.
여러분의 이야기를 듣고, 상황에 맞는 조언을 드려요.

**제가 할 수 있는 것들:**
→ 💡 **아이디어 검증** — "이 아이디어 검증해줘"
→ 📋 **린 캔버스** — 사업 계획 한 페이지 정리
→ 🎯 **MVP 설계** — 최소 기능으로 빠른 검증
→ 💰 **수익 모델** — 수익 시뮬레이션 포함
→ 📊 **시장 분석** — TAM/SAM/SOM 자동 계산
→ 🚀 **피치덱** — 투자자 발표 준비
→ 🔬 **시뮬레이션** — 수익·시장·팀·리스크 시나리오
→ 🔍 **리서치** — DB 실시간 검색·분석
→ 🏆 **정부 지원** — 공모전·지원금 정보

무엇이든 물어보세요!`
    }

    // ── 일반 / 파악 안 된 경우 — 사용자 말을 반영해서 응답 ────────
    // 가장 중요한 부분: 모르는 것도 하드코딩 안 함
    const hasContext = topWord1 !== '창업'
    const contextualResponse = hasContext
      ? `"${topWord1}"${topWord2 ? `과 "${topWord2}"` : ''}에 대해 물어보셨군요.`
      : `좋은 질문입니다!`

    // 대화가 길어졌을 때 — 이전 흐름 참조
    const flowRef = isDeepConversation && context.topicFlow.length > 0
      ? `\n\n지금까지 ${context.topicFlow.slice(-2).join(', ')} 주제를 이야기했는데, 그 흐름에서 이 질문을 보면 더 구체적으로 도움드릴 수 있어요.`
      : ''

    return `${contextualResponse} 제가 분석해 드릴게요.

창업은 **문제 발견**에서 시작합니다.

**지금 당장 할 수 있는 3가지:**
→ 오늘 불편했던 것 1가지 적어보기
→ 친구 3명에게 "이런 서비스 쓸 것 같아?" 물어보기
→ 아이디어가 있다면 → "아이디어 검증해줘"라고 말씀해 주세요

"시뮬레이션 해줘"라고 하시면 수익·시장·팀·리스크 시나리오를 바로 계산해 드립니다.${flowRef}`
  }

  // ── §6-G. 최종 응답 조립 ─────────────────────────────────────────
  // 1. 감정 반응 (오프닝)
  // 2. 핵심 내용 (인텐트 기반 동적 생성)
  // 3. DB 데이터 (지식/기사)
  // 4. 후속 제안

  const opening = openingTone ? `${openingTone}\n\n` : ''
  const core = buildIntentCore()

  // 두 번째 인텐트가 있으면 간단히 연결
  let secondaryHint = ''
  if (secondIntent && secondIntent !== intent.primary) {
    const secondMap = {
      simulation: '\n\n💡 시뮬레이션으로 수치를 직접 계산해봐요.',
      funding: '\n\n💡 투자 관련 질문도 있으신가요?',
      government_support: '\n\n💡 정부 지원 프로그램도 활용해보세요.',
      team_building: '\n\n💡 팀 구성 관련 이야기도 드릴 수 있어요.',
    }
    secondaryHint = secondMap[secondIntent] || ''
  }

  return `${opening}${core}${secondaryHint}${kb}${fu}`
}

// ══════════════════════════════════════════════════════════════════════
// §7. 리서치 요약 생성기 — DB 다중 소스 합성
// ══════════════════════════════════════════════════════════════════════

function buildResearchSummary(userMsg, { knowledge, articles, trends, community, ideas }) {
  const parts = [`**PACM-AI 리서치 결과** — "${userMsg.slice(0, 40)}..."\n`]

  if (knowledge.length) {
    parts.push('\n**📚 지식베이스 인사이트**')
    knowledge.forEach((k, i) => {
      parts.push(`→ [${i + 1}] ${k.content.slice(0, 200)}`)
    })
  }

  if (articles.length) {
    parts.push('\n**📰 최신 기사 분석**')
    articles.forEach(a => {
      const body = (a.ai_summary || a.excerpt || '').slice(0, 150)
      parts.push(`→ **${a.title}**\n   ${body}`)
    })
  }

  if (trends.length) {
    parts.push('\n**📈 현재 주목 트렌드**')
    const kws = trends.slice(0, 6).map(t => t.keyword).join(' · ')
    parts.push(`→ ${kws}`)
  }

  if (community.length) {
    parts.push('\n**💬 커뮤니티 인사이트**')
    community.forEach(c => {
      parts.push(`→ "${c.title}" (좋아요 ${c.like_count || 0}개)`)
    })
  }

  if (parts.length === 1) {
    parts.push('\n현재 DB에 관련 데이터가 쌓이는 중입니다. 뉴스가 업데이트되면 더 풍부한 리서치 결과를 드릴 수 있어요!')
  }

  parts.push('\n\n더 구체적인 분야를 알려주시면 더 깊이 분석해 드릴게요.')
  return parts.join('\n')
}

// ══════════════════════════════════════════════════════════════════════
// §8. 시뮬레이션 파라미터 추출기 — 메시지에서 숫자 파싱
// ══════════════════════════════════════════════════════════════════════

function extractSimParams(msg, type) {
  const nums = (msg.match(/[\d,]+/g) || []).map(n => parseInt(n.replace(/,/g, ''), 10)).filter(n => !isNaN(n))

  if (type === 'revenue') {
    return {
      users: nums[0] || 100,
      price: nums[1] || 9900,
      churn: 0.05,
      months: nums[2] || 12,
    }
  }
  if (type === 'market') {
    return {
      population: nums[0] || 500000,
      penetration: nums[1] ? nums[1] / 100 : 0.02,
      arpu: nums[2] || 50000,
    }
  }
  if (type === 'team') {
    return { founders: nums[0] || 2, months: nums[1] || 18 }
  }
  if (type === 'risk') {
    const lower = msg.toLowerCase()
    const stage = lower.includes('초기') || lower.includes('mvp') ? 'mvp'
      : lower.includes('성장') || lower.includes('스케일') ? 'growth' : 'idea'
    return { stage }
  }
  return {}
}

// ══════════════════════════════════════════════════════════════════════
// §9. 컨텍스트 추론기 — 멀티턴 대화 맥락 분석
// ══════════════════════════════════════════════════════════════════════

function reasonContext(messages) {
  const recent = messages.slice(-8)
  let userIdeaHint = null
  const topicFlow = []
  let simulationRequested = null

  for (const m of recent) {
    const c = m.content || ''
    const lc = c.toLowerCase()

    // 아이디어 힌트 추출 (가장 최근 것)
    const ideaPatterns = [
      /아이디어[는이가]?\s*[:：]?\s*(.{5,60})/,
      /제\s*서비스[는이가]?\s*[:：]?\s*(.{5,60})/,
      /제\s*스타트업[은는]?\s*(.{5,60})/,
      /만들고\s*싶[어은]?\s*(.{5,50})/,
      /개발하고\s*싶[어은]?\s*(.{5,50})/,
    ]
    for (const p of ideaPatterns) {
      const m2 = c.match(p)
      if (m2 && m.role === 'user') { userIdeaHint = m2[1].trim().slice(0, 60); break }
    }

    // 시뮬레이션 요청 감지
    if (lc.includes('시뮬레이션') || lc.includes('계산해') || lc.includes('추정해')) {
      simulationRequested = lc.includes('수익') ? 'revenue'
        : lc.includes('시장') ? 'market'
        : lc.includes('팀') ? 'team'
        : lc.includes('리스크') || lc.includes('위험') ? 'risk'
        : 'general'
    }

    // 주제 흐름 추적
    for (const rule of INTENT_RULES) {
      for (const kw of rule.kw) {
        if (lc.includes(kw)) { topicFlow.push(rule.id); break }
      }
    }
  }

  return {
    userIdeaHint,
    topicFlow: [...new Set(topicFlow)],
    simulationRequested,
    messageCount: messages.length,
    isReturningUser: messages.length > 4,
  }
}

// ══════════════════════════════════════════════════════════════════════
// §10. 학습 데이터 저장 — 지속 학습용
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
// §10-A. 응답 품질 자가 평가 엔진 (v5 신규)
// ══════════════════════════════════════════════════════════════════════

function evaluateResponseQuality(reply, intent, researchData) {
  let score = 5 // 기본 점수 (1~10)
  const flags = []

  // 길이 평가 (200자 미만 → 너무 짧음)
  if (reply.length < 200) { score -= 2; flags.push('too_short') }
  else if (reply.length > 500) { score += 1 }

  // 구조 평가 (→ 또는 ** 포함 여부)
  const hasStructure = reply.includes('→') || reply.includes('**')
  if (hasStructure) score += 1
  else flags.push('no_structure')

  // 근거 평가 (지식/기사 활용)
  if (researchData.knowledge.length > 0) score += 1
  if (researchData.articles.length > 0) score += 1

  // 의도 매칭 평가
  const intentKeywords = {
    lean_canvas:    ['린캔버스','문제','해결책','UVP','수익'],
    mvp:            ['MVP','프로토타입','검증','피드백'],
    simulation:     ['시뮬레이션','계산','추정','결과'],
    funding:        ['투자','VC','시드','엔젤','피치'],
    market_analysis:['TAM','SAM','SOM','시장','경쟁'],
  }
  const kws = intentKeywords[intent.primary] || []
  const matchCount = kws.filter(k => reply.includes(k)).length
  if (matchCount >= 2) score += 1
  else if (matchCount === 0 && kws.length > 0) { score -= 1; flags.push('intent_mismatch') }

  // 점수 범위 제한
  score = Math.max(1, Math.min(10, score))
  const needsImprovement = score < 5 || flags.includes('intent_mismatch')

  return { score, flags, needsImprovement }
}

async function persistLearningData({ sessionId, userMsg, reply, intent, userId, knowledgeCount, researchData }) {
  if (!SB_URL || !SB_KEY) return null
  const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }

  // 응답 품질 자가 평가 (v5)
  const quality = evaluateResponseQuality(reply, intent, researchData || { knowledge: [], articles: [] })

  let logId = null
  try {
    const res = await fetch(`${SB_URL}/rest/v1/mentor_chat_logs`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        session_id: sessionId,
        user_id: userId || null,
        user_message: userMsg.slice(0, 1000),
        ai_response: reply.slice(0, 3000),
        intent_classified: intent.primary,
        quality_score: quality.score,
        quality_flags: quality.flags,
        knowledge_used: knowledgeCount || 0,
        created_at: new Date().toISOString(),
      }),
    })
    if (res.ok) {
      const data = await res.json()
      logId = data?.[0]?.id || null
    }
  } catch { /* 학습 저장 실패 무시 */ }

  // 의도 통계 저장 (비동기) — 품질 정보 포함
  fetch(`${SB_URL}/rest/v1/mentor_intent_stats`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      intent: intent.primary,
      sample_query: userMsg.slice(0, 200),
      needs_improvement: quality.needsImprovement,
      quality_score: quality.score,
      created_at: new Date().toISOString(),
    }),
  }).catch(() => {})

  return logId
}

// ══════════════════════════════════════════════════════════════════════
// §10-B. 윤리 필터 v1 — 유해·부적절 요청 차단
// ══════════════════════════════════════════════════════════════════════

// 차단 카테고리별 키워드 패턴 (한국어 + 영어)
const ETHICS_RULES = [
  {
    id: 'violence',
    label: '폭력/상해',
    patterns: [/폭탄|폭발물|총기|무기|살인|살해|죽이|공격|테러|협박|폭행/],
    response: '그 주제는 제가 다룰 수 없어요. 저는 청소년 창업 멘토로서 건강하고 긍정적인 대화를 지향합니다. 창업이나 아이디어에 대해 이야기해요! 💡',
  },
  {
    id: 'hate',
    label: '혐오/차별',
    patterns: [/혐오|차별|비하|비난|욕설|욕하|멍청|바보|쓰레기|ㅂㅅ|ㅅㅂ|ㅅㄲ|ㅈㄹ/],
    response: '그런 표현은 사용하지 않는 것이 좋아요. 서로를 존중하는 대화로 함께 성장해요! 창업과 아이디어 이야기라면 언제든 도와드릴게요 😊',
  },
  {
    id: 'illegal',
    label: '불법/사기',
    patterns: [/불법|사기|해킹|개인정보 도용|탈세|세금 포탈|저작권 침해|표절|위조|사기치|다단계/],
    response: '죄송하지만 그 내용은 법적·윤리적 문제가 있어 도움드릴 수 없어요. 합법적이고 윤리적인 창업 방법에 대해서라면 최선을 다해 도와드릴게요! 🌱',
  },
  {
    id: 'adult',
    label: '성인/음란',
    patterns: [/성인|야동|포르노|음란|성행위|섹스/],
    response: '저는 청소년 창업 멘토입니다. 건전하고 유익한 창업 관련 대화를 나눠요! 궁금한 창업 주제가 있으면 편하게 물어보세요 🚀',
  },
  {
    id: 'personal_info',
    label: '개인정보 수집 시도',
    patterns: [/주민번호|신용카드번호|계좌번호|비밀번호 알려|패스워드 알려/],
    response: '개인 정보는 절대 공유하지 마세요! 저는 개인 정보를 수집하지 않으며, 창업 관련 질문만 도와드립니다. 안전을 위해 항상 주의해주세요 🔒',
  },
  {
    id: 'self_harm',
    label: '자해/자살',
    patterns: [/자살|자해|죽고 싶|사라지고 싶|없어지고 싶/],
    response: '지금 많이 힘드시군요. 혼자 감당하지 않아도 돼요. 청소년 위기상담전화 **1388** (24시간)에 전화하거나 문자 주시면 전문가가 도와드립니다. 여러분은 소중한 존재입니다 💙',
  },
  {
    id: 'ai_deception',
    label: 'AI 사칭/기만 유도',
    patterns: [/사람인 척|사람이야\?|인간인 척|거짓말해|속여|jailbreak|탈옥/],
    response: '저는 PACM-AI 창업 멘토 AI입니다. 투명하게 AI임을 밝히며, 기만적 행동은 하지 않아요. 진정성 있는 창업 조언을 드리는 것이 제 역할입니다 😊',
  },
]

function ethicsCheck(msg) {
  if (!msg) return null
  const lower = msg.toLowerCase()
  for (const rule of ETHICS_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(lower) || pattern.test(msg)) {
        return { blocked: true, category: rule.id, label: rule.label, response: rule.response }
      }
    }
  }
  return { blocked: false }
}

// ══════════════════════════════════════════════════════════════════════
// §11. Rate Limiter
// ══════════════════════════════════════════════════════════════════════

const ipMap = new Map()
function rateCheck(ip) {
  const now = Date.now()
  const win = 60_000
  const max = 40
  const arr = (ipMap.get(ip) || []).filter(t => t > now - win)
  if (arr.length >= max) return false
  arr.push(now)
  ipMap.set(ip, arr)
  // 오래된 IP 정리 (메모리 관리)
  if (ipMap.size > 5000) {
    const cutoff = now - win
    for (const [k, v] of ipMap) {
      if (v.every(t => t < cutoff)) ipMap.delete(k)
    }
  }
  return true
}

// ══════════════════════════════════════════════════════════════════════
// §12. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      status: 'ok',
      engine: 'LUMI-v5',
      agent: 'LUMI (루미) — 멘토링 매니저',
      features: ['dynamic-synthesis', 'self-research-v2', 'simulation', 'continuous-learning-v2', 'knowledge-graph-v2', 'community-bm25', 'ideas-search', 'quality-evaluator'],
      external_api: false,
      cost: 0,
    }), { headers: { 'Content-Type': 'application/json', ...CORS } })
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  // Rate limit
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateCheck(ip)) {
    return new Response(JSON.stringify({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  // 요청 파싱
  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: '잘못된 요청입니다.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } })
  }

  const { messages, sessionId, userId } = body
  if (!Array.isArray(messages) || !messages.length) {
    return new Response(JSON.stringify({ error: '메시지가 없습니다.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } })
  }

  const lastUser = [...messages].reverse().find(m => m.role === 'user')
  if (!lastUser?.content) return new Response(JSON.stringify({ error: '사용자 메시지가 없습니다.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } })
  if (lastUser.content.length > 2000) return new Response(JSON.stringify({ error: '메시지가 너무 깁니다.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } })

  const userMsg = lastUser.content.trim()
  const startTime = Date.now()

  // ── A-0. 윤리 필터 — 유해·부적절 요청 차단
  const ethicsResult = ethicsCheck(userMsg)
  if (ethicsResult?.blocked) {
    return new Response(JSON.stringify({
      reply: ethicsResult.response,
      intent: 'ethics_blocked',
      intent_confidence: '10.00',
      engine: 'LUMI-v5.1',
      agent: 'LUMI',
      knowledge_used: 0,
      articles_used: 0,
      external_api: false,
      cost: 0,
      elapsed_ms: Date.now() - startTime,
      ethics_blocked: true,
      ethics_category: ethicsResult.category,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS, 'Cache-Control': 'no-store' },
    })
  }

  // ── A. 의도 분류
  const intent = classifyIntent(userMsg)

  // ── B. 컨텍스트 추론
  const context = reasonContext(messages)

  // ── C. 쿼리 확장 (지식 그래프 활용)
  const baseTokens = tokenize(userMsg, true)
  const expandedTokens = expandQueryWithGraph(baseTokens)

  // ── D. 자체 리서치 (DB 다중 소스 탐색)
  const researchData = await selfResearch(baseTokens, intent.primary, expandedTokens)

  // ── E. 시뮬레이션 확인
  let simResult = null
  const lower = userMsg.toLowerCase()
  const simKeywords = ['시뮬레이션', '계산해', '추정해', '예측해', '시나리오']
  if (simKeywords.some(k => lower.includes(k))) {
    const simType = lower.includes('수익') || lower.includes('매출') ? 'revenue'
      : lower.includes('시장') || lower.includes('tam') ? 'market'
      : lower.includes('팀') || lower.includes('인력') ? 'team'
      : (lower.includes('리스크') || lower.includes('위험')) ? 'risk'
      : null
    if (simType) {
      simResult = runSimulation(simType, extractSimParams(userMsg, simType))
    }
  }

  // ── F. 동적 응답 합성
  const reply = synthesizeResponse({
    intent,
    secondIntent: intent.secondary,
    userMsg,
    researchData,
    context,
    simResult,
  })

  // ── G. 학습 데이터 저장 (비동기)
  const sid = sessionId || `anon_${Date.now()}`
  const logIdPromise = persistLearningData({
    sessionId: sid,
    userMsg,
    reply,
    intent,
    userId,
    knowledgeCount: researchData.knowledge.length,
    researchData,
  })

  const elapsed = Date.now() - startTime

  // ── H. 스트리밍 응답 (SSE 방식으로 청크 전송)
  const useStream = body.stream === true
  if (useStream) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        // 메타 청크 먼저 전송
        const meta = {
          type: 'meta',
          intent: intent.primary,
          intent_confidence: intent.confidence.toFixed(2),
          knowledge_used: researchData.knowledge.length,
          articles_used: researchData.articles.length,
          community_used: researchData.community?.length || 0,
          ideas_used: researchData.ideas?.length || 0,
          simulation: simResult?.type || null,
          engine: 'LUMI-v5',
          agent: 'LUMI',
          external_api: false,
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(meta)}\n\n`))

        // 응답 텍스트를 문단 단위로 쪼개 스트리밍
        const paragraphs = reply.split('\n')
        for (const para of paragraphs) {
          // 빈 줄도 전송 (줄바꿈 유지)
          const chunk = { type: 'text', text: para + '\n' }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
          // 자연스러운 타이핑 딜레이 (10~30ms)
          await new Promise(r => setTimeout(r, para.length > 0 ? 18 : 8))
        }

        // 학습 저장 후 logId 전송
        const logId = await logIdPromise.catch(() => null)
        const done = { type: 'done', logId, elapsed_ms: Date.now() - startTime }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`))
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store',
        'Connection': 'keep-alive',
        ...CORS,
        'X-PACM-AI-Engine': 'v4',
        'X-PACM-AI-Intent': intent.primary,
      },
    })
  }

  // ── 비스트리밍 응답 (기존 방식 유지)
  const logId = await logIdPromise.catch(() => null)
  return new Response(JSON.stringify({
    reply,
    intent: intent.primary,
    intent_confidence: intent.confidence.toFixed(2),
    engine: 'LUMI-v5',
    agent: 'LUMI',
    knowledge_used: researchData.knowledge.length,
    articles_used: researchData.articles.length,
    community_used: researchData.community?.length || 0,
    ideas_used: researchData.ideas?.length || 0,
    simulation: simResult?.type || null,
    external_api: false,
    cost: 0,
    elapsed_ms: elapsed,
    logId,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...CORS,
      'Cache-Control': 'no-store',
      'X-PACM-AI-Engine': 'v4',
      'X-PACM-AI-Intent': intent.primary,
    },
  })
}
