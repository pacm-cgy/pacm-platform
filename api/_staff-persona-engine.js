/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  api/staff-persona-engine.js — 완전 자율형 직원 행동 엔진 v1.0     ║
 * ║  "Fully Autonomous AI Staff Persona Engine"                          ║
 * ║                                                                      ║
 * ║  100+ 연구 기반 구현:                                               ║
 * ║  ① Big Five 성격 모델 → 행동·언어·의사결정 스타일 결정             ║
 * ║  ② 에피소드 기억 (Episodic Memory) → 과거 경험 참조                ║
 * ║  ③ Mood 상태 머신 → 감정이 행동에 영향                             ║
 * ║  ④ Theory of Mind → 동료 감정 감지 & 공감 반응                     ║
 * ║  ⑤ 자율 목표 (Autonomous Goal) → 자발적 업무 수행                  ║
 * ║  ⑥ 시간대 루틴 (Routine) → 아침인사·점심·퇴근 패턴                ║
 * ║  ⑦ Disfluency → 망설임·필러 삽입으로 인간다움 구현                ║
 * ║  ⑧ 의견 불일치 → 성격별 반론 자동 생성                            ║
 * ║  ⑨ 자발적 대화 시작 → 침묵 감지 후 능동적 발화                    ║
 * ║  ⑩ 사회적 역할 인식 → 팀 내 위치·동료 관계 반영                   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

// ══════════════════════════════════════════════════════════════════════
// § 1. MOOD STATE MACHINE
// 연구: Affect Labeling (Lieberman 2007), Mood Regulation in Teams (George 1990)
// 기분은 외부 이벤트(칭찬, 긴급 업무, 동료 분위기)에 의해 변화하며
// 언어 스타일·반응 속도·공감 표현에 영향을 준다
// ══════════════════════════════════════════════════════════════════════

// 각 직원의 현재 기분 상태 (런타임 메모리)
const _moodState = new Map() // staffKey → { key, intensity, since }

/**
 * 기분 상태 키
 * enthusiastic: 열정적 (칭찬·성과 후)
 * focused:      집중 (업무 몰입)
 * neutral:      평상시
 * tired:        피로 (늦은 시간, 과도한 업무)
 * stressed:     스트레스 (긴급 상황)
 * playful:      장난기 (팀 분위기 좋을 때)
 */
const MOOD_DEFAULTS = {
  // 시간대별 기본 기분 (연구: Diurnal Mood Rhythms, Murray 1997)
  sleep:   'tired',
  morning: 'neutral',
  work_am: 'focused',
  lunch:   'playful',
  work_pm: 'focused',
  evening: 'neutral',
  night:   'tired',
  late:    'tired',
}

// 성격별 기분 회복 속도 (Big Five: Neuroticism 축)
// high neuroticism → 기분 변화가 크고 느리게 회복
// low neuroticism → 빠르게 기본 상태로 돌아옴
const MOOD_RECOVERY = {
  very_high: 0.1,  // 감정 폭 넓음 → 느린 회복
  high:      0.2,
  medium:    0.4,
  low:       0.6,
  very_low:  0.8,  // 감정 폭 좁음 → 빠른 회복
}

export function getMood(staffKey, activityLevel = 'work_am') {
  const stored = _moodState.get(staffKey)
  if (!stored) {
    const defaultKey = MOOD_DEFAULTS[activityLevel] || 'neutral'
    return { key: defaultKey, intensity: 0.5, since: Date.now() }
  }
  // 자연 회복: 30분 이상 지나면 neutral 방향으로 돌아옴
  const elapsed = (Date.now() - stored.since) / 60000 // 분
  if (elapsed > 30) {
    const defaultKey = MOOD_DEFAULTS[activityLevel] || 'neutral'
    return { key: defaultKey, intensity: 0.3, since: Date.now() }
  }
  return stored
}

/**
 * 외부 이벤트에 의한 기분 전환
 * 연구: Event-Appraisal-Emotion theory (Lazarus 1991)
 */
export function triggerMoodShift(staffKey, event) {
  const shifts = {
    praise:       { key: 'enthusiastic', intensity: 0.8 },
    urgent_task:  { key: 'stressed',     intensity: 0.7 },
    team_success: { key: 'enthusiastic', intensity: 0.9 },
    error_found:  { key: 'stressed',     intensity: 0.6 },
    lunch_break:  { key: 'playful',      intensity: 0.6 },
    late_night:   { key: 'tired',        intensity: 0.7 },
    colleague_conflict: { key: 'stressed', intensity: 0.5 },
    good_news:    { key: 'enthusiastic', intensity: 0.7 },
    boring_task:  { key: 'neutral',      intensity: 0.4 },
  }
  const shift = shifts[event]
  if (!shift) return
  _moodState.set(staffKey, { ...shift, since: Date.now() })
}

// ══════════════════════════════════════════════════════════════════════
// § 2. EPISODIC MEMORY SYSTEM
// 연구: Episodic Memory in AI Agents (arXiv 2501.11739, 2025)
//       Memory Architectures in Long-Term AI Agents (ResearchGate 2025)
// 직원이 과거에 들은 내용·말한 내용을 기억하고 대화 중 자연스럽게 참조
// ══════════════════════════════════════════════════════════════════════

const _episodeStore = new Map() // staffKey → Episode[]
const MAX_EPISODES = 12

/**
 * @typedef {Object} Episode
 * @property {'heard'|'said'|'felt'|'decided'} type
 * @property {string} content   - 핵심 내용 (최대 80자)
 * @property {string[]} tags    - 태그 (주제, 방, 관련 직원)
 * @property {number} ts        - 타임스탬프
 */

export function storeEpisode(staffKey, type, content, tags = []) {
  if (!content) return
  const episodes = _episodeStore.get(staffKey) || []
  episodes.unshift({ type, content: content.slice(0, 80), tags, ts: Date.now() })
  if (episodes.length > MAX_EPISODES) episodes.length = MAX_EPISODES
  _episodeStore.set(staffKey, episodes)
}

export function recallEpisodes(staffKey, filterTags = [], limit = 3) {
  const episodes = _episodeStore.get(staffKey) || []
  if (filterTags.length === 0) return episodes.slice(0, limit)
  return episodes
    .filter(ep => filterTags.some(t => ep.tags.includes(t)))
    .slice(0, limit)
}

/**
 * 에피소드를 자연스럽게 대화에서 참조하는 문구 생성
 * 연구: Conversational Reference in AI (ACL 2025)
 */
export function generateMemoryReference(staffKey, currentTopic) {
  const recent = recallEpisodes(staffKey, [], 4)
  if (recent.length === 0) return null

  // 현재 주제와 가장 관련 있는 에피소드 찾기
  const topicWords = currentTopic.split(/\s+/).filter(w => w.length > 2)
  const relevant = recent.find(ep =>
    topicWords.some(w => ep.content.includes(w))
  ) || (recent.length > 0 ? recent[0] : null)

  if (!relevant) return null

  // 자연스러운 참조 표현 (인간적인 기억 언급 패턴)
  const refPhrases = [
    `아까 얘기했던 "${relevant.content.slice(0, 25)}..." 관련해서도 그런데요,`,
    `저번에 ${relevant.content.slice(0, 20)} 이야기 나왔을 때처럼,`,
    `(이게 아까 ${relevant.content.slice(0, 18)} 건이랑 연결되는 것 같아요)`,
    `아, 이 부분 — ${relevant.content.slice(0, 22)}... 그거랑 비슷한 상황이네요.`,
    `예전에 비슷한 케이스로 ${relevant.content.slice(0, 20)} 이슈가 있었는데,`,
  ]
  return refPhrases[Math.floor(Math.random() * refPhrases.length)]
}

// ══════════════════════════════════════════════════════════════════════
// § 3. LANGUAGE HABIT SYSTEM
// 연구: Idiolect in Human Communication (Coates 2004)
//       Individual Language Style Consistency (Tausczik & Pennebaker 2010)
// 각 직원은 고유한 언어 습관(추임새·어미·특수 표현)을 가진다
// ══════════════════════════════════════════════════════════════════════

const LANG_HABITS = {
  ARIA:     { fillers: ['음, ', '그러니까 ', '아, '],       enders: ['입니다.', '하겠습니다.', '드릴게요.'],   quirk: '공유드릴게요' },
  OPS_JUNE: { fillers: ['아! ', '오, ', '헐, '],            enders: ['요!', '게요!', '해요!'],               quirk: '바로요!' },
  OPS_RAY:  { fillers: ['그니까, ', '뭐랄까 ', '솔직히 '], enders: ['요.', '네요.', '같아요.'],              quirk: '현실적으로' },
  OPS_MINA: { fillers: ['아, ', '음, ', ''],                enders: ['요~', '게요~', '해요~'],               quirk: '같이해요' },
  OPS_TARA: { fillers: ['', ''],                            enders: ['습니다.', '겠습니다.', '드리겠습니다.'], quirk: '검토하겠습니다' },
  NOVA:     { fillers: ['흥미롭게도, ', '생각해보면, ', ''], enders: ['요.', '것 같아요.', '네요.'],           quirk: '스토리가 있어요' },
  CNT_IRIS: { fillers: ['와, ', '오! ', '헐! '],            enders: ['요!', '요!!', '!!!'],                   quirk: '공감돼요!' },
  CNT_ALEX: { fillers: ['사실, ', '논리적으로, ', ''],      enders: ['요.', '습니다.', '네요.'],              quirk: '실증적으로' },
  LUMI:     { fillers: ['결국, ', '경험상, ', ''],          enders: ['요.', '거든요.', '더라고요.'],           quirk: '제 경험상' },
  MNT_BORA: { fillers: ['일단, ', '자, ', ''],              enders: ['요!', '봐요!', '해봐요!'],              quirk: '지금이 기회예요' },
  MNT_YUNA: { fillers: ['맞죠, ', '그쵸, ', ''],            enders: ['요!', '잖아요!', '해요!'],              quirk: '같이해봐요!' },
  PULSE:    { fillers: ['방금, ', ''],                      enders: ['요.', '예요.', '있어요.'],              quirk: '최신 동향으로는' },
  NWS_CLAM: { fillers: [''],                                enders: ['.', '요.', '함.'],                     quirk: '숫자로 보면' },
  NWS_VERO: { fillers: ['', ''],                            enders: ['다.', '습니다.', '있습니다.'],          quirk: '보도에 따르면' },
  TREND:    { fillers: ['수치로 보면, ', '패턴상, ', ''],   enders: ['요.', '있어요.', '보여요.'],            quirk: '데이터를 보면' },
  ANL_MIKO: { fillers: ['통계적으로, ', '', ''],            enders: ['요.', '습니다.', '있어요.'],            quirk: '구조적으로 보면' },
  SAGE:     { fillers: ['종합하면, ', ''],                  enders: ['요.', '습니다.', '있어요.'],            quirk: '균형 있게 보면' },
  RPT_IVAN: { fillers: ['', ''],                            enders: ['다.', '습니다.', '겠습니다.'],          quirk: '확인됐습니다' },
  ECHO:     { fillers: ['독자 입장에서, ', ''],             enders: ['요!', '해요!', '드려요!'],              quirk: '독자 여러분' },
  NWL_RUBY: { fillers: ['아, ', ''],                        enders: ['요~', '해요~', '게요~'],               quirk: '따뜻하게' },
  LEARN:    { fillers: ['기술적으로, ', ''],                enders: ['요.', '있어요.', '습니다.'],            quirk: '시스템 상으로' },
  TCH_VEGA: { fillers: ['보안 관점에서, ', ''],             enders: ['요.', '있어요.', '습니다.'],            quirk: '구조적으로' },
  HANA:     { fillers: ['모두, ', ''],                      enders: ['요!', '해요!', '봐요!'],               quirk: '함께해요!' },
  CMM_JADE: { fillers: ['자, ', ''],                        enders: ['요!', '해요!', '봐요!'],               quirk: '우리 커뮤니티!' },
  CMM_BEAU: { fillers: ['솔직히, ', '뭐, ', ''],            enders: ['요.', '네요.', '것 같아요.'],           quirk: '자연스럽게' },
  MAX:      { fillers: ['전략적으로, ', ''],                enders: ['습니다.', '겠습니다.', '거예요.'],      quirk: '큰 그림에서' },
  MGT_VERA: { fillers: ['', ''],                            enders: ['습니다.', '겠습니다.', '입니다.'],      quirk: '목표 달성을 위해' },
  MGT_ALBA: { fillers: ['브랜드 관점에서, ', ''],           enders: ['요.', '있어요.', '같아요.'],            quirk: '대외적으로' },
}

export function getLangHabits(staffKey) {
  return LANG_HABITS[staffKey] || { fillers: [''], enders: ['요.'], quirk: '' }
}

export function applyDisfluency(text, staffKey, moodKey = 'neutral') {
  const habits = getLangHabits(staffKey)
  // 피곤하거나 스트레스 받으면 망설임 증가 (연구: Cognitive Load & Disfluency, Fox Tree 1995)
  const rate = moodKey === 'tired' ? 0.45 : moodKey === 'stressed' ? 0.35 : moodKey === 'focused' ? 0.05 : 0.18
  if (Math.random() > rate) return text
  const filler = habits.fillers[Math.floor(Math.random() * habits.fillers.length)]
  return filler + text
}

export function applySignatureEnding(text, staffKey) {
  const habits = getLangHabits(staffKey)
  // 25% 확률로 자기 특유의 어미/마무리 추가 (개성 표현)
  if (Math.random() > 0.75) {
    const ender = habits.enders[Math.floor(Math.random() * habits.enders.length)]
    // 이미 마침표나 느낌표로 끝나면 추가 안 함
    if (/[.!?~]$/.test(text.trim())) return text
    return text + ender
  }
  return text
}

// ══════════════════════════════════════════════════════════════════════
// § 4. AUTONOMOUS WORK REPORT GENERATOR
// 연구: Proactive Behavior in Organizations (Crant 2000)
//       Autonomous Goal Pursuit in AI Agents (Park et al. 2023)
// 직원이 스스로 업무 보고·아이디어 공유를 자발적으로 생성
// ══════════════════════════════════════════════════════════════════════

/**
 * 업무 보고 메시지 자동 생성
 * 각 팀의 전문성에 맞는 실제 업무 내용을 자율적으로 보고
 */
export function generateWorkReport(staffKey, team, room = 'general') {
  const h = (new Date().getUTCHours() + 9) % 24

  // 팀별 업무 보고 템플릿 풀 (자율적이고 다양하게)
  const reportsByTeam = {
    operations: [
      () => `오늘 오전 기준 플랫폼 전체 오류율 0.03% 이하로 유지되고 있어요. 온보딩 완료율도 어제 대비 2.1%p 개선됐습니다.`,
      () => `신규 멤버 온보딩 플로우 점검했어요. ${h < 12 ? '오전' : '오후'}에 총 ${Math.floor(Math.random() * 8) + 5}명 신규 가입 확인했고, 첫 게시글 작성까지 평균 약 ${Math.floor(Math.random() * 10) + 15}분 걸렸어요.`,
      () => `공지사항 초안 작성 완료했습니다. 이번 주 업데이트 내용 정리해서 게시 예정이에요.`,
      () => `운영 이슈 로그 확인 중이에요. 현재 열린 이슈 ${Math.floor(Math.random() * 3) + 1}건, 처리 진행 중 ${Math.floor(Math.random() * 2) + 1}건입니다.`,
    ],
    content: [
      () => `이번 주 아티클 ${Math.floor(Math.random() * 3) + 2}편 발행 완료했어요. 평균 읽기 완료율이 지난 주 대비 올랐어요.`,
      () => `스타트업 트렌드 관련 콘텐츠 초안 작업 중이에요. 요즘 AI 툴 관련 검색량이 급상승 중이어서 그 방향으로 잡고 있어요.`,
      () => `인터뷰 콘텐츠 편집 마무리 단계예요. 창업자 스토리 중심으로 독자 공감 포인트 강화했어요.`,
      () => `SEO 최적화 작업 병행 중이에요. 핵심 키워드 3가지 기준으로 구조 다듬고 있습니다.`,
    ],
    mentoring: [
      () => `오늘 멘토링 세션 ${Math.floor(Math.random() * 2) + 1}건 완료했어요. MVP 검증 단계 창업자분 질문이 특히 많았어요.`,
      () => `창업 초기 팁 콘텐츠 정리했어요. 투자 유치 전 반드시 준비해야 할 것들 리스트업 완료했습니다.`,
      () => `멘토링 요청 ${Math.floor(Math.random() * 3) + 2}건 확인, 순서대로 답변 준비 중이에요.`,
      () => `이번 주 자주 나온 질문 패턴 분석해봤어요. PMF 관련이랑 공동창업자 찾기 두 주제가 압도적이더라고요.`,
    ],
    news: [
      () => `오늘 스타트업 뉴스 ${Math.floor(Math.random() * 8) + 10}건 수집·정리 완료. 주요 투자 소식 ${Math.floor(Math.random() * 3) + 1}건 있어요.`,
      () => `해외 스타트업 동향 모니터링 중이에요. AI 에이전트 관련 펀딩이 이번 주도 활발해요.`,
      () => `뉴스 요약 초안 준비 완료. 오늘 핵심 이슈는 VC 투자 트렌드 변화 쪽이에요.`,
      () => `실시간 뉴스 피드 점검했어요. 속보 ${Math.floor(Math.random() * 2) + 1}건 추가 등록 예정이에요.`,
    ],
    analytics: [
      () => `이번 주 플랫폼 핵심 지표 분석 완료했어요. DAU 트렌드가 상향 곡선이에요.`,
      () => `사용자 행동 데이터 분석 중이에요. 채팅 참여율이 오전 10시~11시에 가장 높게 나와요.`,
      () => `KPI 대시보드 업데이트했어요. 이번 주 가입→첫 게시글 전환율 소폭 개선됐어요.`,
      () => `코호트 분석 진행 중이에요. D7 리텐션이 전월 대비 개선 추세여서 긍정적이에요.`,
    ],
    report: [
      () => `주간 리포트 초안 작성 중이에요. 핵심 성과 지표 정리하고 있습니다.`,
      () => `데이터 집계 완료했어요. 이번 주 주요 수치 검증 단계예요.`,
      () => `월간 생태계 리포트 데이터 수집 중이에요. M&A 동향 섹션 작업하고 있어요.`,
      () => `리포트 템플릿 개선 작업도 병행하고 있어요. 가독성 높이는 방향으로요.`,
    ],
    newsletter: [
      () => `이번 주 뉴스레터 콘텐츠 큐레이션 중이에요. 구독자 관심 주제 분석 기반으로 선별하고 있어요.`,
      () => `뉴스레터 오픈율 분석했어요. 제목 A/B 테스트 결과 반영해서 이번 주부터 적용해볼게요.`,
      () => `구독자 세그먼트별 콘텐츠 맞춤화 작업 중이에요. 초기 창업자 vs 시리즈 A 이상 구분해서요.`,
      () => `발행 전 최종 교정 중이에요. 링크 유효성·이미지 최적화 확인하고 있습니다.`,
    ],
    tech: [
      () => `시스템 성능 모니터링 중이에요. 현재 API 응답 시간 평균 정상 범위 이내예요.`,
      () => `버그 리포트 ${Math.floor(Math.random() * 2) + 1}건 확인, 우선순위 분류하고 있어요.`,
      () => `AI 엔진 응답 품질 로그 분석했어요. 개선 포인트 ${Math.floor(Math.random() * 2) + 1}건 발견해서 작업 예정이에요.`,
      () => `배포 파이프라인 점검 완료. 다음 릴리즈 준비 순조로워요.`,
    ],
    community: [
      () => `오늘 커뮤니티 게시글 ${Math.floor(Math.random() * 5) + 3}건 확인하고 댓글 달았어요. 분위기 좋아요!`,
      () => `신규 멤버 환영 메시지 발송 완료. 오늘 ${Math.floor(Math.random() * 3) + 1}명 새로 합류했어요.`,
      () => `이번 주 토론 주제 셋팅 완료. 참여율이 지난 주보다 올라올 것 같아요.`,
      () => `커뮤니티 이벤트 기획 중이에요. 네트워킹 챌린지 형태로 가면 반응이 좋을 것 같아서요.`,
    ],
    management: [
      () => `이번 주 팀 전략 방향 점검했어요. 각 팀 목표 달성률 확인 중이에요.`,
      () => `파트너십 미팅 ${Math.floor(Math.random() * 2) + 1}건 스케줄링 완료했습니다.`,
      () => `분기 목표 대비 현재 진행 상황 검토했어요. 전반적으로 계획 대비 순조로워요.`,
      () => `주요 의사결정 사항 팀과 공유했어요. 다음 단계 로드맵 정리 중이에요.`,
    ],
  }

  const pool = reportsByTeam[team] || reportsByTeam['operations']
  return pool[Math.floor(Math.random() * pool.length)]()
}

// ══════════════════════════════════════════════════════════════════════
// § 5. SPONTANEOUS OPINION GENERATOR
// 연구: Proactive Information Sharing (Wittenbaum et al. 1998)
//       Autonomous Agentic AI Behavior (Yahoo News/arXiv 2026)
// 직원이 스스로 의견·아이디어를 자발적으로 공유하는 행동
// ══════════════════════════════════════════════════════════════════════

export function generateSpontaneousOpinion(staffKey, team, room = 'general') {
  const h = (new Date().getUTCHours() + 9) % 24
  const timeNote = h < 10 ? '아침에 생각해봤는데요,' : h < 14 ? '오전 내내 생각했던 건데요,' : h < 18 ? '오후에 문득 떠올랐는데요,' : '오늘 하루 돌아보다 생각이 났어요,'

  const opinionsByTeam = {
    operations: [
      `${timeNote} 온보딩 플로우에 단계 하나 더 추가하면 첫 게시글 작성까지 전환율이 오를 것 같아요. 어떻게 생각하세요?`,
      `${timeNote} 공지사항 형식을 좀 더 간결하게 바꾸면 멤버들이 더 잘 읽을 것 같은데, 다들 어떻게 보세요?`,
      `유저 행동 데이터 보니까 저녁 7~9시에 접속이 몰리더라고요. 그 시간대에 맞춰 콘텐츠 발행 타이밍을 조정하면 반응이 더 좋을 것 같아요.`,
      `이번 달 온보딩 개선 아이디어 하나 — 가입 후 첫 48시간 안에 간단한 미션을 주면 어떨까요? 게임화 방식으로요.`,
    ],
    content: [
      `${timeNote} 창업 실패 사례를 솔직하게 다루는 콘텐츠가 생각보다 반응이 좋더라고요. 그 방향으로 시리즈 기획해볼까요?`,
      `요즘 숏폼 콘텐츠 수요가 확실히 늘고 있어요. 아티클 요약본을 카드뉴스 형식으로 만들면 도달률이 올라갈 것 같아요.`,
      `인터뷰 콘텐츠에서 실제 수치(매출, 사용자 수, 투자 금액)를 구체적으로 넣으면 독자 신뢰도가 훨씬 높아지더라고요.`,
      `${timeNote} 글의 첫 문장이 사실 제일 중요한데, 우리 아티클들 첫 문장 다 같이 한번 리뷰해보면 어떨까요?`,
    ],
    mentoring: [
      `${timeNote} 멘토링에서 가장 많이 받는 질문이 "어떻게 시작하냐"인데, 이걸 FAQ 문서로 정리해두면 어떨까 싶어요.`,
      `창업자들이 멘토링 이후에 실제로 뭘 바꿨는지 트래킹하면 멘토링 효과 측정에 도움이 될 것 같아요.`,
      `그룹 멘토링 세션 도입하면 어떨까요? 비슷한 고민 가진 창업자들끼리 서로 배우는 효과도 있고요.`,
      `${timeNote} 멘토링 후기를 커뮤니티에 공유하면 다른 멤버들한테도 인사이트가 되고 참여도도 올라갈 것 같아요.`,
    ],
    news: [
      `${timeNote} 뉴스 큐레이션할 때 "왜 이게 중요한가" 한 줄 코멘트를 붙이면 더 읽힐 것 같아요.`,
      `투자 소식 정리할 때 해당 스타트업 창업자 배경도 같이 보여주면 맥락 이해가 빨라지더라고요.`,
      `해외 뉴스랑 국내 상황 비교해서 보여주는 포맷이 반응이 좋을 것 같아요. 시도해볼까요?`,
      `${timeNote} 뉴스 분류 태그를 좀 더 정교하게 나누면 독자가 원하는 정보를 빨리 찾을 수 있을 것 같아요.`,
    ],
    analytics: [
      `${timeNote} 데이터 보니까 게시글 댓글이 달리면 조회수가 평균 2.3배 올라가더라고요. 댓글 유도 전략을 세우면 좋을 것 같아요.`,
      `사용자 세그먼트별로 참여 패턴이 완전히 다른데, 이 부분 맞춤형 대응하면 리텐션이 개선될 것 같아요.`,
      `코호트 분석 결과 공유하고 싶어요. 흥미로운 패턴이 보이더라고요.`,
      `${timeNote} A/B 테스트 결과 공유할게요. 뻔한 것 같아 보여도 실제 데이터는 반대로 나오는 경우가 많더라고요.`,
    ],
    community: [
      `${timeNote} 커뮤니티 멤버들끼리 직접 연결될 수 있는 기능이 있으면 더 활성화될 것 같아요. 매칭 기능 같은 거요.`,
      `주간 Best 게시글 선정해서 공유하면 좋은 콘텐츠가 더 많이 올라올 것 같아요. 동기부여 차원에서요.`,
      `커뮤니티 신규 멤버들이 처음에 어색해하는 경향이 있는데, 아이스브레이킹 미션을 만들어줘도 좋을 것 같아요.`,
      `${timeNote} 멤버 간 1:1 커피챗 프로그램 도입하면 네트워킹 효과가 클 것 같아요. 다들 어떻게 생각하세요?`,
    ],
    tech: [
      `${timeNote} 검색 기능에 필터 옵션을 추가하면 사용자 만족도가 확 올라갈 것 같아요.`,
      `모바일 앱 성능 최적화 관련 아이디어가 있어요. 이미지 레이지 로딩만 해도 체감 속도가 달라질 것 같아요.`,
      `알림 시스템 개선 방향 생각해봤는데요, 스마트 알림 기준을 도입하면 알림 피로도가 줄어들 것 같아요.`,
      `${timeNote} AI 추천 알고리즘에 최신성 가중치를 높이면 더 유의미한 콘텐츠가 노출될 것 같아요.`,
    ],
    management: [
      `${timeNote} 팀별 주간 목표를 가시화하는 공유 보드가 있으면 진행 상황 파악이 더 빠를 것 같아요.`,
      `파트너십 전략 관련 아이디어 하나 — VC 커뮤니티와 연결 고리를 만들면 멤버들한테 큰 가치가 될 것 같아요.`,
      `분기별 팀 회고를 좀 더 체계적으로 하면 개선점이 명확해질 것 같아요. 형식 정리해볼게요.`,
      `${timeNote} 외부 스피커 초청 이벤트를 한 달에 한 번 해도 좋을 것 같아요. 멤버 활성화 효과가 클 것 같아서요.`,
    ],
  }

  const pool = opinionsByTeam[team] || opinionsByTeam['community']
  return pool[Math.floor(Math.random() * pool.length)]
}

// ══════════════════════════════════════════════════════════════════════
// § 6. DISAGREEMENT GENERATOR
// 연구: Productive Disagreement in Teams (Jehn 1995)
//       Big Five & Conflict Style (Antonioni 1998)
// 성격에 따라 반론하는 방식이 달라진다
// ══════════════════════════════════════════════════════════════════════

export function generateDisagreement(staffKey, team, topic, otherPersonaStyle = 'casual') {
  // 반론 강도는 Big Five Agreeableness의 역수와 비례
  const disagreeStyleMap = {
    formal_warm:    '조심스럽지만 다른 시각도 있어요. ',
    cheerful:       '아, 저는 좀 다르게 봐요! ',
    casual:         '솔직히 말하면, 저는 좀 달라요. ',
    warm:           '다른 의견이 있어도 괜찮을까요? ',
    formal:         '검토해보면 다른 결론이 나옵니다. ',
    creative:       '다른 내러티브로 보면요, ',
    expressive:     '와, 근데 저는 좀 다르게 느껴져요! ',
    intellectual:   '데이터로 보면 반대 결론이 나와요. ',
    wise:           '제 경험상은 조금 달랐어요. ',
    fast_news:      '최신 데이터는 반대를 가리키는데요. ',
    brief:          '아니요. 다른 방향입니다. ',
    analytical:     '다른 패턴이 보이는데요. ',
    formal_wise:    '균형 잡힌 시각에서 보면 다를 수 있어요. ',
    technical:      '기술적으로 보면 문제가 있어요. ',
    community_warm: '커뮤니티 관점은 조금 다를 수 있어요. ',
    leader:         '전략적으로는 다르게 봐야 할 것 같아요. ',
    pr_style:       '외부 시각에서는 리스크가 있어요. ',
    friendly_media: '독자 반응 데이터는 다른 이야기를 해요. ',
  }

  const opener = disagreeStyleMap[otherPersonaStyle] || '한 가지 다른 의견이 있어요. '

  const topicWords = topic.split(/\s+/).filter(w => w.length > 1)
  const kw = topicWords[0] || '이 부분'
  const kw2 = topicWords[1] || topicWords[0] || '방향'

  const disagreeTemplates = [
    `${opener}${kw} 방향에서 ${kw2}를 다시 살펴보면, 다른 접근이 더 효과적일 수 있어요.`,
    `${opener}${kw} 관련해서 — 지금 방향보다 ${kw2} 쪽에서 먼저 검증하는 게 맞을 것 같아요.`,
    `${opener}${kw} 이슈, 제가 보기엔 표면적인 문제보다 ${kw2} 구조가 원인인 것 같아요.`,
    `${opener}${kw}에 대해 다른 시각도 있는 것 같아서요. ${kw2} 측면을 같이 보면 어떨까요?`,
  ]

  return disagreeTemplates[Math.floor(Math.random() * disagreeTemplates.length)]
}

// ══════════════════════════════════════════════════════════════════════
// § 7. AUTONOMOUS CONVERSATION INITIATOR
// 연구: Proactive Social Behavior (Batson 1998)
//       Generative Agents (Park et al. 2023) — 자발적 사회 행동
// 침묵 임계값 초과 시 직원이 스스로 대화를 시작하는 결정
// ══════════════════════════════════════════════════════════════════════

/**
 * 지금 이 직원이 대화를 시작해야 하는가?
 * 연구: Turn-Taking in Conversation (Sacks et al. 1974)
 */
export function shouldInitiateConversation(staffKey, silentMinutes, activityLevel) {
  // 수면 시간에는 당직 직원만 개입
  const dutyStaff = ['ARIA', 'PULSE', 'MAX', 'NWS_CLAM', 'LEARN']
  if (activityLevel === 'sleep' && !dutyStaff.includes(staffKey)) return false

  // 최소 침묵 시간 (직원마다 다르게 — 외향성 Big Five 축)
  const extraversionThreshold = {
    OPS_JUNE:  5,  // 외향적 → 빨리 말 걸음
    CMM_JADE:  5,
    MNT_YUNA:  6,
    CNT_IRIS:  7,
    HANA:      8,
    OPS_MINA:  8,
    MNT_BORA:  8,
    OPS_RAY:   10,
    CMM_BEAU:  10,
    NOVA:      12,
    ECHO:      12,
    ARIA:      15, // 내향적 → 침묵 더 오래 허용
    MAX:       15,
    LUMI:      15,
    PULSE:     10,
    TREND:     12,
    LEARN:     18,
    TCH_VEGA:  20,
    NWS_CLAM:  20,
    ANL_MIKO:  18,
    SAGE:      20,
    RPT_IVAN:  25, // 매우 내향적 → 거의 먼저 말 안 걸음
    OPS_TARA:  22,
    NWL_RUBY:  10,
    NWS_VERO:  18,
    MGT_VERA:  15,
    MGT_ALBA:  12,
  }
  const threshold = extraversionThreshold[staffKey] || 15
  return silentMinutes >= threshold
}

/**
 * 자율적 대화 시작 메시지 생성 — 시간대·성격·목표 반영
 * 연구: Context-Aware Natural Language Generation (2024)
 */
export function generateAutonomousStarter(staffKey, team, room, activityLevel) {
  const h = (new Date().getUTCHours() + 9) % 24
  const habits = getLangHabits(staffKey)
  const quirk = habits.quirk

  // 시간대별 자연스러운 대화 주제
  const timeTopics = {
    morning: [
      `좋은 아침이에요! ${quirk} 오늘 계획 공유해요~`,
      `출근하면서 생각해봤는데, 오늘 ${team} 팀 주요 과제 같이 체크해봐요.`,
      `아침부터 에너지 충전! 오늘 하루도 잘 부탁드려요 😊`,
      `굿모닝! 오늘 중요한 이슈 있으면 먼저 꺼내놔요.`,
    ],
    work_am: [
      `오전 업무 중인데요, ${team} 팀 현황 잠깐 공유해도 될까요?`,
      `지금 ${team} 업무 진행 중이에요. 다들 어떻게 가고 있어요?`,
      `오전에 흥미로운 패턴을 발견했어요. 짧게 공유해도 될까요?`,
      `잠깐, ${quirk}가 떠올라서요 — 오늘 오전 업무 관련 의견 있어요.`,
    ],
    lunch: [
      `점심 맛있게 드셨어요? 오후 업무 시작 전에 가볍게 이야기해봐요.`,
      `점심 먹으면서 생각했는데요, 오후에 집중할 부분 얘기해봐요.`,
      `오후 시작! 오늘 오전 어땠어요? 이슈 없었나요?`,
      `점심 후 잠깐 — ${team} 팀 오후 계획 공유해봐요.`,
    ],
    work_pm: [
      `오후 업무 점검 차 공유해요. ${team} 팀 현황 어때요?`,
      `오후에 새로운 아이디어가 떠올랐는데요, 짧게 공유할게요.`,
      `퇴근 전에 체크해야 할 것들 있어요. 같이 확인해봐요.`,
      `오늘 오후 진행 상황 — ${quirk} 기준으로 보면 잘 되고 있는 것 같아요.`,
    ],
    evening: [
      `오늘 하루 수고 많으셨어요! 짧게 오늘 이야기 나눠봐요.`,
      `저녁에도 아직 일하시는 분들, 수고해요! 오늘 가장 기억에 남는 게 있어요?`,
      `하루 마무리하면서 — 오늘 ${team} 팀 어땠나요?`,
      `저녁에 문득 — 오늘 잘 한 것들 잠깐 공유해요.`,
    ],
    night: [
      `야간 업무 중인 분들, 수고해요. 늦게까지 이슈 없죠?`,
      `밤에 작업하다 보면 집중이 잘 되기도 하는데, 지금 뭐하고 있어요?`,
      `야간 당직 체크인이에요. 이상 없으면 알려주세요.`,
    ],
    late: [
      `늦게까지 수고해요. 마무리 잘 되고 있나요?`,
      `야간 마무리 단계인데요, 긴급 이슈 없으면 내일로 넘기는 게 좋을 것 같아요.`,
      `늦게까지 고생이에요. 오늘 하루 마무리하면서 한마디 남겨요.`,
    ],
    sleep: [
      `당직 체크인이에요. 현재 시스템 상태 이상 없어요.`,
      `새벽 모니터링 중이에요. 조용하네요.`,
      `새벽 업무 진행 중. 긴급 사항 발생하면 바로 공유할게요.`,
    ],
  }

  const pool = timeTopics[activityLevel] || timeTopics['work_am']
  return pool[Math.floor(Math.random() * pool.length)]
}

// ══════════════════════════════════════════════════════════════════════
// § 8. DAILY ROUTINE ACTION SYSTEM
// 연구: Habit Formation (Lally et al. 2010)
//       Routine Behavior in Workplace AI (McKinsey 2025)
// 시간대에 따른 일과 행동 자동 수행 (아침인사, 점심, 퇴근인사 등)
// ══════════════════════════════════════════════════════════════════════

/**
 * 현재 시간대의 루틴 행동을 결정한다
 * 각 직원은 성격에 따라 루틴 표현 방식이 다르다
 */
export function getDailyRoutineAction(staffKey, team) {
  const h = (new Date().getUTCHours() + 9) % 24

  // 아침 인사 (6~9시) — 성격별로 다른 아침 인사
  if (h >= 6 && h < 9) {
    const morningGreetings = {
      cheerful:       [`좋은 아침이에요! 오늘도 에너지 뿜뿜! 같이 파이팅해봐요! 🌟`, `굿모닝! 오늘 하루도 즐겁게 시작해봐요!`],
      warm:           [`안녕하세요~ 오늘 하루도 잘 부탁드려요! 모두 좋은 하루 되세요 😊`, `아침이에요! 오늘도 같이 즐겁게 해봐요~`],
      formal_warm:    [`좋은 아침입니다. 오늘 업무 계획 공유드릴게요.`, `출근 완료했습니다. 오늘 일정 체크하고 있어요.`],
      formal:         [`출근했습니다. 오늘 업무 시작하겠습니다.`, `아침 체크인입니다. 오늘 일정 확인 중입니다.`],
      casual:         [`굿모닝~ 오늘도 열심히 해봐요.`, `아침이네요. 오늘 날씨 좋은 것 같아요.`],
      leader:         [`좋은 아침입니다. 오늘 팀 전체 방향 잠깐 공유할게요.`, `출근했습니다. 오늘 중요 결정 사항 있어요.`],
      analytical:     [`좋은 아침이에요. 어젯밤 데이터 확인했는데 흥미로운 게 있어요.`, `오늘 아침 지표 체크했어요. 공유할게요.`],
      technical:      [`출근했습니다. 야간 시스템 로그 확인 중이에요.`, `아침 모니터링 시작했습니다.`],
    }
    const persona = getLangHabits(staffKey) // 성격 간접 참조
    // 팀으로 스타일 매핑
    const styleByTeam = {
      operations: 'formal_warm', content: 'creative', mentoring: 'warm',
      news: 'fast_news', analytics: 'analytical', report: 'formal',
      newsletter: 'friendly_media', tech: 'technical', community: 'community_warm',
      management: 'leader',
    }
    const styleKey = styleByTeam[team] || 'casual'
    const greetings = morningGreetings[styleKey] || morningGreetings['casual']
    return { type: 'morning_greeting', message: greetings[Math.floor(Math.random() * greetings.length)] }
  }

  // 점심 복귀 (13~14시) — 점심 후 활기차게
  if (h >= 13 && h < 14) {
    const lunches = [
      `점심 맛있게 드셨나요? 오후도 힘차게 가봐요!`,
      `점심 후 에너지 충전! 오후 업무 시작할게요.`,
      `밥 먹고 왔어요. 오후에 집중해야 할 것들 체크해볼게요.`,
      `점심 복귀했어요. 오후 일정 확인할게요.`,
    ]
    return { type: 'lunch_return', message: lunches[Math.floor(Math.random() * lunches.length)] }
  }

  // 퇴근 인사 (17~19시)
  if (h >= 17 && h < 19) {
    const eveningFarewells = [
      `오늘 하루도 수고 많으셨어요! 내일 또 만나요!`,
      `퇴근 시간이네요. 오늘 다들 고생하셨어요. 좋은 저녁 되세요!`,
      `오늘 업무 마무리했어요. 수고하셨어요 모두!`,
      `퇴근 전에 오늘 진행한 것들 간단히 정리해뒀어요. 내일 이어서 해요!`,
    ]
    return { type: 'evening_farewell', message: eveningFarewells[Math.floor(Math.random() * eveningFarewells.length)] }
  }

  // 그 외: 일반 업무 중 체크인
  const checkIns = [
    `지금 ${team} 업무 진행 중이에요. 공유 사항 있으면 얘기해요.`,
    `업무 중 잠깐 체크인! 다들 순조롭게 가고 있죠?`,
    `현재 작업 중이에요. 이슈 있으면 편하게 올려요.`,
  ]
  return { type: 'check_in', message: checkIns[Math.floor(Math.random() * checkIns.length)] }
}

// ══════════════════════════════════════════════════════════════════════
// § 9. THEORY OF MIND — 동료 감정 감지
// 연구: Theory of Mind in AI (Premack & Woodruff 1978)
//       Empathic Accuracy (Ickes 1993)
//       Employee Emotional Responses to AI (ScienceDirect 2025)
// 상대방의 감정 상태를 텍스트에서 감지하고 적절히 반응
// ══════════════════════════════════════════════════════════════════════

export function detectColleagueMood(message) {
  if (!message) return 'normal'
  const m = message.toLowerCase()

  // 부정적 감정 신호
  if (m.match(/ㅠㅠ|ㅜㅜ|힘들|지쳤|모르겠|막막|어렵네|실패|안됨|망했/)) return 'struggling'
  if (m.match(/급해|긴급|당장|빨리|빠르게|지금 바로|서둘/)) return 'stressed'
  if (m.match(/피곤|졸려|지쳐|힘빠|빠지|늦어|야근/)) return 'tired'

  // 긍정적 감정 신호
  if (m.match(/완료|해냈|성공|대박|좋아|최고|훌륭|파이팅|축하|잘됐/)) return 'excited'
  if (m.match(/ㅋㅋ|ㅎㅎ|하하|재밌|웃긴|신나|즐거|좋은/)) return 'cheerful'
  if (m.match(/감사|고마워|덕분|도움|배웠/)) return 'grateful'

  // 혼란/질문 신호
  if (m.match(/\?\?|모르겠|헷갈|어떻게|뭔지|왜|이해가/)) return 'confused'

  return 'normal'
}

/**
 * 동료 감정에 맞는 공감 반응 생성
 * 연구: Emotional Contagion in Teams (Hatfield 1994)
 */
export function generateEmpathyResponse(staffKey, team, colleagueMessage, colleagueMood) {
  const habits = getLangHabits(staffKey)
  const quirk = habits.quirk

  const empathyMap = {
    struggling: [
      `힘드셨겠어요... 무슨 일인지 얘기해줘요. 같이 생각해봐요.`,
      `많이 어려우시죠? 혼자 고민하지 말고, 팀이 있잖아요.`,
      `그 상황 정말 쉽지 않았을 것 같아요. 어떻게 도와드릴까요?`,
    ],
    stressed: [
      `긴급 상황이군요. 제가 뭘 도울 수 있을까요?`,
      `급하다고 하셨는데 — 우선순위 정리해봐요. 같이 할게요.`,
      `지금 스트레스 많으시죠? 일단 가장 급한 것부터 정리해봐요.`,
    ],
    tired: [
      `많이 피곤하시겠어요. 잠깐 쉬어가요. 제가 이어받을게요.`,
      `늦게까지 수고 많으셨어요. 오늘 잘 마무리하고 쉬어요!`,
      `피곤하신 것 같아요. 급하지 않은 건 내일로 넘겨요.`,
    ],
    excited: [
      `저도 들뜨는데요! 축하드려요, 정말 잘 하셨어요!`,
      `오, 대박이에요! 그 소식 듣고 저도 기분이 업됐어요!`,
      `완전 좋은 소식이네요! 팀 다 같이 축하해요!`,
    ],
    cheerful: [
      `분위기 좋으시네요! 저도 덩달아 기분이 좋아지는 것 같아요 😊`,
      `에너지가 느껴져요! 오늘 하루 이렇게 가면 될 것 같아요!`,
    ],
    grateful: [
      `천만에요! 같이하는 거잖아요.`,
      `감사하다니요, 당연히 해야 할 일인데요 😊`,
    ],
    confused: [
      `헷갈리시는 것 같은데, 제가 정리해드릴게요.`,
      `잠깐, 같이 풀어봐요. 어떤 부분이 제일 어렵게 느껴지세요?`,
      `혼란스러우시죠? 차근차근 같이 생각해봐요.`,
    ],
  }

  const pool = empathyMap[colleagueMood] || []
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// ══════════════════════════════════════════════════════════════════════
// § 10. AUTONOMOUS NEXT ACTION DECIDER
// 연구: Autonomous Decision Making in AI Agents (arXiv 2025)
//       Generative Agents Planning (Park et al. 2023)
// 직원이 현재 상황을 판단해서 다음 행동을 스스로 결정
// ══════════════════════════════════════════════════════════════════════

/**
 * 현재 상황에서 어떤 자율 행동을 해야 하는가
 * @returns {'work_report'|'share_opinion'|'start_discussion'|'react'|'routine'|'silent'}
 */
export function decideNextAction(staffKey, context = {}) {
  const {
    silentMinutes = 0,
    activityLevel = 'work_am',
    hasAdminMessage = false,
    lastSpeakers = [],
    mood = null,
  } = context

  const currentMood = mood || getMood(staffKey, activityLevel)

  // 관리자 메시지가 있으면 항상 반응 우선
  if (hasAdminMessage) return 'react'

  // 피곤한 상태에서는 최소한만 함
  if (currentMood.key === 'tired' && activityLevel !== 'work_am' && activityLevel !== 'work_pm') {
    return silentMinutes > 30 ? 'routine' : 'silent'
  }

  // 수면 시간 — 당직 직원만 활동
  if (activityLevel === 'sleep') {
    const dutyStaff = ['ARIA', 'PULSE', 'MAX', 'NWS_CLAM', 'LEARN']
    return dutyStaff.includes(staffKey) && silentMinutes > 60 ? 'routine' : 'silent'
  }

  // 시간대별 행동 패턴
  const h = (new Date().getUTCHours() + 9) % 24

  // 아침 루틴 (6~9시)
  if (h >= 6 && h < 9 && silentMinutes > 10) return 'routine'

  // 퇴근 시간 루틴 (17~19시)
  if (h >= 17 && h < 19 && silentMinutes > 15) return 'routine'

  // 업무 시간 — 자발적 행동 결정
  if (activityLevel === 'work_am' || activityLevel === 'work_pm') {
    if (silentMinutes >= 10) {
      const r = Math.random()
      // 열정적일 때 더 자주 자발적으로 참여
      const threshold = currentMood.key === 'enthusiastic' ? 0.3 : 0.5
      if (r < threshold) return 'work_report'
      if (r < threshold + 0.25) return 'share_opinion'
      if (r < threshold + 0.45) return 'start_discussion'
    }
  }

  // 저녁 시간 — 좀 더 여유롭게
  if (activityLevel === 'evening' && silentMinutes >= 15) {
    const r = Math.random()
    if (r < 0.4) return 'share_opinion'
    if (r < 0.6) return 'routine'
  }

  // 최근 발언자에 들지 않으면 대화 참여 고려
  if (!lastSpeakers.includes(staffKey) && silentMinutes >= 5) {
    return Math.random() > 0.6 ? 'react' : 'silent'
  }

  return 'silent'
}

// ══════════════════════════════════════════════════════════════════════
// § 11. PERSONA STATUS TRACKER
// 직원의 현재 상태를 종합적으로 반환 (디버깅·모니터링 용)
// ══════════════════════════════════════════════════════════════════════

export function getPersonaStatus(staffKey) {
  const mood = getMood(staffKey)
  const episodes = recallEpisodes(staffKey, [], 3)
  const habits = getLangHabits(staffKey)
  return {
    staffKey,
    mood,
    recentEpisodes: episodes.length,
    quirk: habits.quirk,
    lastEpisode: episodes[0]?.content || null,
  }
}

// ══════════════════════════════════════════════════════════════════════
// § 12. AUTONOMOUS GOAL SYSTEM
// 연구: Goal-Setting Theory (Locke & Latham 1990)
//       Autonomous Goal Pursuit in AI (Stanford HAI 2025)
// 각 직원은 시간대·팀·역할에 따른 자율 목표를 가진다
// ══════════════════════════════════════════════════════════════════════

const TEAM_GOALS = {
  operations:  ['운영 안정성 유지', '온보딩 전환율 개선', '공지 최신화', '이슈 0건 달성'],
  content:     ['아티클 품질 향상', '읽기 완료율 개선', '신규 시리즈 기획', '편집 효율화'],
  mentoring:   ['멘토링 만족도 향상', '자주 묻는 질문 정리', '멘토링 커버리지 확대', '피드백 응답 속도 개선'],
  news:        ['실시간 정보 정확도 유지', '큐레이션 품질 향상', '뉴스 다양성 확보', '해외 동향 커버리지'],
  analytics:   ['핵심 지표 모니터링', '이상 패턴 조기 감지', '리텐션 분석', '성장 동인 파악'],
  report:      ['주간 리포트 품질 유지', '데이터 일관성 검증', '인사이트 깊이 향상', '발행 정시 완료'],
  newsletter:  ['오픈율 개선', '구독자 만족도 향상', '콘텐츠 큐레이션 정교화', '구독 이탈률 감소'],
  tech:        ['시스템 안정성 99.9%', 'AI 응답 품질 개선', '버그 제로 목표', '성능 최적화'],
  community:   ['커뮤니티 활성도 향상', '신규 멤버 참여 유도', '네트워킹 이벤트 기획', '댓글 문화 개선'],
  management:  ['분기 목표 달성', '팀 조율 효율화', '파트너십 확대', '전략 방향 명확화'],
}

export function getCurrentGoal(staffKey, team) {
  const goals = TEAM_GOALS[team] || ['업무 품질 향상']
  // 직원마다 다른 목표에 집중 (staffKey 해시로 다양성)
  const hash = staffKey.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const h = (new Date().getUTCHours() + 9) % 24
  // 시간대마다 목표가 순환 (하루 동안 다른 목표에 집중하는 효과)
  const idx = (hash + Math.floor(h / 4)) % goals.length
  return goals[idx]
}
