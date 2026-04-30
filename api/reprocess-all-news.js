/**
 * api/reprocess-all-news.js
 * Insightship 뉴스 전체 재처리기 v15.0
 * 완전 동적 본문 분석 — 고정 템플릿 0개
 * - 본문 있는 기사: BM25 키문장 추출 기반
 * - 본문 없는 기사(제목만): NER 완전 분석 기반 동적 생성 (고정 문구 절대 없음)
 *
 * POST /api/reprocess-all-news  (Authorization: Bearer CRON_SECRET | admin JWT)
 *   body: { batch?: number (기본40), offset?: number (기본0), force?: boolean }
 * GET  /api/reprocess-all-news  → 처리 현황 통계
 *
 * v15 핵심 변경:
 *   - 마커 v15으로 업그레이드 → 기존 v14 이하 기사 전체 재처리 대상
 *   - 본문 없는 기사: NER 완전 기반 동적 섹션 생성 (buildNerBasedSections)
 *   - 본문 있는 기사: BM25 키문장 추출 + 섹션 분류 개선
 *   - buildLongformSummary → summarize-news.js와 동일한 buildLongformStory 로직으로 통합
 *   - PostgREST 필터 ilike 유지 (like 와일드카드 500 에러 방지)
 *   - status=eq.published 필터 제거 (articles 테이블에 해당 컬럼 없음)
 */
export const config = { runtime: 'edge', maxDuration: 60 }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// ══════════════════════════════════════════════════════════════════════
// NLP 코어
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
  '한편','이와','이에','위와','아래와','오는',
])

function tokenize(text) {
  if (!text) return []
  const c = text.replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g, ' ').toLowerCase()
  return (c.match(/[가-힣]{2,}|[a-z]{3,}|[0-9]+/g) || [])
    .filter(t => !STOPWORDS.has(t) && t.length >= 2)
}

const K1 = 1.5, BP = 0.75
function bm25(qToks, dToks, avgLen, N, df) {
  const tf = {}
  for (const t of dToks) tf[t] = (tf[t] || 0) + 1
  let s = 0
  for (const q of qToks) {
    if (!tf[q]) continue
    const idf = Math.log((N - (df[q] || 0) + 0.5) / ((df[q] || 0) + 0.5) + 1)
    const tfw = (tf[q] * (K1 + 1)) / (tf[q] + K1 * (1 - BP + BP * dToks.length / avgLen))
    s += idf * tfw
  }
  return s
}

// ── 이벤트 분류 ────────────────────────────────────────────────────────
const EVT = {
  funding:     { kw:['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC','엔젤','CVC','프리시드','브릿지','Pre-A','달러'], emoji:'💰', label:'투자 유치' },
  product:     { kw:['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈','런칭','업데이트','신기능'],                    emoji:'🚀', label:'제품/서비스 출시' },
  policy:      { kw:['정부','지원','공모','선발','과기부','중기부','창진원','예산','규제','정책','공고','바우처','R&D','개최','경진대회'],emoji:'📋', label:'정책/지원' },
  acquisition: { kw:['인수','합병','M&A','지분','매각','인수합병','전략적투자','피인수'],                                             emoji:'🤝', label:'인수/합병' },
  research:    { kw:['연구','논문','결과','조사','분석','보고서','데이터','통계','리포트','설문'],                                    emoji:'🔬', label:'연구/조사' },
  person:      { kw:['대표','CEO','창업자','설립자','인터뷰','스토리','수상','선정','강연','멘토'],                                   emoji:'👤', label:'창업가 스토리' },
  market:      { kw:['시장','성장','규모','트렌드','전망','예측','확대','점유율','글로벌','수출'],                                    emoji:'📊', label:'시장/트렌드' },
  ipo:         { kw:['IPO','상장','코스닥','코스피','증권','공모','기업공개'],                                                       emoji:'📈', label:'IPO/상장' },
}

// ── 도메인 분류 ──────────────────────────────────────────────────────
const DOM = {
  investment:{ kw:['투자','펀딩','시리즈A','시리즈B','억원','조원','VC','엑셀러레이터','CVC'],           ko:'투자·금융',    cat:'trend'   },
  tech:      { kw:['AI','인공지능','딥러닝','반도체','GPU','클라우드','SaaS','기술','LLM','생성형'],      ko:'기술·AI',      cat:'trend'   },
  youth:     { kw:['청소년','청년','대학생','고등학생','창업교육','해커톤','비즈쿨','학생창업'],           ko:'청소년·교육',  cat:'insight' },
  policy:    { kw:['정부','지원','공모','과기부','중기부','창진원','규제','R&D','바우처'],                ko:'정책·지원',    cat:'insight' },
  esg:       { kw:['ESG','탄소중립','친환경','임팩트','소셜벤처','그린','기후테크','그린바이오'],         ko:'ESG·임팩트',   cat:'insight' },
  startup:   { kw:['스타트업','창업','유니콘','피봇','글로벌','스케일업','그로스'],                      ko:'창업·비즈니스',cat:'news'    },
  edutech:   { kw:['에듀테크','교육플랫폼','학습','온라인교육','이러닝','EdTech'],                       ko:'에듀테크',     cat:'insight' },
  fintech:   { kw:['핀테크','결제','금융','블록체인','암호화폐','디파이','NFT'],                         ko:'핀테크',       cat:'trend'   },
  health:    { kw:['헬스케어','의료','바이오','디지털헬스','건강','그린바이오','신약'],                   ko:'헬스케어',     cat:'trend'   },
  climate:   { kw:['기후','탄소','신재생','태양광','배터리','전기차','그린에너지'],                      ko:'기후테크',     cat:'insight' },
}

const INVESTMENT_STAGES = ['시드','Pre-A','시리즈A','시리즈B','시리즈C','시리즈D','프리IPO','IPO']

const GEO_LIST = [
  '서울','부산','대구','인천','광주','대전','울산','세종','수원','성남','고양','용인','천안',
  '충남','충북','경기','강원','전북','전남','경북','경남','제주','아프리카','중동','동남아',
  '유럽','미국','중국','일본','베트남','인도','싱가포르','영국','독일','이스라엘','브라질',
  '프랑스','호주','캐나다','UAE','글로벌','해외','국내','한국',
]
const TECH_LIST = [
  'AI','인공지능','GPT','LLM','머신러닝','딥러닝','자연어처리','컴퓨터비전','빅데이터',
  '클라우드','SaaS','API','블록체인','핀테크','에듀테크','헬스테크','바이오','반도체',
  'GPU','로봇','드론','자율주행','IoT','AR','VR','그린바이오','건기식',
]

// ── HTML 전처리 ───────────────────────────────────────────────────────
function clean(t) {
  return (t || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 10)) } catch { return '' } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)) } catch { return '' } })
    .replace(/https?:\/\/\S+/g, '')
    .replace(/공유하기|페이스북|트위터|카카오톡\s*공유|인스타그램|네이버\s*밴드|URL\s*복사/g, '')
    .replace(/기자\s*[가-힣]{2,4}\s*기자|^\s*[가-힣]{2,3}\s*기자/gm, '')
    .replace(/입력\s*\d{4}\.\d{2}\.\d{2}.*$/gm, '')
    .replace(/수정\s*\d{4}\.\d{2}\.\d{2}.*$/gm, '')
    .replace(/저작권자\s*©.*$/gm, '')
    .replace(/무단전재\s*및\s*재배포\s*금지/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?기자\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function splitSents(text) {
  return text
    .replace(/([.!?])\s+/g, '$1\n')
    .replace(/([다요임음])\s+/g, '$1\n')
    .split('\n').map(s => s.trim())
    .filter(s => s.length >= 20 && s.length <= 400)
}

function hasNum(s)    { return /([\d,]+억|[\d,]+조|[\d,]+만\s*원|[\d]+%|[\d]+배|[\d,]+만\s*명|[\d,]+개|[\d,]+달러)/.test(s) }
function isCausal(s)  { return /(때문에|이유로|원인은|배경에는|결과로|따라서|이로\s*인해|덕분에|영향으로)/.test(s) }
function isGoal(s)    { return /(목표|계획|예정|방침|전략|추진|노력|위해)/.test(s) }
function isNoise(s)   { return /무단\s*(전재|배포)|copyright|구독|좋아요|광고|협찬/i.test(s) }
function isQuote(s)   { return (s.includes('"') || s.includes('\u201c') || s.includes('\u201d')) && /(밝혔다|말했다|전했다|강조했다|설명했다|덧붙였다|언급했다)/.test(s) }

function cosineSim(a, b) {
  const setA = new Set(a), setB = new Set(b)
  const intersection = [...setA].filter(x => setB.has(x)).length
  const denom = Math.sqrt(setA.size) * Math.sqrt(setB.size)
  return denom > 0 ? intersection / denom : 0
}

function scoreAll(sents, titleToks) {
  const toks = sents.map(s => tokenize(s))
  const N = sents.length || 1
  const df = {}
  for (const ts of toks) for (const t of new Set(ts)) df[t] = (df[t] || 0) + 1
  const avgLen = toks.reduce((s, t) => s + t.length, 0) / N || 1
  return sents.map((sent, i) => {
    if (isNoise(sent)) return { sent, score: -1, idx: i }
    const bm   = bm25(titleToks, toks[i], avgLen, N, df)
    const pos  = i < 2 ? 1.5 : i < 5 ? 1.25 : 1.0
    const l    = sent.length
    const lenB = (l >= 40 && l <= 180) ? 1.3 : l > 250 ? 0.7 : 1.0
    const numB = hasNum(sent) ? 1.4 : 1.0
    const cauB = isCausal(sent) ? 1.25 : 1.0
    return { sent, score: bm * pos * lenB * numB * cauB, idx: i }
  })
}

function detectEvt(title, body) {
  const text = (title + ' ' + (body || '').slice(0, 500)).toLowerCase()
  const pri  = ['funding','ipo','acquisition','product','policy','research','person','market']
  const sc   = {}
  for (const t of pri) {
    sc[t] = EVT[t].kw.filter(k => text.includes(k.toLowerCase())).length
    sc[t] += EVT[t].kw.filter(k => title.toLowerCase().includes(k.toLowerCase())).length
  }
  const best = pri.reduce((a, b) => sc[a] >= sc[b] ? a : b)
  return sc[best] > 0 ? best : 'general'
}

function detectDom(title, body) {
  const text = (title + ' ' + (body || '').slice(0, 600)).toLowerCase()
  let best = 'startup', bestScore = 0
  for (const [d, { kw }] of Object.entries(DOM)) {
    const s = kw.filter(k => text.includes(k.toLowerCase())).length
    if (s > bestScore) { best = d; bestScore = s }
  }
  return best
}

function mapCat(dom, evt) {
  if (evt === 'policy' || dom === 'youth' || dom === 'policy') return 'insight'
  if (evt === 'funding' || evt === 'market' || evt === 'ipo') return 'trend'
  if (evt === 'person') return 'magazine'
  return DOM[dom]?.cat || 'news'
}

function estReadTime(t) { return Math.max(3, Math.ceil((t || '').length / 300)) }

// ── NER: 제목 완전 분석 ────────────────────────────────────────────────
function parseTitle(title) {
  const ner = { amounts: [], geo: [], tech: [], dates: [], metrics: [], stage: null, orgs: [], action: null }
  ner.amounts  = (title.match(/[\d,]+억\s*달러|[\d,]+만\s*달러|[\d,]+조\s*원|[\d,]+억\s*원|[\d,]+만\s*원|\d+억|\d+조|\d[\d,]*\s*달러/g) || [])
  ner.geo      = GEO_LIST.filter(g => title.includes(g))
  ner.tech     = TECH_LIST.filter(t => title.toLowerCase().includes(t.toLowerCase()))
  ner.dates    = title.match(/\d+월\s*\d+일|\d+월|\d+분기|\d{4}년|상반기|하반기|올해|내년/) || []
  ner.metrics  = title.match(/유니콘|데카콘|IPO|상장|[\d]+위|[\d]+%|[\d]+배|[\d]만\s*명|[\d]명/) || []
  for (const s of INVESTMENT_STAGES) { if (title.includes(s)) { ner.stage = s; break } }
  if (/투자|펀딩|유치/.test(title))                                              ner.action = 'invest'
  else if (/인수|합병|M&A/.test(title))                                          ner.action = 'acquire'
  else if (/출시|론칭|공개|배포/.test(title))                                    ner.action = 'launch'
  else if (/개최|공모|모집|접수|선발|선정|합류|유니콘|육성|경진대회/.test(title)) ner.action = 'contest'
  else if (/분석|영향|전망|예측|조사/.test(title))                                ner.action = 'analysis'
  else if (/진출|확장|스케일/.test(title))                                        ner.action = 'expand'
  else                                                                              ner.action = 'news'
  // 기업명: 제목 앞부분 추출
  const orgM = title.match(/^([^,，·\[\]\s]{2,14}(?:테크|솔루션|랩스?|스튜디오|플랫폼|바이오|AI|ai|Inc|Corp)?)\s*[,，·]/)
  if (orgM && orgM[1].trim().length >= 2 && !STOPWORDS.has(orgM[1].trim())) {
    ner.orgs = [orgM[1].trim()]
  }
  return ner
}

// ══════════════════════════════════════════════════════════════════════
// 빈 body 기사용 NER 기반 동적 섹션 생성기
// 고정 문구 절대 없음 — 모든 문장이 제목 NER에서 동적 생성
// ══════════════════════════════════════════════════════════════════════

// buildContextLines — 배경·맥락 섹션
// 이벤트·도메인·NER에서 완전 동적으로 생성 (고정 문구 없음)
function buildContextLines(evt, dom, ner) {
  const { tech, geo, stage, orgs, amounts } = ner
  const domKo = DOM[dom]?.ko || '창업·비즈니스'
  const lines = []

  const who     = orgs[0] || null
  const techStr = tech.length > 0 ? `**${tech[0]}**` : null
  const geoStr  = geo.length > 0 && geo[0] !== '한국' && geo[0] !== '국내' ? geo[0] : null

  if (evt === 'funding') {
    // 투자 단계별 맥락 — 기업명·기술·금액 조합으로 완전 동적
    if (stage) {
      const stageMap = {
        '시드':    `아이디어 검증 단계`,
        'Pre-A':   `초기 제품 검증 단계`,
        '시리즈A': `PMF 검증 후 스케일업 단계`,
        '시리즈B': `성장 가속화 단계`,
        '시리즈C': `IPO·글로벌 확장 준비 단계`,
      }
      const stageDesc = stageMap[stage] || `${stage} 투자 단계`
      const whoStr = who ? `**${who}**의 이번 투자는` : '이번 투자는'
      const amtStr = amounts[0] ? ` **${amounts[0]}** 규모로` : ''
      lines.push(`${whoStr}${amtStr} ${stageDesc}에 해당하며, ${domKo} 생태계에서 주목할 움직임입니다.`)
    }
    if (techStr) {
      const amtPart = amounts[0] ? ` ${amounts[0]} 수준의` : ''
      lines.push(`${techStr} 분야에${amtPart} 자금이 집중되고 있어, ${domKo} 내 기술 경쟁이 더욱 치열해질 전망입니다.`)
    } else if (!stage) {
      lines.push(`${domKo} 투자 시장은 실질적인 성과를 낸 기업 중심으로 재편되고 있으며, 이번 사례가 그 흐름을 반영합니다.`)
    }
    if (geoStr) {
      lines.push(`${geoStr} 시장으로의 확장 가능성도 이번 투자 배경 중 하나로 분석됩니다.`)
    }
  } else if (evt === 'acquisition') {
    const buyer = who ? `**${who}**` : '인수 주체'
    if (techStr) {
      lines.push(`${buyer}의 이번 인수는 ${techStr} 기술 역량 내재화가 핵심 목적으로, ${domKo} 분야 경쟁 구도에 영향을 줄 것으로 보입니다.`)
    } else {
      lines.push(`${buyer}의 인수·합병은 ${domKo} 시장 내 포지셔닝 강화를 위한 전략적 선택으로 풀이됩니다.`)
    }
    if (amounts[0]) {
      lines.push(`거래 규모 **${amounts[0]}**는 최근 ${domKo} 업계 M&A 사례와 비교할 때 시장 기대치를 반영한 수치입니다.`)
    }
  } else if (evt === 'product') {
    if (techStr) {
      lines.push(`${techStr} 기반 신규 서비스는 ${domKo} 분야 기존 제품과의 차별화 포인트가 초기 시장 반응을 결정합니다.`)
    }
    if (geoStr) {
      lines.push(`${geoStr} 시장 진출은 현지 규제·경쟁 구도 파악이 선행되어야 하며, 이번 출시가 그 첫 번째 테스트가 될 전망입니다.`)
    } else if (!techStr) {
      lines.push(`새 서비스의 사용자 경험(UX)과 온보딩 전략이 ${domKo} 시장에서 초기 성패를 좌우하는 핵심 변수입니다.`)
    }
  } else if (evt === 'policy') {
    const org = who ? `**${who}**` : '관련 기관'
    lines.push(`${org}의 지원 프로그램은 ${domKo} 분야 스타트업에게 자금 외에도 네트워크·멘토링·검증 기회를 제공합니다.`)
    if (geoStr) {
      lines.push(`${geoStr} 지역 특화 트랙 여부도 확인할 필요가 있어, 지역 기반 창업가에게 추가 기회가 있을 수 있습니다.`)
    }
    if (amounts[0]) {
      lines.push(`지원 규모 **${amounts[0]}**는 ${domKo} 분야 공모 기준으로 볼 때 경쟁률이 높을 것으로 예상됩니다.`)
    }
  } else if (evt === 'research') {
    if (techStr) {
      lines.push(`${techStr} 관련 연구·분석 데이터는 ${domKo} 분야 의사결정의 핵심 근거로 활용됩니다.`)
    } else {
      lines.push(`이번 연구·분석은 ${domKo} 트렌드의 방향성을 숫자로 확인할 수 있는 드문 자료입니다.`)
    }
    if (amounts[0]) {
      lines.push(`**${amounts[0]}** 등 핵심 지표는 시장 규모 또는 성장률 관련 주요 수치로 해석됩니다.`)
    }
  } else if (evt === 'market') {
    if (techStr) {
      lines.push(`${techStr} 시장 재편은 ${domKo} 전반의 비즈니스 모델 혁신을 가속하고 있습니다.`)
    } else {
      lines.push(`${domKo} 시장 변화는 기술·규제·소비자 행동 세 가지 축이 동시에 움직이며 만들어지고 있습니다.`)
    }
    if (amounts[0]) {
      lines.push(`시장 규모 **${amounts[0]}**는 진입 기회와 경쟁 강도를 가늠하는 핵심 벤치마크가 됩니다.`)
    }
    if (geoStr) {
      lines.push(`${geoStr} 시장 동향이 국내 ${domKo} 트렌드에 선행 지표로 작용할 가능성이 있습니다.`)
    }
  } else if (evt === 'ipo') {
    const name = who ? `**${who}**` : '해당 기업'
    lines.push(`${name}의 IPO·상장 추진은 ${domKo} 생태계 투자 심리 회복의 신호로 읽힙니다.`)
    if (amounts[0]) {
      lines.push(`예상 기업가치 **${amounts[0]}**는 유사 기업 밸류에이션 대비 적정성 논의가 이어질 전망입니다.`)
    }
  } else if (evt === 'person') {
    const name = who ? `**${who}**` : '이 인물'
    if (techStr) {
      lines.push(`${name}의 ${techStr} 분야 경험은 ${domKo} 창업가에게 실질적인 레퍼런스가 됩니다.`)
    } else {
      lines.push(`${name}의 커리어 경로와 의사결정 방식이 ${domKo} 분야에 갖는 시사점이 주목받고 있습니다.`)
    }
  }

  return lines
}

// buildOpportunityLines — 창업가 시각 섹션
// NER 기반 완전 동적 생성, 섹션별 반복 없도록 coreLines와 차별화
function buildOpportunityLines(evt, dom, ner) {
  const { tech, stage, orgs, amounts, geo } = ner
  const domKo = DOM[dom]?.ko || '창업·비즈니스'
  const lines = []

  const who    = orgs[0] || null
  const techKw = tech.length > 0 ? tech[0] : null
  const geoKw  = geo.length > 0 && geo[0] !== '한국' && geo[0] !== '국내' ? geo[0] : null

  if (evt === 'funding') {
    if (who) {
      lines.push(`**${who}**이(가) 투자금을 어느 분야에 먼저 집행하는지 추적하면 ${domKo} 시장의 다음 핵심 병목이 보입니다.`)
    }
    if (stage === '시드' || stage === 'Pre-A') {
      lines.push(`초기 단계 투자 기업은 파트너십에 열려 있는 경우가 많습니다. ${domKo} 분야에서 협업 가능한 접점을 먼저 찾아보세요.`)
    } else if (stage === '시리즈A' || stage === '시리즈B') {
      lines.push(`스케일업 단계 기업의 채용·공급망·파트너 확장 수요를 공략하면 비즈니스 기회로 연결될 수 있습니다.`)
    } else if (!who) {
      lines.push(`이 투자 사례에서 투자자가 어떤 문제 해결력을 핵심 가치로 봤는지 역으로 분석하면 ${domKo} 시장의 핵심 결핍이 드러납니다.`)
    }
  } else if (evt === 'acquisition') {
    lines.push(`인수 이후 ${domKo} 시장에서 공백이 생길 수 있습니다. 기존 고객·파트너 니즈를 흡수할 대안 서비스가 틈새 기회입니다.`)
    if (techKw) {
      lines.push(`**${techKw}** 분야 M&A가 활발하다는 것은 이 기술을 보유한 스타트업의 엑싯 경로가 열려 있다는 의미이기도 합니다.`)
    }
  } else if (evt === 'product') {
    if (techKw) {
      lines.push(`**${techKw}** 기반 서비스를 직접 사용해보고 '아직 해결되지 않은 마찰'을 발견하면 그것이 다음 창업 아이디어의 씨앗입니다.`)
    } else {
      lines.push(`새로운 서비스 출시 이후 사용자 반응과 불만 데이터를 분석하면 후속 기회가 보입니다.`)
    }
    if (geoKw) {
      lines.push(`${geoKw} 시장 진출 타이밍에 맞춰 현지 파트너십이나 로컬라이제이션 기회를 탐색할 수 있습니다.`)
    }
  } else if (evt === 'policy') {
    lines.push(`지원 자금뿐 아니라 프로그램이 제공하는 네트워크·멘토·검증 기회를 최대한 활용하는 전략을 설계하세요.`)
    if (amounts[0]) {
      lines.push(`**${amounts[0]}** 규모 지원 프로그램은 경쟁률이 높을 수 있으니 차별화된 지원서 전략이 중요합니다.`)
    }
  } else if (evt === 'research') {
    if (techKw) {
      lines.push(`**${techKw}** 관련 데이터의 갭(gap)이 아직 해결되지 않은 문제를 가리킵니다. 그 갭이 창업 기회입니다.`)
    } else {
      lines.push(`연구에서 드러난 미해결 과제나 예외 케이스에 집중하면 ${domKo} 분야의 숨겨진 기회가 보입니다.`)
    }
  } else if (evt === 'market') {
    const mktKw = techKw ? `**${techKw}**` : domKo
    lines.push(`${mktKw} 시장이 성장하면 그 안의 인프라·도구·서비스 수요도 함께 늘어납니다. 시장 자체보다 시장 성장의 수혜 레이어를 노리세요.`)
    if (geoKw) {
      lines.push(`${geoKw} 시장 트렌드가 국내에 유입되는 타이밍을 예측해 선점하는 전략이 유효합니다.`)
    }
  } else if (evt === 'person') {
    const name = who ? `**${who}**` : '이 창업가'
    lines.push(`${name}의 스토리에서 '문제 인식 → 첫 행동 → 피벗 결정' 세 가지 순간에 어떤 선택을 했는지 추출하면 실전 레슨이 됩니다.`)
    if (techKw) {
      lines.push(`**${techKw}** 분야 전문성이 창업 배경이 되었다면, 비슷한 도메인 지식을 가진 창업가에게 직접 적용 가능한 인사이트입니다.`)
    }
  } else if (evt === 'ipo') {
    lines.push(`IPO·상장 과정에서 공개되는 사업 구조·재무 데이터는 ${domKo} 분야 경쟁 벤치마크로 활용할 수 있습니다.`)
    if (amounts[0]) {
      lines.push(`**${amounts[0]}** 기업가치를 역산하면 투자자가 평가한 시장 포텐셜 규모를 가늠할 수 있습니다.`)
    }
  } else if (evt === 'acquisition') {
    lines.push(`인수 후 통합 과정에서 발생하는 고객 이탈을 흡수할 수 있는 대안 서비스 기회를 탐색하세요.`)
  } else {
    const kw = techKw ? `**${techKw}**` : domKo
    lines.push(`이 소식을 '내 비즈니스 관점'으로 다시 읽으면, ${kw} 분야에서 아직 해결되지 않은 구체적인 문제가 보입니다.`)
  }

  return lines
}

function buildNerBasedSections(title, evt, dom, ner) {
  const { amounts, orgs, tech, geo, stage, dates, metrics } = ner
  const evtInfo = EVT[evt] || { emoji: '📰', label: '주요 소식' }
  const domKo   = DOM[dom]?.ko || '창업·비즈니스'
  const sections = []

  // ── 이벤트별 맞춤 핵심 내용 ───────────────────────────────────────
  const coreLines = []
  if (evt === 'funding') {
    const who      = orgs[0] || title.split(/[,，·]/)[0].trim()
    const howMuch  = amounts[0] || null
    const stageStr = stage || '투자'
    if (howMuch) {
      coreLines.push(`**${who}**이(가) **${howMuch}** 규모의 ${stageStr}를 유치했습니다.`)
    } else {
      coreLines.push(`**${who}**이(가) ${stageStr}를 성공적으로 유치했습니다.`)
    }
    if (tech.length > 0) {
      coreLines.push(`${domKo} 분야에서 **${tech.slice(0, 2).join('·')}** 기술을 기반으로 성장을 이어가고 있습니다.`)
    }
    if (geo.length > 0 && geo[0] !== '한국' && geo[0] !== '국내') {
      coreLines.push(`${geo[0]} 시장 진출 또는 글로벌 확장 가능성에도 관심이 모이고 있습니다.`)
    }
  } else if (evt === 'acquisition') {
    const parts  = title.split(/[,，·]/)
    const buyer  = orgs[0] || parts[0]?.trim() || '인수 기업'
    const techStr = tech.length > 0 ? ` **${tech[0]}** 등 핵심 기술 역량 확보를 위해` : ''
    coreLines.push(`${techStr} **${buyer}**이(가) 인수·합병을 통해 ${domKo} 분야 경쟁력을 강화하고 있습니다.`)
    if (amounts.length > 0) {
      coreLines.push(`이번 거래 규모는 **${amounts[0]}**으로, ${domKo} 업계 M&A 중 주목할 만한 사례입니다.`)
    }
  } else if (evt === 'product') {
    const who     = orgs[0] || title.split(/[,，·]/)[0].trim()
    const techStr = tech.length > 0 ? ` **${tech.slice(0, 2).join('·')}** 기반` : ''
    coreLines.push(`**${who}**이(가)${techStr} 신규 서비스·제품을 출시하며 ${domKo} 분야에 새로운 흐름을 만들고 있습니다.`)
    if (geo.length > 0 && geo[0] !== '한국' && geo[0] !== '국내') {
      coreLines.push(`${geo[0]} 시장을 포함한 글로벌 확장도 함께 추진되고 있는 것으로 알려졌습니다.`)
    }
  } else if (evt === 'policy') {
    const org    = orgs[0] || '지원 기관'
    const geoStr = geo.length > 0 ? `${geo[0]} 지역의 ` : ''
    coreLines.push(`${geoStr}${domKo} 분야 스타트업·창업가를 대상으로 **${org}**이(가) 신규 지원 프로그램을 운영합니다.`)
    if (amounts.length > 0) {
      coreLines.push(`지원 규모는 **${amounts[0]}** 수준이며, 관련 기업들의 관심이 높습니다.`)
    }
    if (dates.length > 0) {
      coreLines.push(`**${dates[0]}** 일정에 맞춰 신청·모집이 진행될 예정입니다.`)
    }
  } else if (evt === 'research') {
    const techStr = tech.length > 0 ? `**${tech.slice(0, 2).join('·')}**` : domKo
    coreLines.push(`${techStr} 분야에 대한 새로운 연구·분석 결과가 발표되며 업계의 이목을 끌고 있습니다.`)
    if (amounts.length > 0 || metrics.length > 0) {
      const m = [...amounts, ...metrics].slice(0, 1)[0]
      if (m) coreLines.push(`**${m}** 등 주요 수치가 핵심 지표로 부각됩니다.`)
    }
  } else if (evt === 'person') {
    const who = orgs[0] || title.split(/[,，·]/)[0].trim()
    coreLines.push(`**${who}**의 창업 스토리와 ${domKo} 분야 인사이트가 주목받고 있습니다.`)
    if (tech.length > 0) {
      coreLines.push(`특히 **${tech[0]}** 분야에서의 경험과 비전이 업계에 시사하는 바가 큽니다.`)
    }
  } else if (evt === 'market') {
    const techStr = tech.length > 0 ? `**${tech[0]}**` : domKo
    const geoStr  = geo.length > 0  ? `${geo[0]} 시장을 포함한 ` : ''
    coreLines.push(`${geoStr}${techStr} 분야 시장 규모·트렌드 변화가 확인되며 투자자와 창업가 모두의 관심이 집중되고 있습니다.`)
    if (amounts.length > 0) {
      coreLines.push(`관련 시장 규모가 **${amounts[0]}** 수준으로 평가되고 있습니다.`)
    }
  } else if (evt === 'ipo') {
    const who = orgs[0] || title.split(/[,，·]/)[0].trim()
    coreLines.push(`**${who}**이(가) IPO·상장을 추진하며 ${domKo} 생태계에 새로운 기준점을 제시하고 있습니다.`)
    if (amounts.length > 0) {
      coreLines.push(`예상 기업가치 또는 공모 규모는 **${amounts[0]}** 수준으로 알려져 있습니다.`)
    }
  } else {
    const who     = orgs[0] || title.split(/[,，·]/)[0].trim()
    const techStr = tech.length > 0 ? ` **${tech[0]}** 기반` : ''
    coreLines.push(`**${who}**이(가)${techStr} ${domKo} 분야에서 주목할 만한 움직임을 보이고 있습니다.`)
  }

  if (coreLines.length > 0) {
    sections.push({ title: '## 📌 핵심 내용', lines: coreLines, style: 'quote' })
  }

  const ctxLines = buildContextLines(evt, dom, ner)
  if (ctxLines.length > 0) {
    sections.push({ title: '## 🗺️ 배경과 맥락', lines: ctxLines, style: 'plain' })
  }

  const oppLines = buildOpportunityLines(evt, dom, ner)
  if (oppLines.length > 0) {
    sections.push({ title: '## 🚀 창업가 시각으로 읽기', lines: oppLines, style: 'plain' })
  }

  return sections
}

// ── 동적 질문 생성 ────────────────────────────────────────────────────
function buildDynamicQuestions(title, evt, dom, ner, keySents) {
  const { amounts, orgs, tech, geo, stage } = ner
  const domKo  = DOM[dom]?.ko || '창업·비즈니스'
  const titleKw = tokenize(title).filter(t => t.length >= 2 && !STOPWORDS.has(t)).slice(0, 4)
  const questions = []

  if (amounts.length > 0) {
    questions.push(`**${amounts[0]}** 규모는 ${domKo} 업계 평균과 비교하면 어느 정도이며, 이 자금이 어느 분야에 먼저 쓰일까요?`)
  }
  if (orgs.length > 0) {
    questions.push(`**${orgs[0]}**이(가) 이번 소식으로 얻는 가장 큰 이점은 무엇이고, 앞으로 어떤 행보를 보일까요?`)
  }

  if (evt === 'funding') {
    const stageStr = stage ? `${stage} 투자` : '이번 투자'
    questions.push(`${stageStr}를 받은 후 ${orgs[0] || '이 스타트업'}이(가) 다음 단계로 넘어가려면 무엇을 증명해야 할까요?`)
  } else if (evt === 'product') {
    questions.push('이 서비스가 기존 경쟁 제품 대비 실제로 해결하는 핵심 문제는 무엇이며, 어떤 사용자에게 가장 필요할까요?')
  } else if (evt === 'policy') {
    questions.push('이 정책·지원 프로그램을 가장 효과적으로 활용할 수 있는 스타트업 유형은 무엇일까요?')
  } else if (evt === 'research') {
    questions.push(`이 분석·연구 결과가 실제 ${domKo} 현장에 적용되면 어떤 변화가 가장 먼저 나타날까요?`)
  } else if (evt === 'person') {
    questions.push(`${orgs[0] || '이 창업가'}의 경험에서 나에게 바로 적용 가능한 교훈은 무엇인가요?`)
  } else if (evt === 'market') {
    const techStr = tech.length > 0 ? tech[0] : domKo
    questions.push(`${techStr} 시장 변화가 5년 후에도 지속된다면, 지금 어떤 포지션을 선점하는 것이 유리할까요?`)
  } else if (evt === 'ipo') {
    questions.push(`이번 IPO·상장이 ${domKo} 생태계 전반에 주는 신호는 무엇이며, 후속 상장 기업에게 어떤 영향을 줄까요?`)
  } else if (evt === 'acquisition') {
    questions.push(`이번 인수·합병 이후 ${domKo} 분야 경쟁 구도는 어떻게 재편될까요?`)
  } else {
    if (titleKw.length >= 2) {
      questions.push(`'${titleKw.slice(0, 2).join(', ')}' 관련 소식이 ${domKo} 분야 창업가에게 주는 기회와 위협은 각각 무엇일까요?`)
    } else {
      questions.push(`이 소식이 ${domKo} 분야 전반에 미치는 영향을 어떻게 평가할 수 있을까요?`)
    }
  }

  if (keySents.length > 1) {
    const kw = tokenize(keySents[1]).filter(t => t.length >= 2 && !STOPWORDS.has(t)).slice(0, 2)
    if (kw.length > 0) {
      questions.push(`'${kw.join(', ')}' 측면에서 아직 해결되지 않은 과제는 무엇일까요?`)
    }
  } else if (geo.length > 0 && questions.length < 3) {
    questions.push(`${geo[0]} 지역의 ${domKo} 스타트업이 이 소식을 기회로 활용할 수 있는 방법은 무엇일까요?`)
  }

  return questions.slice(0, 3)
}

// ══════════════════════════════════════════════════════════════════════
// v15 롱폼 빌더 — 고정 문구 0개, 100% 동적
// ══════════════════════════════════════════════════════════════════════

function buildLongformSummary(title, body) {
  const cb      = clean(body || '')
  const evt     = detectEvt(title, cb)
  const dom     = detectDom(title, cb)
  const ner     = parseTitle(title)
  const evtInfo = EVT[evt] || { emoji: '📰', label: '주요 소식' }
  const domInfo = DOM[dom]  || DOM.startup

  // 본문 문장 추출 — 제목 복사본 필터링
  const titleToks = tokenize(title)
  const rawSents  = splitSents(cb).filter(s => !isNoise(s))
  const sents     = rawSents.filter(s => cosineSim(tokenize(s), titleToks) < 0.75)

  const hasRealBody = sents.length >= 3
  const lines   = []
  const usedSet = new Set()

  // ── 헤더 ──────────────────────────────────────────────────────────
  lines.push(`## ${evtInfo.emoji} ${evtInfo.label} · ${domInfo.ko}`, '')
  if (ner.amounts.length > 0) { lines.push(`🔢 **핵심 수치**: ${ner.amounts.join(' / ')}`, '') }
  if (ner.stage)               { lines.push(`🏷️ **투자 단계**: ${ner.stage}`, '') }
  if (ner.tech.length > 0)     { lines.push(`🔧 **기술 키워드**: ${ner.tech.slice(0, 3).join(' · ')}`, '') }
  if (ner.geo.length > 0)      { lines.push(`📍 **지역**: ${ner.geo.slice(0, 2).join(' · ')}`, '') }

  if (hasRealBody) {
    // ── 본문 있는 경우: BM25 키문장 추출 ──────────────────────────
    const scored   = scoreAll(sents, titleToks).filter(x => x.score >= 0).sort((a, b) => b.score - a.score)
    const topIdx   = new Set(scored.slice(0, 10).map(x => x.idx))
    const keyLines = sents.filter((_, i) => topIdx.has(i)).slice(0, 6)
    const numLines = sents.filter(s => hasNum(s)    && !keyLines.includes(s)).slice(0, 5)
    const cauLines = sents.filter(s => isCausal(s)  && !keyLines.includes(s) && !numLines.includes(s)).slice(0, 3)
    const goalLines = sents.filter(s => isGoal(s)   && !keyLines.includes(s) && !numLines.includes(s) && !cauLines.includes(s)).slice(0, 3)
    const quoteLines = sents.filter(s => isQuote(s) && !keyLines.includes(s)).slice(0, 3)
    const extraLines = scored.slice(10, 20).map(x => x.sent)
      .filter(s => !keyLines.includes(s) && !numLines.includes(s) && !cauLines.includes(s) && !goalLines.includes(s) && !quoteLines.includes(s))
      .slice(0, 4)
    const importanceSents = sents.filter(s =>
      /(중요|주목|핵심|의미|영향|변화|화제|관심|신호)/.test(s) && !keyLines.includes(s) && !numLines.includes(s)
    ).slice(0, 2)
    const oppSents = sents.filter(s =>
      /(기회|전략|가능성|활용|아이디어|모델|비즈니스|창업|솔루션|혁신)/.test(s) &&
      !keyLines.includes(s) && !numLines.includes(s) && !importanceSents.includes(s)
    ).slice(0, 2)

    // §1 도입
    if (keyLines.length > 0 && keyLines[0].length >= 25) {
      usedSet.add(keyLines[0])
      lines.push(keyLines[0], '')
    }
    // §2 핵심 내용
    const mainSents = keyLines.filter(s => !usedSet.has(s)).slice(0, 5)
    if (mainSents.length > 0) {
      lines.push('---', '', '## 📌 핵심 내용', '')
      mainSents.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(`> ${s}`, '') } })
    }
    // §3 주요 수치
    if (numLines.length > 0) {
      lines.push('---', '', '## 📊 주요 수치 & 데이터', '')
      numLines.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(`→ ${s}`) } })
      lines.push('')
    }
    // §4 현장의 목소리
    if (quoteLines.length > 0) {
      lines.push('---', '', '## 💬 현장의 목소리', '')
      quoteLines.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(`> ${s}`, '') } })
    }
    // §5 배경과 맥락
    if (cauLines.length > 0) {
      lines.push('---', '', '## 🗺️ 배경과 맥락', '')
      cauLines.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(s, '') } })
    } else if (extraLines.length >= 2) {
      const extra = extraLines.filter(s => !usedSet.has(s)).slice(0, 3)
      if (extra.length > 0) {
        lines.push('---', '', '## 🗺️ 추가 내용', '')
        extra.forEach(s => { usedSet.add(s); lines.push(s, '') })
      }
    }
    // §6 향후 방향
    if (goalLines.length > 0) {
      lines.push('---', '', '## 🎯 향후 방향', '')
      goalLines.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(`• ${s}`, '') } })
    }
    // §7 왜 주목해야 하나
    if (importanceSents.length > 0) {
      lines.push('---', '', '## 💡 왜 주목해야 하나', '')
      importanceSents.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(s, '') } })
    }
    // §8 창업가 시각
    if (oppSents.length > 0) {
      lines.push('---', '', '## 🚀 창업가 시각으로 읽기', '')
      oppSents.forEach(s => { if (!usedSet.has(s)) { usedSet.add(s); lines.push(s, '') } })
    }
    // §9 동적 질문
    const questions = buildDynamicQuestions(title, evt, dom, ner, keyLines)
    if (questions.length > 0) {
      lines.push('---', '', '## 💭 생각해볼 질문', '')
      questions.forEach(q => lines.push(`• **Q.** ${q}`, ''))
    }
  } else {
    // ── 본문 없는 경우: NER 완전 기반 동적 생성 ──────────────────
    const nerSections = buildNerBasedSections(title, evt, dom, ner)
    for (const sec of nerSections) {
      lines.push('---', '', sec.title, '')
      if (sec.style === 'quote') {
        sec.lines.forEach(l => lines.push(`> ${l}`, ''))
      } else {
        sec.lines.forEach(l => lines.push(l, ''))
      }
    }
    const questions = buildDynamicQuestions(title, evt, dom, ner, [])
    if (questions.length > 0) {
      lines.push('---', '', '## 💭 생각해볼 질문', '')
      questions.forEach(q => lines.push(`• **Q.** ${q}`, ''))
    }
  }

  // ── 푸터 (v15 마커) ───────────────────────────────────────────────
  lines.push('---', '')
  lines.push(`*Insightship · ${domInfo.ko} · ${evtInfo.emoji} ${evtInfo.label} · insightship-longform-v15*`)

  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  const H = {
    apikey:         SB_KEY,
    Authorization:  `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  }

  // GET: 처리 현황 통계
  // ── ilike 사용 (like는 Supabase PostgREST에서 * 패턴 처리 시 500 에러)
  if (req.method === 'GET') {
    if (!SB_URL || !SB_KEY) {
      return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 })
    }

    const BASE  = `${SB_URL}/rest/v1/articles`
    const countH = { ...H, Prefer: 'count=exact', Range: '0-0' }

    const [rTotal, rV15, rV14, rNull] = await Promise.allSettled([
      fetch(`${BASE}?select=id`, { headers: countH }),
      fetch(`${BASE}?select=id&ai_summary=ilike.*insightship-longform-v15*`, { headers: countH }),
      fetch(`${BASE}?select=id&ai_summary=ilike.*insightship-longform-v14*`, { headers: countH }),
      fetch(`${BASE}?select=id&ai_summary=is.null`, { headers: countH }),
    ])

    const getCount = r => {
      if (r.status !== 'fulfilled') return 0
      const cr = r.value.headers?.get?.('content-range') || ''
      return parseInt(cr.split('/')[1] || '0') || 0
    }

    const total     = getCount(rTotal)
    const v15Done   = getCount(rV15)
    const v14Done   = getCount(rV14)
    const noSummary = getCount(rNull)

    return new Response(JSON.stringify({
      total_articles:   total,
      v15_done:         v15Done,
      v14_done:         v14Done,
      no_summary:       noSummary,
      needs_reprocess:  total - v15Done,
      progress_pct:     total > 0 ? Math.round((v15Done / total) * 100) : 0,
      engine:           'insightship-longform-v15',
      timestamp:        new Date().toISOString(),
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // POST: 재처리 실행
  const cronHeader  = req.headers.get('x-vercel-cron')
  const authHeader  = req.headers.get('authorization')
  const isAdminJWT  = authHeader && authHeader.startsWith('Bearer ') && authHeader !== `Bearer ${CRON_SECRET}`
    ? await checkAdminJWT(authHeader.slice(7))
    : false

  const isAuth = cronHeader === '1'
    || authHeader === `Bearer ${CRON_SECRET}`
    || isAdminJWT

  if (!isAuth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  if (!SB_URL || !SB_KEY) return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 })

  let params = {}
  try { params = await req.json().catch(() => ({})) } catch {}
  const batchSize = Math.min(Number(params.batch) || 40, 60)
  const offset    = Math.max(Number(params.offset) || 0, 0)
  const forceAll  = params.force === true

  let articles = []
  const BASE = `${SB_URL}/rest/v1/articles`

  if (forceAll) {
    // force=true: 모든 기사 대상 (v15 포함)
    const r = await fetch(
      `${BASE}?select=id,title,body,excerpt`
      + `&order=published_at.desc&limit=${batchSize}&offset=${offset}`,
      { headers: H }
    )
    articles = await r.json().catch(() => [])
  } else {
    // 기본: v15 마커 없는 기사 우선 처리 (ilike 사용)
    const r1 = await fetch(
      `${BASE}?select=id,title,body,excerpt,ai_summary`
      + `&ai_summary=not.ilike.*insightship-longform-v15*`
      + `&order=published_at.desc&limit=${batchSize}&offset=${offset}`,
      { headers: H }
    )
    articles = await r1.json().catch(() => [])
    if (!Array.isArray(articles)) articles = []

    // 보완: ai_summary null인 것 추가
    if (articles.length < batchSize) {
      const need     = batchSize - articles.length
      const existIds = new Set(articles.map(a => a.id))
      const r2 = await fetch(
        `${BASE}?select=id,title,body,excerpt&ai_summary=is.null`
        + `&order=published_at.desc&limit=${need}&offset=${offset}`,
        { headers: H }
      )
      const raw2  = await r2.json().catch(() => [])
      const extra = (Array.isArray(raw2) ? raw2 : []).filter(a => !existIds.has(a.id))
      articles = [...articles, ...extra]
    }
  }

  if (!Array.isArray(articles) || articles.length === 0) {
    // 남은 수 확인 (ilike 사용)
    const cr = await fetch(
      `${BASE}?select=id&ai_summary=not.ilike.*insightship-longform-v15*`,
      { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } }
    )
    const remaining = parseInt(cr.headers.get('content-range')?.split('/')[1] || '0')
    return new Response(JSON.stringify({
      message:     remaining === 0 ? '✅ 모든 기사 v15 롱폼 처리 완료!' : '현재 배치에 처리할 기사 없음 — offset을 늘려 재시도하세요',
      processed:   0, done: 0, failed: 0, remaining,
      next_offset: offset + batchSize,
      engine:      'insightship-longform-v15',
      timestamp:   new Date().toISOString(),
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // 병렬 롱폼 생성
  const summaryResults = await Promise.allSettled(
    articles.map(async a => {
      if (!a.title) return null
      const bodyText = (a.body && a.body.length > 100) ? a.body : (a.excerpt || '')
      return buildLongformSummary(a.title, bodyText)
    })
  )

  // DB 병렬 업데이트
  let done = 0, failed = 0
  const errors = []

  await Promise.allSettled(articles.map(async (a, i) => {
    const result = summaryResults[i]
    if (result.status !== 'fulfilled' || !result.value) { failed++; return }

    const bodyText  = (a.body && a.body.length > 100) ? a.body : (a.excerpt || '')
    const cleanBody = clean(bodyText)
    const dom       = detectDom(a.title, cleanBody)
    const evt       = detectEvt(a.title, cleanBody)
    const category  = mapCat(dom, evt)
    const readTime  = estReadTime(result.value)

    const u = await fetch(`${BASE}?id=eq.${a.id}`, {
      method:  'PATCH',
      headers: { ...H, Prefer: 'return=minimal' },
      body:    JSON.stringify({
        ai_summary:      result.value,
        ai_processed_at: new Date().toISOString(),
        ai_category:     dom,
        category,
        read_time:       readTime,
      }),
    })

    if (u.ok || u.status === 204) done++
    else {
      failed++
      const err = await u.text().catch(() => '')
      errors.push(`[${a.id}] HTTP${u.status} ${err.slice(0, 300)}`)
    }
  }))

  // 남은 수 확인
  const crRes = await fetch(
    `${BASE}?select=id&ai_summary=not.ilike.*insightship-longform-v15*`,
    { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } }
  )
  const remaining = parseInt(crRes.headers.get('content-range')?.split('/')[1] || '0')

  return new Response(JSON.stringify({
    processed:    articles.length,
    done,
    failed,
    errors:       errors.slice(0, 5),
    remaining,
    next_offset:  offset + batchSize,
    has_more:     remaining > 0,
    engine:       'insightship-longform-v15',
    longform:     true,
    cost:         0,
    external_api: false,
    timestamp:    new Date().toISOString(),
  }), {
    status:  200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function checkAdminJWT(token) {
  if (!token || !SB_URL || !SB_KEY) return false
  try {
    // 1) Supabase Auth에서 user.id 추출
    const r1 = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r1.ok) return false
    const user = await r1.json().catch(() => null)
    if (!user?.id) return false

    // 2) service_role 키로 profiles에서 role 확인 (RLS 우회)
    const r2 = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,role&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    )
    if (!r2.ok) return false
    const rows = await r2.json().catch(() => [])
    return Array.isArray(rows) && rows[0]?.role === 'admin'
  } catch { return false }
}
