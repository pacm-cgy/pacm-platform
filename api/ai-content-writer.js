/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP AI CONTENT WRITER v2.0                                 ║
 * ║  담당 AI: NOVA (노바) — 콘텐츠 편집 매니저                               ║
 * ║                                                                      ║
 * ║  담당 업무:                                                          ║
 * ║  A. 인사이트 아티클 자동 작성 (뉴스 → 인사이트 글 변환)            ║
 * ║  B. 트렌드 기반 스토리 글 자동 생성                                 ║
 * ║  C. 창업 가이드 글 자동 발행 (주 1회)                               ║
 * ║  D. 매거진 편집장 칼럼 자동 작성 (월 1회)                          ║
 * ║                                                                      ║
 * ║  스케줄: 매일 10:00 KST (UTC 01:00)                                 ║
 * ║  외부 API 비용: $0 (완전 자체 NLP 엔진)                             ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * NOVA 캐릭터:
 *   분석적이고 통찰력 있으며 창의적인 AI 편집장.
 *   데이터 기반 글쓰기로 청소년 창업가에게 실질적 인사이트를 전달.
 *   색상: #C084FC (purple) | 이모지: ✍️
 */
export const config = { runtime: 'edge', maxDuration: 60 }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const H = () => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

// ══════════════════════════════════════════════════════════════════════
// §1. NLP 코어 (summarize-news v6 동급)
// ══════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
  '하지만','그러나','또한','그리고','따라서','때문에','위해','통해',
  '대한','관련','따른','있는','없는','되는','하는','있다','없다',
  '된다','한다','이다','있으며','되며','하며','이번','지난','올해',
  '작년','이달','오늘','어제','최근','현재','지금','특히','또','더',
  '가장','매우','모두','함께','이미','아직','약','총','전','후',
  '각','제','본','해당','기자','특파원','뉴스','보도','발표',
  '밝혔다','말했다','전했다','설명했다','밝혀졌다','알려졌다',
])

function tokenize(text) {
  if (!text) return []
  return (text.replace(/[^\uAC00-\uD7A3A-Za-z0-9\s]/g,' ').toLowerCase()
    .match(/[가-힣]{2,}|[a-z]{3,}|[0-9]+/g)||[])
    .filter(t => !STOPWORDS.has(t) && t.length >= 2)
}

const K1=1.5, BP=0.75
function bm25(qToks, dToks, avgLen, N, df) {
  const len=dToks.length; const tf={}
  for (const t of dToks) tf[t]=(tf[t]||0)+1
  let score=0
  for (const q of qToks) {
    if (!tf[q]) continue
    const idf=Math.log((N-(df[q]||0)+0.5)/((df[q]||0)+0.5)+1)
    score += idf*(tf[q]*(K1+1))/(tf[q]+K1*(1-BP+BP*len/avgLen))
  }
  return score
}

function rankByQuery(items, gettext, query, topN=5) {
  if (!items.length) return []
  const qToks = tokenize(query)
  const docs = items.map(it => ({ it, toks: tokenize(gettext(it)) }))
  const avgLen = docs.reduce((s,d)=>s+d.toks.length,0)/docs.length || 10
  const df={}; for (const d of docs) for (const t of new Set(d.toks)) df[t]=(df[t]||0)+1
  return docs
    .map(d => ({ it: d.it, score: bm25(qToks, d.toks, avgLen, docs.length, df) }))
    .sort((a,b)=>b.score-a.score)
    .slice(0, topN)
    .map(d => d.it)
}

// ══════════════════════════════════════════════════════════════════════
// §2. 유틸
// ══════════════════════════════════════════════════════════════════════

function kstNow()  { return new Date(Date.now()+9*3600000) }
function todayKST() {
  const k=kstNow()
  return `${k.getFullYear()}-${String(k.getMonth()+1).padStart(2,'0')}-${String(k.getDate()).padStart(2,'0')}`
}
function weekOfYear() {
  const n=kstNow(); const s=new Date(n.getFullYear(),0,1)
  return Math.ceil(((n-s)/86400000+s.getDay()+1)/7)
}
function slugify(str, suffix='') {
  return str.replace(/[^\w가-힣\s]/g,'').replace(/\s+/g,'-').slice(0,40).toLowerCase()
    + (suffix ? '-'+suffix : '')
    + '-' + Date.now().toString(36)
}
function kstDateStr() {
  const k=kstNow()
  return `${k.getFullYear()}년 ${k.getMonth()+1}월 ${k.getDate()}일`
}

// NOVA 전용 계정 조회 (없으면 admin fallback)
async function getNovaId() {
  try {
    const r1 = await fetch(`${SB_URL}/rest/v1/profiles?username=eq.ai_nova&limit=1&select=id`, {headers:H()})
    const d1 = await r1.json()
    if (d1?.[0]?.id) return d1[0].id
    const r2 = await fetch(`${SB_URL}/rest/v1/profiles?role=eq.admin&limit=1&select=id`, {headers:H()})
    return (await r2.json())?.[0]?.id || null
  } catch { return null }
}

async function alreadyPublishedSlug(slug) {
  try {
    const r=await fetch(`${SB_URL}/rest/v1/articles?slug=eq.${slug}&select=id&limit=1`,{headers:H()})
    const d=await r.json()
    return Array.isArray(d)&&d.length>0
  } catch { return false }
}

async function publishArticle(adminId, payload) {
  if (!adminId) return { error: 'no_admin' }
  const check = await alreadyPublishedSlug(payload.slug)
  if (check) return { skipped: true, slug: payload.slug }
  try {
    const r=await fetch(`${SB_URL}/rest/v1/articles`,{
      method:'POST',
      headers:{...H(),Prefer:'return=representation'},
      body:JSON.stringify({...payload, author_id:adminId, created_at:new Date().toISOString()}),
    })
    if (r.status===201) { const d=await r.json(); return {ok:true,id:d?.[0]?.id} }
    const e=await r.text(); return {error:`${r.status}:${e.slice(0,80)}`}
  } catch(e) { return {error:e.message} }
}

async function logOperation(taskType, result, details='') {
  try {
    await fetch(`${SB_URL}/rest/v1/ai_operations_log`,{
      method:'POST', headers:{...H(),Prefer:'return=minimal'},
      body:JSON.stringify({task_type:taskType,run_date:todayKST(),result,
        details:details.slice(0,500),engine:'NOVA-v2',created_at:new Date().toISOString()}),
    })
  } catch {}
}

// ══════════════════════════════════════════════════════════════════════
// §3. 인사이트 아티클 자동 생성
// ══════════════════════════════════════════════════════════════════════

// 뉴스 분류
function classifyDomain(title, summary='') {
  const t=(title+' '+summary).toLowerCase()
  if (/ai|인공지능|딥러닝|llm|생성형/.test(t)) return 'ai'
  if (/투자|펀딩|시리즈|억원|vc|엔젤/.test(t)) return 'investment'
  if (/청소년|청년|대학생|학생창업/.test(t))   return 'youth'
  if (/정부|지원|공모|창진원|중기부/.test(t))   return 'policy'
  if (/에듀테크|교육플랫폼|학습/.test(t))       return 'edutech'
  if (/헬스케어|바이오|의료/.test(t))           return 'health'
  if (/핀테크|금융|결제/.test(t))               return 'fintech'
  return 'startup'
}

const DOMAIN_INFO = {
  ai:         { ko: 'AI·기술',     cat: 'insight', tag: 'AI창업', color: '#3B82F6' },
  investment: { ko: '투자·금융',   cat: 'trend',   tag: '투자분석', color: '#10B981' },
  youth:      { ko: '청소년·창업', cat: 'insight', tag: '청소년창업', color: '#8B5CF6' },
  policy:     { ko: '정책·지원',   cat: 'insight', tag: '정부지원', color: '#F59E0B' },
  edutech:    { ko: '에듀테크',    cat: 'insight', tag: '에듀테크', color: '#EC4899' },
  health:     { ko: '헬스케어',    cat: 'trend',   tag: '헬스케어', color: '#06B6D4' },
  fintech:    { ko: '핀테크',      cat: 'trend',   tag: '핀테크', color: '#F97316' },
  startup:    { ko: '창업·비즈니스', cat: 'insight', tag: '창업가이드', color: '#6366F1' },
}

// 여러 뉴스를 묶어 인사이트 아티클 생성
function buildInsightArticle(newsItems, domain) {
  const info   = DOMAIN_INFO[domain] || DOMAIN_INFO.startup
  const top    = newsItems.slice(0, 5)
  const kst    = kstDateStr()
  const week   = weekOfYear()

  // 핵심 수치 추출
  const numericNews = top.filter(n => /([0-9,]+억|[0-9]+%|[0-9]+배|[0-9,]+조|[0-9,]+만)/.test(n.title+' '+(n.ai_summary||'')))
  const hasNumbers = numericNews.length > 0

  // 인사이트 핵심 메시지 선택
  const INSIGHT_MSGS = {
    ai:         '생성형 AI 기술이 창업 장벽을 낮추고 있습니다. 코딩 없이도 AI 서비스를 만들 수 있는 지금, 아이디어와 실행력이 경쟁력입니다.',
    investment: '투자받은 기업들의 공통점은 "명확한 문제 정의"입니다. 어떤 문제를 얼마나 잘 설명하느냐가 투자 유치의 핵심입니다.',
    youth:      '나이는 장애물이 아닙니다. 오히려 청소년은 Z세대 소비자를 가장 잘 이해하는 창업가가 될 수 있습니다.',
    policy:     '정부 지원 프로그램을 전략적으로 활용하면 초기 자금과 네트워크 문제를 동시에 해결할 수 있습니다.',
    edutech:    '교육 분야는 청소년 창업가가 가장 직접적으로 공감할 수 있는 시장입니다. 당신이 직접 겪은 불편함이 사업 아이디어가 됩니다.',
    health:     '디지털 헬스케어는 빠르게 성장하는 분야입니다. AI 기반 예방·관리 솔루션에서 기회를 찾아보세요.',
    fintech:    '핀테크는 규제 환경이 복잡하지만, 청소년 대상 금융 교육·저축·용돈 관리 앱 등 틈새 시장이 열려 있습니다.',
    startup:    '모든 성공한 스타트업에는 남들이 놓친 문제를 발견한 순간이 있었습니다. 오늘의 뉴스를 창업가의 시선으로 다시 읽어보세요.',
  }

  const lines = [
    `## ${info.ko} 분야 이번 주 핵심 동향`,
    '',
    `*✍️ **NOVA** — Insightship AI 편집장 | ${kst} | ${week}주차*`,
    '',
    `이번 주 **${info.ko}** 분야에서 주목할 소식 **${newsItems.length}건**이 수집되었습니다.`,
    '',
  ]

  // 핵심 뉴스 섹션
  lines.push('## 핵심 뉴스 분석', '')
  for (const [i, n] of top.entries()) {
    const summary = (n.ai_summary||n.title).replace(/\*\*/g,'').slice(0,180)
    lines.push(`**${i+1}. ${n.title}**`, '')
    lines.push(summary.trim())
    lines.push('')
  }

  // 수치 인텔리전스
  if (hasNumbers) {
    lines.push('## 주요 수치 & 데이터', '')
    for (const n of numericNews.slice(0,3)) {
      const nums = (n.title+' '+(n.ai_summary||'')).match(/[0-9,]+억원?|[0-9]+%|[0-9]+배/g) || []
      if (nums.length) lines.push(`→ **${n.title.slice(0,40)}**: ${nums.join(', ')}`)
    }
    lines.push('')
  }

  // 트렌드 시사점
  lines.push('## 창업가 시사점', '')
  lines.push(INSIGHT_MSGS[domain] || INSIGHT_MSGS.startup, '')

  // 액션 아이템
  lines.push('## 지금 바로 할 수 있는 것', '')
  lines.push(`1. Insightship **멘토 AI**에게 "${info.ko} 분야 창업 아이디어 어때?" 라고 물어보세요.`)
  lines.push(`2. **아이디어랩**에 ${info.ko} 관련 아이디어를 게시하고 피드백을 받아보세요.`)
  lines.push(`3. **트렌드** 탭에서 ${info.ko} 분야 성장 그래프를 확인해 보세요.`)
  lines.push('')
  lines.push('---')
  lines.push(`*✍️ **NOVA** (Insightship AI 편집장)이 ${newsItems.length}개 뉴스를 분석해 자동 작성했습니다. 비용 $0*`)

  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════
// §4. 창업 가이드 글 자동 생성 (주 1회, 월요일)
// ══════════════════════════════════════════════════════════════════════

const STARTUP_GUIDES = [
  {
    title: '처음 창업하는 청소년을 위한 7단계 로드맵',
    tags:  ['창업가이드', '입문', '로드맵'],
    body: `## 처음 창업하는 청소년을 위한 7단계 로드맵

*✍️ NOVA — Insightship AI 편집장 | 청소년 창업 입문 가이드*

창업, 어디서부터 시작해야 할까요? Insightship AI가 수천 건의 창업 사례를 분석해 7단계 로드맵을 정리했습니다.

---

## 1단계: 문제 발견 (1~2주)

창업은 "좋은 아이디어"에서 시작하지 않습니다. **"해결해야 할 문제"** 에서 시작합니다.

**방법**: 하루에 불편한 것 3가지씩 적기. 2주 후 42가지 중 가장 많은 사람이 공감할 것을 고릅니다.

---

## 2단계: 고객 정의 (1주)

"모든 사람"을 위한 제품은 없습니다. 가장 불편함을 느끼는 **구체적인 한 사람**을 그려보세요.

예) "15~18세, 학원을 3개 다니는 고등학교 2학년 김지수"

---

## 3단계: 문제 검증 (1~2주)

친구 10명에게 물어보세요. "이런 문제 느껴본 적 있어?"
10명 중 7명 이상이 "응"이라고 하면 계속 진행합니다.

---

## 4단계: MVP 설계 (2~4주)

MVP(최소 기능 제품)는 가장 핵심 기능 **하나만** 가진 제품입니다.
앱 없이 노션, 카카오채널, 인스타그램으로 먼저 테스트해 보세요.

---

## 5단계: 첫 고객 확보 (1~4주)

돈을 받고 파는 첫 순간이 진짜 창업의 시작입니다.
단 1명이라도 돈을 내면 "이 문제는 실재한다"는 증거가 됩니다.

---

## 6단계: 피드백 & 개선 (반복)

"왜 샀어?", "뭐가 불편해?" → 이 두 질문을 매주 고객에게 물어보세요.
대부분의 스타트업은 이 단계에서 방향을 조금씩 수정합니다. 이것이 **피봇**입니다.

---

## 7단계: 성장 전략 수립

첫 고객 10명 → 100명으로 늘리는 방법을 찾습니다.
입소문(바이럴), SNS 마케팅, 학교/커뮤니티 파트너십 등을 시도해 보세요.

---

**💡 Insightship 활용 팁**
- 각 단계에서 막히는 것이 있으면 **멘토 AI**에게 물어보세요
- **아이디어랩**에서 진행 상황을 공유하면 커뮤니티 피드백을 받을 수 있어요
- **트렌드** 탭으로 내 아이디어가 성장하는 시장인지 확인하세요

*✍️ NOVA (Insightship AI 편집장) 자동 발행 | 비용 $0*`,
  },
  {
    title: 'MVP란 무엇인가? 청소년 창업가를 위한 완벽 가이드',
    tags:  ['MVP', '창업가이드', '제품개발'],
    body: `## MVP란 무엇인가? 청소년 창업가를 위한 완벽 가이드

*✍️ NOVA — Insightship AI 편집장 | 제품 개발 가이드*

MVP(Minimum Viable Product, 최소 기능 제품). 창업 세계에서 가장 중요한 개념 중 하나입니다.

---

## MVP가 필요한 이유

완벽한 제품을 만드는 데 1년을 써도 아무도 안 쓰면 의미가 없습니다.
**빠르게 만들고, 빠르게 검증하고, 빠르게 배우는 것**이 스타트업의 핵심입니다.

실제로 에어비앤비의 첫 MVP는 창업자 집에 에어매트리스를 놓고 낯선 사람을 재운 것이었습니다.

---

## 청소년이 할 수 있는 MVP 5가지

**1. 노션 페이지 MVP**
서비스 설명 + 신청 폼만 만들어 SNS에 공유해 보세요.
반응이 있으면 진짜 제품을 만드는 것입니다.

**2. 카카오채널 MVP**
고객과 1:1 대화로 수동으로 서비스를 제공하면서 니즈를 파악합니다.

**3. 구글폼 MVP**
설문지 + 결과 공유로 "정보 제공형" 서비스를 테스트합니다.

**4. 인스타그램/틱톡 MVP**
콘텐츠만으로 반응을 테스트합니다. 팔로워가 모이면 서비스화합니다.

**5. 직접 서비스 MVP**
코딩 없이 사람이 직접 하는 것입니다. 수요가 검증되면 자동화합니다.

---

## MVP 성공의 3가지 기준

1. **사람들이 쓰는가?** (10명 이상 사용)
2. **돈을 내는가?** (1명이라도 지불)
3. **다시 오는가?** (재방문율)

---

## 멘토 AI 추천 질문

"내 아이디어 [○○]의 MVP를 어떻게 만들면 좋을까?"

*✍️ NOVA (Insightship AI 편집장) 자동 발행 | 비용 $0*`,
  },
  {
    title: '린 캔버스 9블록 완전 정복 — 청소년 창업가 버전',
    tags:  ['린캔버스', '비즈니스모델', '창업가이드'],
    body: `## 린 캔버스 9블록 완전 정복 — 청소년 창업가 버전

*✍️ NOVA — Insightship AI 편집장 | 비즈니스 모델 가이드*

린 캔버스(Lean Canvas)는 사업 아이디어를 한 장에 정리하는 도구입니다. 투자자들이 가장 먼저 보는 문서이기도 합니다.

---

## 9블록 설명

**1. 문제 (Problem)**
고객이 겪는 상위 3가지 문제. 구체적일수록 좋습니다.
예) "학원 끝나고 혼자 공부할 때 집중이 안 된다"

**2. 고객 세그먼트 (Customer Segments)**
누구를 위한 서비스인가? 가장 얼리어답터를 먼저 정의하세요.
예) "자기주도학습을 원하는 고1~2 학생"

**3. 고유 가치 제안 (Unique Value Proposition)**
한 문장으로: "우리는 [고객]이 [문제]를 [방법]으로 해결하도록 돕는다"

**4. 해결책 (Solution)**
문제 각각에 대한 가장 간단한 해결책 3가지.

**5. 채널 (Channels)**
고객에게 어떻게 도달할 것인가? (SNS, 학교, 학원 등)

**6. 수익 모델 (Revenue Streams)**
어떻게 돈을 버나? (구독료, 광고, 수수료 등)

**7. 비용 구조 (Cost Structure)**
가장 큰 비용은 무엇인가?

**8. 핵심 지표 (Key Metrics)**
성공을 어떻게 측정할 것인가?

**9. 경쟁 우위 (Unfair Advantage)**
경쟁자가 쉽게 따라 할 수 없는 것은?

---

## Insightship 멘토로 린 캔버스 작성하기

멘토 AI에게 "린 캔버스 작성 도와줘"라고 말하면 9블록 모두 단계별로 안내해 드립니다.

*✍️ NOVA (Insightship AI 편집장) 자동 발행 | 비용 $0*`,
  },
  {
    title: '청소년이 받을 수 있는 창업 지원 프로그램 총정리',
    tags:  ['정부지원', '창업지원', '청소년창업'],
    body: `## 청소년이 받을 수 있는 창업 지원 프로그램 총정리

*✍️ NOVA — Insightship AI 편집장 | 정부지원 가이드*

창업 자금이 없어서 못 한다고요? 청소년에게 특화된 지원 프로그램이 생각보다 많습니다!

---

## 대표 지원 프로그램

**🏆 비즈쿨 (Bizcool)**
- 대상: 초·중·고등학생
- 내용: 창업 교육 + 창업동아리 활동비 지원
- 신청: 학교 담당 선생님 통해 신청

**🚀 청소년 창업경진대회**
- 주관: 중소벤처기업부, 창업진흥원
- 상금: 수백만 원 ~ 수천만 원
- 경험: 투자자 앞 발표 기회

**💡 예비창업패키지**
- 대상: 만 19세 이상 (대학생 포함)
- 지원금: 최대 1억 원
- 포함: 창업 교육 + 멘토링 + 사무공간

**🎓 대학 창업지원단**
- 대학별 창업 지원 프로그램
- 학점 + 창업 병행 가능한 학교 증가 중

---

## 지원받는 요령

1. **공모전 먼저**: 돈보다 경험과 네트워크가 더 중요
2. **팀 구성**: 혼자보다 2~3인 팀이 선발 가능성 높음
3. **문제 명확히**: "어떤 문제를 해결하는가" 한 문장으로 정리
4. **숫자로 증명**: 설문 결과, 테스트 참여자 수 등 데이터 제시

멘토 AI에게 "지금 신청할 수 있는 정부 지원 프로그램 알려줘"라고 물어보면 최신 정보를 확인할 수 있어요.

*✍️ NOVA (Insightship AI 편집장) 자동 발행 | 비용 $0*`,
  },
]

// ══════════════════════════════════════════════════════════════════════
// §5. 매거진 편집장 칼럼 (월 1회)
// ══════════════════════════════════════════════════════════════════════

function buildEditorColumn(stats) {
  const kst   = kstNow()
  const month = kst.getMonth()+1
  const year  = kst.getFullYear()
  const hot   = stats.hotKeywords.slice(0,3).join(', ') || 'AI, 투자, 청소년창업'

  return {
    title: `[편집장 칼럼] ${year}년 ${month}월, 창업 생태계가 보내는 신호`,
    slug:  `editor-column-${year}-${String(month).padStart(2,'0')}`,
    tags:  ['편집장칼럼', '매거진', '트렌드분석'],
    category: 'magazine',
    body: `## [편집장 칼럼] ${year}년 ${month}월, 창업 생태계가 보내는 신호

*Insightship AI 편집장 | ${year}년 ${month}월호*

---

안녕하세요. Insightship AI 편집장 **NOVA**입니다.

${year}년 ${month}월, 스타트업 생태계가 흥미로운 신호를 보내고 있습니다. 이번 달 Insightship이 수집한 뉴스와 데이터를 바탕으로 지금 이 순간 창업 생태계의 온도를 전달합니다.

---

## 이번 달 핵심 키워드

이번 달 가장 뜨거웠던 키워드는 **${hot}** 입니다.

이 키워드들이 동시에 주목받고 있다는 것은 무엇을 의미할까요? 기술과 자본이 만나는 교차점에서 새로운 기회가 만들어지고 있다는 신호입니다.

---

## 청소년 창업가에게 보내는 메시지

여러분은 지금 역사상 가장 좋은 창업 환경에 있습니다.

스마트폰 하나로 글로벌 고객에게 닿을 수 있고, AI 도구로 개발자 없이 제품을 만들 수 있으며, 정부와 민간 투자가 청소년 창업을 적극 지원하고 있습니다.

"나는 아직 어리다"는 생각은 잠시 내려놓아도 됩니다. **나이는 경쟁 우위**가 될 수 있습니다. Z세대 소비자를 가장 잘 이해하는 사람은 Z세대 창업가입니다.

---

## 이번 달 Insightship 플랫폼 현황

- 이번 달 수집 뉴스: **${stats.weeklyNews.length}건** (지속 업데이트 중)
- 커뮤니티 활동: **${stats.weeklyPosts.length}건**
- 공유된 아이디어: **${stats.weeklyIdeas}건**

모든 데이터는 AI가 자동 수집·분석하며, 외부 LLM API 비용 **$0**으로 운영됩니다.

---

## 다음 달 예고

다음 달에도 Insightship AI는 더 정밀한 분석과 더 풍부한 인사이트로 찾아옵니다. 여러분의 창업 여정에 작은 나침반이 되고 싶습니다.

*— ✍️ NOVA (Insightship AI 편집장)*

---
*본 칼럼은 AI가 플랫폼 운영 데이터를 분석해 자동 작성했습니다. 비용 $0*`,
  }
}

// ══════════════════════════════════════════════════════════════════════
// §6. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      status: 'ok', engine: 'NOVA-v2',
      agent: 'NOVA (노바) — Insightship AI 편집장',
      description: 'AI 자동 콘텐츠 작성 — Insight/Story/Guide/Magazine (외부 API 0원)',
      schedule: '매일 01:00 UTC (10:00 KST)',
    }), { status:200, headers:{'Content-Type':'application/json'} })
  }

  const isAuthed = req.headers.get('x-vercel-cron')==='1'
    || req.headers.get('authorization')===`Bearer ${CRON_SECRET}`
    || req.headers.get('x-cron-secret')===CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({error:'Unauthorized'}),{status:401})
  if (!SB_URL||!SB_KEY) return new Response(JSON.stringify({error:'Missing env'}),{status:500})

  const dow     = kstNow().getDay()
  const date    = kstNow().getDate()
  const week    = weekOfYear()
  const adminId = await getNovaId()

  const results = { engine:'NOVA-v2', agent:'NOVA', date:todayKST(), tasks:{}, external_api_cost:0 }

  // 플랫폼 통계
  let stats = { weeklyNews:[], weeklyPosts:[], weeklyIdeas:0, hotKeywords:[] }
  try {
    const weekAgo = new Date(Date.now()-7*86400000).toISOString()
    const [nR,pR,iR,kR] = await Promise.allSettled([
      fetch(`${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published&published_at=gte.${weekAgo}&select=id,title,ai_summary,ai_category&order=published_at.desc&limit=60`,{headers:H()}).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/community_posts?is_deleted=eq.false&created_at=gte.${weekAgo}&select=id,like_count&limit=50`,{headers:H()}).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/ideas?is_deleted=eq.false&is_public=eq.true&created_at=gte.${weekAgo}&select=id&limit=50`,{headers:H()}).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/trend_keywords?order=count.desc&limit=8&select=keyword`,{headers:H()}).then(r=>r.json()),
    ])
    stats.weeklyNews  = nR.status==='fulfilled' ? (nR.value||[]) : []
    stats.weeklyPosts = pR.status==='fulfilled' ? (pR.value||[]) : []
    stats.weeklyIdeas = iR.status==='fulfilled' ? (iR.value||[]).length : 0
    stats.hotKeywords = kR.status==='fulfilled' ? (kR.value||[]).map(k=>k.keyword) : []
  } catch {}

  // ── 태스크 A: 인사이트 아티클 (매일, 도메인별 로테이션) ──────────
  {
    const DOMAINS_ORDER = ['ai','investment','youth','policy','edutech','health','fintech','startup']
    const domainIdx = week % DOMAINS_ORDER.length
    const targetDomain = DOMAINS_ORDER[domainIdx]
    const domainInfo = DOMAIN_INFO[targetDomain]

    // 해당 도메인 뉴스 선택
    const domainNews = stats.weeklyNews.filter(n => classifyDomain(n.title,n.ai_summary||'')===targetDomain)
    const newsPool   = domainNews.length >= 3 ? domainNews : stats.weeklyNews

    if (newsPool.length >= 2) {
      const selected = rankByQuery(newsPool, n=>n.title+' '+(n.ai_summary||''), targetDomain, 6)
      const body  = buildInsightArticle(selected, targetDomain)
      const kst   = kstNow()
      const slug  = `insight-${targetDomain}-${kst.getFullYear()}-w${String(week).padStart(2,'0')}`
      const title = `[AI 인사이트] ${domainInfo.ko} 분야 이번 주 핵심 동향 분석`

      const r = await publishArticle(adminId, {
        title, slug, body,
        excerpt: `이번 주 ${domainInfo.ko} 분야 핵심 뉴스 ${selected.length}건을 AI가 분석했습니다.`,
        category: domainInfo.cat,
        status: 'published',
        tags: ['AI인사이트', domainInfo.tag, '주간분석'],
        ai_summary: `${domainInfo.ko} 분야 ${selected.length}건 뉴스 분석. 핵심 트렌드와 창업가 시사점 포함.`,
        read_time: Math.max(3, Math.ceil(body.length/400)),
        published_at: new Date().toISOString(),
        is_duplicate: false,
      })

      if (r.ok) await logOperation('insight_article', 'success', slug)
      results.tasks.insight_article = r.skipped ? { skipped: true } : { ...r, slug, domain: targetDomain }
    } else {
      results.tasks.insight_article = { skipped: true, reason: 'insufficient_news' }
    }
  }

  // ── 태스크 B: 창업 가이드 글 (월요일만) ─────────────────────────
  if (dow === 1) {
    const guideIdx = Math.floor(week/2) % STARTUP_GUIDES.length
    const guide = STARTUP_GUIDES[guideIdx]
    const kst   = kstNow()
    const slug  = `startup-guide-${week}-${kst.getFullYear()}`

    const r = await publishArticle(adminId, {
      title: guide.title,
      slug,
      body:  guide.body,
      excerpt: guide.body.replace(/##[^\n]+\n?/g,'').replace(/\*\*/g,'').trim().slice(0,280),
      category: 'insight',
      status: 'published',
      tags: guide.tags,
      ai_summary: guide.body.replace(/##[^\n]+\n?/g,'').trim().slice(0,300),
      read_time: Math.max(3, Math.ceil(guide.body.length/400)),
      published_at: new Date().toISOString(),
      is_duplicate: false,
    })

    if (r.ok) await logOperation('startup_guide', 'success', slug)
    results.tasks.startup_guide = r.skipped ? { skipped: true } : { ...r, slug }
  } else {
    results.tasks.startup_guide = { skipped: true, reason: 'only_on_monday' }
  }

  // ── 태스크 C: 편집장 칼럼 (매달 1일) ────────────────────────────
  if (date === 1) {
    const col = buildEditorColumn(stats)
    const r = await publishArticle(adminId, {
      title: col.title,
      slug:  col.slug,
      body:  col.body,
      excerpt: col.body.replace(/##[^\n]+\n?/g,'').replace(/\*\*/g,'').trim().slice(0,280),
      category: col.category,
      status: 'published',
      tags: col.tags,
      ai_summary: col.body.replace(/##[^\n]+\n?/g,'').trim().slice(0,300),
      read_time: Math.max(5, Math.ceil(col.body.length/400)),
      published_at: new Date().toISOString(),
      featured: true,
      is_duplicate: false,
    })

    if (r.ok) await logOperation('editor_column', 'success', col.slug)
    results.tasks.editor_column = r.skipped ? { skipped: true } : { ...r, slug: col.slug }
  } else {
    results.tasks.editor_column = { skipped: true, reason: 'only_on_1st' }
  }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
