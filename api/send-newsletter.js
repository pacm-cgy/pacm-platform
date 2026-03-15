// Vercel Serverless Function - 뉴스레터 발송
// Resend 무료: 월 3,000건, 하루 100건

export const config = { runtime: 'edge' }

const RESEND_API_KEY = process.env.RESEND_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

async function getSubscribers() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/newsletter_subscribers?is_active=eq.true&select=email,id`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      }
    }
  )
  return res.json()
}

async function getLatestArticles() {
  const yesterday = new Date(Date.now() - 86400000).toISOString()
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?status=eq.published&published_at=gte.${yesterday}&order=published_at.desc&limit=5&select=title,slug,excerpt,category,source_name`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      }
    }
  )
  return res.json()
}

function buildEmailHTML(articles) {
  const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const CATEGORY_KO = { insight: '인사이트', story: '스토리', trend: '트렌드', community: '커뮤니티' }

  const articleHTML = articles.map(a => `
    <div style="border-left:3px solid #C8982A;padding:12px 16px;margin-bottom:16px;background:#fafaf8;">
      <div style="font-size:10px;color:#C8982A;letter-spacing:2px;font-family:monospace;margin-bottom:4px;">
        ${CATEGORY_KO[a.category] || a.category}${a.source_name ? ` · 출처: ${a.source_name}` : ''}
      </div>
      <a href="https://www.insightship.pacm.kr/article/${a.slug}"
         style="font-size:16px;font-weight:700;color:#0F0E0A;text-decoration:none;line-height:1.4;display:block;margin-bottom:6px;">
        ${a.title}
      </a>
      <p style="font-size:13px;color:#7A7368;line-height:1.6;margin:0;">
        ${a.excerpt || ''}
      </p>
    </div>
  `).join('')

  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5F3EE;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <!-- 헤더 -->
    <div style="background:#0F0E0A;padding:28px 32px;text-align:center;">
      <div style="font-family:monospace;font-size:20px;font-weight:700;letter-spacing:3px;color:#F5F3EE;">
        INSIGHT<span style="color:#C8982A;">SHIP</span>
      </div>
      <div style="font-size:11px;color:#555;margin-top:4px;letter-spacing:1px;">청소년 창업 플랫폼</div>
    </div>
    <!-- 날짜 -->
    <div style="background:#C8982A;padding:10px 32px;">
      <div style="font-family:monospace;font-size:11px;color:#0F0E0A;letter-spacing:2px;">${date} DAILY BRIEF</div>
    </div>
    <!-- 본문 -->
    <div style="padding:28px 32px;">
      <h2 style="font-size:13px;color:#7A7368;letter-spacing:3px;font-family:monospace;margin:0 0 20px 0;">오늘의 창업 인사이트</h2>
      ${articleHTML || '<p style="color:#999;font-size:14px;">오늘은 새로운 소식이 없습니다.</p>'}
    </div>
    <!-- CTA -->
    <div style="padding:0 32px 28px;">
      <a href="https://www.insightship.pacm.kr"
         style="display:block;background:#0F0E0A;color:#C8982A;text-align:center;padding:14px;font-family:monospace;font-size:12px;letter-spacing:2px;text-decoration:none;">
        INSIGHTSHIP 바로가기 →
      </a>
    </div>
    <!-- 푸터 -->
    <div style="background:#F5F3EE;padding:20px 32px;text-align:center;border-top:1px solid #E0DDD6;">
      <p style="font-size:11px;color:#999;margin:0;line-height:1.8;">
        © 2026 Insightship by PACM<br>
        <a href="https://www.insightship.pacm.kr/unsubscribe?email={{email}}" style="color:#C8982A;">구독 해지</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

export default async function handler(req) {
  const authHeader = req.headers.get('authorization')
  const cronHeader = req.headers.get('x-vercel-cron')
  if (!cronHeader && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const [subscribers, articles] = await Promise.all([
    getSubscribers(),
    getLatestArticles(),
  ])

  if (!subscribers.length) {
    return new Response(JSON.stringify({ message: '구독자 없음' }), { status: 200 })
  }

  const htmlTemplate = buildEmailHTML(articles)
  const results = { sent: 0, failed: 0 }

  // Resend API - 배치 발송 (하루 100건 제한 준수)
  const batchSize = 90 // 안전 마진
  const batch = subscribers.slice(0, batchSize)

  for (const sub of batch) {
    try {
      const html = htmlTemplate.replace('{{email}}', encodeURIComponent(sub.email))
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Insightship <newsletter@insightship.pacm.kr>',
          to: sub.email,
          subject: `[Insightship] ${new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 창업 인사이트`,
          html,
        }),
      })
      results.sent++
    } catch (e) {
      results.failed++
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
