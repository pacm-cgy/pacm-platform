/**
 * Insightship 자체 AI 요약 API
 * /api/self-ai-summarize
 * 
 * Python insightship_ai.py의 로직을 JS로 포팅
 * 완전 무료 — 외부 API 0원
 */
export const config = { runtime: 'edge' }

const CRON_SECRET = process.env.CRON_SECRET

// ── 한국어 불용어 ────────────────────────────────────────────
const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','때문','위해',
  '통해','대한','관련','관해','따른','있는','없는','되는','하는',
  '있다','없다','된다','한다','이다','있으며','되며','하며',
  '이번','지난','올해','작년','특히','또','더','가장','매우','모두',
  '약','총','전','후','당','각','제','본','해당',
])

// ── 창업 핵심 키워드 가중치 ──────────────────────────────────
const WEIGHTS = {
  '스타트업':2.0,'창업':2.0,'투자':1.8,'펀딩':1.8,'VC':1.8,
  '유니콘':2.5,'상장':1.7,'IPO':1.7,'매출':1.6,'성장':1.5,
  'AI':1.8,'인공지능':1.8,'플랫폼':1.5,'서비스':1.3,
  '청소년':2.5,'청년':1.8,'대학생':1.8,
  '억원':1.6,'조원':1.7,'시리즈':1.7,'라운드':1.6,
  '글로벌':1.5,'혁신':1.5,'기술':1.4,
}

// ── 용어 설명 사전 ───────────────────────────────────────────
const TERMS = {
  'IPO': 'IPO(기업공개, 주식시장에 처음 상장하는 것)',
  'VC': 'VC(벤처캐피털, 스타트업 전문 투자회사)',
  '시리즈A': '시리즈A(초기 대규모 투자 단계)',
  '시리즈B': '시리즈B(성장 단계 투자)',
  '시리즈C': '시리즈C(확장 단계 투자)',
  '유니콘': '유니콘(기업가치 1조원 이상 비상장 스타트업)',
  'SaaS': 'SaaS(인터넷으로 제공하는 소프트웨어 서비스)',
  'B2B': 'B2B(기업 간 거래)',
  'MVP': 'MVP(최소 기능 제품)',
  '엑셀러레이터': '엑셀러레이터(초기 스타트업 육성 기관)',
  '풀필먼트': '풀필먼트(보관·포장·배송 대행 물류 서비스)',
}

function cleanText(t) {
  if (!t) return ''
  return t.replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/g,' ')
    .replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim()
}

function splitSentences(text) {
  return text
    .replace(/([.!?])\s+/g,'$1\n')
    .replace(/([다요])\s+/g,'$1\n')
    .split('\n')
    .map(s=>s.trim())
    .filter(s=>s.length>20)
}

function tokenize(text) {
  const tokens = text.match(/[가-힣]+|[A-Za-z]+|[0-9]+[억조만원%]?/g) || []
  return tokens.filter(t => !STOPWORDS.has(t) && t.length >= 2)
}

function scoreSentences(sentences, titleTokens) {
  const docFreq = {}
  const sentToks = sentences.map(s => {
    const toks = new Set(tokenize(s))
    toks.forEach(t => { docFreq[t] = (docFreq[t]||0)+1 })
    return toks
  })
  const N = sentences.length
  return sentences.map((s, i) => {
    const toks = sentToks[i]
    if (!toks.size) return 0
    let score = 0
    toks.forEach(tok => {
      const tf = 1/toks.size
      const idf = Math.log((N+1)/(docFreq[tok]+1))
      const w = WEIGHTS[tok] || 1.0
      score += tf * idf * w
    })
    const titleOverlap = [...toks].filter(t=>titleTokens.includes(t)).length / toks.size
    const posBonus = 1 + (N-i)/(N*2)
    const lenBonus = s.length>=50&&s.length<=200 ? 1.0 : 0.7
    const numBonus = /\d+[억조만원%]/.test(s) ? 1.3 : 1.0
    return score * (1+titleOverlap) * posBonus * lenBonus * numBonus
  })
}

function applyTerms(text) {
  const used = new Set()
  for (const [term, expl] of Object.entries(TERMS)) {
    if (text.includes(term) && !used.has(term)) {
      text = text.replace(term, expl)
      used.add(term)
    }
  }
  return text
}

function selfSummarize(title, body) {
  title = cleanText(title)
  body  = cleanText(body) || title
  const sentences = splitSentences(body)
  if (!sentences.length) return body.slice(0,500)

  const titleToks = tokenize(title)
  const scores = scoreSentences(sentences, titleToks)
  const topk = Math.min(7, Math.max(3, Math.floor(sentences.length/3)))

  // 상위 문장 선택 (원래 순서 유지)
  const ranked = scores.map((s,i)=>({s,i}))
    .sort((a,b)=>b.s-a.s).slice(0,topk)
    .map(x=>x.i).sort((a,b)=>a-b)
  const core = ranked.map(i=>sentences[i]).join(' ')

  // 도입부
  const bodyToks = tokenize(body)
  const hasYouth = bodyToks.some(t=>['청소년','청년','학생'].includes(t))
  const hasInvest = bodyToks.some(t=>['투자','펀딩','시리즈'].includes(t))
  const intro = hasYouth ? '청소년 창업가들이 주목해야 할 소식입니다.'
    : hasInvest ? '투자 시장에서 눈길을 끄는 소식이 들어왔습니다.'
    : '창업 생태계에서 주목할 만한 소식입니다.'

  const conclusion = hasYouth
    ? '이번 소식은 창업을 꿈꾸는 청소년들에게 실질적인 참고가 될 것으로 보입니다.'
    : hasInvest
    ? '이번 투자 소식은 국내 스타트업 생태계의 활발한 성장세를 보여줍니다.'
    : '이번 사례는 창업을 준비하는 청소년들에게 도움이 될 것으로 기대됩니다.'

  const full = `${intro}\n\n${applyTerms(core)}\n\n${conclusion}`
  return full.length > 1200 ? full.slice(0,1197)+'...' : full
}

export default async function handler(req) {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({status:'ok',engine:'insightship-self-ai-v1'}),
      {headers:{'Content-Type':'application/json'}})
  }

  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`)
    return new Response(JSON.stringify({error:'Unauthorized'}),{status:401})

  let body
  try { body = await req.json() } catch { body = {} }

  const title   = body.title || ''
  const content = body.body || body.excerpt || ''

  if (!title) return new Response(JSON.stringify({error:'title required'}),{status:400})

  const summary = selfSummarize(title, content)

  return new Response(JSON.stringify({
    summary,
    engine: 'insightship-self-ai-v1',
    cost: 0,
    external_api: false,
  }), { headers: {'Content-Type':'application/json'} })
}
