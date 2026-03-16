// 트렌드 AI 분석 - gemini-2.5-pro → 2.5-flash 폴백
// system_instruction 분리로 응답 끊김 완전 방지
export const config = { runtime: 'edge' }

const GEMINI_KEY = process.env.GEMINI_API_KEY
const SB_URL     = process.env.SUPABASE_URL
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── 시스템 역할 (분석 전문가) ────────────────────────────────────
const SYSTEM_ROLE = `당신은 한국 스타트업 생태계 전문 애널리스트이자 청소년 창업 교육 전문가입니다.
중기부 창업정책 자문, VC 심사역 10년, 청소년 창업 강의 전문가 경력을 보유하고 있습니다.

응답 규칙:
- 분석 내용만 출력 (자기소개, 인사말, "알겠습니다" 등 일절 없이)
- ~입니다/~했습니다/~합니다 체
- 어려운 용어는 반드시 괄호로 설명: 예) VC(벤처캐피탈, 스타트업 전문 투자회사)
- 섹션 헤더를 **굵게** 표시
- 3개 섹션 모두 완전하게 작성, 마지막 문장까지 끊기지 않게 출력`

// ── RAG 검색 ─────────────────────────────────────────────────────
async function searchKnowledge(query, category) {
  try {
    const q = category
      ? `${SB_URL}/rest/v1/ai_knowledge?category=eq.${category}&quality=gte.7&order=quality.desc&limit=3`
      : `${SB_URL}/rest/v1/ai_knowledge?quality=gte.7&order=quality.desc&limit=3`
    const r = await fetch(q, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
    const d = await r.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

// ── Gemini 호출 (system_instruction 분리) ────────────────────────
async function callGemini(model, systemText, userText, timeoutMs) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemText }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.4,
          topP: 0.95,
          stopSequences: [],
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }
  )
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(`${r.status}: ${e.error?.message?.slice(0, 80)}`)
  }
  const d = await r.json()
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) throw new Error('empty response')
  return text
}

// ── 지표 분석 프롬프트 ───────────────────────────────────────────
function metricPrompt(metric_name, metric_value, metric_unit, change_pct, category, source_name, ragDocs) {
  const dir = (change_pct || 0) > 0 ? '상승' : (change_pct || 0) < 0 ? '하락' : '유지'
  const abs = Math.abs(change_pct || 0).toFixed(1)
  const rag = ragDocs?.length
    ? `\n[관련 시장 데이터]\n${ragDocs.map(k => `• ${k.content}`).join('\n')}\n`
    : ''

  return `${rag}
[분석 지표]
지표명: ${metric_name}
현재값: ${metric_value}${metric_unit || ''}
변화율: 전년 대비 ${dir} ${abs}%
분야: ${category || '스타트업'}
출처: ${source_name || '공공기관'}

이 수치가 왜 이렇게 나왔는지 분석해주세요. 아래 3개 섹션으로 작성하세요.

**📌 왜 ${dir}했나**
핵심 원인 2~3가지. 정책·기술·시장 변화를 구체적으로 설명하세요.

**📊 시장 현황**
현재 한국 및 글로벌 시장 동향을 수치와 사례로 설명하세요.

**🚀 청소년 창업가에게**
이 트렌드가 만드는 창업 기회와 지금 준비할 수 있는 행동 1~2가지를 제시하세요.`
}

// ── 섹터 분석 프롬프트 ───────────────────────────────────────────
function sectorPrompt(sector_name, sector_note, ragDocs) {
  const rag = ragDocs?.length
    ? `\n[관련 시장 데이터]\n${ragDocs.map(k => `• ${k.content}`).join('\n')}\n`
    : ''
  return `${rag}
[분석 섹터]
섹터명: ${sector_name}
특징: ${sector_note || ''}

이 섹터가 왜 지금 트렌드가 되었는지 분석해주세요. 아래 3개 섹션으로 작성하세요.

**📌 왜 트렌드가 되었나**
핵심 원인 2~3가지. 기술·정책·시장 변화를 구체적으로 설명하세요.

**📊 시장 현황**
한국 및 글로벌 시장 동향을 수치와 대표 사례로 설명하세요.

**🚀 청소년 창업가에게**
이 섹터에서 도전할 수 있는 창업 기회와 지금 시작할 수 있는 행동 1~2가지를 제시하세요.`
}

// ── 피드백 저장 (비동기) ─────────────────────────────────────────
function saveFeedback(type, summary) {
  fetch(`${SB_URL}/rest/v1/ai_feedback`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ session_type: type, prompt_summary: summary }),
  }).catch(() => {})
}

// ── 메인 핸들러 ──────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })

  const body = await req.json().catch(() => ({}))
  const { type, sector_name, sector_note, metric_name, metric_value, metric_unit, change_pct, category, source_name } = body

  // RAG 검색
  const ragQuery = type === 'sector'
    ? `${sector_name} ${sector_note || ''} 스타트업 트렌드`
    : `${metric_name} ${category || ''} 트렌드`
  const ragDocs = await searchKnowledge(ragQuery, ['trend','market','insight'].includes(category) ? category : null)

  // 프롬프트 결정
  let userPrompt
  if (type === 'sector') {
    if (!sector_name) return new Response(JSON.stringify({ error: 'sector_name required' }), { status: 400, headers: cors() })
    userPrompt = sectorPrompt(sector_name, sector_note, ragDocs)
  } else {
    if (!metric_name) return new Response(JSON.stringify({ error: 'metric_name required' }), { status: 400, headers: cors() })
    userPrompt = metricPrompt(metric_name, metric_value, metric_unit, change_pct, category, source_name, ragDocs)
  }

  let analysis = null, modelUsed = null, lastError = null

  // gemini-2.5-pro → 2.5-flash 폴백
  for (const [model, timeout] of [['gemini-2.5-pro', 35000], ['gemini-2.5-flash', 25000]]) {
    try {
      analysis = await callGemini(model, SYSTEM_ROLE, userPrompt, timeout)
      modelUsed = model
      break
    } catch (e) {
      lastError = e.message
    }
  }

  if (!analysis) {
    return new Response(JSON.stringify({ error: 'AI 분석 실패', detail: lastError }), { status: 200, headers: cors() })
  }

  saveFeedback(type === 'sector' ? 'sector' : 'metric', sector_name || metric_name)

  return new Response(JSON.stringify({
    analysis,
    model: modelUsed,
    rag_docs_used: ragDocs?.length || 0,
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { ...cors(), 'Cache-Control': 'public, max-age=3600' }
  })
}

function cors() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}
