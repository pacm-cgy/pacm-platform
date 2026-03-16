// AI 트렌드 리포트 자동 생성
// 매주 월요일 KST 08:00 실행 + 수동 실행 가능
export const config = { runtime: 'edge' }

const GEMINI_KEY          = process.env.GEMINI_API_KEY
const SUPABASE_URL        = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET         = process.env.CRON_SECRET

const H = () => ({ apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY })

// ── Gemini 호출 (긴 보고서용) ────────────────────────────────────
async function callGemini(prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: `당신은 청소년 창업 플랫폼 'Insightship'의 수석 콘텐츠 전략가입니다.
전문성: 한국 스타트업 생태계 10년 분석, VC 심사역 출신, 청소년 창업 교육 전문가.
작성 규칙:
- 청소년(중고등학생) 창업가가 완전히 이해할 수 있는 언어
- 어려운 용어는 반드시 괄호로 설명: VC(벤처캐피탈, 스타트업 전문 투자회사)
- 마크다운 형식 (## 헤더, **굵게**, - 리스트 활용)
- 구체적 수치, 기업명, 날짜 반드시 포함
- ~입니다/~했습니다/~합니다 체
- 인사말 없이 ## 헤더로 바로 시작 ("안녕하세요" 등 일체 금지)
- 글자수 규칙: 전체 3000~4000자, 각 섹션 500~700자, 모든 섹션 완전한 문장으로 마무리` }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: 0.5,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(50000),
    }
  )
  if (!r.ok) throw new Error(`Gemini ${r.status}`)
  const d = await r.json()
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text || text.length < 200) throw new Error('응답 너무 짧음: ' + text?.length)
  return text
}

// ── DB 저장 ───────────────────────────────────────────────────────
async function getAdminId() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.admin&limit=1&select=id`, { headers: H() })
  const d = await r.json()
  return d?.[0]?.id
}

async function insertArticle(title, body, tags, slug) {
  // 중복 체크
  const check = await fetch(`${SUPABASE_URL}/rest/v1/articles?slug=eq.${slug}&select=id&limit=1`, { headers: H() })
  const existing = await check.json()
  if (existing?.length > 0) return { skipped: true }

  const adminId = await getAdminId()
  const r = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
    method: 'POST',
    headers: { ...H(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      title, slug,
      author_id: adminId,
      body,
      excerpt: body.replace(/#+\s[^\n]+/g, '').replace(/\*\*/g, '').trim().slice(0, 300),
      category: 'trend',
      status: 'published',
      tags,
      ai_summary: body.replace(/#+\s[^\n]+/g, '').replace(/\*\*/g, '').trim().slice(0, 500),
      read_time: Math.max(3, Math.ceil(body.length / 400)),
      published_at: new Date().toISOString(),
    }),
  })
  if (r.status !== 201) throw new Error(`INSERT ${r.status}`)
  return (await r.json())?.[0]
}

// ── 메인 ─────────────────────────────────────────────────────────
export default async function handler(req) {
  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  // 최근 2주 뉴스 (ai_summary 있는 것)
  const since = new Date(Date.now() - 14 * 86400000).toISOString()
  const newsR = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?ai_summary=not.is.null&published_at=gte.${since}&category=eq.news&select=title,ai_summary,tags&order=published_at.desc&limit=60`,
    { headers: H() }
  )
  const news = await newsR.json()
  if (!Array.isArray(news) || !news.length) {
    return new Response(JSON.stringify({ error: '뉴스 없음' }), { status: 200 })
  }

  const weekStr = getWeekStr()
  const todayStr = new Date().toISOString().slice(0, 10)
  const results = { generated: [], skipped: 0, errors: [] }

  const newsSummary = news.slice(0, 30).map((n, i) => `${i+1}. ${n.title}\n   요약: ${n.ai_summary?.slice(0, 150)}`).join('\n')

  // ── 1. 투자/자금 동향 리포트 ─────────────────────────────────
  try {
    const slug1 = `ai-funding-report-${todayStr}`
    const prompt1 = `다음은 최근 2주간 한국 스타트업/창업 뉴스 ${news.length}개입니다.

${newsSummary}

위 뉴스들을 바탕으로 **"${weekStr} 한국 스타트업 투자·자금 동향 분석 리포트"**를 작성하세요.

아래 구조를 반드시 따르고, 각 섹션을 충분히 상세하게 작성하세요. 전체 2000자 이상.

## 이번 주 핵심 요약
이번 주 투자/자금 동향의 가장 중요한 3가지를 간결하게 정리 (각 2~3문장)

## 주요 투자·펀딩 현황
이번 주 주목할 만한 투자 유치 사례들. 기업명, 금액, 분야, 의미를 상세히 설명.
없으면 최근 트렌드를 분석.

## 섹터별 투자 트렌드
AI/머신러닝, 에듀테크, 기후테크, 핀테크, 헬스케어 등 섹터별 투자 흐름 분석.
각 섹터에 2~3문장씩.

## 정부 지원 & 정책 동향
창업 지원 프로그램, 정부 정책, 규제 변화 등 창업 생태계에 영향을 주는 내용.

## 청소년 창업가를 위한 인사이트
이번 주 투자 트렌드에서 청소년 창업가가 얻을 수 있는 교훈과 기회. 구체적 행동 제안 포함.

각 섹션 헤더는 ## 형식, 중요 키워드는 **굵게**.
각 섹션은 500~700자씩 작성하고 완전한 문장으로 마무리하세요. 전체 3000~4000자 목표.`

    const body1 = await callGemini(prompt1)
    const result1 = await insertArticle(
      `[AI 리포트] ${weekStr} 스타트업 투자·자금 동향`,
      body1, ['AI리포트', '투자동향', '스타트업', weekStr], slug1
    )
    if (result1?.skipped) results.skipped++
    else results.generated.push({ type: 'funding', title: `[AI 리포트] ${weekStr} 스타트업 투자·자금 동향`, len: body1.length })
  } catch(e) { results.errors.push('funding: ' + e.message?.slice(0, 80)) }

  // ── 2. 시장·트렌드 분석 리포트 ──────────────────────────────
  try {
    const slug2 = `ai-market-report-${todayStr}`
    const prompt2 = `다음은 최근 2주간 한국 스타트업/창업 뉴스 ${news.length}개입니다.

${newsSummary}

위 뉴스들을 바탕으로 **"${weekStr} 스타트업 생태계 시장 동향 분석 리포트"**를 작성하세요.

아래 구조를 반드시 따르고, 각 섹션을 충분히 상세하게 작성하세요. 전체 2000자 이상.

## 이번 주 시장 핵심 변화
이번 주 스타트업 시장에서 가장 중요한 변화 3가지 요약 (각 2~3문장)

## 주목할 스타트업 & 기업 동향
이번 주 뉴스에 등장한 주목할 스타트업/기업들의 움직임. 구체적 사례 포함.

## 기술 트렌드 분석
AI, 에듀테크, 기후테크, 헬스케어 등 이번 주 주목받은 기술 트렌드 심층 분석.
각 기술 분야에 2~3문장씩, 왜 주목받는지 배경 설명.

## 창업 생태계 지원 현황
지자체, 대학, 기관의 창업 지원 프로그램, 행사, 교육 기회 정리.

## 청소년 창업가 주목 포인트
이번 주 트렌드에서 중학생·고등학생 창업가가 특히 주목해야 할 내용.
지금 당장 시작할 수 있는 구체적 행동 2~3가지 제안.

각 섹션 헤더는 ## 형식, 중요 키워드는 **굵게**.
각 섹션은 500~700자씩 작성하고 완전한 문장으로 마무리하세요. 전체 3000~4000자 목표.`

    const body2 = await callGemini(prompt2)
    const result2 = await insertArticle(
      `[AI 리포트] ${weekStr} 스타트업 생태계 시장 동향`,
      body2, ['AI리포트', '시장분석', '트렌드', weekStr], slug2
    )
    if (result2?.skipped) results.skipped++
    else results.generated.push({ type: 'market', title: `[AI 리포트] ${weekStr} 스타트업 생태계 시장 동향`, len: body2.length })
  } catch(e) { results.errors.push('market: ' + e.message?.slice(0, 80)) }

  return new Response(JSON.stringify({ ...results, timestamp: new Date().toISOString() }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}

function getWeekStr() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const week = Math.ceil(now.getDate() / 7)
  return `${year}년 ${month}월 ${week}주차`
}
