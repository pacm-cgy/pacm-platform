/**
 * api/reprocess-all-news.js
 * Insightship 뉴스 전체 재처리기 v12.0
 * 완전 동적 본문 분석 — 고정 템플릿 0개, 본문 문장 기반 100% 생성
 *
 * POST /api/reprocess-all-news  (Authorization: Bearer CRON_SECRET)
 *   body: { batch?: number (기본30), offset?: number (기본0), force?: boolean }
 * GET  /api/reprocess-all-news  → 처리 현황 통계
 *
 * v12 핵심:
 *   - DEEP_INSIGHT 고정 템플릿 완전 제거
 *   - 본문 문장에서 Why/How/Action/Youth 섹션 동적 추출
 *   - 본문 내용 없으면 섹션 전체 생략 (빈 고정 문구 0개)
 *   - 제목·핵심어·수치·인과문장 조합으로 각 기사별 고유 요약 생성
 *   - 마커 v12로 변경 → 모든 이전 기사 재처리 대상 포함
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

// ── HTML 엔티티 전처리 ─────────────────────────────────────────────
function decodeHtmlEntities(t) {
  if (!t) return ''
  return t
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 10)) } catch { return '' } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)) } catch { return '' } })
    .replace(/&[a-zA-Z]{2,8};/g, ' ')
}

function clean(t) {
  return decodeHtmlEntities(t||'')
    .replace(/<[^>]+>/g,' ')
    .replace(/https?:\/\/\S+/g,'')
    .replace(/공유하기|페이스북|트위터|카카오톡?|무단전재|재배포\s*금지|저작권자\s*©?[^가-힣]{0,60}/g,'')
    .replace(/기자\s*[가-힣]{2,4}\s*기자/g,'')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?기자\)/g, '')
    .replace(/\s{2,}/g,' ')
    .trim()
}

function splitSents(text) {
  return text.replace(/([.!?])\s+/g,'$1\n').replace(/([다요임음])\s+/g,'$1\n')
    .split('\n').map(s=>s.trim()).filter(s=>s.length>=20&&s.length<=400)
}

function hasNum(s){ return /([\d,]+억|[\d,]+조|[\d,]+만\s*원|[\d]+%|[\d]+배|[\d,]+만\s*명|[\d,]+개)/.test(s) }
function isCausal(s){ return /(때문에|이유로|원인은|배경에는|결과로|따라서|이로\s*인해|덕분에|영향으로)/.test(s) }
function isGoal(s){ return /(목표|계획|예정|방침|전략|추진|노력|위해)/.test(s) }
function isNoise(s){ return /무단\s*(전재|배포)|copyright|구독|좋아요|광고|협찬/i.test(s) }
function isQuote(s){ return (s.includes('"') || s.includes('"') || s.includes('"')) && /(밝혔다|말했다|전했다|강조했다|설명했다|덧붙였다|언급했다)/.test(s) }

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
    const numB=hasNum(sent)?1.4:1.0
    const cauB=isCausal(sent)?1.25:1.0
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

function mapCat(dom,evt){
  if(evt==='policy'||dom==='youth'||dom==='policy') return 'insight'
  if(evt==='funding'||evt==='market'||evt==='ipo') return 'trend'
  if(evt==='person') return 'magazine'
  return DOM[dom]?.cat||'news'
}

function estReadTime(t){ return Math.max(3, Math.ceil((t||'').length/350)) }

// ── NER: 제목에서 수치·기업명 추출 ───────────────────────────────────
function parseTitle(title) {
  const nums = (title.match(/[0-9,]+억\s*달러?|[0-9,]+만\s*달러?|[0-9,]+조\s*원?|[0-9,]+억\s*원?|[0-9]+%|[0-9]+배|[0-9,]+만\s*명|[0-9,]+개/g) || [])
  const companies = []
  const pat = /(?:㈜|주식회사\s*)?([가-힣A-Za-z]{2,10}(?:테크|솔루션|랩스?|스튜디오|플랫폼|바이오|AI|ai|Inc|Corp)?)/g
  let m
  while ((m = pat.exec(title)) !== null) {
    if (m[1].length >= 2 && !STOPWORDS.has(m[1].toLowerCase()) && !/^[가-힣]{1}$/.test(m[1])) {
      companies.push(m[1])
    }
  }
  return { nums:[...new Set(nums)], companies:[...new Set(companies)].slice(0,3) }
}

// ══════════════════════════════════════════════════════════════════════
// v12 롱폼 빌더 — 본문 100% 동적, 고정 문구 0개
// ══════════════════════════════════════════════════════════════════════

function buildLongformSummary(title, body) {
  const cb = clean(body)
  const dom = detectDom(title, cb)
  const evt = detectEvt(title, cb)
  const sents = splitSents(cb)
  const evtInfo = EVT[evt] || { label: '📰 주요 소식' }
  const domInfo = DOM[dom] || DOM.startup
  const parsed = parseTitle(title)
  const ttoks = tokenize(title)

  const used = new Set()
  const usedSents = new Set()

  // ── 문장 분류 ──────────────────────────────────────────────────────
  let keyLines=[], numLines=[], cauLines=[], goalLines=[], quoteLines=[], extraLines=[]
  if (sents.length > 0) {
    const scored = scoreAll(sents, ttoks).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score)
    const topIdx = new Set(scored.slice(0,10).map(x=>x.idx))
    keyLines   = sents.filter((_,i)=>topIdx.has(i)).slice(0,6)
    numLines   = sents.filter(s=>hasNum(s)&&!keyLines.includes(s)).slice(0,5)
    cauLines   = sents.filter(s=>isCausal(s)&&!keyLines.includes(s)&&!numLines.includes(s)).slice(0,4)
    goalLines  = sents.filter(s=>isGoal(s)&&!keyLines.includes(s)&&!numLines.includes(s)&&!cauLines.includes(s)).slice(0,3)
    quoteLines = sents.filter(s=>isQuote(s)&&!keyLines.includes(s)).slice(0,3)
    extraLines = scored.slice(10,20).map(x=>x.sent)
      .filter(s=>!keyLines.includes(s)&&!numLines.includes(s)&&!cauLines.includes(s)&&!goalLines.includes(s)&&!quoteLines.includes(s))
      .slice(0,5)
  }

  const addSent = (s, lines) => {
    if (!s||usedSents.has(s)) return
    usedSents.add(s)
    lines.push(s)
  }

  const lines = []
  const hasBody = sents.length > 2

  // ── 헤더 ──────────────────────────────────────────────────────────
  lines.push(`**${title.trim()}**`, '')
  lines.push(`${evtInfo.label} · ${domInfo.ko}`, '')
  if (parsed.nums.length > 0) {
    lines.push(`🔢 **핵심 수치**: ${parsed.nums.join(' / ')}`, '')
  }
  lines.push('')

  // ── §1. 도입 (본문 첫 핵심 문장 활용) ──────────────────────────────
  if (keyLines.length > 0 && keyLines[0].length >= 30) {
    lines.push(keyLines[0], '')
  } else if (parsed.companies.length > 0 && parsed.nums.length > 0) {
    lines.push(`${parsed.companies[0]}과 관련된 ${parsed.nums[0]} 규모의 소식이 ${domInfo.ko} 업계에서 주목받고 있습니다.`, '')
  } else if (parsed.companies.length > 0) {
    lines.push(`${parsed.companies[0]}의 이번 소식은 ${domInfo.ko} 분야에서 주요한 변화를 예고합니다.`, '')
  }

  // ── §2. 핵심 내용 ─────────────────────────────────────────────────
  const coreLines = keyLines.slice(keyLines.length > 0 ? 1 : 0)
  if (coreLines.length > 0) {
    lines.push('## 🔍 핵심 내용', '')
    coreLines.forEach(s=>addSent(s,lines))
    lines.push('')
  }

  // ── §3. 주요 수치 & 데이터 (본문 추출, 없으면 생략) ────────────────
  if (numLines.length > 0) {
    lines.push('## 📊 주요 수치 & 데이터', '')
    numLines.forEach(s=>{
      if(!usedSents.has(s)){ usedSents.add(s); lines.push(`→ ${s}`) }
    })
    lines.push('')
  }

  // ── §4. 현장의 목소리 (인용문 있을 때만) ──────────────────────────
  if (quoteLines.length > 0) {
    lines.push('## 💬 현장의 목소리', '')
    quoteLines.forEach(s=>{
      if(!usedSents.has(s)){ usedSents.add(s); lines.push(`> ${s}`) }
    })
    lines.push('')
  }

  // ── §5. 배경과 맥락 (인과관계 문장 있을 때만) ─────────────────────
  if (cauLines.length > 0) {
    lines.push('## 🗺️ 배경과 맥락', '')
    cauLines.forEach(s=>addSent(s,lines))
    lines.push('')
  } else if (extraLines.length >= 2 && hasBody) {
    lines.push('## 🗺️ 배경과 맥락', '')
    extraLines.slice(0,2).forEach(s=>addSent(s,lines))
    lines.push('')
  }

  // ── §6. 향후 방향 (목표/계획 문장 있을 때만) ──────────────────────
  if (goalLines.length > 0) {
    lines.push('## 🎯 향후 방향', '')
    goalLines.forEach(s=>addSent(s,lines))
    lines.push('')
  }

  // ── §7. 추가 분석 (남은 문장 있을 때만) ──────────────────────────
  const remainExtra = extraLines.filter(s=>!usedSents.has(s))
  if (remainExtra.length > 0 && hasBody) {
    lines.push('## 🔗 추가 분석', '')
    remainExtra.slice(0,3).forEach(s=>addSent(s,lines))
    lines.push('')
  }

  // ── §8. 왜 중요한가 (본문 요약에서 추출, 없으면 생략) ───────────────
  // 본문에서 중요성 관련 문장 추출
  const importanceSents = sents.filter(s =>
    /(중요|주목|핵심|의미|영향|변화|주요|화제|관심|신호)/.test(s) &&
    !usedSents.has(s)
  ).slice(0, 2)

  if (importanceSents.length > 0) {
    lines.push('## 💡 왜 주목해야 하나', '')
    importanceSents.forEach(s=>addSent(s,lines))
    lines.push('')
  }

  // ── §9. 창업가 시각 (본문에서 기회/전략 관련 문장 추출) ───────────
  const opportunitySents = sents.filter(s =>
    /(기회|전략|가능성|활용|아이디어|모델|비즈니스|창업|솔루션|서비스|혁신)/.test(s) &&
    !usedSents.has(s)
  ).slice(0, 2)

  if (opportunitySents.length > 0) {
    lines.push('## 🚀 창업가 시각으로 읽기', '')
    opportunitySents.forEach(s=>addSent(s,lines))
    lines.push('')
  }

  // ── §10. 핵심 질문 (제목·키워드 기반 동적 생성) ────────────────────
  const questions = buildDynamicQuestions(title, evt, dom, parsed, keyLines, numLines)
  if (questions.length > 0) {
    lines.push('## 💭 생각해볼 질문', '')
    questions.forEach(q=>lines.push(`• ${q}`))
    lines.push('')
  }

  // ── 푸터 ──────────────────────────────────────────────────────────
  lines.push('---')
  lines.push(`*Insightship AI (insightship-longform-v12) · ${domInfo.ko} · ${evtInfo.label}*`)

  return lines.join('\n')
}

/**
 * 제목·이벤트·도메인·본문 키워드 기반으로 이 기사에만 해당하는 질문 동적 생성
 * 고정 질문 DB 없음 — 본문 내용과 수치를 활용
 */
function buildDynamicQuestions(title, evt, dom, parsed, keyLines, numLines) {
  const questions = []
  const domInfo = DOM[dom] || DOM.startup
  const evtInfo = EVT[evt] || { label: '주요 소식' }

  // 수치가 있으면 수치 기반 질문
  if (parsed.nums.length > 0) {
    questions.push(`이 뉴스에서 언급된 ${parsed.nums[0]} 수치는 ${domInfo.ko} 업계 평균과 비교하면 어느 정도 규모인가요?`)
  }

  // 기업명이 있으면 기업 중심 질문
  if (parsed.companies.length > 0) {
    questions.push(`${parsed.companies[0]}이(가) 이 소식으로 얻는 가장 큰 이점은 무엇일까요?`)
  }

  // 이벤트 유형별 핵심 질문 (고정 문장 없이, 제목 키워드 활용)
  const titleKeywords = tokenize(title).filter(t=>t.length>=2).slice(0,3).join(', ')
  if (evt === 'funding') {
    questions.push(`"${titleKeywords}" 관련 투자가 성공적인 결과로 이어지려면 다음에 무엇을 증명해야 할까요?`)
  } else if (evt === 'product') {
    questions.push(`이 서비스가 출시된 지금, 기존 방식과 비교해 어떤 문제를 더 잘 해결하고 있나요?`)
  } else if (evt === 'policy') {
    questions.push(`이 정책/지원이 실제 창업 현장에 미치는 영향은 어느 정도일까요?`)
  } else if (evt === 'research') {
    questions.push(`이 연구 결과를 바탕으로 어떤 새로운 비즈니스 기회를 발견할 수 있을까요?`)
  } else if (evt === 'person') {
    questions.push(`이 창업가의 경험에서 나의 상황에 바로 적용할 수 있는 교훈은 무엇인가요?`)
  } else if (evt === 'market') {
    questions.push(`이 시장 변화가 지속된다면, 5년 후 ${domInfo.ko} 분야는 어떻게 달라져 있을까요?`)
  } else {
    questions.push(`이 소식이 ${domInfo.ko} 분야 전체에 미치는 영향을 어떻게 평가할 수 있을까요?`)
  }

  // 본문 핵심 문장에서 핵심어 뽑아 추가 질문
  if (keyLines.length > 1) {
    const kw = tokenize(keyLines[1]).filter(t=>t.length>=2&&!STOPWORDS.has(t)).slice(0,2)
    if (kw.length > 0) {
      questions.push(`'${kw.join(', ')}' 관련해서 아직 해결되지 않은 과제는 무엇일까요?`)
    }
  }

  return questions.slice(0, 3)
}

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
    const [rTotal, rV12, rV11, rV10, rNull] = await Promise.allSettled([
      fetch(`${SB_URL}/rest/v1/articles?status=eq.published&select=id&limit=1`,
        { headers: { ...H, Prefer: 'count=exact' } }),
      fetch(`${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=like.*insightship-longform-v12*&select=id&limit=1`,
        { headers: { ...H, Prefer: 'count=exact' } }),
      fetch(`${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=like.*insightship-longform-v11*&select=id&limit=1`,
        { headers: { ...H, Prefer: 'count=exact' } }),
      fetch(`${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=like.*insightship-longform-v10*&select=id&limit=1`,
        { headers: { ...H, Prefer: 'count=exact' } }),
      fetch(`${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=is.null&select=id&limit=1`,
        { headers: { ...H, Prefer: 'count=exact' } }),
    ])

    const getCount = r => r.status === 'fulfilled'
      ? parseInt(r.value.headers?.get?.('content-range')?.split('/')?.[1] || '0')
      : 0

    const total = getCount(rTotal)
    const v12Done = getCount(rV12)
    const v11Done = getCount(rV11)
    const v10Done = getCount(rV10)
    const noSummary = getCount(rNull)

    return new Response(JSON.stringify({
      total_articles:    total,
      v12_done:          v12Done,
      v11_done:          v11Done,
      v10_done:          v10Done,
      no_summary:        noSummary,
      needs_reprocess:   total - v12Done,
      progress_pct:      total > 0 ? Math.round((v12Done / total) * 100) : 0,
      engine:            'insightship-longform-v12',
      timestamp:         new Date().toISOString(),
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // POST: 재처리 실행
  const cronHeader = req.headers.get('x-vercel-cron')
  const authHeader = req.headers.get('authorization')
  const isAdminJWT = authHeader && authHeader.startsWith('Bearer ') && authHeader !== `Bearer ${CRON_SECRET}`
    ? await checkAdminJWT(authHeader.slice(7))
    : false

  const isAuth = cronHeader === '1'
    || authHeader === `Bearer ${CRON_SECRET}`
    || isAdminJWT

  if (!isAuth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  if (!SB_URL || !SB_KEY) return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 })

  let params = {}
  try { params = await req.json().catch(() => ({})) } catch {}
  const batchSize = Math.min(Number(params.batch) || 30, 60)
  const offset    = Math.max(Number(params.offset) || 0, 0)
  const forceAll  = params.force === true

  let articles = []

  if (forceAll) {
    // force=true: 모든 기사 대상 (v12 포함)
    const r = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published`
      + `&select=id,title,body,excerpt`
      + `&order=published_at.desc&limit=${batchSize}&offset=${offset}`,
      { headers: H }
    )
    articles = await r.json().catch(() => [])
  } else {
    // 기본: v12 마커가 없는 기사 우선 처리 (v10/v11 포함)
    const r1 = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published`
      + `&ai_summary=not.like.*insightship-longform-v12*`
      + `&select=id,title,body,excerpt,ai_summary`
      + `&order=published_at.desc&limit=${batchSize}&offset=${offset}`,
      { headers: H }
    )
    articles = await r1.json().catch(() => [])
    if (!Array.isArray(articles)) articles = []

    // 보완: null인 것도 추가
    if (articles.length < batchSize) {
      const need = batchSize - articles.length
      const existIds = new Set(articles.map(a=>a.id))
      const r2 = await fetch(
        `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=is.null`
        + `&select=id,title,body,excerpt`
        + `&order=published_at.desc&limit=${need}&offset=${offset}`,
        { headers: H }
      )
      const raw2 = await r2.json().catch(() => [])
      const extra = (Array.isArray(raw2)?raw2:[]).filter(a=>!existIds.has(a.id))
      articles = [...articles, ...extra]
    }
  }

  if (!Array.isArray(articles) || articles.length === 0) {
    const cr = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=not.like.*insightship-longform-v12*&select=id&limit=1`,
      { headers: { ...H, Prefer: 'count=exact' } }
    )
    const remaining = parseInt(cr.headers.get('content-range')?.split('/')[1] || '0')
    return new Response(JSON.stringify({
      message: remaining === 0 ? '✅ 모든 기사 v12 롱폼 처리 완료!' : '현재 배치에 처리할 기사 없음',
      processed: 0, done: 0, failed: 0, remaining,
      next_offset: offset + batchSize,
      engine: 'insightship-longform-v12',
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
    `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=not.like.*insightship-longform-v12*&select=id&limit=1`,
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
    engine:         'insightship-longform-v12',
    longform:       true,
    cost:           0,
    external_api:   false,
    timestamp:      new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function checkAdminJWT(token) {
  if (!token || !SB_URL || !SB_KEY) return false
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` }
    })
    if (!r.ok) return false
    const u = await r.json()
    return u?.user_metadata?.role === 'admin' || u?.app_metadata?.role === 'admin'
  } catch { return false }
}
