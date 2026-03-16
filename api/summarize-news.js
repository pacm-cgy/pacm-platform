// AI 뉴스 요약 + 분류 + 중복 제거
// 1순위: Groq API (무료, Llama3) / 2순위: Anthropic / 3순위: 규칙 기반
export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const GROQ_KEY = process.env.GROQ_API_KEY
const CRON_SECRET = process.env.CRON_SECRET

// ── 카테고리 키워드 맵 ────────────────────────────────────────
const CAT_KEYWORDS = {
  funding:          ['투자', 'vc', '펀딩', '시리즈', 'ipo', '상장', '유치', '라운드'],
  unicorn:          ['유니콘', '데카콘', '기업가치'],
  ai:               ['ai', '인공지능', '머신러닝', '딥러닝', 'llm', '생성형'],
  edutech:          ['에듀테크', '교육', '학습', '강의', '튜터'],
  youth:            ['청소년', '청년', '학생', '고등학생', '중학생', '대학생'],
  entrepreneurship: ['창업', '스타트업', '창업자', '대표', '사업'],
  climate:          ['기후', '친환경', '그린', 'esg', '탄소', '재생에너지'],
  health:           ['헬스케어', '의료', '바이오', '디지털헬스', '원격진료'],
  fintech:          ['핀테크', '금융', '페이', '블록체인', '암호화폐'],
}

function detectCategory(text) {
  const lower = text.toLowerCase()
  let best = 'general', bestScore = 0
  for (const [cat, keywords] of Object.entries(CAT_KEYWORDS)) {
    const score = keywords.filter(k => lower.includes(k)).length
    if (score > bestScore) { bestScore = score; best = cat }
  }
  return best
}

// ── 규칙 기반 요약 (AI 없을 때 폴백) ─────────────────────────
function ruleBasedSummary(title, excerpt) {
  const text = excerpt || title || ''
  // 불필요한 패턴 제거
  const cleaned = text
    .replace(/\[단독\]|\[속보\]|\[긴급\]|\[종합\]/g, '')
    .replace(/기자\s*=\s*/g, '')
    .replace(/\.\s*\.\s*\./g, '.')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim()

  // 문장 분리 후 핵심 3문장
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(s => s.length > 10)
  return sentences.slice(0, 3).join(' ').slice(0, 400)
}

// ── Groq API (무료 Llama3) ────────────────────────────────────
async function callGroq(prompt) {
  if (!GROQ_KEY) return null
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) return null
  const d = await r.json()
  return d.choices?.[0]?.message?.content?.trim() || null
}

// ── Anthropic API ──────────────────────────────────────────────
async function callAnthropic(prompt) {
  if (!ANTHROPIC_KEY) return null
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!r.ok) return null
  const d = await r.json()
  return d.content?.[0]?.text?.trim() || null
}

// ── 뉴스 요약 ────────────────────────────────────────────────
async function summarizeArticle(article) {
  const prompt = `청소년 창업 플랫폼 에디터로서 아래 뉴스를 청소년이 이해하기 쉽게 3~4문장으로 요약하세요.
어려운 용어는 괄호로 설명을 추가하고, 사실만 기재하며, '단독/속보' 등 자극적 표현은 제거하세요.
요약문만 출력하세요.

제목: ${article.title}
내용: ${article.excerpt || ''}`.slice(0, 1000)

  // Groq → Anthropic → 규칙 기반 순서로 시도
  const result = await callGroq(prompt)
    || await callAnthropic(prompt)
    || ruleBasedSummary(article.title, article.excerpt)

  return result || article.excerpt || article.title
}

// ── 중복 감지 ─────────────────────────────────────────────────
function isSimilar(t1, t2) {
  const w1 = new Set(t1.replace(/[^\w가-힣]/g, ' ').split(/\s+/).filter(w => w.length > 2))
  const w2 = new Set(t2.replace(/[^\w가-힣]/g, ' ').split(/\s+/).filter(w => w.length > 2))
  const common = [...w1].filter(w => w2.has(w)).length
  return w1.size > 0 && common / Math.max(w1.size, w2.size) > 0.55
}

export default async function handler(req) {
  const authHeader = req.headers.get('authorization')
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  if (!isVercelCron && authHeader !== 'Bearer ' + CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const mode = new URL(req.url).searchParams.get('mode') || 'normal' // normal | debug

  // 미처리 뉴스 (ai_summary 없는 것)
  const fetchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&ai_summary=is.null&select=id,title,excerpt,source_name,published_at&order=published_at.desc&limit=20`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY } }
  )
  const articles = await fetchRes.json()
  if (!articles?.length) return new Response(JSON.stringify({ message: '처리할 기사 없음' }), { status: 200 })

  // 이미 처리된 제목들 (중복 비교용)
  const doneRes = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&ai_summary=not.is.null&select=title&order=published_at.desc&limit=100`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY } }
  )
  const doneTitles = (await doneRes.json()).map(a => a.title)

  const results = { summarized: 0, duplicates: 0, rule_based: 0, errors: [], mode }

  for (const article of articles) {
    try {
      // 중복 체크
      if (doneTitles.some(t => isSimilar(article.title, t))) {
        await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${article.id}`, {
          method: 'PATCH',
          headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ ai_summary: '[중복]' + (article.excerpt || '').slice(0, 50) }),
        })
        results.duplicates++
        continue
      }

      const summary = await summarizeArticle(article)
      const isRuleBased = !GROQ_KEY && !ANTHROPIC_KEY
      if (isRuleBased) results.rule_based++

      const category = detectCategory(article.title + ' ' + article.excerpt)

      await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${article.id}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ ai_summary: summary.slice(0, 400), ai_category: category, excerpt: summary.slice(0, 400) }),
      })

      results.summarized++
      doneTitles.push(article.title)
    } catch (e) {
      results.errors.push(article.id.slice(0, 8) + ': ' + (e.message || '').slice(0, 50))
    }
  }

  return new Response(JSON.stringify({ ...results, timestamp: new Date().toISOString() }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
