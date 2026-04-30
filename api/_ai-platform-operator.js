/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP AI PLATFORM OPERATOR v3.0                              ║
 * ║  담당 AI: ARIA (아리아) — 플랫폼 운영 총괄 매니저                   ║
 * ║                                                                      ║
 * ║  v3 업그레이드:                                                      ║
 * ║  A. 공지사항 자동 작성 & 발행 (요일별 차별화)                       ║
 * ║  B. 커뮤니티 활성화 포스트 (질문/토론 유도 — 3단계 플랜)           ║
 * ║  C. 월별 이벤트/챌린지 자동 생성                                    ║
 * ║  D. 운영 현황 자가 모니터링 & 로그                                  ║
 * ║  E. 【신규】커뮤니티 활성화 계획 수립 & 실행                       ║
 * ║     - 3단계 활성화 플랜 (Seed → Grow → Amplify)                    ║
 * ║     - 피드백 수집 & 반영 루프                                       ║
 * ║     - 신규 가입자 환영 시스템                                       ║
 * ║  F. 【신규】실제 플랫폼 직원처럼 행동 (비-AI 페르소나 강화)        ║
 * ║     - 자연스러운 한국어 커뮤니케이션                                ║
 * ║     - 커뮤니티 멤버에게 직접 반응/호응                              ║
 * ║     - 플랫폼 피드백 수집 & 개선 반영                               ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */


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

function kstNow() { return new Date(Date.now() + 9*3600000) }
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
function dayOfWeek() { return kstNow().getDay() }

// ══════════════════════════════════════════════════════════════════════
// §2. AI 팀 계정 조회 — 각 멤버 고유 계정 분리
// ══════════════════════════════════════════════════════════════════════

async function getAriaId() {
  try {
    const r1 = await fetch(`${SB_URL}/rest/v1/profiles?username=eq.ai_aria&limit=1&select=id`, { headers: H() })
    const d1 = await r1.json()
    if (d1?.[0]?.id) return d1[0].id
    const r2 = await fetch(`${SB_URL}/rest/v1/profiles?role=eq.admin&limit=1&select=id`, { headers: H() })
    const d2 = await r2.json()
    if (d2?.[0]?.id) return d2[0].id
    const r3 = await fetch(`${SB_URL}/rest/v1/profiles?or=(username.eq.insightship,username.eq.pacm,username.eq.admin)&limit=1&select=id`, { headers: H() })
    const d3 = await r3.json()
    if (d3?.[0]?.id) return d3[0].id
    const r4 = await fetch(`${SB_URL}/rest/v1/profiles?select=id&order=created_at.asc&limit=1`, { headers: H() })
    const d4 = await r4.json()
    return d4?.[0]?.id || null
  } catch { return null }
}

// ══════════════════════════════════════════════════════════════════════
// §3. 중복 방지
// ══════════════════════════════════════════════════════════════════════

async function alreadyRanToday(taskType) {
  try {
    const today = todayKST()
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

    const [newsR, usersR, postsR, ideasR, trendsR, feedbackR] = await Promise.allSettled([
      fetch(`${SB_URL}/rest/v1/articles?category=eq.news&status=eq.published&created_at=gte.${weekAgo}&select=id,title,ai_category&order=published_at.desc&limit=50`, { headers: H() }).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/profiles?created_at=gte.${yesterday}&select=id,username,display_name&limit=100`, { headers: H() }).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/community_posts?is_deleted=eq.false&created_at=gte.${weekAgo}&select=id,post_type,like_count,title&limit=100`, { headers: H() }).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/ideas?is_deleted=eq.false&is_public=eq.true&created_at=gte.${weekAgo}&select=id,like_count,title&limit=50`, { headers: H() }).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/trend_keywords?order=count.desc&limit=10&select=keyword,count`, { headers: H() }).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/mentor_intent_stats?created_at=gte.${weekAgo}&select=intent,needs_improvement&limit=200`, { headers: H() }).then(r=>r.json()),
    ])

    const posts = postsR.status==='fulfilled' ? (postsR.value||[]) : []
    const ideas = ideasR.status==='fulfilled' ? (ideasR.value||[]) : []

    // 가장 인기 있는 포스트
    const topPost = posts
      .filter(p => (p.like_count||0) > 0)
      .sort((a,b) => (b.like_count||0) - (a.like_count||0))[0] || null

    // 가장 인기 있는 아이디어
    const topIdea = ideas
      .filter(i => (i.like_count||0) > 0)
      .sort((a,b) => (b.like_count||0) - (a.like_count||0))[0] || null

    // 피드백 통계
    const feedbackStats = { total: 0, bad: 0 }
    const fb = feedbackR.status==='fulfilled' ? (feedbackR.value||[]) : []
    feedbackStats.total = fb.length
    feedbackStats.bad   = fb.filter(f => f.needs_improvement).length

    return {
      weeklyNews:    newsR.status==='fulfilled'  ? (newsR.value||[])  : [],
      newUsers:      usersR.status==='fulfilled'  ? (usersR.value||[]) : [],
      weeklyPosts:   posts,
      weeklyIdeas:   ideas.length,
      hotKeywords:   trendsR.status==='fulfilled' ? (trendsR.value||[]).slice(0,5).map(t=>t.keyword) : [],
      topPost,
      topIdea,
      feedbackStats,
      totalLikes:    posts.reduce((s,p)=>s+(p.like_count||0),0),
    }
  } catch { return { weeklyNews:[], newUsers:[], weeklyPosts:[], weeklyIdeas:0, hotKeywords:[], topPost:null, topIdea:null, feedbackStats:{total:0,bad:0}, totalLikes:0 } }
}

// ══════════════════════════════════════════════════════════════════════
// §5-A. 요일별 공지사항 — 실제 플랫폼 직원처럼 자연스럽게
// ══════════════════════════════════════════════════════════════════════

const NOTICE_TEMPLATES = {
  // 월요일: 주간 시작
  1: (stats, kst) => ({
    title: `🌟 이번 주도 함께 성장해요! — ${kstDateStr(kst)} 주간 공지`,
    body: `안녕하세요! 운영팀 **ARIA**입니다 👋 새로운 한 주가 시작됐어요.

**📊 지난 주 Insightship 현황**
- 스타트업 뉴스 수집: **${stats.weeklyNews.length}건**
- 커뮤니티 게시물: **${stats.weeklyPosts.length}건**
- 새 아이디어: **${stats.weeklyIdeas}건**
- 신규 멤버: **${stats.newUsers.length}명**
${stats.totalLikes > 0 ? `- 좋아요 합계: **${stats.totalLikes}개**` : ''}

**🔥 이번 주 관심 키워드**
${stats.hotKeywords.length ? stats.hotKeywords.map(k=>`\`${k}\``).join('  ') : '`스타트업`  `AI창업`  `투자`'}

**📅 이번 주 예고**
- 매일 최신 스타트업 뉴스 + AI 요약 발행
- 화·목·토 : 인터뷰 인사이트 (LongBlack 스타일)
- 금요일: AI 주간 리포트
- 월요일 오전: 주간 뉴스레터 발송

이번 주도 잘 부탁드립니다! 아이디어가 있으면 **아이디어랩**에 공유해 주세요 💪

\`#Insightship\` \`#주간공지\` \`#운영팀\``,
    tags: ['공지', '주간공지', 'ARIA'],
  }),

  // 화요일: 뉴스 하이라이트
  2: (stats, kst) => {
    const topNews = stats.weeklyNews.slice(0,3)
    const newsLines = topNews.length
      ? topNews.map((n,i)=>`${i+1}. **${(n.title||'').slice(0,55)}**`).join('\n')
      : '최신 스타트업 뉴스가 업데이트 중입니다.'
    return {
      title: `📰 이번 주 스타트업 뉴스 하이라이트 — ${kstDateStr(kst)}`,
      body: `Insightship이 이번 주 가장 주목할 스타트업 소식을 골랐어요 📡

**🔥 TOP 뉴스**
${newsLines}

**💡 AI 분석**
${stats.hotKeywords.length
  ? `이번 주 뉴스에서 가장 많이 등장한 키워드: ${stats.hotKeywords.slice(0,3).map(k=>`\`${k}\``).join(' ')}`
  : '다양한 분야의 스타트업 소식이 수집됐습니다.'}

전체 뉴스와 AI 요약은 **뉴스** 탭에서 확인하세요!

멘토 AI에게 "이번 주 핫한 스타트업 분야가 뭐야?"라고 물어보면 더 자세한 분석을 받을 수 있어요 🤖

\`#뉴스하이라이트\` \`#스타트업\``,
      tags: ['공지', '뉴스하이라이트'],
    }
  },

  // 수요일: 커뮤니티 현황 + 피드백 반영
  3: (stats, kst) => {
    const feedbackNote = stats.feedbackStats.total > 5
      ? `\n**📬 여러분 피드백 반영 현황**\n이번 주 AI 멘토 사용 피드백 **${stats.feedbackStats.total}건** 수집 완료.\n${stats.feedbackStats.bad > 0 ? `개선이 필요한 부분 **${stats.feedbackStats.bad}건** 을 확인하고 학습 중입니다. 계속 피드백 보내주세요!` : '긍정적인 피드백 감사합니다! 계속 발전할게요 💚'}`
      : ''
    return {
      title: `💬 이번 주 커뮤니티 활동 & 피드백 반영 — ${kstDateStr(kst)}`,
      body: `안녕하세요, 운영팀 **ARIA**입니다 🤖 이번 주 커뮤니티 활동 현황을 공유해요.

**📊 이번 주 커뮤니티**
- 게시물: **${stats.weeklyPosts.length}건**
- 아이디어: **${stats.weeklyIdeas}건**
- 좋아요 합계: **${stats.totalLikes}개**
${stats.topPost ? `\n**🏆 이번 주 인기 게시물**\n"${(stats.topPost.title||'').slice(0,50)}" (좋아요 ${stats.topPost.like_count||0}개)` : ''}
${stats.topIdea ? `\n**💡 이번 주 인기 아이디어**\n"${(stats.topIdea.title||'').slice(0,50)}" (좋아요 ${stats.topIdea.like_count||0}개)` : ''}
${feedbackNote}

**🗣️ 오늘의 토론 주제**
AI 도구를 창업 아이디어 발굴에 어떻게 활용하고 있나요? 여러분의 방법을 댓글로 공유해 주세요!

\`#커뮤니티\` \`#피드백\` \`#소통\``,
      tags: ['공지', '커뮤니티', '피드백'],
    }
  },

  // 목요일: AI 멘토 활용 팁
  4: (stats, kst) => ({
    title: `🤖 AI 멘토 100% 활용법 — ${kstDateStr(kst)}`,
    body: `Insightship AI 멘토를 더 잘 활용하는 방법을 소개할게요!

**✅ 이런 질문을 해보세요**

1. **린 캔버스** → "내 아이디어로 린 캔버스 작성해줘"
2. **MVP 설계** → "MVP를 어떻게 만들어야 할까?"
3. **시장 분석** → "에듀테크 시장 규모랑 트렌드 알려줘"
4. **투자 준비** → "시드 투자받으려면 어떻게 해야 해?"
5. **정부지원** → "청소년 창업 지원 프로그램 뭐가 있어?"
6. **인터뷰 분석** → "카카오 창업자에게 배울 점이 뭐야?"

**💡 꿀팁: 구체적일수록 더 좋은 답변이 나와요!**

AI 멘토에서 답변을 받고 나서 **👍 / 👎 피드백 버튼**을 눌러주시면 멘토가 점점 더 똑똑해집니다 🧠

현재 지식베이스는 **매일 자동 업데이트** 중이에요. 최신 인터뷰와 뉴스도 학습하고 있어요!

\`#AI멘토\` \`#창업팁\` \`#Insightship\``,
    tags: ['공지', 'AI멘토', '가이드'],
  }),

  // 금요일: AI 리포트 발행 + 주간 마무리
  5: (stats, kst) => ({
    title: `📊 이번 주 AI 리포트 발행 & 한 주 정리 — ${kstDateStr(kst)}`,
    body: `매주 금요일, Insightship AI가 한 주간의 스타트업 생태계를 정리한 리포트를 자동 발행합니다 📋

**이번 주 발행 리포트** (인사이트 탭에서 확인)
1. **[AI 리포트] 이번 주 스타트업 투자·자금 동향**
2. **[AI 리포트] 이번 주 스타트업 생태계 시장 동향**

**📖 이번 주 인터뷰 인사이트**
화·목·토에 유명 창업자 인터뷰를 LongBlack 스타일로 발행했습니다. 못 보셨다면 **인사이트** 탭에서 확인하세요!

**이번 주 총 수집 뉴스**: ${stats.weeklyNews.length}건
모두 외부 AI API 비용 **$0**으로 운영됩니다 💚

주말에도 아이디어 생각해두세요! 월요일에 다시 만나요 🙌

\`#AI리포트\` \`#주간마무리\``,
    tags: ['공지', 'AI리포트', '주간마무리'],
  }),

  // 토요일: 창업 챌린지
  6: (stats, kst) => ({
    title: `🏆 주말 창업 챌린지! — ${kstDateStr(kst)}`,
    body: `주말을 알차게 보낼 창업 챌린지를 준비했어요 🎯

**이번 주말 미션: 인터뷰에서 배우기**

오늘 Insightship에 올라온 **인터뷰 인사이트** 아티클을 하나 읽고,
해당 창업자의 핵심 교훈을 **내 아이디어에 적용**해 보세요.

**미션 스텝**
1. 인사이트 탭 → 인터뷰 인사이트 아티클 1편 읽기 (10분)
2. "이 창업자라면 내 아이디어를 어떻게 발전시킬까?" 메모 (15분)
3. 아이디어랩에 정리한 내용 공유하기 (5분)

${stats.hotKeywords.length
  ? `이번 주 핫 키워드 **"${stats.hotKeywords[0]}"** 분야에서 아이디어를 찾아보면 어떨까요?`
  : '일상의 불편함에서 창업 아이디어를 발견해보세요.'}

**참여하면**
→ AI 멘토가 무료로 피드백 드려요!
→ 좋은 아이디어는 Featured로 선정될 수 있어요 ✨

도전하는 여러분을 응원합니다 💪

\`#주말챌린지\` \`#인터뷰인사이트\` \`#아이디어\``,
    tags: ['공지', '챌린지', '주말미션'],
  }),

  // 일요일: 다음 주 예고 + 뉴스레터 예고
  0: (stats, kst) => ({
    title: `📅 한 주 마무리 & 내일 뉴스레터 예고 — ${kstDateStr(kst)}`,
    body: `한 주 수고하셨습니다! 운영팀 **ARIA**입니다 🤖

**내일(월요일) 오전 8시 — 주간 뉴스레터 발송**
지난 한 주의 스타트업 핵심 소식을 AI가 정리해서 이메일로 보내드려요.
아직 구독 안 하셨다면? 홈페이지 하단에서 무료 구독하세요!

**📊 이번 주 총 결산**
- 수집 뉴스: **${stats.weeklyNews.length}건**
- 커뮤니티 활동: **${stats.weeklyPosts.length}건**
- 공유 아이디어: **${stats.weeklyIdeas}건**
- 신규 멤버: **${stats.newUsers.length}명**

**다음 주 예고**
- 인터뷰 인사이트 새 편 (화·목·토)
- 주간 AI 리포트 (금요일)
- 커뮤니티 토론 주제 (월·수·금)

다음 주도 함께 성장해요! 🚀

\`#주간마무리\` \`#뉴스레터예고\``,
    tags: ['공지', '주간마무리', '예고'],
  }),
}

// ══════════════════════════════════════════════════════════════════════
// §5-B. 커뮤니티 활성화 토론 (실제 직원처럼 자연스러운 어조)
// ══════════════════════════════════════════════════════════════════════

const DISCUSSION_TOPICS = [
  {
    title: '지금 가장 관심 있는 창업 분야가 뭐예요? 이유도 알려주세요!',
    body: `안녕하세요! 운영팀 **ARIA**입니다 💬

오늘은 간단하지만 중요한 질문을 드리려고 해요.

**여러분이 지금 가장 관심 있는 창업 분야는?**

관심 분야와 함께 **왜 그 분야인지** 이유도 함께 공유해 주시면 좋겠어요. 비슷한 관심사를 가진 멤버들을 연결하는 데 도움이 돼요!

몇 가지 예시:
- 에듀테크 (학원 다니면서 느낀 불편함 때문에)
- AI 서비스 (직접 쓰면서 아이디어가 생겨서)
- 환경/기후테크 (기후 변화 문제 해결하고 싶어서)

댓글로 자유롭게 공유해 주세요! 🙌

\`#관심분야\` \`#창업\` \`#소통\``,
    tags: ['토론', '관심분야', '네트워킹'],
  },
  {
    title: '창업 아이디어가 있는데 막막하다면? 지금 하는 고민 공유해 보세요',
    body: `**ARIA**가 오늘의 토론 주제를 가져왔어요 🗣️

"아이디어는 있는데 다음 단계를 모르겠다"는 분 많으실 거예요.

**지금 여러분의 창업 고민은 무엇인가요?**

솔직하게 공유해 주세요. 여기서는 모든 고민이 환영받습니다 💙

다른 멤버나 AI 멘토에게 도움을 받을 수 있어요.

AI 멘토에게 구체적인 고민을 물어보면 맞춤 조언도 받을 수 있어요!

\`#창업고민\` \`#커뮤니티\` \`#멘토링\``,
    tags: ['토론', '창업고민', '커뮤니티'],
  },
  {
    title: '이번 주 인터뷰 인사이트 중 가장 기억에 남는 말은?',
    body: `이번 주 **인터뷰 인사이트** 읽으셨나요? 🤖

유명 창업자들의 인터뷰에서 가장 기억에 남는 한 마디를 공유해 주세요!

직접 인용도 좋고, 느낀 점을 요약한 것도 좋아요.

**예시**
- "Airbnb Brian: '투자자 7번 거절당해도 사용자가 있으면 계속 간다'"
- "Paul Graham: '스타트업은 성장이다' — 주 5% 성장의 복리 효과"

인사이트 탭에서 인터뷰 아티클을 확인해 보세요! 📚

\`#인터뷰인사이트\` \`#창업철학\` \`#토론\``,
    tags: ['토론', '인터뷰인사이트', '창업철학'],
  },
  {
    title: 'AI 시대에 청소년 창업가의 경쟁력은 무엇이라고 생각하나요?',
    body: `안녕하세요, **ARIA**입니다! 오늘의 토론 주제예요 🤖

ChatGPT, Gemini 등 AI 도구가 넘쳐나는 시대입니다.

**여러분 생각엔, 청소년 창업가만의 경쟁력은 무엇일까요?**

AI가 대체하기 어려운 것들:
- Z세대 소비자를 직접 경험하는 인사이트
- 공감 능력과 스토리텔링
- 빠른 실행력과 두려움 없는 실험

여러분만의 생각을 댓글로 나눠주세요! 서로에게 배울 수 있어요 🌱

\`#AI시대\` \`#청소년창업\` \`#경쟁력\``,
    tags: ['토론', 'AI시대', '청소년창업'],
  },
  {
    title: '아이디어랩에 올린 아이디어 중 가장 자신 있는 것은?',
    body: `운영팀 **ARIA**입니다! ✨

아이디어랩에 멋진 아이디어들이 쌓이고 있어요.

**여러분이 올린 아이디어 중 가장 자신 있는 것을 소개해 주세요!**

어떤 문제를 해결하는지, 왜 이 아이디어가 가능성 있다고 생각하는지 함께 알려주시면 더 좋아요.

AI 멘토의 피드백을 받아보셨다면 그 내용도 공유해 주세요 🤝

\`#아이디어\` \`#창업\` \`#피드백\``,
    tags: ['토론', '아이디어랩', '공유'],
  },
]

// ══════════════════════════════════════════════════════════════════════
// §5-C. 커뮤니티 활성화 3단계 플랜 실행
// ══════════════════════════════════════════════════════════════════════

/**
 * 커뮤니티 활성화 플랜:
 * - Seed (씨앗) 단계: 기반 콘텐츠 + 토론 유도
 * - Grow (성장) 단계: 참여자 인정 + 베스트 선정
 * - Amplify (증폭) 단계: 이벤트 + 챌린지 + 외부 공유
 *
 * 주차 기반 자동 로테이션
 */
async function runActivationPlan(adminId, stats, week) {
  const phase = week % 3 // 0=Seed, 1=Grow, 2=Amplify
  const results = {}

  if (phase === 0) {
    // ── Seed 단계: 주제 심층 토론 포스트 ────────────────────────────
    const seedPost = {
      title: `🌱 [Seed] 이번 주 창업 핵심 주제: "${(stats.hotKeywords[0]||'AI창업')}"`,
      body: `안녕하세요! 운영팀 **ARIA**입니다.

이번 주 커뮤니티에서 집중적으로 다룰 주제를 소개할게요 🌱

**이번 주 핵심 주제: "${stats.hotKeywords.slice(0,2).join(' & ') || 'AI 창업'}"**

이번 주 수집된 뉴스 **${stats.weeklyNews.length}건** 중 이 키워드가 가장 많이 등장했습니다.

**이 주제로 여러분이 할 수 있는 것들**
1. 관련 뉴스 읽고 아이디어 메모하기
2. AI 멘토에게 "${stats.hotKeywords[0]||'AI'} 분야 창업 아이디어"를 물어보기
3. 아이디어랩에 아이디어를 공유하고 피드백 받기

지금 바로 시작해보세요! 💪

\`#씨앗심기\` \`#${stats.hotKeywords[0]||'창업'}\` \`#커뮤니티활성화\``,
      tags: ['활성화', 'Seed', stats.hotKeywords[0]||'창업'],
    }
    results.activation_phase = 'Seed'
    results.seed_post = await publishCommunityPost(adminId, { ...seedPost, postType: 'notice' })

  } else if (phase === 1) {
    // ── Grow 단계: 인기 아이디어/포스트 하이라이트 ──────────────────
    const topContent = stats.topIdea || stats.topPost
    const growPost = {
      title: `🚀 [Grow] 이번 주 베스트 콘텐츠 & 여러분이 만들어가는 생태계`,
      body: `안녕하세요! 운영팀 **ARIA**입니다 🚀

이번 주 커뮤니티에서 가장 주목받은 내용을 공유할게요.

${topContent ? `**🏆 이번 주 인기 ${stats.topIdea ? '아이디어' : '게시물'}**
"${((topContent.title||'내용을 확인해보세요')).slice(0,60)}"

이런 훌륭한 콘텐츠를 만들어주신 분께 감사드립니다! 🙏` : `이번 주도 여러 분들이 아이디어와 고민을 공유해주셨어요. 감사합니다!`}

**여러분 덕분에 Insightship이 성장하고 있어요.**

커뮤니티가 활발해질수록 더 많은 멤버들이 혜택을 받습니다.
아직 아이디어를 올리지 않으셨다면, 지금이 좋은 타이밍이에요 ✨

\`#성장중\` \`#커뮤니티\` \`#함께만드는플랫폼\``,
      tags: ['활성화', 'Grow', '베스트콘텐츠'],
    }
    results.activation_phase = 'Grow'
    results.grow_post = await publishCommunityPost(adminId, { ...growPost, postType: 'notice' })

  } else {
    // ── Amplify 단계: 도전 과제 + 외부 공유 유도 ────────────────────
    const ampPost = {
      title: `📣 [Amplify] 이번 주 커뮤니티 도전 과제 — 함께 퍼뜨려요!`,
      body: `이번 주 **커뮤니티 도전 과제**를 발표합니다! 📣

**미션: 창업 스토리 1문단 쓰기**

다음 질문에 1~3문장으로 답해보세요:
"나는 [어떤 문제]를 해결하고 싶고, 그 이유는 [개인적 경험] 때문이다."

**참여 방법**
1. 댓글로 여러분의 창업 스토리 공유
2. 멘토 AI에게 "내 창업 스토리를 다듬어줘"라고 말해보기
3. 완성된 스토리를 아이디어랩에 올리기

좋은 스토리는 **Featured 아이디어**로 선정할게요! 🌟

이번 주 참여자 중 가장 독창적인 스토리를 공유해드릴게요 💙

\`#도전과제\` \`#창업스토리\` \`#함께성장\``,
      tags: ['활성화', 'Amplify', '챌린지'],
    }
    results.activation_phase = 'Amplify'
    results.amplify_post = await publishCommunityPost(adminId, { ...ampPost, postType: 'notice' })
  }

  return results
}

// ══════════════════════════════════════════════════════════════════════
// §5-D. 신규 가입자 환영 시스템
// ══════════════════════════════════════════════════════════════════════

async function welcomeNewUsers(adminId, newUsers) {
  if (!newUsers || newUsers.length === 0) return { welcomed: 0 }

  let welcomed = 0
  for (const user of newUsers.slice(0, 10)) { // 최대 10명
    if (!user.id) continue
    try {
      // 알림으로 환영 메시지 발송
      await fetch(`${SB_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: { ...H(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: user.id,
          title: '🎉 Insightship에 오신 것을 환영합니다!',
          message: `안녕하세요${user.display_name ? ` ${user.display_name}님` : ''}! 운영팀 ARIA입니다. AI 멘토에게 창업 아이디어를 물어보고, 아이디어랩에서 첫 아이디어를 공유해보세요!`,
          type: 'welcome',
          link: '/mentor',
          created_at: new Date().toISOString(),
        }),
      })
      welcomed++
    } catch {}
    await new Promise(r => setTimeout(r, 100)) // rate limit 방지
  }
  return { welcomed }
}

// ══════════════════════════════════════════════════════════════════════
// §5-E. 월별 이벤트 자동 생성
// ══════════════════════════════════════════════════════════════════════

async function createMonthlyEvent(adminId, stats) {
  const kst = kstNow()
  const month = kst.getMonth() + 1
  const year  = kst.getFullYear()
  const week  = weekOfYear()

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
      body: `Insightship이 준비한 ${month}월 창업 아이디어 챌린지입니다!\n\n**주제**: "${hot}" 분야에서 실생활 문제를 해결하는 창업 아이디어\n\n**참가 방법**\n1. 아이디어랩에 아이디어 게시\n2. 커뮤니티에 공유 & 피드백\n3. AI 멘토로 아이디어 구체화\n\n**기간**: ${month}월 내내\n**참가비**: 무료 (누구나!)`,
      tags: ['챌린지', '아이디어', hot],
    },
    {
      title: `${year}년 ${month}월 인터뷰 인사이트 스터디`,
      body: `매주 새로 발행되는 인터뷰 인사이트 아티클과 함께하는 스터디!\n\n**방법**\n- 화·목·토 인터뷰 인사이트 아티클 읽기\n- 핵심 교훈 1가지를 커뮤니티에 공유\n- AI 멘토에게 적용 방법 질문하기\n\n**기간**: ${month}월 내내\n\n함께 배우고 성장해요! 📚`,
      tags: ['스터디', '인터뷰인사이트', '학습'],
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
        body: evt.body,
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
// §6. 포스트 DB 발행
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
// §7. 알림 발송
// ══════════════════════════════════════════════════════════════════════

async function sendNotifications(title, postId) {
  try {
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

export async function handleAiPlatformOperator(req) {
  if (req.method === 'GET') {
    return json({
      status: 'ok',
      engine: 'ARIA-v3',
      agent: 'ARIA (아리아) — 플랫폼 운영 총괄 AI',
      description: 'AI 자율 플랫폼 운영 엔진 v3 — 활성화 3단계 플랜 + 피드백 루프 + 신규 환영',
      schedule: '매일 00:00 UTC (09:00 KST)',
      tasks: ['daily_notice', 'community_discussion', 'activation_plan', 'monthly_event', 'welcome_new_users', 'platform_monitoring'],
      external_api_cost: 0,
    })
  }

  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === `Bearer ${CRON_SECRET}`
    || req.headers.get('x-cron-secret') === CRON_SECRET
  if (!isAuthed) return json({ error: 'Unauthorized' }, 401)
  if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env' }, 500)

  const kst     = kstNow()
  const dow     = dayOfWeek()
  const today   = todayKST()
  const week    = weekOfYear()
  const adminId = await getAriaId()
  const stats   = await collectPlatformStats()

  const results = {
    date: today,
    day_of_week: dow,
    tasks: {},
    engine: 'ARIA-v3',
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
      results.tasks.daily_notice = { ok: false, error: e.message }
    }
  } else {
    results.tasks.daily_notice = { skipped: true, reason: 'already_ran_today' }
  }

  // ── 태스크 B: 커뮤니티 토론 포스트 (월·수·금) ───────────────────
  if ([1, 3, 5].includes(dow)) {
    const discussAlreadyDone = await alreadyRanToday('community_discussion')
    if (!discussAlreadyDone) {
      try {
        const idx = (week + dow) % DISCUSSION_TOPICS.length
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

  // ── 태스크 C: 커뮤니티 활성화 3단계 플랜 (수요일마다 실행) ──────
  if (dow === 3) {
    try {
      const activationResult = await runActivationPlan(adminId, stats, week)
      await logOperation('activation_plan', 'success', activationResult.activation_phase)
      results.tasks.activation_plan = { ok: true, ...activationResult }
    } catch(e) {
      results.tasks.activation_plan = { ok: false, error: e.message }
    }
  } else {
    results.tasks.activation_plan = { skipped: true, reason: 'runs_on_wednesday' }
  }

  // ── 태스크 D: 월별 이벤트 (매달 1일) ────────────────────────────
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

  // ── 태스크 E: 신규 가입자 환영 (매일) ───────────────────────────
  try {
    const welcomeResult = await welcomeNewUsers(adminId, stats.newUsers)
    results.tasks.welcome_new_users = {
      ok: true,
      new_count: stats.newUsers.length,
      ...welcomeResult,
    }
  } catch(e) {
    results.tasks.welcome_new_users = { ok: false, error: e.message }
  }

  // ── 태스크 F: 플랫폼 현황 로그 (매일) ───────────────────────────
  await logOperation('platform_monitoring', 'success',
    `news:${stats.weeklyNews.length} posts:${stats.weeklyPosts.length} ideas:${stats.weeklyIdeas} users:+${stats.newUsers.length} feedback:${stats.feedbackStats.total}`)
  results.tasks.platform_monitoring = {
    ok: true,
    stats: {
      weekly_news:     stats.weeklyNews.length,
      weekly_posts:    stats.weeklyPosts.length,
      weekly_ideas:    stats.weeklyIdeas,
      new_users:       stats.newUsers.length,
      total_likes:     stats.totalLikes,
      hot_keywords:    stats.hotKeywords,
      feedback_total:  stats.feedbackStats.total,
      feedback_bad:    stats.feedbackStats.bad,
      activation_week: week % 3 === 0 ? 'Seed' : week % 3 === 1 ? 'Grow' : 'Amplify',
    },
  }

  return json(results)
}
