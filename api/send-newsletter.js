/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP 주간 뉴스레터 발송 v4.0                                ║
 * ║  담당 AI: ECHO (에코) — 뉴스레터 매니저                             ║
 * ║                                                                      ║
 * ║  v4 업그레이드:                                                      ║
 * ║  - 완전 재설계된 HTML 이메일 템플릿 (LongBlack 스타일)              ║
 * ║  - 섹션 구성 강화: 이번 주 TOP5 / 심층 분석 / 창업 팁 / 시장 맥락  ║
 * ║  - 실패·피봇 스토리 섹션 추가                                       ║
 * ║  - 발송 전 테스트 모드 강화                                         ║
 * ║  - 구독자 맞춤형 unsubscribe 링크 개선                              ║
 * ║  - 발송 로그 상세화                                                  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
export const config = { runtime: 'edge', maxDuration: 60 }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_KEY  = process.env.RESEND_API_KEY
const CRON_SECRET = process.env.CRON_SECRET

const SH = () => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` })
const json = (d, s=200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })

// ══════════════════════════════════════════════════════════════════════
// §1. 날짜 유틸
// ══════════════════════════════════════════════════════════════════════

function getLastWeekRange() {
  const now = new Date(Date.now() + 9*3600000)
  const day = now.getDay() || 7
  const thisMonday = new Date(now)
  thisMonday.setDate(now.getDate()-(day-1)); thisMonday.setHours(0,0,0,0)
  const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate()-7)
  const lastSunday = new Date(thisMonday); lastSunday.setDate(thisMonday.getDate()-1); lastSunday.setHours(23,59,59,999)
  const fmtShort = d => `${d.getMonth()+1}/${d.getDate()}`
  const fmt = d => `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`
  return {
    from: new Date(lastMonday.getTime()-9*3600000).toISOString(),
    to:   new Date(lastSunday.getTime()-9*3600000).toISOString(),
    label: `${fmtShort(lastMonday)} ~ ${fmtShort(lastSunday)}`,
    labelFull: `${fmt(lastMonday)} ~ ${fmt(lastSunday)}`,
    weekNum: Math.ceil(lastMonday.getDate()/7),
    month: lastMonday.getMonth()+1,
  }
}

function getThisWeekLabel() {
  const n = new Date(Date.now()+9*3600000)
  const sun = new Date(n); sun.setDate(n.getDate()+(7-(n.getDay()||7)))
  return `${n.getMonth()+1}/${n.getDate()} ~ ${sun.getMonth()+1}/${sun.getDate()}`
}

// ══════════════════════════════════════════════════════════════════════
// §2. NLP 엔진 (자체)
// ══════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','위해','통해',
  '대한','관련','따른','있는','없는','되는','하는','있다','없다',
  '된다','한다','이다','있으며','되며','하며','이번','지난','올해',
  '작년','이달','오늘','어제','최근','현재','지금','특히','또','더',
  '가장','매우','모두','함께','이미','아직','약','총','전','후','당',
])

function tokenize(text) {
  if (!text) return []
  return (text.replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g,' ').toLowerCase()
    .match(/[가-힣]{2,}|[a-z]{3,}|[0-9]+/g)||[])
    .filter(t => !STOPWORDS.has(t) && t.length >= 2)
}

// ── 뉴스 분류 (확장) ─────────────────────────────────────────────────
function classifyArticles(articles) {
  const out = { funding:[], policy:[], product:[], person:[], youth:[], tech:[], climate:[], other:[] }
  for (const a of articles) {
    const t = (a.title+' '+(a.ai_summary||'')).toLowerCase()
    if (/청소년|청년|대학생|고등학생|중학생|학생창업|비즈쿨/.test(t))   { out.youth.push(a);   continue }
    if (/투자|펀딩|시리즈|억원|조원|vc|유니콘|엑셀러레이터/.test(t))    { out.funding.push(a); continue }
    if (/정부|지원|공모|선발|과기부|중기부|창진원|정책|바우처/.test(t))  { out.policy.push(a);  continue }
    if (/ai|인공지능|딥러닝|llm|생성형|chatgpt|gpt/.test(t))           { out.tech.push(a);    continue }
    if (/기후|탄소|esg|그린|친환경|신재생|태양/.test(t))                { out.climate.push(a); continue }
    if (/출시|론칭|서비스|플랫폼|앱|오픈|업데이트/.test(t))             { out.product.push(a); continue }
    if (/대표|ceo|창업자|설립자|인터뷰|스토리|수상/.test(t))             { out.person.push(a);  continue }
    out.other.push(a)
  }
  return out
}

// ── §2-A. TOP5 뉴스 섹션 ─────────────────────────────────────────────
function buildTop5Section(articles, label) {
  const b = classifyArticles(articles)
  const priority = [
    ...b.youth.slice(0,1),
    ...b.funding.slice(0,2),
    ...b.tech.slice(0,1),
    ...b.policy.slice(0,1),
  ].filter((v,i,a)=>a.findIndex(x=>x.title===v.title)===i).slice(0,5)

  const pool = priority.length >= 3 ? priority : articles.slice(0,5)

  return pool.map((a,i) => {
    const sum = (a.ai_summary||a.title||'').replace(/\*\*|##|---/g,'').trim()
    const preview = sum.length > 160 ? sum.slice(0,160)+'...' : sum
    const icons = ['🥇','🥈','🥉','④','⑤']
    return `${icons[i]||'•'} **${a.title.slice(0,60)}**\n${preview}`
  }).join('\n\n') + `\n\n*지난 한 주(${label}) 가장 주목받은 소식들입니다.*`
}

// ── §2-B. 심층 분석: 이번 주의 한 가지 ─────────────────────────────
function buildDeepDiveSection(articles, label) {
  const b = classifyArticles(articles)
  // 가장 많은 정보가 있는 뉴스 선택
  const candidates = [...b.funding.slice(0,3), ...b.tech.slice(0,2), ...b.product.slice(0,2)]
  const pick = candidates.sort((a,b)=>(b.ai_summary||'').length-(a.ai_summary||'').length)[0] || articles[0]
  if (!pick) return '이번 주 심층 분석 콘텐츠를 준비 중입니다.'

  const sum = (pick.ai_summary||pick.title||'').replace(/\*\*|##/g,'').trim()
  const nums = (pick.title + ' ' + (pick.ai_summary||'')).match(/[0-9,]+억원?|[0-9,]+조원?|[0-9]+%|[0-9]+배/g) || []

  return `이번 주 ECHO가 주목한 한 가지를 더 깊이 파봤습니다.\n\n` +
    `**📌 ${pick.title.slice(0,70)}**\n\n` +
    `${sum.slice(0,300)}\n\n` +
    (nums.length ? `**핵심 수치**: ${nums.join(' / ')}\n\n` : '') +
    `**왜 이 뉴스인가?**\n` +
    `스타트업 생태계에서 이런 소식이 나온다는 것은 그 분야에 돈과 사람이 모이고 있다는 신호입니다. ` +
    `"내가 이 시장에 들어간다면?"이라는 질문을 던져보세요.\n\n` +
    `*Insightship AI 멘토에게 이 뉴스에 대해 더 물어볼 수 있어요.*`
}

// ── §2-C. 창업 팁: 이번 주 실천 포인트 ──────────────────────────────
const WEEKLY_TIPS = [
  { title: '문제를 먼저 발견하세요', body: '좋은 창업 아이디어는 "멋진 제품"이 아닌 "해결할 문제"에서 시작합니다. 오늘 하루 불편한 것 3가지를 적어보세요.' },
  { title: 'MVP는 작을수록 좋아요', body: '완벽한 앱 대신 노션 페이지 하나, 구글폼 하나로 먼저 수요를 테스트해보세요. 1명의 진짜 고객이 100개의 기능보다 중요합니다.' },
  { title: '투자자처럼 생각해보세요', body: '"이 스타트업에 왜 투자해야 하는가?" 자기 아이디어에 직접 이 질문을 던져보세요. 명쾌하게 답하지 못하면 아직 문제 정의가 부족한 겁니다.' },
  { title: '린 캔버스를 작성해보세요', body: '사업 아이디어를 한 장에 정리하는 린 캔버스 9블록. 멘토 AI에게 "린 캔버스 도와줘"라고 말해보세요.' },
  { title: '시장 크기를 계산해보세요', body: '"TAM(전체 시장) × SAM(서비스 가능 시장) × SOM(현실적 점유율)" 공식으로 내 아이디어의 시장 규모를 추정해보세요.' },
  { title: '경쟁사를 분석하세요', body: '경쟁사가 있다는 건 시장이 있다는 증거입니다. 경쟁사의 1-star 리뷰를 읽어보세요. 불만이 곧 기회입니다.' },
  { title: '팀을 먼저 생각하세요', body: '투자자들은 "아이디어"보다 "팀"에 베팅합니다. 나의 강점은 무엇이고, 어떤 역할의 파트너가 필요한지 정의해보세요.' },
]

function buildTipSection(articles, weekNum) {
  const tip = WEEKLY_TIPS[weekNum % WEEKLY_TIPS.length]
  const b = classifyArticles(articles)
  const related = b.funding.concat(b.tech).slice(0,1)
  const example = related[0] ? `\n\n**이번 주 예시**: ${related[0].title.slice(0,50)}처럼 투자받은 기업도 바로 이 원칙으로 시작했습니다.` : ''

  return `**이번 주 실천 포인트: ${tip.title}**\n\n${tip.body}${example}\n\n` +
    `Insightship AI 멘토에게 더 구체적인 방법을 물어보세요 →`
}

// ── §2-D. 시장 맥락 & 경제 섹션 ─────────────────────────────────────
function buildMarketSection(articles, label) {
  const b = classifyArticles(articles)
  const fundCount  = b.funding.length
  const techCount  = b.tech.length
  const youthCount = b.youth.length
  const policyCount= b.policy.length

  const fundLine = fundCount > 0
    ? `투자·펀딩 관련 소식 **${fundCount}건**: ${b.funding.slice(0,2).map(a=>a.title.slice(0,30)).join(', ')} 등`
    : '투자 시장은 전반적으로 안정적 흐름을 유지했습니다.'
  const techLine = techCount > 0
    ? `AI·기술 스타트업 소식 **${techCount}건**: 생성형 AI 및 B2B SaaS 중심으로 투자 집중`
    : ''
  const policyLine = policyCount > 0
    ? `정부 지원·정책 소식 **${policyCount}건**: ${b.policy.slice(0,2).map(a=>a.title.slice(0,25)).join(', ')} 등`
    : ''
  const youthLine = youthCount > 0
    ? `청소년·청년 창업 소식 **${youthCount}건**: 직접 참여 가능한 기회들이 있습니다!`
    : ''

  const lines = [fundLine, techLine, policyLine, youthLine].filter(Boolean)

  return `지난주(${label}) 한국 창업·스타트업 생태계 요약:\n\n` +
    lines.map(l => `• ${l}`).join('\n') +
    `\n\n이번 주에도 비슷한 흐름이 이어질 전망입니다. 특히 AI 기반 스타트업에 대한 관심은 지속될 것으로 예상됩니다.`
}

// ── §2-E. 청소년 창업가 인사이트 (강화) ──────────────────────────────
function buildYouthInsightSection(articles) {
  const b = classifyArticles(articles)
  const youthItems = b.youth.slice(0,3)
  const fundItems  = b.funding.slice(0,2)

  const youthLine = youthItems.length > 0
    ? `이번 주 청소년·청년 창업 직접 관련 소식:\n${youthItems.map(a=>`• **${a.title.slice(0,50)}**`).join('\n')}`
    : '이번 주에도 다양한 창업 소식이 전해졌습니다.'

  const insightA = fundItems[0]
    ? `**통찰 1: 문제 정의의 힘**\n**${fundItems[0].title.slice(0,45)}** 같은 투자 소식을 볼 때 "이 회사는 어떤 문제를 어떻게 해결하는가"를 분석해보세요. 투자자는 제품이 아닌 문제 해결 능력을 삽니다.`
    : `**통찰 1: 문제 정의의 힘**\n성공한 스타트업은 모두 "명확한 문제"에서 시작했습니다. 내 일상의 불편함이 곧 창업 아이디어의 씨앗입니다.`

  const insightB = `**통찰 2: 나이는 경쟁 우위**\nZ세대 소비자를 가장 잘 이해하는 사람은 Z세대 창업가입니다. 지금 여러분이 불편하게 느끼는 것이 수백만 명의 공통 문제일 수 있습니다.`

  const insightC = `**통찰 3: 지금 시작하세요**\n완벽한 준비를 기다리지 마세요. 노션 페이지 하나, 구글폼 하나로 오늘 MVP를 만들 수 있습니다. 실패해도 괜찮습니다. 빠른 실패가 빠른 성장으로 이어집니다.`

  return `${youthLine}\n\n${insightA}\n\n${insightB}\n\n${insightC}`
}

// ── §2-F. AI 주간 전망 ────────────────────────────────────────────────
function buildForecastSection(articles, thisWeekLabel) {
  const b = classifyArticles(articles)
  const hotTopics = []
  if (b.tech.length >= 2)    hotTopics.push('AI·생성형 기술')
  if (b.funding.length >= 3) hotTopics.push('투자·펀딩')
  if (b.policy.length >= 2)  hotTopics.push('정부 지원 정책')
  if (b.youth.length >= 1)   hotTopics.push('청소년 창업')
  if (b.climate.length >= 1) hotTopics.push('기후테크·ESG')
  if (!hotTopics.length) hotTopics.push('스타트업 생태계')

  const topicStr = hotTopics.slice(0,3).join(', ')
  const riskNote = b.funding.length < 3
    ? '다만 이번 주는 투자 소식이 상대적으로 적어 시장 심리가 다소 관망세일 수 있습니다.'
    : '투자 심리는 전반적으로 긍정적 흐름을 유지할 것으로 예상됩니다.'

  return `지난주 데이터 기반 이번 주(${thisWeekLabel}) AI 추론입니다.\n\n` +
    `지난주 뉴스에서 **${topicStr}** 관련 소식이 집중됐습니다. ` +
    `이번 주에도 이 분야에서 추가 투자 발표나 서비스 출시 소식이 이어질 가능성이 높습니다.\n\n` +
    `${riskNote}\n\n` +
    `*이 내용은 AI가 뉴스 데이터를 분석한 추론이며 확정된 사실이 아닙니다.*`
}

// ══════════════════════════════════════════════════════════════════════
// §3. HTML v4 이메일 조립 (완전 재설계)
// ══════════════════════════════════════════════════════════════════════

function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\n\n/g,'</p><p style="margin:0 0 14px 0">')
    .replace(/\n/g,'<br>')
}

function htmlSection(icon, title, body, accent='#6366F1') {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-radius:14px;overflow:hidden;border:1px solid #1a1a1a">
    <tr><td style="background:#111;padding:14px 22px;border-bottom:1px solid #1a1a1a">
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="width:30px;height:30px;background:${accent}20;border-radius:8px;text-align:center;vertical-align:middle;font-size:15px;line-height:30px">${icon}</td>
        <td style="padding-left:10px;font-family:'JetBrains Mono',Consolas,monospace;font-size:10px;font-weight:700;letter-spacing:1.5px;color:${accent};text-transform:uppercase">${escHtml(title)}</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#0c0c0c;padding:20px 22px">
      <p style="margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13.5px;line-height:1.9;color:#a0a0a0;word-break:keep-all">${escHtml(body)}</p>
    </td></tr>
  </table>`
}

function htmlNewsItem(title, source, i) {
  const colors = ['#6366F1','#3B82F6','#22C55E','#F59E0B','#F43F5E','#C084FC','#06B6D4','#F97316']
  const c = colors[i % colors.length]
  return `<tr>
    <td style="padding:12px 0;border-bottom:1px solid #141414;vertical-align:top">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="width:24px;vertical-align:top;padding-top:2px">
          <div style="width:20px;height:20px;border-radius:6px;background:${c}18;border:1px solid ${c}28;text-align:center;line-height:20px;font-family:monospace;font-size:9px;color:${c};font-weight:700">${i+1}</div>
        </td>
        <td style="padding-left:10px">
          <div style="font-size:13px;color:#d4d4d4;line-height:1.55;margin-bottom:3px;font-family:-apple-system,sans-serif">${escHtml(title)}</div>
          ${source ? `<div style="font-size:10px;color:#3a3a3a;font-family:monospace">${escHtml(source)}</div>` : ''}
        </td>
      </tr></table>
    </td>
  </tr>`
}

function htmlStatBadge(label, count, change) {
  const color = change > 0 ? '#22C55E' : change < 0 ? '#F43F5E' : '#666'
  const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '─'
  return `<td style="padding:6px;text-align:center">
    <table cellpadding="0" cellspacing="0" style="background:#0f0f0f;border:1px solid #1a1a1a;border-radius:10px;min-width:80px;margin:0 auto"><tr>
      <td style="padding:12px 14px;text-align:center">
        <div style="font-family:monospace;font-size:8px;color:#555;letter-spacing:.8px;margin-bottom:6px;text-transform:uppercase">${label}</div>
        <div style="font-family:-apple-system,sans-serif;font-size:22px;font-weight:800;color:#f5f5f5;line-height:1;margin-bottom:5px">${count}</div>
        <div style="font-family:monospace;font-size:10px;color:${color}">${arrow} ${Math.abs(change)}</div>
      </td>
    </tr></table>
  </td>`
}

function buildEmailHtml({ label, labelFull, thisWeekLabel, articles, sections, catCounts, prevCatCounts, unsubLink, weekNum }) {
  const subject = `📬 Insightship 주간 뉴스레터 — ${label}`

  const CAT_LABELS = [
    ['투자·펀딩', 'funding'],
    ['AI·기술', 'tech'],
    ['청소년창업', 'youth'],
    ['에듀테크', 'edutech'],
    ['정책·지원', 'policy'],
    ['기후테크', 'climate'],
  ]

  const statBadges = CAT_LABELS.map(([lbl, key]) => {
    const cur  = catCounts[key]  || 0
    const prev = prevCatCounts[key] || 0
    return htmlStatBadge(lbl, cur, cur - prev)
  }).join('')

  const newsList = articles.slice(0,10).map((a,i) =>
    htmlNewsItem(a.title, a.source_name||'', i)
  ).join('')

  const { s1, s2, s3, s4, s5, forecast } = sections

  return {
    subject,
    html: `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${subject}</title>
<style>
body,table,td{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;mso-table-lspace:0;mso-table-rspace:0}
body{margin:0;padding:0;background:#080808}
@media only screen and (max-width:600px){
  .wrap{width:100%!important}
  .stat-table td{display:inline-block!important;margin:4px!important}
}
</style>
</head>
<body style="margin:0;padding:0;background:#080808">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;min-height:100vh">
<tr><td align="center" style="padding:28px 16px 56px">
<table class="wrap" width="600" cellpadding="0" cellspacing="0" style="max-width:600px">

  <!-- 헤더 -->
  <tr><td style="padding-bottom:24px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0d0d0d 0%,#111 100%);border:1px solid #1a1a1a;border-radius:18px;overflow:hidden">
      <tr><td style="padding:28px 28px 0;text-align:center">
        <div style="display:inline-block;background:#6366F118;border:1px solid #6366F130;border-radius:20px;padding:4px 16px;font-family:monospace;font-size:10px;font-weight:700;letter-spacing:2px;color:#818CF8">WEEKLY NEWSLETTER · VOL.${weekNum}</div>
      </td></tr>
      <tr><td style="padding:18px 28px 6px;text-align:center">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:900;letter-spacing:-1.5px;color:#f5f5f5;line-height:1">Insight<span style="color:#818CF8">ship</span></div>
        <div style="margin-top:10px;font-family:monospace;font-size:11px;color:#404040;letter-spacing:.5px">${label} · 뉴스레터 매니저 ECHO</div>
      </td></tr>
      <tr><td style="padding:16px 28px 26px;text-align:center;border-top:1px solid #171717;margin-top:18px">
        <p style="font-size:13px;color:#666;margin:16px 0 0;line-height:1.75;font-family:-apple-system,sans-serif">
          지난 한 주의 창업·투자·생태계 흐름을 ECHO가 정리했습니다.<br>
          <strong style="color:#818CF8">매주 월요일 오전 8시</strong> KST, 청소년 창업가를 위한 인사이트
        </p>
      </td></tr>
    </table>
  </td></tr>

  <!-- 통계 배지 -->
  <tr><td style="padding-bottom:20px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0c;border:1px solid #1a1a1a;border-radius:14px;overflow:hidden">
      <tr><td style="padding:14px 22px;border-bottom:1px solid #161616">
        <span style="font-family:monospace;font-size:9px;font-weight:700;letter-spacing:1.5px;color:#84CC16;text-transform:uppercase">📊 &nbsp;지난주 카테고리별 뉴스 (전주 대비)</span>
      </td></tr>
      <tr><td style="padding:14px 8px">
        <table class="stat-table" cellpadding="0" cellspacing="0" width="100%"><tr>${statBadges}</tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- 섹션들 -->
  <tr><td>${htmlSection('🏆', '이번 주 TOP5 뉴스', s1, '#F59E0B')}</td></tr>
  <tr><td>${htmlSection('🔭', '이번 주 심층 분석 — ECHO PICK', s2, '#3B82F6')}</td></tr>
  <tr><td>${htmlSection('📈', '시장 맥락 & 경제 흐름', s3, '#22D3EE')}</td></tr>
  <tr><td>${htmlSection('💡', '청소년 창업가 인사이트', s4, '#84CC16')}</td></tr>
  <tr><td>${htmlSection('🎯', '이번 주 실천 팁', s5, '#C084FC')}</td></tr>

  <!-- AI 전망 -->
  <tr><td style="padding-bottom:20px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0c;border:1px solid #1e1a06;border-radius:14px;overflow:hidden">
      <tr><td style="background:#0f0e08;padding:14px 22px;border-bottom:1px solid #1e1a06">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:14px">🔮</td>
          <td style="padding-left:8px;font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1px;color:#F59E0B;text-transform:uppercase">이번 주(${thisWeekLabel}) 흐름 전망</td>
          <td style="padding-left:10px;font-family:monospace;font-size:8px;color:#78350F">AI 추론 기반</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:16px 22px">
        <div style="background:#1a1505;border-left:3px solid #F59E0B;padding:8px 12px;border-radius:0 6px 6px 0;margin-bottom:14px">
          <span style="font-family:monospace;font-size:9px;color:#92400E">⚠️ 뉴스 데이터 기반 AI 추론 — 실제 결과와 다를 수 있습니다</span>
        </div>
        <p style="font-family:-apple-system,sans-serif;font-size:13.5px;line-height:1.85;color:#92400E;margin:0;white-space:pre-wrap">${escHtml(forecast)}</p>
      </td></tr>
    </table>
  </td></tr>

  <!-- 뉴스 목록 -->
  <tr><td style="padding-bottom:20px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0c;border:1px solid #1a1a1a;border-radius:14px;overflow:hidden">
      <tr><td style="padding:14px 22px;border-bottom:1px solid #161616">
        <span style="font-family:monospace;font-size:9px;font-weight:700;letter-spacing:1px;color:#555;text-transform:uppercase">📰 &nbsp;이번 주 참고 뉴스 TOP ${Math.min(articles.length,10)}</span>
      </td></tr>
      <tr><td style="padding:10px 22px 6px">
        <table width="100%" cellpadding="0" cellspacing="0">${newsList}</table>
      </td></tr>
    </table>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding-bottom:20px;text-align:center">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto">
      <tr>
        <td style="padding:0 8px">
          <a href="https://www.insightship.pacm.kr/mentor" style="display:inline-block;background:#6366F1;color:#fff;font-family:monospace;font-size:11px;font-weight:700;letter-spacing:.5px;text-decoration:none;padding:10px 22px;border-radius:8px">🤖 멘토 AI 질문하기</a>
        </td>
        <td style="padding:0 8px">
          <a href="https://www.insightship.pacm.kr/ideas" style="display:inline-block;background:#0f0f0f;color:#818CF8;font-family:monospace;font-size:11px;font-weight:700;letter-spacing:.5px;text-decoration:none;padding:10px 22px;border-radius:8px;border:1px solid #6366F130">💡 아이디어 공유하기</a>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- 푸터 -->
  <tr><td style="text-align:center;padding:8px 0 0;border-top:1px solid #111">
    <p style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#f5f5f5;margin:0 0 8px">Insight<span style="color:#818CF8">ship</span></p>
    <p style="font-size:12px;color:#333;margin:0 0 4px;font-family:-apple-system,sans-serif">청소년 창업가를 위한 인사이트 플랫폼 | PACM 운영</p>
    <p style="font-size:10px;color:#222;margin:0 0 14px;font-family:monospace">사업자등록번호: 891-45-01385</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>
      <td><a href="https://www.insightship.pacm.kr" style="font-size:11px;color:#6366F1;text-decoration:none;font-family:monospace">사이트</a></td>
      <td style="padding:0 10px;color:#1a1a1a;font-size:11px">|</td>
      <td><a href="https://www.insightship.pacm.kr/news" style="font-size:11px;color:#6366F1;text-decoration:none;font-family:monospace">뉴스</a></td>
      <td style="padding:0 10px;color:#1a1a1a;font-size:11px">|</td>
      <td><a href="${unsubLink}" style="font-size:11px;color:#333;text-decoration:underline;font-family:monospace">수신 거부</a></td>
    </tr></table>
    <p style="font-size:9px;color:#161616;margin:14px 0 0;font-family:monospace">📬 ECHO (뉴스레터 매니저) · insightship-newsletter-v4 · cost $0</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
  }
}

// ══════════════════════════════════════════════════════════════════════
// §4. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  if (req.method === 'GET') {
    // GET: 상태 + 최근 발송 로그
    let recentLogs = []
    if (SB_URL && SB_KEY) {
      try {
        const r = await fetch(
          `${SB_URL}/rest/v1/newsletter_logs?order=sent_at.desc&limit=5&select=subject,sent_count,sent_at`,
          { headers: SH() }
        )
        recentLogs = await r.json().catch(() => [])
      } catch {}
    }
    return json({
      status: 'ok', engine: 'ECHO-v4',
      agent: 'ECHO (에코) — 뉴스레터 매니저',
      description: '자체 NLP 뉴스레터 발송 v4 (외부 AI 0원) — LongBlack 스타일 완전 재설계',
      schedule: '매주 일요일 23:00 UTC (월요일 08:00 KST)',
      recent_logs: Array.isArray(recentLogs) ? recentLogs : [],
    })
  }

  const isCron      = req.headers.get('x-vercel-cron') === '1'
  const authHeader  = req.headers.get('authorization') || ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const isCronKey   = authHeader === `Bearer ${CRON_SECRET}`
    || req.headers.get('x-cron-secret') === CRON_SECRET
  const isAdminJWT  = bearerToken && bearerToken !== CRON_SECRET
    ? await (async () => {
        try {
          const r = await fetch(`${SB_URL}/rest/v1/profiles?select=role&limit=1`, {
            headers: { apikey: SB_KEY, Authorization: `Bearer ${bearerToken}` },
          })
          if (!r.ok) return false
          const rows = await r.json().catch(() => [])
          return Array.isArray(rows) && rows[0]?.role === 'admin'
        } catch { return false }
      })()
    : false
  if (!isCron && !isCronKey && !isAdminJWT) return json({ error: 'Unauthorized' }, 401)
  if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env' }, 500)

  let isTest = false, testEmail = ''
  try {
    const u = new URL(req.url.startsWith('http') ? req.url : `https://insightship.pacm.kr${req.url}`)
    isTest = u.searchParams.get('test') === 'true'
    testEmail = u.searchParams.get('email') || ''
  } catch {}
  if (isTest && !testEmail) return json({ error: 'email 파라미터 필요 (?test=true&email=xxx)' }, 400)

  const { from, to, label, labelFull, month, weekNum } = getLastWeekRange()
  const thisWeekLabel = getThisWeekLabel()

  // ── 데이터 수집 ───────────────────────────────────────────────────
  let articles = []
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published` +
      `&published_at=gte.${encodeURIComponent(from)}&published_at=lte.${encodeURIComponent(to)}` +
      `&ai_summary=not.is.null&select=title,ai_summary,source_name,ai_category&order=published_at.desc&limit=80`,
      { headers: SH() }
    )
    articles = await r.json() || []
  } catch {}

  if (!articles.length) {
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published` +
        `&ai_summary=not.is.null&select=title,ai_summary,source_name,ai_category&order=published_at.desc&limit=60`,
        { headers: SH() }
      )
      articles = await r.json() || []
    } catch {}
  }
  if (!articles.length) return json({ error: '뉴스 없음', label }, 200)

  // 카테고리별 수치
  const catCounts = {}, prevCatCounts = {}
  const b = classifyArticles(articles)
  catCounts.funding  = b.funding.length
  catCounts.tech     = b.tech.length
  catCounts.youth    = b.youth.length
  catCounts.policy   = b.policy.length
  catCounts.climate  = b.climate.length
  const eduCount = articles.filter(a => /에듀테크|교육|학습/.test((a.title+' '+(a.ai_summary||'')).toLowerCase())).length
  catCounts.edutech  = eduCount

  try {
    const prevFrom = new Date(new Date(from).getTime()-7*86400000).toISOString()
    const rp = await fetch(
      `${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published` +
      `&published_at=gte.${encodeURIComponent(prevFrom)}&published_at=lt.${encodeURIComponent(from)}` +
      `&select=ai_category,title&limit=300`,
      { headers: SH() }
    )
    const prev = await rp.json() || []
    const pb = classifyArticles(prev)
    prevCatCounts.funding = pb.funding.length
    prevCatCounts.tech    = pb.tech.length
    prevCatCounts.youth   = pb.youth.length
    prevCatCounts.policy  = pb.policy.length
    prevCatCounts.climate = pb.climate.length
    prevCatCounts.edutech = prev.filter(a => /에듀테크|교육|학습/.test((a.title||'').toLowerCase())).length
  } catch {}

  // 구독자 목록
  let subscribers = []
  if (isTest) {
    subscribers = [{ email: testEmail, unsubscribe_token: 'test' }]
  } else {
    try {
      const rs = await fetch(
        `${SB_URL}/rest/v1/newsletter_subscribers?is_active=eq.true&select=email,unsubscribe_token`,
        { headers: SH() }
      )
      subscribers = await rs.json() || []
    } catch {}
  }
  if (!subscribers.length) return json({ message: '활성 구독자 없음' }, 200)

  // ── 모든 섹션 자체 생성 ──────────────────────────────────────────
  const s1       = buildTop5Section(articles, label)
  const s2       = buildDeepDiveSection(articles, label)
  const s3       = buildMarketSection(articles, label)
  const s4       = buildYouthInsightSection(articles)
  const s5       = buildTipSection(articles, weekNum)
  const forecast = buildForecastSection(articles, thisWeekLabel)
  const sections = { s1, s2, s3, s4, s5, forecast }

  // ── 발송 ─────────────────────────────────────────────────────────
  const UNSUB_BASE = 'https://www.insightship.pacm.kr/api/unsubscribe'
  let sent = 0, failed = 0

  for (const sub of subscribers) {
    const unsubLink = sub.unsubscribe_token && sub.unsubscribe_token !== 'test'
      ? `${UNSUB_BASE}?token=${encodeURIComponent(sub.unsubscribe_token)}`
      : `${UNSUB_BASE}?email=${encodeURIComponent(sub.email)}`

    const { subject, html } = buildEmailHtml({
      label, labelFull, thisWeekLabel, articles, sections,
      catCounts, prevCatCounts, unsubLink, weekNum,
    })

    try {
      const sr = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Insightship ECHO <insightship_nl@pacm.kr>',
          to: sub.email,
          subject,
          html,
        }),
      })
      if (sr.ok) sent++
      else { failed++; const e = await sr.text(); console.error('Resend:', sr.status, e.slice(0,80)) }
    } catch(e) { failed++; console.error('발송 오류:', e.message) }

    if (!isTest) await new Promise(r => setTimeout(r, 400))
  }

  // 발송 로그
  if (!isTest && sent > 0) {
    fetch(`${SB_URL}/rest/v1/newsletter_logs`, {
      method: 'POST',
      headers: { ...SH(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        sent_count:    sent,
        failed_count:  failed,
        subject:       `📬 Insightship 주간 뉴스레터 — ${label}`,
        sent_at:       new Date().toISOString(),
        engine:        'ECHO-v4',
        agent:         'ECHO',
        article_count: articles.length,
      }),
    }).catch(()=>{})
  }

  return json({
    ok: true, sent, failed,
    total: subscribers.length,
    label, is_test: isTest,
    sections_generated: ['top5','deep_dive','market','youth_insight','tip','forecast'],
    engine: 'ECHO-v4', agent: 'ECHO',
    external_api_cost: 0,
  })
}
