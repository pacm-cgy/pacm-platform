// 어드민 AI 작성 보조 - 시장 분석, 트렌드 리포트, 뉴스레터 작성 지원
// Gemini 2.0 Flash + Google Search
export const config = { runtime: 'edge' }

const GEMINI_KEY = process.env.GEMINI_API_KEY
const CRON_SECRET = process.env.CRON_SECRET
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// 작업 유형별 시스템 프롬프트
const SYSTEM_PROMPTS = {
  // 트렌드 리포트 작성 보조
  trend_report: `당신은 청소년 창업 플랫폼 'Insightship' 운영팀의 트렌드 분석가입니다.
운영자가 트렌드 리포트를 작성할 때 최신 시장 동향, 데이터, 인사이트를 제공해주세요.
웹 검색으로 최신 정보를 수집하여 활용하세요.
출력 형식: 마크다운 (볼드, 헤더, 불릿 사용)`,

  // 인사이트 아티클 작성 보조
  insight_article: `당신은 청소년 창업 플랫폼 'Insightship'의 콘텐츠 에디터입니다.
청소년 창업가(중·고등학생)를 위한 인사이트 아티클 초안 및 아이디어를 제공해주세요.
어려운 용어는 쉽게 설명하고, 실제 사례를 포함하세요.
출력 형식: 마크다운`,

  // 뉴스레터 작성 보조
  newsletter: `당신은 창업 뉴스레터 에디터입니다.
이번 주 주목할 창업/스타트업 뉴스, 트렌드, 인사이트를 요약하고 뉴스레터 초안을 작성해주세요.
웹 검색으로 최신 뉴스를 확인하여 활용하세요.
출력 형식: 뉴스레터 형식 (이메일용)`,

  // 시장 분석
  market_analysis: `당신은 스타트업 생태계 분석가입니다.
한국 스타트업/창업 시장의 현재 동향, 주목할 투자 섹터, 기회와 위험 요인을 분석해주세요.
웹 검색으로 최신 데이터를 수집하여 근거 기반으로 분석하세요.
출력 형식: 마크다운 구조화 보고서`,

  // 창업자 스토리 인터뷰 보조
  story_interview: `당신은 청소년 창업가 인터뷰 작가입니다.
창업자의 정보를 바탕으로 인터뷰 질문지와 스토리 초안을 작성해주세요.
청소년 독자가 공감하고 배울 수 있는 내용을 중심으로 작성하세요.
출력 형식: 마크다운`,

  // 자유 요청
  general: `당신은 청소년 창업 플랫폼 'Insightship'의 AI 작성 보조입니다.
운영자의 요청에 맞게 콘텐츠 작성, 분석, 아이디어 제공 등을 도와주세요.
필요시 웹 검색으로 최신 정보를 수집하세요.`,
}

export default async function handler(req) {
  // 어드민 인증 - CRON_SECRET 또는 x-vercel-cron 헤더
  const auth = req.headers.get('authorization')
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron && auth !== 'Bearer ' + CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { type = 'general', prompt, context = '', useSearch = true } = await req.json().catch(() => ({}))
  if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400 })

  const systemPrompt = SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.general

  // Supabase에서 최근 뉴스 컨텍스트 가져오기 (선택)
  let newsContext = ''
  if (useSearch && (type === 'newsletter' || type === 'trend_report' || type === 'market_analysis')) {
    try {
      const newsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&status=eq.published&select=title,ai_summary,ai_category&order=published_at.desc&limit=20`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY } }
      )
      const recentNews = await newsRes.json()
      if (recentNews?.length) {
        newsContext = '\n\n[최근 플랫폼 뉴스 데이터]\n' +
          recentNews.slice(0, 10).map(n => `• [${n.ai_category}] ${n.title}`).join('\n')
      }
    } catch {}
  }

  const fullPrompt = systemPrompt + '\n\n' +
    (context ? `[현재 작업 컨텍스트]\n${context}\n\n` : '') +
    `[요청]\n${prompt}` +
    newsContext

  try {
    const body = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        maxOutputTokens: 1500,
        temperature: 0.5,
      },
    }

    // 검색 필요한 타입은 Google Search 활성화
    if (useSearch && ['newsletter', 'trend_report', 'market_analysis'].includes(type)) {
      body.tools = [{ googleSearch: {} }]
    }

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      }
    )

    if (!r.ok) {
      const err = await r.text()
      return new Response(JSON.stringify({ error: 'Gemini API 오류', detail: err.slice(0, 200) }), { status: 500 })
    }

    const d = await r.json()
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    const groundingChunks = d.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    const sources = groundingChunks.slice(0, 5).map(c => ({
      title: c.web?.title || '',
      url: c.web?.uri || '',
    })).filter(s => s.url)

    if (!text) return new Response(JSON.stringify({ error: 'AI 응답 없음' }), { status: 500 })

    return new Response(JSON.stringify({
      result: text,
      sources,
      type,
      model: 'gemini-2.0-flash' + (body.tools ? '+search' : ''),
      tokens: d.usageMetadata?.totalTokenCount || 0,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message?.slice(0, 100) || '알 수 없는 오류' }), { status: 500 })
  }
}
