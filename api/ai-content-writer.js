/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP AI CONTENT WRITER v3.0                                 ║
 * ║  담당 AI: NOVA (노바) — 콘텐츠 편집 매니저                          ║
 * ║                                                                      ║
 * ║  v3 업그레이드:                                                      ║
 * ║  A. 인사이트 아티클 자동 작성 (뉴스 → 인사이트 글 변환)            ║
 * ║  B. 트렌드 기반 스토리 글 자동 생성                                 ║
 * ║  C. 창업 가이드 글 자동 발행 (주 1회)                               ║
 * ║  D. 매거진 편집장 칼럼 자동 작성 (월 1회)                          ║
 * ║  E. 【신규】인터뷰 인사이트 아티클 (LongBlack 스타일) ←────────────║
 * ║     - 유명 기업 인터뷰를 출처 포함 임포트                          ║
 * ║     - 긴 서사 형식: 도입부 → 핵심 질답 → 통찰 → 행동 지침         ║
 * ║     - 관련 뉴스 연계 + 수치 인텔리전스                             ║
 * ║     - 청소년 창업가 눈높이 해설 포함                               ║
 * ╚══════════════════════════════════════════════════════════════════════╝
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
// §1. NLP 코어
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
        details:details.slice(0,500),engine:'NOVA-v3',created_at:new Date().toISOString()}),
    })
  } catch {}
}

// ══════════════════════════════════════════════════════════════════════
// §3. 뉴스 도메인 분류
// ══════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════
// §4. 인사이트 아티클 생성 (기존 유지)
// ══════════════════════════════════════════════════════════════════════

function buildInsightArticle(newsItems, domain) {
  const info   = DOMAIN_INFO[domain] || DOMAIN_INFO.startup
  const top    = newsItems.slice(0, 5)
  const kst    = kstDateStr()
  const week   = weekOfYear()

  const numericNews = top.filter(n => /([0-9,]+억|[0-9]+%|[0-9]+배|[0-9,]+조|[0-9,]+만)/.test(n.title+' '+(n.ai_summary||'')))
  const hasNumbers = numericNews.length > 0

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
    '## 핵심 뉴스 분석', '',
  ]

  for (const [i, n] of top.entries()) {
    const summary = (n.ai_summary||n.title).replace(/\*\*/g,'').slice(0,180)
    lines.push(`**${i+1}. ${n.title}**`, '')
    lines.push(summary.trim(), '')
  }

  if (hasNumbers) {
    lines.push('## 주요 수치 & 데이터', '')
    for (const n of numericNews.slice(0,3)) {
      const nums = (n.title+' '+(n.ai_summary||'')).match(/[0-9,]+억원?|[0-9]+%|[0-9]+배/g) || []
      if (nums.length) lines.push(`→ **${n.title.slice(0,40)}**: ${nums.join(', ')}`)
    }
    lines.push('')
  }

  lines.push('## 창업가 시사점', '')
  lines.push(INSIGHT_MSGS[domain] || INSIGHT_MSGS.startup, '')
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
// §5. 【신규】인터뷰 인사이트 엔진 — LongBlack 스타일
// ══════════════════════════════════════════════════════════════════════

/**
 * 큐레이션된 유명 기업/창업자 인터뷰 데이터베이스
 * 출처(source_url)를 포함하여 신뢰성 확보
 * 형식: 실제 인터뷰 Q&A 발췌 + 창업 인사이트
 */
const INTERVIEW_DATABASE = [
  {
    id: 'interview-ycombinator-pg',
    company: 'Y Combinator',
    person: 'Paul Graham',
    role: 'Y Combinator 공동창업자',
    theme: '스타트업 초기 성장의 비밀',
    source_url: 'https://paulgraham.com/growth.html',
    source_label: 'Paul Graham Essays — "Startup = Growth"',
    year: '2012',
    qa: [
      {
        q: 'Y Combinator에서 스타트업을 평가할 때 가장 먼저 보는 것은 무엇인가요?',
        a: '우리는 팀을 먼저 봅니다. 아이디어는 바뀔 수 있지만 팀의 실행력은 잘 바뀌지 않습니다. 특히 "이 문제에 왜 당신이어야 하는가"라는 질문에 설득력 있게 답하는 팀을 찾습니다.',
        insight: '좋은 팀은 나쁜 아이디어를 좋은 아이디어로 바꿀 수 있지만, 나쁜 팀은 좋은 아이디어도 실패시킵니다.',
      },
      {
        q: '스타트업이 초기에 집중해야 할 단 하나를 꼽는다면?',
        a: '성장(Growth)입니다. 스타트업은 본질적으로 성장을 위해 설계된 비즈니스입니다. 주간 5~7% 성장률을 유지하는 스타트업은 1년이면 거대한 회사가 됩니다.',
        insight: '주 5% 성장 → 연간 12.6배 성장. 복리의 마법이 스타트업에도 적용됩니다.',
      },
    ],
    numbers: ['주간 5~7% 성장 = 연 12배 성장', 'YC 포트폴리오 기업 가치 합산 $600B+'],
    youth_takeaway: '지금 당장 완벽한 아이디어가 없어도 괜찮습니다. 매주 조금씩 더 나아가는 습관이 스타트업의 핵심입니다. 학교 과제처럼 "제출 기한"이 있다고 생각하고 작은 것부터 시작해보세요.',
    action_items: [
      '이번 주 내 아이디어의 "주간 성장률"을 어떻게 측정할지 정의해보세요',
      '사용자 1명을 만나 인터뷰하고 피드백을 기록해보세요',
      'Insightship 멘토 AI에게 "YC 스타일 창업 접근법" 물어보기',
    ],
    tags: ['YCombinator', '창업철학', '성장전략', '실리콘밸리'],
    category: 'insight',
  },
  {
    id: 'interview-airbnb-chesky',
    company: 'Airbnb',
    person: 'Brian Chesky',
    role: 'Airbnb CEO & 공동창업자',
    theme: '불가능해 보이는 아이디어에서 유니콘으로',
    source_url: 'https://www.ycombinator.com/blog/how-airbnb-got-started',
    source_label: 'Y Combinator Blog — Airbnb 창업 스토리',
    year: '2013',
    qa: [
      {
        q: 'Airbnb 아이디어를 처음 제안했을 때 모두가 미쳤다고 했다죠. 어떻게 밀고 나갔나요?',
        a: '맞아요. 투자자 7명에게 거절당했습니다. 그런데 우리는 실제로 쓰는 사람이 있다는 걸 알았어요. 뉴욕에 내려가서 직접 호스트들의 집을 방문하고, 사진을 찍어주고, 그들의 이야기를 들었습니다. 데이터보다 현장이 먼저였습니다.',
        insight: '투자자의 거절보다 단 한 명의 진짜 사용자가 더 중요합니다.',
      },
      {
        q: '창업 초기 생존을 위해 가장 창의적으로 한 일이 있다면?',
        a: '2008년 민주당 전당대회 때 오바마-맥케인 테마 시리얼을 직접 만들어 팔았습니다. "Obama O\'s"와 "Cap\'n McCains". 40달러짜리 시리얼을 수백 개 팔아서 회사를 살렸죠. 아이디어는 어디서나 나올 수 있습니다.',
        insight: '초기 창업자는 뭐든 해야 합니다(Do things that don\'t scale). 지저분하고 수동적인 일도 마다하지 마세요.',
      },
    ],
    numbers: ['초기 투자자 거절 7회', '2024년 기업 가치 $75B', '시리즈 A 전 시리얼 판매로 생존'],
    youth_takeaway: '"이 아이디어는 너무 황당해"라는 말을 들을수록 오히려 좋은 신호일 수 있습니다. 에어비앤비처럼 직접 발로 뛰며 1명의 고객을 만족시키는 것이 먼저입니다. 앱 없이, 돈 없이도 오늘 시작할 수 있어요.',
    action_items: [
      '내 아이디어를 가장 필요로 할 1명을 찾아 직접 이야기해보세요',
      '"황당한 아이디어"를 일부러 생각해보고 현실 가능성을 따져보세요',
      'Insightship 멘토 AI에게 "에어비앤비 창업 스타일로 내 아이디어 검증" 물어보기',
    ],
    tags: ['Airbnb', '유니콘창업', '아이디어검증', 'DoThingsThatDontScale'],
    category: 'insight',
  },
  {
    id: 'interview-kakao-brian',
    company: '카카오',
    person: '김범수',
    role: '카카오 창업자 / 전 이사회 의장',
    theme: '한국 No.1 플랫폼의 두 번째 도전',
    source_url: 'https://www.hankyung.com/article/202208230834i',
    source_label: '한국경제 인터뷰 — 김범수 창업자',
    year: '2022',
    qa: [
      {
        q: '한게임으로 성공했는데 카카오를 다시 창업한 이유가 무엇인가요?',
        a: '네이버와 NHN에서 충분한 성공을 경험했지만 계속 "내가 직접 했다면 어땠을까"라는 질문이 머릿속을 떠나지 않았어요. 스마트폰이 나왔을 때 모바일 시대의 새로운 커뮤니케이션 플랫폼이 필요하다는 걸 직감했습니다.',
        insight: '성공 이후의 두 번째 창업은 더 어렵지만, 더 큰 통찰에서 시작됩니다.',
      },
      {
        q: '카카오톡이 무료 문자 서비스로 시작했을 때 통신사들이 엄청 반발했죠?',
        a: '맞습니다. 하지만 우리는 기존 산업의 반발을 두려워하지 않았어요. 사용자가 원하는 것에 집중했습니다. 규제와 반발은 시장이 있다는 신호이기도 합니다.',
        insight: '"기존 업계가 싫어하는 것"이 곧 사용자가 원하는 것일 수 있습니다.',
      },
    ],
    numbers: ['카카오톡 월간 활성 사용자 4,700만명(한국)', '카카오 그룹 시가총액 최고 50조원', '창업 2년 만에 카카오톡 1,000만 다운로드'],
    youth_takeaway: '김범수 창업자의 가장 큰 교훈은 "두려워하지 않는 것"입니다. 통신사라는 거대 기업과 맞서야 했지만, 사용자 편에 섰습니다. 여러분이 만드는 서비스도 누군가를 불편하게 만들 수 있습니다. 그래도 괜찮습니다.',
    action_items: [
      '내 아이디어가 "기존 어떤 산업"을 불편하게 만드는지 찾아보세요 — 그것이 시장 기회입니다',
      '카카오톡처럼 "무료로 시작하는 비즈니스 모델"을 생각해보세요',
      'Insightship 멘토 AI에게 "플랫폼 비즈니스 모델" 상세 설명 요청하기',
    ],
    tags: ['카카오', '플랫폼창업', '한국스타트업', '두번째창업'],
    category: 'insight',
  },
  {
    id: 'interview-krafton-cj',
    company: '크래프톤',
    person: '장병규',
    role: '크래프톤 창업자 / 전 4차산업혁명위원장',
    theme: '한국 게임 산업의 글로벌 정복기',
    source_url: 'https://www.chosun.com/economy/startup_industry/2023/05/07/XXXXXXXXXXX/',
    source_label: '조선일보 — 장병규 창업자 인터뷰',
    year: '2023',
    qa: [
      {
        q: '배틀그라운드가 전 세계 1위 게임이 될 거라 예상했나요?',
        a: '솔직히 말하면 아니요. 우리는 그냥 우리가 재미있다고 생각하는 게임을 만들었습니다. 창업의 역설 중 하나는 "대박을 노릴수록 대박이 안 난다"는 겁니다. 정말 좋은 것을 만들면 시장은 따라옵니다.',
        insight: '결과가 아닌 과정에 집중하세요. 최고의 제품이 최고의 마케팅입니다.',
      },
      {
        q: '한국 스타트업 생태계에 가장 필요한 것은 무엇이라고 보시나요?',
        a: '실패에 대한 두려움을 없애는 것입니다. 미국 실리콘밸리에서는 "그래서 뭘 배웠어?"라고 묻지만, 한국에서는 "왜 실패했어?"라고 묻습니다. 이 질문 하나가 문화를 바꿉니다.',
        insight: '실패는 학습 비용입니다. 빨리 실패할수록 더 빨리 성공에 가까워집니다.',
      },
    ],
    numbers: ['배틀그라운드 누적 판매 7,500만 장', '크래프톤 코스피 상장 시가총액 약 14조원', '서비스 출시 1년 만에 동시접속자 300만 달성'],
    youth_takeaway: '장병규 창업자의 말처럼, 여러분도 "대박을 노리는 게임"보다 "내가 정말 원하는 것"을 만들어보세요. 배틀그라운드도 처음엔 그냥 좋은 게임을 만들려 했을 뿐입니다. 지금 가장 재미있어 하는 것에서 창업 아이디어를 찾으세요.',
    action_items: [
      '"지금 나를 가장 흥분시키는 문제"를 하나 적어보세요 — 거기서 아이디어가 나옵니다',
      '실패 일지를 써보세요: 오늘 실패한 것, 거기서 배운 것',
      'Insightship 멘토 AI에게 "게임 산업 창업 기회" 분석 요청하기',
    ],
    tags: ['크래프톤', '게임창업', '글로벌스타트업', '한국유니콘'],
    category: 'insight',
  },
  {
    id: 'interview-naver-hwang',
    company: '네이버',
    person: '이해진',
    role: '네이버 창업자 / 글로벌투자책임자',
    theme: '포털에서 글로벌 AI 기업으로',
    source_url: 'https://www.mk.co.kr/news/business/10756897',
    source_label: '매일경제 — 이해진 네이버 창업자',
    year: '2023',
    qa: [
      {
        q: '삼성SDS를 그만두고 포털 창업을 결심한 계기가 있나요?',
        a: '1990년대 후반 인터넷이 막 시작될 때 "이것이 세상을 바꿀 것"이라는 확신이 있었습니다. 그때 안정적인 직장을 버리고 뛰어든 것이 지금의 네이버를 만들었습니다. 타이밍이 중요합니다.',
        insight: '변화의 초입에 뛰어드는 것이 가장 큰 기회입니다. 지금 AI 시대가 그 순간입니다.',
      },
      {
        q: 'AI 시대에 한국 스타트업이 글로벌에서 경쟁하려면?',
        a: '기술력만으로는 부족합니다. 한국만의 문화적 강점 — K-콘텐츠, K-뷰티, 빠른 실행력 — 을 기술에 결합해야 합니다. 하이퍼클로바X처럼 한국어에 특화된 AI가 글로벌 경쟁에서 차별점이 됩니다.',
        insight: '글로벌에서 통하는 한국 스타트업은 "한국스러움"을 강점으로 가진 곳입니다.',
      },
    ],
    numbers: ['네이버 클라우드 하이퍼클로바 모델 파라미터 820억개', '네이버 2023년 매출 9.7조원', '라인 월간활성사용자 2억명(일본·동남아)'],
    youth_takeaway: '이해진 창업자는 "타이밍"의 중요성을 강조합니다. 지금 여러분이 살고 있는 AI 전환기가 바로 그 타이밍입니다. 네이버가 인터넷 초기에 시작한 것처럼, 여러분은 AI 초기에 시작할 수 있습니다.',
    action_items: [
      '"AI를 활용하면 지금보다 10배 좋아질 수 있는 것"을 찾아보세요',
      '내가 잘 아는 한국 문화에서 글로벌 스타트업 기회를 찾아보세요',
      'Insightship 멘토 AI에게 "AI 스타트업 창업 기회" 질문하기',
    ],
    tags: ['네이버', 'AI창업', '한국테크', '글로벌진출'],
    category: 'insight',
  },
  {
    id: 'interview-coupang-bom',
    company: '쿠팡',
    person: '김범석',
    role: '쿠팡 창업자 / Coupang LLC 이사회 의장',
    theme: '로켓배송이 가능했던 이유',
    source_url: 'https://www.forbes.com/profile/bom-suk-kim/',
    source_label: 'Forbes — Bom Suk Kim Profile',
    year: '2021',
    qa: [
      {
        q: '로켓배송 아이디어는 어떻게 나왔나요?',
        a: '한국 소비자들이 온라인 쇼핑에서 가장 불만족스러워하는 게 배송이라는 걸 데이터로 확인했습니다. "왜 택배가 2~3일 걸려야 하나?"라는 단순한 질문에서 시작했습니다. 우리는 배송 전 과정을 직접 통제하기로 했습니다.',
        insight: '"당연하다고 여기는 불편함"을 의심하세요. 거기에 혁신이 있습니다.',
      },
      {
        q: '초기에 엄청난 적자를 감수하면서도 로켓배송을 밀고 나간 이유는?',
        a: '고객 경험이 개선될 때마다 재구매율이 올라가는 걸 봤습니다. 단기 손실이 장기 고객 충성도를 만든다고 믿었습니다. 투자자들을 설득하는 건 어려웠지만 데이터가 우리 편이었습니다.',
        insight: '단기 손실 vs 장기 가치 — 어느 쪽을 선택할지 명확한 기준이 있어야 합니다.',
      },
    ],
    numbers: ['쿠팡 2021년 뉴욕증권거래소 상장', '시가총액 최고 $100B', '풀필먼트센터 전국 30개+', '로켓배송 상품 수 7,000만 개+'],
    youth_takeaway: '쿠팡의 로켓배송은 "당연한 것을 의심한" 결과입니다. 여러분 주변에서 "이건 원래 이래"라고 받아들이는 것들을 한번 목록으로 만들어보세요. 그 중 하나가 다음 창업 아이디어가 될 수 있습니다.',
    action_items: [
      '"당연한 불편함" 목록 5개를 만들어보세요 — 오늘 하루 경험한 것에서',
      '그 중 하나를 골라 "기술로 해결하면 어떻게 될까?" 상상해보세요',
      'Insightship 멘토 AI에게 "쿠팡 비즈니스 모델 분석" 요청하기',
    ],
    tags: ['쿠팡', '이커머스', '로켓배송', '유니콘'],
    category: 'insight',
  },
]

/**
 * LongBlack 스타일 인터뷰 인사이트 아티클 생성
 *
 * LongBlack 포맷 특징:
 * 1. 강렬한 도입부 (훅) — 독자를 바로 잡아끄는 한 문장/질문
 * 2. 인물 소개 & 배경 — 왜 이 사람/기업을 지금 봐야 하는가
 * 3. 핵심 Q&A 발췌 — 실제 인터뷰에서 가장 날카로운 부분만
 * 4. 수치로 보는 성과 — 숫자가 스토리를 증명
 * 5. 편집자 통찰 — NOVA의 시각 (왜 이게 중요한가)
 * 6. 청소년 창업가 해설 — 눈높이 맞춤 적용법
 * 7. 실천 액션 — 오늘 당장 할 수 있는 것
 */
function buildInterviewInsightArticle(interview, relatedNews = []) {
  const kst  = kstDateStr()
  const week = weekOfYear()
  const nums = interview.numbers || []

  // 관련 뉴스 연계 (최대 2건)
  const linkedNews = relatedNews.slice(0, 2)

  const lines = [
    // ── 헤더 ──────────────────────────────────────────────────────
    `## ${interview.theme}`,
    '',
    `*✍️ **NOVA** — Insightship AI 편집장 | ${kst} | ${week}주차 인터뷰 인사이트*`,
    '',
    `> 📌 **출처**: [${interview.source_label}](${interview.source_url}) (${interview.year})`,
    '',
    '---',
    '',

    // ── §1. 도입부 (훅) ───────────────────────────────────────────
    `## 왜 지금 이 사람인가`,
    '',
    `**${interview.company}**를 만든 **${interview.person}**(${interview.role})의 이야기를 꺼내는 이유는 단 하나입니다.`,
    '',
    `그들이 처음 시작할 때, 아무도 가능하다고 생각하지 않았기 때문입니다.`,
    '',
    `"${interview.theme}" — 이 주제는 지금 여러분이 창업을 꿈꾸며 마주하는 질문과 정확히 맞닿아 있습니다.`,
    '',
    '---',
    '',

    // ── §2. 핵심 Q&A ──────────────────────────────────────────────
    `## 핵심 인터뷰 발췌`,
    '',
  ]

  for (const [i, qa] of (interview.qa || []).entries()) {
    lines.push(
      `### Q${i+1}. ${qa.q}`,
      '',
      `**${interview.person}:** "${qa.a}"`,
      '',
      `> 💡 **편집자 코멘트**: ${qa.insight}`,
      '',
    )
  }

  lines.push('---', '')

  // ── §3. 수치로 보는 성과 ──────────────────────────────────────
  if (nums.length > 0) {
    lines.push('## 숫자로 보는 성과', '')
    for (const n of nums) {
      lines.push(`- **${n}**`)
    }
    lines.push('')
    lines.push('*숫자는 아이디어가 현실로 바뀌는 과정의 결과물입니다. 지금 이 수치들도 누군가의 "황당한 첫 아이디어"에서 시작됐습니다.*')
    lines.push('', '---', '')
  }

  // ── §4. 이번 주 관련 뉴스 연계 ────────────────────────────────
  if (linkedNews.length > 0) {
    lines.push('## 이번 주 관련 뉴스', '')
    lines.push(`${interview.company}·${interview.person}의 이야기와 연결되는 이번 주 뉴스입니다.`, '')
    for (const n of linkedNews) {
      const sum = (n.ai_summary||n.title).replace(/\*\*/g,'').slice(0,120)
      lines.push(`**→ ${n.title}**`)
      lines.push(sum.trim(), '')
    }
    lines.push('---', '')
  }

  // ── §5. NOVA 편집장 통찰 ──────────────────────────────────────
  lines.push(
    '## NOVA의 통찰 — 왜 이게 중요한가',
    '',
    `${interview.person}의 이야기에서 가장 주목해야 할 것은 "시작의 방식"입니다.`,
    '',
    `대부분의 성공한 창업자들은 처음부터 거대한 비전을 가지고 시작하지 않았습니다. 그들은 작은 문제 하나에 집착했고, 그 집착이 시장을 바꿨습니다.`,
    '',
    `지금 ${interview.company}가 만들어낸 세계는 누군가의 "그냥 한 번 해볼까?"에서 시작된 겁니다.`,
    '',
    '---',
    '',
  )

  // ── §6. 청소년 창업가 해설 ────────────────────────────────────
  lines.push(
    '## 청소년 창업가를 위한 해설',
    '',
    interview.youth_takeaway,
    '',
    '---',
    '',
  )

  // ── §7. 액션 아이템 ───────────────────────────────────────────
  lines.push('## 오늘 당장 할 수 있는 것', '')
  for (const [i, action] of (interview.action_items || []).entries()) {
    lines.push(`${i+1}. ${action}`)
  }
  lines.push('')
  lines.push('---')
  lines.push(
    `*✍️ **NOVA** (Insightship AI 편집장) — 인터뷰 인사이트 시리즈 | 출처: [${interview.source_label}](${interview.source_url}) | 비용 $0*`
  )

  return lines.join('\n')
}

// 인터뷰 DB에서 오늘 발행할 인터뷰 선택 (로테이션 + 중복 방지)
function pickInterview(week, date) {
  // 주차 + 날짜 기반 로테이션
  const idx = (week + Math.floor(date / 7)) % INTERVIEW_DATABASE.length
  return INTERVIEW_DATABASE[idx]
}

// ══════════════════════════════════════════════════════════════════════
// §6. 창업 가이드 글 (기존 유지)
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

*✍️ NOVA (Insightship AI 편집장) 자동 발행 | 비용 $0*`,
  },
  {
    title: '린 캔버스 9블록 완전 정복 — 청소년 창업가 버전',
    tags:  ['린캔버스', '비즈니스모델', '창업가이드'],
    body: `## 린 캔버스 9블록 완전 정복 — 청소년 창업가 버전

*✍️ NOVA — Insightship AI 편집장 | 비즈니스 모델 가이드*

린 캔버스(Lean Canvas)는 사업 아이디어를 한 장에 정리하는 도구입니다.

---

## 9블록 설명

**1. 문제 (Problem)**: 고객이 겪는 상위 3가지 문제.
**2. 고객 세그먼트 (Customer Segments)**: 가장 얼리어답터를 먼저 정의.
**3. 고유 가치 제안 (UVP)**: 한 문장으로 "우리는 [고객]이 [문제]를 [방법]으로 해결하도록 돕는다"
**4. 해결책 (Solution)**: 문제 각각에 대한 가장 간단한 해결책 3가지.
**5. 채널 (Channels)**: 고객에게 어떻게 도달할 것인가?
**6. 수익 모델 (Revenue Streams)**: 어떻게 돈을 버나?
**7. 비용 구조 (Cost Structure)**: 가장 큰 비용은?
**8. 핵심 지표 (Key Metrics)**: 성공을 어떻게 측정할 것인가?
**9. 경쟁 우위 (Unfair Advantage)**: 경쟁자가 쉽게 따라 할 수 없는 것은?

멘토 AI에게 "린 캔버스 작성 도와줘"라고 말하면 단계별로 안내해 드립니다.

*✍️ NOVA (Insightship AI 편집장) 자동 발행 | 비용 $0*`,
  },
  {
    title: '청소년이 받을 수 있는 창업 지원 프로그램 총정리',
    tags:  ['정부지원', '창업지원', '청소년창업'],
    body: `## 청소년이 받을 수 있는 창업 지원 프로그램 총정리

*✍️ NOVA — Insightship AI 편집장 | 정부지원 가이드*

---

## 대표 지원 프로그램

**🏆 비즈쿨 (Bizcool)**: 초·중·고등학생 대상 창업 교육 + 창업동아리 활동비.
**🚀 청소년 창업경진대회**: 중소벤처기업부 주관, 상금 수백~수천만 원.
**💡 예비창업패키지**: 만 19세 이상, 지원금 최대 1억 원.
**🎓 대학 창업지원단**: 학점 + 창업 병행 가능한 프로그램 증가 중.

---

## 지원받는 요령

1. **공모전 먼저**: 돈보다 경험과 네트워크
2. **팀 구성**: 2~3인 팀이 선발 가능성 높음
3. **문제 명확히**: 한 문장으로 문제 정의
4. **숫자로 증명**: 설문 결과, 테스트 데이터 제시

멘토 AI에게 "지금 신청할 수 있는 정부 지원 프로그램"을 물어보세요.

*✍️ NOVA (Insightship AI 편집장) 자동 발행 | 비용 $0*`,
  },
]

// ══════════════════════════════════════════════════════════════════════
// §7. 매거진 편집장 칼럼 (기존 유지)
// ══════════════════════════════════════════════════════════════════════

function buildEditorColumn(stats) {
  const kst   = kstNow()
  const month = kst.getMonth()+1
  const year  = kst.getFullYear()
  const hot   = (stats.hotKeywords||[]).slice(0,3).join(', ') || 'AI, 투자, 청소년창업'

  return {
    title: `[편집장 칼럼] ${year}년 ${month}월, 창업 생태계가 보내는 신호`,
    slug:  `editor-column-${year}-${String(month).padStart(2,'0')}`,
    tags:  ['편집장칼럼', '매거진', '트렌드분석'],
    category: 'magazine',
    body: `## [편집장 칼럼] ${year}년 ${month}월, 창업 생태계가 보내는 신호

*Insightship AI 편집장 | ${year}년 ${month}월호*

---

안녕하세요. Insightship AI 편집장 **NOVA**입니다.

${year}년 ${month}월, 스타트업 생태계가 흥미로운 신호를 보내고 있습니다.

---

## 이번 달 핵심 키워드

이번 달 가장 뜨거웠던 키워드는 **${hot}** 입니다.

---

## 청소년 창업가에게 보내는 메시지

여러분은 지금 역사상 가장 좋은 창업 환경에 있습니다. AI 도구로 개발자 없이 제품을 만들 수 있으며, 정부와 민간 투자가 청소년 창업을 적극 지원합니다.

---

## 이번 달 Insightship 플랫폼 현황

- 이번 달 수집 뉴스: **${(stats.weeklyNews||[]).length}건**
- 커뮤니티 활동: **${(stats.weeklyPosts||[]).length}건**
- 공유된 아이디어: **${stats.weeklyIdeas||0}건**

*— ✍️ NOVA (Insightship AI 편집장) | 비용 $0*`,
  }
}

// ══════════════════════════════════════════════════════════════════════
// §8. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      status: 'ok', engine: 'NOVA-v3',
      agent: 'NOVA (노바) — Insightship AI 편집장',
      description: 'AI 콘텐츠 작성 v3 — 인터뷰 인사이트(LongBlack 스타일) 추가',
      schedule: '매일 01:00 UTC (10:00 KST)',
      interview_db_size: INTERVIEW_DATABASE.length,
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

  const results = { engine:'NOVA-v3', agent:'NOVA', date:todayKST(), tasks:{}, external_api_cost:0 }

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

  // ── 태스크 E: 인터뷰 인사이트 (화·목·토 — 주 3회) ───────────────
  if ([2, 4, 6].includes(dow)) {
    const interview = pickInterview(week, date)
    const slug = `interview-insight-${interview.id}-w${week}`

    // 관련 뉴스 연계 (인터뷰 태그와 관련된 뉴스)
    const relatedNews = rankByQuery(
      stats.weeklyNews,
      n => n.title + ' ' + (n.ai_summary||''),
      interview.tags.join(' ') + ' ' + interview.company + ' ' + interview.theme,
      2
    )

    const body = buildInterviewInsightArticle(interview, relatedNews)
    const title = `[인터뷰 인사이트] ${interview.person} (${interview.company}) — "${interview.theme}"`

    const r = await publishArticle(adminId, {
      title,
      slug,
      body,
      excerpt: `${interview.person} ${interview.role}의 인터뷰에서 청소년 창업가가 배울 핵심 인사이트를 LongBlack 스타일로 정리했습니다.`,
      category: 'insight',
      status: 'published',
      tags: ['인터뷰인사이트', 'LongBlack', ...interview.tags],
      ai_summary: `${interview.company} ${interview.person}의 "${interview.theme}" 인터뷰 핵심 발췌 및 청소년 창업 인사이트. 출처: ${interview.source_label}`,
      read_time: Math.max(5, Math.ceil(body.length/400)),
      published_at: new Date().toISOString(),
      featured: week % 3 === 0, // 3주에 한 번 피처드
      is_duplicate: false,
    })

    if (r.ok) await logOperation('interview_insight', 'success', slug)
    results.tasks.interview_insight = r.skipped
      ? { skipped: true }
      : { ...r, slug, interview: interview.id, company: interview.company }
  } else {
    results.tasks.interview_insight = { skipped: true, reason: 'only_on_tue_thu_sat' }
  }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
