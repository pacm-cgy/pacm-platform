// 트렌드 "왜 그럴까?" AI 분석
// Gemini 2.5 Pro Experimental (무료 최강) → 2.0 Flash 폴백
// + RAG: Supabase 지식베이스에서 관련 데이터 자동 주입
export const config = { runtime: 'edge' }

const GEMINI_KEY    = process.env.GEMINI_API_KEY
const SB_URL        = process.env.SUPABASE_URL
const SB_KEY        = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── Gemini 텍스트 임베딩 (RAG용) ─────────────────────────────────
async function getEmbedding(text) {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_QUERY',
        }),
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!r.ok) return null
    const d = await r.json()
    return d.embedding?.values || null
  } catch { return null }
}

// ── Supabase RAG 검색 ─────────────────────────────────────────────
async function searchKnowledge(query, category = null) {
  try {
    const embedding = await getEmbedding(query)
    if (!embedding) {
      // 임베딩 실패 시 키워드 검색으로 폴백
      const q = category
        ? `${SB_URL}/rest/v1/ai_knowledge?category=eq.${category}&quality=gte.7&order=quality.desc&limit=3`
        : `${SB_URL}/rest/v1/ai_knowledge?quality=gte.7&order=quality.desc&limit=3`
      const r = await fetch(q, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
      const d = await r.json()
      return Array.isArray(d) ? d : []
    }

    // 벡터 유사도 검색
    const r = await fetch(`${SB_URL}/rest/v1/rpc/match_knowledge`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query_embedding: embedding,
        match_threshold: 0.6,
        match_count: 4,
        filter_category: category || null,
      }),
    })
    const d = await r.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

// ── Gemini 호출 ───────────────────────────────────────────────────
async function callGemini(prompt, model, timeoutMs = 25000) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 900,
          temperature: 0.4,
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
  if (!text) throw new Error('empty response')
  return text
}

// ── 전문가 프롬프트 빌더 ──────────────────────────────────────────
function buildPrompt(metric_name, metric_value, metric_unit, change_pct, category, source_name, ragContext) {
  const dir = (change_pct || 0) > 0 ? '상승' : (change_pct || 0) < 0 ? '하락' : '보합'
  const abs = Math.abs(change_pct || 0).toFixed(1)

  const contextSection = ragContext?.length
    ? `\n[참고: 플랫폼 누적 지식베이스]\n${ragContext.map(k => `• ${k.content}`).join('\n')}\n`
    : ''

  return `당신은 다음 전문 자격을 보유한 한국 스타트업 생태계 수석 애널리스트입니다:
- 중소벤처기업부 창업정책 자문위원 (10년 경력)
- 한국벤처캐피탈협회 VC 심사역 (누적 심사 300개 스타트업)
- 청소년 창업 교육 전문가 (전국 고등학교 강의, 청소년 창업 멘토링)
- 스타트업 생태계 리서치 보고서 150편 발행
- 실제 스타트업 창업 및 엑싯(Exit) 경험 보유
${contextSection}
[분석할 트렌드 지표]
지표명: ${metric_name}
현재값: ${metric_value}${metric_unit || ''}
변화율: 전년 대비 ${dir} ${abs}%
분야: ${category || '스타트업/창업'}
데이터 출처: ${source_name || '공공기관 공식 데이터'}

위 지표에 대해 "왜 이 트렌드가 생겼을까?"를 청소년 창업가(중·고등학생)가 완전히 이해할 수 있도록 분석해주세요.

**📌 왜 이 트렌드가 생겼나**
이 지표 변화의 핵심 원인 2~3가지를 설명하세요. 정책 변화, 기술 발전, 글로벌 트렌드, 시장 수요 변화 등을 구체적으로 다루세요. 어려운 용어는 반드시 괄호 안에 쉽게 설명하세요. 예) VC(벤처캐피탈, 유망한 스타트업에 투자해서 수익을 내는 전문 투자회사)

**📊 지금 시장은 어떤 상황인가**
현재 한국 시장의 구체적 동향을 수치나 실제 사례와 함께 설명하세요. 글로벌 동향과 한국 시장의 연관성도 언급하세요.

**🚀 청소년 창업가에게 어떤 의미인가**
이 트렌드가 만드는 창업 기회와 지금 준비할 수 있는 구체적 행동 1~2가지를 제시하세요. 실현 가능하고 희망적인 톤으로 작성하세요.

문체: ~입니다/~했습니다/~합니다 체 | 전체 450~550자 | 섹션 헤더 굵게(**) | 분석 내용만 출력`
}

// ── 피드백 저장 ───────────────────────────────────────────────────
async function saveFeedback(type, prompt_summary, response_summary) {
  try {
    await fetch(`${SB_URL}/rest/v1/ai_feedback`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ session_type: type, prompt_summary, response_summary }),
    })
  } catch {}
}

// ── 지식 사용 카운트 업 ──────────────────────────────────────────
async function incrementUseCount(ids) {
  if (!ids?.length) return
  try {
    await fetch(`${SB_URL}/rest/v1/rpc/increment_knowledge_use`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_ids: ids }),
    })
  } catch {}
}

// ── 메인 핸들러 ───────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const {
    metric_name, metric_value, metric_unit,
    change_pct, category, source_name
  } = await req.json().catch(() => ({}))

  if (!metric_name) {
    return new Response(JSON.stringify({ error: 'metric_name required' }), {
      status: 400, headers: corsHeaders()
    })
  }

  // 1. RAG: 관련 지식 검색
  const ragDocs = await searchKnowledge(
    `${metric_name} ${category || ''} 스타트업 창업 트렌드`,
    category && ['trend', 'market', 'insight'].includes(category) ? category : null
  )

  // 2. 프롬프트 생성
  const prompt = buildPrompt(metric_name, metric_value, metric_unit, change_pct, category, source_name, ragDocs)

  let analysis = null
  let modelUsed = null
  let error = null

  // 3. Gemini 2.5 Pro Experimental (무료 최강)
  try {
    analysis = await callGemini(prompt, 'gemini-2.5-pro-exp-03-25', 30000)
    modelUsed = 'gemini-2.5-pro-exp'
  } catch (e1) {
    // 4. Gemini 2.0 Flash 폴백
    try {
      analysis = await callGemini(prompt, 'gemini-2.0-flash', 20000)
      modelUsed = 'gemini-2.0-flash'
    } catch (e2) {
      error = e2.message
    }
  }

  if (!analysis) {
    return new Response(JSON.stringify({ error: 'AI 분석 실패', detail: error }), {
      status: 200, headers: corsHeaders()
    })
  }

  // 5. 피드백/사용 기록 (비동기, 응답 블로킹 안 함)
  saveFeedback('analyze_trend', metric_name, analysis.slice(0, 200))
  if (ragDocs?.length) incrementUseCount(ragDocs.map(d => d.id))

  return new Response(JSON.stringify({
    analysis,
    model: modelUsed,
    rag_docs_used: ragDocs?.length || 0,
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { ...corsHeaders(), 'Cache-Control': 'public, max-age=3600' }
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
