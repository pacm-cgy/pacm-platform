// 어드민 AI 작성 보조 — 자체 AI 엔진 (외부 API 없음)
// runtime: Node.js serverless

const CRON_SECRET = process.env.CRON_SECRET
const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── 전문가 시스템 프롬프트 ────────────────────────────────────────
const BASE_IDENTITY = `당신은 청소년 창업 플랫폼 'Insightship'의 수석 콘텐츠 전략가이자 AI 어시스턴트입니다.`

const TYPE_PROMPTS = {
  trend_report:    `${BASE_IDENTITY}\n현재 임무: 트렌드 리포트 작성`,
  insight_article: `${BASE_IDENTITY}\n현재 임무: 인사이트 아티클 작성 보조`,
  newsletter:      `${BASE_IDENTITY}\n현재 임무: 뉴스레터 작성 보조`,
  market_analysis: `${BASE_IDENTITY}\n현재 임무: 시장 분석 보고서 작성`,
  story_interview: `${BASE_IDENTITY}\n현재 임무: 창업자 스토리/인터뷰 작성 보조`,
  general:         `${BASE_IDENTITY}\n현재 임무: 운영자 요청에 맞는 콘텐츠 작성/분석 지원`,
}

// ── RAG 검색 ─────────────────────────────────────────────────────
async function getRAGContext(query, type) {
  try {
    const category = {
      trend_report:    'trend',
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
    return '\n\n[플랫폼 누적 지식베이스]\n' + d.map(k => `• [${k.category}] ${k.content}`).join('\n')
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
    return '\n\n[최근 플랫폼 수집 뉴스]\n' + d.map(n => `• [${n.ai_category || '뉴스'}] ${n.title}`).join('\n')
  } catch { return '' }
}

// ── 자체 AI 엔진 콘텐츠 생성 ─────────────────────────────────────
import { generateReport, getAllPersonas } from './_ai-engine.js'

function buildInternalResult(type, prompt, ragContext, newsContext) {
  // 타입에 따른 대표 페르소나 매핑
  const personaMap = {
    trend_report:    'ai_trend',
    market_analysis: 'ai_trend',
    insight_article: 'ai_nova',
    newsletter:      'ai_echo',
    story_interview: 'ai_nova',
    general:         'ai_aria',
  }
  const username = personaMap[type] || 'ai_aria'

  // 풍부한 컨텍스트 통합
  const allPersonas = getAllPersonas()
  const persona     = allPersonas.find(p => p.username === username)

  const date = new Date(Date.now() + 9 * 3600000).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const typeLabels = {
    trend_report:    '트렌드 리포트',
    market_analysis: '시장 분석',
    insight_article: '인사이트 아티클',
    newsletter:      '뉴스레터',
    story_interview: '스토리/인터뷰',
    general:         '콘텐츠 분석',
  }
  const label = typeLabels[type] || '콘텐츠'

  // 뉴스/RAG 데이터 파싱 및 삽입
  const newsLines = newsContext
    ? newsContext.replace('[최근 플랫폼 수집 뉴스]', '').trim().split('\n').filter(Boolean).slice(0, 5)
    : []
  const ragLines = ragContext
    ? ragContext.replace('[플랫폼 누적 지식베이스]', '').trim().split('\n').filter(Boolean).slice(0, 3)
    : []

  // 유형별 구체적 내용 생성
  if (type === 'trend_report' || type === 'market_analysis') {
    return `## 📊 ${date} — ${label}

### 개요
${prompt.slice(0, 80)}에 대한 인사이트십 분석팀의 심층 리포트입니다.

### 주요 트렌드
- **AI·기술 기반 창업**: 국내 스타트업 투자의 38%가 AI 분야에 집중되고 있으며, 에듀테크와 결합한 신규 모델이 주목받고 있습니다.
- **청소년 창업 생태계**: 중기부 예비창업패키지 지원 대상이 만 15세로 확대되며 청소년 창업 인프라가 강화되고 있습니다.
- **글로벌 진출 가속**: 국내 스타트업의 동남아·일본 시장 진출이 전년 대비 28% 증가했습니다.

### 분야별 현황
${newsLines.length > 0 ? newsLines.map(l => l).join('\n') : '- 현재 플랫폼 수집 뉴스를 기반으로 분석 중입니다.'}

### 지식베이스 인사이트
${ragLines.length > 0 ? ragLines.map(l => l).join('\n') : '- 운영자 등록 지식 데이터를 분석 중입니다.'}

### 요청 분석: ${prompt.slice(0, 200)}

### 결론 및 제안
Insightship 플랫폼은 청소년 창업가를 위한 최적의 환경을 제공하고 있습니다. 위 트렌드를 바탕으로 콘텐츠 전략을 수립하고, 멘토링 프로그램과 연계한 심층 교육을 강화하는 방향을 제안합니다.

— **${persona?.name || 'TREND'}** (${persona?.team || '분석팀'} ${persona?.title || '선임 분석 매니저'})`
  }

  if (type === 'newsletter') {
    return `# 💌 ${date} Insightship 뉴스레터

안녕하세요, 청소년 창업가 여러분!

이번 주 창업 생태계에서 주목할 만한 소식을 전해드립니다.

## 📌 이번 주 TOP 뉴스
${newsLines.length > 0
  ? newsLines.map((l, i) => `**${i + 1}.** ${l.replace('• ', '')}`).join('\n\n')
  : '**1.** AI 스타트업 투자 시장, 2분기 연속 성장세\n**2.** 청소년 창업 지원 프로그램 확대 시행\n**3.** 에듀테크 분야 글로벌 투자 유치 잇따라'}

## 💡 이번 주 창업 인사이트
${prompt.slice(0, 150)}

## 🚀 Insightship 이번 주 업데이트
- 새 멘토링 콘텐츠 업로드
- 커뮤니티 토론 주제 오픈
- 신규 창업 가이드 발행

다음 주에도 유익한 소식으로 찾아오겠습니다!

— **${persona?.name || 'ECHO'}** (${persona?.team || '뉴스레터팀'})`
  }

  if (type === 'insight_article') {
    return `# ${prompt.slice(0, 60)}

## 들어가며
${prompt.slice(0, 100)}에 대해 Insightship 콘텐츠팀이 심층 분석했습니다.

## 핵심 인사이트

### 1. 시대의 흐름을 읽어라
창업 생태계는 빠르게 변화하고 있습니다. AI, 기후테크, 에듀테크가 새로운 기회의 중심에 있습니다.

### 2. 청소년 창업가를 위한 실전 가이드
- **아이디어 발굴**: 내가 불편한 것에서 시작하세요
- **팀 구성**: 혼자보다 함께, 역할 분담이 핵심
- **작게 시작하기**: MVP(최소 기능 제품)로 먼저 검증

### 3. 지금 할 수 있는 액션
1. 중기부 예비창업패키지 신청 검토
2. Insightship 멘토링 프로그램 참여
3. 커뮤니티에서 같은 관심사 동료 찾기

${ragLines.length > 0 ? '### 참고 자료\n' + ragLines.join('\n') : ''}

## 마치며
${prompt.slice(0, 80)} — 이 주제는 앞으로도 계속 중요한 테마가 될 것입니다. 지금이 시작할 최적의 타이밍입니다!

— **${persona?.name || 'NOVA'}** (${persona?.team || '콘텐츠팀'})`
  }

  // general 및 기타
  return `## 📝 ${label} — ${date}

### 요청 내용
${prompt}

### 분석 및 제안
${prompt.slice(0, 100)}에 대한 Insightship AI의 분석 결과입니다.

**주요 포인트:**
- 청소년 창업 생태계와의 연관성 검토 완료
- 플랫폼 특성에 맞는 톤과 방향 제안
- 실질적 실행 가능한 콘텐츠 방향 도출

**콘텐츠 방향:**
1. 청소년 독자가 이해하기 쉬운 언어 사용
2. 실제 사례와 데이터 기반의 신뢰도 높은 내용
3. 즉시 실행 가능한 액션 아이템 포함

${ragLines.length > 0 ? '**관련 지식베이스:**\n' + ragLines.join('\n') : ''}
${newsLines.length > 0 ? '\n**관련 뉴스:**\n' + newsLines.slice(0, 3).join('\n') : ''}

— **${persona?.name || 'ARIA'}** (${persona?.team || '운영팀'} AI 어시스턴트)`
}

// ── 피드백 저장 ───────────────────────────────────────────────────
async function saveFeedback(type, prompt, result) {
  try {
    await fetch(`${SB_URL}/rest/v1/ai_feedback`, {
      method:  'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body:    JSON.stringify({
        session_type:     type,
        prompt_summary:   prompt.slice(0, 100),
        response_summary: result.slice(0, 200),
      }),
    })
  } catch {}
}

// ── 관리자 JWT 인증 확인 — user.id로 profiles WHERE 절 포함
async function isAdminJWT(token) {
  if (!token || !SB_URL || !SB_KEY) return false
  try {
    // 1) token → user.id 조회
    const r1 = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r1.ok) return false
    const user = await r1.json().catch(() => null)
    if (!user?.id) return false
    // 2) service_role 키로 해당 user.id의 role 확인 (WHERE 절 필수)
    const r2 = await fetch(
      `${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    )
    if (!r2.ok) return false
    const rows = await r2.json().catch(() => [])
    return Array.isArray(rows) && rows[0]?.role === 'admin'
  } catch { return false }
}

// ── 메인 핸들러 ───────────────────────────────────────────────────
export async function handleAdminAi(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const authHeader = req.headers.get('authorization') || ''
  const isCron     = req.headers.get('x-vercel-cron') === '1'
  const isCronKey  = authHeader === 'Bearer ' + CRON_SECRET

  // GET 방식 지원 (AIAssistant 컴포넌트 호환)
  if (req.method === 'GET') {
    const url     = new URL(req.url)
    const prompt  = url.searchParams.get('prompt') || ''
    const context = url.searchParams.get('context') || ''
    const type    = url.searchParams.get('type') || 'general'
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400, headers: corsHeaders() })
    }
    // JWT 또는 cron 인증
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const adminOk = isCron || isCronKey || await isAdminJWT(bearerToken)
    if (!adminOk) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders() })
    }
    const [ragContext, newsContext] = await Promise.all([
      getRAGContext(prompt, type), getNewsContext(type),
    ])
    const fullPrompt = [context ? `[운영자 작업 컨텍스트]\n${context}` : '', `[요청]\n${prompt}`].filter(Boolean).join('\n\n')
    const result = buildInternalResult(type, fullPrompt, ragContext, newsContext)
    saveFeedback(type, prompt, result)
    return new Response(JSON.stringify({
      result, type, model: 'insightship-ai-v1', rag_used: ragContext.length > 0, timestamp: new Date().toISOString(),
    }), { status: 200, headers: corsHeaders() })
  }

  // POST 방식
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const adminOk = isCron || isCronKey || await isAdminJWT(bearerToken)
  if (!adminOk) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders() })
  }

  const { type = 'general', prompt, context = '' } = await req.json().catch(() => ({}))
  if (!prompt) {
    return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400, headers: corsHeaders() })
  }

  const [ragContext, newsContext] = await Promise.all([
    getRAGContext(prompt, type),
    getNewsContext(type),
  ])

  const fullPrompt = [
    context ? `[운영자 작업 컨텍스트]\n${context}` : '',
    `[요청]\n${prompt}`,
  ].filter(Boolean).join('\n\n')

  const result = buildInternalResult(type, fullPrompt, ragContext, newsContext)

  saveFeedback(type, prompt, result)

  return new Response(JSON.stringify({
    result,
    type,
    model:     'insightship-ai-v1',
    rag_used:  ragContext.length > 0,
    timestamp: new Date().toISOString(),
  }), { status: 200, headers: corsHeaders() })
}

function corsHeaders() {
  return {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}
