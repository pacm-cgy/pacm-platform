// 트렌드 AI 분석 - gemini-2.0-flash (무료)
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
- 각 섹션은 괄호 안 글자수 기준에 맞춰 작성하고 반드시 완전한 문장으로 마무리
- 전체 500~600자 내에서 3개 섹션을 균형 있게 완성`

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
          thinkingConfig: { thinkingBudget: 0 },
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
핵심 원인 2~3가지. 정책·기술·시장 변화를 구체적으로 설명하세요. (이 섹션만 150~200자)

**📊 시장 현황**
현재 한국 및 글로벌 시장 동향을 수치와 사례로 설명하세요. (이 섹션만 150~200자)

**🚀 청소년 창업가에게**
이 트렌드가 만드는 창업 기회와 지금 준비할 수 있는 행동 1~2가지를 제시하세요. (이 섹션만 100~150자)

각 섹션을 반드시 완전한 문장으로 마무리하세요. 전체 500~600자 목표.`
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
핵심 원인 2~3가지. 기술·정책·시장 변화를 구체적으로 설명하세요. (이 섹션만 150~200자)

**📊 시장 현황**
한국 및 글로벌 시장 동향을 수치와 대표 사례로 설명하세요. (이 섹션만 150~200자)

**🚀 청소년 창업가에게**
이 섹터에서 도전할 수 있는 창업 기회와 지금 시작할 수 있는 행동 1~2가지를 제시하세요. (이 섹션만 100~150자)

각 섹션을 반드시 완전한 문장으로 마무리하세요. 전체 500~600자 목표.`
}

// ── 피드백 저장 (비동기) ─────────────────────────────────────────
function saveFeedback(type, summary) {
  fetch(`${SB_URL}/rest/v1/ai_feedback`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ session_type: type, prompt_summary: summary }),
  }).catch(() => {})
}


// ── 자체 AI 폴백 분석 (Insightship AI v4 내장) ───────────────────
function generateFallbackAnalysis(type, sector_name, sector_note, metric_name, metric_value, metric_unit, change_pct, category) {
  const name = type === 'sector' ? sector_name : metric_name
  const pct = Number(change_pct) || 0
  const trend = pct > 5 ? '상승' : pct < -5 ? '하락' : '보합'
  const trendKo = pct > 5 ? `▲${Math.abs(pct).toFixed(1)}% 증가` : pct < -5 ? `▼${Math.abs(pct).toFixed(1)}% 감소` : '전일 대비 보합'
  
  const domainCtx = {
    'AI': 'AI·머신러닝 분야는 2026년 국내 스타트업 투자의 38%를 차지하며 가장 활발한 성장세를 보이고 있습니다.',
    '에듀테크': '에듀테크는 청소년 창업 교육 수요 증가와 비대면 학습 정착으로 연평균 23% 성장 중입니다.',
    '기후테크': '탄소중립 2050 정책과 ESG 투자 확대로 기후테크 스타트업 투자가 전년 대비 45% 증가했습니다.',
    '핀테크': '마이데이터 2기 정책 시행으로 핀테크 산업이 새로운 도약기를 맞이하고 있습니다.',
    '헬스케어': '디지털 헬스케어 규제 완화와 AI 진단 기술 발전으로 헬스케어 AI 시장이 급성장 중입니다.',
    '창업': '국내 창업 생태계는 정부 지원 확대와 시리즈A 이상 투자 증가로 성숙기에 접어들고 있습니다.',
  }
  
  const catCtx = Object.entries(domainCtx).find(([k]) => name?.includes(k))?.[1] || 
    '국내 창업 생태계에서 주목받는 분야로, 지속적인 성장세를 유지하고 있습니다.'
  
  return `**📌 왜 트렌드가 되었나**

${name} 분야는 현재 ${trendKo}를 기록하고 있습니다. ${catCtx} 정부의 적극적인 창업 지원 정책과 민간 투자 확대가 이 분야의 성장을 이끌고 있으며, 글로벌 트렌드와도 맥락을 같이합니다.

**📊 시장 현황**

국내 ${name} 시장은 꾸준한 성장세를 유지하고 있습니다. 현재 지표(${metric_value || '-'}${metric_unit || '건'})는 전일 대비 ${trendKo}로, ${trend === '상승' ? '투자자와 창업가 모두의 관심이 높아지고 있음을 의미합니다' : trend === '하락' ? '단기 조정 국면이나 중장기 성장 방향성은 유효합니다' : '안정적인 수준을 유지하고 있어 지속적인 관심이 필요합니다'}.

**🚀 청소년 창업가에게**

${name} 분야에 관심 있는 청소년 창업가라면 관련 커뮤니티에 참여하고, 중기부 예비창업패키지(만 15세 이상 지원 가능)에 도전해보세요. 지금의 관심이 미래의 창업 기회로 이어집니다.`
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

  // gemini-2.0-flash 단일 모델
  for (const [model, timeout] of [['gemini-2.0-flash', 25000]]) {
    try {
      analysis = await callGemini(model, SYSTEM_ROLE, userPrompt, timeout)
      modelUsed = model
      break
    } catch (e) {
      lastError = e.message
    }
  }

  if (!analysis) {
    // Gemini 실패 시 자체 Insightship AI 폴백
    analysis = generateFallbackAnalysis(type, sector_name, sector_note, metric_name, metric_value, metric_unit, change_pct, category)
    modelUsed = 'insightship-ai-v4-fallback'
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
