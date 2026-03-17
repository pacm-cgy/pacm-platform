// 뉴스레터 수신 거부 API
export const config = { runtime: 'edge' }

const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const email = url.searchParams.get('email')

  const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

  // HTML 응답 헬퍼
  const page = (title, msg, color = '#D4AF37') => new Response(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Insightship</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0F0E0A;color:#F0EEE8;font-family:-apple-system,'Noto Sans KR',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{max-width:480px;width:100%;text-align:center}
  .logo{font-size:22px;font-weight:800;letter-spacing:3px;margin-bottom:40px}
  .logo span{color:#D4AF37}
  .icon{font-size:48px;margin-bottom:20px}
  h1{font-size:22px;font-weight:700;margin-bottom:12px;color:${color}}
  p{color:#a8a89e;font-size:14px;line-height:1.7;margin-bottom:24px}
  a{color:#D4AF37;text-decoration:none;font-size:13px}
  a:hover{text-decoration:underline}
</style>
</head>
<body>
  <div class="card">
    <div class="logo">INSIGHT<span>SHIP</span></div>
    <div class="icon">${color === '#ef4444' ? '❌' : '✅'}</div>
    <h1>${title}</h1>
    <p>${msg}</p>
    <a href="https://www.insightship.pacm.kr">insightship.pacm.kr 방문하기 →</a>
  </div>
</body></html>`, { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } })

  if (!token && !email) {
    return page('잘못된 링크', '유효하지 않은 수신 거부 링크입니다.', '#ef4444')
  }

  try {
    let result

    if (token) {
      // unsubscribe_token으로 찾아서 비활성화
      result = await fetch(
        `${SB_URL}/rest/v1/newsletter_subscribers?unsubscribe_token=eq.${encodeURIComponent(token)}&select=id,email,is_active`,
        { headers: H }
      )
    } else {
      // 이메일로 찾기
      result = await fetch(
        `${SB_URL}/rest/v1/newsletter_subscribers?email=eq.${encodeURIComponent(email)}&select=id,email,is_active`,
        { headers: H }
      )
    }

    const subs = await result.json()

    if (!Array.isArray(subs) || !subs.length) {
      return page('구독 정보 없음', '해당 이메일의 구독 정보를 찾을 수 없습니다.', '#ef4444')
    }

    const sub = subs[0]

    if (!sub.is_active) {
      return page('이미 수신 거부됨', `${sub.email} 주소는 이미 수신 거부 처리되어 있습니다.`)
    }

    // is_active = false 로 변경
    await fetch(
      `${SB_URL}/rest/v1/newsletter_subscribers?id=eq.${sub.id}`,
      {
        method: 'PATCH',
        headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ is_active: false }),
      }
    )

    return page(
      '수신 거부 완료',
      `<strong style="color:#F0EEE8">${sub.email}</strong> 주소로 더 이상 뉴스레터가 발송되지 않습니다.<br>언제든지 다시 구독하실 수 있습니다.`
    )
  } catch (e) {
    return page('오류 발생', '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', '#ef4444')
  }
}
