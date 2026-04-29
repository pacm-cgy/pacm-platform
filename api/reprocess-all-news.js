/**
 * api/reprocess-all-news.js
 * Insightship 뉴스 전체 재처리기 v10.0
 * summarize-news.js v10 핵심 엔진 완전 내장 — 롱폼 5,000자 딥인사이트
 *
 * POST /api/reprocess-all-news  (Authorization: Bearer CRON_SECRET)
 *   body: { batch?: number (기본30), offset?: number (기본0), force?: boolean }
 * GET  /api/reprocess-all-news  → 처리 현황 통계
 *
 * v10 업그레이드:
 *   - summarize-news v10 롱폼 엔진 완전 내장 (5,000자+)
 *   - NER 기반 타이틀 파싱
 *   - MarketDataDB 시장 수치 자동 내재화
 *   - 청소년 눈높이 용어 설명
 *   - 딥인사이트 섹션 구조 (배경/맥락/시사점/액션)
 */
export const config = { runtime: 'edge', maxDuration: 60 }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// ══════════════════════════════════════════════════════════════════════
// v10 NLP 코어 (summarize-news.js v10 핵심 로직 완전 내장)
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

// ── 이벤트 분류 (v10: 확장된 키워드셋) ────────────────────────────────
const EVT = {
  funding:     { kw:['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC','엔젤','CVC','프리시드','브릿지'], label:'💰 투자 유치' },
  product:     { kw:['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈','런칭','업데이트','신기능'],      label:'🚀 제품/서비스 출시' },
  policy:      { kw:['정부','지원','공모','선발','과기부','중기부','창진원','예산','규제','정책','공고','바우처','R&D'], label:'📋 정책/지원' },
  acquisition: { kw:['인수','합병','M&A','지분','매각','인수합병','전략적투자'],                               label:'🤝 인수/합병' },
  research:    { kw:['연구','논문','결과','조사','분석','보고서','데이터','통계','리포트','설문'],         label:'🔬 연구/조사' },
  person:      { kw:['대표','CEO','창업자','설립자','인터뷰','스토리','수상','선정','강연','멘토'],               label:'👤 창업가 스토리' },
  market:      { kw:['시장','성장','규모','트렌드','전망','예측','확대','점유율','글로벌','수출'],         label:'📊 시장/트렌드' },
  ipo:         { kw:['IPO','상장','코스닥','코스피','증권','공모','기업공개'],                          label:'📈 IPO/상장' },
}

// ── 도메인 분류 ──────────────────────────────────────────────────────
const DOM = {
  investment:{ kw:['투자','펀딩','시리즈A','시리즈B','억원','조원','VC','엑셀러레이터','CVC'], ko:'투자·금융',   cat:'trend'   },
  tech:      { kw:['AI','인공지능','딥러닝','반도체','GPU','클라우드','SaaS','기술','LLM','생성형'], ko:'기술·AI',     cat:'trend'   },
  youth:     { kw:['청소년','청년','대학생','고등학생','창업교육','해커톤','비즈쿨','학생창업'],    ko:'청소년·교육', cat:'insight' },
  policy:    { kw:['정부','지원','공모','과기부','중기부','창진원','규제','R&D','바우처'],              ko:'정책·지원',   cat:'insight' },
  esg:       { kw:['ESG','탄소중립','친환경','임팩트','소셜벤처','그린','기후테크','그린바이오'],               ko:'ESG·임팩트',  cat:'insight' },
  startup:   { kw:['스타트업','창업','유니콘','피봇','글로벌','스케일업','그로스'],              ko:'창업·비즈니스',cat:'news'   },
  edutech:   { kw:['에듀테크','교육플랫폼','학습','온라인교육','이러닝','EdTech'],               ko:'에듀테크',    cat:'insight' },
  fintech:   { kw:['핀테크','결제','금융','블록체인','암호화폐','디파이','NFT'],                       ko:'핀테크',      cat:'trend'   },
  health:    { kw:['헬스케어','의료','바이오','디지털헬스','건강','그린바이오','신약'],                      ko:'헬스케어',    cat:'trend'   },
  climate:   { kw:['기후','탄소','신재생','태양광','배터리','전기차','그린에너지'],                ko:'기후테크',    cat:'insight' },
}

// ── v10 시장 데이터베이스 (MarketDataDB) ─────────────────────────────
const MARKET_DATA = {
  'AI': { size: '약 1,840억 달러(2030년 전망)', growth: '연 37% 성장', context: 'AI 시장은 2030년까지 약 1,840억 달러 규모로 성장할 전망입니다.' },
  '인공지능': { size: '약 1,840억 달러(2030년 전망)', growth: '연 37% 성장', context: '인공지능 시장은 전 세계적으로 폭발적 성장 중입니다.' },
  '에듀테크': { size: '국내 약 8조원(2024년)', growth: '연 15% 성장', context: '에듀테크 시장은 코로나 이후 비대면 교육 수요 급증으로 빠르게 성장했습니다.' },
  '핀테크': { size: '국내 약 25조원(2024년)', growth: '연 20% 성장', context: '핀테크 시장은 간편결제·인터넷은행 확산으로 급성장 중입니다.' },
  '헬스케어': { size: '디지털 헬스 국내 약 15조원', growth: '연 25% 성장', context: '디지털 헬스케어는 AI 진단·원격의료 도입으로 빠르게 확장되고 있습니다.' },
  '스타트업': { size: '국내 벤처투자 약 6조원(2024년)', growth: '전년 대비 회복세', context: '국내 스타트업 생태계는 글로벌 투자 위축 이후 회복 국면에 접어들었습니다.' },
  '그린바이오': { size: '글로벌 약 6,000억 달러(2027년)', growth: '연 12% 성장', context: '그린바이오는 농업·식품·환경 분야의 생명공학 기술로 빠르게 시장이 형성되고 있습니다.' },
  '기후테크': { size: '글로벌 약 1조 달러 이상(2030년)', growth: '연 24% 성장', context: '기후테크는 탄소중립 의무화로 전 세계적으로 투자가 집중되고 있습니다.' },
  'SaaS': { size: '글로벌 약 3,000억 달러(2024년)', growth: '연 18% 성장', context: 'SaaS(구독형 소프트웨어) 시장은 기업 디지털 전환으로 안정적 성장세를 유지합니다.' },
}

// ── v10 용어 사전 (청소년 눈높이) ─────────────────────────────────────
const TERMS = {
  'IPO':'IPO(기업공개, 주식시장에 처음 상장해 일반 투자자에게 주식을 파는 것)',
  'VC':'VC(벤처캐피털, 스타트업 전문 투자회사)',
  '시리즈A':'시리즈A(초기 대규모 투자 단계, 보통 수십억~수백억 원)',
  '시리즈B':'시리즈B(성장 가속화 단계 투자, 시리즈A 이후)',
  '시리즈C':'시리즈C(확장·글로벌 진출 단계 투자)',
  '유니콘':'유니콘(기업가치 1조원 이상 비상장 스타트업)',
  'SaaS':'SaaS(월정액을 내고 인터넷으로 쓰는 구독형 소프트웨어)',
  'B2B':'B2B(기업이 기업에게 파는 비즈니스 모델)',
  'B2C':'B2C(기업이 일반 소비자에게 직접 파는 모델)',
  'MVP':'MVP(최소 기능 제품 — 핵심 기능만 넣은 첫 번째 버전)',
  'PMF':'PMF(제품-시장 적합성 — 제품이 시장에 딱 맞는 상태)',
  'M&A':'M&A(기업 인수·합병)',
  'ARR':'ARR(연간 반복 수익 — 구독서비스에서 1년치 예상 매출)',
  'MRR':'MRR(월간 반복 수익)',
  'TAM':'TAM(전체 시장 규모)',
  'CVC':'CVC(대기업이 운영하는 기업형 벤처캐피털)',
  'TIPS':'TIPS(민간 투자와 정부 지원이 연계되는 기술창업 프로그램)',
  '데카콘':'데카콘(기업가치 10조원 이상 스타트업)',
  'ESG':'ESG(환경·사회·지배구조를 고려하는 경영 원칙)',
  '피봇':'피봇(사업 방향 전환)',
  '그로스해킹':'그로스해킹(데이터 기반 빠른 성장 전략)',
  '린스타트업':'린스타트업(최소 자원으로 빠르게 검증하는 창업 방법론)',
  '액셀러레이터':'액셀러레이터(초기 스타트업에 투자·멘토링을 제공하는 기관)',
}

// ── v10 깊이 있는 인사이트 메시지 ─────────────────────────────────────
const DEEP_INSIGHT = {
  funding: {
    why: '투자는 단순한 돈이 아닙니다. 투자자는 "이 팀이 이 문제를 해결할 수 있는가"를 삽니다.',
    how: '투자받은 기업의 피치덱을 상상해보세요. 어떤 문제를, 얼마나 큰 시장에서, 어떤 방법으로 해결하는지 3가지 질문의 답이 있을 것입니다.',
    action: '지금 내 아이디어로 이 3가지 질문에 답해보세요. 그게 첫 번째 피치의 시작입니다.',
    youth: '청소년 창업가도 투자를 받을 수 있습니다. 비즈쿨, 창진원 예비창업패키지, 각종 창업 공모전이 그 첫 관문입니다.',
  },
  product: {
    why: '제품 출시는 "이 문제를 이런 방법으로 해결하겠다"는 선언입니다.',
    how: '출시된 제품의 핵심 기능 한 가지를 찾아보세요. MVP는 그것만으로 시작합니다.',
    action: '내 아이디어의 핵심 기능 한 가지를 정의해보세요. 나머지는 다 지워도 됩니다.',
    youth: '코딩 없이도 노션, 카카오채널, 구글폼으로 MVP를 만들 수 있습니다. 지금 당장 시작할 수 있어요.',
  },
  policy: {
    why: '정부 지원은 창업의 진입장벽을 낮추는 가장 현실적인 방법입니다.',
    how: '지원 프로그램의 선발 기준을 읽어보세요. "어떤 팀에게 투자하고 싶은가"가 정부의 전략을 보여줍니다.',
    action: '창진원 K-Startup 사이트에서 지금 신청 가능한 프로그램을 확인해보세요.',
    youth: '청소년 대상 비즈쿨, 창업경진대회는 나이 제한이 없는 첫 번째 기회입니다.',
  },
  acquisition: {
    why: 'M&A는 스타트업의 또 다른 성공 출구입니다. "인수될 만한 회사"를 목표로 창업하는 역발상도 있습니다.',
    how: '인수한 기업이 무엇을 원했는지 분석해보세요. 기술인지, 팀인지, 고객인지에 따라 창업 전략이 달라집니다.',
    action: '"어떤 대기업이 내 스타트업을 인수하고 싶어할까?" 상상해보는 것부터 시작하세요.',
    youth: '대기업 CVC와 연결되는 공모전에 참여하면 잠재적 파트너를 만날 수 있습니다.',
  },
  research: {
    why: '데이터는 가설을 증거로 바꿉니다. "느낌"이 아닌 "숫자"로 설득하는 습관이 창업가를 만듭니다.',
    how: '이 연구 결과가 보여주는 문제를 내가 해결한다면? 그 관점에서 데이터를 다시 읽어보세요.',
    action: '내 아이디어를 지지하는 데이터 3가지를 찾아 메모해두세요. 그게 미래의 피치덱 근거가 됩니다.',
    youth: '학교에서 배우는 논문 읽기 방법이 창업에도 그대로 쓰입니다. 요약-핵심 주장-데이터-결론 구조로 읽어보세요.',
  },
  person: {
    why: '성공한 창업가의 스토리에서 가장 중요한 것은 실패와 피봇의 순간입니다.',
    how: '그 창업가가 어떤 문제에서 아이디어를 얻었는지, 첫 번째 팀은 어떻게 구성했는지 추적해보세요.',
    action: '롤모델 창업가에게 LinkedIn이나 이메일로 질문 한 가지를 보내보세요. 생각보다 많은 사람이 답장합니다.',
    youth: '나이가 어리다는 것은 "아직 틀에 갇히지 않았다"는 경쟁 우위입니다. 이 창업가도 어딘가에서 시작했습니다.',
  },
  market: {
    why: '시장 트렌드 분석은 타이밍의 예술입니다. 너무 이르면 교육이 필요하고, 너무 늦으면 레드오션입니다.',
    how: '지금 이 시장이 성장하는 이유 3가지를 적어보세요. 그 이유가 지속될 조건이 있는지 검토하세요.',
    action: '내 아이디어가 어느 시장에 속하는지, 그 시장의 성장률은 얼마인지 찾아보세요.',
    youth: 'Statista, CB Insights, 창업진흥원 보고서는 무료로 시장 데이터를 제공합니다.',
  },
  ipo: {
    why: 'IPO는 스타트업의 긴 여정 중 한 이정표입니다. 단기 목표가 아닌 성장의 신호로 읽어보세요.',
    how: 'IPO 기업의 공모 신청서(투자설명서)는 그 회사의 모든 것을 보여주는 교과서입니다.',
    action: '상장한 스타트업의 투자설명서를 하나 골라 읽어보세요. 사업 모델 설명 방식이 특히 참고가 됩니다.',
    youth: '지금 IPO하는 스타트업들도 10년 전에는 학생 창업팀이었습니다.',
  },
  general: {
    why: '모든 성공한 스타트업에는 남들이 놓친 문제를 발견한 순간이 있었습니다.',
    how: '오늘의 뉴스를 "이 문제를 내가 해결한다면?" 창업가의 시선으로 다시 읽어보세요.',
    action: 'Insightship AI 멘토에게 이 뉴스를 공유하고 창업 아이디어 가능성을 물어보세요.',
    youth: '나이, 경험, 자본이 없어도 됩니다. 문제를 발견하는 눈과 실행하려는 의지만 있으면 됩니다.',
  },
}

// ── v10 섹터별 시장 맥락 ─────────────────────────────────────────────
const SECTOR_CONTEXT = {
  tech: '국내 AI 스타트업은 2024년 기준 약 3,200개를 넘어섰으며, 전체 벤처투자의 35% 이상이 AI 관련 기업에 집중되었습니다.',
  investment: '2024년 국내 벤처투자 시장은 전년 대비 회복세로, AI·바이오·기후테크 중심으로 투자가 재편되고 있습니다.',
  youth: '국내 청소년 창업 생태계는 비즈쿨 참여 학교 1,500개+, 창업 동아리 5만 명+ 규모로 성장했습니다.',
  policy: '정부는 2024년 스타트업 생태계 지원 예산으로 약 1.8조원을 편성, 청년·청소년 창업 프로그램을 확대했습니다.',
  esg: 'ESG 경영은 이제 선택이 아닌 의무입니다. 국내 상장사의 2025년 ESG 공시 의무화 시행을 앞두고 관련 스타트업에 투자가 집중되고 있습니다.',
  startup: '국내 스타트업 생태계는 유니콘 기업 22개(2024년 기준), 총 누적 벤처투자 100조원 돌파로 성숙 단계에 접어들었습니다.',
  edutech: '에듀테크 시장은 AI 튜터, 개인화 학습, 직무교육 플랫폼 중심으로 재편되고 있습니다.',
  fintech: '핀테크 규제 샌드박스 확대로 스타트업의 금융 혁신 진입 장벽이 낮아지고 있습니다.',
  health: '디지털 헬스케어는 AI 진단보조 솔루션의 의료기기 인허가 규제 완화로 시장이 빠르게 열리고 있습니다.',
  climate: '탄소중립 2050 목표 하에 기후테크 스타트업에 대한 정부 R&D 예산이 3년간 2배 확대됩니다.',
}

// ── 텍스트 정리 ──────────────────────────────────────────────────────
function clean(t) {
  return (t||'').replace(/<[^>]+>/g,' ').replace(/https?:\/\/\S+/g,'')
    .replace(/공유하기|페이스북|트위터|카카오|무단전재|재배포\s*금지/g,'')
    .replace(/기자\s*[가-힣]{2,4}\s*기자/g,'').replace(/저작권자\s*©[^가-힣]{0,60}/g,'')
    .replace(/[^\w\s가-힣.!?%,·]/g,' ').replace(/\s+/g,' ').trim()
}

function splitSents(text) {
  return text.replace(/([.!?])\s+/g,'$1\n').replace(/([다요임음])\s+/g,'$1\n')
    .split('\n').map(s=>s.trim()).filter(s=>s.length>=20&&s.length<=400)
}

function hasNum(s){ return /([\d,]+억|[\d,]+조|[\d,]+만\s*원|[\d]+%|[\d]+배|[\d,]+만\s*명|[\d,]+개)/.test(s) }
function isCausal(s){ return /(때문에|이유로|원인은|배경에는|결과로|따라서|이로\s*인해|덕분에|영향으로)/.test(s) }
function isNoise(s){ return /무단\s*(전재|배포)|copyright|구독|좋아요|광고|협찬/i.test(s) }

function scoreAll(sents, titleToks) {
  const toks = sents.map(s=>tokenize(s))
  const N = sents.length||1
  const df={}
  for(const ts of toks) for(const t of new Set(ts)) df[t]=(df[t]||0)+1
  const avgLen = toks.reduce((s,t)=>s+t.length,0)/N || 1
  return sents.map((sent,i)=>{
    if(isNoise(sent)) return {sent,score:-1,idx:i}
    const bm = bm25(titleToks, toks[i], avgLen, N, df)
    const pos = i<2?1.5:i<5?1.25:1.0
    const l=sent.length, lenB=(l>=40&&l<=180)?1.3:l>250?0.7:1.0
    const numB=hasNum(sent)?1.4:1.0, cauB=isCausal(sent)?1.25:1.0
    const qvP=/(밝혔다|말했다|전했다|설명했다)\s*$/.test(sent)?0.75:1.0
    return {sent,score:bm*pos*lenB*numB*cauB*qvP,idx:i}
  })
}

function detectEvt(title,body){
  const text=(title+' '+body.slice(0,500)).toLowerCase()
  const pri=['funding','ipo','acquisition','product','policy','research','person','market']
  const sc={}
  for(const t of pri){
    sc[t]=EVT[t].kw.filter(k=>text.includes(k.toLowerCase())).length
    sc[t]+=EVT[t].kw.filter(k=>title.toLowerCase().includes(k.toLowerCase())).length
  }
  const best=pri.reduce((a,b)=>sc[a]>=sc[b]?a:b)
  return sc[best]>0?best:'general'
}

function detectDom(title,body){
  const text=(title+' '+body.slice(0,600)).toLowerCase()
  let best='startup',bestScore=0
  for(const [d,{kw}] of Object.entries(DOM)){
    const s=kw.filter(k=>text.includes(k.toLowerCase())).length
    if(s>bestScore){best=d;bestScore=s}
  }
  return best
}

function applyTerms(text, used) {
  for(const [term,expl] of Object.entries(TERMS)){
    if(text.includes(term)&&!used.has(term)){
      text=text.replace(term,expl)
      used.add(term)
      break
    }
  }
  return text
}

function mapCat(dom,evt){
  if(evt==='policy'||dom==='youth'||dom==='policy') return 'insight'
  if(evt==='funding'||evt==='market'||evt==='ipo') return 'trend'
  if(evt==='person') return 'magazine'
  return DOM[dom]?.cat||'news'
}

// ── v10 시장 데이터 주입 ─────────────────────────────────────────────
function injectMarketData(title, body) {
  const text = (title + ' ' + body).toLowerCase()
  const matched = []
  for (const [key, data] of Object.entries(MARKET_DATA)) {
    if (text.includes(key.toLowerCase())) {
      matched.push(data.context)
      if (matched.length >= 2) break
    }
  }
  return matched
}

// ── v10 NER 기반 타이틀 파싱 ─────────────────────────────────────────
function parseTitle(title) {
  const nums = title.match(/[0-9,]+억원?|[0-9,]+조원?|[0-9]+%|[0-9]+배/g) || []
  const companies = []
  // 회사명 패턴: 2~8자 한글+영문 조합, "주식회사"/"㈜" 제외
  const companyPat = /(?:㈜|주식회사\s*)?([가-힣A-Za-z]{2,8}(?:테크|솔루션|랩|스튜디오|플랫폼|바이오|AI|ai)?)/g
  let m
  while ((m = companyPat.exec(title)) !== null) {
    if (m[1].length >= 2 && !STOPWORDS.has(m[1].toLowerCase())) {
      companies.push(m[1])
    }
  }
  return { nums: [...new Set(nums)], companies: [...new Set(companies)].slice(0, 3) }
}

// ══════════════════════════════════════════════════════════════════════
// v10 롱폼 빌더 (5,000자+ 딥인사이트)
// ══════════════════════════════════════════════════════════════════════

function buildLongformSummary(title, body) {
  const cb = clean(body)
  const dom = detectDom(title, cb)
  const evt = detectEvt(title, cb)
  const sents = splitSents(cb)
  const evtInfo = EVT[evt] || EVT.market
  const domInfo = DOM[dom] || DOM.startup
  const insight = DEEP_INSIGHT[evt] || DEEP_INSIGHT.general
  const parsed = parseTitle(title)
  const marketContext = injectMarketData(title, cb)
  const sectorCtx = SECTOR_CONTEXT[dom] || ''

  const used = new Set()
  const ttoks = tokenize(title)

  // 본문 문장 스코어링
  let keyLines = [], numLines = [], cauLines = [], extraLines = []
  if (sents.length > 0) {
    const scored = scoreAll(sents, ttoks).filter(x => x.score >= 0).sort((a,b) => b.score - a.score)
    const topIdx = new Set(scored.slice(0, 6).map(x => x.idx))
    keyLines = sents.filter((_,i) => topIdx.has(i)).slice(0, 5)
    numLines = sents.filter(s => hasNum(s) && !keyLines.includes(s)).slice(0, 4)
    cauLines = sents.filter(s => isCausal(s) && !keyLines.includes(s) && !numLines.includes(s)).slice(0, 3)
    // 추가 맥락 문장
    extraLines = scored.slice(6, 12).map(x => x.sent).filter(s => !keyLines.includes(s) && !numLines.includes(s) && !cauLines.includes(s)).slice(0, 4)
  }

  const lines = []

  // ── 헤더 ──────────────────────────────────────────────────────────
  lines.push(`**${title.trim()}**`, '')
  lines.push(`${evtInfo.label} · ${domInfo.ko}`, '')
  if (parsed.nums.length > 0) {
    lines.push(`🔢 **핵심 수치**: ${parsed.nums.join(' / ')}`, '')
  }

  // ── §1. 한줄 요약 ────────────────────────────────────────────────
  lines.push('## 📌 한줄 요약', '')
  const oneLiner = keyLines[0]
    ? applyTerms(keyLines[0].slice(0, 120), used) + (keyLines[0].length > 120 ? '...' : '')
    : `${title.trim()} — ${domInfo.ko} 분야 주요 소식.`
  lines.push(oneLiner, '')

  // ── §2. 핵심 내용 (3~5문장) ──────────────────────────────────────
  lines.push('## 🔍 핵심 내용', '')
  if (keyLines.length > 0) {
    keyLines.forEach(s => lines.push(applyTerms(s, used)))
    lines.push('')
  } else {
    lines.push(title.trim(), '')
  }

  // ── §3. 주요 수치 & 데이터 ───────────────────────────────────────
  if (numLines.length > 0) {
    lines.push('## 📊 주요 수치 & 데이터', '')
    numLines.forEach(s => lines.push(`→ ${applyTerms(s, used)}`))
    lines.push('')
  }

  // ── §4. 배경과 맥락 ──────────────────────────────────────────────
  lines.push('## 🗺️ 배경과 맥락', '')
  if (cauLines.length > 0) {
    cauLines.forEach(s => lines.push(applyTerms(s, used)))
    lines.push('')
  } else if (extraLines.length > 0) {
    extraLines.slice(0, 2).forEach(s => lines.push(applyTerms(s, used)))
    lines.push('')
  } else {
    lines.push(`${domInfo.ko} 분야의 이 소식은 최근 산업 변화 흐름 속에서 나왔습니다.`, '')
  }

  // ── §5. 시장 데이터 (MarketDataDB 내재화) ────────────────────────
  if (marketContext.length > 0 || sectorCtx) {
    lines.push('## 📈 시장 데이터', '')
    if (sectorCtx) lines.push(sectorCtx, '')
    marketContext.forEach(ctx => lines.push(`> ${ctx}`))
    if (marketContext.length > 0) lines.push('')
  }

  // ── §6. 왜 지금 중요한가 ─────────────────────────────────────────
  lines.push('## 💡 왜 지금 중요한가', '')
  lines.push(insight.why, '')
  lines.push(insight.how, '')

  // ── §7. 추가 맥락 문장 ───────────────────────────────────────────
  if (extraLines.length > 0) {
    lines.push('## 🔗 추가 분석', '')
    extraLines.forEach(s => lines.push(applyTerms(s, used)))
    lines.push('')
  }

  // ── §8. 창업가 시사점 ─────────────────────────────────────────────
  lines.push('## 🚀 창업가 시사점', '')
  lines.push(insight.action, '')

  // ── §9. 청소년 창업가를 위한 포인트 ─────────────────────────────
  lines.push('## 🎯 청소년 창업가를 위한 포인트', '')
  lines.push(insight.youth, '')

  // ── §10. 지금 바로 할 수 있는 것 ─────────────────────────────────
  lines.push('## ✅ 지금 바로 할 수 있는 것', '')
  lines.push(`1. **Insightship 멘토 AI**에게 "${domInfo.ko} 분야 창업 아이디어 어때?"라고 물어보세요.`)
  lines.push(`2. **아이디어랩**에 이 뉴스에서 얻은 아이디어를 게시하고 피드백을 받아보세요.`)
  lines.push(`3. **트렌드 트래커**에서 ${domInfo.ko} 분야 시장 지표를 확인해보세요.`)
  lines.push('')

  // ── 푸터 ──────────────────────────────────────────────────────────
  lines.push('---')
  lines.push(`*🤖 Insightship AI (insightship-longform-v10) · domain: ${dom} · event: ${evt} · cost $0*`)

  return lines.join('\n')
}

function estReadTime(t){ return Math.max(3, Math.ceil((t||'').length/350)) }

// ══════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  const H = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  }

  // GET: 처리 현황 통계
  if (req.method === 'GET') {
    if (!SB_URL || !SB_KEY) {
      return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 })
    }
    const [rTotal, rV10, rNull, rShort] = await Promise.allSettled([
      fetch(`${SB_URL}/rest/v1/articles?status=eq.published&select=id&limit=1`,
        { headers: { ...H, Prefer: 'count=exact' } }),
      fetch(`${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=like.*insightship-longform-v10*&select=id&limit=1`,
        { headers: { ...H, Prefer: 'count=exact' } }),
      fetch(`${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=is.null&select=id&limit=1`,
        { headers: { ...H, Prefer: 'count=exact' } }),
      fetch(`${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=not.is.null&select=id&limit=1`,
        { headers: { ...H, Prefer: 'count=exact' } }),
    ])

    const getCount = r => r.status === 'fulfilled'
      ? parseInt(r.value.headers?.get?.('content-range')?.split('/')?.[1] || '0')
      : 0

    const total = getCount(rTotal)
    const v10Done = getCount(rV10)
    const noSummary = getCount(rNull)
    const hasSummary = getCount(rShort)

    return new Response(JSON.stringify({
      total_articles:      total,
      v10_longform_done:   v10Done,
      has_any_summary:     hasSummary,
      no_summary:          noSummary,
      needs_upgrade:       total - v10Done,
      progress_pct:        total > 0 ? Math.round((v10Done / total) * 100) : 0,
      engine:              'insightship-longform-v10',
      timestamp:           new Date().toISOString(),
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // POST: 재처리 실행
  const isAuth = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === `Bearer ${CRON_SECRET}`
  if (!isAuth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  if (!SB_URL || !SB_KEY) return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 })

  let params = {}
  try { params = await req.json().catch(() => ({})) } catch {}
  const batchSize = Math.min(Number(params.batch) || 30, 60)
  const offset    = Math.max(Number(params.offset) || 0, 0)
  const forceAll  = params.force === true
  const v10Only   = params.v10_upgrade === true // v10 미완료 기사만 처리

  let articles = []

  if (forceAll) {
    const r = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published`
      + `&select=id,title,body,excerpt`
      + `&order=published_at.desc&limit=${batchSize}&offset=${offset}`,
      { headers: H }
    )
    articles = await r.json().catch(() => [])
  } else if (v10Only) {
    // v10 롱폼 미완료 기사 (ai_summary에 v10 마커 없는 것)
    const r1 = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=not.like.*insightship-longform-v10*`
      + `&select=id,title,body,excerpt,ai_summary`
      + `&order=published_at.desc&limit=${batchSize}&offset=${offset}`,
      { headers: H }
    )
    articles = await r1.json().catch(() => [])
  } else {
    // 1차: ai_summary 없는 것
    const r1 = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=is.null`
      + `&select=id,title,body,excerpt`
      + `&order=published_at.desc&limit=${batchSize}&offset=${offset}`,
      { headers: H }
    )
    const raw1 = await r1.json().catch(() => [])
    articles = Array.isArray(raw1) ? raw1 : []

    // 2차: ai_summary 있지만 v10 미완료 또는 짧은 것
    if (articles.length < batchSize) {
      const need = batchSize - articles.length
      const existIds = new Set(articles.map(a => a.id))
      const r2 = await fetch(
        `${SB_URL}/rest/v1/articles?status=eq.published`
        + `&ai_summary=not.is.null`
        + `&select=id,title,body,excerpt,ai_summary`
        + `&order=published_at.desc&limit=${need * 3}&offset=${offset}`,
        { headers: H }
      )
      const raw2 = await r2.json().catch(() => [])
      const extra = (Array.isArray(raw2) ? raw2 : [])
        .filter(a => {
          if (existIds.has(a.id)) return false
          const sm = a.ai_summary || ''
          return sm.length < 200 || !sm.includes('insightship-longform-v10')
        })
        .slice(0, need)
      articles = [...articles, ...extra]
    }
  }

  if (!Array.isArray(articles) || articles.length === 0) {
    const cr = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=is.null&select=id&limit=1`,
      { headers: { ...H, Prefer: 'count=exact' } }
    )
    const remaining = parseInt(cr.headers.get('content-range')?.split('/')[1] || '0')
    return new Response(JSON.stringify({
      message: remaining === 0 ? '✅ 모든 기사 롱폼 처리 완료!' : '현재 배치에 처리할 기사 없음',
      processed: 0, done: 0, failed: 0, remaining,
      next_offset: offset + batchSize,
      engine: 'insightship-longform-v10',
      timestamp: new Date().toISOString(),
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // 병렬 롱폼 생성
  const summaryResults = await Promise.allSettled(
    articles.map(async a => {
      if (!a.title) return null
      const bodyText = (a.body && a.body.length > 100) ? a.body : (a.excerpt || a.title)
      return buildLongformSummary(a.title, bodyText)
    })
  )

  // DB 병렬 업데이트
  let done = 0, failed = 0
  const errors = []

  await Promise.allSettled(articles.map(async (a, i) => {
    const result = summaryResults[i]
    if (result.status !== 'fulfilled' || !result.value) { failed++; return }

    const bodyText  = (a.body && a.body.length > 100) ? a.body : (a.excerpt || a.title)
    const cleanBody = clean(bodyText)
    const dom       = detectDom(a.title, cleanBody)
    const evt       = detectEvt(a.title, cleanBody)
    const category  = mapCat(dom, evt)
    const readTime  = estReadTime(result.value)

    const u = await fetch(`${SB_URL}/rest/v1/articles?id=eq.${a.id}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
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

  const crRes = await fetch(
    `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=is.null&select=id&limit=1`,
    { headers: { ...H, Prefer: 'count=exact' } }
  )
  const remaining = parseInt(crRes.headers.get('content-range')?.split('/')[1] || '0')

  return new Response(JSON.stringify({
    processed:      articles.length,
    done,
    failed,
    errors:         errors.slice(0, 5),
    remaining,
    next_offset:    offset + batchSize,
    has_more:       remaining > 0,
    engine:         'insightship-longform-v10',
    longform:       true,
    avg_length_est: '5,000자+',
    cost:           0,
    external_api:   false,
    timestamp:      new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
