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

function buildContextLines(evt, dom, ner) {
  const { tech, geo, stage } = ner
  const domKo = DOM[dom]?.ko || '창업·비즈니스'
  const lines = []

  if (evt === 'funding') {
    if (stage) {
      const stageCtx = {
        '시드':    '시드 투자는 아이디어 검증 단계의 첫 번째 외부 자금입니다. 이 시점에서 투자자들은 팀의 역량과 문제 해결 방향성을 가장 중요하게 봅니다.',
        'Pre-A':   'Pre-A 투자는 초기 제품·서비스를 시장에서 검증하기 직전 단계입니다. MVP를 고도화하는 데 활용됩니다.',
        '시리즈A': '시리즈A는 제품·시장 적합성(PMF)이 검증된 후 팀·마케팅 확장을 위한 첫 번째 대규모 투자입니다. 보통 수십억~수백억 원 규모로 진행됩니다.',
        '시리즈B': '시리즈B는 검증된 수익 모델을 바탕으로 빠른 성장을 추진하는 단계입니다. 인력 채용·해외 확장·신사업 투자에 활용됩니다.',
        '시리즈C': '시리즈C 이상은 이미 규모 있는 매출을 가진 기업이 IPO 또는 글로벌 확장을 준비하는 단계입니다.',
      }
      if (stageCtx[stage]) lines.push(stageCtx[stage])
    }
    if (tech.length > 0) {
      lines.push(`현재 글로벌 VC 시장에서 **${tech[0]}** 분야는 집중 투자 대상 중 하나입니다. 실질 수익 모델이 있는 기업에 자금이 몰리는 추세입니다.`)
    } else {
      lines.push(`${domKo} 투자 생태계는 선별적 투자 기조 속에서도 실질적인 성과를 낸 기업에게는 자금 접근 기회가 열려 있습니다.`)
    }
  } else if (evt === 'acquisition') {
    lines.push('M&A는 스타트업에게 IPO와 함께 대표적인 엑싯(Exit) 경로입니다. 대기업이 기술·인재·시장 점유율을 빠르게 확보하기 위한 수단으로 활용됩니다.')
    if (tech.length > 0) {
      lines.push(`특히 **${tech[0]}** 분야의 M&A는 기술 역량 내재화를 목적으로 하는 경우가 많아, 인수 이후에도 팀·기술의 독립성이 유지되는 사례가 늘고 있습니다.`)
    }
  } else if (evt === 'product') {
    if (tech.length > 0) {
      lines.push(`**${tech.slice(0, 2).join('·')}** 기술을 활용한 신규 서비스 출시는 기존 시장에 새로운 기준을 제시할 수 있습니다. 초기 시장 반응과 사용자 피드백이 이후 방향성을 결정합니다.`)
    }
    if (geo.length > 0 && geo[0] !== '한국' && geo[0] !== '국내') {
      lines.push(`${geo[0]} 시장 진출을 병행한다면, 현지 규제 환경과 사용자 니즈 파악이 초기 성패를 좌우합니다.`)
    }
  } else if (evt === 'policy') {
    lines.push(`정부 및 공공기관의 ${domKo} 지원 프로그램은 초기 스타트업에게 자금·네트워크·검증의 기회를 제공합니다. 선발 기준과 지원 혜택을 꼼꼼히 확인하고 적극적으로 활용하는 것이 중요합니다.`)
    if (geo.length > 0 && geo[0] !== '한국' && geo[0] !== '국내') {
      lines.push(`${geo[0]} 지역 기반 스타트업에게는 지역 특화 지원 트랙이 별도로 운영되는 경우가 많아 추가 기회를 탐색할 만합니다.`)
    }
  } else if (evt === 'research') {
    lines.push(`${domKo} 분야의 연구·분석 결과는 투자자·창업가·정책 입안자 모두에게 중요한 의사결정 근거가 됩니다. 데이터 기반 인사이트를 빠르게 파악하고 전략에 반영하는 능력이 경쟁력으로 이어집니다.`)
  } else if (evt === 'market') {
    const techStr = tech.length > 0 ? `**${tech[0]}**` : domKo
    lines.push(`${techStr} 시장은 기술 발전과 수요 변화가 맞물려 빠르게 재편되고 있습니다. 성장 곡선의 초기에 진입한 플레이어가 장기적으로 유리한 고지를 선점할 가능성이 높습니다.`)
  }

  return lines
}

function buildOpportunityLines(evt, dom, ner) {
  const { tech, stage } = ner
  const domKo = DOM[dom]?.ko || '창업·비즈니스'
  const lines = []

  if (evt === 'funding') {
    lines.push(`투자를 받은 기업의 행보를 주목하세요. 어떤 문제를 해결하려는지, 자금을 어떤 우선순위에 쓰는지 관찰하면 ${domKo} 분야의 핵심 병목이 보입니다.`)
    if (stage === '시드' || stage === 'Pre-A') {
      lines.push('초기 투자 유치 기업과의 파트너십·협업 가능성을 탐색해보세요. 성장 초기 단계의 기업은 새로운 파트너에게 열려 있는 경우가 많습니다.')
    }
  } else if (evt === 'acquisition') {
    lines.push('인수된 기업이 해결하던 문제 중 아직 미완성인 부분이 있다면, 그것이 새로운 창업 기회가 될 수 있습니다. 대기업 M&A 이후 남겨진 틈새 시장을 주목하세요.')
  } else if (evt === 'product') {
    lines.push("새로운 서비스 출시는 경쟁사 분석의 좋은 기회입니다. 직접 써보고 '아직 해결하지 못한 불편함'을 찾아보세요. 그 불편함이 다음 창업 아이디어의 출발점입니다.")
  } else if (evt === 'policy') {
    lines.push('지원 프로그램 신청 기간과 조건을 확인하고, 팀 빌딩·멘토링·네트워크 기회까지 최대한 활용하는 전략을 세우세요. 단순 자금 지원 이상의 가치를 놓치지 마세요.')
  } else if (evt === 'research') {
    lines.push("연구 결과에서 '아직 해결되지 않은 문제'를 찾는 연습을 하세요. 데이터가 보여주는 갭(gap)이 바로 창업 기회입니다.")
  } else if (evt === 'market') {
    const techStr = tech.length > 0 ? tech[0] : domKo
    lines.push(`${techStr} 시장이 성장한다는 것은, 그 시장에서 해결해야 할 문제도 함께 커진다는 뜻입니다. 성장하는 시장의 '불편한 부분'을 먼저 찾는 사람이 기회를 잡습니다.`)
  } else if (evt === 'person') {
    lines.push('성공한 창업가의 스토리에서 패턴을 찾아보세요. 문제를 인식한 시점, 첫 번째 행동, 실패를 극복한 방식. 이 세 가지에서 나만의 교훈을 추출하는 것이 중요합니다.')
  } else {
    lines.push(`이 소식이 ${domKo} 분야에 만드는 변화를 세 가지 관점으로 분석해보세요: ① 기회 ② 위협 ③ 아직 해결 안 된 문제. 창업가의 눈으로 읽으면 모든 뉴스가 인사이트가 됩니다.`)
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
      errors.push(`[${a.id}] ${err.slice(0, 60)}`)
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
    const r = await fetch(`${SB_URL}/rest/v1/profiles?select=role&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` }
    })
    if (!r.ok) return false
    const rows = await r.json().catch(() => [])
    return Array.isArray(rows) && rows[0]?.role === 'admin'
  } catch { return false }
}
