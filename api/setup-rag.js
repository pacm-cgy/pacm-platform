// RAG 테이블 초기화 (1회 실행용)
export const config = { runtime: 'edge' }
const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req) {
  if (req.headers.get('authorization') !== 'Bearer ' + CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }
  const results = []

  // Supabase rpc로 SQL 실행
  async function sql(query) {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ sql: query })
    })
    return { status: r.status, ok: r.ok }
  }

  // 1. ai_knowledge 테이블 (없으면 생성)
  const knowledgeData = [
    {
      content: '2024년 한국 AI 스타트업 투자액은 1조 2천억원으로 전년 대비 38.2% 급증했습니다. ChatGPT 등장 이후 VC(벤처캐피탈) 투자 심리가 크게 개선됐고, 정부의 AI 스타트업 육성 정책이 맞물린 결과입니다.',
      category: 'trend', source: '정보통신기획평가원 AI산업실태조사 2024',
      keywords: ['AI', '투자', 'VC', '스타트업'], quality: 9
    },
    {
      content: '에듀테크 시장은 2024년 7,500억원 규모로 전년 대비 21.4% 성장했습니다. AI 튜터링과 맞춤형 학습 솔루션 수요가 급증했으며, 청소년 창업가들이 교육 현장의 불편함을 해결하는 에듀테크 창업이 유망합니다.',
      category: 'trend', source: '한국에듀테크산업협회 2024',
      keywords: ['에듀테크', '교육', 'AI튜터', '청소년'], quality: 9
    },
    {
      content: '한국 VC 투자 생태계는 2024년 6조 7천억원의 신규 투자가 이루어졌습니다. AI/ML 18%, 바이오헬스 15%, 에듀테크 11% 순입니다. 시드(초기) 투자는 평균 3~5억원이며, 팀 구성과 문제 해결력을 가장 중요하게 봅니다.',
      category: 'market', source: '한국벤처캐피탈협회 2024',
      keywords: ['VC', '투자', '시드투자', '벤처'], quality: 9
    },
    {
      content: '기후테크 스타트업에 대한 관심이 급증하고 있습니다. ESG 경영 의무화로 기업들이 탄소중립 솔루션을 찾고 있으며, 친환경 소비를 돕는 B2C 서비스도 주목받습니다.',
      category: 'trend', source: '중소벤처기업부 2024',
      keywords: ['기후테크', 'ESG', '탄소중립', '친환경'], quality: 9
    },
    {
      content: '청소년 창업의 첫 단계는 문제 발견입니다. 내가 직접 불편함을 느끼는 것, 친구들이 공통으로 겪는 어려움에서 아이디어를 찾으세요. 성공한 청소년 창업가들은 대부분 자신의 경험에서 시작했습니다.',
      category: 'insight', source: 'Insightship 창업 가이드',
      keywords: ['청소년창업', '아이디어', '문제발견'], quality: 9
    },
  ]

  // ai_knowledge에 직접 INSERT (테이블은 SQL 에디터로 생성 필요)
  const insertR = await fetch(`${SB_URL}/rest/v1/ai_knowledge`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify(knowledgeData)
  })
  results.push({ step: 'insert_knowledge', status: insertR.status })

  // ai_feedback 테이블 존재 확인
  const fbCheck = await fetch(`${SB_URL}/rest/v1/ai_feedback?limit=1`, { headers: H })
  results.push({ step: 'feedback_table', status: fbCheck.status })

  return new Response(JSON.stringify({ results, timestamp: new Date().toISOString() }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}
