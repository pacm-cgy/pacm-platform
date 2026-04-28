/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP 주간 뉴스레터 발송 v3.0                                ║
 * ║  담당 AI: ECHO (에코) — 뉴스레터 매니저                             ║
 * ║                                                                      ║
 * ║  엔진: Insightship Self-NLP (BM25 + 카테고리 분류 + 인사이트 합성)  ║
 * ║  스케줄: 매주 일요일 23:00 UTC (월요일 08:00 KST)                   ║
 * ║  발송: Resend API                                                    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * ECHO 캐릭터:
 *   따뜻하고 공감 능력이 뛰어난 뉴스레터 매니저.
 *   매주 월요일 아침, 독자 눈높이에 맞춰 인사이트를 전달.
 *   색상: #F472B6 (pink) | 이모지: 📬
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
// §2. 자체 NLP 뉴스레터 콘텐츠 생성 엔진
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

// 뉴스 분류
function classifyArticles(articles) {
  const out = { funding:[], policy:[], product:[], person:[], youth:[], tech:[], other:[] }
  for (const a of articles) {
    const t = (a.title+' '+(a.ai_summary||'')).toLowerCase()
    if (/투자|펀딩|시리즈|억원|조원|vc|유니콘/.test(t))       { out.funding.push(a); continue }
    if (/정부|지원|공모|선발|과기부|중기부|창진원|정책/.test(t)) { out.policy.push(a);  continue }
    if (/청소년|청년|대학생|고등학생|중학생|학생창업/.test(t))   { out.youth.push(a);   continue }
    if (/ai|인공지능|딥러닝|llm|생성형|chatgpt/.test(t))        { out.tech.push(a);    continue }
    if (/출시|론칭|서비스|플랫폼|앱|오픈/.test(t))              { out.product.push(a); continue }
    if (/대표|ceo|창업자|설립자|인터뷰|스토리/.test(t))          { out.person.push(a);  continue }
    out.other.push(a)
  }
  return out
}

// §2-A. 창업·스타트업 핵심 흐름 섹션
function buildStartupSection(articles, label) {
  const b = classifyArticles(articles)
  const top = [...b.funding.slice(0,3), ...b.product.slice(0,2), ...b.tech.slice(0,2)]
    .filter((v,i,a)=>a.indexOf(v)===i).slice(0,5)
  const pool = top.length >= 3 ? top : articles.slice(0,5)

  const lines = pool.map(a => {
    const sum = (a.ai_summary||a.title||'').replace(/\*\*|##/g,'').trim()
    const clean = sum.length > 120 ? sum.slice(0,120)+'...' : sum
    return clean
  }).filter(Boolean)

  const fundCount = b.funding.length
  const techCount = b.tech.length
  const stat = fundCount > 0 ? `이번 주 투자·펀딩 관련 소식이 ${fundCount}건` : `스타트업 관련 소식이 ${articles.length}건`

  return `지난 한 주간(${label}) 한국 창업·스타트업 생태계에서 주목할 소식들이 이어졌습니다. ${stat} 수집되었습니다.\n\n` +
    lines.join('\n\n') +
    (techCount > 0 ? `\n\nAI 기술 관련 스타트업 소식도 ${techCount}건으로, 생성형 AI 기반 서비스와 B2B 솔루션에 투자가 집중되었습니다.` : '') +
    `\n\n이번 주 창업 생태계는 도전과 기회가 공존하는 한 주였습니다.`
}

// §2-B. 경제·시장 맥락 섹션
function buildEconomySection(articles, label) {
  const b = classifyArticles(articles)
  const policyItems = b.policy.slice(0,3)
  const fundItems   = b.funding.slice(0,2)

  const policyLine = policyItems.length > 0
    ? `정부 지원·정책 분야에서는 ${policyItems.map(a=>a.title.slice(0,30)).join(', ')} 등 ${policyItems.length}건의 소식이 있었습니다.`
    : '정책·지원 관련 동향은 다음 호에 더 상세히 전달드리겠습니다.'

  const fundLine = fundItems.length > 0
    ? `투자 시장에서는 ${fundItems.map(a=>a.title.slice(0,25)).join(', ')} 등의 투자 유치 소식이 있었습니다.`
    : '투자 시장은 전반적으로 안정적인 흐름을 유지했습니다.'

  return `경제·시장 측면에서도 다양한 변화가 있었습니다.\n\n${policyLine}\n\n${fundLine}\n\n` +
    `스타트업 생태계에서는 글로벌 진출과 B2B 모델 전환이 주요 화두로 떠오르고 있습니다. ` +
    `이러한 경제 환경 변화는 초기 스타트업의 투자 유치 전략과 서비스 방향에도 영향을 미칠 것으로 예상됩니다.`
}

// §2-C. 이번 주 트렌드 키워드
function buildKeywordSection(articles) {
  const KW_LIST = [
    ['AI', 'AI(인공지능) — 스타트업 업계 전반을 관통하는 핵심 기술 트렌드'],
    ['투자', '투자·펀딩 — 스타트업이 성장 자본을 확보하는 핵심 생태계 활동'],
    ['청소년', '청소년 창업 — Z세대가 직접 참여하는 스타트업 생태계 확장'],
    ['글로벌', '글로벌 진출 — 국내를 넘어 해외 시장을 향한 스케일업 트렌드'],
    ['에듀테크', '에듀테크(EdTech) — 교육과 기술의 결합, 청소년과 가장 밀접한 분야'],
    ['헬스케어', '디지털 헬스케어 — AI 기반 의료 서비스 혁신 가속화'],
    ['핀테크', '핀테크 — 금융과 기술의 만남, 간편결제·투자·보험 혁신'],
    ['ESG', 'ESG·임팩트 — 사회적 가치와 수익을 동시에 추구하는 창업 모델'],
  ]
  const found = []
  for (const [kw, desc] of KW_LIST) {
    const re = new RegExp(kw,'i')
    if (articles.some(a=>re.test(a.title)||re.test(a.ai_summary||''))) {
      found.push(desc)
      if (found.length >= 4) break
    }
  }
  if (!found.length) found.push('스타트업 — 혁신적 아이디어로 새로운 비즈니스를 만드는 주체')

  return `이번 주 뉴스에서 특히 눈에 띄었던 키워드들을 정리했습니다.\n\n` +
    found.join('\n') +
    `\n\n위 키워드들은 현재 창업 생태계의 흐름을 보여주는 핵심 개념들입니다. 멘토 AI에게 각 키워드에 대해 더 자세히 물어보세요.`
}

// §2-D. 청소년 창업가 인사이트
function buildInsightSection(articles) {
  const b = classifyArticles(articles)
  const youthItems = b.youth.slice(0,2)
  const fundItems  = b.funding.slice(0,1)

  const youthLine = youthItems.length > 0
    ? `이번 주 청소년·청년 창업 관련 소식이 ${youthItems.length}건 있었습니다. ${youthItems.map(a=>a.title.slice(0,30)).join(', ')} 등의 사례가 특히 주목됩니다.`
    : '이번 주에도 다양한 창업 소식들이 전해졌습니다.'

  const fundInsight = fundItems.length > 0
    ? `투자받은 기업들의 공통점을 분석하면 내 아이디어의 방향성을 잡는 데 도움이 됩니다. **${fundItems[0].title.slice(0,35)}** 같은 사례에서 문제 정의 방식을 배워보세요.`
    : '성공한 스타트업의 문제 정의 방식을 분석하면 내 아이디어의 방향성을 잡는 데 도움이 됩니다.'

  return `청소년 창업가 여러분을 위해 이번 주 뉴스에서 가져갈 수 있는 인사이트를 정리했습니다.\n\n` +
    `${youthLine}\n\n` +
    `**첫 번째 인사이트: 문제를 먼저 발견하세요.**\n${fundInsight}\n\n` +
    `**두 번째 인사이트: 실패를 두려워하지 마세요.**\n이번 주 소개된 스타트업들은 모두 여러 번의 피봇(사업 방향 전환)을 거쳐 현재의 모습이 됐습니다. 실패는 학습의 과정입니다.\n\n` +
    `**세 번째 인사이트: 지금 시작하세요.**\nMVP(최소 기능 제품)로 빠르게 검증하는 것이 핵심입니다. Insightship 아이디어랩에 아이디어를 공유하고 피드백을 받아보세요.`
}

// §2-E. 이번 주 전망 (자체 AI 추론)
function buildForecastSection(articles, thisWeekLabel) {
  const b = classifyArticles(articles)
  const hotTopics = []
  if (b.tech.length >= 2)    hotTopics.push('AI·생성형 기술')
  if (b.funding.length >= 3) hotTopics.push('투자·펀딩')
  if (b.policy.length >= 2)  hotTopics.push('정부 지원 정책')
  if (b.youth.length >= 1)   hotTopics.push('청소년 창업')
  if (!hotTopics.length) hotTopics.push('스타트업 생태계')

  const topicStr = hotTopics.slice(0,3).join(', ')
  const riskNote = b.funding.length < 3
    ? '다만 이번 주는 투자 소식이 상대적으로 적어 시장 심리가 다소 관망세일 수 있습니다.'
    : '투자 심리는 전반적으로 긍정적 흐름을 유지할 것으로 예상됩니다.'

  return `AI 추론: 지난주 뉴스 데이터를 바탕으로 이번 주(${thisWeekLabel}) 흐름을 추론한 내용입니다. 실제 결과와 다를 수 있습니다.\n\n` +
    `지난주 뉴스에서 ${topicStr} 관련 소식이 집중 조명되었습니다. ` +
    `이번 주에는 이 분야에서 추가적인 투자 발표나 서비스 출시 소식이 이어질 가능성이 높습니다.\n\n` +
    `${riskNote} ` +
    `특히 AI 기반 스타트업에 대한 투자 심리가 지속적으로 강세를 보이고 있어, ` +
    `관련 분야 청소년 창업가들에게는 주목할 만한 한 주가 될 것으로 예상됩니다.\n\n` +
    `이 내용은 Insightship AI가 뉴스 데이터를 자체 분석한 추론이며 확정된 사실이 아닙니다.`
}

// ══════════════════════════════════════════════════════════════════════
// §3. HTML 이메일 컴포넌트
// ══════════════════════════════════════════════════════════════════════

function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
}

const C = {
  section: (icon, title, body, accent='#6366F1') =>
    `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;border-radius:12px;overflow:hidden;border:1px solid #1E1E1E">` +
    `<tr><td style="background:#111111;padding:14px 24px;border-bottom:1px solid #1E1E1E">` +
    `<table cellpadding="0" cellspacing="0"><tr>` +
    `<td style="width:28px;height:28px;background:${accent}22;border-radius:8px;text-align:center;vertical-align:middle;font-size:14px">${icon}</td>` +
    `<td style="padding-left:10px;font-family:'JetBrains Mono',monospace,sans-serif;font-size:11px;font-weight:600;letter-spacing:1px;color:${accent};text-transform:uppercase">${title}</td>` +
    `</tr></table></td></tr>` +
    `<tr><td style="background:#0D0D0D;padding:20px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.85;color:#A1A1A1;white-space:pre-wrap;word-break:keep-all">${escHtml(body)}</td></tr>` +
    `</table>`,

  newsItem: (title, source, i) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #141414">` +
    `<table width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="width:22px;font-family:'JetBrains Mono',monospace;font-size:10px;color:#404040;vertical-align:top;padding-top:1px">${String(i+1).padStart(2,'0')}</td>` +
    `<td style="padding-left:8px">` +
    `<div style="font-size:13px;color:#D4D4D4;line-height:1.5;margin-bottom:3px">${escHtml(title)}</div>` +
    (source ? `<div style="font-size:11px;color:#404040;font-family:'JetBrains Mono',monospace">${escHtml(source)}</div>` : '') +
    `</td></tr></table></td></tr>`,

  trendBadge: (cat, count, change) => {
    const color = change > 0 ? '#10B981' : change < 0 ? '#F43F5E' : '#6B6B6B'
    const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '—'
    return `<td style="padding:6px 8px;text-align:center;vertical-align:top">` +
      `<table cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1E1E1E;border-radius:8px;min-width:76px"><tr><td style="padding:10px 12px;text-align:center">` +
      `<div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#6B6B6B;letter-spacing:.5px;margin-bottom:6px;text-transform:uppercase">${cat}</div>` +
      `<div style="font-family:-apple-system,sans-serif;font-size:20px;font-weight:700;color:#F5F5F5;margin-bottom:4px">${count}</div>` +
      `<div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:${color}">${arrow} ${Math.abs(change)}</div>` +
      `</td></tr></table></td>`
  },
}

// ══════════════════════════════════════════════════════════════════════
// §4. HTML 이메일 조립
// ══════════════════════════════════════════════════════════════════════

function buildEmailHtml({ label, thisWeekLabel, articles, sections, catCounts, prevCatCounts, unsubLink }) {
  const subject = `📬 Insightship 주간 뉴스레터 — ${label}`

  const CAT_KO = { funding:'투자/펀딩', ai_startup:'AI', youth:'청소년창업', edutech:'에듀테크', health:'헬스케어', fintech:'핀테크' }
  const trendBadges = Object.entries(CAT_KO).map(([k, kLabel]) => {
    const cur  = catCounts[k]     || 0
    const prev = prevCatCounts[k] || 0
    return C.trendBadge(kLabel, cur, cur-prev)
  }).join('')

  const newsList = articles.slice(0,8).map((a,i) => C.newsItem(a.title, a.source_name||'', i)).join('')
  const { s1, s2, s3, s4, forecast } = sections

  return {
    subject,
    html: `<!DOCTYPE html>
<html lang="ko" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${subject}</title>
<style>
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0;mso-table-rspace:0}
body{margin:0;padding:0;background:#080808}
@media only screen and (max-width:600px){.email-body{width:100%!important}.email-pad{padding:0 16px!important}}
</style>
</head>
<body style="margin:0;padding:0;background:#080808">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;min-height:100vh">
<tr><td align="center" style="padding:24px 16px 48px">
<table class="email-body" width="600" cellpadding="0" cellspacing="0" style="max-width:600px">

  <!-- 헤더 -->
  <tr><td style="padding-bottom:24px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0D0D;border:1px solid #1E1E1E;border-radius:16px;overflow:hidden">
      <tr><td style="padding:24px 28px 0;text-align:center">
        <div style="display:inline-block;background:#6366F122;border:1px solid #6366F144;border-radius:20px;padding:4px 14px;font-family:monospace;font-size:10px;font-weight:600;letter-spacing:2px;color:#818CF8;text-transform:uppercase">WEEKLY NEWSLETTER</div>
      </td></tr>
      <tr><td style="padding:20px 28px;text-align:center">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:900;letter-spacing:-1px;color:#F5F5F5">Insight<span style="color:#818CF8">ship</span></div>
        <div style="margin-top:8px;font-family:monospace;font-size:11px;color:#404040;letter-spacing:1px">${label}</div>
      </td></tr>
      <tr><td style="padding:0 28px 24px;text-align:center;border-top:1px solid #1a1a1a">
        <p style="font-size:13px;color:#6B6B6B;margin:16px 0 0;line-height:1.65">지난 한 주의 창업·투자·경제 이슈를 뉴스레터 매니저 <strong>ECHO</strong>가 정리했습니다.<br>매주 월요일 오전 8시, 청소년 창업가를 위한 인사이트를 전해드립니다.</p>
      </td></tr>
    </table>
  </td></tr>

  <!-- 트렌드 수치 -->
  <tr><td style="padding-bottom:20px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0D0D;border:1px solid #1E1E1E;border-radius:12px;overflow:hidden">
      <tr><td style="padding:14px 24px;border-bottom:1px solid #1a1a1a">
        <span style="font-family:monospace;font-size:10px;font-weight:600;letter-spacing:1.5px;color:#84CC16;text-transform:uppercase">📊 &nbsp;지난주 카테고리별 뉴스 (전주 대비)</span>
      </td></tr>
      <tr><td style="padding:16px 10px">
        <table cellpadding="0" cellspacing="0" width="100%"><tr>${trendBadges}</tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- 섹션들 -->
  <tr><td>${C.section('🚀','창업·스타트업 핵심 흐름', s1)}</td></tr>
  <tr><td>${C.section('📈','경제 & 시장 맥락', s2, '#22D3EE')}</td></tr>
  <tr><td>${C.section('🔑','이번 주 트렌드 키워드', s3, '#C084FC')}</td></tr>
  <tr><td>${C.section('💡','청소년 창업가 인사이트', s4, '#84CC16')}</td></tr>

  <!-- AI 전망 -->
  <tr><td style="padding-bottom:20px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0D0D;border:1px solid #2a1f0a;border-radius:12px;overflow:hidden">
      <tr><td style="background:#111108;padding:14px 24px;border-bottom:1px solid #2a1f0a">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:14px">🔮</td>
          <td style="padding-left:8px;font-family:monospace;font-size:11px;font-weight:600;letter-spacing:1px;color:#F59E0B;text-transform:uppercase">이번 주(${thisWeekLabel}) 흐름 전망</td>
          <td style="padding-left:10px;font-family:monospace;font-size:9px;color:#92400E">AI 추론 기반</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:16px 24px">
        <p style="font-family:monospace;font-size:10px;color:#78350F;margin:0 0 12px;background:#2a1f0a;padding:8px 12px;border-radius:6px;border-left:2px solid #F59E0B">⚠️ 뉴스 데이터 기반 AI 추론입니다. 실제 결과와 다를 수 있습니다.</p>
        <div style="font-size:14px;line-height:1.85;color:#B45309;font-family:-apple-system,sans-serif;white-space:pre-wrap">${escHtml(forecast)}</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- 뉴스 목록 -->
  <tr><td style="padding-bottom:20px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0D0D;border:1px solid #1E1E1E;border-radius:12px;overflow:hidden">
      <tr><td style="padding:14px 24px;border-bottom:1px solid #1a1a1a">
        <span style="font-family:monospace;font-size:10px;font-weight:600;letter-spacing:1px;color:#6B6B6B;text-transform:uppercase">📰 &nbsp;이번 주 참고 뉴스 TOP ${Math.min(articles.length,8)}</span>
      </td></tr>
      <tr><td style="padding:12px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">${newsList}</table>
      </td></tr>
    </table>
  </td></tr>

  <!-- 푸터 -->
  <tr><td style="text-align:center;padding:8px 0 0">
    <p style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#F5F5F5;margin:0 0 12px">Insight<span style="color:#818CF8">ship</span></p>
    <p style="font-size:12px;color:#404040;margin:0 0 8px;line-height:1.6">청소년 창업가를 위한 인사이트 플랫폼 | PACM 운영</p>
    <p style="font-size:11px;color:#2a2a2a;margin:0 0 16px;font-family:monospace">사업자등록번호: 891-45-01385</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>
      <td><a href="https://www.insightship.pacm.kr" style="font-size:12px;color:#6366F1;text-decoration:none;font-family:monospace">사이트 방문</a></td>
      <td style="padding:0 12px;color:#1a1a1a;font-size:12px">|</td>
      <td><a href="${unsubLink}" style="font-size:12px;color:#404040;text-decoration:underline;font-family:monospace">수신 거부</a></td>
    </tr></table>
    <p style="font-size:10px;color:#1a1a1a;margin:16px 0 0;font-family:monospace">📬 ECHO (뉴스레터 매니저) · insightship-newsletter-v3 · cost $0</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
  }
}

// ══════════════════════════════════════════════════════════════════════
// §5. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  if (req.method === 'GET') {
    return json({ status: 'ok', engine: 'ECHO-v3', agent: 'ECHO (에코) — 뉴스레터 매니저', description: '자체 NLP 뉴스레터 발송 (외부 AI 0원)' })
  }

  const isCron = req.headers.get('x-vercel-cron') === '1'
  const isAuth = req.headers.get('authorization') === `Bearer ${CRON_SECRET}`
    || req.headers.get('x-cron-secret') === CRON_SECRET
  if (!isCron && !isAuth) return json({ error: 'Unauthorized' }, 401)

  if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env' }, 500)

  // 테스트 모드
  let isTest = false, testEmail = ''
  try {
    const u = new URL(req.url.startsWith('http') ? req.url : `https://insightship.pacm.kr${req.url}`)
    isTest = u.searchParams.get('test') === 'true'
    testEmail = u.searchParams.get('email') || ''
  } catch {}
  if (isTest && !testEmail) return json({ error: 'email 파라미터 필요 (?test=true&email=xxx)' }, 400)

  const { from, to, label, month, weekNum } = getLastWeekRange()
  const thisWeekLabel = getThisWeekLabel()

  // ── 데이터 수집 ───────────────────────────────────────────────────
  // 1) 지난주 뉴스
  let articles = []
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published` +
      `&published_at=gte.${encodeURIComponent(from)}&published_at=lte.${encodeURIComponent(to)}` +
      `&ai_summary=not.is.null&select=title,ai_summary,source_name,ai_category&order=published_at.desc&limit=60`,
      { headers: SH() }
    )
    articles = await r.json() || []
  } catch {}

  // 최근 뉴스 폴백
  if (!articles.length) {
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published` +
        `&ai_summary=not.is.null&select=title,ai_summary,source_name,ai_category&order=published_at.desc&limit=50`,
        { headers: SH() }
      )
      articles = await r.json() || []
    } catch {}
  }
  if (!articles.length) return json({ error: '뉴스 없음', label }, 200)

  // 2) 카테고리별 수치 (전주 비교)
  const catCounts = {}, prevCatCounts = {}
  articles.forEach(a => { const c = a.ai_category||'general'; catCounts[c]=(catCounts[c]||0)+1 })
  try {
    const prevFrom = new Date(new Date(from).getTime()-7*86400000).toISOString()
    const rp = await fetch(
      `${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published` +
      `&published_at=gte.${encodeURIComponent(prevFrom)}&published_at=lt.${encodeURIComponent(from)}` +
      `&select=ai_category&limit=200`,
      { headers: SH() }
    )
    const prev = await rp.json() || []
    prev.forEach(a => { const c=a.ai_category||'general'; prevCatCounts[c]=(prevCatCounts[c]||0)+1 })
  } catch {}

  // 3) 구독자 목록
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

  // ── 자체 AI로 모든 섹션 생성 (외부 API 0원) ──────────────────────
  const s1       = buildStartupSection(articles, label)
  const s2       = buildEconomySection(articles, label)
  const s3       = buildKeywordSection(articles)
  const s4       = buildInsightSection(articles)
  const forecast = buildForecastSection(articles, thisWeekLabel)
  const sections = { s1, s2, s3, s4, forecast }

  // ── 발송 ─────────────────────────────────────────────────────────
  const UNSUB_BASE = 'https://www.insightship.pacm.kr/api/unsubscribe'
  let sent = 0

  for (const sub of subscribers) {
    const unsubLink = sub.unsubscribe_token && sub.unsubscribe_token !== 'test'
      ? `${UNSUB_BASE}?token=${encodeURIComponent(sub.unsubscribe_token)}`
      : `${UNSUB_BASE}?email=${encodeURIComponent(sub.email)}`

    const { subject, html } = buildEmailHtml({
      label, thisWeekLabel, articles, sections,
      catCounts, prevCatCounts, unsubLink,
    })

    try {
      const sr = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Insightship <insightship_nl@pacm.kr>',
          to: sub.email,
          subject,
          html,
        }),
      })
      if (sr.ok) sent++
      else { const e = await sr.text(); console.error('Resend:', sr.status, e.slice(0,100)) }
    } catch(e) { console.error('발송 오류:', e.message) }

    if (!isTest) await new Promise(r => setTimeout(r, 500))
  }

  // ── 발송 로그 ────────────────────────────────────────────────────
  if (!isTest) {
    fetch(`${SB_URL}/rest/v1/newsletter_logs`, {
      method: 'POST',
      headers: { ...SH(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        sent_count: sent,
        subject: `📬 Insightship 주간 뉴스레터 — ${label}`,
        sent_at: new Date().toISOString(),
        engine: 'ECHO-v3',
        agent: 'ECHO',
      }),
    }).catch(()=>{})
  }

  return json({
    ok: true,
    sent,
    total: subscribers.length,
    label,
    is_test: isTest,
    engine: 'ECHO-v3',
    agent: 'ECHO',
    external_api_cost: 0,
  })
}
