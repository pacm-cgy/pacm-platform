// AI 뉴스 요약 + 분류 + 중복 제거 Edge Function
// Claude API 활용
export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const CRON_SECRET = process.env.CRON_SECRET

const CATEGORY_MAP = {
  '투자': 'funding',
  'VC': 'funding',
  '시리즈': 'funding',
  '펀딩': 'funding',
  'IPO': 'funding',
  '상장': 'funding',
  '유니콘': 'unicorn',
  '스타트업': 'startup',
  'AI': 'ai',
  '인공지능': 'ai',
  '에듀테크': 'edutech',
  '교육': 'edutech',
  '청소년': 'youth',
  '학생': 'youth',
  '창업': 'entrepreneurship',
  '기후': 'climate',
  '그린': 'climate',
  '헬스': 'health',
  '바이오': 'health',
}

function detectCategory(title, excerpt) {
  const text = (title + ' ' + excerpt).toLowerCase()
  for (const [keyword, cat] of Object.entries(CATEGORY_MAP)) {
    if (text.includes(keyword.toLowerCase())) return cat
  }
  return 'general'
}

async function callClaude(prompt, maxTokens = 1000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`Claude API 오류: ${res.status}`)
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

async function summarizeArticle(article) {
  const prompt = `당신은 청소년 창업 플랫폼 'Insightship'의 전문 에디터입니다.
아래 뉴스 기사를 청소년 독자가 이해하기 쉽도록 요약해주세요.

제목: ${article.title}
원문 내용: ${article.excerpt || article.body?.slice(0, 500) || ''}
출처: ${article.source_name || ''}

요약 규칙:
1. 3~5문장으로 핵심 내용만 정리
2. 어려운 용어는 괄호 안에 쉬운 설명 추가 (예: IPO(기업공개))
3. 청소년도 이해할 수 있는 평이한 문체 사용
4. 사실만 기재, 추측 금지
5. '단독', '속보' 등 자극적 표현 제거
6. 반드시 한국어로 작성

요약문만 출력하세요 (다른 설명 없이):` 

  return callClaude(prompt, 400)
}

function isSimilar(title1, title2) {
  // 제목 유사도 간단 체크 (토큰 겹침)
  const words1 = new Set(title1.replace(/[^\w가-힣]/g, ' ').split(/\s+/).filter(w => w.length > 2))
  const words2 = new Set(title2.replace(/[^\w가-힣]/g, ' ').split(/\s+/).filter(w => w.length > 2))
  const intersection = [...words1].filter(w => words2.has(w)).length
  const union = new Set([...words1, ...words2]).size
  return intersection / union > 0.5 // 50% 이상 겹치면 중복
}

export default async function handler(req) {
  const authHeader = req.headers.get('authorization')
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  if (!isVercelCron && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY 없음' }), { status: 500 })
  }

  // 미처리 뉴스 가져오기 (ai_summary 없는 것)
  const fetchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&ai_summary=is.null&is_duplicate=eq.false&select=id,title,excerpt,body,source_name,published_at&order=published_at.desc&limit=20`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  )
  const articles = await fetchRes.json()
  if (!articles?.length) {
    return new Response(JSON.stringify({ message: '처리할 기사 없음' }), { status: 200 })
  }

  // 중복 감지 - 처리된 기사 제목 가져오기
  const recentRes = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&ai_summary=not.is.null&select=title&order=published_at.desc&limit=100`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  )
  const recentArticles = await recentRes.json()
  const processedTitles = recentArticles.map(a => a.title)

  const results = { summarized: 0, duplicates: 0, errors: [] }

  for (const article of articles) {
    try {
      // 중복 체크
      const isDuplicate = processedTitles.some(t => isSimilar(article.title, t))
      if (isDuplicate) {
        // 중복으로 표시
        await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${article.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ is_duplicate: true }),
        })
        results.duplicates++
        continue
      }

      // AI 요약
      const summary = await summarizeArticle(article)
      const category = detectCategory(article.title, article.excerpt)

      // DB 업데이트
      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${article.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          ai_summary: summary.trim(),
          ai_category: category,
          excerpt: summary.trim().slice(0, 400), // excerpt도 AI 요약으로 교체
        }),
      })

      if (updateRes.status === 204) {
        results.summarized++
        processedTitles.push(article.title) // 처리됨으로 추가
      }
    } catch (e) {
      results.errors.push(`${article.id}: ${e.message?.slice(0, 60)}`)
    }
  }

  return new Response(JSON.stringify({ ...results, timestamp: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
