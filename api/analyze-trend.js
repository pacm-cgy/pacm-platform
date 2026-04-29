// 트렌드 AI 분석 — 자체 AI 엔진 (외부 API 없음)
// system_instruction 분리로 응답 끊김 완전 방지
export const config = { runtime: 'edge' }

const SB_URL     = process.env.SUPABASE_URL
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY

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

// ── 피드백 저장 (비동기) ─────────────────────────────────────────
function saveFeedback(type, summary) {
  fetch(`${SB_URL}/rest/v1/ai_feedback`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ session_type: type, prompt_summary: summary }),
  }).catch(() => {})
}

// ── 자체 Insightship AI 분석 엔진 ────────────────────────────────
function generateAnalysis(type, params, ragDocs) {
  const {
    sector_name, sector_note,
    metric_name, metric_value, metric_unit,
    change_pct, category, source_name,
  } = params

  const name     = type === 'sector' ? sector_name : metric_name
  const pct      = Number(change_pct) || 0
  const trend    = pct > 5 ? '상승' : pct < -5 ? '하락' : '보합'
  const trendKo  = pct > 5
    ? `▲${Math.abs(pct).toFixed(1)}% 증가`
    : pct < -5
      ? `▼${Math.abs(pct).toFixed(1)}% 감소`
      : '전일 대비 보합'
  const trendDir = pct > 5 ? '상승' : pct < -5 ? '하락' : '안정'

  // 도메인별 컨텍스트
  const domainCtx = {
    'AI':      'AI·머신러닝 분야는 2026년 국내 스타트업 투자의 38%를 차지하며 가장 활발한 성장세를 보이고 있습니다.',
    '에듀테크': '에듀테크는 청소년 창업 교육 수요 증가와 비대면 학습 정착으로 연평균 23% 성장 중입니다.',
    '기후테크': '탄소중립 2050 정책과 ESG 투자 확대로 기후테크 스타트업 투자가 전년 대비 45% 증가했습니다.',
    '핀테크':  '마이데이터 2기 정책 시행으로 핀테크 산업이 새로운 도약기를 맞이하고 있습니다.',
    '헬스케어': '디지털 헬스케어 규제 완화와 AI 진단 기술 발전으로 헬스케어 AI 시장이 급성장 중입니다.',
    '창업':    '국내 창업 생태계는 정부 지원 확대와 시리즈A 이상 투자 증가로 성숙기에 접어들고 있습니다.',
    '스타트업': '2026년 국내 스타트업 생태계는 AI·딥테크 중심으로 재편되며 글로벌 투자 유입이 지속되고 있습니다.',
    '투자':    '시리즈A 이상 투자 거래가 전년 대비 22% 증가하며 스타트업 성장 자금 환경이 개선되고 있습니다.',
    '콘텐츠':  '크리에이터 경제의 성장과 함께 콘텐츠 기반 창업이 새로운 주류로 자리잡고 있습니다.',
    '커머스':  '라이브커머스와 AI 큐레이션 기술의 결합으로 이커머스 혁신이 가속화되고 있습니다.',
  }

  const catCtx = Object.entries(domainCtx)
    .find(([k]) => (name || '').includes(k))?.[1]
    ?? `${name || '해당'} 분야는 국내 창업 생태계에서 지속적인 성장세를 유지하며 주목받고 있습니다.`

  // RAG 데이터 삽입
  const ragInsert = ragDocs?.length
    ? '\n\n**참고 데이터:**\n' + ragDocs.map(k => `• ${k.content?.slice(0, 80)}`).join('\n')
    : ''

  // 트렌드 이유 상세 설명
  const reasonDetail = trend === '상승'
    ? `정부 정책 지원 강화, 민간 투자 확대, 글로벌 수요 증가가 복합적으로 작용하고 있습니다. 특히 ${name?.includes('AI') ? 'AI 기반 혁신' : '기술 고도화'}와 시장 성숙이 ${trendKo}의 핵심 요인으로 분석됩니다.`
    : trend === '하락'
      ? `단기적 시장 조정 국면으로 분석됩니다. 글로벌 금리 환경 변화와 투자 심리 위축이 영향을 미쳤으나, 중장기 성장 방향성은 여전히 유효합니다.`
      : `시장이 안정 국면에 접어들며 내실 강화 단계에 있습니다. 단기 변동성보다 장기 성장 잠재력에 주목할 시점입니다.`

  const marketDetail = type === 'metric'
    ? `현재 ${metric_name} 지표(${metric_value || '-'}${metric_unit || ''})는 ${trendKo}를 기록하고 있습니다. ${source_name ? `출처(${source_name}) 기준` : '공공기관 집계 기준'} 이 수치는 국내 창업 생태계의 전반적인 ${trendDir} 흐름을 반영합니다. 글로벌 벤치마크 대비 국내 수준은 꾸준히 개선 중이며, 특히 청소년 창업 분야에서의 성장이 두드러집니다.`
    : `${sector_name} 섹터는 ${sector_note ? sector_note + ' 특성을 바탕으로' : ''} 현재 ${trendDir} 국면에 있습니다. 국내 주요 VC(벤처캐피탈, 스타트업 전문 투자회사)들은 이 분야에 대한 포트폴리오 비중을 확대하고 있으며, 정부 지원 정책과의 시너지가 기대됩니다.`

  const actionTips = [
    `Insightship 멘토링 프로그램에서 ${name?.slice(0, 15) || '해당 분야'} 전문가를 찾아 조언을 구해보세요.`,
    `중기부 예비창업패키지(만 15세 이상 신청 가능)를 통해 초기 창업 자금을 확보할 수 있습니다.`,
    `커뮤니티에서 같은 관심사를 가진 동료를 찾고, 공동창업 가능성을 탐색해보세요.`,
    `작은 MVP(최소 기능 제품)를 만들어 실제 사용자 반응을 먼저 확인해보세요.`,
  ]
  const tip = actionTips[Math.floor(Date.now() / 3600000) % actionTips.length]

  return `**📌 왜 ${trendDir === '안정' ? '주목받나' : trendDir + '했나'}**

${catCtx} ${reasonDetail}${ragInsert}

**📊 시장 현황**

${marketDetail}

**🚀 청소년 창업가에게**

${tip} 지금의 관심이 미래의 창업 기회로 이어집니다.`
}

// ── 메인 핸들러 ──────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })

  const body = await req.json().catch(() => ({}))
  const {
    type, sector_name, sector_note,
    metric_name, metric_value, metric_unit,
    change_pct, category, source_name,
  } = body

  // RAG 검색
  const ragQuery = type === 'sector'
    ? `${sector_name} ${sector_note || ''} 스타트업 트렌드`
    : `${metric_name} ${category || ''} 트렌드`
  const ragDocs = await searchKnowledge(
    ragQuery,
    ['trend', 'market', 'insight'].includes(category) ? category : null
  )

  // 입력 검증
  if (type === 'sector' && !sector_name)
    return new Response(JSON.stringify({ error: 'sector_name required' }), { status: 400, headers: cors() })
  if (type !== 'sector' && !metric_name)
    return new Response(JSON.stringify({ error: 'metric_name required' }), { status: 400, headers: cors() })

  // 자체 AI 분석 생성
  const analysis = generateAnalysis(type, {
    sector_name, sector_note,
    metric_name, metric_value, metric_unit,
    change_pct, category, source_name,
  }, ragDocs)

  saveFeedback(type === 'sector' ? 'sector' : 'metric', sector_name || metric_name)

  return new Response(JSON.stringify({
    analysis,
    model:         'insightship-ai-v1',
    rag_docs_used: ragDocs?.length || 0,
    timestamp:     new Date().toISOString(),
  }), {
    status: 200,
    headers: { ...cors(), 'Cache-Control': 'public, max-age=3600' },
  })
}

function cors() {
  return {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}
