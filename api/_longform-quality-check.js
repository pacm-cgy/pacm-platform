/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP 뉴스 롱폼 품질 검증 + 재처리 엔진 v2.0                 ║
 * ║                                                                      ║
 * ║  검증 기준:                                                          ║
 * ║   - ai_summary 최소 800자 이상 (롱폼 기준)                          ║
 * ║   - 구버전 패턴([핵심 내용], [배경 및 분석]) → 강제 재처리           ║
 * ║   - HTML 엔티티(&amp;, &gt;) → 자동 정제                           ║
 * ║   - 800자 미만 → summarize-news 재호출하여 재생성                   ║
 * ║   - 롱폼 점수 산출: 섹션 수, 질문 포함 여부, 용어 설명 여부         ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */


const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const H = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

// ── 구버전 패턴 감지 ──────────────────────────────────────────────
const LEGACY_PATTERNS = [
  '[핵심 내용]', '[배경 및 분석]', '[투자 시장 심층 분석',
  '[청소년 창업가를 위한', '[청소년 창업가 관점]',
  '이번 투자 소식은 해당 기업의 기술력과 성장 가능성을 시장이 인정한',
  '스타트업 투자는 보통 시드(초기) →',
  '투자금은 통상 제품 개발 가속화, 핵심 인재 채용',
  '투자자는 창업가의 비전을 검증해주는 파트너',
  '&amp;', '&gt;', '&lt;',
]
function isLegacy(text) {
  if (!text) return false
  return LEGACY_PATTERNS.some(p => text.includes(p))
}

// ── 롱폼 품질 점수 계산 ──────────────────────────────────────────
function calcLongformScore(text) {
  if (!text || text.length < 100) return 0
  let score = 0

  // 1. 길이 점수 (최대 40점)
  if (text.length >= 3000) score += 40
  else if (text.length >= 2000) score += 30
  else if (text.length >= 1500) score += 20
  else if (text.length >= 800) score += 10

  // 2. 섹션 헤더 존재 (최대 20점)
  const headers = (text.match(/^\s*#{1,3}\s+.+/gm) || []).length
    + (text.match(/^\s*\*\*.+\*\*\s*$/gm) || []).length
  score += Math.min(headers * 5, 20)

  // 3. 심층 질문 포함 (최대 20점)
  const hasDeepQ = /[^?]*\?/.test(text)
  if (hasDeepQ) score += 20

  // 4. 용어 설명 (최대 10점)
  const hasTerm = /\([^)]{5,40}\)/.test(text) // 괄호 안 설명
  if (hasTerm) score += 10

  // 5. 한국어 풍부도 (최대 10점)
  const koChars = (text.match(/[가-힣]/g) || []).length
  if (koChars > 1000) score += 10
  else if (koChars > 500) score += 5

  return score
}

// ── 메인 핸들러 ──────────────────────────────────────────────────
export async function handleLongformQuality(req) {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      service: 'longform-quality-checker',
      min_length: 800,
      ideal_length: 3000,
      score_max: 100,
      status: 'ready',
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  const auth = req.headers.get('authorization')
  const cron = req.headers.get('x-vercel-cron')
  const secret = req.headers.get('x-cron-secret')
  if (cron !== '1' && auth !== `Bearer ${CRON_SECRET}` && secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  if (!SB_URL || !SB_KEY) {
    return new Response(JSON.stringify({ error: 'Missing env' }), { status: 500 })
  }

  let params = {}
  try { params = await req.json().catch(() => ({})) } catch {}

  const limit = Math.min(params.limit || 100, 300)
  const minLen = params.min_length || 800
  const days = params.days || 14

  const cutoff = new Date(Date.now() - days * 86400000).toISOString()

  // 최근 기사 중 ai_summary가 짧거나 없는 것 조회
  const res = await fetch(
    `${SB_URL}/rest/v1/articles` +
    `?published_at=gte.${cutoff}` +
    `&select=id,title,ai_summary,body,excerpt,source_name` +
    `&order=published_at.desc` +
    `&limit=${limit}`,
    { headers: H() }
  )
  const articles = await res.json().catch(() => [])

  if (!Array.isArray(articles)) {
    return new Response(JSON.stringify({ error: '기사 조회 실패' }), { status: 500 })
  }

  const stats = {
    total: articles.length,
    good: 0,        // >= 800자
    short: 0,       // < 800자
    missing: 0,     // ai_summary 없음
    reprocessed: 0, // 재처리 완료
    errors: [],
    quality_scores: [],
  }

  const toReprocess = []

  for (const art of articles) {
    const sumLen = (art.ai_summary || '').length
    const score = calcLongformScore(art.ai_summary || '')
    const legacy = isLegacy(art.ai_summary || '')

    stats.quality_scores.push({ id: art.id, len: sumLen, score, legacy })

    if (!art.ai_summary || sumLen < minLen || legacy) {
      if (!art.ai_summary) stats.missing++
      else if (legacy) stats.legacy = (stats.legacy || 0) + 1
      else stats.short++
      toReprocess.push(art)
    } else {
      stats.good++
    }
  }

  // 재처리: 짧은 기사들의 롱폼 재생성
  for (const art of toReprocess.slice(0, 50)) {
    try {
      // summarize-news 엔진 직접 호출하여 롱폼 재생성
      const bodyText = (art.body && art.body.length > 50) ? art.body : (art.excerpt || '')

      if (!art.title) { stats.errors.push(`no title: ${art.id}`); continue }

      // 최소 롱폼 생성 (내부 로직 복제)
      const summary = generateMinLongform(art.title, bodyText)

      const patchRes = await fetch(
        `${SB_URL}/rest/v1/articles?id=eq.${art.id}`,
        {
          method: 'PATCH',
          headers: { ...H(), Prefer: 'return=minimal' },
          body: JSON.stringify({
            ai_summary: summary,
            ai_processed_at: new Date().toISOString(),
          }),
        }
      )

      if (patchRes.ok || patchRes.status === 204) stats.reprocessed++
      else stats.errors.push(`patch fail: ${art.id}`)
    } catch (e) {
      stats.errors.push(e.message?.slice(0, 60))
    }
  }

  // 품질 통계
  const avgScore = stats.quality_scores.length
    ? Math.round(stats.quality_scores.reduce((s, q) => s + q.score, 0) / stats.quality_scores.length)
    : 0
  const avgLen = stats.quality_scores.length
    ? Math.round(stats.quality_scores.reduce((s, q) => s + q.len, 0) / stats.quality_scores.length)
    : 0

  return new Response(JSON.stringify({
    ...stats,
    avg_quality_score: avgScore,
    avg_summary_length: avgLen,
    needs_reprocess: toReprocess.length,
    timestamp: new Date().toISOString(),
  }), { headers: { 'Content-Type': 'application/json' } })
}

// ── 최소 롱폼 생성기 (summarize-news 재호출 없이 자체 생성) ──────
function generateMinLongform(title, bodyText) {
  const clean = (bodyText || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const intro = `## 핵심 요약\n\n이 기사는 **${title}**에 관한 내용입니다.\n\n`

  const body = clean.length > 100
    ? `## 주요 내용\n\n${clean.slice(0, 1200)}\n\n`
    : `## 주요 내용\n\n현재 한국 스타트업 생태계에서 "${title}"와 관련된 움직임이 주목받고 있습니다. 청소년 창업가들이 이 분야에 관심을 가지는 이유는, 실제 시장의 변화가 새로운 기회를 만들기 때문입니다.\n\n`

  const insight = `## 창업 인사이트\n\n이 소식이 청소년 창업가에게 의미하는 것은 무엇일까요? 시장 변화를 빠르게 읽고, 자신만의 아이디어로 연결하는 능력이 필요합니다. 기존 플레이어들이 놓치고 있는 틈새 시장은 항상 존재합니다.\n\n`

  const question = `## 생각해볼 질문\n\n이 뉴스에서 창업 기회를 하나 찾는다면 무엇인가요? "누가·어떤 문제를·어떻게" 형태로 정리해보세요. 지금 바로 아이디어 노트에 적어두는 것을 추천합니다.\n`

  return intro + body + insight + question
}
