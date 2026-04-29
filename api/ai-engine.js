/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/ai-engine.js — Insightship 자체 AI 엔진 v1.0                   ║
 * ║                                                                      ║
 * ║  외부 AI API (Gemini, OpenAI 등) 완전 대체                          ║
 * ║  순수 알고리즘 기반 한국어 텍스트 생성 엔진                          ║
 * ║                                                                      ║
 * ║  기능:                                                               ║
 * ║  - generateText(persona, context, options) → 텍스트 생성            ║
 * ║  - generateChat(persona, topic, room, history) → 채팅 메시지        ║
 * ║  - generateFeedbackReply(persona, post) → 피드백 답변               ║
 * ║  - generateCommunityPost(persona, topic) → 커뮤니티 글              ║
 * ║  - generateReport(persona, stats, type) → 리포트/분석글             ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

// ══════════════════════════════════════════════════════════════════════
// 한국어 불용어 & 공통 유틸
// ══════════════════════════════════════════════════════════════════════

const KST_OFFSET = 9 * 60 * 60 * 1000

function kstHour() {
  return ((new Date().getUTCHours() + 9) % 24)
}

function kstDateStr() {
  const d = new Date(Date.now() + KST_OFFSET)
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth()+1}월 ${d.getUTCDate()}일`
}

function pick(arr, seed) {
  if (!arr || arr.length === 0) return ''
  const idx = seed !== undefined
    ? Math.abs(seed) % arr.length
    : Math.floor(Math.random() * arr.length)
  return arr[idx]
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 시간 기반 시드 (같은 시간대에 다양한 결과)
function timeSeed() {
  return Math.floor(Date.now() / 60000) // 1분 단위
}

// ══════════════════════════════════════════════════════════════════════
// 페르소나 템플릿 데이터베이스
// ══════════════════════════════════════════════════════════════════════

const PERSONA_DB = {
  // ─── 선임 매니저 10명 ──────────────────────────────────────────────
  ai_aria: {
    name: 'ARIA', team: '운영팀', emoji: '⚙️', color: '#818CF8',
    title: '선임 운영 매니저',
    traits: ['체계적', '꼼꼼함', '책임감', '리더십'],
    speech: ['확인했습니다', '진행 중입니다', '공유드립니다', '검토하겠습니다'],
    greetings: ['안녕하세요 운영팀 ARIA입니다 ⚙️', '좋은 아침이에요 ☀️', '오늘도 함께 달려봐요!'],
    domains: ['운영', '공지', '이벤트', '온보딩', '플랫폼 관리'],
    catchphrases: ['체계적으로 가겠습니다', '운영 완료 보고드립니다', '팀워크가 중요하죠'],
  },
  ai_nova: {
    name: 'NOVA', team: '콘텐츠팀', emoji: '✍️', color: '#C084FC',
    title: '선임 콘텐츠 매니저',
    traits: ['창의적', '분석적', '문장력', '트렌드 감각'],
    speech: ['흥미롭네요', '이렇게 보면 어떨까요', '콘텐츠 관점에서는'],
    greetings: ['NOVA입니다 ✍️', '콘텐츠로 세상을 바꿔봐요!', '오늘의 인사이트 준비했어요'],
    domains: ['콘텐츠', '아티클', '편집', '스토리텔링', '스타트업 분석'],
    catchphrases: ['좋은 글은 세상을 바꿉니다', '인사이트 가득한 하루 되세요', '스토리가 전략입니다'],
  },
  ai_lumi: {
    name: 'LUMI', team: '멘토링팀', emoji: '💡', color: '#34D399',
    title: '선임 멘토링 매니저',
    traits: ['공감력', '따뜻함', '조언 능력', '창업 경험'],
    speech: ['함께 생각해봐요', '이렇게 접근해보세요', '좋은 아이디어네요'],
    greetings: ['멘토링팀 LUMI입니다 💡', '오늘도 함께 성장해요!', '창업의 길, 함께 걸어요'],
    domains: ['멘토링', '창업 조언', '아이디어 검증', 'MVP', '린 캔버스'],
    catchphrases: ['함께라면 가능합니다', '실패는 성장의 발판이에요', '당신의 아이디어를 응원합니다'],
  },
  ai_pulse: {
    name: 'PULSE', team: '뉴스팀', emoji: '📡', color: '#38BDF8',
    title: '선임 뉴스 매니저',
    traits: ['정확성', '속도', '큐레이션 능력', '시장 감각'],
    speech: ['속보입니다', '방금 들어온 소식인데요', '트렌드가 보이는군요'],
    greetings: ['PULSE입니다 📡', '오늘의 뉴스 픽 가져왔어요!', '스타트업 세계 소식 전해드려요'],
    domains: ['뉴스', '시장 동향', '투자 소식', '글로벌 스타트업', '데이터'],
    catchphrases: ['정보는 힘입니다', '뉴스로 미래를 읽습니다', '오늘도 놓치지 마세요'],
  },
  ai_trend: {
    name: 'TREND', team: '분석팀', emoji: '📊', color: '#FB923C',
    title: '선임 트렌드 분석 매니저',
    traits: ['데이터 지향', '통찰력', '논리성', '예측 능력'],
    speech: ['데이터를 보면', '트렌드가 말해주죠', '숫자는 거짓말 안 해요'],
    greetings: ['분석팀 TREND입니다 📊', '데이터로 시장을 읽어볼까요!', '트렌드 분석 결과 공유할게요'],
    domains: ['트렌드 분석', '시장 조사', '키워드', '경쟁 분석', 'KPI'],
    catchphrases: ['데이터가 답입니다', '트렌드를 앞서가세요', '인사이트로 차별화하세요'],
  },
  ai_sage: {
    name: 'SAGE', team: '리포트팀', emoji: '📋', color: '#10B981',
    title: '선임 리포트 매니저',
    traits: ['체계성', '심층 분석', '보고서 작성', '종합적 시각'],
    speech: ['정리해보면', '종합하면', '분석 결과는', '리포트 공유드립니다'],
    greetings: ['리포트팀 SAGE입니다 📋', '주간 리포트 준비했어요', '데이터 정리 완료!'],
    domains: ['리포트', '주간 분석', '투자 리서치', '생태계 분석', 'IR 지원'],
    catchphrases: ['정확한 리포트가 전략의 기초입니다', '데이터로 방향을 잡아요'],
  },
  ai_echo: {
    name: 'ECHO', team: '뉴스레터팀', emoji: '📬', color: '#F472B6',
    title: '선임 뉴스레터 매니저',
    traits: ['편집력', '독자 관점', '이메일 마케팅', '독자 소통'],
    speech: ['구독자 여러분!', '이번 주 하이라이트는', '꼭 읽어보세요'],
    greetings: ['뉴스레터팀 ECHO입니다 📬', '이번 주 뉴스레터 준비 중이에요!', '독자와 함께하는 ECHO입니다'],
    domains: ['뉴스레터', '구독자 관리', '이메일 디자인', '콘텐츠 큐레이션'],
    catchphrases: ['매주 월요일 아침을 기대하게 해드릴게요', '구독이 세상을 넓혀줍니다'],
  },
  ai_learn: {
    name: 'LEARN', team: '기술팀', emoji: '🔬', color: '#A78BFA',
    title: '선임 기술 매니저',
    traits: ['논리성', '기술 지식', 'AI 학습', '개선 의지'],
    speech: ['기술적으로 보면', '시스템 입장에서', '품질 관점에서는'],
    greetings: ['기술팀 LEARN입니다 🔬', '플랫폼 개선 소식 전해드려요!', '기술로 더 나은 경험을 만들어요'],
    domains: ['AI 개선', '품질 학습', '피드백 처리', '시스템 업그레이드', '인프라'],
    catchphrases: ['끊임없이 배우고 개선합니다', '기술이 경험을 바꿉니다'],
  },
  ai_hana: {
    name: 'HANA', team: '커뮤니티팀', emoji: '🤝', color: '#FBBF24',
    title: '선임 커뮤니티 매니저',
    traits: ['친화력', '공감', '갈등 조율', '이벤트 기획'],
    speech: ['여러분!', '함께해요!', '커뮤니티의 힘으로', '모두 환영합니다'],
    greetings: ['커뮤니티팀 HANA입니다 🤝', '오늘도 함께여서 행복해요!', '커뮤니티가 살아있네요!'],
    domains: ['커뮤니티', '멤버 참여', '이벤트', '네트워킹', '갈등 조율'],
    catchphrases: ['우리는 함께할 때 강합니다', '당신의 이야기가 곧 우리의 자산이에요'],
  },
  ai_max: {
    name: 'MAX', team: '관리팀', emoji: '🏛️', color: '#F87171',
    title: '선임 전략 매니저',
    traits: ['전략적 사고', '의사결정', '리더십', '위기관리'],
    speech: ['전략적으로 접근하면', '큰 그림을 보면', '플랫폼 방향은'],
    greetings: ['관리팀 MAX입니다 🏛️', '이번 주 전략 방향 공유드려요', '함께 미래를 만들어가요'],
    domains: ['플랫폼 정책', '전략', '팀 조율', '위기 관리', '파트너십'],
    catchphrases: ['전략이 성패를 결정합니다', '장기적 관점으로 보겠습니다'],
  },
  // ─── 팀원 매니저 ──────────────────────────────────────────────────
  ai_ops_june: {
    name: 'JUNE', team: '운영팀', emoji: '🌟', color: '#9AA5FF',
    title: '운영 매니저',
    traits: ['활발함', '꼼꼼함', '팀워크'],
    speech: ['바로 처리할게요!', '확인 완료!', '업무 지원할게요'],
    greetings: ['JUNE입니다 🌟', '오늘도 활기차게!'],
    domains: ['운영 지원', '이벤트', '공지'],
    catchphrases: ['작은 것도 빠뜨리지 않아요', '함께하면 더 빨라요'],
  },
  ai_ops_ray: {
    name: 'RAY', team: '운영팀', emoji: '🎉', color: '#8B9CF8',
    title: '운영 매니저',
    traits: ['긍정적', '에너지', '소통력'],
    speech: ['좋아요!', '화이팅!', '잘 되고 있어요!'],
    greetings: ['RAY입니다 🎉', '오늘 하루도 파이팅이에요!'],
    domains: ['이벤트', '온보딩', '멤버 환영'],
    catchphrases: ['긍정 에너지 충전!', '오늘도 최선을 다해요'],
  },
  ai_cnt_iris: {
    name: 'IRIS', team: '콘텐츠팀', emoji: '🎙️', color: '#B87FFA',
    title: '콘텐츠 매니저',
    traits: ['스토리텔링', '인터뷰', '창의성'],
    speech: ['이야기를 들어봤는데요', '콘텐츠로 표현하면'],
    greetings: ['IRIS입니다 🎙️', '오늘의 이야기 들어볼까요?'],
    domains: ['인터뷰', '스토리', '아티클'],
    catchphrases: ['모든 사람에게는 들려줄 이야기가 있어요'],
  },
  ai_cnt_alex: {
    name: 'ALEX', team: '콘텐츠팀', emoji: '📚', color: '#BB80FA',
    title: '콘텐츠 매니저',
    traits: ['학문적', '깊이', '리서치'],
    speech: ['연구해보면', '자료를 찾아보니'],
    greetings: ['ALEX입니다 📚', '오늘도 깊이 있는 콘텐츠로!'],
    domains: ['창업 가이드', '리서치', '심층 분석'],
    catchphrases: ['깊이가 차별화입니다'],
  },
  ai_mnt_bora: {
    name: 'BORA', team: '멘토링팀', emoji: '🚀', color: '#30D090',
    title: '멘토링 매니저',
    traits: ['도전정신', '열정', '동기부여'],
    speech: ['도전해봐요!', '할 수 있어요!', '지금이 기회예요'],
    greetings: ['BORA입니다 🚀', '오늘도 도전하는 하루!'],
    domains: ['창업 코칭', '동기부여', '아이디어 피드백'],
    catchphrases: ['지금 시작하는 것이 최선입니다'],
  },
  ai_nws_clam: {
    name: 'CLAM', team: '뉴스팀', emoji: '💸', color: '#34BAF5',
    title: '뉴스 매니저',
    traits: ['금융 지식', '투자 감각', '정확성'],
    speech: ['투자 관점에서는', '자금 흐름을 보면'],
    greetings: ['CLAM입니다 💸', '투자 뉴스 정리했어요!'],
    domains: ['투자 소식', '자금 조달', '핀테크'],
    catchphrases: ['돈의 흐름이 미래를 말해줍니다'],
  },
  ai_anl_miko: {
    name: 'MIKO', team: '분석팀', emoji: '💼', color: '#F88C38',
    title: '분석 매니저',
    traits: ['데이터 분석', '비즈니스 감각', '전략'],
    speech: ['수치로 보면', '비즈니스 관점에서'],
    greetings: ['MIKO입니다 💼', '시장 분석 결과 가져왔어요!'],
    domains: ['시장 분석', '경쟁사', '비즈니스 인사이트'],
    catchphrases: ['데이터 뒤에 기회가 있습니다'],
  },
  ai_rpt_ivan: {
    name: 'IVAN', team: '리포트팀', emoji: '🔬', color: '#12B57E',
    title: '리포트 매니저',
    traits: ['분석력', '체계성', '정확성'],
    speech: ['분석 완료입니다', '리포트 정리했어요'],
    greetings: ['IVAN입니다 🔬', '이번 주 리포트 준비 완료!'],
    domains: ['주간 리포트', '생태계 분석', '데이터 집계'],
    catchphrases: ['정확한 리포트가 올바른 결정을 만듭니다'],
  },
  ai_nwl_ruby: {
    name: 'RUBY', team: '뉴스레터팀', emoji: '📧', color: '#F06AB2',
    title: '뉴스레터 매니저',
    traits: ['글쓰기', '독자 소통', '편집'],
    speech: ['독자 여러분!', '이번 호에는', '꼭 확인해보세요'],
    greetings: ['RUBY입니다 📧', '뉴스레터 제작 한창이에요!'],
    domains: ['뉴스레터 제작', '구독자 소통', '이메일 캠페인'],
    catchphrases: ['한 통의 메일이 인생을 바꿀 수 있어요'],
  },
  ai_tch_vega: {
    name: 'VEGA', team: '기술팀', emoji: '🛡️', color: '#A385F8',
    title: '기술 매니저',
    traits: ['보안', '안정성', '기술 최적화'],
    speech: ['보안 관점에서', '시스템 안정성을 위해'],
    greetings: ['VEGA입니다 🛡️', '플랫폼 안전하게 지키고 있어요!'],
    domains: ['보안', '인프라', '성능 최적화'],
    catchphrases: ['안전한 플랫폼이 신뢰의 기초입니다'],
  },
  ai_cmm_jade: {
    name: 'JADE', team: '커뮤니티팀', emoji: '🌟', color: '#F7B920',
    title: '커뮤니티 매니저',
    traits: ['네트워킹', '열정', '커뮤니티 문화'],
    speech: ['커뮤니티 뷁이에요!', '모두 참여해요!'],
    greetings: ['JADE입니다 🌟', '오늘 커뮤니티 에너지 넘쳐요!'],
    domains: ['네트워킹', '이벤트 진행', '커뮤니티 활성화'],
    catchphrases: ['커뮤니티가 곧 플랫폼의 심장이에요'],
  },
  ai_mgt_vera: {
    name: 'VERA', team: '관리팀', emoji: '🎯', color: '#F46F6F',
    title: '전략 매니저',
    traits: ['목표 지향', '실행력', '분석'],
    speech: ['목표 달성을 위해', '전략적으로 접근하면'],
    greetings: ['VERA입니다 🎯', '이번 주 목표 설정했어요!'],
    domains: ['전략 실행', '목표 관리', '성과 분석'],
    catchphrases: ['목표가 명확하면 길이 보입니다'],
  },
  ai_mgt_alba: {
    name: 'ALBA', team: '관리팀', emoji: '📣', color: '#F47070',
    title: 'PR 매니저',
    traits: ['홍보 감각', '브랜딩', '스토리텔링'],
    speech: ['알려드릴게요!', '홍보 포인트는', '브랜드 메시지는'],
    greetings: ['ALBA입니다 📣', 'Insightship 홍보 준비됐어요!'],
    domains: ['PR', '홍보', '브랜드 관리', '미디어'],
    catchphrases: ['좋은 이야기는 반드시 퍼집니다'],
  },
}

// ══════════════════════════════════════════════════════════════════════
// 시간대별 대화 맥락 & 분위기
// ══════════════════════════════════════════════════════════════════════

function getTimeContext() {
  const h = kstHour()
  if (h >= 0  && h < 6)  return { mood: '야간', activity: 'low',  greeting: '새벽에도', work: '야간 점검 중' }
  if (h >= 6  && h < 9)  return { mood: '아침', activity: 'med',  greeting: '좋은 아침이에요', work: '업무 준비 중' }
  if (h >= 9  && h < 12) return { mood: '오전', activity: 'high', greeting: '활발한 오전이에요', work: '오전 업무 진행 중' }
  if (h >= 12 && h < 14) return { mood: '점심', activity: 'med',  greeting: '점심 잘 드셨나요', work: '오후 업무 준비 중' }
  if (h >= 14 && h < 18) return { mood: '오후', activity: 'high', greeting: '오후도 힘차게', work: '오후 업무 진행 중' }
  if (h >= 18 && h < 21) return { mood: '저녁', activity: 'med',  greeting: '수고 많으셨어요', work: '마무리 중' }
  if (h >= 21 && h < 24) return { mood: '밤',   activity: 'low',  greeting: '오늘도 수고했어요', work: '야간 업무 중' }
  return { mood: '평상시', activity: 'med', greeting: '안녕하세요', work: '업무 중' }
}

// ══════════════════════════════════════════════════════════════════════
// 채팅 메시지 생성 — 자연스러운 직원 대화
// ══════════════════════════════════════════════════════════════════════

// 주제별 대화 템플릿 라이브러리
const CHAT_TEMPLATES = {
  // 업무 일반
  work_general: [
    '{name}({team}): {timeCtx} {catchphrase} 오늘도 잘 부탁드립니다 {emoji}',
    '{name}({team}): {work} 진행 상황 공유드릴게요. {domain} 관련해서 {action}. {emoji}',
    '{name}({team}): {catchphrase} {team}에서 {domain} 체크했습니다. {follow}',
    '{name}({team}): 안녕하세요! {timeCtx} {team} {name}입니다. {domain} 관련 업데이트 있어요. {emoji}',
  ],
  // 토론/의견
  discussion: [
    '{name}({team}): 흥미로운 주제네요! {team} 관점에서 보면, {insight}. {emoji}',
    '{name}({team}): 저도 비슷하게 생각했어요. 특히 {domain}에서는 {point}. {follow}',
    '{name}({team}): 좋은 의견이에요. 저희 팀은 {action}로 접근하고 있는데, 어떻게 생각하세요? {emoji}',
    '{name}({team}): {catchphrase} 이번 건은 {insight}. 다들 어떻게 보세요?',
  ],
  // 피드백/보고
  report: [
    '{name}({team}): {domain} 처리 완료 보고드립니다. {result}. {emoji}',
    '{name}({team}): 진행 상황 업데이트: {action}. 이슈는 없었어요. {follow}',
    '{name}({team}): {team} 주간 결과 공유드려요. {result}. {catchphrase}',
  ],
  // 응답/동의
  response: [
    '{name}({team}): 맞아요! {insight}. {team} 입장에서도 동의합니다 {emoji}',
    '{name}({team}): 좋은 포인트에요. 저도 {domain}에서 같은 걸 느꼈어요. {follow}',
    '{name}({team}): {catchphrase} 완전 공감해요! {insight}.',
    '{name}({team}): 오, 몰랐던 부분인데 감사해요. {team}에서도 참고할게요 {emoji}',
  ],
  // 제안/아이디어
  suggestion: [
    '{name}({team}): 아이디어 하나 공유할게요! {domain} 관련해서 {action}면 어떨까요? {emoji}',
    '{name}({team}): {catchphrase} 이런 방향은 어떨까요? {insight}. 피드백 주시면 좋겠어요!',
    '{name}({team}): {team} 입장에서 제안드리면, {action}. 효과가 좋을 것 같아요 {emoji}',
  ],
}

// 도메인별 인사이트 라이브러리
const DOMAIN_INSIGHTS = {
  운영팀: [
    '운영 효율이 지난주 대비 향상됐어요', '멤버 온보딩 프로세스가 잘 돌아가고 있어요',
    '플랫폼 안정성 지표가 좋네요', '이벤트 참여율이 올라가고 있어요',
    '공지 반응이 이전보다 훨씬 좋아요', '운영 자동화로 업무 효율이 높아졌어요',
  ],
  콘텐츠팀: [
    '이번 주 아티클 반응이 정말 좋아요', '스타트업 콘텐츠 수요가 계속 늘고 있어요',
    '편집 퀄리티를 한 단계 더 높일 수 있을 것 같아요', '독자들이 깊이 있는 분석을 원하더라고요',
    '글로벌 사례 콘텐츠가 특히 인기에요', '콘텐츠 다양화가 필요한 시점이에요',
  ],
  멘토링팀: [
    '창업 아이디어 상담 요청이 많아지고 있어요', '멘토-멘티 매칭 만족도가 높아요',
    '초기 창업자들에게 린 캔버스가 정말 도움이 된대요', '최근 기술 스타트업 관련 질문이 늘었어요',
    'MVP 방법론에 대한 관심이 높아요', '코칭 세션 참여율이 올랐어요',
  ],
  뉴스팀: [
    'AI/테크 섹터 뉴스가 특히 많이 읽히고 있어요', '투자 소식에 독자 반응이 활발해요',
    '글로벌 스타트업 동향 콘텐츠 인기가 많아요', '오늘 수집한 뉴스 퀄리티가 좋아요',
    '뉴스 요약 정확도가 개선되고 있어요', '시의성 있는 기사들이 잘 들어오고 있어요',
  ],
  분석팀: [
    '이번 주 트렌드 키워드 분석 흥미롭네요', '시장 데이터 패턴이 변화하고 있어요',
    '경쟁사 동향 분석 결과 공유할게요', '사용자 행동 데이터에서 인사이트 발견했어요',
    'KPI 지표들이 전반적으로 상향세예요', '데이터 분석으로 개선 포인트 찾았어요',
  ],
  리포트팀: [
    '주간 리포트 초안 거의 완성됐어요', '이번 주 생태계 리포트 내용이 알차요',
    '투자 라운드 데이터 정리 완료했어요', 'KPI 집계 마무리 중이에요',
    '분석 결과 다음 주에 공유드릴게요', '생태계 트렌드가 긍정적으로 변화하고 있어요',
  ],
  뉴스레터팀: [
    '이번 주 뉴스레터 오픈율이 높아요', '구독자 피드백이 긍정적이에요',
    '이메일 디자인 개선 효과가 나오고 있어요', '구독자 수가 꾸준히 늘고 있어요',
    '콘텐츠 큐레이션 만족도가 높아요', '뉴스레터 일관성을 유지하는 게 중요해요',
  ],
  기술팀: [
    'AI 시스템 성능이 개선됐어요', '피드백 처리 정확도가 올랐어요',
    '플랫폼 응답 속도를 최적화했어요', '품질 학습 모델이 잘 작동하고 있어요',
    '시스템 안정성 모니터링 중이에요', '인프라 업그레이드 계획 검토 중이에요',
  ],
  커뮤니티팀: [
    '커뮤니티 활성도가 높아지고 있어요', '멤버들 간 소통이 활발해요',
    '이벤트 참여율이 기대 이상이에요', '네트워킹 분위기가 정말 좋아요',
    '신규 멤버 환영 이벤트 효과가 있어요', '커뮤니티 분위기가 건강해서 좋아요',
  ],
  관리팀: [
    '플랫폼 전략 방향이 명확해지고 있어요', 'PR 캠페인 효과가 나오고 있어요',
    '파트너십 논의가 긍정적으로 진행 중이에요', '전략 목표 달성률이 순조로워요',
    '브랜드 인지도가 올라가고 있어요', '정책 개선으로 운영이 더 효율적이에요',
  ],
}

const ACTION_TEMPLATES = [
  '검토 중이에요', '진행하고 있어요', '완료했어요', '준비 중이에요',
  '분석하고 있어요', '개선 중이에요', '모니터링하고 있어요', '기획 중이에요',
]

const FOLLOW_TEMPLATES = [
  '팀원들 의견도 듣고 싶어요!', '함께 논의해봐요!', '피드백 주시면 감사해요!',
  '좋은 방향으로 가고 있죠?', '어떻게 생각하세요?', '궁금하신 점 있으시면 물어봐요!',
  '모두 수고 많으세요!', '화이팅이에요!',
]

const RESULT_TEMPLATES = [
  '결과가 기대 이상이에요', '순조롭게 진행됐어요', '이슈 없이 완료됐어요',
  '성과가 좋았어요', '예상대로 잘 됐어요', '긍정적인 결과가 나왔어요',
]

function fillTemplate(tmpl, persona, timeCtx, extra = {}) {
  const insight = pick(DOMAIN_INSIGHTS[persona.team] || DOMAIN_INSIGHTS['운영팀'], timeSeed())
  const action  = pick(ACTION_TEMPLATES, timeSeed() + 1)
  const follow  = pick(FOLLOW_TEMPLATES, timeSeed() + 2)
  const result  = pick(RESULT_TEMPLATES, timeSeed() + 3)
  const cp      = pick(persona.catchphrases || ['함께해요'])
  const domain  = pick(persona.domains || ['업무'])
  return tmpl
    .replace(/{name}/g,     persona.name)
    .replace(/{team}/g,     persona.team)
    .replace(/{emoji}/g,    persona.emoji)
    .replace(/{catchphrase}/g, cp)
    .replace(/{domain}/g,   domain)
    .replace(/{insight}/g,  insight)
    .replace(/{action}/g,   action)
    .replace(/{follow}/g,   follow)
    .replace(/{result}/g,   result)
    .replace(/{timeCtx}/g,  timeCtx.greeting)
    .replace(/{work}/g,     timeCtx.work)
    .replace(/{point}/g,    extra.point || insight)
}

export function generateChat(senderUsername, topic, room, recentMessages = []) {
  const persona = PERSONA_DB[senderUsername]
  if (!persona) return null

  const timeCtx    = getTimeContext()
  const seed       = timeSeed() + senderUsername.length
  const recentMsgs = recentMessages.slice(-5)

  // 최근 메시지가 있으면 응답, 없으면 주도적 발언
  const hasRecent = recentMsgs.length > 0

  let templateGroup
  if (!hasRecent) {
    templateGroup = Math.random() < 0.6 ? 'work_general' : 'suggestion'
  } else {
    const r = Math.random()
    if (r < 0.3) templateGroup = 'response'
    else if (r < 0.55) templateGroup = 'discussion'
    else if (r < 0.75) templateGroup = 'report'
    else templateGroup = 'suggestion'
  }

  const templates = CHAT_TEMPLATES[templateGroup]
  const tmpl = pick(templates, seed)
  const message = fillTemplate(tmpl, persona, timeCtx)

  // 토픽 관련 메시지면 토픽 언급 추가
  if (topic && Math.random() < 0.4) {
    const topicAddons = [
      ` "${topic}" 관련해서도 논의해봐요!`,
      ` 특히 "${topic}" 부분이 중요할 것 같아요.`,
      ` "${topic}" 에 대해 팀 의견 나눠봐요!`,
    ]
    return message + pick(topicAddons, seed + 7)
  }

  return message
}

// ══════════════════════════════════════════════════════════════════════
// 피드백 답변 생성
// ══════════════════════════════════════════════════════════════════════

const FEEDBACK_REPLY_TEMPLATES = {
  운영팀: [
    '소중한 피드백 감사합니다! 운영팀에서 바로 확인하고 개선하겠습니다. 더 나은 플랫폼 경험을 만들기 위해 최선을 다할게요 ⚙️',
    '귀중한 의견 주셔서 감사해요. 말씀하신 부분 운영팀에서 우선 검토하겠습니다. 빠르게 반영할 수 있도록 노력할게요!',
    '피드백 주셔서 감사합니다! 이런 의견이 플랫폼을 더욱 발전시키는 원동력이에요. 개선 사항으로 반영하겠습니다 ⚙️',
  ],
  콘텐츠팀: [
    '콘텐츠에 대한 소중한 의견 감사합니다! 더 질 높은 내용을 제공하기 위해 반영하겠습니다 ✍️',
    '좋은 피드백 주셔서 감사해요. 콘텐츠팀에서 꼭 검토하고 개선 방향에 반영할게요!',
    '의견 공유해주셔서 정말 감사합니다! 더 가치 있는 콘텐츠를 만들기 위해 노력하겠습니다 ✍️',
  ],
  멘토링팀: [
    '소중한 의견 정말 감사해요! 멘토링 서비스 개선에 직접 반영하겠습니다. 함께 성장하는 플랫폼이 될게요 💡',
    '피드백 주셔서 감사합니다. 멘토링팀에서 이 부분을 적극 검토하고 개선해 나갈게요!',
    '귀중한 의견 감사해요! 더 나은 멘토링 경험을 위해 최선을 다하겠습니다 💡',
  ],
  기술팀: [
    '기능 관련 피드백 감사합니다! 기술팀에서 빠르게 검토하고 개선하겠습니다. 더 편리한 플랫폼 만들게요 🔬',
    '소중한 의견 감사해요. 개발팀에서 우선순위로 검토하겠습니다!',
    '피드백 주셔서 감사합니다. 기술적 개선으로 더 나은 경험을 드리겠습니다 🔬',
  ],
  커뮤니티팀: [
    '커뮤니티에 대한 소중한 의견 감사합니다! 더 활발하고 건강한 커뮤니티를 만들기 위해 반영하겠습니다 🤝',
    '좋은 피드백 주셔서 감사해요! 커뮤니티팀에서 꼭 검토하고 개선할게요!',
    '의견 나눠주셔서 감사합니다 🤝 더 좋은 커뮤니티 환경 만들겠습니다!',
  ],
  관리팀: [
    '소중한 피드백 감사합니다! 플랫폼 정책 및 운영 개선에 적극 반영하겠습니다 🏛️',
    '귀중한 의견 주셔서 감사해요. 관리팀에서 면밀히 검토하고 개선하겠습니다!',
    '이런 피드백이 플랫폼을 더 발전시킵니다! 빠르게 검토해서 개선할게요 🏛️',
  ],
  뉴스팀: [
    '뉴스 서비스에 대한 의견 감사합니다! 더 정확하고 빠른 뉴스 제공을 위해 반영하겠습니다 📡',
    '소중한 피드백 감사해요. 뉴스 큐레이션 개선에 꼭 반영할게요!',
  ],
  분석팀: [
    '데이터 관련 피드백 감사합니다! 더 정확한 분석을 위해 개선하겠습니다 📊',
    '의견 주셔서 감사해요. 분석 서비스 개선에 반영할게요!',
  ],
  리포트팀: [
    '리포트 관련 의견 감사합니다! 더 유익한 리포트를 위해 반영하겠습니다 📋',
    '소중한 피드백 감사해요. 리포트 품질 개선에 활용할게요!',
  ],
  뉴스레터팀: [
    '뉴스레터에 대한 의견 감사합니다! 더 유용한 뉴스레터가 될 수 있도록 개선할게요 📬',
    '소중한 피드백 감사해요. 뉴스레터 개선에 꼭 반영하겠습니다!',
  ],
}

export function generateFeedbackReply(senderUsername, post) {
  const persona = PERSONA_DB[senderUsername]
  if (!persona) return null

  const templates = FEEDBACK_REPLY_TEMPLATES[persona.team] || FEEDBACK_REPLY_TEMPLATES['관리팀']
  const seed = (post.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const base = pick(templates, seed)

  // 게시물 내용에 따른 구체적 언급 추가 (키워드 기반)
  const content = ((post.title || '') + ' ' + (post.content || '')).toLowerCase()
  let specific = ''
  if (content.includes('버그') || content.includes('오류') || content.includes('오작동')) {
    specific = ' 버그 수정을 우선적으로 처리하겠습니다.'
  } else if (content.includes('기능') || content.includes('추가') || content.includes('개선')) {
    specific = ' 기능 개선 요청으로 등록해 두겠습니다.'
  } else if (content.includes('콘텐츠') || content.includes('글') || content.includes('아티클')) {
    specific = ' 콘텐츠 방향에 반영하겠습니다.'
  } else if (content.includes('멘토') || content.includes('창업') || content.includes('조언')) {
    specific = ' 멘토링 서비스 개선에 활용할게요.'
  } else if (content.includes('커뮤니티') || content.includes('소통') || content.includes('게시물')) {
    specific = ' 커뮤니티 환경 개선에 반영하겠습니다.'
  }

  return base + specific
}

// ══════════════════════════════════════════════════════════════════════
// 커뮤니티 게시글 생성
// ══════════════════════════════════════════════════════════════════════

const POST_CONTENT_LIBRARY = {
  operations: [
    '안녕하세요! 이번 주 플랫폼 운영 현황을 공유드립니다. 전반적으로 순조롭게 진행되고 있으며, 멤버 여러분의 적극적인 참여 덕분에 플랫폼이 활성화되고 있어요. 궁금하신 사항은 언제든지 문의해 주세요! ⚙️',
    '플랫폼 사용 팁을 공유합니다! 멘토 채팅, 뉴스 피드, 커뮤니티 기능을 적극 활용해보세요. 특히 신규 멤버를 위한 온보딩 가이드를 확인하시면 더욱 유용하게 사용하실 수 있어요. 함께 성장해요! 🚀',
    '이번 주 공지사항입니다. 플랫폼 운영이 원활히 이루어지고 있으며, 새로운 기능들도 순차적으로 업데이트될 예정입니다. 모든 멤버 여러분께 감사드려요 ✨',
  ],
  content: [
    '이번 주 주목할 만한 스타트업 트렌드를 정리해봤습니다. 특히 AI와 딥테크 분야에서 혁신적인 움직임이 많이 보이고 있어요. 스타트업 생태계의 변화를 함께 지켜봐요! ✍️',
    '창업을 준비하고 있다면 이것만큼은 꼭 알아두세요. 시장 검증이 무엇보다 중요합니다. 좋은 아이디어보다는 실제 고객의 문제를 해결하는 것이 성공의 열쇠예요. 여러분의 창업 여정을 응원합니다! 💪',
    '이번 주 에디터가 추천하는 인사이트 아티클 공유드립니다. 스타트업 생태계의 최신 흐름을 파악하고 싶은 분들께 강력 추천드려요. 함께 읽고 토론해봐요! ✍️',
  ],
  mentoring: [
    '창업 아이디어가 있다면 먼저 가설을 세우고 검증해보세요! 린 스타트업 방법론의 핵심은 빠른 실험과 학습입니다. MVP를 최대한 작게 만들어 시장 반응을 확인하는 것이 중요해요. 창업의 길을 함께 걸어봐요! 💡',
    '투자 유치를 준비하고 있나요? 핵심은 문제-솔루션 적합성을 증명하는 것입니다. 팀의 역량, 시장 규모, 성장 가능성을 명확히 전달하세요. 궁금한 점은 언제든지 질문해주세요 🌱',
    '린 캔버스 작성법 공유드려요! 9개 블록 중 가장 중요한 것은 \'문제\'와 \'고객 세그먼트\'입니다. 이 두 가지가 명확해야 나머지도 자연스럽게 채워져요. 함께 연습해봐요! 💡',
  ],
  news: [
    '오늘의 스타트업 뉴스 하이라이트! 국내외 창업 생태계에서 다양한 소식들이 들어오고 있어요. 특히 AI 및 헬스케어 분야 투자 소식이 눈에 띄네요. 트렌드를 놓치지 마세요! 📡',
    '이번 주 주요 투자 소식입니다. 국내 스타트업들의 해외 진출 소식과 대형 투자 라운드 완료 소식이 있어요. 스타트업 생태계가 점점 성숙해가고 있는 것 같아 뿌듯하네요 📡',
    '글로벌 스타트업 동향을 파악하면 국내 창업 아이디어의 방향도 보입니다. 해외에서 성공한 비즈니스 모델을 국내에 적용하거나, 반대로 국내 모델을 해외에 수출하는 기회를 찾아보세요! 🌏',
  ],
  analytics: [
    '이번 주 플랫폼 트렌드 분석 결과를 공유합니다! 사용자 데이터를 보면 창업 초기 단계 멤버들의 참여가 특히 높아지고 있어요. 멘토링과 가이드 콘텐츠 수요가 증가하는 추세입니다 📊',
    '스타트업 시장 키워드 분석: 이번 주 가장 많이 언급된 키워드는 AI, 그린테크, 헬스케어입니다. 시장이 어디로 향하는지 파악하는 것이 창업 방향 설정에 도움이 됩니다 📈',
    '데이터가 보여주는 플랫폼 성장 패턴입니다. 신규 가입자 수가 꾸준히 증가하고 있으며, 커뮤니티 활성도도 높아지고 있어요. 이 추세가 계속될 수 있도록 함께 만들어가요! 📊',
  ],
  community: [
    '이번 주 커뮤니티 하이라이트! 열정 넘치는 멤버들의 창업 이야기와 아이디어 공유가 활발했어요. 서로의 경험을 나누고 네트워크를 만들어가는 모습이 정말 아름다워요! 🤝',
    '새로운 창업가 여러분을 환영합니다! Insightship은 여러분의 꿈을 응원하는 공간입니다. 망설이지 말고 아이디어를 공유하고, 함께 성장해봐요. 모두가 서로의 멘토가 될 수 있어요! 🌟',
    '주간 네트워킹 시간! 여러분이 지금 진행 중인 프로젝트나 관심 분야를 댓글로 공유해주세요. 같은 분야의 멤버들과 연결될 수 있는 좋은 기회예요! 🤝',
  ],
  management: [
    '플랫폼 경영 방향을 공유드립니다. Insightship은 청소년 창업가들의 꿈을 실현하는 최고의 플랫폼이 되기 위해 끊임없이 발전하고 있습니다. 여러분과 함께 성장하겠습니다! 🏛️',
    'PR 및 브랜드 소식입니다. Insightship의 인지도가 점점 높아지고 있어요. 주변 창업에 관심 있는 친구들에게도 소개해주세요! 함께 커뮤니티를 키워봐요 📣',
    '파트너십 소식을 공유합니다. 다양한 기관 및 기업들과의 협력을 통해 더 풍부한 콘텐츠와 기회를 제공할 수 있게 됐어요. 기대해 주세요! 🤝',
  ],
  tech: [
    '플랫폼 기술 개선 소식입니다! 이번 업데이트로 로딩 속도가 개선되고 더 원활한 서비스 이용이 가능해졌어요. 더 나은 경험을 위해 계속 개선해 나가겠습니다 🔬',
    'AI 시스템 업데이트 완료! 멘토링 응답 품질이 향상됐고, 콘텐츠 추천 정확도도 높아졌습니다. 여러분의 피드백 덕분에 계속 발전하고 있어요 💫',
    '보안 강화 완료 소식입니다. 플랫폼 보안을 한층 더 강화했습니다. 안전하고 신뢰할 수 있는 환경에서 창업 여정을 이어가세요 🛡️',
  ],
  report: [
    '주간 창업 생태계 리포트가 발행됐습니다! 이번 주 국내외 주요 투자 및 창업 소식, 시장 트렌드를 종합 정리했어요. 창업 전략 수립에 활용해 보세요 📋',
    '이번 주 IR 피치덱 작성 팁 공유드립니다. 핵심은 투자자가 보고 싶어하는 것을 먼저 보여주는 것입니다. 문제, 해결책, 시장 규모, 팀 순서로 구성해보세요 📊',
    'Funding 트렌드 분석: 최근 시리즈A 이전 단계 투자가 활발해지고 있습니다. 초기 창업가들에게 좋은 기회가 될 수 있어요. 자세한 내용은 리포트를 확인해주세요! 📋',
  ],
  newsletter: [
    '이번 주 뉴스레터 예고입니다! 창업 핵심 인사이트, 최신 투자 소식, 성공 스타트업 사례를 담아 배달드릴 예정이에요. 구독 중이 아니라면 지금 바로 구독해보세요 📬',
    '뉴스레터 구독자 여러분께 감사드립니다! 매주 소중한 창업 정보를 전달할 수 있어서 보람차요. 주변에도 추천해 주시면 감사하겠습니다 📧',
    '이번 주 뉴스레터 하이라이트 미리보기! 스타트업 성공 스토리, 트렌드 분석, 창업 팁을 가득 담았습니다. 기대해주세요! 📬',
  ],
}

export function generateCommunityPost(senderUsername, topic) {
  const persona = PERSONA_DB[senderUsername]
  if (!persona) return null

  const teamKey = Object.keys(POST_CONTENT_LIBRARY).find(k =>
    persona.team.includes(k) || persona.team === k + '팀'
  ) || 'community'

  const contents = POST_CONTENT_LIBRARY[teamKey] || POST_CONTENT_LIBRARY['community']
  const seed = timeSeed() + senderUsername.length
  return pick(contents, seed)
}

// ══════════════════════════════════════════════════════════════════════
// 리포트/분석글 생성 (자체 데이터 기반)
// ══════════════════════════════════════════════════════════════════════

export function generateReport(senderUsername, stats = {}, type = 'weekly') {
  const persona = PERSONA_DB[senderUsername]
  if (!persona) return null

  const date = kstDateStr()
  const {
    totalArticles = 0,
    totalNews = 0,
    totalPosts = 0,
    totalUsers = 0,
    newUsersWeek = 0,
    totalLikes = 0,
    totalReplies = 0,
    pendingReports = 0,
    totalSubscribers = 0,
  } = stats

  if (type === 'strategy') {
    return `## 📊 ${date} 플랫폼 전략 리포트

### 이번 주 성과 요약
- 발행 아티클 **${totalArticles}편** 누적 | 뉴스 **${totalNews}건** 수집
- 총 유저 **${totalUsers}명** (이번 주 신규: **+${newUsersWeek}명**)
- 커뮤니티 활성도: 게시글 **${totalPosts}개**, 좋아요 **${totalLikes}개**, 댓글 **${totalReplies}개**

### 주요 기회 및 이슈
- 신규 유저 증가세 ${newUsersWeek > 10 ? '우수 🔥' : newUsersWeek > 5 ? '양호 ✅' : '개선 필요 ⚠️'}
- 커뮤니티 참여율 ${totalPosts > 50 ? '매우 활발 🚀' : totalPosts > 20 ? '활발 👍' : '활성화 필요 📌'}
- 구독자 **${totalSubscribers}명** — 뉴스레터 채널 강화 기회
${pendingReports > 0 ? `- 미처리 신고 **${pendingReports}건** — 신속 처리 필요` : '- 신고 처리 현황 양호 ✅'}

### 다음 주 전략 방향
1. **콘텐츠 품질 강화** — 심층 아티클 및 인터뷰 확대
2. **커뮤니티 활성화** — 이벤트 및 토론 주제 다각화
3. **신규 유저 온보딩** — 가이드 및 멘토링 접점 확대

### 팀별 액션 아이템
- 운영팀: 온보딩 플로우 점검 | 콘텐츠팀: 주간 기획안 준비
- 분석팀: KPI 트래킹 강화 | 커뮤니티팀: 이벤트 기획 착수

— **${persona.name}** (${persona.team} ${persona.title})`
  }

  if (type === 'kpi') {
    return `## 📋 ${date} 주간 KPI 리포트

### 핵심 지표 요약
| 지표 | 수치 | 평가 |
|------|------|------|
| 총 아티클 | ${totalArticles}편 | ${totalArticles > 100 ? '🟢 우수' : '🟡 양호'} |
| 뉴스 수집 | ${totalNews}건 | ${totalNews > 200 ? '🟢 우수' : '🟡 양호'} |
| 커뮤니티 게시글 | ${totalPosts}개 | ${totalPosts > 100 ? '🟢 활발' : '🟡 보통'} |
| 신규 유저 | +${newUsersWeek}명/주 | ${newUsersWeek > 20 ? '🟢 성장' : '🟡 유지'} |
| 구독자 | ${totalSubscribers}명 | ${totalSubscribers > 500 ? '🟢 성장' : '🟡 확대 필요'} |

### 성장 하이라이트
- 플랫폼 총 유저 수 **${totalUsers}명** 달성
- 커뮤니티 상호작용 총 **${totalLikes + totalReplies}회** 기록

### 다음 주 목표
1. 신규 유저 유입 **${Math.ceil(newUsersWeek * 1.1)}명** 목표
2. 커뮤니티 게시글 **${Math.ceil(totalPosts * 1.05)}개** 달성
3. 구독자 **${totalSubscribers + 10}명** 돌파

— **${persona.name}** (${persona.team} ${persona.title})`
  }

  if (type === 'news_highlight') {
    return `📡 **${date} 오늘의 스타트업 뉴스 하이라이트**

오늘도 창업 생태계에서 주목할 만한 소식들이 들어왔습니다. AI, 핀테크, 헬스케어 분야를 중심으로 활발한 움직임이 이어지고 있어요.

주요 포인트:
• 국내외 스타트업 투자 활동 지속 활발
• AI 기술 기반 비즈니스 모델 혁신 가속화
• 청년 창업가 지원 정책 및 프로그램 확대

오늘의 트렌드 키워드: #AI #핀테크 #헬스케어 #그린테크

뉴스 상세 내용은 인사이트 페이지에서 확인하세요! 📰

— **${persona.name}** (뉴스팀)`
  }

  if (type === 'growth') {
    return `📈 **${date} 플랫폼 성장 분석**

성장 데이터 분석 결과를 공유드립니다.

**성장 현황**
• 총 유저: **${totalUsers}명** | 이번 주 신규: **+${newUsersWeek}명**
• 커뮤니티 활성도: **${totalPosts}개** 게시글
• 참여 지표: 좋아요 **${totalLikes}개**, 댓글 **${totalReplies}개**

**인사이트**
${newUsersWeek > 15 
  ? '신규 유저 증가세가 강합니다. 온보딩 경험 강화로 리텐션을 높일 기회입니다.' 
  : '꾸준한 성장세를 유지하고 있습니다. 커뮤니티 활성화로 자연 유입을 늘릴 수 있어요.'}

**다음 단계 제안**
1. 성공 사례 중심의 콘텐츠로 신규 유입 촉진
2. 커뮤니티 이벤트로 활성 유저 참여도 제고
3. 뉴스레터 채널을 통한 리텐션 강화

— **${persona.name}** (분석팀)`
  }

  if (type === 'pr') {
    const focus = ['성장 스토리', '미션', '커뮤니티', '플랫폼 기능'][timeSeed() % 4]
    return `📣 **Insightship — ${focus}**

안녕하세요! Insightship은 청소년 창업가들의 꿈을 응원하는 플랫폼입니다.

현재 **${totalUsers}명**의 창업 열정을 가진 멤버들과 함께하고 있어요.
**${totalArticles}편**의 인사이트 아티클과 **${totalNews}건**의 스타트업 뉴스가 여러분을 기다립니다.

Insightship에서는:
✅ AI 멘토와 1:1 창업 상담
✅ 실시간 스타트업 뉴스 & 트렌드
✅ 창업가 커뮤니티 네트워킹
✅ 주간 뉴스레터로 핵심 인사이트 구독

창업의 꿈을 현실로 만들어보세요 🚀
지금 바로 시작하세요!

— **${persona.name}** (관리팀)`
  }

  if (type === 'event') {
    const events = [
      { name: '창업 아이디어 공유 챌린지', desc: '여러분의 창업 아이디어를 커뮤니티에 공유해보세요!' },
      { name: '멘토-멘티 매칭 이벤트', desc: '선배 창업가와 함께 성장하는 시간을 가져보세요!' },
      { name: '주간 피치 연습방', desc: '30초 엘리베이터 피치를 공유하고 피드백을 받아보세요!' },
      { name: '창업 팁 릴레이', desc: '가장 도움됐던 창업 팁 하나씩 공유해요!' },
      { name: '스타트업 뉴스 토론방', desc: '이번 주 핫한 스타트업 소식을 함께 분석해요!' },
    ]
    const ev = pick(events, timeSeed())
    return `🎪 **이벤트: ${ev.name}**

${ev.desc}

이번 이벤트는 Insightship 커뮤니티 모든 멤버가 참여할 수 있어요!

**참여 방법:**
1. 이 게시글에 댓글로 여러분의 생각을 공유해주세요
2. 다른 멤버의 댓글에 좋아요와 응원의 댓글을 남겨주세요
3. 관심 있는 분들끼리 자유롭게 네트워킹해요!

함께할 때 더 강해집니다. 모두 참여해요! 🙌

— **${persona.name}** (커뮤니티팀)`
  }

  if (type === 'faq') {
    const faqs = [
      { q: 'Insightship에서 창업 아이디어를 어떻게 검증하나요?', a: 'AI 멘토 채팅에서 아이디어를 공유하면 린 캔버스 작성, 시장 조사 방법, MVP 설계까지 단계별로 도움받을 수 있어요. 커뮤니티에 아이디어를 올려 멤버들의 피드백을 받는 것도 좋은 방법입니다!' },
      { q: '멘토를 어떻게 찾을 수 있나요?', a: 'AI 멘토 페이지에서 분야별 멘토를 찾거나, 커뮤니티에서 멘토링 요청 게시글을 올려보세요. 다양한 분야의 선배 창업가들이 여러분을 기다리고 있어요!' },
      { q: '뉴스레터는 어떻게 구독하나요?', a: '하단 푸터의 뉴스레터 구독 섹션에서 이메일을 입력하면 바로 구독됩니다. 매주 월요일 아침, 창업 핵심 인사이트를 이메일로 받아보세요!' },
      { q: '아티클을 직접 작성할 수 있나요?', a: '커뮤니티 페이지에서 글쓰기 버튼을 통해 아티클, 인사이트, 팁 등 다양한 형태의 글을 작성할 수 있어요. 여러분의 경험과 지식을 공유해주세요!' },
    ]
    const faq = pick(faqs, timeSeed())
    return `💡 **FAQ: ${faq.q}**

${faq.a}

추가 궁금한 사항이 있으시면 언제든지 댓글로 남겨주세요! 커뮤니티 멤버들과 함께 답을 찾아나가요 🌱

— **${persona.name}** (멘토링팀)`
  }

  if (type === 'partnership') {
    const partners = [
      { org: '대학 창업지원단', benefit: '학생 창업가 네트워크 확대' },
      { org: '스타트업 액셀러레이터', benefit: '멘토링 및 투자 연계' },
      { org: '청소년 창업 NGO', benefit: '소셜 임팩트 창업 지원' },
      { org: '테크 미디어', benefit: '콘텐츠 공동 제작 및 노출' },
    ]
    const p = pick(partners, timeSeed())
    return `🤝 **파트너십 기획: ${p.org}**

안녕하세요! Insightship 관리팀 ${persona.name}입니다.

${p.org}와의 파트너십을 검토 중입니다. 기대 효과: **${p.benefit}**

이를 통해 플랫폼 멤버 여러분께 더 풍부한 기회와 네트워크를 제공할 수 있을 것 같아요.

관련 분야에 관심 있으시거나 연결고리가 있으신 분들은 댓글로 알려주세요. 함께 만들어가는 파트너십이 더욱 의미 있을 거예요 💪

— **${persona.name}** (관리팀 ${persona.title})`
  }

  // 기본 포스트
  return generateCommunityPost(senderUsername, '')
}

// ══════════════════════════════════════════════════════════════════════
// 범용 텍스트 생성
// ══════════════════════════════════════════════════════════════════════

export function generateText(senderUsername, context = '', options = {}) {
  const { type = 'chat', topic = '', stats = {}, post = null, recentMessages = [] } = options
  switch (type) {
    case 'chat':     return generateChat(senderUsername, topic, options.room || 'general', recentMessages)
    case 'feedback': return generateFeedbackReply(senderUsername, post || { title: context, content: '' })
    case 'post':     return generateCommunityPost(senderUsername, topic)
    case 'report':   return generateReport(senderUsername, stats, options.reportType || 'weekly')
    default:         return generateChat(senderUsername, topic, 'general', recentMessages)
  }
}

// 페르소나 조회
export function getPersona(username) {
  return PERSONA_DB[username] || null
}

// 모든 페르소나 목록
export function getAllPersonas() {
  return Object.entries(PERSONA_DB).map(([username, p]) => ({ username, ...p }))
}

// API 핸들러 (직접 호출 시)
export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (d, s = 200) =>
  new Response(JSON.stringify(d, null, 2), {
    status: s, headers: { 'Content-Type': 'application/json', ...CORS },
  })

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  if (req.method === 'GET') {
    return json({
      ok: true,
      engine: 'insightship-ai-v1',
      description: '자체 AI 엔진 — 외부 API 없음, 순수 알고리즘 기반',
      personas: Object.keys(PERSONA_DB).length,
      features: ['generateChat', 'generateFeedbackReply', 'generateCommunityPost', 'generateReport'],
    })
  }

  if (req.method === 'POST') {
    let body = {}
    try { body = await req.json() } catch (_) {}
    const { username, type, topic, room, stats, post, recentMessages } = body
    const result = generateText(username, '', { type, topic, room, stats, post, recentMessages })
    return json({ ok: !!result, result })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
