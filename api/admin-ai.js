// 어드민 AI 작성 보조
// Gemini 2.5 Pro (무료 최강) → 2.0 Flash 폴백 + RAG 컨텍스트 자동 주입
export const config = { runtime: 'edge' }

const GEMINI_KEY  = process.env.GEMINI_API_KEY
const CRON_SECRET = process.env.CRON_SECRET
const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── 전문가 시스템 프롬프트 ────────────────────────────────────────
const BASE_IDENTITY = `당신은 청소년 창업 플랫폼 'Insightship'의 수석 콘텐츠 전략가이자 AI 어시스턴트입니다.
보유 전문성:
- 한국 스타트업 생태계 10년 분석 경력
- 중고등학생 대상 창업 교육 전문가
- VC(벤처캐피탈) 심사역 출신 투자 분석가
- 경제/비즈니스 저널리스트 경력
- 마케팅 및 콘텐츠 전략 전문가

플랫폼 특성:
- 대상: 창업에 관심 있는 청소년(중·고등학생) 및 교육자/멘토
- 톤: 전문적이되 쉽게 이해되는, 희망적이고 실용적인
- 언어: 어려운 용어는 반드시 괄호로 쉬운 설명 추가
- 문체: ~입니다/~했습니다/~합니다 체`

const TYPE_PROMPTS = {
  trend_report: `${BASE_IDENTITY}

현재 임무: 트렌드 리포트 작성 보조
- 최신 한국 스타트업/창업 시장 데이터와 인사이트 제공
- 구체적 수치와 사례 반드시 포함
- 청소년 창업가가 이해하고 활용할 수 있는 수준으로 작성
- 마크다운 형식 (헤더, 볼드, 리스트 활용)`,

  insight_article: `${BASE_IDENTITY}

현재 임무: 인사이트 아티클 작성 보조
- 청소년 창업가(중·고등학생)가 바로 적용 가능한 실전 인사이트
- 스토리텔링 방식으로 흥미롭게 시작
- 핵심 개념 + 실제 사례 + 실천 가이드 구조
- 어려운 창업/비즈니스 용어는 반드시 쉽게 풀어서 설명
- 마크다운 형식`,

  newsletter: `${BASE_IDENTITY}

현재 임무: 뉴스레터 작성 보조
- 이번 주 가장 중요한 창업/스타트업 뉴스 3~5개 선별
- 각 뉴스가 청소년 창업가에게 왜 중요한지 설명
- 이메일 뉴스레터 형식 (인사 → 헤드라인 → 상세 → 마무리)
- 읽는 데 5분 이내 분량
- 마크다운 형식`,

  market_analysis: `${BASE_IDENTITY}

현재 임무: 시장 분석 보고서 작성 보조
- 한국 스타트업 생태계 현재 상황 분석
- 주목할 투자 섹터와 기회 요인
- 위험 요인과 주의사항
- 데이터 기반 근거 제시
- 구조화된 마크다운 보고서 형식`,

  story_interview: `${BASE_IDENTITY}

현재 임무: 창업자 스토리/인터뷰 작성 보조
- 청소년 독자가 공감하고 배울 수 있는 스토리
- 성공과 실패를 모두 솔직하게 다루는 내러티브
- 인터뷰 질문지와 스토리 구성안 제공
- 핵심 교훈을 청소년이 바로 적용할 수 있게 정리
- 마크다운 형식`,

  general: `${BASE_IDENTITY}

현재 임무: 운영자 요청에 맞는 콘텐츠 작성/분석 지원
- 요청 내용에 가장 적합한 형식으로 응답
- 항상 청소년 창업 플랫폼의 정체성 유지`,
}

// ── RAG 검색 ─────────────────────────────────────────────────────
async function getRAGContext(query, type) {
  try {
    const category = {
      trend_report: 'trend',
      market_analysis: 'market',
      insight_article: 'insight',
    }[type] || null

    const url = category
      ? `${SB_URL}/rest/v1/ai_knowledge?category=eq.${category}&quality=gte.7&order=quality.desc,use_count.desc&limit=4`
      : `${SB_URL}/rest/v1/ai_knowledge?quality=gte.7&order=quality.desc,use_count.desc&limit=4`

    const r = await fetch(url, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
    })
    const d = await r.json()
    if (!Array.isArray(d) || !d.length) return ''

    return '\n\n[플랫폼 누적 지식베이스 - 자동 주입됨]\n' +
      d.map(k => `• [${k.category}] ${k.content}`).join('\n')
  } catch { return '' }
}

// ── 최근 뉴스 컨텍스트 ───────────────────────────────────────────
async function getNewsContext(type) {
  if (!['newsletter', 'trend_report', 'market_analysis'].includes(type)) return ''
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/articles?source_name=not.is.null&status=eq.published&select=title,ai_summary,ai_category&order=published_at.desc&limit=10`,
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    )
    const d = await r.json()
    if (!Array.isArray(d) || !d.length) return ''
    return '\n\n[최근 플랫폼 수집 뉴스]\n' +
      d.map(n => `• [${n.ai_category || '뉴스'}] ${n.title}`).join('\n')
  } catch { return '' }
}

// ── Gemini 호출 ───────────────────────────────────────────────────
async function callGemini(systemPrompt, userPrompt, model, timeoutMs = 30000) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 0.5,
          topP: 0.9,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }
  )
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(`${r.status}: ${e.error?.message?.slice(0, 60) || ''}`)
  }
  const d = await r.json()
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) throw new Error('empty')
  return { text, model }
}

// ── 피드백 저장 ───────────────────────────────────────────────────
async function saveFeedback(type, prompt, result) {
  try {
    await fetch(`${SB_URL}/rest/v1/ai_feedback`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        session_type: type,
        prompt_summary: prompt.slice(0, 100),
        response_summary: result.slice(0, 200),
      }),
    })
  } catch {}
}

// ── 메인 핸들러 ───────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const auth = req.headers.get('authorization')
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron && auth !== 'Bearer ' + CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders() })
  }

  const { type = 'general', prompt, context = '' } = await req.json().catch(() => ({}))
  if (!prompt) {
    return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400, headers: corsHeaders() })
  }

  const systemPrompt = TYPE_PROMPTS[type] || TYPE_PROMPTS.general

  // RAG + 뉴스 컨텍스트 병렬 로드
  const [ragContext, newsContext] = await Promise.all([
    getRAGContext(prompt, type),
    getNewsContext(type),
  ])

  const fullPrompt = [
    context ? `[운영자 작업 컨텍스트]\n${context}` : '',
    `[요청]\n${prompt}`,
    ragContext,
    newsContext,
  ].filter(Boolean).join('\n\n')

  let result = null
  let modelUsed = null

  // Gemini 2.5 Pro (무료 최강) → 2.0 Flash 폴백
  try {
    const r = await callGemini(systemPrompt, fullPrompt, 'gemini-2.5-pro-exp-03-25', 35000)
    result = r.text
    modelUsed = 'gemini-2.5-pro-exp'
  } catch {
    try {
      const r = await callGemini(systemPrompt, fullPrompt, 'gemini-2.0-flash-001', 25000)
      result = r.text
      modelUsed = 'gemini-2.0-flash-001'
    } catch (e) {
      return new Response(JSON.stringify({ error: 'AI 응답 실패. 잠시 후 다시 시도해주세요.', detail: e.message }), {
        status: 500, headers: corsHeaders()
      })
    }
  }

  // 피드백 기록 (비동기)
  saveFeedback(type, prompt, result)

  return new Response(JSON.stringify({
    result,
    type,
    model: modelUsed,
    rag_used: ragContext.length > 0,
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: corsHeaders() })
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}
