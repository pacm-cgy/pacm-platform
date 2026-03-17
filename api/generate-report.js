// AI 트렌드 리포트 자동 생성 - 매주 토요일 그 주(월~토) 뉴스 정리
export const config = { runtime: 'edge' }

const GEMINI_KEY           = process.env.GEMINI_API_KEY
const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET          = process.env.CRON_SECRET

const SH = () => ({
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
})

// ── Gemini 호출 (섹션 하나, 400~500자) ───────────────────────────
async function callGemini(prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text:
`청소년 창업 플랫폼 'Insightship' 수석 에디터. 규칙:
- 헤더(##)로 시작, 인사말 없이 바로 본문
- 청소년이 이해하는 언어, 어려운 용어는 괄호 설명
- ~입니다/~했습니다 체
- 지시된 글자수를 반드시 지키고 완전한 문장으로 마무리
- **굵게** 강조, 수치·기업명 반드시 포함` }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 800,
          temperature: 0.45,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(18000),
    }
  )
  if (!r.ok) throw new Error(`Gemini ${r.status}`)
  const d = await r.json()
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text || text.length < 50) throw new Error(`응답 너무 짧음: ${text?.length}자`)
  return text
}

// ── 주차 계산 ─────────────────────────────────────────────────────
function getThisWeekRange() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 3600000)
  const day = kst.getDay() || 7
  const monday = new Date(kst); monday.setDate(kst.getDate() - (day - 1)); monday.setHours(0,0,0,0)
  const saturday = new Date(monday); saturday.setDate(monday.getDate() + 5); saturday.setHours(23,59,59,999)
  return {
    from: new Date(monday.getTime() - 9*3600000),
    to:   new Date(saturday.getTime() - 9*3600000),
  }
}

function weekLabel(date) {
  const kst = new Date(date.getTime() + 9 * 3600000)
  const year = kst.getFullYear(), month = kst.getMonth() + 1
  const getISO = d => { const t=new Date(d); t.setDate(t.getDate()+3-(t.getDay()+6)%7); const w1=new Date(t.getFullYear(),0,4); return 1+Math.round(((t-w1)/86400000-3+(w1.getDay()+6)%7)/7) }
  const firstMon = new Date(year, kst.getMonth(), 1); while(firstMon.getDay()!==1) firstMon.setDate(firstMon.getDate()+1)
  const week = getISO(kst) - getISO(firstMon) + 1
  return `${year}년 ${month}월 ${week}주차`
}

function weekCode(date) {
  const kst = new Date(date.getTime() + 9 * 3600000)
  const year = kst.getFullYear(), month = kst.getMonth() + 1
  const getISO = d => { const t=new Date(d); t.setDate(t.getDate()+3-(t.getDay()+6)%7); const w1=new Date(t.getFullYear(),0,4); return 1+Math.round(((t-w1)/86400000-3+(w1.getDay()+6)%7)/7) }
  const firstMon = new Date(year, kst.getMonth(), 1); while(firstMon.getDay()!==1) firstMon.setDate(firstMon.getDate()+1)
  const week = getISO(kst) - getISO(firstMon) + 1
  return `${year}-${String(month).padStart(2,'0')}-w${week}`
}

// ── DB 저장 ───────────────────────────────────────────────────────
async function getAdminId() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.admin&limit=1&select=id`, { headers: SH() })
  return (await r.json())?.[0]?.id
}

async function upsertArticle(title, body, tags, slug, adminId) {
  const check = await fetch(`${SUPABASE_URL}/rest/v1/articles?slug=eq.${slug}&select=id&limit=1`, { headers: SH() })
  const existing = await check.json()
  const payload = {
    title, slug, body,
    excerpt: body.replace(/#+\s[^\n]+\n?/g,'').replace(/\*\*/g,'').trim().slice(0,300),
    category: 'trend', status: 'published', tags,
    ai_summary: body.replace(/#+\s[^\n]+\n?/g,'').replace(/\*\*/g,'').trim().slice(0,500),
    read_time: Math.max(5, Math.ceil(body.length/400)),
    published_at: new Date().toISOString(),
    is_duplicate: false,
  }
  if (existing?.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/articles?slug=eq.${slug}`, {
      method: 'PATCH', headers: { ...SH(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    })
    return { updated: true }
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
    method: 'POST', headers: { ...SH(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ ...payload, author_id: adminId }),
  })
  if (r.status !== 201) throw new Error(`INSERT ${r.status}: ${(await r.text()).slice(0,100)}`)
  return { inserted: true }
}

// ── Gemini 1회 호출로 2~3개 섹션 동시 생성 (토큰 절약) ──────────
async function callGeminiMulti(prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text:
`청소년 창업 플랫폼 에디터. 규칙: 각 ## 섹션을 지시된 글자수로 완전한 문장 마무리. 인사말 없이 ## 헤더로 시작. ~입니다 체. 수치·기업명 포함. **굵게** 강조.` }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1200,
          temperature: 0.45,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(22000),
    }
  )
  if (!r.ok) throw new Error(`Gemini ${r.status}`)
  const d = await r.json()
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text || text.length < 100) throw new Error(`너무 짧음: ${text?.length}자`)
  return text
}

// ── 리포트 파트 생성 (2~3섹션 한 번에) ──────────────────────────
async function buildReportPart(label, dateRange, newsSummary, sections) {
  const ctx = `[${label} (${dateRange}) 뉴스]\n${newsSummary}\n\n`
  const prompt = ctx + sections.map(s => s.h + '\n' + s.desc).join('\n\n')
  return callGeminiMulti(prompt)
}

// ── 메인 ─────────────────────────────────────────────────────────
export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

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

  // 해당 주 뉴스
  const newsR = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?ai_summary=not.is.null&category=eq.news&published_at=gte.${encodeURIComponent(fromISO)}&published_at=lte.${encodeURIComponent(toISO)}&select=title,ai_summary&order=published_at.desc&limit=40`,
    { headers: SH() }
  )
  const news = await newsR.json()
  if (!Array.isArray(news) || !news.length) {
    return new Response(JSON.stringify({ error: '해당 기간 뉴스 없음', from: fromISO, to: toISO, label }), { status: 200 })
  }

  const newsSummary = news.slice(0,20).map((n,i) => `${i+1}. ${n.title}\n   ${n.ai_summary?.slice(0,80)}`).join('\n')
  const dateRange = `${fromISO.slice(0,10)} ~ ${toISO.slice(0,10)}`
  const adminId = await getAdminId()
  const results = { label, news_count: news.length, generated: [], errors: [] }

  // 리포트 1: 투자·자금 동향 (섹션 순차 생성)
  try {
    const slug1 = `ai-funding-report-${code}`
    // 앞 2섹션 (핵심요약 + 투자현황)
    const p1a = await buildReportPart(label, dateRange, newsSummary, [
      { h: '## 이번 주 핵심 요약',    desc: '이번 주 투자·자금 동향 3가지 핵심 변화. 수치·기업명 포함. 각 200자로 완전한 문장 마무리.' },
      { h: '## 주요 투자·펀딩 현황', desc: '주목할 투자 유치 사례와 VC 동향. 200자로 완전한 문장 마무리.' },
    ])
    await new Promise(res => setTimeout(res, 200))
    // 뒤 3섹션 (섹터 + 정책 + 인사이트)
    const p1b = await buildReportPart(label, dateRange, newsSummary, [
      { h: '## 섹터별 투자 트렌드',          desc: 'AI, 바이오, 에듀테크, 핀테크 섹터별 투자 흐름. 각 150자로 완전한 문장 마무리.' },
      { h: '## 정부 지원 & 정책 동향',       desc: '창업 지원 프로그램, 지자체 정책 동향. 150자로 완전한 문장 마무리.' },
      { h: '## 청소년 창업가를 위한 인사이트', desc: '교훈과 지금 할 수 있는 행동 2~3가지. 200자로 완전한 문장 마무리.' },
    ])
    const body1 = p1a + '\n\n' + p1b
    if (body1.length < 500) throw new Error(`너무 짧음: ${body1.length}자`)
    const r1 = await upsertArticle(`[AI 리포트] ${label} 스타트업 투자·자금 동향`, body1, ['AI리포트','투자동향','스타트업',label], slug1, adminId)
    results.generated.push({ type: 'funding', slug: slug1, len: body1.length, ...r1 })
  } catch(e) { results.errors.push('funding: ' + e.message?.slice(0,100)) }

  // 리포트 2: 시장·생태계 동향 (섹션 순차 생성)
  try {
    const slug2 = `ai-market-report-${code}`
    const p2a = await buildReportPart(label, dateRange, newsSummary, [
      { h: '## 이번 주 시장 핵심 변화', desc: '이번 주 스타트업 시장 3가지 핵심 변화. 수치·사례 포함. 각 200자로 완전한 문장 마무리.' },
      { h: '## 주목할 스타트업 동향',   desc: '주목할 스타트업·기업들 움직임. 200자로 완전한 문장 마무리.' },
    ])
    await new Promise(res => setTimeout(res, 200))
    const p2b = await buildReportPart(label, dateRange, newsSummary, [
      { h: '## 기술 트렌드 분석',         desc: 'AI, 에듀테크, 헬스케어 기술 트렌드. 각 150자로 완전한 문장 마무리.' },
      { h: '## 창업 생태계 지원 현황',    desc: '창업 지원 프로그램·교육 기회. 150자로 완전한 문장 마무리.' },
      { h: '## 청소년 창업가 주목 포인트', desc: '중고등학생 창업가 주목 내용과 지금 할 수 있는 행동 2~3가지. 200자로 완전한 문장 마무리.' },
    ])
    const body2 = p2a + '\n\n' + p2b
    if (body2.length < 500) throw new Error(`너무 짧음: ${body2.length}자`)
    const r2 = await upsertArticle(`[AI 리포트] ${label} 스타트업 생태계 시장 동향`, body2, ['AI리포트','시장분석','트렌드',label], slug2, adminId)
    results.generated.push({ type: 'market', slug: slug2, len: body2.length, ...r2 })
  } catch(e) { results.errors.push('market: ' + e.message?.slice(0,100)) }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
