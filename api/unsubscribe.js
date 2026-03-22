// 뉴스레터 수신 거부
export const config = { runtime: 'edge' }

const SB_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SH = () => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` })

const page = (title, msg, isError=false) => new Response(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Insightship</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#080808;color:#F5F5F5;font-family:-apple-system,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .box{background:#0D0D0D;border:1px solid #1E1E1E;border-radius:16px;padding:40px 32px;max-width:440px;width:100%;text-align:center}
  .icon{font-size:48px;margin-bottom:20px}
  h1{font-size:22px;font-weight:700;letter-spacing:-0.03em;margin-bottom:12px;color:${isError?'#F43F5E':'#F5F5F5'}}
  p{font-size:14px;color:#6B6B6B;line-height:1.7;margin-bottom:24px}
  a{display:inline-flex;align-items:center;justify-content:center;height:42px;padding:0 24px;background:#6366F1;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;transition:background .15s}
  a:hover{background:#818CF8}
</style>
</head>
<body>
<div class="box">
  <div class="icon">${isError?'⚠️':'✅'}</div>
  <h1>${title}</h1>
  <p>${msg}</p>
  <a href="https://www.insightship.pacm.kr">Insightship 홈으로</a>
</div>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' }})

export default async function handler(req) {
  const url   = new URL(req.url.startsWith('http') ? req.url : `https://insightship.pacm.kr${req.url}`)
  const token = url.searchParams.get('token')
  const email = url.searchParams.get('email')

  if (!token && !email) {
    return page('잘못된 링크', '수신 거부 링크가 올바르지 않습니다.<br>이메일 내 링크를 다시 확인해주세요.', true)
  }

  try {
    let query = ''
    if (token) {
      query = `${SB_URL}/rest/v1/newsletter_subscribers?unsubscribe_token=eq.${encodeURIComponent(token)}`
    } else {
      query = `${SB_URL}/rest/v1/newsletter_subscribers?email=eq.${encodeURIComponent(email)}`
    }

    // 먼저 구독자 확인
    const check = await fetch(query, { headers: SH() })
    const subs  = await check.json()

    if (!subs?.length) {
      return page('이미 처리됨', '이 이메일 주소는 이미 수신 거부 처리되었거나 구독 내역이 없습니다.')
    }

    // 수신 거부 처리
    const patch = await fetch(query, {
      method: 'PATCH',
      headers: { ...SH(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ is_active: false, unsubscribed_at: new Date().toISOString() }),
    })

    if (!patch.ok) {
      throw new Error(`DB 오류: ${patch.status}`)
    }

    // 로그 기록
    const sub = subs[0]
    await fetch(`${SB_URL}/rest/v1/newsletter_unsubscribe_logs`, {
      method: 'POST',
      headers: { ...SH(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ email: sub.email, unsubscribed_at: new Date().toISOString(), reason: 'email_link' }),
    }).catch(() => {})

    return page(
      '수신 거부 완료',
      `<strong style="color:#F5F5F5">${sub.email}</strong>의 뉴스레터 수신이 해제되었습니다.<br><br>언제든지 다시 구독하실 수 있습니다.`
    )
  } catch (e) {
    console.error('수신 거부 오류:', e)
    return page('오류 발생', `처리 중 오류가 발생했습니다: ${e.message}<br>contact@pacm.kr로 문의해주세요.`, true)
  }
}
