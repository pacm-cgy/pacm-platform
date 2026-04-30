/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP AI 주간 리포트 생성기 v3.0                             ║
 * ║  담당 AI: SAGE (세이지) — 리포트 매니저                             ║
 * ║                                                                      ║
 * ║  v3 업그레이드:                                                      ║
 * ║  - 롱폼 v10 엔진 내장 (3,000자+ 리포트)                            ║
 * ║  - 섹터별 시장 수치 자동 내재화                                     ║
 * ║  - 청소년 창업가 인사이트 섹션 강화                                 ║
 * ║  - 주간 발행 검증 로직 (중복 방지)                                  ║
 * ║  - GET 상태 조회 강화                                               ║
 * ║                                                                      ║
 * ║  스케줄: 매주 금요일 23:00 KST (UTC 14:00)                          ║
 * ║  출력: articles 테이블에 trend 카테고리로 자동 발행                  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */


const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const SH = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

// ══════════════════════════════════════════════════════════════════════
// §1. NLP 코어
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
])

function tokenize(text) {
  if (!text) return []
  return (text.replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g,' ').toLowerCase()
    .match(/[가-힣]{2,}|[a-z]{3,}|[0-9]+/g) || [])
    .filter(t => !STOPWORDS.has(t) && t.length >= 2)
}

const K1 = 1.5, BP = 0.75
function bm25(qToks, dToks, avgLen, N, df) {
  const len = dToks.length
  const tf = {}
  for (const t of dToks) tf[t] = (tf[t]||0)+1
  let score = 0
  for (const q of qToks) {
    if (!tf[q]) continue
    const idf = Math.log((N-(df[q]||0)+0.5)/((df[q]||0)+0.5)+1)
    score += idf * (tf[q]*(K1+1))/(tf[q]+K1*(1-BP+BP*len/avgLen))
  }
  return score
}

// ══════════════════════════════════════════════════════════════════════
// §2. 주차 계산
// ══════════════════════════════════════════════════════════════════════

function getThisWeekRange() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9*3600000)
  const day = kst.getDay() || 7
  const monday = new Date(kst); monday.setDate(kst.getDate()-(day-1)); monday.setHours(0,0,0,0)
  const saturday = new Date(monday); saturday.setDate(monday.getDate()+5); saturday.setHours(23,59,59,999)
  return {
    from: new Date(monday.getTime()-9*3600000),
    to:   new Date(saturday.getTime()-9*3600000),
  }
}

function weekLabel(date) {
  const kst = new Date(date.getTime()+9*3600000)
  const year = kst.getFullYear(), month = kst.getMonth()+1
  const getISO = d => { const t=new Date(d); t.setDate(t.getDate()+3-(t.getDay()+6)%7); const w1=new Date(t.getFullYear(),0,4); return 1+Math.round(((t-w1)/86400000-3+(w1.getDay()+6)%7)/7) }
  const firstMon = new Date(year,kst.getMonth(),1); while(firstMon.getDay()!==1) firstMon.setDate(firstMon.getDate()+1)
  const week = getISO(kst)-getISO(firstMon)+1
  return `${year}년 ${month}월 ${week}주차`
}

function weekCode(date) {
  const kst = new Date(date.getTime()+9*3600000)
  const year = kst.getFullYear(), month = kst.getMonth()+1
  const getISO = d => { const t=new Date(d); t.setDate(t.getDate()+3-(t.getDay()+6)%7); const w1=new Date(t.getFullYear(),0,4); return 1+Math.round(((t-w1)/86400000-3+(w1.getDay()+6)%7)/7) }
  const firstMon = new Date(year,kst.getMonth(),1); while(firstMon.getDay()!==1) firstMon.setDate(firstMon.getDate()+1)
  const week = getISO(kst)-getISO(firstMon)+1
  return `${year}-${String(month).padStart(2,'0')}-w${week}`
}

// ══════════════════════════════════════════════════════════════════════
// §3. v3 리포트 생성 엔진
// ══════════════════════════════════════════════════════════════════════

// 뉴스 도메인별 분류
function classifyNews(news) {
  const buckets = {
    funding: [], product: [], policy: [], market: [], person: [], youth: [], tech: [], other: []
  }
  const fundingKw  = ['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC','엑셀러레이터']
  const productKw  = ['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈','업데이트']
  const policyKw   = ['정부','지원','공모','선발','과기부','중기부','창진원','예산','정책','공고','R&D','바우처']
  const personKw   = ['대표','CEO','창업자','설립자','인터뷰','스토리','수상','선정']
  const marketKw   = ['시장','성장','규모','트렌드','전망','예측','확대','점유율','글로벌']
  const youthKw    = ['청소년','청년','대학생','고등학생','학생창업','비즈쿨','해커톤']
  const techKw     = ['AI','인공지능','LLM','딥러닝','생성형','ChatGPT','반도체','클라우드']

  for (const n of news) {
    const t = (n.title + ' ' + (n.ai_summary||'').slice(0,150)).toLowerCase()
    if (youthKw.some(k => t.includes(k.toLowerCase()))) { buckets.youth.push(n); continue }
    if (fundingKw.some(k => t.includes(k.toLowerCase()))) { buckets.funding.push(n); continue }
    if (policyKw.some(k => t.includes(k.toLowerCase())))  { buckets.policy.push(n);  continue }
    if (techKw.some(k => t.includes(k.toLowerCase())))    { buckets.tech.push(n);    continue }
    if (productKw.some(k => t.includes(k.toLowerCase()))) { buckets.product.push(n); continue }
    if (personKw.some(k => t.includes(k.toLowerCase())))  { buckets.person.push(n);  continue }
    if (marketKw.some(k => t.includes(k.toLowerCase())))  { buckets.market.push(n);  continue }
    buckets.other.push(n)
  }
  return buckets
}

// BM25 기반 뉴스 랭킹
function extractKeyPoints(newsItems, query, maxItems = 4) {
  if (!newsItems.length) return []
  const qToks = tokenize(query)
  const docs = newsItems.map(n => ({
    n,
    toks: tokenize(n.title + ' ' + (n.ai_summary||'').slice(0,200)),
  }))
  const avgLen = docs.reduce((s,d) => s+d.toks.length,0)/docs.length || 10
  const df = {}
  for (const d of docs) for (const t of new Set(d.toks)) df[t]=(df[t]||0)+1
  return docs
    .map(d => ({ ...d, score: bm25(qToks, d.toks, avgLen, docs.length, df) }))
    .sort((a,b) => b.score-a.score)
    .slice(0, maxItems)
    .map(d => d.n)
}

// 핵심 수치 추출
function extractNumbers(news) {
  const nums = []
  for (const n of news) {
    const matches = (n.title + ' ' + (n.ai_summary||'')).match(/[0-9,]+억원?|[0-9,]+조원?|[0-9]+%|[0-9]+배/g) || []
    if (matches.length > 0) {
      nums.push({ title: n.title.slice(0,40), nums: matches.slice(0,3) })
    }
  }
  return nums.slice(0, 5)
}

// ── 투자·자금 리포트 v3 ───────────────────────────────────────────────
function buildFundingReport(label, news) {
  const b = classifyNews(news)
  const topFunding = extractKeyPoints(b.funding.length ? b.funding : news, '투자 펀딩 억원 시리즈', 6)
  const topPolicy  = extractKeyPoints(b.policy.length  ? b.policy  : news, '정부 지원 정책 공모', 4)
  const topYouth   = extractKeyPoints(b.youth.length   ? b.youth   : news, '청소년 청년 학생 창업', 3)
  const topTech    = extractKeyPoints(b.tech.length    ? b.tech    : news, 'AI 인공지능 기술 플랫폼', 3)

  const now = new Date()
  const kst = new Date(now.getTime()+9*3600000)
  const dateStr = `${kst.getFullYear()}년 ${kst.getMonth()+1}월 ${kst.getDate()}일`

  const top3 = extractKeyPoints(news, '투자 펀딩 스타트업 창업 억원', 3)
  const summaryLines = top3.map((n,i) =>
    `${i+1}. **${n.title}**\n   ${(n.ai_summary||n.title).replace(/\*\*|##/g,'').slice(0,150).trim()}...`
  )

  const fundingLines = topFunding.slice(0,5).map(n => {
    const nums = (n.title + ' ' + (n.ai_summary||'')).match(/[0-9,]+억원?|[0-9,]+조원?/g)
    const numStr = nums ? ` (${nums[0]})` : ''
    return `- **${n.title}**${numStr}\n  ${(n.ai_summary||'').replace(/\*\*|##/g,'').slice(0,100).trim()}`
  })

  // 섹터별 분류 (상세)
  const aiItems     = news.filter(n => /AI|인공지능|딥러닝|LLM|생성형/.test(n.title)).slice(0,3)
  const edutechItems= news.filter(n => /에듀테크|교육|학습/.test(n.title)).slice(0,2)
  const finItems    = news.filter(n => /핀테크|금융|결제/.test(n.title)).slice(0,2)
  const healthItems = news.filter(n => /헬스케어|바이오|의료/.test(n.title)).slice(0,2)
  const climateItems= news.filter(n => /기후|탄소|ESG|그린|친환경/.test(n.title)).slice(0,2)

  const sectorLines = []
  if (aiItems.length)      sectorLines.push(`**🤖 AI·기술** (${aiItems.length}건): ${aiItems.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (edutechItems.length) sectorLines.push(`**📚 에듀테크** (${edutechItems.length}건): ${edutechItems.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (finItems.length)     sectorLines.push(`**💳 핀테크** (${finItems.length}건): ${finItems.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (healthItems.length)  sectorLines.push(`**🏥 헬스케어** (${healthItems.length}건): ${healthItems.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (climateItems.length) sectorLines.push(`**🌍 기후테크** (${climateItems.length}건): ${climateItems.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (!sectorLines.length) sectorLines.push('이번 주는 다양한 분야에서 고른 투자 활동이 나타났습니다.')

  const policyLines = topPolicy.slice(0,3).map(n =>
    `- **${n.title}**\n  ${(n.ai_summary||'').replace(/\*\*|##/g,'').slice(0,100).trim()}`
  )

  // 수치 데이터 섹션
  const numData = extractNumbers(topFunding.concat(news.slice(0,10)))
  const numLines = numData.map(d => `- **${d.title}**: ${d.nums.join(', ')}`)

  // 청소년 인사이트 강화
  const youthInsight = topYouth.length > 0
    ? `이번 주 **청소년·청년 창업** 관련 소식이 ${topYouth.length}건 포착됐습니다. ${topYouth[0].title.slice(0,50)} 등의 사례에서 지원 기회를 찾아보세요.`
    : `이번 주 투자 소식 중 청소년이 참고할 내용을 골라봤습니다. 투자받은 기업들의 문제 정의 방식을 분석하면 내 창업 아이디어의 타이밍을 검증할 수 있습니다.`

  const insightBase = news.filter(n => /([0-9,]+억|[0-9]+%|[0-9]+배)/.test(n.title+' '+(n.ai_summary||'')))[0] || news[0]
  const mainInsight = insightBase
    ? `**${insightBase?.title?.slice(0,45) || '이번 주 주목 스타트업'}** 같은 사례를 분석할 때 "어떤 문제를 해결하는가", "왜 지금 투자받는가", "경쟁 우위는 무엇인가" 3가지 관점으로 읽어보세요.`
    : '투자받은 기업의 문제 정의 방식과 성장 전략을 분석하면 내 창업 아이디어의 타이밍을 검증할 수 있습니다.'

  return [
    `## 📊 이번 주 핵심 요약`,
    ``,
    `**${label}** 동안 **총 ${news.length}건**의 스타트업·창업 뉴스가 수집되었습니다.`,
    `집계 기준: ${dateStr} | AI 자동 분석`,
    ``,
    ...summaryLines,
    ``,
    `## 💰 주요 투자·펀딩 현황`,
    ``,
    fundingLines.length ? fundingLines.join('\n') : `이번 주 주목할 투자 소식: ${news.slice(0,2).map(n=>n.title).join(', ')}`,
    ``,
    numLines.length ? `**📈 주요 투자 수치**\n${numLines.join('\n')}\n` : '',
    `## 🏭 섹터별 투자 트렌드`,
    ``,
    sectorLines.join('\n'),
    ``,
    `## 📋 정부 지원 & 정책 동향`,
    ``,
    policyLines.length ? policyLines.join('\n') : `정책 관련 뉴스 ${topPolicy.length}건이 수집되었습니다.`,
    ``,
    `## 🤖 AI·기술 스타트업 동향`,
    ``,
    topTech.length > 0
      ? topTech.map(n => `- **${n.title}**: ${(n.ai_summary||'').replace(/\*\*|##/g,'').slice(0,100).trim()}`).join('\n')
      : 'AI 기술 관련 스타트업 동향을 지속 모니터링 중입니다.',
    ``,
    `## 🎯 청소년 창업가를 위한 인사이트`,
    ``,
    youthInsight,
    ``,
    mainInsight,
    ``,
    `**지금 할 수 있는 행동:**`,
    `1. 이번 주 투자 기업 중 하나를 골라 "내가 이 회사를 세운다면?" 관점으로 분석해보세요.`,
    `2. Insightship AI 멘토에게 관심 분야 투자 트렌드를 물어보세요.`,
    `3. 아이디어랩에 내 창업 아이디어를 공유하고 피드백을 받아보세요.`,
    ``,
    `---`,
    `*📋 **SAGE v3** (Insightship AI 리포트 매니저) — ${news.length}개 뉴스 자동 분석 | 비용 $0*`,
  ].filter(l => l !== undefined).join('\n')
}

// ── 시장·생태계 리포트 v3 ─────────────────────────────────────────────
function buildMarketReport(label, news) {
  const b = classifyNews(news)
  const topMarket  = extractKeyPoints(b.market.length  ? b.market  : news, '시장 성장 트렌드 전망 확대', 5)
  const topProduct = extractKeyPoints(b.product.length ? b.product : news, '출시 서비스 플랫폼 런칭', 4)
  const topPerson  = extractKeyPoints(b.person.length  ? b.person  : news, '창업자 대표 스토리 인터뷰', 3)
  const topYouth   = extractKeyPoints(b.youth.length   ? b.youth   : news, '청소년 청년 학생 창업 지원', 4)

  const now = new Date()
  const kst = new Date(now.getTime()+9*3600000)

  const topChange = extractKeyPoints(news, '시장 변화 성장 확대 글로벌 혁신', 4)
  const changeLines = topChange.map((n,i) =>
    `${i+1}. **${n.title}**\n   ${(n.ai_summary||n.title).replace(/\*\*|##/g,'').slice(0,150).trim()}`
  )

  const notableLines = topProduct.slice(0,4).map(n =>
    `- **${n.title}**\n  ${(n.ai_summary||'').replace(/\*\*|##/g,'').slice(0,100).trim()}`
  )

  // 기술 트렌드 상세
  const aiTech  = news.filter(n => /AI|ChatGPT|LLM|생성형|딥러닝/.test(n.title)).slice(0,3)
  const bioTech = news.filter(n => /바이오|의료|헬스케어/.test(n.title)).slice(0,2)
  const eduTech = news.filter(n => /에듀테크|학습|교육/.test(n.title)).slice(0,2)
  const climateTech = news.filter(n => /기후|탄소|ESG|그린/.test(n.title)).slice(0,2)
  const techLines = []
  if (aiTech.length)     techLines.push(`**🤖 AI·생성형** (${aiTech.length}건): ${aiTech.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (bioTech.length)    techLines.push(`**🧬 바이오·헬스** (${bioTech.length}건): ${bioTech.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (eduTech.length)    techLines.push(`**📚 에듀테크** (${eduTech.length}건): ${eduTech.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (climateTech.length)techLines.push(`**🌍 기후테크** (${climateTech.length}건): ${climateTech.map(n=>n.title.slice(0,35)).join(' / ')}`)
  if (!techLines.length) techLines.push('다양한 분야에서 기술 혁신이 이어지고 있습니다.')

  const supportNews = news.filter(n => /지원|공모|창업교육|해커톤|비즈쿨|창진원|멘토링/.test(n.title)).slice(0,4)
  const supportLines = supportNews.map(n =>
    `- **${n.title}**\n  ${(n.ai_summary||'').replace(/\*\*|##/g,'').slice(0,100).trim()}`
  )

  // 창업가 스토리
  const personLines = topPerson.slice(0,2).map(n =>
    `- **${n.title}**: ${(n.ai_summary||'').replace(/\*\*|##/g,'').slice(0,120).trim()}`
  )

  // 청소년 포인트 강화
  const youthItems = topYouth.slice(0,3)
  const youthPoint = youthItems.length > 0
    ? `이번 주 청소년·청년 창업가에게 직접 관련된 **${youthItems.length}건**의 소식이 있었습니다:\n${youthItems.map(n=>`- **${n.title}**`).join('\n')}\n\n지금 바로 참여할 수 있는 기회입니다.`
    : `이번 주 생태계 전반의 흐름을 파악했다면, 내 아이디어가 어느 시장에 위치하는지 정의해보세요.`

  const actionItem = [
    `1. 이번 주 상위 뉴스 3건을 읽고 "내가 이 문제를 해결한다면?" 관점으로 정리해보세요.`,
    `2. Insightship **멘토 AI**에게 아이디어를 검증받아보세요.`,
    `3. **아이디어랩**에 이번 주 뉴스에서 영감을 받은 아이디어를 공유해보세요.`,
    `4. **트렌드 트래커**에서 관심 분야 성장 그래프를 확인해보세요.`,
  ].join('\n')

  return [
    `## 🌊 이번 주 시장 핵심 변화`,
    ``,
    changeLines.join('\n\n'),
    ``,
    `## 🚀 주목할 스타트업 동향`,
    ``,
    notableLines.length ? notableLines.join('\n') : `이번 주 주목할 동향: ${news.slice(0,2).map(n=>n.title).join(', ')}`,
    ``,
    `## 🔬 기술 트렌드 분석`,
    ``,
    techLines.join('\n'),
    ``,
    personLines.length ? `## 👤 이번 주 창업가 스토리\n\n${personLines.join('\n')}\n` : '',
    `## 🏛️ 창업 생태계 지원 현황`,
    ``,
    supportLines.length ? supportLines.join('\n') : `창업 지원 관련 뉴스 ${supportNews.length}건이 수집되었습니다.`,
    ``,
    `## 🎯 청소년 창업가 주목 포인트`,
    ``,
    youthPoint,
    ``,
    `**✅ 지금 할 수 있는 행동**`,
    ``,
    actionItem,
    ``,
    `---`,
    `*📋 **SAGE v3** (Insightship AI 리포트 매니저) — ${news.length}개 뉴스 자동 분석 | 비용 $0*`,
  ].filter(l => l !== undefined).join('\n')
}

// ══════════════════════════════════════════════════════════════════════
// §4. DB 유틸
// ══════════════════════════════════════════════════════════════════════

async function getSageId() {
  try {
    const r1 = await fetch(`${SB_URL}/rest/v1/profiles?username=eq.ai_sage&limit=1&select=id`, { headers: SH() })
    const d1 = await r1.json()
    if (d1?.[0]?.id) return d1[0].id
    const r2 = await fetch(`${SB_URL}/rest/v1/profiles?role=eq.admin&limit=1&select=id`, { headers: SH() })
    const d2 = await r2.json()
    if (d2?.[0]?.id) return d2[0].id
    const r3 = await fetch(`${SB_URL}/rest/v1/profiles?or=(username.eq.insightship,username.eq.pacm,username.eq.admin)&limit=1&select=id`, { headers: SH() })
    const d3 = await r3.json()
    if (d3?.[0]?.id) return d3[0].id
    const r4 = await fetch(`${SB_URL}/rest/v1/profiles?select=id&order=created_at.asc&limit=1`, { headers: SH() })
    const d4 = await r4.json()
    return d4?.[0]?.id || null
  } catch { return null }
}

async function upsertArticle(title, body, tags, slug, adminId) {
  if (!adminId) return { error: 'admin_id_missing' }
  const check = await fetch(`${SB_URL}/rest/v1/articles?slug=eq.${slug}&select=id&limit=1`, { headers: SH() })
  const existing = await check.json()
  const excerpt = body.replace(/#+\s[^\n]+\n?/g,'').replace(/\*\*/g,'').replace(/---\n.*/gs,'').trim().slice(0,300)
  const payload = {
    title, slug, body,
    excerpt,
    category: 'trend',
    status: 'published',
    tags,
    ai_summary: excerpt.slice(0,500),
    read_time: Math.max(3, Math.ceil(body.length/400)),
    published_at: new Date().toISOString(),
    is_duplicate: false,
  }
  if (existing?.length > 0) {
    await fetch(`${SB_URL}/rest/v1/articles?slug=eq.${slug}`, {
      method: 'PATCH', headers: { ...SH(), Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    })
    return { updated: true }
  }
  const r = await fetch(`${SB_URL}/rest/v1/articles`, {
    method: 'POST', headers: { ...SH(), Prefer: 'return=representation' },
    body: JSON.stringify({ ...payload, author_id: adminId }),
  })
  if (r.status !== 201) {
    const errText = await r.text()
    throw new Error(`INSERT ${r.status}: ${errText.slice(0,100)}`)
  }
  return { inserted: true }
}

// ══════════════════════════════════════════════════════════════════════
// §5. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export async function handleGenerateReport(req) {
  if (req.method === 'GET') {
    // GET: 상태 + 최근 리포트 목록
    let recentReports = []
    if (SB_URL && SB_KEY) {
      try {
        const r = await fetch(
          `${SB_URL}/rest/v1/articles?status=eq.published&tags=cs.{AI리포트}&order=published_at.desc&limit=6&select=title,slug,published_at,read_time`,
          { headers: SH() }
        )
        recentReports = await r.json().catch(() => [])
      } catch {}
    }
    return new Response(JSON.stringify({
      status: 'ok', engine: 'SAGE-v3',
      agent: 'SAGE (세이지) — Insightship 리포트 매니저',
      description: 'AI 주간 리포트 자동 생성 (자체 NLP v3, 외부 API 0원)',
      schedule: '매주 금요일 23:00 KST',
      recent_reports: Array.isArray(recentReports) ? recentReports : [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === `Bearer ${CRON_SECRET}`
    || req.headers.get('x-cron-secret') === CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  if (!SB_URL || !SB_KEY) return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 })

  const url = new URL(req.url)
  const fromParam = url.searchParams.get('from')
  const toParam   = url.searchParams.get('to')

  let from, to, label
  if (fromParam && toParam) {
    from  = new Date(fromParam + 'T00:00:00+09:00')
    to    = new Date(toParam   + 'T23:59:59+09:00')
    label = weekLabel(from)
  } else {
    const range = getThisWeekRange()
    from = range.from; to = range.to
    label = weekLabel(from)
  }

  const code    = weekCode(from)
  const fromISO = from.toISOString()
  const toISO   = to.toISOString()

  // ── 뉴스 조회 (3단계 폴백) ────────────────────────────────────────
  let news = []
  try {
    const newsR = await fetch(
      `${SB_URL}/rest/v1/articles?status=eq.published&category=eq.news` +
      `&published_at=gte.${encodeURIComponent(fromISO)}&published_at=lte.${encodeURIComponent(toISO)}` +
      `&select=id,title,ai_summary,category,tags&order=published_at.desc&limit=80`,
      { headers: SH() }
    )
    const d1 = await newsR.json()
    if (Array.isArray(d1)) news = d1
  } catch {}

  if (news.length < 5) {
    try {
      const r2 = await fetch(
        `${SB_URL}/rest/v1/articles?status=eq.published&source_name=not.is.null` +
        `&published_at=gte.${encodeURIComponent(fromISO)}&published_at=lte.${encodeURIComponent(toISO)}` +
        `&select=id,title,ai_summary,category,tags&order=published_at.desc&limit=80`,
        { headers: SH() }
      )
      const d2 = await r2.json()
      if (Array.isArray(d2)) {
        const existIds = new Set(news.map(n => n.id))
        news.push(...d2.filter(n => !existIds.has(n.id)))
      }
    } catch {}
  }

  if (news.length < 3) {
    try {
      const fallbackFrom = new Date(Date.now() - 7 * 86400000).toISOString()
      const r3 = await fetch(
        `${SB_URL}/rest/v1/articles?status=eq.published` +
        `&published_at=gte.${encodeURIComponent(fallbackFrom)}` +
        `&select=id,title,ai_summary,category,tags&order=published_at.desc&limit=60`,
        { headers: SH() }
      )
      const d3 = await r3.json()
      if (Array.isArray(d3)) {
        const existIds = new Set(news.map(n => n.id))
        news.push(...d3.filter(n => !existIds.has(n.id)))
      }
    } catch {}
  }

  if (news.length === 0) {
    return new Response(JSON.stringify({ error: '분석할 뉴스 없음', from: fromISO, to: toISO, label }), { status: 200 })
  }

  const adminId = await getSageId()
  const results = { label, news_count: news.length, generated: [], errors: [], engine: 'SAGE-v3', agent: 'SAGE' }

  // ── 리포트 1: 투자·자금 동향 ──────────────────────────────────────
  try {
    const slug1 = `ai-funding-report-${code}`
    const body1 = buildFundingReport(label, news)
    if (body1.length < 400) throw new Error(`본문 너무 짧음: ${body1.length}자`)
    const r1 = await upsertArticle(
      `[AI 리포트] ${label} 스타트업 투자·자금 동향`,
      body1,
      ['AI리포트','투자동향','스타트업',label],
      slug1,
      adminId
    )
    results.generated.push({ type: 'funding', slug: slug1, len: body1.length, ...r1 })
  } catch(e) { results.errors.push('funding: ' + (e.message||'').slice(0,100)) }

  // ── 리포트 2: 시장·생태계 동향 ───────────────────────────────────
  try {
    const slug2 = `ai-market-report-${code}`
    const body2 = buildMarketReport(label, news)
    if (body2.length < 400) throw new Error(`본문 너무 짧음: ${body2.length}자`)
    const r2 = await upsertArticle(
      `[AI 리포트] ${label} 스타트업 생태계 시장 동향`,
      body2,
      ['AI리포트','시장분석','트렌드',label],
      slug2,
      adminId
    )
    results.generated.push({ type: 'market', slug: slug2, len: body2.length, ...r2 })
  } catch(e) { results.errors.push('market: ' + (e.message||'').slice(0,100)) }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
