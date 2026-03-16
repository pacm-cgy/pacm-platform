// 어드민 AI 작성 보조
// Claude API (primary) → Gemini (fallback)
export const config = { runtime: 'edge' }

const GEMINI_KEY = process.env.GEMINI_API_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const CRON_SECRET = process.env.CRON_SECRET
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const SYSTEM_PROMPTS = {
  trend_report: `당신은 청소년 창업 플랫폼 'Insightship' 운영팀의 트렌드 분석가입니다.
운영자가 트렌드 리포트를 작성할 때 최신 시장 동향, 데이터, 인사이트를 제공해주세요.
출력 형식: 마크다운 (볼드, 헤더, 불릿 사용)`,

  insight_article: `당신은 청소년 창업 플랫폼 'Insightship'의 콘텐츠 에디터입니다.
청소년 창업가(중·고등학생)를 위한 인사이트 아티클 초안 및 아이디어를 제공해주세요.
어려운 용어는 쉽게 설명하고, 실제 사례를 포함하세요.
출력 형식: 마크다운`,

  newsletter: `당신은 창업 뉴스레터 에디터입니다.
이번 주 주목할 창업/스타트업 뉴스, 트렌드, 인사이트를 요약하고 뉴스레터 초안을 작성해주세요.
출력 형식: 뉴스레터 형식 (이메일용)`,

  market_analysis: `당신은 스타트업 생태계 분석가입니다.
한국 스타트업/창업 시장의 현재 동향, 주목할 투자 섹터, 기회와 위험 요인을 분석해주세요.
출력 형식: 마크다운 구조화 보고서`,

  story_interview: `당신은 청소년 창업가 인터뷰 작가입니다.
창업자의 정보를 바탕으로 인터뷰 질문지와 스토리 초안을 작성해주세요.
청소년 독자가 공감하고 배울 수 있는 내용을 중심으로 작성하세요.
출력 형식: 마크다운`,

  general: `당신은 청소년 창업 플랫폼 'Insightship'의 AI 작성 보조입니다.
운영자의 요청에 맞게 콘텐츠 작성, 분석, 아이디어 제공 등을 도와주세요.`,
}

export default async function handler(req) {
  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  // 인증
  const auth = req.headers.get('authorization')
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron && auth !== 'Bearer ' + CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: corsHeaders()
    })
  }

  const { type = 'general', prompt, context = '', useSearch = false } = await req.json().catch(() => ({}))
  if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), {
    status: 400, headers: corsHeaders()
  })

  const systemPrompt = SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.general

  // 최근 뉴스 컨텍스트 (뉴스레터/트렌드/시장분석 시)
  let newsContext = ''
  if (['newsletter', 'trend_report', 'market_analysis'].includes(type)) {
    try {
      const newsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&status=eq.published&select=title,ai_category&order=published_at.desc&limit=15`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY } }
      )
      const recentNews = await newsRes.json()
      if (recentNews?.length) {
        newsContext = '\n\n[최근 플랫폼 뉴스]\n' +
          recentNews.map(n => `• [${n.ai_category || '뉴스'}] ${n.title}`).join('\n')
      }
    } catch {}
  }

  const fullPrompt = (context ? `[작업 컨텍스트]\n${context}\n\n` : '') +
    `[요청]\n${prompt}` + newsContext

  // 1. Claude API 시도
  if (ANTHROPIC_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: 'user', content: fullPrompt }],
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (r.ok) {
        const d = await r.json()
        const text = d.content?.[0]?.text?.trim()
        if (text) {
          return new Response(JSON.stringify({
            result: text,
            sources: [],
            type,
            model: 'claude-haiku-4-5',
            tokens: d.usage?.input_tokens + d.usage?.output_tokens || 0,
            timestamp: new Date().toISOString(),
          }), { status: 200, headers: corsHeaders() })
        }
      }
    } catch {}
  }

  // 2. Gemini 폴백
  if (GEMINI_KEY) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt + '\n\n' + fullPrompt }] }],
            generationConfig: { maxOutputTokens: 1200, temperature: 0.5 },
          }),
          signal: AbortSignal.timeout(25000),
        }
      )
      if (r.ok) {
        const d = await r.json()
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (text) {
          return new Response(JSON.stringify({
            result: text,
            sources: [],
            type,
            model: 'gemini-2.0-flash',
            tokens: 0,
            timestamp: new Date().toISOString(),
          }), { status: 200, headers: corsHeaders() })
        }
      }
    } catch {}
  }

  return new Response(JSON.stringify({ error: 'AI 응답 실패. 잠시 후 다시 시도해주세요.' }), {
    status: 500, headers: corsHeaders()
  })
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}
