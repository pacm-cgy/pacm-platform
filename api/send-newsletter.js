// AI 뉴스레터 자동 발송 - 매주 월요일 KST 09:00 (UTC 00:00)
export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const CRON_SECRET = process.env.CRON_SECRET

async function callClaude(prompt, maxTokens = 2000) {
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
    signal: AbortSignal.timeout(45000),
  })
  if (!res.ok) throw new Error(`Claude API 오류: ${res.status}`)
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

function getKSTDate() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().split('T')[0]
}

function getLastWeekRange() {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - now.getDay() - 6) // 지난주 월요일
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { from: monday.toISOString(), to: sunday.toISOString() }
}

export default async function handler(req) {
  const authHeader = req.headers.get('authorization')
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  if (!isVercelCron && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // 지난주 뉴스 가져오기
  const { from, to } = getLastWeekRange()
  const newsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&is_duplicate=eq.false&published_at=gte.${from}&published_at=lte.${to}&select=title,ai_summary,excerpt,source_name,source_url,ai_category&order=published_at.desc&limit=30`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  )
  const articles = await newsRes.json()

  if (!articles?.length) {
    return new Response(JSON.stringify({ message: '발송할 뉴스 없음' }), { status: 200 })
  }

  // 구독자 목록
  const subRes = await fetch(
    `${SUPABASE_URL}/rest/v1/newsletter_subscribers?is_active=eq.true&select=email`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  )
  const subscribers = await subRes.json()
  if (!subscribers?.length) {
    return new Response(JSON.stringify({ message: '구독자 없음' }), { status: 200 })
  }

  // AI로 뉴스레터 내용 생성
  const articleSummaries = articles.map((a, i) =>
    `${i+1}. [${a.ai_category || '일반'}] ${a.title}\n   ${a.ai_summary || a.excerpt || ''}\n   출처: ${a.source_name}`
  ).join('\n\n')

  const newsletterPrompt = `당신은 청소년 창업 플랫폼 Insightship의 주간 뉴스레터 에디터입니다.
지난 한 주간의 주요 창업/스타트업 뉴스를 청소년 독자를 위해 정리해주세요.

뉴스 목록:
${articleSummaries}

뉴스레터 작성 규칙:
1. 청소년이 읽기 쉬운 문체
2. 어려운 용어는 반드시 설명 추가
3. 각 섹션은 명확한 소제목으로 구분 (투자, AI/기술, 창업 트렌드 등)
4. 이 주의 핵심 메시지 1문장으로 시작
5. 마지막에 "이번 주 창업 인사이트" 코너로 청소년에게 도움이 되는 조언 1개
6. 전체 길이: HTML 이메일 형식, 읽는 시간 5분 내외
7. 사실만 기반으로 작성, 추측 금지

HTML 이메일 형식으로 작성 (인라인 스타일 포함):`

  let newsletterHtml
  try {
    const aiContent = await callClaude(newsletterPrompt, 2000)
    newsletterHtml = aiContent
  } catch (e) {
    // AI 실패 시 기본 템플릿
    newsletterHtml = `<h2>이번 주 창업 뉴스</h2>${articles.slice(0,10).map(a => `<div><h3>${a.title}</h3><p>${a.ai_summary || a.excerpt || ''}</p><p><a href="${a.source_url || '#'}">원문 보기</a></p></div>`).join('')}`
  }

  const kstDate = getKSTDate()
  const subject = `📰 Insightship 주간 창업 뉴스 - ${kstDate}`

  // 이메일 발송 (배치)
  const BATCH_SIZE = 50
  let sent = 0
  const emails = subscribers.map(s => s.email)

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE)
    const sendRes = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch.map(to => ({
        from: 'Insightship <newsletter@pacm.kr>',
        to,
        subject,
        html: `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, 'Noto Sans KR', sans-serif; background: #f5f3ee; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #d4cfc5;">
    <div style="background: #0a0a09; padding: 24px 32px; display: flex; align-items: center; gap: 12px;">
      <div style="color: #fff; font-weight: 800; font-size: 18px; letter-spacing: 2px;">
        INSIGHT<span style="color: #D4AF37;">SHIP</span>
      </div>
      <div style="color: #888; font-size: 12px; margin-left: auto;">${kstDate}</div>
    </div>
    <div style="padding: 32px; color: #0f0e0a; line-height: 1.8;">
      ${newsletterHtml}
    </div>
    <div style="background: #f5f3ee; padding: 20px 32px; border-top: 1px solid #d4cfc5; font-size: 11px; color: #888;">
      <p>© ${new Date().getFullYear()} INSIGHTSHIP by PACM. 운영: 피에이씨엠(PACM)</p>
      <p>사업자등록번호: 891-45-01385 | 문의: contact@pacm.kr</p>
      <p><a href="https://www.insightship.pacm.kr" style="color: #D4AF37;">insightship.pacm.kr</a> 방문하기</p>
    </div>
  </div>
</body>
</html>`,
      })))
    })
    if (sendRes.ok) sent += batch.length
  }

  // 발송 기록
  await fetch(`${SUPABASE_URL}/rest/v1/newsletter_logs`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ sent_count: sent, subject, sent_at: new Date().toISOString() }),
  }).catch(() => {})

  return new Response(JSON.stringify({ sent, subscribers: emails.length, subject }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
