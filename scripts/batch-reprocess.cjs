/**
 * scripts/batch-reprocess.cjs
 * Insightship 뉴스 기사 병렬 배치 재처리기
 * Node.js CJS — Supabase REST API 직접 호출
 * 
 * 사용: node scripts/batch-reprocess.cjs
 */

const https = require('https')
const http  = require('http')

/* ── 설정 ───────────────────────────────────────────────────────── */
const SB_URL  = 'https://itcbantrpkjpkfhnriom.supabase.co'
// anon key (SELECT 허용)
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0Y2JhbnRycGtqcGtmaG5yaW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1ODQ5MDcsImV4cCI6MjA4OTE2MDkwN30.uJy0DFPqfOS3HtZzklXNna_5hnfpU9f7wvuCAVC0pWE'

const BATCH_SIZE   = 30   // 한 번에 처리할 기사 수
const PARALLEL     = 15   // 동시 처리 수
const MAX_BATCHES  = 100  // 최대 배치 횟수 (= 최대 3000건)
const MARKER       = 'insightship-longform-v12'

/* ── HTTP 헬퍼 ──────────────────────────────────────────────────── */
function req(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod    = parsed.protocol === 'https:' ? https : http
    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   opts.method || 'GET',
      headers:  opts.headers || {},
    }
    const r = mod.request(options, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), raw: data }) }
        catch { resolve({ status: res.statusCode, body: null, raw: data }) }
      })
    })
    r.on('error', reject)
    if (opts.body) r.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body))
    r.end()
  })
}

const H = {
  'apikey':        SB_ANON,
  'Authorization': `Bearer ${SB_ANON}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=minimal',
}

/* ── NLP 코어 (api/reprocess-all-news.js 동일 로직) ─────────────── */
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

const EVT = {
  funding:     { kw:['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC'], label:'💰 투자 유치' },
  product:     { kw:['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈'], label:'🚀 제품/서비스 출시' },
  policy:      { kw:['정부','지원','공모','과기부','중기부','창진원','예산','규제','정책'], label:'📋 정책/지원' },
  acquisition: { kw:['인수','합병','M&A','지분','매각'], label:'🤝 인수/합병' },
  research:    { kw:['연구','논문','결과','조사','분석','보고서','데이터'], label:'🔬 연구/조사' },
  person:      { kw:['대표','CEO','창업자','설립자','인터뷰','스토리','수상'], label:'👤 창업가 스토리' },
  market:      { kw:['시장','성장','규모','트렌드','전망','예측','확대'], label:'📊 시장/트렌드' },
  ipo:         { kw:['IPO','상장','코스닥','코스피','증권','공모'], label:'📈 IPO/상장' },
}

const DOM = {
  investment:{ kw:['투자','펀딩','시리즈A','시리즈B','억원','조원','VC'], ko:'투자·금융', cat:'trend' },
  tech:      { kw:['AI','인공지능','딥러닝','반도체','GPU','클라우드','SaaS','기술','LLM'], ko:'기술·AI', cat:'trend' },
  youth:     { kw:['청소년','청년','대학생','고등학생','창업교육','해커톤'], ko:'청소년·교육', cat:'insight' },
  policy:    { kw:['정부','지원','공모','과기부','중기부','창진원','규제','R&D'], ko:'정책·지원', cat:'insight' },
  esg:       { kw:['ESG','탄소중립','친환경','임팩트','소셜벤처','그린'], ko:'ESG·임팩트', cat:'insight' },
  startup:   { kw:['스타트업','창업','유니콘','피봇','글로벌','스케일업'], ko:'창업·비즈니스', cat:'news' },
  edutech:   { kw:['에듀테크','교육플랫폼','학습','온라인교육','이러닝'], ko:'에듀테크', cat:'insight' },
  fintech:   { kw:['핀테크','결제','금융','블록체인','암호화폐'], ko:'핀테크', cat:'trend' },
  health:    { kw:['헬스케어','의료','바이오','디지털헬스','건강'], ko:'헬스케어', cat:'trend' },
  climate:   { kw:['기후','탄소','신재생','태양광','배터리','전기차'], ko:'기후테크', cat:'insight' },
}

function decodeHtmlEntities(t) {
  if (!t) return ''
  return t
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 10)) } catch { return '' } })
    .replace(/&[a-zA-Z]{2,8};/g, ' ')
}

function clean(t) {
  return decodeHtmlEntities(t || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/공유하기|페이스북|트위터|카카오톡?|무단전재|재배포\s*금지/g, '')
    .replace(/기자\s*[가-힣]{2,4}\s*기자/g, '')
    .replace(/\[[^\]]{0,30}\]/g, '')
    .replace(/\s{2,}/g, ' ').trim()
}

function splitSents(text) {
  return text.replace(/([.!?])\s+/g, '$1\n').replace(/([다요임음])\s+/g, '$1\n')
    .split('\n').map(s => s.trim()).filter(s => s.length >= 20 && s.length <= 400)
}

const hasNum   = s => /([\\d,]+억|[\d,]+조|[\d,]+만\s*원|\d+%|\d+배|[\d,]+만\s*명|[\d,]+개)/.test(s)
const isCausal = s => /(때문에|이유로|원인은|배경에는|결과로|따라서|이로\s*인해|덕분에)/.test(s)
const isGoal   = s => /(목표|계획|예정|방침|전략|추진|노력|위해)/.test(s)
const isNoise  = s => /무단\s*(전재|배포)|copyright|구독|좋아요|광고|협찬/i.test(s)
const isQuote  = s => (s.includes('"') || s.includes('"') || s.includes('"')) && /(밝혔다|말했다|전했다|강조했다|설명했다)/.test(s)

function scoreAll(sents, titleToks) {
  const toks = sents.map(s => tokenize(s))
  const N = sents.length || 1
  const df = {}
  for (const ts of toks) for (const t of new Set(ts)) df[t] = (df[t] || 0) + 1
  const avgLen = toks.reduce((s, t) => s + t.length, 0) / N || 1
  return sents.map((sent, i) => {
    if (isNoise(sent)) return { sent, score: -1, idx: i }
    const bm = bm25(titleToks, toks[i], avgLen, N, df)
    const pos = i < 2 ? 1.5 : i < 5 ? 1.25 : 1.0
    const l = sent.length, lenB = (l >= 40 && l <= 180) ? 1.3 : l > 250 ? 0.7 : 1.0
    const numB = hasNum(sent) ? 1.4 : 1.0
    const cauB = isCausal(sent) ? 1.25 : 1.0
    return { sent, score: bm * pos * lenB * numB * cauB, idx: i }
  })
}

function detectEvt(title, body) {
  const text = (title + ' ' + body.slice(0, 500)).toLowerCase()
  const pri = ['funding','ipo','acquisition','product','policy','research','person','market']
  const sc = {}
  for (const t of pri) {
    sc[t] = EVT[t].kw.filter(k => text.includes(k.toLowerCase())).length
    sc[t] += EVT[t].kw.filter(k => title.toLowerCase().includes(k.toLowerCase())).length
  }
  const best = pri.reduce((a, b) => sc[a] >= sc[b] ? a : b)
  return sc[best] > 0 ? best : 'general'
}

function detectDom(title, body) {
  const text = (title + ' ' + body.slice(0, 600)).toLowerCase()
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

function estReadTime(t) { return Math.max(3, Math.ceil((t || '').length / 350)) }

function parseTitle(title) {
  const nums = (title.match(/[\d,]+억\s*달러?|[\d,]+만\s*달러?|[\d,]+조\s*원?|[\d,]+억\s*원?|\d+%|\d+배|[\d,]+만\s*명|[\d,]+개/g) || [])
  const companies = []
  const pat = /([가-힣A-Za-z]{2,10}(?:테크|솔루션|랩스?|스튜디오|플랫폼|바이오|AI|ai|Inc|Corp)?)/g
  let m
  while ((m = pat.exec(title)) !== null) {
    if (m[1].length >= 2 && !STOPWORDS.has(m[1].toLowerCase())) companies.push(m[1])
  }
  return { nums: [...new Set(nums)], companies: [...new Set(companies)].slice(0, 3) }
}

function buildDynamicQuestions(title, evt, dom, parsed, keyLines) {
  const questions = []
  const domInfo = DOM[dom] || DOM.startup
  if (parsed.nums.length > 0) questions.push(`이 뉴스의 ${parsed.nums[0]} 수치는 ${domInfo.ko} 업계 평균과 비교하면 어느 정도 규모인가요?`)
  if (parsed.companies.length > 0) questions.push(`${parsed.companies[0]}이(가) 이 소식으로 얻는 가장 큰 이점은 무엇일까요?`)
  const titleKw = tokenize(title).filter(t => t.length >= 2).slice(0, 3).join(', ')
  if (evt === 'funding') questions.push(`"${titleKw}" 관련 투자가 성공적인 결과로 이어지려면 다음에 무엇을 증명해야 할까요?`)
  else if (evt === 'product') questions.push(`이 서비스가 출시된 지금, 기존 방식과 비교해 어떤 문제를 더 잘 해결하고 있나요?`)
  else if (evt === 'policy') questions.push(`이 정책/지원이 실제 창업 현장에 미치는 영향은 어느 정도일까요?`)
  else if (evt === 'market') questions.push(`이 시장 변화가 지속된다면, 5년 후 ${domInfo.ko} 분야는 어떻게 달라져 있을까요?`)
  else questions.push(`이 소식이 ${domInfo.ko} 분야 전체에 미치는 영향을 어떻게 평가할 수 있을까요?`)
  return questions.slice(0, 3)
}

function buildLongformSummary(title, body) {
  const cb = clean(body)
  const dom = detectDom(title, cb)
  const evt = detectEvt(title, cb)
  const sents = splitSents(cb)
  const evtInfo = EVT[evt] || { label: '📰 주요 소식' }
  const domInfo = DOM[dom] || DOM.startup
  const parsed = parseTitle(title)
  const ttoks = tokenize(title)

  const usedSents = new Set()
  let keyLines = [], numLines = [], cauLines = [], goalLines = [], quoteLines = [], extraLines = []

  if (sents.length > 0) {
    const scored = scoreAll(sents, ttoks).filter(x => x.score >= 0).sort((a, b) => b.score - a.score)
    const topIdx = new Set(scored.slice(0, 10).map(x => x.idx))
    keyLines   = sents.filter((_, i) => topIdx.has(i)).slice(0, 6)
    numLines   = sents.filter(s => hasNum(s) && !keyLines.includes(s)).slice(0, 5)
    cauLines   = sents.filter(s => isCausal(s) && !keyLines.includes(s) && !numLines.includes(s)).slice(0, 4)
    goalLines  = sents.filter(s => isGoal(s) && !keyLines.includes(s) && !numLines.includes(s) && !cauLines.includes(s)).slice(0, 3)
    quoteLines = sents.filter(s => isQuote(s) && !keyLines.includes(s)).slice(0, 3)
    extraLines = scored.slice(10, 20).map(x => x.sent)
      .filter(s => !keyLines.includes(s) && !numLines.includes(s) && !cauLines.includes(s))
      .slice(0, 5)
  }

  const addSent = (s, lines) => {
    if (!s || usedSents.has(s)) return
    usedSents.add(s); lines.push(s)
  }

  const lines = []
  const hasBody = sents.length > 2

  lines.push(`**${title.trim()}**`, '')
  lines.push(`${evtInfo.label} · ${domInfo.ko}`, '')
  if (parsed.nums.length > 0) lines.push(`🔢 **핵심 수치**: ${parsed.nums.join(' / ')}`, '')
  lines.push('')

  if (keyLines.length > 0 && keyLines[0].length >= 30) {
    lines.push(keyLines[0], '')
  } else if (parsed.companies.length > 0 && parsed.nums.length > 0) {
    lines.push(`${parsed.companies[0]}과 관련된 ${parsed.nums[0]} 규모의 소식이 ${domInfo.ko} 업계에서 주목받고 있습니다.`, '')
  } else if (parsed.companies.length > 0) {
    lines.push(`${parsed.companies[0]}의 이번 소식은 ${domInfo.ko} 분야에서 주요한 변화를 예고합니다.`, '')
  }

  const coreLines = keyLines.slice(keyLines.length > 0 ? 1 : 0)
  if (coreLines.length > 0) {
    lines.push('## 🔍 핵심 내용', '')
    coreLines.forEach(s => addSent(s, lines))
    lines.push('')
  }

  if (numLines.length > 0) {
    lines.push('## 📊 주요 수치 & 데이터', '')
    numLines.forEach(s => { if (!usedSents.has(s)) { usedSents.add(s); lines.push(`→ ${s}`) } })
    lines.push('')
  }

  if (quoteLines.length > 0) {
    lines.push('## 💬 현장의 목소리', '')
    quoteLines.forEach(s => { if (!usedSents.has(s)) { usedSents.add(s); lines.push(`> ${s}`) } })
    lines.push('')
  }

  if (cauLines.length > 0) {
    lines.push('## 🗺️ 배경과 맥락', '')
    cauLines.forEach(s => addSent(s, lines))
    lines.push('')
  } else if (extraLines.length >= 2 && hasBody) {
    lines.push('## 🗺️ 배경과 맥락', '')
    extraLines.slice(0, 2).forEach(s => addSent(s, lines))
    lines.push('')
  }

  if (goalLines.length > 0) {
    lines.push('## 🎯 향후 방향', '')
    goalLines.forEach(s => addSent(s, lines))
    lines.push('')
  }

  const remainExtra = extraLines.filter(s => !usedSents.has(s))
  if (remainExtra.length > 0 && hasBody) {
    lines.push('## 🔗 추가 분석', '')
    remainExtra.slice(0, 3).forEach(s => addSent(s, lines))
    lines.push('')
  }

  const importanceSents = sents.filter(s =>
    /(중요|주목|핵심|의미|영향|변화|주요|화제|관심|신호)/.test(s) && !usedSents.has(s)
  ).slice(0, 2)
  if (importanceSents.length > 0) {
    lines.push('## 💡 왜 주목해야 하나', '')
    importanceSents.forEach(s => addSent(s, lines))
    lines.push('')
  }

  const opportunitySents = sents.filter(s =>
    /(기회|전략|가능성|활용|아이디어|모델|비즈니스|창업|솔루션|서비스|혁신)/.test(s) && !usedSents.has(s)
  ).slice(0, 2)
  if (opportunitySents.length > 0) {
    lines.push('## 🚀 창업가 시각으로 읽기', '')
    opportunitySents.forEach(s => addSent(s, lines))
    lines.push('')
  }

  const questions = buildDynamicQuestions(title, evt, dom, parsed, keyLines)
  if (questions.length > 0) {
    lines.push('## 💭 생각해볼 질문', '')
    questions.forEach(q => lines.push(`• ${q}`))
    lines.push('')
  }

  lines.push('---')
  lines.push(`*Insightship AI (${MARKER}) · ${domInfo.ko} · ${evtInfo.label}*`)

  return lines.join('\n')
}

/* ── 메인 배치 로직 ─────────────────────────────────────────────── */
async function fetchBatch(offset) {
  // source_name IS NOT NULL (뉴스) — offset 기반 전체 순환 처리
  const url = `${SB_URL}/rest/v1/articles`
    + `?status=eq.published`
    + `&source_name=not.is.null`
    + `&select=id,title,body,excerpt`
    + `&order=published_at.desc`
    + `&limit=${BATCH_SIZE}`
    + `&offset=${offset}`

  const r = await req(url, { headers: H })
  if (!Array.isArray(r.body)) {
    console.error('fetchBatch error:', r.raw.slice(0, 200))
    return []
  }
  return r.body
}

async function updateArticle(a, summary, dom, cat, readTime) {
  const url = `${SB_URL}/rest/v1/articles?id=eq.${a.id}`
  const r = await req(url, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({
      ai_summary:  summary,
      ai_category: dom,
      category:    cat,
      read_time:   readTime,
    }),
  })
  return r.status === 200 || r.status === 204
}

async function processBatch(articles) {
  // 병렬 처리
  const chunks = []
  for (let i = 0; i < articles.length; i += PARALLEL) {
    chunks.push(articles.slice(i, i + PARALLEL))
  }

  let done = 0, failed = 0
  for (const chunk of chunks) {
    await Promise.allSettled(chunk.map(async a => {
      try {
        const bodyText = (a.body && a.body.length > 100) ? a.body : (a.excerpt || a.title)
        const summary  = buildLongformSummary(a.title, bodyText)
        const cb       = clean(bodyText)
        const dom      = detectDom(a.title, cb)
        const evt      = detectEvt(a.title, cb)
        const cat      = mapCat(dom, evt)
        const readTime = estReadTime(summary)

        const ok = await updateArticle(a, summary, dom, cat, readTime)
        if (ok) done++
        else failed++
      } catch (e) {
        failed++
        console.error(`  ✗ [${a.id}] ${e.message}`)
      }
    }))
  }
  return { done, failed }
}

async function getProgress() {
  const r = await req(
    `${SB_URL}/rest/v1/articles?status=eq.published&ai_summary=not.like.*${MARKER}*&select=id&limit=1`,
    { headers: { ...H, Prefer: 'count=exact' } }
  )
  const total = parseInt((r.raw.match(/"count":(\d+)/) || [])[1] || '0')
  // content-range is not directly available via req helper, use body
  return total
}

async function main() {
  // CLI: node batch-reprocess.cjs [startOffset]
  const startOffset = parseInt(process.argv[2] || '0', 10) || 0

  console.log('═══════════════════════════════════════════════════')
  console.log('  Insightship 뉴스 재처리 배치 (insightship-longform-v12)')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  배치 크기: ${BATCH_SIZE}, 병렬: ${PARALLEL}, 최대 배치: ${MAX_BATCHES}`)
  console.log(`  시작 오프셋: ${startOffset}`)
  console.log(`  시작: ${new Date().toLocaleString('ko-KR')}`)
  console.log('───────────────────────────────────────────────────')

  let totalDone = 0, totalFailed = 0
  let offset = startOffset

  for (let batch = 1; batch <= MAX_BATCHES; batch++) {
    const articles = await fetchBatch(offset)

    if (!articles || articles.length === 0) {
      console.log(`\n✅ 처리할 기사 없음 — 전체 완료!`)
      break
    }

    process.stdout.write(`[배치 ${batch}] ${articles.length}건 처리 중...`)
    const { done, failed } = await processBatch(articles)
    totalDone   += done
    totalFailed += failed
    offset      += BATCH_SIZE

    console.log(` ✓ ${done}건 성공, ${failed}건 실패 (누적: ${totalDone}건)`)

    // 너무 빠른 요청 방지
    if (batch < MAX_BATCHES && articles.length === BATCH_SIZE) {
      await new Promise(r => setTimeout(r, 500))
    }

    if (articles.length < BATCH_SIZE) {
      console.log(`\n✅ 마지막 배치 완료 (기사 수 < 배치 크기)`)
      break
    }
  }

  console.log('\n───────────────────────────────────────────────────')
  console.log(`  완료: ${new Date().toLocaleString('ko-KR')}`)
  console.log(`  총 성공: ${totalDone}건 / 총 실패: ${totalFailed}건`)
  console.log('═══════════════════════════════════════════════════')
}

main().catch(e => {
  console.error('치명적 오류:', e)
  process.exit(1)
})
