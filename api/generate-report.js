// AI 트렌드/투자 분석 리포트 자동 생성
// Gemini API 활용, 매주 월요일 실행
export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY = process.env.GEMINI_API_KEY
const CRON_SECRET = process.env.CRON_SECRET

const REPORT_TYPES = [
  { type: 'funding', label: '투자/자금', tag: '[AI 정리본]', category: 'insight' },
  { type: 'market',  label: '시장 분석', tag: '[AI 정리본]', category: 'trend'   },
]

async function callGemini(prompt, maxTokens = 2000) {
  if (!GEMINI_KEY) return null
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
        }),
        signal: AbortSignal.timeout(45000),
      }
    )
    if (!r.ok) return null
    const d = await r.json()
    return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
  } catch { return null }
}

async function getRecentNews(category_keywords) {
  // 최근 7일 뉴스 가져오기
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&published_at=gte.${since}&select=title,ai_summary,ai_category,source_name&order=published_at.desc&limit=30`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY } }
  )
  const all = await res.json()
  // 카테고리 필터
  return (all || []).filter(a =>
    category_keywords.some(k => (a.title + (a.ai_summary || '')).toLowerCase().includes(k))
  ).slice(0, 15)
}

async function generateFundingReport(news) {
  const newsText = news.map((n, i) =>
    `${i+1}. ${n.title}\n   ${n.ai_summary || ''}`
  ).join('\n\n')

  const prompt = `당신은 청소년 창업 플랫폼 Insightship의 전문 투자 분석가입니다.
아래 최근 1주일 투자/자금 관련 뉴스를 바탕으로 청소년 독자를 위한 심층 분석 리포트를 작성하세요.

최근 뉴스:
${newsText}

리포트 작성 규칙:
1. 제목: "[AI 정리본] YYYY년 MM월 W주차 한국 스타트업 투자 동향 분석"
2. 구성: 이번 주 핵심 요약 → 주목할 투자 동향 → 분야별 분석 → 청소년 창업가를 위한 인사이트
3. 어려운 금융/투자 용어는 반드시 쉽게 설명 (예: 시리즈 A = 본격 성장을 위한 첫 번째 대규모 투자)
4. 실제 수치와 팩트 중심으로 작성
5. 추측이나 과장 없이 사실만 기재
6. 마지막에 "청소년 창업가를 위한 한 줄 인사이트" 코너 필수
7. 전체 1200-1500자 내외
8. 오타 없이 전문적으로 작성

리포트 본문만 출력하세요:`

  return await callGemini(prompt, 1500)
}

async function generateMarketReport(news) {
  const newsText = news.map((n, i) =>
    `${i+1}. ${n.title}\n   ${n.ai_summary || ''}`
  ).join('\n\n')

  const prompt = `당신은 청소년 창업 플랫폼 Insightship의 전문 시장 분석가입니다.
아래 최근 1주일 뉴스를 바탕으로 청소년 독자를 위한 시장 동향 분석 리포트를 작성하세요.

최근 뉴스:
${newsText}

리포트 작성 규칙:
1. 제목: "[AI 정리본] YYYY년 MM월 W주차 스타트업 생태계 시장 분석"
2. 구성: 주간 핵심 트렌드 → 주목 섹터 분석 → 기회와 위협 요인 → 청소년 창업가 관점
3. TAM/SAM/SOM, PMF 등 창업 개념은 반드시 풀어서 설명
4. 데이터와 수치 중심으로 신뢰성 확보
5. 사실만 기재, 과장 없음
6. 전체 1200-1500자 내외

리포트 본문만 출력하세요:`

  return await callGemini(prompt, 1500)
}

export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  if (!GEMINI_KEY) return new Response(JSON.stringify({ error: 'GEMINI_API_KEY 없음' }), { status: 500 })

  const results = { generated: [], errors: [] }
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const dateStr = `${kst.getFullYear()}년 ${kst.getMonth()+1}월`
  const weekNum = Math.ceil(kst.getDate() / 7)

  // 1. 투자/자금 리포트
  try {
    const fundingNews = await getRecentNews(['투자', 'vc', '펀딩', '시리즈', '유치', '억원'])
    if (fundingNews.length >= 3) {
      const content = await generateFundingReport(fundingNews)
      if (content) {
        const title = `[AI 정리본] ${dateStr} ${weekNum}주차 한국 스타트업 투자 동향 분석`
        const slug = `ai-funding-${Date.now()}`
        // articles 테이블에 저장 (어드민 계정으로)
        const r = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            title,
            slug,
            body: content,
            excerpt: content.slice(0, 300),
            category: 'insight',
            status: 'published',
            tags: ['AI정리본', '투자동향', '스타트업'],
            ai_summary: content.slice(0, 400),
            ai_category: 'funding',
            read_time: Math.ceil(content.length / 500),
            published_at: now.toISOString(),
          }),
        })
        if (r.status === 201) results.generated.push('funding: ' + title.slice(0, 30))
        else results.errors.push('funding insert: ' + r.status)
      }
    }
  } catch (e) { results.errors.push('funding: ' + e.message?.slice(0, 50)) }

  // 2. 시장 분석 리포트
  try {
    const marketNews = await getRecentNews(['스타트업', 'ai', '시장', '성장', '플랫폼', '서비스'])
    if (marketNews.length >= 3) {
      const content = await generateMarketReport(marketNews)
      if (content) {
        const title = `[AI 정리본] ${dateStr} ${weekNum}주차 스타트업 생태계 시장 분석`
        const slug = `ai-market-${Date.now()}`
        const r = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            title,
            slug,
            body: content,
            excerpt: content.slice(0, 300),
            category: 'insight',
            status: 'published',
            tags: ['AI정리본', '시장분석', '트렌드'],
            ai_summary: content.slice(0, 400),
            ai_category: 'market',
            read_time: Math.ceil(content.length / 500),
            published_at: now.toISOString(),
          }),
        })
        if (r.status === 201) results.generated.push('market: ' + title.slice(0, 30))
        else results.errors.push('market insert: ' + r.status)
      }
    }
  } catch (e) { results.errors.push('market: ' + e.message?.slice(0, 50)) }

  return new Response(JSON.stringify({ ...results, timestamp: now.toISOString() }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
