// AI 트렌드 리포트 자동 생성
// 매주 토요일 그 주(월~토) 뉴스를 정리
// 수동 실행 시 ?week=2 파라미터로 몇 주차인지 지정 가능
export const config = { runtime: 'nodejs', maxDuration: 300 }

const GEMINI_KEY           = process.env.GEMINI_API_KEY
const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET          = process.env.CRON_SECRET

const H = () => ({
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
})

// ── 주차 계산 ─────────────────────────────────────────────────────
// 실행 시점 기준으로 이번 주 월요일~토요일 범위 반환
function getThisWeekRange() {
  const now = new Date()
  const kstNow = new Date(now.getTime() + 9 * 3600000) // KST

  // 이번 주 월요일 (KST)
  const day = kstNow.getDay() || 7 // 일=7
  const monday = new Date(kstNow)
  monday.setDate(kstNow.getDate() - (day - 1))
  monday.setHours(0, 0, 0, 0)

  // 이번 주 토요일
  const saturday = new Date(monday)
  saturday.setDate(monday.getDate() + 5)
  saturday.setHours(23, 59, 59, 999)

  // UTC로 변환해서 반환
  const fromUtc = new Date(monday.getTime() - 9 * 3600000)
  const toUtc   = new Date(saturday.getTime() - 9 * 3600000)

  return { from: fromUtc, to: toUtc }
}

// 특정 날짜가 속한 주의 N번째 주차 문자열
function weekLabel(date) {
  // ISO 주차 기반: 월요일 시작, 해당 월 기준 상대 주차
  const kst = new Date(date.getTime() + 9 * 3600000)
  const year  = kst.getFullYear()
  const month = kst.getMonth() + 1

  // ISO 주차 계산 (월요일 기준)
  const getISOWeek = (d) => {
    const tmp = new Date(d)
    tmp.setHours(0, 0, 0, 0)
    tmp.setDate(tmp.getDate() + 3 - (tmp.getDay() + 6) % 7)
    const week1 = new Date(tmp.getFullYear(), 0, 4)
    return 1 + Math.round(((tmp - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  }

  // 해당 월의 첫 월요일이 속한 ISO 주차를 1주차 기준으로
  // 3월 1일(일요일)이면 → 첫 월요일은 3/2 → ISO 주차 기준 1주차
  const firstMonday = new Date(year, kst.getMonth(), 1)
  while (firstMonday.getDay() !== 1) firstMonday.setDate(firstMonday.getDate() + 1)
  const baseISO = getISOWeek(firstMonday)
  const curISO  = getISOWeek(kst)
  const week = curISO - baseISO + 1

  return `${year}년 ${month}월 ${week}주차`
}

// ── Gemini 호출 ───────────────────────────────────────────────────
async function callGemini(prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text:
`당신은 청소년 창업 플랫폼 'Insightship'의 수석 콘텐츠 전략가입니다.
전문성: 한국 스타트업 생태계 10년 분석, VC 심사역 출신, 청소년 창업 교육 전문가.

작성 규칙:
- ## 헤더로 바로 시작 (인사말·자기소개 절대 없이)
- 청소년(중고등학생)이 이해할 수 있는 언어
- 어려운 용어는 반드시 괄호로 설명: VC(벤처캐피탈, 스타트업 전문 투자회사)
- 마크다운 형식 (## 헤더, **굵게**, - 리스트)
- 구체적 수치·기업명·날짜 반드시 포함
- ~입니다/~했습니다/~합니다 체
- 글자수 규칙: 전체 3000~4000자, 각 섹션 500~700자
- 각 섹션은 완전한 문장으로 마무리 (절대 끊기지 않게)` }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 0.5,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(20000),
    }
  )
  if (!r.ok) throw new Error(`Gemini ${r.status}`)
  const d = await r.json()
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text || text.length < 500) throw new Error(`응답 너무 짧음: ${text?.length}자`)
  return text
}

// ── DB 저장 ───────────────────────────────────────────────────────
async function getAdminId() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?role=eq.admin&limit=1&select=id`,
    { headers: H() }
  )
  return (await r.json())?.[0]?.id
}

async function upsertArticle(title, body, tags, slug) {
  // 이미 있으면 내용 업데이트 (upsert)
  const check = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?slug=eq.${slug}&select=id&limit=1`,
    { headers: H() }
  )
  const existing = await check.json()

  const payload = {
    title, slug,
    body,
    excerpt: body.replace(/#+\s[^\n]+\n?/g, '').replace(/\*\*/g, '').trim().slice(0, 300),
    category: 'trend',
    status: 'published',
    tags,
    ai_summary: body.replace(/#+\s[^\n]+\n?/g, '').replace(/\*\*/g, '').trim().slice(0, 500),
    read_time: Math.max(5, Math.ceil(body.length / 400)),
    published_at: new Date().toISOString(),
  }

  if (existing?.length > 0) {
    // 업데이트
    await fetch(`${SUPABASE_URL}/rest/v1/articles?slug=eq.${slug}`, {
      method: 'PATCH',
      headers: { ...H(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    })
    return { updated: true }
  }

  // 새로 삽입
  const adminId = await getAdminId()
  const r = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
    method: 'POST',
    headers: { ...H(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ ...payload, author_id: adminId, is_duplicate: false, featured: false }),
  })
  if (r.status !== 201) throw new Error(`INSERT ${r.status}: ${await r.text().then(t => t.slice(0,100))}`)
  return { inserted: true }
}

// ── 메인 ─────────────────────────────────────────────────────────
export default async function handler(req) {
  // nodejs: req.headers는 객체 (get() 메서드 없음)
  // Edge:   req.headers는 Headers 인스턴스 (get() 있음)
  const getHeader = (name) => {
    if (typeof req.headers.get === 'function') return req.headers.get(name)
    return req.headers[name] || req.headers[name.toLowerCase()] || null
  }

  const isAuthed = getHeader('x-vercel-cron') === '1'
    || getHeader('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  // req.url: nodejs에서는 path만 ('/api/generate-report?from=...')
  const urlObj = new URL(req.url, 'https://placeholder.com')
  let from, to, label

  const fromParam = urlObj.searchParams.get('from')
  const toParam   = urlObj.searchParams.get('to')

  if (fromParam && toParam) {
    from  = new Date(fromParam + 'T00:00:00+09:00')
    to    = new Date(toParam   + 'T23:59:59+09:00')
    label = weekLabel(from)
  } else {
    // 기본: 이번 주 (토요일에 실행 → 그 주 월~토)
    const range = getThisWeekRange()
    from  = range.from
    to    = range.to
    label = weekLabel(from)
  }

  const fromISO = from.toISOString()
  const toISO   = to.toISOString()

  // 해당 주 뉴스 (ai_summary 있는 것)
  const newsR = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?ai_summary=not.is.null&category=eq.news&published_at=gte.${encodeURIComponent(fromISO)}&published_at=lte.${encodeURIComponent(toISO)}&select=title,ai_summary,tags&order=published_at.desc&limit=60`,
    { headers: H() }
  )
  const news = await newsR.json()

  if (!Array.isArray(news) || !news.length) {
    return new Response(JSON.stringify({
      error: '해당 기간 뉴스 없음',
      range: { from: fromISO, to: toISO, label },
    }), { status: 200 })
  }

  const newsSummary = news.slice(0, 30)
    .map((n, i) => `${i + 1}. ${n.title}\n   요약: ${n.ai_summary?.slice(0, 120)}`)
    .join('\n')

  const results = { label, news_count: news.length, generated: [], errors: [] }

  // type 파라미터: funding 또는 market (기본: funding)
  const reportType = urlObj.searchParams.get('type') || 'funding'

  // ── 리포트 생성 (단일, Edge 25초 이내) ───────────────────────
  if (reportType === 'funding') { try {
    // label: '2026년 3월 2주차' → '2026-03-w2'
  const [ly, lm, lw] = label.match(/(\d{4})년\s*(\d+)월\s*(\d+)주차/).slice(1)
  const weekCode = `${ly}-${lm.padStart(2,'0')}-w${lw}`
  const slug1 = `ai-funding-report-${weekCode}`
    const prompt1 = `다음은 ${label} (${fromISO.slice(0,10)} ~ ${toISO.slice(0,10)}) 한국 스타트업/창업 뉴스 ${news.length}개입니다.

${newsSummary}

**"${label} 한국 스타트업 투자·자금 동향 분석 리포트"** 를 작성하세요.

## 이번 주 핵심 요약 (500~700자)
이번 주 투자·자금 동향의 가장 중요한 3가지 변화. 수치와 기업명 포함. 완전한 문장으로 마무리.

## 주요 투자·펀딩 현황 (500~700자)
이번 주 주목할 투자 유치 사례, VC 동향, 분야별 투자 흐름. 완전한 문장으로 마무리.

## 섹터별 투자 트렌드 (500~700자)
AI, 바이오헬스케어, 에듀테크, 핀테크, 기후테크 등 섹터별 이번 주 투자 동향. 완전한 문장으로 마무리.

## 정부 지원 & 정책 동향 (500~700자)
창업 지원 프로그램, 지자체 정책, 규제 변화 등. 완전한 문장으로 마무리.

## 청소년 창업가를 위한 인사이트 (500~700자)
이번 주 투자 트렌드에서 중고등학생 창업가가 얻을 교훈과 지금 당장 할 수 있는 행동 2~3가지. 완전한 문장으로 마무리.

전체 2500~3000자, 각 섹션 400~500자 기준 엄수. 각 섹션 완전한 문장 마무리. ## 헤더로 시작.`

    const body1 = await callGemini(prompt1)
    const r1 = await upsertArticle(
      `[AI 리포트] ${label} 스타트업 투자·자금 동향`,
      body1,
      ['AI리포트', '투자동향', '스타트업', label],
      slug1
    )
    results.generated.push({ type: 'funding', slug: slug1, len: body1.length, ...r1 })
  } catch (e) {
    results.errors.push('funding: ' + e.message?.slice(0, 100))
  } }
  if (reportType === 'market') { try {
    const slug2 = `ai-market-report-${weekCode}`
    const prompt2 = `다음은 ${label} (${fromISO.slice(0,10)} ~ ${toISO.slice(0,10)}) 한국 스타트업/창업 뉴스 ${news.length}개입니다.

${newsSummary}

**"${label} 스타트업 생태계 시장 동향 분석 리포트"** 를 작성하세요.

## 이번 주 시장 핵심 변화 (500~700자)
이번 주 스타트업 시장에서 가장 중요한 변화 3가지. 수치와 사례 포함. 완전한 문장으로 마무리.

## 주목할 스타트업 & 기업 동향 (500~700자)
이번 주 뉴스에 등장한 주목할 스타트업·기업들의 움직임. 구체적 사례 포함. 완전한 문장으로 마무리.

## 기술 트렌드 분석 (500~700자)
AI, 에듀테크, 헬스케어, 로봇 등 이번 주 주목받은 기술 트렌드 심층 분석. 완전한 문장으로 마무리.

## 창업 생태계 지원 현황 (500~700자)
지자체·대학·기관의 창업 지원 프로그램, 행사, 교육 기회. 완전한 문장으로 마무리.

## 청소년 창업가 주목 포인트 (500~700자)
이번 주 트렌드에서 중고등학생 창업가가 특히 주목해야 할 내용과 지금 시작할 수 있는 행동 2~3가지. 완전한 문장으로 마무리.

전체 2500~3000자, 각 섹션 400~500자 기준 엄수. 각 섹션 완전한 문장 마무리. ## 헤더로 시작.`

    const body2 = await callGemini(prompt2)
    const r2 = await upsertArticle(
      `[AI 리포트] ${label} 스타트업 생태계 시장 동향`,
      body2,
      ['AI리포트', '시장분석', '트렌드', label],
      slug2
    )
    results.generated.push({ type: 'market', slug: slug2, len: body2.length, ...r2 })
  } catch (e) {
    results.errors.push('market: ' + e.message?.slice(0, 100))
  } }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
