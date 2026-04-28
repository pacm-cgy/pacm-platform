/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP AI PLATFORM OPERATOR v2.0                              ║
 * ║  담당 AI: ARIA (아리아) — 플랫폼 운영 매니저                          ║
 * ║                                                                      ║
 * ║  담당 업무:                                                          ║
 * ║  A. 공지사항 자동 작성 & 발행 (community_posts: notice)             ║
 * ║  B. 커뮤니티 활성화 포스트 작성 (질문/토론 유도)                    ║
 * ║  C. 이벤트/챌린지 자동 생성 (events 테이블)                         ║
 * ║  D. 운영 현황 자가 모니터링 & 로그                                  ║
 * ║  E. 트렌드 기반 커뮤니티 토론 주제 자동 생성                        ║
 * ║                                                                      ║
 * ║  스케줄: 매일 09:00 KST (UTC 00:00)                                 ║
 * ║  외부 API 비용: $0 (완전 자체 엔진)                                  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * ARIA 캐릭터:
 *   친근하고 활발하며 공동체 의식이 강한 AI 운영팀장.
 *   커뮤니티 멤버들을 응원하고 매일 소통하는 역할.
 *   색상: #818CF8 (indigo) | 이모지: 🤖
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

const json = (d, s=200) => new Response(JSON.stringify(d,null,2), {
  status: s, headers: { 'Content-Type': 'application/json' },
})

// ══════════════════════════════════════════════════════════════════════
// §1. 날짜/시간 유틸
// ══════════════════════════════════════════════════════════════════════

function kstNow() {
  return new Date(Date.now() + 9*3600000)
}

function kstDateStr(d) {
  const k = d || kstNow()
  return `${k.getFullYear()}년 ${k.getMonth()+1}월 ${k.getDate()}일`
}

function todayKST() {
  const k = kstNow()
  return `${k.getFullYear()}-${String(k.getMonth()+1).padStart(2,'0')}-${String(k.getDate()).padStart(2,'0')}`
}

function weekOfYear() {
  const now = kstNow()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7)
}

function dayOfWeek() {
  return kstNow().getDay() // 0=일, 1=월, ..., 6=토
}

// ══════════════════════════════════════════════════════════════════════
// §2. 관리자 계정 조회
// ══════════════════════════════════════════════════════════════════════

// ARIA의 고유 username으로 프로필을 찾고, 없으면 다중 fallback
async function getAriaId() {
  try {
    // 1차: ARIA 전용 계정 조회
    const r1 = await fetch(`${SB_URL}/rest/v1/profiles?username=eq.ai_aria&limit=1&select=id`, { headers: H() })
    const d1 = await r1.json()
    if (d1?.[0]?.id) return d1[0].id
    // 2차: admin fallback
    const r2 = await fetch(`${SB_URL}/rest/v1/profiles?role=eq.admin&limit=1&select=id`, { headers: H() })
    const d2 = await r2.json()
    if (d2?.[0]?.id) return d2[0].id
    // 3차: username=insightship or pacm
    const r3 = await fetch(`${SB_URL}/rest/v1/profiles?or=(username.eq.insightship,username.eq.pacm,username.eq.admin)&limit=1&select=id`, { headers: H() })
    const d3 = await r3.json()
    if (d3?.[0]?.id) return d3[0].id
    // 4차: 가장 오래된 계정 (최후 fallback)
    const r4 = await fetch(`${SB_URL}/rest/v1/profiles?select=id&order=created_at.asc&limit=1`, { headers: H() })
    const d4 = await r4.json()
    return d4?.[0]?.id || null
  } catch { return null }
}

// ══════════════════════════════════════════════════════════════════════
// §3. 오늘 이미 실행했는지 확인 (중복 방지)
// ══════════════════════════════════════════════════════════════════════

// 오늘 이미 같은 제목으로 공지가 올라갔는지 community_posts로 확인 (ai_operations_log 스키마 미완성 대비)
async function alreadyRanToday(taskType) {
  try {
    const today = todayKST()
    // community_posts에서 오늘 날짜 공지/질문 여부로 중복 판단
    if (taskType === 'daily_notice') {
      const r = await fetch(
        `${SB_URL}/rest/v1/community_posts?post_type=eq.notice&created_at=gte.${today}T00:00:00Z&limit=1&select=id`,
        { headers: H() }
      )
      const d = await r.json().catch(() => [])
      return Array.isArray(d) && d.length > 0
    }
    if (taskType === 'community_discussion') {
      const r = await fetch(
        `${SB_URL}/rest/v1/community_posts?post_type=eq.question&created_at=gte.${today}T00:00:00Z&limit=1&select=id`,
        { headers: H() }
      )
      const d = await r.json().catch(() => [])
      return Array.isArray(d) && d.length > 0
    }
    return false
  } catch { return false }
}

async function logOperation(taskType, result, details='') {
  // ai_operations_log 테이블은 id, created_at 컬럼만 존재 — 로깅 스킵 (에러 방지)
  // 중복 방지는 alreadyRanToday()에서 community_posts로 처리
  try {
    await fetch(`${SB_URL}/rest/v1/ai_operations_log`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body: JSON.stringify({ created_at: new Date().toISOString() }),
    }).catch(() => {})
  } catch {}
}

// ══════════════════════════════════════════════════════════════════════
// §4. 플랫폼 현황 수집
// ══════════════════════════════════════════════════════════════════════

async function collectPlatformStats() {
  try {
    const yesterday = new Date(Date.now()-86400000).toISOString()
    const weekAgo   = new Date(Date.now()-7*86400000).toISOString()

    const [newsR, usersR, postsR, ideasR, trendsR] = await Promise.allSettled([
      fetch(`${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published&created_at=gte.${weekAgo}&select=id,title,ai_category&order=published_at.desc&limit=50`, { headers: H() }).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/profiles?created_at=gte.${yesterday}&select=id&limit=100`, { headers: H() }).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/community_posts?is_deleted=eq.false&created_at=gte.${weekAgo}&select=id,post_type,like_count&limit=100`, { headers: H() }).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/ideas?is_deleted=eq.false&is_public=eq.true&created_at=gte.${weekAgo}&select=id,like_count&limit=50`, { headers: H() }).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/trend_keywords?order=count.desc&limit=10&select=keyword,count`, { headers: H() }).then(r=>r.json()),
    ])

    return {
      weeklyNews:  newsR.status==='fulfilled'  ? (newsR.value||[])  : [],
      newUsers:    usersR.status==='fulfilled'  ? (usersR.value||[]).length : 0,
      weeklyPosts: postsR.status==='fulfilled'  ? (postsR.value||[]) : [],
      weeklyIdeas: ideasR.status==='fulfilled'  ? (ideasR.value||[]).length : 0,
      hotKeywords: trendsR.status==='fulfilled' ? (trendsR.value||[]).slice(0,5).map(t=>t.keyword) : [],
    }
  } catch { return { weeklyNews:[], newUsers:0, weeklyPosts:[], weeklyIdeas:0, hotKeywords:[] } }
}

// ══════════════════════════════════════════════════════════════════════
// §5-A. 공지사항 자동 작성 (요일별 다양한 주제)
// ══════════════════════════════════════════════════════════════════════

const NOTICE_TEMPLATES = {
  // 월요일: 주간 시작 공지
  1: (stats, kst) => ({
    title: `🌟 이번 주도 함께 성장해요! — ${kstDateStr(kst)} ARIA 주간 공지`,
    body: `안녕하세요! 운영 매니저 **ARIA**입니다 🤖 새로운 한 주가 시작됐습니다.

**📰 지난 주 플랫폼 현황**
- 수집된 스타트업 뉴스: ${stats.weeklyNews.length}건
- 커뮤니티 새 게시물: ${stats.weeklyPosts.length}건
- 신규 아이디어 공유: ${stats.weeklyIdeas}건
- 신규 가입 멤버: ${stats.newUsers}명

**🔥 이번 주 주목 키워드**
${stats.hotKeywords.length ? stats.hotKeywords.map(k=>`\`${k}\``).join('  ') : '`스타트업`  `투자`  `AI창업`'}

**📅 이번 주 예정 콘텐츠**
- 매일 최신 스타트업 뉴스 + AI 요약 자동 발행
- 주간 AI 리포트 (금요일 발행)
- 트렌드 분석 업데이트 (매 6시간)

이번 주도 Insightship과 함께 창업 인사이트를 키워보세요! 💪
아이디어가 있다면 **아이디어랩**에 공유해 주세요. AI 멘토 **LUMI**가 피드백을 드립니다.

\`#Insightship\` \`#주간공지\` \`#ARIA운영팀\``,
    tags: ['공지', '주간공지', 'ARIA'],
  }),

  // 화요일: 뉴스 하이라이트
  2: (stats, kst) => {
    const topNews = stats.weeklyNews.slice(0,3)
    const newsLines = topNews.length
      ? topNews.map((n,i)=>`${i+1}. **${n.title.slice(0,50)}**`).join('\n')
      : '최신 스타트업 뉴스가 수집 중입니다.'
    return {
      title: `📰 이번 주 스타트업 뉴스 하이라이트 — ${kstDateStr(kst)}`,
      body: `Insightship AI가 이번 주 가장 주목할 스타트업 뉴스를 골랐습니다.

**🔥 TOP 뉴스**
${newsLines}

**💡 AI 분석**
${stats.hotKeywords.length
  ? `이번 주 뉴스에서 가장 많이 등장한 키워드: ${stats.hotKeywords.slice(0,3).map(k=>`\`${k}\``).join(' ')}`
  : '다양한 분야의 스타트업 소식이 수집되었습니다.'}

뉴스 전체와 AI 요약은 **뉴스** 탭에서 확인하세요!
멘토 AI에게 "이번 주 핫한 스타트업 분야가 뭐야?"라고 물어보면 더 자세한 분석을 받을 수 있어요.

\`#뉴스하이라이트\` \`#스타트업\` \`#AI뉴스\``,
      tags: ['공지', '뉴스하이라이트', 'AI뉴스'],
    }
  },

  // 수요일: 커뮤니티 활성화
  3: (stats, kst) => ({
    title: `💬 이번 주 커뮤니티 베스트 & 토론 주제 — ${kstDateStr(kst)}`,
    body: `안녕하세요, 운영 매니저 **ARIA**입니다 🤖 이번 주 커뮤니티 활동을 정리했습니다.

**📊 이번 주 커뮤니티 현황**
- 게시물: ${stats.weeklyPosts.length}건
- 아이디어 공유: ${stats.weeklyIdeas}건
${stats.weeklyPosts.length > 0 ? `- 좋아요 합계: ${stats.weeklyPosts.reduce((s,p)=>s+(p.like_count||0),0)}개` : ''}

**🗣️ 이번 주 토론 주제 (AI 제안)**
Q. 요즘 AI 스타트업이 급증하고 있는데, 청소년 창업가가 AI를 활용한 사업 아이디어를 떠올리려면 어떻게 해야 할까요?

여러분의 생각을 댓글로 공유해 주세요! 다양한 시각이 모이면 더 좋은 아이디어가 나옵니다. 🚀

**💡 이번 주 아이디어랩 추천**
아이디어는 있는데 팀이 없다면? → 아이디어랩에서 팀원을 모집해 보세요!

\`#커뮤니티\` \`#토론\` \`#아이디어\``,
    tags: ['공지', '커뮤니티', '토론'],
  }),

  // 목요일: AI 멘토 활용 팁
  4: (stats, kst) => ({
    title: `🤖 AI 멘토 100% 활용법 — ${kstDateStr(kst)} 운영팀 가이드`,
    body: `Insightship AI 멘토를 더 잘 활용하는 방법을 알려드립니다!

**✅ 이런 질문을 해보세요**

1. **린 캔버스 작성** → "내 아이디어로 린 캔버스 작성해줘"
2. **MVP 설계** → "MVP를 어떻게 만들어야 할까?"
3. **시장 분석** → "에듀테크 시장 규모랑 트렌드 알려줘"
4. **투자 준비** → "시드 투자받으려면 어떻게 해야 해?"
5. **정부지원** → "청소년 창업 지원 프로그램 뭐가 있어?"

**💡 꿀팁: 구체적일수록 더 좋은 답변이 나와요!**
예) "앱 개발 창업 아이디어가 있는데 MVP를 만들려면?"

AI 멘토는 **완전 자체 개발** 엔진으로, 외부 API 비용 없이 운영됩니다.
여러분의 질문 데이터로 매일 학습하며 점점 더 똑똑해지고 있어요! 🧠

**현재 AI 멘토 통계**
- 지원 의도 분류: 15가지
- 지식베이스: 매일 자동 업데이트
- 학습 주기: 매일 03:00 자동 학습

\`#AI멘토\` \`#창업팁\` \`#Insightship\``,
    tags: ['공지', 'AI멘토', '가이드'],
  }),

  // 금요일: 주간 리포트 예고
  5: (stats, kst) => ({
    title: `📊 이번 주 AI 리포트 발행 완료! — ${kstDateStr(kst)}`,
    body: `매주 금요일, Insightship AI가 한 주간의 스타트업 생태계를 정리한 리포트를 자동 발행합니다.

**📋 이번 주 리포트 목록** (인사이트 탭에서 확인)
1. **[AI 리포트] 이번 주 스타트업 투자·자금 동향** — 어느 분야에 돈이 몰렸나?
2. **[AI 리포트] 이번 주 스타트업 생태계 시장 동향** — 시장 큰 그림 분석

**🔍 리포트 읽는 법**
- "투자 유치 기업이 어떤 문제를 풀고 있나?" 관점으로 읽기
- 나의 아이디어와 겹치는 분야가 있다면 경쟁/협력 가능성 분석
- AI 멘토에게 리포트 내용 질문하기

${stats.weeklyNews.length}건의 뉴스를 기반으로 자동 생성된 리포트입니다. 외부 AI API 비용: $0 💚

\`#AI리포트\` \`#주간분석\` \`#스타트업트렌드\``,
    tags: ['공지', 'AI리포트', '주간분석'],
  }),

  // 토요일: 창업 챌린지
  6: (stats, kst) => ({
    title: `🏆 주말 창업 챌린지! — ${kstDateStr(kst)} ARIA`,
    body: `주말을 알차게 보낼 창업 챌린지를 AI가 준비했습니다!

**🎯 이번 주말 챌린지: 문제 발견 미션**

**미션 1 (30분)**: 오늘 하루 동안 불편했던 것 3가지 적기
**미션 2 (1시간)**: 그 중 하나를 골라 "누가, 얼마나, 왜 불편한가?" 조사
**미션 3 (2시간)**: 해결책 스케치 + 아이디어랩에 공유

**💡 힌트**
${stats.hotKeywords.length
  ? `이번 주 핫 키워드 "${stats.hotKeywords[0]||'AI'}" 분야에서 문제를 찾아보면 어떨까요?`
  : '일상에서 가장 자주 불편함을 느끼는 순간에 창업 아이디어가 숨어 있어요.'}

**🎁 참여하면**
→ 아이디어랩에 올리면 AI 멘토가 무료로 피드백 드립니다!
→ 좋은 아이디어는 Featured 아이디어로 선정될 수 있어요.

도전하는 여러분을 응원합니다! 💪

\`#창업챌린지\` \`#주말미션\` \`#아이디어발굴\``,
    tags: ['공지', '챌린지', '창업미션'],
  }),

  // 일요일: 다음 주 예고
  0: (stats, kst) => ({
    title: `📅 다음 주 Insightship 예고 — ${kstDateStr(kst)} ARIA`,
    body: `한 주 수고하셨습니다! 운영 매니저 **ARIA**입니다 🤖 다음 주 예정 콘텐츠를 미리 알려드립니다.

**📬 내일(월요일) 발송**: 주간 뉴스레터
지난 한 주의 스타트업 핵심 소식을 AI가 정리해서 이메일로 보내드립니다.
아직 구독 안 하셨다면? 홈페이지 하단에서 무료 구독하세요!

**📰 다음 주 예정 콘텐츠**
- 매일 최신 스타트업 뉴스 AI 요약 (자동 발행)
- 커뮤니티 AI 운영 포스트 (매일 09:00)
- 트렌드 분석 업데이트 (매 6시간)
- 주간 리포트 (다음 주 금요일)

**📊 이번 주 통계**
- 수집 뉴스: ${stats.weeklyNews.length}건
- 커뮤니티 활동: ${stats.weeklyPosts.length}건
- 신규 아이디어: ${stats.weeklyIdeas}건
- AI 멘토 학습 횟수: 매일 자동

다음 주도 Insightship과 함께 성장해요! 🚀

\`#주간마무리\` \`#다음주예고\` \`#Insightship\``,
    tags: ['공지', '주간마무리', '예고'],
  }),
}

// ══════════════════════════════════════════════════════════════════════
// §5-B. 커뮤니티 토론 포스트 (요일별 주제)
// ══════════════════════════════════════════════════════════════════════

const DISCUSSION_TOPICS = [
  {
    title: '여러분은 어떤 창업 아이디어를 가지고 있나요? 공유해 주세요!',
    body: `안녕하세요, 운영 매니저 **ARIA**입니다! 오늘의 토론 주제를 제안합니다 💬

**오늘의 질문**: 여러분이 가진 창업 아이디어 중 하나를 공유해 주세요.

아무리 작은 아이디어라도 괜찮아요. 중요한 건 "어떤 문제를 해결하고 싶은가"입니다.

**공유 포맷 (선택)**
- 해결하고 싶은 문제:
- 대상 고객:
- 해결책 아이디어:

댓글로 아이디어를 나눠주시면 커뮤니티 멤버들과 AI 멘토가 피드백을 드립니다! 🚀

\`#아이디어\` \`#창업\` \`#토론\``,
    tags: ['토론', '아이디어', '창업'],
  },
  {
    title: '창업하면서 가장 두려운 것은 무엇인가요?',
    body: `운영 매니저 **ARIA**가 오늘의 토론 주제를 가져왔습니다 🗣️

창업을 꿈꾸지만 막상 시작하기 두려운 분들이 많을 거예요.

**여러분의 가장 큰 창업 두려움은?**
1. 실패할까봐
2. 자금이 없어서
3. 아이디어가 별로인 것 같아서
4. 팀을 못 구할 것 같아서
5. 기술력이 부족해서

솔직하게 공유해 주세요. 여기서는 모든 고민이 환영받습니다. 💙
AI 멘토에게 구체적인 고민을 물어보면 맞춤 조언도 받을 수 있어요!

\`#창업고민\` \`#두려움극복\` \`#토론\``,
    tags: ['토론', '창업고민', '커뮤니티'],
  },
  {
    title: 'AI 시대에 청소년 창업가가 가져야 할 경쟁력은?',
    body: `안녕하세요, **ARIA**입니다! 오늘의 토론 주제입니다 🤖

ChatGPT, Gemini, Insightship AI... AI 도구가 넘쳐나는 시대입니다.

**여러분 생각엔, AI 시대 청소년 창업가의 경쟁력은 무엇일까요?**

AI가 대체할 수 없는 것:
- 문제를 발견하는 눈
- 공감 능력과 스토리텔링
- 실행력과 끈기
- 네트워크와 신뢰

여러분만의 생각을 댓글로 나눠주세요! 서로의 시각에서 배울 수 있어요.

\`#AI시대\` \`#청소년창업\` \`#경쟁력\``,
    tags: ['토론', 'AI시대', '청소년창업'],
  },
  {
    title: '내가 창업하고 싶은 분야와 이유를 알려주세요!',
    body: `운영 매니저 **ARIA**가 오늘의 커뮤니티 토론 주제를 제안합니다! ✨

여러분은 어떤 분야에서 창업하고 싶으신가요?

**인기 분야들**
- 에듀테크 (교육 혁신)
- AI/기술 스타트업
- 환경/그린테크
- 헬스케어
- 소셜임팩트
- 콘텐츠/크리에이터 이코노미

분야와 함께 "왜 그 분야인지" 이유도 공유해 주시면 더 좋아요!
비슷한 관심사를 가진 멤버를 만날 수 있는 기회이기도 합니다. 🤝

\`#창업분야\` \`#관심사\` \`#네트워킹\``,
    tags: ['토론', '창업분야', '네트워킹'],
  },
  {
    title: '여러분이 존경하는 창업가/기업가는 누구인가요?',
    body: `안녕하세요, **ARIA**입니다! 오늘의 토론 주제를 소개합니다 🌟

롤모델에게서 배우는 건 창업 교육의 핵심 중 하나예요.

**여러분의 롤모델 창업가는?**
그 사람에게서 무엇을 배우고 싶은지도 함께 알려주세요!

한국, 해외 모두 환영합니다. 유명하지 않아도 괜찮아요. 주변에서 창업한 형, 언니, 부모님도 훌륭한 롤모델이 될 수 있어요!

AI 멘토에게 "○○의 창업 스토리 알려줘"라고 물어보면 더 자세한 내용을 알 수 있어요. 📚

\`#롤모델\` \`#창업가\` \`#인스피레이션\``,
    tags: ['토론', '롤모델', '창업가'],
  },
]

// ══════════════════════════════════════════════════════════════════════
// §5-C. 이벤트/챌린지 자동 생성 (community_posts: post_type=event)
// ══════════════════════════════════════════════════════════════════════

async function createMonthlyEvent(adminId, stats) {
  const kst = kstNow()
  const month = kst.getMonth() + 1
  const year  = kst.getFullYear()
  const week  = weekOfYear()

  // 이번 달 이벤트 이미 있으면 스킵
  const monthStart = `${year}-${String(month).padStart(2,'0')}-01`
  try {
    const check = await fetch(
      `${SB_URL}/rest/v1/community_posts?post_type=eq.event&created_at=gte.${monthStart}&limit=1&select=id`,
      { headers: H() }
    )
    const existing = await check.json()
    if (Array.isArray(existing) && existing.length > 0) return null
  } catch {}

  const hot = stats.hotKeywords[0] || 'AI'
  const MONTHLY_EVENTS = [
    {
      title: `${year}년 ${month}월 창업 아이디어 챌린지 🚀`,
      body: `Insightship AI가 준비한 ${month}월 창업 아이디어 챌린지입니다!\n\n**주제**: "${hot}" 분야에서 사회 문제를 해결하는 창업 아이디어\n\n**참가 방법**\n1. 아이디어랩에 아이디어 게시\n2. 커뮤니티에 공유\n3. AI 멘토로 피드백 받기\n\n**기간**: ${month}월 내내\n\n참가비 무료, 누구나 참여 가능!`,
      type: 'challenge',
      status: 'upcoming',
      start_date: `${year}-${String(month).padStart(2,'0')}-01`,
      end_date: `${year}-${String(month).padStart(2,'0')}-${new Date(year,month,0).getDate()}`,
      tags: ['챌린지', '아이디어', hot],
      is_featured: true,
    },
    {
      title: `${year}년 ${month}월 Insightship 해커톤 준비 스터디`,
      body: `AI 멘토와 함께하는 ${month}월 해커톤 준비 스터디!\n\n매주 목요일 온라인으로 진행되는 스타트업 스터디입니다.\n\n**주제**\n- 1주차: 아이디어 발굴 방법론\n- 2주차: 린 캔버스 작성 실습\n- 3주차: MVP 설계 및 프로토타입\n- 4주차: 피치 덱 발표 연습\n\nInsightship AI 멘토와 함께 준비하면 더욱 탄탄한 아이디어를 만들 수 있어요!`,
      type: 'event',
      status: 'upcoming',
      start_date: `${year}-${String(month).padStart(2,'0')}-01`,
      end_date: `${year}-${String(month).padStart(2,'0')}-28`,
      tags: ['스터디', '해커톤', '준비'],
      is_featured: false,
    },
  ]

  const evt = MONTHLY_EVENTS[week % 2]
  if (!adminId) return null
  try {
    const r = await fetch(`${SB_URL}/rest/v1/community_posts`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'return=representation' },
      body: JSON.stringify({
        title: evt.title,
        body: evt.body || evt.description,
        tags: evt.tags,
        post_type: 'event',
        author_id: adminId,
        is_pinned: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
      }),
    })
    if (r.status === 201) {
      const created = await r.json()
      return created?.[0]?.id || 'created'
    }
  } catch {}
  return null
}

// ══════════════════════════════════════════════════════════════════════
// §6. 공지 포스트 DB 발행
// ══════════════════════════════════════════════════════════════════════

async function publishCommunityPost(adminId, { title, body, tags, postType='notice' }) {
  if (!adminId) return { error: 'no_admin' }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/community_posts`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'return=representation' },
      body: JSON.stringify({
        title,
        body,
        post_type: postType,
        author_id: adminId,
        tags,
        is_pinned: postType === 'notice',
        created_at: new Date().toISOString(),
      }),
    })
    if (r.status === 201) {
      const d = await r.json()
      return { ok: true, id: d?.[0]?.id }
    }
    const err = await r.text()
    return { error: `${r.status}: ${err.slice(0,80)}` }
  } catch(e) {
    return { error: e.message }
  }
}

// ══════════════════════════════════════════════════════════════════════
// §7. 알림 발송 (신규 공지사항)
// ══════════════════════════════════════════════════════════════════════

async function sendNotifications(title, postId) {
  try {
    // 전체 사용자에게 공지 알림 (최대 100명)
    const ur = await fetch(`${SB_URL}/rest/v1/profiles?is_banned=eq.false&select=id&limit=100`, { headers: H() })
    const users = await ur.json() || []
    if (!users.length) return

    const notifs = users.map(u => ({
      user_id: u.id,
      title: '📢 새 공지사항',
      message: title,
      type: 'notice',
      link: `/community?post=${postId}`,
      created_at: new Date().toISOString(),
    }))

    // 배치 insert (최대 100건)
    await fetch(`${SB_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: { ...H(), Prefer: 'return=minimal' },
      body: JSON.stringify(notifs),
    })
  } catch {}
}

// ══════════════════════════════════════════════════════════════════════
// §8. 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  if (req.method === 'GET') {
    return json({
      status: 'ok',
      engine: 'ARIA-v2',
      agent: 'ARIA (아리아) — 플랫폼 운영 총괄 AI',
      description: 'AI 자율 플랫폼 운영 엔진 — 공지/커뮤니티/이벤트 자동 생성',
      schedule: '매일 00:00 UTC (09:00 KST)',
      tasks: ['daily_notice', 'community_discussion', 'monthly_event', 'platform_monitoring'],
      external_api_cost: 0,
    })
  }

  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === `Bearer ${CRON_SECRET}`
    || req.headers.get('x-cron-secret') === CRON_SECRET
  if (!isAuthed) return json({ error: 'Unauthorized' }, 401)

  if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env' }, 500)

  const kst     = kstNow()
  const dow     = dayOfWeek() // 0=일 ~ 6=토
  const today   = todayKST()
  const adminId = await getAriaId()
  const stats   = await collectPlatformStats()

  const results = {
    date: today,
    day_of_week: dow,
    tasks: {},
    engine: 'ARIA-v2',
    agent: 'ARIA',
    external_api_cost: 0,
  }

  // ── 태스크 A: 일일 공지사항 ─────────────────────────────────────
  const noticeAlreadyDone = await alreadyRanToday('daily_notice')
  if (!noticeAlreadyDone) {
    try {
      const tpl = NOTICE_TEMPLATES[dow] || NOTICE_TEMPLATES[1]
      const notice = tpl(stats, kst)
      const r = await publishCommunityPost(adminId, { ...notice, postType: 'notice' })
      if (r.ok) {
        await sendNotifications(notice.title, r.id)
        await logOperation('daily_notice', 'success', notice.title)
        results.tasks.daily_notice = { ok: true, title: notice.title, post_id: r.id }
      } else {
        await logOperation('daily_notice', 'error', JSON.stringify(r.error))
        results.tasks.daily_notice = { ok: false, error: r.error }
      }
    } catch(e) {
      await logOperation('daily_notice', 'error', e.message)
      results.tasks.daily_notice = { ok: false, error: e.message }
    }
  } else {
    results.tasks.daily_notice = { skipped: true, reason: 'already_ran_today' }
  }

  // ── 태스크 B: 커뮤니티 토론 포스트 (월·수·금만) ─────────────────
  if ([1, 3, 5].includes(dow)) {
    const discussAlreadyDone = await alreadyRanToday('community_discussion')
    if (!discussAlreadyDone) {
      try {
        const idx = (weekOfYear() + dow) % DISCUSSION_TOPICS.length
        const topic = DISCUSSION_TOPICS[idx]
        const r = await publishCommunityPost(adminId, { ...topic, postType: 'question' })
        if (r.ok) {
          await logOperation('community_discussion', 'success', topic.title)
          results.tasks.community_discussion = { ok: true, title: topic.title, post_id: r.id }
        } else {
          results.tasks.community_discussion = { ok: false, error: r.error }
        }
      } catch(e) {
        results.tasks.community_discussion = { ok: false, error: e.message }
      }
    } else {
      results.tasks.community_discussion = { skipped: true, reason: 'already_ran_today' }
    }
  } else {
    results.tasks.community_discussion = { skipped: true, reason: 'not_scheduled_today' }
  }

  // ── 태스크 C: 월별 이벤트 생성 (매달 1일) ───────────────────────
  if (kst.getDate() === 1) {
    try {
      const eventId = await createMonthlyEvent(adminId, stats)
      if (eventId) {
        await logOperation('monthly_event', 'success', `event_id: ${eventId}`)
        results.tasks.monthly_event = { ok: true, event_id: eventId }
      } else {
        results.tasks.monthly_event = { skipped: true, reason: 'already_exists_this_month' }
      }
    } catch(e) {
      results.tasks.monthly_event = { ok: false, error: e.message }
    }
  } else {
    results.tasks.monthly_event = { skipped: true, reason: 'only_on_1st' }
  }

  // ── 태스크 D: 플랫폼 현황 로그 (매일) ───────────────────────────
  await logOperation('platform_monitoring', 'success',
    `news:${stats.weeklyNews.length} posts:${stats.weeklyPosts.length} ideas:${stats.weeklyIdeas} users:+${stats.newUsers}`)
  results.tasks.platform_monitoring = {
    ok: true,
    stats: {
      weekly_news: stats.weeklyNews.length,
      weekly_posts: stats.weeklyPosts.length,
      weekly_ideas: stats.weeklyIdeas,
      new_users: stats.newUsers,
      hot_keywords: stats.hotKeywords,
    },
  }

  return json(results)
}
