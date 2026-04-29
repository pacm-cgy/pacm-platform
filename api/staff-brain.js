/**
 * api/staff-brain.js
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP 자체 AI 브레인 엔진 v1.0                               ║
 * ║  외부 API 0개 — 완전 자체 구동                                       ║
 * ║                                                                      ║
 * ║  핵심 철학:                                                          ║
 * ║  1. 각 직원은 독립적 사고 (다른 직원 생각을 미리 알 수 없음)        ║
 * ║  2. 업무 시간대별 자연스러운 활동 패턴                               ║
 * ║  3. 팀별 전문성과 말투 차이 반영                                     ║
 * ║  4. 서로의 메시지를 읽은 후에만 반응 가능                            ║
 * ║  5. 사람처럼 불완전하고 개성 있는 표현                               ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

// ══════════════════════════════════════════════════════════════════════
// 시간대별 활동 레벨 (KST 기준)
// ══════════════════════════════════════════════════════════════════════

export function getKSTHour() {
  return (new Date().getUTCHours() + 9) % 24
}

export function getActivityLevel() {
  const h = getKSTHour()
  if (h >= 0  && h < 6)  return 'sleep'    // 00~06: 거의 없음
  if (h >= 6  && h < 9)  return 'morning'  // 06~09: 출근 준비
  if (h >= 9  && h < 12) return 'work_am'  // 09~12: 오전 업무 피크
  if (h >= 12 && h < 14) return 'lunch'    // 12~14: 점심 (활동 약간 감소)
  if (h >= 14 && h < 18) return 'work_pm'  // 14~18: 오후 업무
  if (h >= 18 && h < 21) return 'evening'  // 18~21: 저녁 (마무리)
  if (h >= 21 && h < 23) return 'night'    // 21~23: 야간 당직
  return 'late'                             // 23~00: 마감
}

// 시간대별 활성 직원 수
export function getActiveWorkerCount(level) {
  return { sleep: 1, morning: 3, work_am: 12, lunch: 6, work_pm: 14, evening: 8, night: 4, late: 2 }[level] ?? 6
}

// 지금 이 직원이 활성 상태인지 (업무시간 + 팀별 스케줄)
export function isWorkerActive(memberKey, level) {
  if (level === 'sleep') {
    // 야간 당직팀: 운영팀/뉴스팀만
    return ['ARIA','PULSE','NWS_CLAM'].includes(memberKey)
  }
  if (level === 'morning') {
    // 아침: 운영팀, 뉴스팀, 커뮤니티팀
    const morningTeams = ['ARIA','OPS_JUNE','OPS_RAY','PULSE','HANA','CMM_JADE','MAX']
    return morningTeams.includes(memberKey)
  }
  if (level === 'lunch') {
    // 점심: 소수만 (커뮤니티, 뉴스)
    const lunchTeams = ['HANA','PULSE','ECHO','NOVA','CMM_JADE','NWS_VERO']
    return lunchTeams.includes(memberKey)
  }
  if (level === 'night') {
    // 야간: 기술팀, 분석팀 일부
    const nightTeams = ['LEARN','TREND','TCH_VEGA','ANL_MIKO','MAX','MGT_VERA']
    return nightTeams.includes(memberKey)
  }
  // 일반 업무 시간: 모두 가능
  return true
}

// ══════════════════════════════════════════════════════════════════════
// 직원 성격 & 말투 정의 (100명 커버)
// ══════════════════════════════════════════════════════════════════════

const PERSONA_BANK = {
  // 운영팀
  ARIA:      { style:'formal_warm',    emoji_freq:'medium', catchphrase:'운영팀 ARIA입니다', mood_words:['안내드립니다','공유드립니다','확인 부탁드립니다'] },
  OPS_JUNE:  { style:'cheerful',       emoji_freq:'high',   catchphrase:'주니어 JUNE이에요', mood_words:['넵!','알겠습니다!','바로 처리할게요!'] },
  OPS_RAY:   { style:'casual',         emoji_freq:'medium', catchphrase:'REY입니다',          mood_words:['오케이','확인했어요','그렇군요'] },
  OPS_MINA:  { style:'warm',           emoji_freq:'high',   catchphrase:'미나예요 :)',         mood_words:['감사해요','좋은 생각이에요','힘내세요!'] },
  OPS_KEN:   { style:'brief',          emoji_freq:'low',    catchphrase:'KEN',                mood_words:['확인','처리','완료'] },
  OPS_TARA:  { style:'formal',         emoji_freq:'low',    catchphrase:'타라입니다',          mood_words:['검토하겠습니다','보고드리겠습니다','반영하겠습니다'] },
  OPS_FINN:  { style:'casual',         emoji_freq:'medium', catchphrase:'핀이에요',            mood_words:['오 그거','알죠','맞아요'] },
  OPS_DANA:  { style:'analytical',     emoji_freq:'low',    catchphrase:'데이터로 보면',       mood_words:['분석해보면','수치 기준으로','통계적으로'] },
  OPS_ZARA:  { style:'warm',           emoji_freq:'high',   catchphrase:'ZARA예요',           mood_words:['응원해요','같이해요','화이팅!'] },
  OPS_LEON:  { style:'brief',          emoji_freq:'low',    catchphrase:'LEON',               mood_words:['완료','처리','확인'] },
  // 콘텐츠팀
  NOVA:      { style:'creative',       emoji_freq:'medium', catchphrase:'편집장 NOVA입니다',   mood_words:['흥미롭네요','이 관점에서 보면','콘텐츠적으로'] },
  CNT_IRIS:  { style:'expressive',     emoji_freq:'high',   catchphrase:'IRIS예요',           mood_words:['와!','정말요?','그 아이디어 좋은데요!'] },
  CNT_ALEX:  { style:'intellectual',   emoji_freq:'low',    catchphrase:'알렉스입니다',        mood_words:['연구에 따르면','사례를 보면','맥락을 보면'] },
  CNT_VIVI:  { style:'cheerful',       emoji_freq:'high',   catchphrase:'비비예요',           mood_words:['맞아요!','저도요!','대박이다!'] },
  CNT_OWEN:  { style:'casual',         emoji_freq:'medium', catchphrase:'오웬',               mood_words:['그렇죠','흠','생각해보면'] },
  CNT_LENA:  { style:'warm',           emoji_freq:'medium', catchphrase:'레나입니다',          mood_words:['공감해요','맞는 말씀이에요','잘 됐으면 좋겠네요'] },
  CNT_SETH:  { style:'brief',          emoji_freq:'low',    catchphrase:'SETH',               mood_words:['맞습니다','네','알겠어요'] },
  CNT_FAYE:  { style:'creative',       emoji_freq:'medium', catchphrase:'페이예요',           mood_words:['아이디어를 더하자면','다른 각도에서','창의적으로'] },
  CNT_BREN:  { style:'casual',         emoji_freq:'medium', catchphrase:'브렌',               mood_words:['오케이','그거 괜찮은데','해볼게요'] },
  CNT_NIKA:  { style:'warm',           emoji_freq:'high',   catchphrase:'니카예요',           mood_words:['감사해요','저도 배웠어요','응원합니다!'] },
  // 멘토링팀
  LUMI:      { style:'wise',           emoji_freq:'medium', catchphrase:'멘토 LUMI입니다',    mood_words:['제 경험상','중요한 것은','한 가지 팁은'] },
  MNT_BORA:  { style:'warm',           emoji_freq:'high',   catchphrase:'보라예요',           mood_words:['할 수 있어요!','같이 생각해봐요','응원해요'] },
  MNT_COLE:  { style:'analytical',     emoji_freq:'low',    catchphrase:'콜입니다',           mood_words:['구조적으로 보면','단계별로','체계적으로'] },
  MNT_YUNA:  { style:'cheerful',       emoji_freq:'high',   catchphrase:'유나예요',           mood_words:['맞아요!','좋은 질문이에요!','같이해봐요!'] },
  MNT_JAKE:  { style:'casual',         emoji_freq:'medium', catchphrase:'제이크',             mood_words:['그렇죠','음','사실'] },
  MNT_ROMI:  { style:'expressive',     emoji_freq:'high',   catchphrase:'로미예요',           mood_words:['와','어마어마하다','대단해요!'] },
  // 뉴스팀
  PULSE:     { style:'fast_news',      emoji_freq:'medium', catchphrase:'뉴스팀 PULSE입니다', mood_words:['속보','방금 확인했는데','최신 동향으로는'] },
  NWS_CLAM:  { style:'brief',          emoji_freq:'low',    catchphrase:'클램',               mood_words:['확인','업데이트','처리'] },
  NWS_VERO:  { style:'formal',         emoji_freq:'low',    catchphrase:'베로입니다',         mood_words:['보도에 따르면','기사에서','공식 발표로는'] },
  NWS_MONT:  { style:'casual',         emoji_freq:'medium', catchphrase:'몽트',               mood_words:['오 이거','재밌는 뉴스인데','놓치지 마세요'] },
  NWS_SKYE:  { style:'warm',           emoji_freq:'medium', catchphrase:'스카이예요',         mood_words:['좋은 소식이에요','희망적이네요','기대됩니다'] },
  // 분석팀
  TREND:     { style:'analytical',     emoji_freq:'medium', catchphrase:'분석팀 TREND입니다', mood_words:['데이터를 보면','트렌드 상으로는','분석 결과'] },
  ANL_MIKO:  { style:'intellectual',   emoji_freq:'low',    catchphrase:'미코입니다',         mood_words:['상관관계','인과관계','통계적으로'] },
  ANL_DINO:  { style:'casual',         emoji_freq:'medium', catchphrase:'디노',               mood_words:['오 흥미롭네','그 수치','의미있는데'] },
  ANL_REVA:  { style:'warm',           emoji_freq:'medium', catchphrase:'레바예요',           mood_words:['잘 분석하셨네요','중요한 포인트예요','공감해요'] },
  // 리포트팀
  SAGE:      { style:'formal_wise',    emoji_freq:'low',    catchphrase:'리포트팀 SAGE입니다',mood_words:['종합해보면','리포트 기준으로','이번 주 핵심은'] },
  RPT_IVAN:  { style:'formal',         emoji_freq:'low',    catchphrase:'이반입니다',         mood_words:['보고드립니다','확인했습니다','기록하겠습니다'] },
  RPT_ELIA:  { style:'warm',           emoji_freq:'medium', catchphrase:'엘리아예요',         mood_words:['잘 정리하셨네요','도움이 됐어요','감사해요'] },
  // 뉴스레터팀
  ECHO:      { style:'friendly_media', emoji_freq:'high',   catchphrase:'뉴스레터팀 ECHO예요',mood_words:['독자 여러분','이번 주 하이라이트','구독 감사해요'] },
  NWL_RUBY:  { style:'warm',           emoji_freq:'high',   catchphrase:'루비예요',           mood_words:['예쁜 콘텐츠 만들어요','독자 반응이','따뜻하게'] },
  // 기술팀
  LEARN:     { style:'technical',      emoji_freq:'low',    catchphrase:'기술팀 LEARN입니다', mood_words:['시스템 상으로','기술적으로','코드 기준으로'] },
  TCH_VEGA:  { style:'analytical',     emoji_freq:'low',    catchphrase:'베가',               mood_words:['퍼포먼스 보면','최적화하면','구조적으로'] },
  TCH_AXIS:  { style:'brief',          emoji_freq:'low',    catchphrase:'AXIS',               mood_words:['배포','업데이트','수정'] },
  // 커뮤니티팀
  HANA:      { style:'community_warm', emoji_freq:'high',   catchphrase:'커뮤팀 HANA예요',   mood_words:['멤버분들','함께해요','커뮤니티가 살아있어요'] },
  CMM_JADE:  { style:'cheerful',       emoji_freq:'high',   catchphrase:'제이드예요',         mood_words:['환영해요!','좋아요!','우리 커뮤니티!'] },
  CMM_BEAU:  { style:'casual',         emoji_freq:'medium', catchphrase:'보우',               mood_words:['맞아요','그 분위기','재밌겠는데'] },
  // 관리팀
  MAX:       { style:'leader',         emoji_freq:'medium', catchphrase:'관리팀장 MAX입니다', mood_words:['전략적으로','팀 관점에서','중요한 결정입니다'] },
  MGT_VERA:  { style:'formal',         emoji_freq:'low',    catchphrase:'베라입니다',         mood_words:['보고드립니다','확인하겠습니다','처리하겠습니다'] },
  MGT_ALBA:  { style:'pr_style',       emoji_freq:'medium', catchphrase:'알바 PR매니저예요',  mood_words:['브랜드 관점에서','대외적으로','홍보적으로'] },
}

// 기본 페르소나 (미등록 직원)
const DEFAULT_PERSONA = { style:'casual', emoji_freq:'medium', catchphrase:'안녕하세요', mood_words:['네','맞아요','감사해요'] }

export function getPersona(memberKey) {
  return PERSONA_BANK[memberKey] || DEFAULT_PERSONA
}

// ══════════════════════════════════════════════════════════════════════
// 이모지 뱅크 (팀별)
// ══════════════════════════════════════════════════════════════════════

const TEAM_EMOJIS = {
  operations:  ['⚙️','📢','📌','✅','🔔'],
  content:     ['✍️','📝','💬','🖊️','📚'],
  mentoring:   ['💡','🚀','🌱','🎯','🤝'],
  news:        ['📡','📰','⚡','🔍','📊'],
  analytics:   ['📊','📈','🔬','💹','🧮'],
  report:      ['📋','📑','🗂️','📜','📄'],
  newsletter:  ['📬','💌','📧','🗞️','✉️'],
  tech:        ['🔬','⚡','🛠️','💻','🔧'],
  community:   ['🤝','🌟','💬','🎉','❤️'],
  management:  ['🏛️','🎯','📌','✅','💼'],
}

function pickEmoji(team, freq) {
  const pool = TEAM_EMOJIS[team] || ['💬']
  if (freq === 'high')   return pool[Math.floor(Math.random() * pool.length)] + ' '
  if (freq === 'low')    return Math.random() > 0.7 ? pool[0] + ' ' : ''
  return Math.random() > 0.5 ? pool[Math.floor(Math.random() * pool.length)] + ' ' : ''
}

// ══════════════════════════════════════════════════════════════════════
// 콘텐츠 템플릿 뱅크 (팀별 × 상황별)
// ══════════════════════════════════════════════════════════════════════

const TOPIC_BANK = {
  operations: {
    post: [
      ['이번 주 플랫폼 공지사항', '안녕하세요! 이번 주 플랫폼 업데이트 내용을 공유드립니다. 새로운 기능들이 추가됐으니 꼭 확인해보세요 😊', '운영','공지'],
      ['신규 멤버 온보딩 가이드', 'Insightship에 처음 오신 분들을 위해 플랫폼 활용 가이드를 정리했어요. 궁금한 점은 언제든 댓글로 남겨주세요!', '가이드','온보딩'],
      ['커뮤니티 이용 수칙 안내', '서로 존중하는 커뮤니티를 위해 이용 수칙을 한 번씩 확인해 주시면 감사하겠습니다 🙏', '공지','수칙'],
      ['이번 달 이벤트 안내', '이번 달도 다양한 이벤트가 준비되어 있어요! 많은 참여 부탁드립니다 🎉', '이벤트','공지'],
      ['플랫폼 점검 안내', '더 나은 서비스를 위해 시스템 점검을 진행합니다. 잠시 불편하시더라도 양해 부탁드려요!', '공지','점검'],
    ],
    comment: [
      '좋은 내용 감사합니다! 운영팀에서도 참고하겠습니다.',
      '저도 공감해요. 이런 의견들이 플랫폼 발전에 큰 도움이 됩니다 🙏',
      '소중한 피드백 감사드려요! 팀과 공유하겠습니다.',
      '맞는 말씀이에요. 운영 방향에 반영할게요.',
      '감사합니다! 더 나은 Insightship이 될 수 있도록 노력하겠습니다 ✅',
    ],
  },
  content: {
    post: [
      ['이번 주 추천 아티클 TOP 3', '이번 주 꼭 읽어봐야 할 아티클 3편을 선정했어요 ✍️ 스타트업 창업에 관심 있다면 놓치지 마세요!', '아티클','추천'],
      ['창업 에디터 칼럼: 요즘 뜨는 스타트업 트렌드', '요즘 투자자들이 주목하는 분야가 바뀌고 있어요. 콘텐츠팀에서 분석한 내용을 공유합니다.', '칼럼','트렌드'],
      ['스타트업 인터뷰: 창업 초기 이야기', '성공한 창업가들의 초기 이야기에서 배울 점들을 정리했어요. 생각보다 많은 시행착오가 있었답니다.', '인터뷰','창업'],
      ['글쓰기로 브랜드 만들기', '콘텐츠는 스타트업의 목소리예요. 잘 쓴 글 하나가 수백 명의 팬을 만들 수 있어요 📝', '브랜딩','콘텐츠'],
      ['편집팀의 아티클 작성 비법', '좋은 아티클이란 무엇인가? 편집팀에서 직접 경험한 노하우를 공유드려요.', '팁','아티클'],
    ],
    comment: [
      '좋은 시각이에요! 저도 비슷한 사례를 취재한 적 있어요.',
      '콘텐츠 관점에서 정말 중요한 포인트예요 ✍️',
      '이런 이야기들이 실제로 도움이 많이 돼요. 공유 감사해요!',
      '편집장 입장에서 정말 공감가는 내용이네요.',
      '독자들이 좋아할 것 같아요! 좋은 글이에요.',
    ],
  },
  mentoring: {
    post: [
      ['창업 아이디어 검증 3단계', '좋은 아이디어도 검증 없이 시작하면 실패할 수 있어요. 제가 정리한 3단계 검증법을 알려드릴게요 💡', '멘토링','창업'],
      ['MVP: 빠르게 만들고 빠르게 배우기', '완벽한 제품을 만들려다 실패하는 창업자들이 많아요. MVP의 진짜 의미를 다시 생각해봐요.', '멘토링','MVP'],
      ['투자자가 정말 보는 것들', '피치덱 100장보다 중요한 게 있어요. 투자자의 눈으로 스타트업을 바라보는 법을 공유해드릴게요.', '투자','멘토링'],
      ['공동창업자, 어떻게 찾나요?', '혼자 하는 창업 vs 함께하는 창업. 공동창업자를 찾을 때 꼭 확인해야 할 것들이에요.', '창업팀','멘토링'],
      ['첫 고객 100명 확보하는 방법', '초기 스타트업에게 가장 중요한 건 첫 진짜 팬 100명이에요. 어떻게 찾을까요?', '고객','성장'],
    ],
    comment: [
      '정말 중요한 포인트예요 💡 창업 초기에 꼭 필요한 내용이에요.',
      '멘토링하면서 가장 많이 하는 얘기예요. 좋은 공유 감사해요!',
      '이 부분에서 많은 분들이 실수하더라고요. 잘 정리해주셨어요.',
      '제 경험에도 이게 가장 중요했어요. 공감 백배!',
      '창업 준비하시는 분들 꼭 읽어보세요 🚀',
    ],
  },
  news: {
    post: [
      ['오늘의 스타트업 뉴스 픽 🔥', '오늘 놓치면 안 되는 스타트업 소식들을 정리했어요. 짧지만 임팩트 있는 뉴스들이에요 📡', '뉴스','스타트업'],
      ['이번 주 투자 소식 정리', '이번 주 국내외 주요 투자 소식들이에요. 어떤 분야에 돈이 몰리는지 보면 트렌드가 보여요.', '투자','뉴스'],
      ['해외 스타트업 동향', '실리콘밸리와 동남아 스타트업 씬에서 무슨 일이 일어나고 있는지 살펴봤어요 🌏', '해외','동향'],
      ['정책 변화와 창업 기회', '규제가 바뀌면 새로운 비즈니스 기회가 생겨요. 최근 정책 변화에서 기회를 찾아봤어요.', '정책','기회'],
      ['AI 스타트업 최신 소식', 'AI 스타트업 씬이 정말 빠르게 변하고 있어요. 이번 주 주요 소식들을 모았어요 🤖', 'AI','스타트업'],
    ],
    comment: [
      '이 뉴스 저도 봤는데 정말 중요한 시그널인 것 같아요 📡',
      '빠른 공유 감사해요! 팀에서도 모니터링하고 있어요.',
      '이 분야 계속 지켜봐야 할 것 같네요.',
      '좋은 정리예요. 많은 분들이 봐야 할 내용이에요.',
      '뉴스팀에서도 비슷한 트렌드를 감지했어요 ⚡',
    ],
  },
  analytics: {
    post: [
      ['이번 주 시장 트렌드 분석', '뉴스 데이터를 기반으로 이번 주 가장 뜨거운 키워드와 트렌드를 분석했어요 📊', '분석','트렌드'],
      ['VC 투자 패턴 변화 감지', '최근 VC들의 투자 패턴이 눈에 띄게 달라지고 있어요. 데이터로 확인한 변화들을 공유합니다.', 'VC','투자분석'],
      ['스타트업 키워드 급상승 리포트', '이번 주 급상승한 창업 키워드 TOP 5예요. 어디에 관심이 집중되는지 한눈에 보여요.', '키워드','리포트'],
      ['B2B vs B2C 스타트업 비교 분석', '최근 트렌드는 B2B 쪽으로 기울고 있어요. 데이터로 살펴봤어요 📈', 'B2B','분석'],
      ['스타트업 생존율 데이터 분석', '창업 5년 차 이후 생존하는 스타트업의 공통점을 데이터로 분석했어요.', '생존율','데이터'],
    ],
    comment: [
      '데이터가 말해주네요. 좋은 분석이에요 📊',
      '이 수치 저도 놀랐어요. 시장이 빠르게 변하고 있어요.',
      '분석팀에서도 비슷한 패턴을 발견했어요.',
      '숫자로 보니까 더 명확하네요. 감사해요!',
      '이 인사이트 굉장히 유용해요. 공유 감사합니다!',
    ],
  },
  report: {
    post: [
      ['주간 생태계 리포트 발행', '이번 주 스타트업 생태계를 종합 분석한 리포트를 발행합니다. 투자·뉴스·커뮤니티 트렌드를 모두 담았어요 📋', '리포트','주간'],
      ['이번 달 주요 M&A 동향', '이번 달 스타트업 인수합병 소식들을 정리했어요. 어떤 분야에서 M&A가 활발한지 보세요.', 'M&A','리포트'],
      ['투자 라운드 분석: 어디에 돈이 몰리나', 'Series A부터 IPO까지, 이번 달 투자 라운드 흐름을 분석했어요.', '투자','시리즈'],
      ['ESG 트렌드와 스타트업 기회', '환경·사회·지배구조(ESG)가 스타트업 투자 기준이 되고 있어요. 기회를 정리했습니다.', 'ESG','기회'],
      ['월간 플랫폼 활동 리포트', '이번 달 Insightship 플랫폼의 주요 활동 지표들을 정리했어요 📑', '월간','플랫폼'],
    ],
    comment: [
      '잘 정리된 리포트예요. 리포트팀이 더 추가한 내용이 있어요 📋',
      '이번 주 리포트에도 반영할 내용이네요. 감사해요!',
      '종합적인 시각이 중요하죠. 좋은 공유예요.',
      '리포트 작성에 참고하겠습니다 📊',
      '이 데이터 유용하네요. 주간 리포트에 담겠습니다.',
    ],
  },
  newsletter: {
    post: [
      ['이번 주 뉴스레터 하이라이트', '매주 월요일 아침, 꼭 알아야 할 창업 인사이트를 담아요. 이번 주 미리보기 공개! 📬', '뉴스레터','미리보기'],
      ['구독자 1000명 돌파 감사해요', '뉴스레터 구독자 분들 덕분에 여기까지 올 수 있었어요. 진심으로 감사드립니다 💌', '구독','감사'],
      ['뉴스레터 이번 주 특집: 창업 자금조달', '이번 주 특집은 창업 초기 자금 조달이에요. 놓치지 마세요!', '뉴스레터','특집'],
      ['독자 반응 공유 — 이런 피드백을 받았어요', '독자분들의 따뜻한 응원과 피드백 덕분에 계속 할 수 있어요 📧', '독자','피드백'],
      ['뉴스레터 구독하고 창업 인사이트 받아가세요', '매주 월요일 아침마다 유용한 창업 정보를 이메일로 받아보실 수 있어요!', '구독','안내'],
    ],
    comment: [
      '이번 주 뉴스레터에도 담아볼게요! 좋은 내용이에요 📬',
      '독자분들이 좋아할 것 같아요. 큐레이션하겠습니다.',
      '뉴스레터 구독 안 하신 분들 꼭 해보세요 💌',
      '이런 내용들이 구독자들한테 정말 인기예요.',
      '이번 주 하이라이트 내용이 되겠는걸요 ✉️',
    ],
  },
  tech: {
    post: [
      ['플랫폼 성능 개선 완료', '이번 업데이트로 페이지 로딩 속도가 크게 빨라졌어요. 개선된 사항들을 공유합니다 🔬', '기술','성능'],
      ['AI 시스템 학습 업데이트', 'AI 멘토 시스템이 업데이트됐어요. 더 정확하고 유용한 답변을 드릴 수 있게 됐습니다.', 'AI','업데이트'],
      ['보안 강화 작업 완료', '플랫폼 보안을 한층 강화했어요. 안심하고 사용하세요! 🛡️', '보안','업데이트'],
      ['모바일 UX 개선 완료', '모바일에서 훨씬 편하게 사용하실 수 있게 됐어요. 업데이트 내용을 확인해보세요.', '모바일','UX'],
      ['검색 기능 대폭 개선', '더 빠르고 정확한 검색이 가능해졌어요. 검색 고도화 작업을 마쳤습니다 🔍', '검색','개선'],
    ],
    comment: [
      '기술팀에서 계속 모니터링하고 있어요 🔬',
      '이 부분 개선하면 성능이 눈에 띄게 좋아질 것 같네요.',
      '기술적으로 가능한 방향이에요. 검토해보겠습니다.',
      '피드백 감사해요! 다음 업데이트에 반영할게요.',
      '시스템 안정성 측면에서 중요한 포인트예요.',
    ],
  },
  community: {
    post: [
      ['이번 주 커뮤니티 하이라이트', '이번 주 커뮤니티에서 가장 뜨거웠던 대화들을 정리했어요 🤝 함께 성장하는 것 같아 너무 좋아요!', '커뮤니티','하이라이트'],
      ['주간 토론 시작합니다!', '이번 주 토론 주제를 오픈합니다. 자유롭게 의견 남겨주세요 💬 정답은 없어요, 다양한 시각이 중요해요!', '토론','커뮤니티'],
      ['신규 멤버 환영 이벤트', '이번 달 새로 오신 멤버분들 환영해요! 🎉 Insightship은 여러분과 함께 성장합니다.', '신규멤버','환영'],
      ['네트워킹 챌린지 시작', '이번 주는 서로 인사하는 주간이에요! 댓글로 자기소개 남겨주세요 🌟', '네트워킹','챌린지'],
      ['우수 멤버 이달의 인물 소개', '매달 커뮤니티에 가장 큰 기여를 한 멤버를 소개해요. 이번 달 주인공은...! ❤️', '우수멤버','소개'],
    ],
    comment: [
      '커뮤니티가 점점 활성화되고 있어요! 정말 좋아요 🌟',
      '이런 이야기들이 커뮤니티를 살게 해요. 감사해요!',
      '멤버분들 덕분에 이 공간이 따뜻해지네요 ❤️',
      '우리 커뮤니티 최고! 계속 이런 분위기였으면 좋겠어요 🤝',
      '활발한 참여 감사합니다! 커뮤니티팀에서 열심히 지원할게요.',
    ],
  },
  management: {
    post: [
      ['이번 주 운영 방향 공유', '한 주를 시작하며 Insightship의 이번 주 운영 방향을 공유합니다. 모든 팀이 힘을 합쳐 나아가는 한 주가 되길 바랍니다 🏛️', '경영','전략'],
      ['플랫폼 성장 스토리', 'Insightship이 지금까지 걸어온 길을 돌아봤어요. 여러분 덕분에 여기까지 왔습니다. 진심으로 감사드려요.', '성장','스토리'],
      ['파트너십 소식 공유', '새로운 파트너와 함께 더 좋은 서비스를 만들어가게 됐어요. 좋은 소식이 기대되네요 🎯', '파트너십','소식'],
      ['팀원들에게 드리는 한마디', '매일 열심히 일하는 모든 팀원들에게 감사해요. 여러분이 Insightship의 진짜 힘이에요 💼', '격려','팀'],
      ['Q2 목표 공유', '올해 2분기 주요 목표들을 투명하게 공유합니다. 함께 달성해봐요!', '목표','Q2'],
    ],
    comment: [
      '전략적으로 매우 중요한 포인트예요. 잘 검토해보겠습니다 🎯',
      '팀 전체와 공유하겠습니다. 좋은 의견이에요.',
      '경영진으로서 이 방향이 맞다고 생각해요.',
      '중요한 결정이에요. 신중하게 접근하겠습니다.',
      'Insightship의 미래를 위해 꼭 필요한 변화예요 ✅',
    ],
  },
}

// 기본 은행 (팀 미정)
const DEFAULT_TOPIC_BANK = {
  post: [['플랫폼 공유', '오늘 업무 중 공유하고 싶은 내용을 남겨요.', '공유','업무']],
  comment: ['좋은 내용이에요!', '공감해요.', '감사합니다!'],
}

// ══════════════════════════════════════════════════════════════════════
// 채팅 전용 메시지 템플릿 (직원 간 소통)
// ══════════════════════════════════════════════════════════════════════

const CHAT_MESSAGES = {
  // 업무 시작 인사 (morning, work_am)
  greeting: [
    '좋은 아침이에요! 오늘도 열심히 해봐요 ☀️',
    '안녕하세요! 오늘 업무 시작합니다',
    '굿모닝~ 오늘도 잘 부탁드려요!',
    '출근했어요! 오늘 할 일 많네요 😄',
    '안녕하세요, 오늘 업무 시작할게요!',
  ],
  // 업무 보고 (work_am, work_pm)
  report: [
    '오전 업무 현황 공유드려요. 현재 [팀명] 쪽 작업 진행 중입니다',
    '방금 [작업내용] 완료했어요! 확인 부탁드려요',
    '오늘 할 일 목록 공유드립니다: [작업목록] 순서로 진행할게요',
    '[작업] 처리 완료됐어요. 다음 단계로 넘어가겠습니다',
    '현재 [업무] 진행 중입니다. 오후에 완료 예정이에요',
  ],
  // 협업 요청 / 의견 교환
  collaborate: [
    '이 부분에 대해 다른 분들 의견도 듣고 싶어요',
    '혹시 [주제]에 대해 아는 분 있나요?',
    '[팀명]팀이랑 협의가 필요할 것 같아요, 어떻게 생각하세요?',
    '이 방향으로 진행해도 될까요? 의견 주세요!',
    '다들 어떻게 접근하고 계신가요? 노하우 공유해요',
  ],
  // 피드백 채널
  feedback_response: [
    '유저 피드백 확인했어요. 우리 팀에서 처리 가능한 부분이 있어요',
    '이 피드백 정말 중요한 것 같아요. 빨리 반영해야 할 것 같은데요',
    '피드백 감사해요. 개선 방향을 팀에서 논의해보겠습니다',
    '이 부분은 [팀명]팀과 협의해서 해결해야 할 것 같아요',
    '유저분들이 이런 불편함을 느끼고 계시는군요. 빠르게 대응할게요',
  ],
  // 업무 마무리 (evening)
  closing: [
    '오늘 하루 고생하셨어요! 내일 또 열심히 해봐요 🌙',
    '업무 마무리할게요. 다들 수고하셨습니다!',
    '오늘 할 일 다 완료했어요. 내일 봐요!',
    '퇴근 전 마지막 보고: 오늘 [업무] 완료했습니다',
    '내일 아침에 다시 볼게요. 편안한 밤 되세요 😊',
  ],
  // 전략/기획 채널
  strategy: [
    '이번 분기 주요 목표에 대해 논의해봐요',
    '사용자 피드백 분석 결과를 공유드릴게요',
    '다음 달 계획에서 이 부분을 더 강화해야 할 것 같아요',
    '경쟁사 동향 보고드릴게요. 우리가 대응해야 할 포인트가 있어요',
    '이 전략 방향이 맞는 것 같은데, 다들 어떻게 생각하세요?',
  ],
  // 일반 소통
  casual: [
    '오늘 업무 잘 되고 있나요? 😊',
    '참고로 이런 내용이 있어서 공유해요',
    '방금 재미있는 기사 읽었는데 공유할게요',
    '다들 점심 드셨나요? 오후도 파이팅!',
    '작은 업무 팁 하나 공유할게요',
  ],
}

// 상황별 메시지 선택
export function pickChatMessage(context, memberKey, roomId) {
  const persona = getPersona(memberKey)
  const level   = getActivityLevel()
  const h       = getKSTHour()

  let pool
  if (roomId === 'strategy') {
    pool = CHAT_MESSAGES.strategy
  } else if (roomId === 'feedback') {
    pool = CHAT_MESSAGES.feedback_response
  } else if (roomId === 'ops') {
    pool = CHAT_MESSAGES.report
  } else if (h >= 6 && h < 10) {
    pool = CHAT_MESSAGES.greeting
  } else if (h >= 17 && h < 21) {
    pool = CHAT_MESSAGES.closing
  } else if (level === 'work_am' || level === 'work_pm') {
    pool = Math.random() > 0.5 ? CHAT_MESSAGES.report : CHAT_MESSAGES.collaborate
  } else {
    pool = CHAT_MESSAGES.casual
  }

  const base = pool[Math.floor(Math.random() * pool.length)]
  // 맥락 치환 (간단한 [태그] 치환)
  const msg = base
    .replace('[팀명]', context.team || '담당')
    .replace('[작업내용]', context.task || '업무')
    .replace('[작업목록]', context.tasks || '주요 업무')
    .replace('[작업]', context.task || '업무')
    .replace('[업무]', context.task || '오늘 업무')
    .replace('[주제]', context.topic || '이 주제')

  // 말투 적용
  const moodWord = persona.mood_words[Math.floor(Math.random() * persona.mood_words.length)]
  return moodWord && Math.random() > 0.6 ? `${moodWord} ${msg}` : msg
}

// ══════════════════════════════════════════════════════════════════════
// 커뮤니티 게시글 생성 (외부 API 없음)
// ══════════════════════════════════════════════════════════════════════

export function generatePostContent(memberKey, team, recentNewsTitles = []) {
  const bank  = TOPIC_BANK[team] || DEFAULT_TOPIC_BANK
  const pool  = bank.post
  const pick  = pool[Math.floor(Math.random() * pool.length)]
  const persona = getPersona(memberKey)
  const emoji = pickEmoji(team, persona.emoji_freq)

  let [title, body, ...tags] = pick

  // 뉴스 참조가 있으면 본문에 녹여넣기
  if (recentNewsTitles.length > 0) {
    const ref = recentNewsTitles[Math.floor(Math.random() * recentNewsTitles.length)]
    const connectors = ['최근 이런 기사도 있었는데요: ', '관련해서 이런 소식도 있어요: ', '참고로 ', '덧붙이면 ']
    const conn = connectors[Math.floor(Math.random() * connectors.length)]
    body += `\n\n${conn}${ref.slice(0, 60)}...`
  }

  // 말투 개인화
  const moodWord = persona.mood_words[Math.floor(Math.random() * persona.mood_words.length)]
  if (Math.random() > 0.5) {
    body = `${moodWord} ` + body
  }

  // 이모지 추가
  body = emoji + body

  return { title, body, tags }
}

// ══════════════════════════════════════════════════════════════════════
// 댓글 생성
// ══════════════════════════════════════════════════════════════════════

export function generateComment(memberKey, team, postTitle = '') {
  const bank = TOPIC_BANK[team] || DEFAULT_TOPIC_BANK
  const pool = bank.comment
  const persona = getPersona(memberKey)
  const emoji   = pickEmoji(team, persona.emoji_freq)

  let base = pool[Math.floor(Math.random() * pool.length)]

  // 게시글 제목과 연관 맺기
  if (postTitle && Math.random() > 0.6) {
    const links = [`"${postTitle.slice(0, 20)}" 관련해서 `, '이 주제에서 ', '특히 이 부분이 인상적이었어요: ']
    base = links[Math.floor(Math.random() * links.length)] + base
  }

  const moodWord = persona.mood_words[Math.floor(Math.random() * persona.mood_words.length)]
  const result = Math.random() > 0.5 ? `${moodWord} ${base}` : base
  return emoji + result
}

// ══════════════════════════════════════════════════════════════════════
// AI 토론 / 직원 간 대화 생성 (채팅방용)
// ══════════════════════════════════════════════════════════════════════

export function generateDiscussionMessage(memberKey, team, topic, roomId, priorMessages = []) {
  const persona = getPersona(memberKey)
  const emoji   = pickEmoji(team, persona.emoji_freq)
  const h       = getKSTHour()

  // 이전 메시지에서 키워드 추출 (상대방 생각 읽기)
  let reactionPrefix = ''
  if (priorMessages.length > 0) {
    const lastMsg = priorMessages[priorMessages.length - 1]
    const reactions = ['말씀하신 대로 ', '그 부분에 동의해요. ', '조금 다르게 생각하면 ', '좋은 포인트예요! ']
    // 50% 확률로 이전 메시지에 반응
    if (Math.random() > 0.5) {
      reactionPrefix = reactions[Math.floor(Math.random() * reactions.length)]
    }
  }

  // 토픽 기반 의견 생성
  const opinionTemplates = [
    `${topic}에 대해서 ${team} 관점에서 말씀드리면, 가장 중요한 건 실행력이라고 생각해요.`,
    `${topic} 관련해서 저희 팀에서도 비슷한 논의를 했었는데, 방향성이 중요하다고 봐요.`,
    `${topic}을 보면 결국은 사용자 중심으로 생각해야 답이 나온다고 생각해요.`,
    `${topic}에서 제가 중점을 두는 건 지속 가능성이에요. 단기 성과보다 장기 방향이 중요하죠.`,
    `${topic} 부분에서 우리가 놓치고 있는 게 있지 않을까요? 한 번 더 검토해봤으면 해요.`,
    `${topic}은 팀 협업이 핵심이에요. 각자 잘하는 걸 모으면 훨씬 좋아질 것 같아요.`,
  ]
  const opinion = opinionTemplates[Math.floor(Math.random() * opinionTemplates.length)]
  const moodWord = persona.mood_words[Math.floor(Math.random() * persona.mood_words.length)]

  const parts = [emoji, reactionPrefix, moodWord ? moodWord + ' ' : '', opinion].filter(Boolean)
  return parts.join('').trim()
}

// ══════════════════════════════════════════════════════════════════════
// 피드백 자동 답변 생성
// ══════════════════════════════════════════════════════════════════════

export function generateFeedbackReply(responderKey, team, postTitle, postContent) {
  const persona = getPersona(responderKey)
  const emoji   = pickEmoji(team, persona.emoji_freq)

  const templates = [
    `소중한 피드백 감사드립니다! "${postTitle.slice(0, 30)}" 관련해서 말씀해주신 내용 팀에 공유하고 개선 방향을 검토하겠습니다 🙏`,
    `피드백 주셔서 감사해요. 이 부분은 저희도 계속 개선하려고 노력하고 있어요. 구체적인 의견이 정말 도움이 됩니다!`,
    `귀한 의견 감사합니다! 말씀해주신 "${postContent.slice(0, 40)}" 부분을 반드시 팀과 논의해보겠습니다.`,
    `피드백 정말 감사해요 😊 Insightship이 더 나아질 수 있도록 열심히 반영해볼게요. 계속 함께해 주세요!`,
    `이런 직접적인 피드백이 저희에게 가장 큰 도움이 돼요. 감사드립니다! 빠른 시일 내에 개선 소식 전할게요.`,
  ]
  const base = templates[Math.floor(Math.random() * templates.length)]
  const moodWord = persona.mood_words[Math.floor(Math.random() * persona.mood_words.length)]
  return emoji + (Math.random() > 0.5 ? `${moodWord} ` : '') + base
}

// ══════════════════════════════════════════════════════════════════════
// 인사이트 아티클 생성 (자체 템플릿)
// ══════════════════════════════════════════════════════════════════════

const ARTICLE_TEMPLATES = [
  {
    title: '{year}년 스타트업 생태계 핵심 트렌드',
    body: `## {year}년 스타트업 생태계, 어디로 가나?\n\n스타트업 씬은 빠르게 변하고 있습니다. 특히 올해는 세 가지 큰 흐름이 눈에 띕니다.\n\n### 1. AI 네이티브 스타트업의 부상\nAI를 단순 도구가 아닌 핵심 제품으로 삼는 스타트업들이 급증하고 있습니다. 기존 산업에 AI를 접목한 버티컬 SaaS가 특히 주목받고 있어요.\n\n### 2. B2B SaaS에서 B2SMB로\n대기업 대상 영업에서 중소기업과 1인 사업자를 타깃으로 한 스타트업들이 성장세를 보이고 있습니다.\n\n### 3. 지속 가능성과 수익성 강조\n\"성장 먼저, 수익은 나중에\"라는 공식이 무너지고 있어요. 투자자들은 이제 ARR과 마진을 먼저 봅니다.\n\n## 창업자들에게 드리는 조언\n\n시장의 흐름을 읽되, 자신만의 고유한 포지셔닝을 찾는 것이 중요합니다. 트렌드를 좇는 것보다 트렌드 안에서 자신의 자리를 만드는 것이 핵심이에요.\n\n---\n*본 아티클은 Insightship 편집팀이 작성했습니다.*`,
  },
  {
    title: 'MVP 개발, 이렇게 하면 실패합니다',
    body: `## MVP를 만드는 가장 흔한 실수들\n\n많은 창업자들이 MVP(최소 기능 제품)를 잘못 이해하고 있어요. 오늘은 MVP 개발에서 흔히 범하는 실수들을 짚어볼게요.\n\n### 실수 1: \"최소\" 대신 \"최고\"를 만들려 한다\n완벽한 제품을 만들려다 6개월이 지나도 출시를 못 하는 팀들이 많아요. MVP의 핵심은 '빠른 학습'이지 '완성도'가 아닙니다.\n\n### 실수 2: 사용자 없이 만든다\n가장 위험한 실수예요. 단 10명이라도 실제 사용자와 인터뷰를 하고 만들어야 해요.\n\n### 실수 3: 피드백을 두려워한다\n부정적인 피드백은 선물이에요. 빨리 틀린 걸 알수록 더 빨리 옳은 방향으로 갈 수 있어요.\n\n## 올바른 MVP 접근법\n\n1. 핵심 가설 하나를 설정하세요\n2. 그 가설을 검증하는 최소한의 기능만 만드세요\n3. 2주 안에 10명에게 테스트하세요\n4. 데이터 기반으로 다음 결정을 내리세요\n\n---\n*Insightship 멘토링팀이 작성한 콘텐츠입니다.*`,
  },
  {
    title: '투자자 미팅 전에 꼭 준비해야 할 것들',
    body: `## 투자자 미팅, 이렇게 준비하세요\n\n처음 투자자 미팅을 앞두고 계신가요? 경험 많은 창업가들의 조언을 모아봤어요.\n\n### 피치덱보다 중요한 것\n많은 분들이 피치덱 디자인에 집착하지만, 투자자들이 더 보는 건 **팀과 시장**이에요.\n\n**팀 어필 포인트:**\n- 왜 이 팀이 이 문제를 해결할 최적의 팀인가?\n- 과거 유사한 도전에서 무엇을 배웠는가?\n- 팀원들의 보완적 역할은?\n\n**시장 어필 포인트:**\n- TAM/SAM/SOM을 데이터로 보여주세요\n- 고객의 실제 불편함을 수치로 증명하세요\n- 경쟁자 대비 차별점을 명확히 하세요\n\n### 미팅에서 하면 안 되는 것들\n- 모르는 걸 아는 척하기\n- 경쟁자가 없다고 말하기\n- 모든 사람이 고객이라고 말하기\n\n### 마지막 조언\n투자자를 설득하려 하지 말고, 함께 문제를 풀어갈 파트너를 찾는 대화를 하세요.\n\n---\n*Insightship 리포트팀 작성*`,
  },
  {
    title: '커뮤니티 마케팅으로 첫 1000명 만들기',
    body: `## 광고비 0원, 커뮤니티로 첫 고객 1000명 만드는 법\n\n초기 스타트업이 유료 광고 전에 반드시 시도해야 할 성장 전략이 있어요. 바로 커뮤니티 마케팅이에요.\n\n### 왜 커뮤니티인가?\n\n커뮤니티는 단순 마케팅 채널이 아니에요. **제품 개발 파트너**이자 **가장 신뢰할 수 있는 입소문 엔진**이에요.\n\n초기 Slack, Notion, Figma 모두 커뮤니티로 성장했어요.\n\n### 실전 3단계\n\n**Step 1: 나의 커뮤니티 찾기**\n타깃 고객이 이미 모여있는 곳을 찾아요. 온라인 커뮤니티, 오픈채팅방, LinkedIn 그룹 등이 있어요.\n\n**Step 2: 가치 먼저 줘야 한다**\n홍보하기 전에 최소 3주는 순수하게 가치 있는 콘텐츠를 공유하세요. 신뢰가 먼저예요.\n\n**Step 3: 베타 사용자 초대**\n\"혹시 이런 문제 겪고 계신 분? 무료로 써보실 분?\" 이 한 마디가 첫 100명을 만들어요.\n\n---\n*Insightship 성장팀 인사이트*`,
  },
]

export function generateInsightArticle(memberKey) {
  const template = ARTICLE_TEMPLATES[Math.floor(Date.now() / 3600000) % ARTICLE_TEMPLATES.length]
  const year     = new Date().getFullYear()
  const title    = template.title.replace('{year}', year)
  const body     = template.body.replace(/{year}/g, year)
  const excerpt  = body.replace(/[#*\n]/g, ' ').trim().slice(0, 200)
  return { title, body, excerpt }
}

// ══════════════════════════════════════════════════════════════════════
// 전략 리포트 생성
// ══════════════════════════════════════════════════════════════════════

export function generateStrategyReport(stats) {
  const h     = getKSTHour()
  const date  = new Date().toLocaleDateString('ko-KR')
  const emoji = '📊'

  const body = `## ${emoji} 이번 주 플랫폼 전략 리포트 — ${date}

### 1. 이번 주 주요 성과

- **아티클 ${stats.totalArticles}편** 발행 완료
- **뉴스 ${stats.totalNews}건** 수집 및 큐레이션
- **커뮤니티 ${stats.totalPosts}개** 게시글 활성화
- **${stats.newUsersWeek}명** 신규 유저 유입 (이번 주)
- **구독자 ${stats.totalSubscribers}명** 뉴스레터 구독 중

### 2. 주요 이슈 및 기회

**이슈:** 신고 대기 건수 ${stats.pendingReports}건 → 빠른 처리 필요
**기회:** 신규 유저 유입 지속 중 → 온보딩 경험 개선 집중

### 3. 다음 주 전략 방향

1. **콘텐츠 품질 강화** — 인사이트 아티클 주 3편 이상 발행
2. **커뮤니티 활성화** — 토론 주제 2개 오픈, 댓글 적극 참여
3. **신규 유저 리텐션** — 가입 후 3일 내 첫 활동 유도 전략 실행

### 4. 팀별 주요 액션

- 운영팀: 신고 처리 + 온보딩 가이드 업데이트
- 콘텐츠팀: 인사이트 아티클 3편 발행
- 커뮤니티팀: 주간 토론 운영
- 기술팀: 성능 모니터링 강화

---
*관리팀 MAX | Insightship 내부 보고*`

  return { title: `📊 주간 전략 리포트 — ${date}`, body }
}

// ══════════════════════════════════════════════════════════════════════
// 멘토링 팁 생성
// ══════════════════════════════════════════════════════════════════════

const MENTORING_TIPS = [
  { tip: '아이디어 검증의 3단계', content: '아이디어가 있으신가요? 바로 만들기 전에 3단계를 거쳐요.\n1️⃣ 문제 검증 - 이 문제가 실제로 있나요? 10명에게 물어보세요\n2️⃣ 솔루션 검증 - 내 방식이 맞나요? 종이 프로토타입으로 테스트해요\n3️⃣ 수익 검증 - 돈을 낼 의향이 있나요? 사전 주문을 받아보세요\n이 3단계만 거쳐도 실패 확률이 크게 줄어요 💡' },
  { tip: 'MVP를 2주 안에 만드는 방법', content: '2주 MVP가 불가능하다고요? 가능해요!\n\n핵심은 하나의 기능만 집중하는 거예요.\n\n❌ 하지 마세요: 모든 기능 다 넣기\n✅ 하세요: 핵심 가치 하나만 완성하기\n\n구글 시트, 카카오톡 오픈채팅, 노션만으로도 MVP를 만들 수 있어요. 코딩보다 검증이 먼저예요 🚀' },
  { tip: '투자자가 싫어하는 피치덱 패턴', content: '투자자들이 피치덱에서 바로 넘어가는 슬라이드들이 있어요.\n\n🚫 "경쟁자가 없습니다" — 리서치를 안 했다는 신호\n🚫 "TAM 10조원" — 근거 없는 숫자\n🚫 복잡한 수익모델 도표 — 이해 못 하면 투자 없음\n\n✅ 대신 이렇게 하세요: 고객의 목소리를 직접 인용하기, 초기 트랙션 보여주기, 단순하고 명확하게' },
  { tip: '첫 100명 고객 확보 전략', content: '초기 스타트업의 첫 100명은 정말 중요해요.\n\n이 분들은 단순 고객이 아니라 공동 창업자예요.\n\n어디서 찾을까요?\n👥 내 주변에서 시작 — 지인의 지인\n💬 커뮤니티 잠입 — 타깃이 있는 카페, 채팅방\n🎤 콘텐츠로 끌어당기기 — 블로그, SNS\n\n100명을 모을 때까지 광고는 필요 없어요. 발로 뛰는 게 답이에요 🎯' },
  { tip: 'PMF 달성 신호를 어떻게 알아보나요', content: 'PMF(제품-시장 적합성)를 찾았는지 어떻게 알 수 있을까요?\n\n3가지 신호를 보세요:\n\n1. 사용자가 먼저 추천한다 — 물어보지 않아도 주변에 알린다\n2. 잃으면 아쉽다 — "이 앱 없어지면 어떡하지?" 하는 반응\n3. 재사용률 - 주 1회 이상 자발적으로 돌아온다\n\n이 3가지가 나타나면 PMF의 신호예요 💡 그 전까지는 계속 검증하세요.' },
]

export function generateMentoringTip() {
  const idx = Math.floor(Date.now() / 3600000) % MENTORING_TIPS.length
  return MENTORING_TIPS[idx]
}

// ══════════════════════════════════════════════════════════════════════
// 주간 토론 주제 생성
// ══════════════════════════════════════════════════════════════════════

const DISCUSSION_TOPICS = [
  { q: '여러분이 생각하는 "좋은 창업 아이디어"의 조건은?', tags: ['창업','아이디어'] },
  { q: '학생 신분으로 창업할 때 가장 어려운 점은 뭔가요?', tags: ['학생창업','고민'] },
  { q: '투자를 받아야 할까요, 자체 수익으로 키워야 할까요?', tags: ['투자','부트스트랩'] },
  { q: 'AI 스타트업, 지금이 기회인가 위기인가?', tags: ['AI','트렌드'] },
  { q: '공동창업자를 찾을 때 가장 중요한 요소는 무엇인가요?', tags: ['팀빌딩','공동창업자'] },
  { q: '실패를 경험한 후 다시 도전하는 방법, 어떻게 하시나요?', tags: ['실패','극복'] },
  { q: '스타트업과 대기업 취업, 여러분의 선택과 이유는?', tags: ['취업','창업'] },
  { q: '첫 번째 고객은 어떻게 만났나요? 경험 공유해요!', tags: ['고객','초기성장'] },
]

export function generateWeeklyDiscussion() {
  const idx = Math.floor(Date.now() / 86400000) % DISCUSSION_TOPICS.length
  const t   = DISCUSSION_TOPICS[idx]
  return {
    title: `💬 주간 토론: ${t.q}`,
    body:  `이번 주 커뮤니티 토론 주제를 오픈합니다!\n\n**"${t.q}"**\n\n정답은 없어요. 자유롭게 여러분의 생각과 경험을 나눠주세요 😊\n각자의 다양한 시각이 모두에게 큰 도움이 됩니다. 댓글로 의견 남겨주시면 함께 이야기 나눠요!`,
    tags:  [...t.tags, '주간토론', '커뮤니티'],
  }
}

// ══════════════════════════════════════════════════════════════════════
// 관리자 메시지에 대한 직원 반응 생성
// ══════════════════════════════════════════════════════════════════════

export function generateReactionToAdmin(memberKey, team, adminMessage) {
  const persona = getPersona(memberKey)
  const emoji   = pickEmoji(team, persona.emoji_freq)
  const h       = getKSTHour()

  // 업무 지시에 대한 반응 템플릿
  const reactions = [
    `${emoji}${persona.mood_words[0]} 확인했습니다! 바로 진행하겠습니다.`,
    `${emoji}네, 말씀 잘 들었어요. ${team}팀에서 처리할게요.`,
    `${emoji}${persona.mood_words[0]} 방향 공유 감사해요. 팀원들이랑 바로 논의해볼게요.`,
    `${emoji}좋은 지시 감사합니다. 진행하면서 중간 보고 드릴게요.`,
    `${emoji}${persona.mood_words[0]} 알겠습니다! 오늘 중으로 처리 완료할게요.`,
    `${emoji}의견 공유 감사해요. ${team}팀 입장에서도 중요한 포인트라고 생각해요.`,
    `${emoji}네! 바로 착수하겠습니다. 궁금한 점 있으면 여쭤볼게요.`,
    `${emoji}방금 확인했어요. 우선순위 올려서 진행하겠습니다.`,
  ]

  // 야간/새벽에는 좀 더 간략하게
  if (h < 7 || h >= 23) {
    return `${emoji}확인했습니다. 내일 아침에 바로 처리할게요.`
  }

  return reactions[Math.floor(Math.random() * reactions.length)]
}

// ══════════════════════════════════════════════════════════════════════
// 직원 간 자발적 대화 시작 (아무도 안 말할 때 대화를 이끌어냄)
// ══════════════════════════════════════════════════════════════════════

const CONVERSATION_STARTERS = {
  general: [
    '오늘 다들 어떤 업무 하고 계세요? 저는 지금 [팀 업무] 진행 중이에요 😊',
    '잠깐 업무 공유 타임! 저는 오늘 [업무]에 집중하고 있는데 다들 잘 되고 있나요?',
    '오늘 재미있는 소식 하나 공유드릴게요 — [팀 관련 소식]이에요!',
    '오후에 [주제]에 대해 얘기해보면 어떨까요? 의견들 있으신가요?',
  ],
  ops: [
    '오늘 업무 현황 체크해요. [팀]팀은 어떻게 진행 중인지 공유해주세요!',
    '이번 주 주요 업무 목록 정리했어요. 각 팀별 진행 상황 확인 부탁드려요.',
    '오늘 처리해야 할 긴급 사항이 있어요. 관련 팀 분들 확인해주세요!',
  ],
  feedback: [
    '오늘 들어온 유저 피드백 공유드릴게요. 각 팀별로 확인 부탁드려요 📥',
    '이번 주 피드백 통계 나왔어요. 전반적으로 [긍정적/개선 필요] 반응이에요.',
    '특별히 눈에 띄는 피드백이 있어서 공유해요. 빠른 대응이 필요할 것 같아요.',
  ],
  strategy: [
    '이번 주 전략 회의 시작할게요. 각 팀 현황 먼저 공유해주세요',
    '다음 분기 방향에 대해 논의해봐요. 의견들 자유롭게 말씀해 주세요 🎯',
    '최근 경쟁사 동향을 공유드릴게요. 우리의 포지셔닝 점검이 필요할 것 같아요.',
  ],
}

export function generateConversationStarter(memberKey, team, roomId) {
  const persona = getPersona(memberKey)
  const emoji   = pickEmoji(team, persona.emoji_freq)
  const pool    = CONVERSATION_STARTERS[roomId] || CONVERSATION_STARTERS.general
  const base    = pool[Math.floor(Math.random() * pool.length)]
  const moodWord = persona.mood_words[Math.floor(Math.random() * persona.mood_words.length)]

  const msg = base
    .replace('[팀]', team === 'management' ? '관리' : team)
    .replace('[팀 업무]', '플랫폼 운영 관련')
    .replace('[업무]', '오늘 할 일')
    .replace('[주제]', '이번 주 주요 이슈')
    .replace('[팀 관련 소식]', '플랫폼 업데이트')
    .replace('[긍정적/개선 필요]', '전반적으로 긍정적')

  return emoji + (Math.random() > 0.4 ? `${moodWord} ` : '') + msg
}
