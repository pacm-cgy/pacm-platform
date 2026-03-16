// AI 트렌드/투자 분석 리포트 자동 생성
export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY = process.env.GEMINI_API_KEY
const CRON_SECRET = process.env.CRON_SECRET
const ADMIN_ID = 'fed9669b-376a-4ae0-850e-57b04aee2dfe'

async function callGemini(prompt) {
  if (!GEMINI_KEY) return null
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2000, temperature: 0.4 },
        }),
        signal: AbortSignal.timeout(50000),
      }
    )
    if (!r.ok) {
      const err = await r.text()
      throw new Error(`Gemini ${r.status}: ${err.slice(0,100)}`)
    }
    const d = await r.json()
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!text) throw new Error('Gemini 응답 없음')
    return text
  } catch (e) {
    throw e
  }
}

async function getRecentNews() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&published_at=gte.${encodeURIComponent(since)}&select=title,excerpt,ai_summary,ai_category&order=published_at.desc&limit=40`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  )
  if (!res.ok) throw new Error(`뉴스 조회 실패: ${res.status}`)
  return await res.json()
}

async function insertArticle(title, body, tags, slug) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      title,
      slug,
      author_id: ADMIN_ID,
      body,
      excerpt: body.slice(0, 300),
      category: 'insight',
      status: 'published',
      tags,
      ai_summary: body.slice(0, 400),
      read_time: Math.ceil(body.length / 500),
      published_at: new Date().toISOString(),
    }),
  })
  const text = await r.text()
  if (r.status !== 201) throw new Error(`INSERT ${r.status}: ${text.slice(0, 100)}`)
  return JSON.parse(text)?.[0]
}

export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === `Bearer ${CRON_SECRET}`
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  if (!GEMINI_KEY) return new Response(JSON.stringify({ error: 'GEMINI_API_KEY 없음' }), { status: 500 })

  const results = { generated: [], errors: [], news_count: 0 }
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const dateStr = `${kst.getFullYear()}년 ${String(kst.getMonth()+1).padStart(2,'0')}월`
  const weekNum = Math.ceil(kst.getDate() / 7)

  // 뉴스 가져오기
  let allNews = []
  try {
    allNews = await getRecentNews()
    results.news_count = allNews.length
  } catch (e) {
    results.errors.push('뉴스조회: ' + e.message)
    return new Response(JSON.stringify(results), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  if (!allNews.length) {
    results.errors.push('최근 30일 뉴스 없음')
    return new Response(JSON.stringify(results), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const makeNewsText = (news) => news.map((n, i) =>
    `${i+1}. ${n.title}\n   ${n.ai_summary || n.excerpt || ''}`
  ).join('\n\n')

  // ── 1. 투자/자금 리포트 ──────────────────────────────────
  try {
    const fundingKws = ['투자', 'vc', '펀딩', '시리즈', '유치', '억원', '라운드']
    const fundingNews = allNews.filter(n =>
      fundingKws.some(k => (n.title + (n.ai_summary||n.excerpt||'')).toLowerCase().includes(k))
    ).slice(0, 12)

    const newsText = makeNewsText(fundingNews.length ? fundingNews : allNews.slice(0, 10))

    const prompt = `당신은 청소년 창업 플랫폼 Insightship의 전문 투자 분석가입니다.
아래 최근 뉴스를 바탕으로 한국 스타트업 투자/자금 동향 분석 리포트를 작성하세요.

뉴스 목록:
${newsText}

작성 규칙:
- 제목 없이 본문만 작성 (제목은 시스템이 자동 생성)
- 구성: 【이번 주 핵심 요약】→【투자 동향 분석】→【주목 스타트업】→【청소년 창업가를 위한 인사이트】
- 어려운 용어는 반드시 괄호로 쉽게 설명 (예: 시리즈 A(본격 성장 단계 투자))
- 사실과 수치 중심, 추측 없음
- 전체 900~1200자
- 오타 없음, 전문적 문체
- 마지막 줄: "📌 한 줄 인사이트: [청소년 창업가에게 전하는 핵심 메시지]"

본문만 출력:`

    const body = await callGemini(prompt)
    if (body && body.length > 100) {
      const title = `[AI 정리본] ${dateStr} ${weekNum}주차 한국 스타트업 투자 동향`
      const slug = `ai-funding-report-${Date.now()}`
      const inserted = await insertArticle(title, body, ['AI정리본', '투자동향', '스타트업'], slug)
      results.generated.push({ type: 'funding', title, id: inserted?.id })
    }
  } catch (e) {
    results.errors.push('funding: ' + e.message?.slice(0, 100))
  }

  // ── 2. 시장 분석 리포트 ──────────────────────────────────
  try {
    const marketKws = ['ai', '인공지능', '시장', '성장', '플랫폼', '에듀테크', '기후', '헬스', '핀테크']
    const marketNews = allNews.filter(n =>
      marketKws.some(k => (n.title + (n.ai_summary||n.excerpt||'')).toLowerCase().includes(k))
    ).slice(0, 12)

    const newsText = makeNewsText(marketNews.length ? marketNews : allNews.slice(0, 10))

    const prompt = `당신은 청소년 창업 플랫폼 Insightship의 전문 시장 분석가입니다.
아래 최근 뉴스를 바탕으로 스타트업 생태계 시장 동향 분석 리포트를 작성하세요.

뉴스 목록:
${newsText}

작성 규칙:
- 제목 없이 본문만 작성
- 구성: 【이번 주 시장 트렌드】→【주목 섹터 분석】→【기회와 위협】→【청소년 창업가 관점】
- TAM, PMF, MVP 등 창업 용어는 반드시 쉽게 설명
- 사실 중심, 수치 포함, 추측 없음
- 전체 900~1200자
- 오타 없음
- 마지막 줄: "📌 한 줄 인사이트: [청소년 창업가에게 전하는 핵심 메시지]"

본문만 출력:`

    const body = await callGemini(prompt)
    if (body && body.length > 100) {
      const title = `[AI 정리본] ${dateStr} ${weekNum}주차 스타트업 시장 분석`
      const slug = `ai-market-report-${Date.now()}`
      const inserted = await insertArticle(title, body, ['AI정리본', '시장분석', '트렌드'], slug)
      results.generated.push({ type: 'market', title, id: inserted?.id })
    }
  } catch (e) {
    results.errors.push('market: ' + e.message?.slice(0, 100))
  }

  return new Response(JSON.stringify(results), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
