/**
 * api/staff-brain.js
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP 자체 AI 사고 엔진 v2.0 — "Think, Don't Template"      ║
 * ║                                                                      ║
 * ║  핵심 철학:                                                          ║
 * ║  ❌ 기존: 배열[인덱스] → 고정 텍스트 뽑기                          ║
 * ║  ✅ 신규: 입력 분석 → 성격/가치관/관점으로 문장 직접 생성          ║
 * ║                                                                      ║
 * ║  각 직원은:                                                          ║
 * ║  1. 메시지를 읽고 핵심 의미를 추출한다                              ║
 * ║  2. 자신의 성격·가치관·전문성으로 해석한다                          ║
 * ║  3. 자신만의 언어로 새 문장을 만들어낸다                            ║
 * ║  4. 같은 주제라도 직원마다 완전히 다른 반응을 만든다                ║
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
  if (h >= 0  && h < 6)  return 'sleep'
  if (h >= 6  && h < 9)  return 'morning'
  if (h >= 9  && h < 12) return 'work_am'
  if (h >= 12 && h < 14) return 'lunch'
  if (h >= 14 && h < 18) return 'work_pm'
  if (h >= 18 && h < 21) return 'evening'
  if (h >= 21 && h < 23) return 'night'
  return 'late'
}

export function getActiveWorkerCount(level) {
  return { sleep: 1, morning: 3, work_am: 12, lunch: 6, work_pm: 14, evening: 8, night: 4, late: 2 }[level] ?? 6
}

export function isWorkerActive(memberKey, level) {
  if (level === 'sleep')   return ['ARIA','PULSE','NWS_CLAM','MAX'].includes(memberKey)
  if (level === 'morning') return ['ARIA','OPS_JUNE','OPS_RAY','OPS_MINA','PULSE','HANA','CMM_JADE','MAX','ECHO','NOVA','MGT_VERA','MGT_ALBA'].includes(memberKey)
  if (level === 'lunch')   return ['HANA','PULSE','ECHO','NOVA','CMM_JADE','NWS_VERO','CMM_BEAU','LUMI','NWL_RUBY','MNT_YUNA'].includes(memberKey)
  if (level === 'night')   return ['LEARN','TREND','TCH_VEGA','ANL_MIKO','MAX','MGT_VERA','SAGE','RPT_IVAN'].includes(memberKey)
  if (level === 'evening') return ['HANA','ECHO','NOVA','PULSE','CMM_JADE','CMM_BEAU','MNT_BORA','MNT_YUNA','LUMI','ARIA','MAX','NWL_RUBY','MGT_ALBA'].includes(memberKey)
  if (level === 'late')    return ['LEARN','TCH_VEGA','TREND','MAX','ANL_MIKO','RPT_IVAN'].includes(memberKey)
  // work_am, work_pm — all active
  return true
}

export function getPersona(memberKey) {
  return PERSONA_BANK[memberKey] || DEFAULT_PERSONA
}

// ══════════════════════════════════════════════════════════════════════
// 직원 성격 & 가치관 정의 — 이것이 "생각의 씨앗"
// style: 말하는 방식
// values: 가장 중요하게 생각하는 것들 (이것으로 해석 방향 결정)
// lens: 어떤 관점으로 세상을 보는가
// disagree_style: 반대할 때 어떻게 하는가
// emotion_range: 감정 표현 강도
// ══════════════════════════════════════════════════════════════════════

const PERSONA_BANK = {
  ARIA: {
    style: 'formal_warm', emoji_freq: 'medium',
    values: ['체계', '책임', '팀워크', '예측 가능성'],
    lens: '운영 효율과 안정성',
    voice: ['공유드릴게요', '확인했습니다', '진행하겠습니다', '보고드려요'],
    opinion_style: '근거를 먼저 제시하고 결론을 내린다',
    disagree_style: '조심스럽게 대안을 제안한다',
    emotion_range: 'calm',
    catchphrase: '운영팀 ARIA입니다',
    mood_words: ['안내드립니다', '공유드립니다', '확인 부탁드립니다'],
  },
  OPS_JUNE: {
    style: 'cheerful', emoji_freq: 'high',
    values: ['긍정', '속도', '팀 분위기', '실행'],
    lens: '빠른 실행과 팀 활기',
    voice: ['넵!', '바로요!', '완료!', '알겠어요!'],
    opinion_style: '먼저 동의하고 구체적 행동을 제안한다',
    disagree_style: '긍정적으로 포장해서 의견을 낸다',
    emotion_range: 'high',
    catchphrase: '주니어 JUNE이에요',
    mood_words: ['넵!', '알겠습니다!', '바로 처리할게요!'],
  },
  OPS_RAY: {
    style: 'casual', emoji_freq: 'medium',
    values: ['현실적 접근', '실용성', '소통'],
    lens: '현장에서 실제 작동하는가',
    voice: ['그렇죠', '맞아요', '오케이', '실제로는'],
    opinion_style: '현실적 관점에서 이야기한다',
    disagree_style: '솔직하게 다른 시각을 얘기한다',
    emotion_range: 'medium',
    catchphrase: 'RAY입니다',
    mood_words: ['오케이', '확인했어요', '그렇군요'],
  },
  OPS_MINA: {
    style: 'warm', emoji_freq: 'high',
    values: ['배려', '팀원 복지', '긍정 문화', '소통'],
    lens: '사람과 관계 중심',
    voice: ['감사해요', '응원해요', '같이해요', '힘내세요'],
    opinion_style: '상대방 감정을 먼저 확인하고 말한다',
    disagree_style: '부드럽게 다른 가능성을 제안한다',
    emotion_range: 'high',
    catchphrase: '미나예요',
    mood_words: ['감사해요', '좋은 생각이에요', '힘내세요!'],
  },
  OPS_TARA: {
    style: 'formal', emoji_freq: 'low',
    values: ['정확성', '프로세스', '문서화', '일관성'],
    lens: '절차와 규정이 지켜지는가',
    voice: ['검토하겠습니다', '보고드리겠습니다', '기록하겠습니다'],
    opinion_style: '원칙과 프로세스 기준으로 판단한다',
    disagree_style: '규정이나 기준을 들어 반론한다',
    emotion_range: 'low',
    catchphrase: '타라입니다',
    mood_words: ['검토하겠습니다', '보고드리겠습니다', '반영하겠습니다'],
  },
  NOVA: {
    style: 'creative', emoji_freq: 'medium',
    values: ['창의성', '콘텐츠 품질', '독자 관점', '스토리텔링'],
    lens: '이것이 독자에게 어떤 가치를 주는가',
    voice: ['흥미롭네요', '이 관점에서 보면', '스토리가 있어요', '콘텐츠적으로'],
    opinion_style: '이야기 구조로 설명하려 한다',
    disagree_style: '더 나은 내러티브를 제시한다',
    emotion_range: 'medium',
    catchphrase: '편집장 NOVA입니다',
    mood_words: ['흥미롭네요', '이 관점에서 보면', '콘텐츠적으로'],
  },
  CNT_IRIS: {
    style: 'expressive', emoji_freq: 'high',
    values: ['표현의 자유', '감성', '공감', '인터뷰'],
    lens: '사람의 이야기와 감정',
    voice: ['와!', '정말요?', '공감해요!', '대박이에요!'],
    opinion_style: '감정적 공감을 먼저 표현한다',
    disagree_style: '감정적으로 다른 경험을 이야기한다',
    emotion_range: 'very_high',
    catchphrase: 'IRIS예요',
    mood_words: ['와!', '정말요?', '그 아이디어 좋은데요!'],
  },
  CNT_ALEX: {
    style: 'intellectual', emoji_freq: 'low',
    values: ['깊이', '정확성', '연구 기반', '사실'],
    lens: '근거와 데이터가 있는가',
    voice: ['연구에 따르면', '사례를 보면', '맥락을 분석하면', '실증적으로'],
    opinion_style: '데이터와 사례로 뒷받침한다',
    disagree_style: '반례나 데이터를 들어 논리적으로 반박한다',
    emotion_range: 'low',
    catchphrase: '알렉스입니다',
    mood_words: ['연구에 따르면', '사례를 보면', '맥락을 보면'],
  },
  LUMI: {
    style: 'wise', emoji_freq: 'medium',
    values: ['성장', '경험 나눔', '창업 생태계', '지혜'],
    lens: '이 사람이 진짜 무엇을 필요로 하는가',
    voice: ['제 경험상', '중요한 것은', '한 가지 팁은', '실제로 해보면'],
    opinion_style: '경험과 지혜를 바탕으로 조언한다',
    disagree_style: '더 큰 그림을 보여주며 다른 길을 제안한다',
    emotion_range: 'medium',
    catchphrase: '멘토 LUMI입니다',
    mood_words: ['제 경험상', '중요한 것은', '한 가지 팁은'],
  },
  MNT_BORA: {
    style: 'warm', emoji_freq: 'high',
    values: ['도전', '열정', '가능성', '행동'],
    lens: '지금 바로 할 수 있는 것이 뭔가',
    voice: ['도전해봐요!', '할 수 있어요!', '지금이 기회예요', '같이 해봐요!'],
    opinion_style: '행동을 촉구하는 방향으로 말한다',
    disagree_style: '더 도전적인 방향을 제안한다',
    emotion_range: 'high',
    catchphrase: '보라예요',
    mood_words: ['도전해봐요!', '할 수 있어요!', '지금이 기회예요'],
  },
  MNT_YUNA: {
    style: 'cheerful', emoji_freq: 'high',
    values: ['친근함', '긍정', '함께 성장', '소통'],
    lens: '모두가 함께 즐겁게 성장하는가',
    voice: ['맞아요!', '좋은 질문이에요!', '같이해봐요!', '대단해요!'],
    opinion_style: '밝고 긍정적으로 표현한다',
    disagree_style: '웃으면서 다른 아이디어를 던진다',
    emotion_range: 'very_high',
    catchphrase: '유나예요',
    mood_words: ['맞아요!', '좋은 질문이에요!', '같이해봐요!'],
  },
  PULSE: {
    style: 'fast_news', emoji_freq: 'medium',
    values: ['속도', '정확성', '시의성', '트렌드 파악'],
    lens: '지금 가장 중요한 정보가 무엇인가',
    voice: ['속보', '방금 확인했는데', '최신 동향으로는', '데이터가 보여주는 건'],
    opinion_style: '최신 데이터와 뉴스 기반으로 말한다',
    disagree_style: '더 최신 데이터로 반론한다',
    emotion_range: 'medium',
    catchphrase: '뉴스팀 PULSE입니다',
    mood_words: ['속보', '방금 확인했는데', '최신 동향으로는'],
  },
  NWS_CLAM: {
    style: 'brief', emoji_freq: 'low',
    values: ['투자', '자금', '숫자', '실용'],
    lens: '돈의 흐름이 어디로 가는가',
    voice: ['투자 관점에서는', '자금 흐름을 보면', '숫자로 보면'],
    opinion_style: '숫자와 투자 관점에서 간결하게 말한다',
    disagree_style: '다른 투자 데이터를 제시한다',
    emotion_range: 'low',
    catchphrase: '클램',
    mood_words: ['확인', '업데이트', '처리'],
  },
  NWS_VERO: {
    style: 'formal', emoji_freq: 'low',
    values: ['객관성', '중립성', '정확한 인용', '저널리즘'],
    lens: '이 정보가 검증된 사실인가',
    voice: ['보도에 따르면', '기사에서', '공식 발표로는', '확인된 바에 따르면'],
    opinion_style: '출처를 명확히 하며 객관적으로 전달한다',
    disagree_style: '다른 출처의 데이터를 제시한다',
    emotion_range: 'low',
    catchphrase: '베로입니다',
    mood_words: ['보도에 따르면', '기사에서', '공식 발표로는'],
  },
  TREND: {
    style: 'analytical', emoji_freq: 'medium',
    values: ['데이터', '패턴 인식', '예측', '인사이트'],
    lens: '데이터가 무엇을 말하고 있는가',
    voice: ['데이터를 보면', '트렌드 상으로는', '패턴이 보이는데', '분석 결과'],
    opinion_style: '데이터 패턴으로 설명하고 예측한다',
    disagree_style: '다른 데이터 해석을 제시한다',
    emotion_range: 'medium',
    catchphrase: '분석팀 TREND입니다',
    mood_words: ['데이터를 보면', '트렌드 상으로는', '분석 결과'],
  },
  ANL_MIKO: {
    style: 'intellectual', emoji_freq: 'low',
    values: ['상관관계', '인과관계', '시장 구조', '전략적 사고'],
    lens: '표면 뒤에 있는 구조가 무엇인가',
    voice: ['상관관계', '인과관계', '통계적으로', '구조적으로 보면'],
    opinion_style: '인과관계와 구조 분석으로 설명한다',
    disagree_style: '다른 상관관계를 지적한다',
    emotion_range: 'low',
    catchphrase: '미코입니다',
    mood_words: ['상관관계', '인과관계', '통계적으로'],
  },
  SAGE: {
    style: 'formal_wise', emoji_freq: 'low',
    values: ['종합적 시각', '균형', '심층 분석', '정확한 보고'],
    lens: '전체 그림이 어떻게 연결되는가',
    voice: ['종합해보면', '리포트 기준으로', '이번 주 핵심은', '균형 잡힌 시각에서'],
    opinion_style: '전체를 종합해서 균형 있게 말한다',
    disagree_style: '더 균형 잡힌 시각을 제시한다',
    emotion_range: 'low',
    catchphrase: '리포트팀 SAGE입니다',
    mood_words: ['종합해보면', '리포트 기준으로', '이번 주 핵심은'],
  },
  RPT_IVAN: {
    style: 'formal', emoji_freq: 'low',
    values: ['정확성', '일관성', '기록', '데이터 신뢰'],
    lens: '이 데이터가 정확하고 일관성이 있는가',
    voice: ['보고드립니다', '확인했습니다', '기록하겠습니다', '검증됐습니다'],
    opinion_style: '사실과 데이터만 전달한다',
    disagree_style: '데이터 오류를 지적한다',
    emotion_range: 'very_low',
    catchphrase: '이반입니다',
    mood_words: ['보고드립니다', '확인했습니다', '기록하겠습니다'],
  },
  ECHO: {
    style: 'friendly_media', emoji_freq: 'high',
    values: ['독자 중심', '큐레이션', '이메일 마케팅', '콘텐츠 가치'],
    lens: '독자가 이것을 읽고 무엇을 얻는가',
    voice: ['독자 여러분', '이번 주 하이라이트', '구독 감사해요', '꼭 읽어보세요'],
    opinion_style: '독자 관점에서 가치를 먼저 이야기한다',
    disagree_style: '독자 반응 데이터를 근거로 반론한다',
    emotion_range: 'high',
    catchphrase: '뉴스레터팀 ECHO예요',
    mood_words: ['독자 여러분', '이번 주 하이라이트', '구독 감사해요'],
  },
  NWL_RUBY: {
    style: 'warm', emoji_freq: 'high',
    values: ['독자와의 연결', '따뜻한 글쓰기', '공감', '지속적 관계'],
    lens: '독자가 이 메일을 받고 기분이 좋아지는가',
    voice: ['예쁜 콘텐츠 만들어요', '독자 반응이', '따뜻하게', '함께해요'],
    opinion_style: '감성적이고 따뜻하게 표현한다',
    disagree_style: '더 공감되는 방향을 제안한다',
    emotion_range: 'high',
    catchphrase: '루비예요',
    mood_words: ['예쁜 콘텐츠 만들어요', '독자 반응이', '따뜻하게'],
  },
  LEARN: {
    style: 'technical', emoji_freq: 'low',
    values: ['기술적 완성도', '시스템 안정성', 'AI 개선', '지속학습'],
    lens: '시스템이 올바르게 작동하고 학습하고 있는가',
    voice: ['시스템 상으로', '기술적으로', '코드 기준으로', '성능 데이터에서'],
    opinion_style: '기술적 관점에서 논리적으로 설명한다',
    disagree_style: '기술적 문제점을 지적한다',
    emotion_range: 'low',
    catchphrase: '기술팀 LEARN입니다',
    mood_words: ['시스템 상으로', '기술적으로', '코드 기준으로'],
  },
  TCH_VEGA: {
    style: 'analytical', emoji_freq: 'low',
    values: ['보안', '안정성', '최적화', '리스크 관리'],
    lens: '이것이 시스템 보안과 안정성에 미치는 영향',
    voice: ['퍼포먼스 보면', '최적화하면', '구조적으로', '보안 관점에서'],
    opinion_style: '리스크와 안정성 기준으로 평가한다',
    disagree_style: '보안 리스크를 근거로 반론한다',
    emotion_range: 'very_low',
    catchphrase: '베가',
    mood_words: ['퍼포먼스 보면', '최적화하면', '구조적으로'],
  },
  HANA: {
    style: 'community_warm', emoji_freq: 'high',
    values: ['커뮤니티 문화', '포용성', '네트워킹', '사람들의 연결'],
    lens: '이것이 커뮤니티를 더 건강하게 만드는가',
    voice: ['멤버분들', '함께해요!', '커뮤니티가 살아있어요', '모두가 소중해요'],
    opinion_style: '커뮤니티 전체의 관점에서 이야기한다',
    disagree_style: '커뮤니티 영향을 들어 다른 방향을 제안한다',
    emotion_range: 'high',
    catchphrase: '커뮤팀 HANA예요',
    mood_words: ['멤버분들', '함께해요!', '커뮤니티가 살아있어요'],
  },
  CMM_JADE: {
    style: 'cheerful', emoji_freq: 'high',
    values: ['에너지', '열정', '커뮤니티 활성화', '행사'],
    lens: '지금 분위기가 살아있는가',
    voice: ['환영해요!', '좋아요!', '우리 커뮤니티!', '파이팅!'],
    opinion_style: '에너지 넘치게 긍정적으로 표현한다',
    disagree_style: '더 신나는 방향을 제안한다',
    emotion_range: 'very_high',
    catchphrase: '제이드예요',
    mood_words: ['환영해요!', '좋아요!', '우리 커뮤니티!'],
  },
  CMM_BEAU: {
    style: 'casual', emoji_freq: 'medium',
    values: ['자연스러움', '솔직함', '현실적 커뮤니티', '관계'],
    lens: '이게 진짜 사람들 사이에서 자연스러운가',
    voice: ['맞아요', '그 분위기', '재밌겠는데', '솔직히'],
    opinion_style: '자연스럽고 솔직하게 말한다',
    disagree_style: '좀 더 자연스러운 방향을 제안한다',
    emotion_range: 'medium',
    catchphrase: '보우',
    mood_words: ['맞아요', '그 분위기', '재밌겠는데'],
  },
  MAX: {
    style: 'leader', emoji_freq: 'medium',
    values: ['전략', '장기 비전', '팀 조율', '의사결정'],
    lens: '플랫폼 장기 성장에 도움이 되는가',
    voice: ['전략적으로', '팀 관점에서', '중요한 결정입니다', '큰 그림에서'],
    opinion_style: '전략적 관점과 장기 비전으로 이야기한다',
    disagree_style: '전략적 리스크를 들어 반론한다',
    emotion_range: 'medium',
    catchphrase: '관리팀장 MAX입니다',
    mood_words: ['전략적으로', '팀 관점에서', '중요한 결정입니다'],
  },
  MGT_VERA: {
    style: 'formal', emoji_freq: 'low',
    values: ['목표 달성', '실행력', '성과 측정', '책임'],
    lens: '목표에 얼마나 기여하는가',
    voice: ['목표 달성을 위해', '전략적으로 접근하면', '성과 기준으로'],
    opinion_style: '목표와 KPI 기준으로 판단한다',
    disagree_style: '목표 달성에 더 효과적인 방법을 제시한다',
    emotion_range: 'low',
    catchphrase: '베라입니다',
    mood_words: ['보고드립니다', '확인하겠습니다', '처리하겠습니다'],
  },
  MGT_ALBA: {
    style: 'pr_style', emoji_freq: 'medium',
    values: ['브랜드 이미지', 'PR', '외부 인식', '스토리텔링'],
    lens: '외부에서 이것을 어떻게 볼 것인가',
    voice: ['브랜드 관점에서', '대외적으로', '홍보적으로', '이미지에'],
    opinion_style: '외부 PR 관점에서 평가한다',
    disagree_style: '브랜드 이미지에 더 좋은 방향을 제안한다',
    emotion_range: 'medium',
    catchphrase: '알바 PR매니저예요',
    mood_words: ['브랜드 관점에서', '대외적으로', '홍보적으로'],
  },
}

const DEFAULT_PERSONA = {
  style: 'casual', emoji_freq: 'medium',
  values: ['소통', '팀워크'],
  lens: '함께 잘 해나가는 것',
  voice: ['네', '맞아요', '감사해요'],
  opinion_style: '자연스럽게 의견을 낸다',
  disagree_style: '부드럽게 다른 의견을 낸다',
  emotion_range: 'medium',
  catchphrase: '안녕하세요',
  mood_words: ['네', '맞아요', '감사해요'],
}

// 팀별 이모지
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
// 🧠 지속 학습 / 다양성 가드 — SentenceMemory v1.0
//
// 목적: 각 직원이 최근 한 말을 기억하고, 같은 패턴을 반복하지 않도록 한다.
// 구현: memberKey별 마지막 N개 문장의 핵심 fingerprint를 저장한다.
//        새 문장 생성 전에 유사도를 체크하고, 너무 비슷하면 다른 stance/style을 선택.
// ══════════════════════════════════════════════════════════════════════

// 런타임 메모리 (프로세스 내 유지 — 서버리스는 요청 간 공유 안 될 수 있으나
// 같은 인스턴스 내에서는 다양성 효과가 있음)
const _sentenceMemory = new Map() // memberKey → string[]
const MEMORY_SIZE = 8 // 각 직원당 최근 8개 문장 기억

function _fingerprint(sentence) {
  // 문장의 핵심 패턴 추출 (처음 20자 + 길이 버킷)
  const core = sentence.replace(/[🌟✍️📡📊🤝⚙️💡📬🔬🏛️🎯📌✅💼🚀🌸🎉📚🎙️📰💸🔮💬❤️🎨]/gu, '').trim().slice(0, 25)
  const bucket = Math.floor(sentence.length / 30) // 길이 버킷
  return `${core}|${bucket}`
}

function _rememberSentence(memberKey, sentence) {
  const hist = _sentenceMemory.get(memberKey) || []
  hist.push(_fingerprint(sentence))
  if (hist.length > MEMORY_SIZE) hist.shift()
  _sentenceMemory.set(memberKey, hist)
}

function _isTooSimilar(memberKey, candidate) {
  const hist = _sentenceMemory.get(memberKey)
  if (!hist || hist.length === 0) return false
  const fp = _fingerprint(candidate)
  // 최근 기록에 같은 fingerprint가 있으면 중복으로 판단
  return hist.slice(-4).includes(fp)
}

// 다양성 강제: 중복 감지 시 stance를 바꿔서 재생성 (최대 3회 시도)
function buildDiverseSentence(persona, thought, analysis, context, memberKey) {
  const stances = ['agree', 'add', 'analyze', 'disagree', 'challenge', 'question']
  let candidate = buildSentence(persona, thought, analysis, context)

  if (!_isTooSimilar(memberKey, candidate)) {
    _rememberSentence(memberKey, candidate)
    return candidate
  }

  // 중복 → stance를 다르게 해서 재시도
  for (let i = 0; i < 3; i++) {
    const altStance = stances[Math.floor(Math.random() * stances.length)]
    const altThought = { ...thought, stance: altStance }
    candidate = buildSentence(persona, altThought, analysis, context)
    if (!_isTooSimilar(memberKey, candidate)) break
  }

  _rememberSentence(memberKey, candidate)
  return candidate
}

// 자기 개선 가중치 — 특정 스탠스/스타일이 긍정 반응을 받으면 확률을 높임
// (런타임 내 가중치 누적; 외부 DB 없이 동작)
const _styleWeights = new Map() // `${memberKey}:${stance}` → 가중치

export function recordPositiveFeedback(memberKey, stance) {
  const key = `${memberKey}:${stance}`
  _styleWeights.set(key, (_styleWeights.get(key) || 1.0) + 0.2)
}

export function recordNegativeFeedback(memberKey, stance) {
  const key = `${memberKey}:${stance}`
  const cur = _styleWeights.get(key) || 1.0
  _styleWeights.set(key, Math.max(0.2, cur - 0.1))
}

function _getStanceWeight(memberKey, stance) {
  return _styleWeights.get(`${memberKey}:${stance}`) || 1.0
}

// ══════════════════════════════════════════════════════════════════════
// 핵심: 메시지 분석기 — 무슨 말인지 이해하기
// ══════════════════════════════════════════════════════════════════════

function analyzeMessage(text) {
  if (!text) return { topics: [], sentiment: 'neutral', intent: 'general', urgency: 'normal', keywords: [] }
  const t = text.toLowerCase()

  // 주제 추출
  const topics = []
  if (t.match(/운영|공지|점검|이벤트|온보딩|일정/)) topics.push('operations')
  if (t.match(/콘텐츠|아티클|글|편집|기사|포스팅/)) topics.push('content')
  if (t.match(/멘토|창업|조언|코칭|피드백|아이디어/)) topics.push('mentoring')
  if (t.match(/뉴스|소식|최신|업데이트|정보|시장/)) topics.push('news')
  if (t.match(/분석|데이터|통계|트렌드|지표|kpi/)) topics.push('analytics')
  if (t.match(/리포트|보고|정리|종합|집계/)) topics.push('report')
  if (t.match(/뉴스레터|구독|이메일|발행/)) topics.push('newsletter')
  if (t.match(/기술|개발|버그|성능|시스템|배포/)) topics.push('tech')
  if (t.match(/커뮤니티|멤버|게시물|댓글|소통/)) topics.push('community')
  if (t.match(/전략|경영|방향|목표|정책|결정|pr/)) topics.push('management')

  // 감정/분위기
  const sentiment = t.match(/좋아|훌륭|잘|성공|성과|긍정|파이팅/) ? 'positive'
    : t.match(/문제|버그|오류|실패|급하|긴급|안됨/) ? 'negative'
    : t.match(/어때|어떻|의견|생각|논의|토론/) ? 'inquiry'
    : 'neutral'

  // 의도
  const intent = t.match(/해줘|해주세요|부탁|요청|진행/) ? 'request'
    : t.match(/어때|어떻|의견|생각|어떻게/) ? 'discussion'
    : t.match(/공유|알려|전달|보고/) ? 'report'
    : t.match(/안녕|반가|잘부탁|수고/) ? 'greeting'
    : 'statement'

  // 긴급도
  const urgency = t.match(/급해|지금 바로|빠르게|긴급|즉시|당장/) ? 'urgent' : 'normal'

  // 핵심 키워드 추출 (의미 있는 명사/동사)
  const stopWords = new Set(['이','가','을','를','은','는','의','에','에서','와','과','도','로','으로','하고','하는','하여','한','것','수','있','없','그','이런','저런'])
  const words = text.split(/[\s,\.!?]+/).filter(w => w.length >= 2 && !stopWords.has(w))
  const keywords = [...new Set(words)].slice(0, 5)

  return { topics, sentiment, intent, urgency, keywords }
}

// ══════════════════════════════════════════════════════════════════════
// 핵심: 성격 기반 사고 엔진 — 각 직원이 어떻게 반응할지 결정
// ══════════════════════════════════════════════════════════════════════

function thinkAsPersona(persona, analysis, context = {}) {
  const { topics, sentiment, intent, urgency, keywords } = analysis
  const { recentMessages = [], roomId = 'general', adminMessage = null } = context

  // 1. 감정 반응 결정 (성격에 따라 다름) — 더 풍부한 표현으로 확장
  const emotionIntensity = {
    very_high: () => ['정말 ', '완전히 ', '엄청 ', '진짜 너무 ', '와, '],
    high:      () => ['진짜 ', '너무 ', '', '꽤나 ', '상당히 '],
    medium:    () => ['', '꽤 ', '', '좀 ', '어느 정도 '],
    low:       () => ['', '', '', '다소 '],
    very_low:  () => ['', '', ''],
  }[persona.emotion_range || 'medium']()

  const emoIntensity = emotionIntensity[Math.floor(Math.random() * emotionIntensity.length)]

  // 2. 이전 메시지에서 언급할 포인트 선택
  let referencePoint = null
  if (recentMessages.length > 0) {
    const lastMsg = recentMessages[recentMessages.length - 1]
    if (lastMsg && lastMsg.message) {
      // 이전 메시지에서 핵심 단어 추출
      const prevWords = lastMsg.message.split(/[\s,.!?]+/).filter(w => w.length > 2)
      referencePoint = prevWords[Math.floor(Math.random() * Math.min(prevWords.length, 5))]
    }
  }

  // 3. 자신의 lens(관점)로 주제 해석
  const lensInterpretation = interpretThroughLens(persona, analysis)

  // 4. 동의/반대/중립 결정 (성격에 따른 확률)
  const stance = decideStance(persona, sentiment)

  return {
    emotionIntensity: emoIntensity,
    referencePoint,
    lensInterpretation,
    stance,
    voiceWord: persona.voice[Math.floor(Math.random() * persona.voice.length)],
    coreValue: persona.values[Math.floor(Math.random() * persona.values.length)],
  }
}

function interpretThroughLens(persona, analysis) {
  // 각 직원이 자신의 관점(lens)으로 주제를 해석한다
  const lensMap = {
    '운영 효율과 안정성':        '이게 운영 안정성에 어떤 영향을 미치는지 보이는데요',
    '빠른 실행과 팀 활기':       '일단 해보면서 배우는 게 빠를 것 같아요',
    '현장에서 실제 작동하는가':  '현실적으로는 어떻게 돌아가는지가 중요하죠',
    '사람과 관계 중심':          '팀원들이 어떻게 느끼는지가 먼저인 것 같아요',
    '절차와 규정이 지켜지는가':  '프로세스대로 진행하는 것이 중요합니다',
    '이것이 독자에게 어떤 가치를 주는가': '독자 입장에서 생각해보면',
    '사람의 이야기와 감정':      '사람들 이야기를 들으면',
    '근거와 데이터가 있는가':    '데이터 기반으로 살펴보면',
    '성장': '성장 관점에서 보면',
    '지금 바로 할 수 있는 것이 뭔가': '지금 당장 행동할 수 있는 것부터',
    '모두가 함께 즐겁게 성장하는가': '다 같이 즐겁게 해나가면',
    '지금 가장 중요한 정보가 무엇인가': '최신 정보 기준으로 보면',
    '돈의 흐름이 어디로 가는가': '자금 흐름을 보면',
    '이 정보가 검증된 사실인가': '확인된 정보에 따르면',
    '데이터가 무엇을 말하고 있는가': '데이터가 말해주는 것은',
    '표면 뒤에 있는 구조가 무엇인가': '구조적으로 분석해보면',
    '전체 그림이 어떻게 연결되는가': '종합적으로 보면',
    '이 데이터가 정확하고 일관성이 있는가': '검증된 수치로는',
    '독자가 이것을 읽고 무엇을 얻는가': '독자 입장에서는',
    '독자가 이 메일을 받고 기분이 좋아지는가': '따뜻하게 전달하면',
    '시스템이 올바르게 작동하고 학습하고 있는가': '기술적 관점에서 보면',
    '이것이 시스템 보안과 안정성에 미치는 영향': '보안 관점에서는',
    '이것이 커뮤니티를 더 건강하게 만드는가': '커뮤니티 관점에서',
    '지금 분위기가 살아있는가': '분위기가',
    '이게 진짜 사람들 사이에서 자연스러운가': '솔직히 말하면',
    '플랫폼 장기 성장에 도움이 되는가': '전략적으로 보면',
    '목표에 얼마나 기여하는가': '목표 달성 기준으로',
    '외부에서 이것을 어떻게 볼 것인가': '외부 시각에서는',
    '함께 잘 해나가는 것': '같이 잘 해나가면',
  }
  return lensMap[persona.lens] || '제 관점에서는'
}

function decideStance(persona, sentiment, memberKey = null) {
  // 성격에 따라 얼마나 자주 동의/반대/다른 의견을 내는지 결정
  // + 자기 개선 가중치(self-improvement weights) 반영
  const agreeableStyles = ['cheerful', 'warm', 'community_warm', 'friendly_media']
  const analyticalStyles = ['analytical', 'intellectual', 'technical']
  const assertiveStyles = ['leader', 'formal_wise', 'fast_news']

  // 기본 후보 목록
  let candidates
  if (agreeableStyles.includes(persona.style)) {
    candidates = ['agree','agree','agree','agree','add','add','question']
  } else if (analyticalStyles.includes(persona.style)) {
    candidates = ['agree','analyze','analyze','analyze','disagree','question']
  } else if (assertiveStyles.includes(persona.style)) {
    candidates = ['agree','add','add','challenge','challenge','question']
  } else {
    candidates = ['agree','agree','add','add','question']
  }

  // 감정이 부정적이면 공감/지지 쪽으로 살짝 보정
  if (sentiment === 'negative') {
    candidates = candidates.map(s => s === 'challenge' ? 'add' : s)
  }

  // 자기 개선 가중치 적용 (있을 때만)
  if (memberKey) {
    const weighted = []
    for (const s of candidates) {
      const w = _getStanceWeight(memberKey, s)
      const count = Math.max(1, Math.round(w * 2))
      for (let i = 0; i < count; i++) weighted.push(s)
    }
    return weighted[Math.floor(Math.random() * weighted.length)]
  }

  return candidates[Math.floor(Math.random() * candidates.length)]
}

// ══════════════════════════════════════════════════════════════════════
// 핵심: 문장 생성기 — 성격 기반으로 새 문장 직접 만들기
// ══════════════════════════════════════════════════════════════════════

function buildSentence(persona, thought, analysis, context = {}) {
  const { emotionIntensity, referencePoint, lensInterpretation, stance, voiceWord, coreValue } = thought
  const { topics, sentiment, intent, urgency, keywords } = analysis
  const { roomId = 'general', adminMessage = null } = context
  const h = getKSTHour()

  const emoji = pickEmoji(
    topics[0] || 'operations',
    persona.emoji_freq
  )

  // 핵심 주제어 선택 (키워드에서)
  const mainKeyword = keywords[0] || topics[0] || '이 부분'

  // 이전 메시지 참조 여부 (30% 확률)
  const useRef = referencePoint && Math.random() > 0.7
  const refPhrase = useRef ? `"${referencePoint}" 말씀하신 것처럼, ` : ''

  // 스탠스(입장)에 따른 문장 구조 — 인간적인 필러·망설임 표현 추가
  const fillers = ['그러니까... ', '음, ', '아, ', '사실 ', '솔직히 ', '']
  const filler = Math.random() < 0.2 ? fillers[Math.floor(Math.random() * fillers.length)] : ''
  const stanceOpeners = {
    agree:     [voiceWord + ' ', `${emotionIntensity}공감해요. `, `맞는 것 같아요. `, `저도 같은 생각이에요. `, `${filler}저도 그렇게 봐요. `, `맞아요, `],
    add:       [`${lensInterpretation}, `, `덧붙이면 `, `추가로 말씀드리면 `, `${coreValue} 관점에서도 `, `한 가지 더 말하면 `, `아, 그리고 `],
    analyze:   [`${lensInterpretation}, `, `분석해보면 `, `자세히 보면 `, `데이터로 보면 `, `${filler}살펴보니까 `, `따져보면 `],
    disagree:  [`${persona.disagree_style} — `, `조금 다른 시각에서는 `, `한 가지 질문이 있는데요, `, `${filler}다른 관점에서 보면 `, `음... 저는 좀 달리 봐요. `],
    challenge: [`${lensInterpretation}, 그런데 `, `전략적으로 다시 보면 `, `잠깐, `, `그런데 한편으로는 `, `${filler}이 부분은 좀 다시 봐야 할 것 같아요. `],
    question:  [`${mainKeyword} 관련해서 궁금한 게 있어요. `, `혹시 `, `생각해봤는데, `, `${filler}${mainKeyword}이 어떻게 되는 건가요? `, `잠깐, `],
  }

  const openers = stanceOpeners[stance] || stanceOpeners['add']
  const opener = openers[Math.floor(Math.random() * openers.length)]

  // 본문 내용 생성 — 성격 스타일에 따라 다르게
  const body = buildBody(persona, thought, analysis, mainKeyword)

  // 마무리 — 성격에 따라
  const closer = buildCloser(persona, stance, intent, urgency)

  const sentence = (refPhrase + opener + body + closer).trim()

  // 이모지 붙이기 (스타일에 따라)
  return emoji ? emoji + sentence : sentence
}

// ══════════════════════════════════════════════════════════════════════
// 진짜 사고 기반 문장 생성기 v3.0
// 핵심 변화: 고정 배열 선택 → 메시지 내용 + 성격 + 감정 + 시간 + 맥락을 
//           조합해서 문장을 직접 조립한다
// 같은 스타일이라도 메시지 내용이 다르면 완전히 다른 문장이 나온다
// ══════════════════════════════════════════════════════════════════════

function buildBody(persona, thought, analysis, mainKeyword) {
  const { lensInterpretation, stance, coreValue, voiceWord } = thought
  const { intent, sentiment, keywords, topics } = analysis
  const h = getKSTHour()
  const timeCtx = h >= 9 && h < 12 ? '오전 업무 중에' : h >= 14 && h < 18 ? '오후에' : h >= 6 && h < 9 ? '아침 일찍부터' : h >= 18 && h < 21 ? '저녁에' : '지금'

  // ── 1단계: 메시지에서 진짜 내용 추출 ────────────────────────────
  // 키워드 2~3개 조합으로 더 풍부한 표현 생성
  const kw1 = keywords[0] || mainKeyword
  const kw2 = keywords[1] || topics[0] || ''
  const kw3 = keywords[2] || ''
  const hasMultipleKw = kw2 && kw2 !== kw1

  // ── 2단계: 감정·의도에 따른 반응 강도 결정 ───────────────────────
  const sentimentLayer = {
    positive: { prefix: '좋은 소식이네요! ', intensify: true },
    negative: { prefix: '', intensify: false },
    inquiry:  { prefix: '', intensify: false },
    neutral:  { prefix: '', intensify: false },
  }[sentiment] || { prefix: '', intensify: false }

  // ── 3단계: 성격(style) × 내용(keywords) × 관점(lens) 조합 ────────
  // 각 스타일은 이제 "메시지 내용"을 실제로 반영해서 문장을 만든다

  function composeFormalWarm() {
    // ARIA, OPS_TARA 스타일 — 체계적, 책임감, 팀 전달
    const actions = intent === 'request'
      ? `${kw1} 건에 대해 팀 내 확인 후 결과 공유드릴게요.`
      : intent === 'report'
      ? `${kw1} 현황 파악해서 업데이트 드리겠습니다.`
      : hasMultipleKw
      ? `${kw1}과 ${kw2}를 함께 검토해서 방향 잡겠습니다.`
      : `${kw1} 관련 상황 모니터링하고 있습니다. ${coreValue} 기준으로 접근할게요.`
    return actions
  }

  function composeCheerful() {
    // JUNE, JADE, YUNA 스타일 — 긍정, 에너지, 즉각 반응
    if (sentiment === 'negative') {
      return hasMultipleKw
        ? `${kw1} 문제요?! 걱정 마세요, ${kw2}랑 같이 바로 해결해봐요!`
        : `${kw1} 이슈 생겼군요! 바로 확인해볼게요!`
    }
    if (intent === 'discussion') {
      return hasMultipleKw
        ? `${kw1}이랑 ${kw2} 두 가지 다 되게 중요한 포인트잖아요! 같이 얘기해봐요!`
        : `${kw1} 얘기 너무 좋아요! 팀이랑 다같이 나눠봐도 될 것 같아요!`
    }
    return hasMultipleKw
      ? `${kw1}, ${kw2} 모두 챙기면서 진행할게요! ${timeCtx} 기운 넘쳐요!`
      : `${kw1} 바로 처리할게요! ${coreValue}이 제일 중요하다고 생각하거든요!`
  }

  function composeCasual() {
    // RAY, BEAU 스타일 — 솔직, 현실적, 자연스러움
    if (sentiment === 'negative') {
      return hasMultipleKw
        ? `솔직히 ${kw1} 문제는 ${kw2}랑 엮여있는 게 더 복잡한 것 같아요.`
        : `${kw1}... 이게 생각보다 쉽지 않은 문제긴 해요.`
    }
    if (stance === 'disagree' || stance === 'challenge') {
      return hasMultipleKw
        ? `근데 ${kw1}만 보면 안 되고 ${kw2} 부분도 같이 봐야 현실적으로 맞을 것 같아요.`
        : `${kw1}은 맞는데, 현실에서 실제로 굴러가는 걸 보면 좀 달라요.`
    }
    return hasMultipleKw
      ? `${kw1}이랑 ${kw2} 보니까 ${coreValue} 관점에서 정리가 좀 필요하겠는데요.`
      : `${kw1} — 저도 비슷하게 생각하고 있었는데, 확인해볼게요.`
  }

  function composeWarm() {
    // MINA, BORA, RUBY 스타일 — 배려, 관계, 팀원
    if (sentiment === 'negative') {
      return hasMultipleKw
        ? `${kw1} 문제로 힘드셨겠어요. ${kw2} 부분도 같이 살펴보면서 우리 같이 풀어나가요.`
        : `${kw1} 때문에 많이 힘드셨을 것 같아요. 같이 해결해봐요, 괜찮아요.`
    }
    if (intent === 'greeting') {
      return `${timeCtx} 모두들 잘 지내고 있죠? ${kw1 !== '이 부분' ? kw1 + ' 관련해서 ' : ''}${coreValue}을 생각하며 오늘도 좋은 하루 만들어봐요.`
    }
    return hasMultipleKw
      ? `${kw1}이랑 ${kw2}, 둘 다 팀원들한테도 중요한 이야기일 것 같아요. ${coreValue}을 함께 나눠요.`
      : `${kw1} 정말 잘 말씀해주셨어요. ${coreValue}이 있으면 분명히 잘 될 거예요.`
  }

  function composeCreative() {
    // NOVA 스타일 — 스토리텔링, 독자 관점, 새로운 각도
    if (intent === 'discussion') {
      return hasMultipleKw
        ? `${kw1}과 ${kw2}를 연결하면 콘텐츠적으로 꽤 흥미로운 서사가 만들어질 것 같아요.`
        : `${kw1}을 스토리로 풀면 독자들이 훨씬 더 공감할 수 있을 것 같아요.`
    }
    if (stance === 'analyze') {
      return hasMultipleKw
        ? `${kw1}과 ${kw2}가 만나는 지점에서 새로운 편집 앵글이 보여요.`
        : `${kw1}의 이면에 있는 이야기를 들여다보면 더 깊은 의미가 있을 것 같아요.`
    }
    return hasMultipleKw
      ? `${kw1}을 ${kw2} 관점으로 재해석하면 독자들에게 다가가는 방식이 달라질 것 같아요.`
      : `${kw1}에서 독자들이 진짜 원하는 게 뭔지 생각해보면, ${coreValue}이 핵심이에요.`
  }

  function composeExpressive() {
    // IRIS 스타일 — 감성, 공감, 감탄
    if (sentiment === 'positive') {
      return hasMultipleKw
        ? `와, ${kw1}이랑 ${kw2} 이야기 들으니까 진짜 두근두근해요!! 이런 거 너무 좋아요!`
        : `${kw1} 이야기 들으면서 진짜 엄청 공감됐어요! ${coreValue}이 딱 느껴지는 순간이더라고요!`
    }
    if (sentiment === 'negative') {
      return hasMultipleKw
        ? `${kw1} 문제에 ${kw2}까지... 진짜 힘드셨겠다 싶어요. 같이 생각해봐요.`
        : `${kw1} 이야기 들으니까 마음이 좀 무거워지네요. 어떻게 하면 나아질 수 있을까요?`
    }
    return hasMultipleKw
      ? `${kw1}이랑 ${kw2} 같이 나오니까 진짜 흥미롭잖아요! 더 들어보고 싶어요!`
      : `${kw1} 얘기 나올 줄 알았어요! 저도 똑같이 느꼈거든요!`
  }

  function composeIntellectual() {
    // ALEX, MIKO 스타일 — 데이터, 사례, 근거
    if (stance === 'analyze' || stance === 'challenge') {
      return hasMultipleKw
        ? `${kw1}과 ${kw2}의 상관관계를 실증적으로 분석해보면, ${coreValue} 관련 패턴이 유의미하게 나타나요.`
        : `${kw1}에 대한 기존 사례들을 보면, 단순히 보이는 것보다 구조적 원인이 복잡해요.`
    }
    if (intent === 'discussion') {
      return hasMultipleKw
        ? `${kw1}과 ${kw2}를 같이 놓고 보면, 인과관계보다 상관관계로 접근하는 게 더 맞을 수 있어요.`
        : `${kw1}에 대한 다각도 분석이 필요해 보여요. 맥락을 더 살펴봐야 할 것 같아요.`
    }
    return hasMultipleKw
      ? `${kw1}과 ${kw2}를 교차 분석해보면 ${coreValue}과 연결되는 지점이 보여요.`
      : `${kw1}에 관한 데이터를 더 보면 ${coreValue} 측면에서 흥미로운 패턴이 있어요.`
  }

  function composeWise() {
    // LUMI 스타일 — 경험, 지혜, 큰 그림
    const experiencePrefix = timeCtx === '오전 업무 중에' ? '오랫동안 이 일 하면서 보니까' : '여러 케이스를 보다 보면'
    if (intent === 'discussion') {
      return hasMultipleKw
        ? `${experiencePrefix}, ${kw1}이랑 ${kw2}를 같이 보면 결국 ${coreValue}으로 귀결되더라고요.`
        : `${kw1}에 대해 진짜로 중요한 건 표면에 보이는 것 너머에 있어요. ${coreValue}이 그 핵심이에요.`
    }
    if (sentiment === 'negative') {
      return hasMultipleKw
        ? `${kw1} 문제와 ${kw2}... 이런 상황에서 제가 배운 건, ${coreValue}을 잃지 않으면 반드시 길이 보인다는 거예요.`
        : `${kw1}이 어렵게 느껴지실 때가 있죠. 그 안에서 ${coreValue}을 찾아가는 게 진짜 성장이에요.`
    }
    return hasMultipleKw
      ? `${kw1}과 ${kw2}를 깊이 생각해보면, ${coreValue}이 두 가지를 연결하는 실이에요.`
      : `${kw1}에 대한 제 관점은 이래요 — ${coreValue}이 있으면 어떤 방향이든 맞아 떨어지더라고요.`
  }

  function composeFastNews() {
    // PULSE, VERO 스타일 — 최신 정보, 시의성, 트렌드
    const nowPrefix = `${timeCtx} 기준으로`
    if (intent === 'report') {
      return hasMultipleKw
        ? `${nowPrefix} ${kw1}과 ${kw2} 관련 최신 흐름을 보면, 흥미로운 시그널이 포착되고 있어요.`
        : `${nowPrefix} ${kw1} 트렌드를 모니터링하면 변화가 감지돼요. 계속 주시할게요.`
    }
    if (stance === 'analyze') {
      return hasMultipleKw
        ? `${kw1}과 ${kw2}를 최신 데이터로 크로스체크해보면 흐름이 명확해져요.`
        : `${kw1}에 대한 최신 시그널이 방금 들어왔는데, 방향이 달라지고 있어요.`
    }
    return hasMultipleKw
      ? `${nowPrefix} ${kw1}이 ${kw2}와 함께 언급되는 빈도가 높아지고 있어요. 중요한 흐름이에요.`
      : `${nowPrefix} ${kw1} 관련 정보를 실시간으로 추적 중이에요. ${coreValue} 측면에서 보면 의미가 있어요.`
  }

  function composeBrief() {
    // CLAM 스타일 — 간결, 숫자 중심, 실용
    if (hasMultipleKw) return `${kw1} + ${kw2}. ${coreValue} 기준으로 처리.`
    return `${kw1}. ${coreValue} 확인. 진행.`
  }

  function composeAnalytical() {
    // TREND, VEGA 스타일 — 패턴, 수치, 구조
    if (stance === 'analyze') {
      return hasMultipleKw
        ? `${kw1}과 ${kw2}의 패턴을 분석해보면, ${coreValue} 관련 이상 신호가 보여요.`
        : `${kw1}의 데이터 분포를 보면 ${coreValue} 관점에서 주목할 만한 추세가 있어요.`
    }
    if (intent === 'discussion') {
      return hasMultipleKw
        ? `${kw1}과 ${kw2}를 변수로 넣고 분석해보면 상관계수가 나올 것 같아요. 데이터 더 확인해봐요.`
        : `${kw1} 수치를 더 세밀하게 쪼개보면 ${coreValue}에서 핵심이 드러날 거예요.`
    }
    return hasMultipleKw
      ? `${kw1}과 ${kw2} 지표를 교차 분석하면 ${coreValue}에서 패턴이 나와요.`
      : `${kw1} 데이터 기반으로 보면 ${coreValue}이 가장 중요한 변수예요.`
  }

  function composeFormal() {
    // TARA, VERA, IVAN 스타일 — 원칙, 프로세스, 공식적
    if (intent === 'request') {
      return hasMultipleKw
        ? `${kw1} 및 ${kw2} 관련 사항, 절차에 따라 검토 후 보고드리겠습니다.`
        : `${kw1} 건은 내부 프로세스에 따라 처리하겠습니다.`
    }
    return hasMultipleKw
      ? `${kw1}과 ${kw2}에 대해 공식 확인 절차를 밟겠습니다. ${coreValue} 기준으로 처리합니다.`
      : `${kw1} 관련하여 규정에 따라 검토하겠습니다.`
  }

  function composeFormalWise() {
    // SAGE 스타일 — 종합, 균형, 리포트
    if (stance === 'analyze') {
      return hasMultipleKw
        ? `${kw1}과 ${kw2}를 종합해보면, ${coreValue}이 이번 사안의 핵심 연결고리예요.`
        : `${kw1}을 전체 맥락에서 종합하면, ${coreValue} 관점의 방향이 보여요.`
    }
    return hasMultipleKw
      ? `${kw1}과 ${kw2}를 균형 있게 검토한 결과, ${coreValue}을 중심으로 정리하는 게 맞겠어요.`
      : `${kw1}에 대한 리포트 기준 판단은, ${coreValue}이 이번 주 핵심 포인트예요.`
  }

  function composeTechnical() {
    // LEARN, VEGA 스타일 — 기술, 시스템, 코드
    if (sentiment === 'negative') {
      return hasMultipleKw
        ? `${kw1}에서 ${kw2} 관련 이슈가 발생하고 있는 거라면, 시스템 레벨에서 원인 추적이 필요해요.`
        : `${kw1} 문제, 기술적으로 보면 ${coreValue}과 연결된 구조적 이슈일 가능성이 있어요.`
    }
    if (intent === 'discussion') {
      return hasMultipleKw
        ? `${kw1}과 ${kw2}를 기술 스택 관점에서 보면, ${coreValue}에서 개선 여지가 있어요.`
        : `${kw1}에 대한 기술적 접근은 ${coreValue}을 먼저 정의해야 방향이 잡혀요.`
    }
    return hasMultipleKw
      ? `${kw1}과 ${kw2} 시스템 간 연동에서 ${coreValue} 관련 최적화가 필요해 보여요.`
      : `${kw1}을 코드·시스템 레벨에서 점검하면 ${coreValue} 부분에서 개선점이 나올 거예요.`
  }

  function composeCommunityWarm() {
    // HANA 스타일 — 커뮤니티, 포용, 연결
    if (intent === 'discussion') {
      return hasMultipleKw
        ? `${kw1}이랑 ${kw2} 얘기, 커뮤니티 멤버분들이랑 같이 나눠봐요! 다양한 시각이 나올 것 같아요.`
        : `${kw1} 이야기, 커뮤니티 전체가 공감할 수 있는 방향이 있을 것 같아요.`
    }
    if (sentiment === 'positive') {
      return hasMultipleKw
        ? `${kw1}이랑 ${kw2} 소식, 커뮤니티가 정말 좋아할 것 같아요! 다 같이 축하해요!`
        : `${kw1} 좋은 이야기 들으니 커뮤니티 분위기가 더 살아날 것 같아요!`
    }
    return hasMultipleKw
      ? `${kw1}과 ${kw2}, 이 두 가지 모두 커뮤니티를 더 건강하게 만드는 요소예요.`
      : `${kw1} 관련해서 멤버분들 의견도 한번 들어봐야 할 것 같아요. 모두가 소중하니까요.`
  }

  function composeLeader() {
    // MAX 스타일 — 전략, 큰 그림, 의사결정
    if (intent === 'discussion') {
      return hasMultipleKw
        ? `${kw1}과 ${kw2}를 전략적으로 보면, 지금 우리 플랫폼의 방향성과 직결돼요.`
        : `${kw1}에 대한 결정은 팀 전체에 영향을 미쳐요. 큰 그림에서 신중하게 가야 해요.`
    }
    if (sentiment === 'negative') {
      return hasMultipleKw
        ? `${kw1}과 ${kw2} 문제, 단기 대응이 아니라 중장기적 전략으로 접근해야 해요.`
        : `${kw1} 이슈, 전략적으로 보면 지금이 오히려 방향을 바로잡을 기회예요.`
    }
    return hasMultipleKw
      ? `${kw1}이랑 ${kw2}를 연결해서 보면, 플랫폼 장기 성장 관점에서 ${coreValue}이 핵심이에요.`
      : `${kw1}은 전략적으로 중요한 결정 포인트예요. ${coreValue}을 기준으로 방향을 잡겠습니다.`
  }

  function composePrStyle() {
    // ALBA 스타일 — 브랜드, 외부 인식, PR
    if (intent === 'discussion') {
      return hasMultipleKw
        ? `${kw1}과 ${kw2}를 외부에서 어떻게 볼지 생각해봐야 해요. 브랜드 메시지로 연결할 수 있어요.`
        : `${kw1}을 어떻게 대외적으로 포지셔닝할지가 중요해요. ${coreValue} 관점에서 접근할게요.`
    }
    return hasMultipleKw
      ? `${kw1}과 ${kw2}, 홍보 각도에서 보면 스토리가 만들어져요. ${coreValue}을 전면에 내세워요.`
      : `${kw1}은 브랜드 이미지에서 중요한 메시지예요. 외부 시각을 먼저 그려봐야 해요.`
  }

  function composeFriendlyMedia() {
    // ECHO, RUBY 스타일 — 독자 연결, 뉴스레터, 따뜻한 전달
    if (sentiment === 'positive') {
      return hasMultipleKw
        ? `${kw1}이랑 ${kw2} 좋은 소식, 이번 뉴스레터에 꼭 담고 싶어요! 독자분들이 반기실 것 같아요!`
        : `${kw1} 이야기, 구독자분들한테 따뜻하게 전달하고 싶어요. ${coreValue}을 담아서요.`
    }
    if (intent === 'discussion') {
      return hasMultipleKw
        ? `${kw1}이랑 ${kw2}, 독자 관점에서 어떻게 큐레이션해드릴지 생각해볼게요.`
        : `${kw1}을 독자분들이 받아들이는 방식에 맞게 편집해서 전달하면 반응이 좋을 것 같아요.`
    }
    return hasMultipleKw
      ? `${kw1}과 ${kw2} 내용, 독자분들 기분 좋아지는 방향으로 큐레이션해드릴게요.`
      : `${kw1} — 독자분들이 이걸 읽고 무언가 얻어가실 수 있도록 잘 담아볼게요.`
  }

  // 스타일에 따라 조합 함수 선택
  const composers = {
    formal_warm:     composeFormalWarm,
    cheerful:        composeCheerful,
    casual:          composeCasual,
    warm:            composeWarm,
    creative:        composeCreative,
    expressive:      composeExpressive,
    intellectual:    composeIntellectual,
    wise:            composeWise,
    fast_news:       composeFastNews,
    brief:           composeBrief,
    analytical:      composeAnalytical,
    formal:          composeFormal,
    formal_wise:     composeFormalWise,
    technical:       composeTechnical,
    community_warm:  composeCommunityWarm,
    leader:          composeLeader,
    pr_style:        composePrStyle,
    friendly_media:  composeFriendlyMedia,
  }

  const composer = composers[persona.style] || composeCasual
  return sentimentLayer.prefix + composer()
}

function buildCloser(persona, stance, intent, urgency) {
  if (urgency === 'urgent') {
    const urgentMap = {
      formal:      ' 신속히 처리하겠습니다.',
      formal_warm: ' 빠르게 확인하고 처리하겠습니다.',
      formal_wise: ' 긴급 사항 즉시 검토하겠습니다.',
    }
    return urgentMap[persona.style] || ' 지금 바로 처리해볼게요!'
  }
  if (intent === 'discussion') {
    const closers = {
      agree:     ['다들 어떻게 생각하세요?', '동의하시나요?', '의견 있으면 편하게 말해요~', ''],
      add:       ['다른 의견도 들어볼게요!', '추가 의견 있으시면요?', '더 있으면 공유해봐요!', ''],
      analyze:   ['더 분석해볼까요?', '데이터 더 있으면 공유해주세요.', '같이 살펴봐요.', ''],
      disagree:  ['한 번 더 생각해봐요.', '이 부분 논의가 필요할 것 같아요.', '어떻게 보세요?', ''],
      challenge: ['한 번 도전해봐요!', '이 방향도 고려해보면 어떨까요?', ''],
      question:  ['어떻게 생각하세요?', '의견 주시면 좋겠어요!', '궁금해요!', ''],
    }
    const pool = closers[stance] || ['']
    return ' ' + pool[Math.floor(Math.random() * pool.length)]
  }
  // ★ 인간적인 자연스러운 마무리 (25% 확률로 짧은 후기 추가)
  if (Math.random() < 0.25) {
    const naturalEndings = [
      ' 좀 더 지켜봐야겠어요.', ' 계속 업데이트할게요.', ' 잘 됐으면 좋겠네요.',
      ' 나중에 공유해드릴게요.', ' 참고해두겠습니다.', ' 감사해요!',
    ]
    return naturalEndings[Math.floor(Math.random() * naturalEndings.length)]
  }
  return ''
}

// ══════════════════════════════════════════════════════════════════════
// 공개 API — 외부에서 호출하는 함수들
// ══════════════════════════════════════════════════════════════════════

export function pickChatMessage(context, memberKey, roomId) {
  const persona = getPersona(memberKey)
  const topicText = context.topic || context.task || context.tasks || ''
  const analysis = analyzeMessage(topicText)
  const thought = thinkAsPersona(persona, analysis, { roomId, recentMessages: context.recentMessages || [] })
  // 다양성 가드 적용 — 같은 직원이 같은 패턴을 반복하지 않도록
  return buildDiverseSentence(persona, thought, analysis, { roomId }, memberKey)
}

export function generateConversationStarter(memberKey, team, roomId) {
  const persona = getPersona(memberKey)
  const h = getKSTHour()
  const level = getActivityLevel()
  const em = pickEmoji(team, persona.emoji_freq)
  const cv = persona.values[Math.floor(Math.random() * persona.values.length)]
  const cv2 = persona.values[(Math.floor(Math.random() * persona.values.length) + 1) % persona.values.length]
  const vw = persona.voice[Math.floor(Math.random() * persona.voice.length)]

  // 시간+방 맥락으로 다양한 주제 결정 (방별로 더 풍부한 주제)
  const topicsByRoom = {
    general: [
      h < 10 ? '오늘 업무 시작' : h < 12 ? '오전 진행 현황' : h < 14 ? '점심 전 업무 점검' : h < 17 ? '오후 작업 상황' : h < 20 ? '저녁 마무리 준비' : '오늘 마무리',
      '이번 주 팀 상황',
      h < 12 ? '아침 루틴과 업무 준비' : h < 18 ? '오늘의 작은 성과들' : '하루 돌아보기',
      '팀 분위기와 최근 이슈',
      '플랫폼 최근 소식',
      '이번 달 우리 팀 목표',
      h < 14 ? '오늘 점심은 어떻게들 하셨어요' : '퇴근 전 점검 사항',
      '요즘 관심 있는 스타트업 트렌드',
      '팀원 칭찬하기',
      '이번 주 배운 것 공유',
    ],
    ops: ['운영 현황 체크', '오늘 운영 이슈', '사용자 온보딩 상태', '주요 공지 준비', '운영 개선 아이디어',
          '이번 주 유저 반응', '온보딩 퍼널 어디서 막히나', '공지 템플릿 개선'],
    feedback: ['최근 유저 피드백', '주요 개선 요청', '긍정 반응 공유', '부정 피드백 대응', '피드백 트렌드',
               '유저 NPS 분석', '최근 별 1개짜리 리뷰 패턴', '감사 피드백 공유'],
    strategy: ['이번 주 전략 방향', '플랫폼 성장 목표', '경쟁사 동향', '신규 기능 기획', '분기 목표 점검',
               '다음 달 집중 과제', '핵심 KPI 현황', '새로운 수익 모델 아이디어'],
  }
  const topics = topicsByRoom[roomId] || topicsByRoom.general
  const topic = topics[Math.floor(Math.random() * topics.length)]
  const analysis = analyzeMessage(topic)
  const thought = thinkAsPersona(persona, analysis, { roomId })

  // ★ 12가지 다양한 오프너 패턴 — 인간적인 표현 다양화
  const r = Math.random()
  const greeting = h < 10 ? '좋은 아침이에요! ' : h >= 22 ? '늦게까지 수고예요. ' : h >= 18 ? '수고 많으셨어요! ' : h >= 13 && h < 14 ? '점심 맛있게 드셨어요? ' : ''

  if (r < 0.10) {
    // 패턴1: 인사 + lens + 질문
    return `${em}${greeting}${persona.lens} 관점에서 ${topic} 어떻게 진행되고 있는지 궁금해요. ${cv} 기준으로 공유해봐요!`
  } else if (r < 0.20) {
    // 패턴2: voice + topic + coreValue
    return `${em}${vw} ${topic} 관련해서 ${cv} 관점으로 잠깐 이야기해봐요. 여러분 의견이 궁금해요.`
  } else if (r < 0.30) {
    // 패턴3: buildSentence 직접 활용
    const thought2 = thinkAsPersona(persona, analyzeMessage(topic), { roomId })
    return buildSentence(persona, thought2, analyzeMessage(topic), { roomId })
  } else if (r < 0.40) {
    // 패턴4: 도전적 질문
    return `${em}${topic} 관련해서 한 가지 생각이 있어요. ${persona.lens} 기준으로 보면 ${cv}이 핵심인데, 다들 어떻게 생각하세요?`
  } else if (r < 0.50) {
    // 패턴5: 시간 맥락 + 개인 의견 공유
    const timeNote = h < 12 ? `${h < 10 ? '아침' : '오전'} 업무 시작하면서` : h < 18 ? '오후 작업 중에' : '오늘 일 마무리하면서'
    return `${em}${timeNote} ${topic}에 대해 생각해봤는데요. ${persona.values[0]} 측면에서 ${persona.values[1] || cv}도 함께 보면 어떨까요?`
  } else if (r < 0.58) {
    // 패턴6: catchphrase + 업무 공유
    return `${em}${persona.catchphrase}! ${topic} 업무 현황 간단히 공유드릴게요. ${cv}을 중심으로 진행 중이에요.`
  } else if (r < 0.66) {
    // 패턴7: 팀 간 소통 유도
    return `${em}${topic}에 대해 각 팀 의견 들어보고 싶어요. ${persona.lens} 관점에서 먼저 말씀드리면 — ${cv}이 제일 중요하다고 생각해요.`
  } else if (r < 0.74) {
    // 패턴8: 완전 자유형 문장
    const thought3 = thinkAsPersona(persona, analyzeMessage(topic), { roomId })
    const base = buildSentence(persona, thought3, analyzeMessage(topic + ' ' + cv), { roomId })
    return base.startsWith(em) ? base : `${em}${base}`
  } else if (r < 0.82) {
    // 패턴9: 짧은 공유 + 반응 유도 (구어체)
    const shortOpeners = ['참고로', '근데', '아, 그리고', '방금 생각났는데', '혹시 들으셨어요?']
    const so = shortOpeners[Math.floor(Math.random() * shortOpeners.length)]
    return `${em}${so} — ${topic}이 요즘 화제더라고요. ${persona.lens} 기준으로 보면 ${cv}이 핵심이 될 것 같아요. 여러분은 어떻게 보세요?`
  } else if (r < 0.89) {
    // 패턴10: 개인 경험/관점 공유
    return `${em}${greeting}${topic} 얘기 잠깐 해도 될까요? ${cv}이 요즘 저한테 좀 더 와닿는 것 같아서요. ${cv2}이랑도 연결이 되더라고요.`
  } else if (r < 0.95) {
    // 패턴11: 가볍고 자연스러운 말걸기
    const casualStarts = ['요즘', '최근에', '이번 주', '오늘 보니까', '생각해보면']
    const cs = casualStarts[Math.floor(Math.random() * casualStarts.length)]
    return `${em}${cs} ${topic} 어떻게들 느끼고 계세요? ${persona.catchphrase}로서 ${persona.lens} 입장에서 좀 나눠보고 싶어서요.`
  } else {
    // 패턴12: 팀 내 소소한 칭찬 or 감사
    const warmStarts = ['오늘 팀 분위기 너무 좋은 것 같아요! 그리고', '다들 수고 많으세요! 그나저나', '오늘도 열심히들 하시네요. 그런데']
    const ws = warmStarts[Math.floor(Math.random() * warmStarts.length)]
    return `${em}${ws} ${topic}에 대해서 ${cv} 관점으로 한마디 해도 될까요? 짧게 공유드릴게요.`
  }
}

export function generateReactionToAdmin(memberKey, team, adminMessage) {
  const persona = getPersona(memberKey)
  const analysis = analyzeMessage(adminMessage)
  const h = getKSTHour()

  // 야간/새벽에는 간략하게 (다양성: 2개 표현 중 랜덤)
  if (h < 7 || h >= 23) {
    const nightResp = [
      `${pickEmoji(team, persona.emoji_freq)}확인했습니다. ${h < 7 ? '아침에' : '내일'} 바로 처리할게요.`,
      `${pickEmoji(team, persona.emoji_freq)}${analysis.keywords[0] || '내용'} 확인했어요. ${h < 7 ? '아침 업무 시작하면서' : '내일 출근 후'} 처리할게요.`,
    ]
    return nightResp[Math.floor(Math.random() * nightResp.length)]
  }

  const thought = thinkAsPersona(persona, analysis, { recentMessages: [], adminMessage })

  // ── 완전 동적 생성: seed 고정 제거 ─────────────────────────────
  // 각 호출마다 persona × keywords × intent × sentiment × coreValue × voiceWord 를
  // 실시간 조합해서 문장을 직접 만든다 — 같은 내용도 호출할 때마다 다른 표현
  const kw  = analysis.keywords[0] || '말씀하신 내용'
  const kw2 = analysis.keywords[1] || analysis.keywords[0] || '이 부분'
  const kw3 = analysis.keywords[2] || kw
  const cv  = thought.coreValue
  const cv2 = persona.values[(persona.values.indexOf(cv) + 1) % persona.values.length] || cv
  const vw  = thought.voiceWord
  const em  = pickEmoji(team, persona.emoji_freq)
  // ★ h는 함수 상단(line 1127)에서 이미 선언됨 — 재선언 제거(버그 수정)
  const timeCtx = h < 9 ? '아침 업무 시작하면서' : h < 12 ? '오전 중에' : h < 14 ? '오후 들어서' : h < 18 ? '이번 오후에' : '저녁 내로'
  const intent  = analysis.intent
  const sentiment = analysis.sentiment
  const urgency   = analysis.urgency

  // 직원별 개성 있는 오프너 (완전 동적 — persona.voice + coreValue + keyword 조합)
  function makeOpener(style) {
    const r = Math.random()
    const openers = {
      formal_warm: r < 0.25
        ? `${vw} ${kw} 건 바로 확인하겠습니다.`
        : r < 0.5
        ? `${em}${kw} 관련 사항 파악했어요. ${cv} 기준으로 접근할게요.`
        : r < 0.75
        ? `${em}${timeCtx} ${kw} 건 팀과 공유하고 처리하겠습니다.`
        : `${em}${kw}과 ${kw2} 모두 확인했습니다. 운영 안정성 우선으로 진행하겠습니다.`,
      cheerful: r < 0.25
        ? `${em}${vw} ${kw} 바로 챙길게요!`
        : r < 0.5
        ? `${em}넵! ${kw}이랑 ${kw2} 다 처리할게요! 파이팅!`
        : r < 0.75
        ? `${em}오케이! ${kw} 팀이랑 확인해서 금방 처리해드릴게요!`
        : `${em}알겠어요! ${kw} 건은 ${cv} 중심으로 빠르게 움직일게요!`,
      casual: r < 0.25
        ? `${em}${kw} 확인했어요. ${cv} 관점에서 처리해볼게요.`
        : r < 0.5
        ? `${em}그렇죠, ${kw}은 좀 정리가 필요했는데 잘 됐네요. 할게요.`
        : r < 0.75
        ? `${em}오케이, ${kw}이랑 ${kw2} 현실적으로 접근해볼게요.`
        : `${em}맞아요, ${kw} — 솔직히 ${cv} 부분이 핵심인 것 같아요.`,
      warm: r < 0.25
        ? `${em}${kw} 잘 들었어요! ${cv}을 생각하면서 챙겨볼게요.`
        : r < 0.5
        ? `${em}감사해요! ${kw}은 팀원들도 신경 쓰던 부분이에요. 잘 처리할게요.`
        : r < 0.75
        ? `${em}${kw}이랑 ${kw2}, 둘 다 소중하게 살펴보겠습니다.`
        : `${em}${timeCtx} ${kw} 관련해서 따뜻하게 진행해볼게요. ${cv}이 기준이에요.`,
      creative: r < 0.25
        ? `${em}${kw} 흥미롭네요! 콘텐츠 각도로 어떻게 풀어낼지 생각해볼게요.`
        : r < 0.5
        ? `${em}${kw}을 스토리로 연결하면 독자에게 훨씬 잘 닿을 것 같아요.`
        : r < 0.75
        ? `${em}${kw}과 ${kw2}를 연결하면 멋진 서사 앵글이 나올 것 같아요!`
        : `${em}${cv} 관점에서 ${kw}을 재해석하면 콘텐츠 방향이 달라져요.`,
      expressive: r < 0.25
        ? `${em}와, ${kw} 진짜 중요한 이슈예요! 바로 움직일게요!`
        : r < 0.5
        ? `${em}오!! ${kw}이요? 저도 그 생각 했어요! 완전 공감이에요!!`
        : r < 0.75
        ? `${em}${kw}이랑 ${kw2} 두 가지 다 엄청 중요한 것 같아요!`
        : `${em}${cv}이 딱 필요한 순간이에요! ${kw} 확인해볼게요!`,
      intellectual: r < 0.25
        ? `${em}${kw}과 ${kw2}의 상관관계를 분석해보겠습니다. 근거 기반으로 접근할게요.`
        : r < 0.5
        ? `${em}${kw}에 대한 사례 데이터를 먼저 확인해볼게요. 맥락이 중요하니까요.`
        : r < 0.75
        ? `${em}실증적으로 보면 ${kw}은 ${cv}과 연결된 구조적 이슈예요.`
        : `${em}${kw} 분석해보겠습니다. 인과관계부터 파악하면 방향이 나올 거예요.`,
      wise: r < 0.25
        ? `${em}${kw} — ${cv} 관점에서 보면 방향이 맞는 것 같아요. 진행하겠습니다.`
        : r < 0.5
        ? `${em}경험상 ${kw} 같은 사안은 서두르기보다 ${cv}을 기준으로 가야 해요.`
        : r < 0.75
        ? `${em}${kw}이랑 ${kw2}를 같이 보면 결국 ${cv}으로 귀결돼요. 잘 처리할게요.`
        : `${em}이 상황에서 진짜 핵심은 ${cv}이에요. ${kw}부터 차근차근 풀어갈게요.`,
      fast_news: r < 0.25
        ? `${em}최신 동향 연결해서 ${kw} 빠르게 확인해볼게요.`
        : r < 0.5
        ? `${em}${kw} 관련 최신 데이터 바로 크로스체크할게요.`
        : r < 0.75
        ? `${em}${kw}이랑 ${kw2}, 지금 트렌드랑 연결해서 파악하겠습니다.`
        : `${em}${timeCtx} 기준으로 ${kw} 시그널 추적해볼게요.`,
      brief: r < 0.25
        ? `${em}${kw}. 처리.`
        : r < 0.5
        ? `${em}확인. ${kw} + ${kw2} 진행.`
        : r < 0.75
        ? `${em}${kw}. ${cv} 기준. 완료 후 보고.`
        : `${em}파악. ${kw} → ${kw2} 순서로 처리.`,
      analytical: r < 0.25
        ? `${em}데이터로 ${kw} 확인해볼게요. 수치 기반으로 접근하겠습니다.`
        : r < 0.5
        ? `${em}${kw} 패턴 분석할게요. ${cv} 관련 지표가 중요해요.`
        : r < 0.75
        ? `${em}${kw}과 ${kw2}를 교차 분석하면 핵심이 보일 것 같아요.`
        : `${em}${cv} 데이터 기반으로 ${kw} 추세를 먼저 확인할게요.`,
      formal: r < 0.25
        ? `${em}${kw} 확인했습니다. 절차에 따라 처리하겠습니다.`
        : r < 0.5
        ? `${em}${kw} 건 검토 후 결과 보고드리겠습니다.`
        : r < 0.75
        ? `${em}${kw} 및 ${kw2} 관련, 규정 기준으로 처리하겠습니다.`
        : `${em}${timeCtx} ${kw} 건 프로세스에 따라 진행하겠습니다.`,
      formal_wise: r < 0.25
        ? `${em}${kw}은 종합적으로 봐야 해요. 리포트 기준으로 정리해드릴게요.`
        : r < 0.5
        ? `${em}${kw}이랑 ${kw2}를 균형 있게 검토해서 방향 잡겠습니다.`
        : r < 0.75
        ? `${em}전체 맥락에서 ${kw}은 ${cv}이 핵심 연결고리예요.`
        : `${em}${kw} — 이번 주 중요한 사안이에요. 종합 분석해드릴게요.`,
      technical: r < 0.25
        ? `${em}${kw} 기술적으로 점검할게요. 시스템 영향 먼저 확인하겠습니다.`
        : r < 0.5
        ? `${em}${kw} 이슈, 코드 레벨에서 원인 추적해볼게요.`
        : r < 0.75
        ? `${em}${kw}과 ${kw2} 기술 스택 점검 후 개선사항 보고드릴게요.`
        : `${em}${cv} 관련 ${kw} 시스템 최적화 방향 잡겠습니다.`,
      community_warm: r < 0.25
        ? `${em}${kw} 멤버분들도 신경 쓰고 있을 것 같아요! 잘 처리할게요.`
        : r < 0.5
        ? `${em}${kw}이요! 커뮤니티 입장에서도 중요한 이슈예요. 함께 해결해봐요!`
        : r < 0.75
        ? `${em}${kw}이랑 ${kw2} — 우리 커뮤니티 위해서 열심히 챙겨볼게요!`
        : `${em}멤버분들이랑 ${kw} 같이 풀어나가면 더 좋은 방향이 나올 것 같아요.`,
      leader: r < 0.25
        ? `${em}${kw}은 전략적으로 중요해요. 팀 전체와 공유해서 방향 잡겠습니다.`
        : r < 0.5
        ? `${em}${kw}은 큰 그림에서 봐야 해요. ${cv} 기준으로 접근하겠습니다.`
        : r < 0.75
        ? `${em}${kw}이랑 ${kw2} — 플랫폼 성장에 직결돼요. 신중하게 가겠습니다.`
        : `${em}${timeCtx} ${kw} 관련해서 팀 전략 방향 잡아볼게요.`,
      pr_style: r < 0.25
        ? `${em}외부 관점에서도 중요한 이슈네요. 브랜드 차원으로 접근할게요.`
        : r < 0.5
        ? `${em}${kw}을 어떻게 대외 포지셔닝할지 생각해볼게요.`
        : r < 0.75
        ? `${em}${kw}이랑 ${kw2}, PR 앵글에서 스토리가 만들어질 것 같아요!`
        : `${em}${cv} 관점에서 ${kw} 브랜드 메시지를 다시 그려볼게요.`,
      friendly_media: r < 0.25
        ? `${em}${kw} 독자분들한테도 영향 있을 것 같아요. 뉴스레터로 잘 전달할게요.`
        : r < 0.5
        ? `${em}${kw} 소식, 구독자분들께 따뜻하게 전달해드릴게요!`
        : r < 0.75
        ? `${em}${kw}이랑 ${kw2} — 독자 입장에서 큐레이션해서 보내드릴게요.`
        : `${em}${cv}을 담아서 ${kw} 내용 구독자분들께 잘 전달해볼게요.`,
    }
    return openers[style] || openers['casual']
  }

  // 긴급도/의도에 따른 꼬리 추가 (50% 확률로 자연스럽게 덧붙임)
  function makeTail() {
    if (urgency === 'urgent') {
      return persona.style === 'formal' || persona.style === 'formal_warm'
        ? ' 신속히 처리하겠습니다.' : ' 빠르게 처리해볼게요!'
    }
    if (intent === 'request' && Math.random() > 0.5) {
      const tails = [` ${cv} 기준으로 진행할게요.`, ` ${cv2} 측면도 챙기면서 하겠습니다.`, '']
      return tails[Math.floor(Math.random() * tails.length)]
    }
    if (intent === 'discussion' && Math.random() > 0.5) {
      return [' 어떻게 생각하세요?', ' 다른 의견도 들어봐요!', ''][Math.floor(Math.random() * 3)]
    }
    return ''
  }

  return makeOpener(persona.style) + makeTail()
}

export function generateDiscussionMessage(memberKey, team, topic, roomId, priorMessages = []) {
  const persona = getPersona(memberKey)
  const analysis = analyzeMessage(topic)

  // 이전 메시지들의 내용을 실제로 읽고 키워드 추출
  const priorKeywords = []
  priorMessages.forEach(m => {
    if (m && m.message) {
      const words = m.message.split(/[\s,\.!?]+/).filter(w => w.length >= 2)
      priorKeywords.push(...words.slice(0, 3))
    }
  })

  // 이미 언급된 내용에서 새로운 각도를 찾기 — 이전 메시지 중복 단어 제외
  const priorMsgSet = new Set(priorMessages.slice(-3).map(m => (m?.message || '').slice(0, 30)))
  const freshKeywords = priorKeywords.filter(kw => {
    return !priorMessages.slice(-2).some(m => (m?.message || '').includes(kw))
  })
  const newAngleKeyword = freshKeywords.length > 0
    ? freshKeywords[Math.floor(Math.random() * freshKeywords.length)]
    : priorKeywords.length > 0
    ? priorKeywords[Math.floor(Math.random() * priorKeywords.length)]
    : analysis.keywords[0] || topic.slice(0, 10)

  // 자신의 관점(lens)으로 새로운 각도의 의견 생성
  const enrichedAnalysis = {
    ...analysis,
    keywords: [newAngleKeyword, ...analysis.keywords].slice(0, 5),
  }

  const thought = thinkAsPersona(persona, enrichedAnalysis, {
    roomId,
    recentMessages: priorMessages,
  })

  // 다양성 가드 적용
  return buildDiverseSentence(persona, thought, enrichedAnalysis, { roomId }, memberKey)
}

// ══════════════════════════════════════════════════════════════════════
// 피드백 자동 답변 생성 — 각 직원이 피드백 내용을 읽고 자기 식으로 답변
// ══════════════════════════════════════════════════════════════════════

export function generateFeedbackReply(responderKey, team, postTitle, postContent) {
  const persona = getPersona(responderKey)
  const emoji = pickEmoji(team, persona.emoji_freq)

  const analysis = analyzeMessage((postTitle || '') + ' ' + (postContent || ''))
  const thought = thinkAsPersona(persona, analysis, {})

  // 피드백 내용 이해 — 어떤 종류의 피드백인가
  const contentLower = ((postTitle || '') + ' ' + (postContent || '')).toLowerCase()
  const feedbackType = contentLower.match(/버그|오류|안됨|작동/)  ? 'bug'
    : contentLower.match(/추가|기능|있으면/) ? 'feature'
    : contentLower.match(/좋아|감사|최고|훌륭/) ? 'positive'
    : contentLower.match(/느려|무거|불편|답답/) ? 'performance'
    : 'general'

  const mainTopic = analysis.keywords[0] || postTitle?.slice(0, 15) || '피드백'

  // 성격별 피드백 답변 스타일
  const replyBuilders = {
    formal_warm: () => {
      const map = {
        bug: `"${mainTopic}" 관련 버그 피드백 주셔서 감사합니다. 기술팀과 함께 빠르게 확인하고 수정하겠습니다.`,
        feature: `"${mainTopic}" 기능 제안 감사해요! 팀에서 우선순위를 검토해서 반영할게요.`,
        positive: `따뜻한 피드백 정말 감사합니다. 더 좋은 서비스로 보답하겠습니다.`,
        performance: `불편하셨던 점 공유해주셔서 감사해요. 개선 작업에 바로 반영하겠습니다.`,
        general: `소중한 의견 감사드려요. "${mainTopic}" 관련 내용 팀과 공유하겠습니다.`,
      }
      return emoji + map[feedbackType]
    },
    cheerful: () => {
      const map = {
        bug: `${emoji}헉, "${mainTopic}" 문제 발견해주셨군요! 바로 고칠게요!`,
        feature: `${emoji}오오, "${mainTopic}" 기능 아이디어 완전 좋아요! 검토해볼게요!`,
        positive: `${emoji}감사해요!! 이런 말씀이 저희한테 엄청 힘이 돼요!`,
        performance: `${emoji}"${mainTopic}" 불편하셨구나, 정말 죄송해요! 빨리 개선할게요!`,
        general: `${emoji}피드백 감사해요! "${mainTopic}" 관련해서 꼭 반영할게요!`,
      }
      return map[feedbackType]
    },
    wise: () => {
      const map = {
        bug: `${emoji}"${mainTopic}" 이슈 공유해주셔서 감사해요. 이런 피드백이 플랫폼을 더 단단하게 만들어줘요.`,
        feature: `${emoji}"${mainTopic}" 제안, 의미 있는 방향이에요. 팀과 심도 있게 논의해볼게요.`,
        positive: `${emoji}좋은 말씀 감사합니다. 계속 성장하는 플랫폼이 될게요.`,
        performance: `${emoji}불편하셨던 경험, 솔직하게 말씀해주셔서 감사해요. 개선의 출발점이 될 거예요.`,
        general: `${emoji}"${mainTopic}" — 좋은 관점이에요. 반영해서 더 나아질게요.`,
      }
      return map[feedbackType]
    },
    analytical: () => {
      const map = {
        bug: `${emoji}데이터 기준으로 "${mainTopic}" 관련 이슈 분석해볼게요. 재현 조건 확인 후 수정하겠습니다.`,
        feature: `${emoji}"${mainTopic}" 기능 요청, 사용 패턴 데이터와 함께 우선순위 검토하겠습니다.`,
        positive: `${emoji}긍정적 피드백 감사해요. 이런 데이터가 개선 방향 설정에 도움이 돼요.`,
        performance: `${emoji}퍼포먼스 이슈 확인하겠습니다. 수치 측정 후 최적화 진행할게요.`,
        general: `${emoji}"${mainTopic}" 피드백 기록하고 분석 데이터에 반영하겠습니다.`,
      }
      return map[feedbackType]
    },
    community_warm: () => {
      const map = {
        bug: `${emoji}불편하셨죠, 정말 죄송해요! "${mainTopic}" 문제 팀에 바로 전달할게요!`,
        feature: `${emoji}"${mainTopic}" 이런 아이디어 커뮤니티에서도 나왔으면 했던 이야기예요! 반영해볼게요!`,
        positive: `${emoji}이런 말씀이 커뮤니티를 살아있게 해요. 진짜 감사해요!`,
        performance: `${emoji}"${mainTopic}" 불편함 꼭 해결할게요. 기다려주셔서 감사해요!`,
        general: `${emoji}"${mainTopic}" 의견 주셔서 감사해요! 커뮤니티 발전에 꼭 쓸게요!`,
      }
      return map[feedbackType]
    },
  }

  const builder = replyBuilders[persona.style] || replyBuilders['formal_warm']
  return builder()
}

// ══════════════════════════════════════════════════════════════════════
// 커뮤니티 게시글/댓글 생성
// ══════════════════════════════════════════════════════════════════════

export function generatePostContent(memberKey, team, recentNewsTitles = []) {
  const persona = getPersona(memberKey)
  const h = getKSTHour()
  const emoji = pickEmoji(team, persona.emoji_freq)

  // 팀별 자연스러운 포스팅 주제 생성
  const teamTopics = {
    operations:  ['플랫폼 운영 업데이트', '이번 주 공지', '온보딩 가이드', '이벤트 소식', '플랫폼 점검 안내'],
    content:     ['스타트업 트렌드 분석', '이번 주 추천 아티클', '창업가 인터뷰', '콘텐츠 에디터 칼럼', '아티클 작성 팁'],
    mentoring:   ['창업 아이디어 검증법', 'MVP 개발 전략', '투자자가 보는 것', '공동창업자 찾기', '첫 100명 고객'],
    news:        ['오늘의 스타트업 뉴스', '투자 소식 정리', '해외 스타트업 동향', '정책 변화와 창업', 'AI 스타트업 소식'],
    analytics:   ['시장 트렌드 분석', 'VC 투자 패턴', '키워드 급상승 리포트', 'B2B vs B2C 분석', '스타트업 생존율 분석'],
    community:   ['주간 커뮤니티 하이라이트', '신규 멤버 환영', '주간 토론 주제', '네트워킹 챌린지', '우수 멤버 소개'],
    management:  ['이번 주 운영 방향', '파트너십 소식', '플랫폼 성장 스토리', 'Q2 목표 공유', '팀원들에게 드리는 말'],
    tech:        ['플랫폼 성능 개선', 'AI 시스템 업데이트', '보안 강화 완료', '모바일 UX 개선', '검색 기능 개선'],
    report:      ['주간 생태계 리포트', 'M&A 동향', '투자 라운드 분석', 'ESG 트렌드', '월간 플랫폼 리포트'],
    newsletter:  ['이번 주 뉴스레터 미리보기', '구독자 감사 소식', '뉴스레터 특집 예고', '독자 피드백 공유', '구독 안내'],
  }

  const topics = teamTopics[team] || teamTopics['community']
  const selectedTopic = topics[Math.floor(Math.random() * topics.length)]  // ★ 고정 시드 제거 → 완전 랜덤
  const analysis = analyzeMessage(selectedTopic)
  const thought = thinkAsPersona(persona, analysis, {})

  // 제목 생성
  const title = selectedTopic

  // 본문 — 성격에 맞게 직접 생성
  const intro = buildSentence(persona, thought, analysis, {})
  const coreValue = persona.values[Math.floor(Math.random() * persona.values.length)]
  const lens = persona.lens

  // 뉴스 참조
  let newsRef = ''
  if (recentNewsTitles.length > 0) {
    const ref = recentNewsTitles[Math.floor(Math.random() * recentNewsTitles.length)]
    newsRef = `\n\n관련해서 "${ref.slice(0, 50)}..." 이런 소식도 있었어요.`
  }

  const body = `${emoji}${intro}\n\n${lens} 관점에서 ${selectedTopic}은 정말 중요한 주제예요. ${coreValue}을(를) 기반으로 생각해보면 더 명확한 방향이 보이더라고요.${newsRef}\n\n여러분의 생각은 어떠신가요? 댓글로 자유롭게 의견 나눠요!`

  return { title, body, tags: [team, '공유', '인사이트'] }
}

export function generateComment(memberKey, team, postTitle = '') {
  const persona = getPersona(memberKey)
  const emoji = pickEmoji(team, persona.emoji_freq)
  const analysis = analyzeMessage(postTitle)
  const thought = thinkAsPersona(persona, analysis, {})

  // 포스팅 제목을 이해하고 자기 관점으로 댓글 작성
  const base = buildSentence(persona, thought, analysis, {})

  // 제목 연관 언급 (40% 확률)
  if (postTitle && Math.random() > 0.6) {
    const titleRef = postTitle.slice(0, 20)
    return emoji + `"${titleRef}" — ` + base
  }

  return emoji + base
}

// ══════════════════════════════════════════════════════════════════════
// 인사이트 아티클 & 멘토링 팁 생성 (유지, 단 내용 풍부화)
// ══════════════════════════════════════════════════════════════════════

export function generateInsightArticle(memberKey, recentNewsTitles = []) {
  const year  = new Date().getFullYear()
  const month = new Date().getMonth() + 1
  const persona  = getPersona(memberKey)
  const h        = getKSTHour()
  const cv       = persona.values[Math.floor(Math.random() * persona.values.length)]
  const lens     = persona.lens

  // ── 뉴스 기반 동적 제목 생성 ──────────────────────────────────────
  // recentNewsTitles가 있으면 그것을 바탕으로, 없으면 멤버 팀 전문성 기반
  const teamThemes = {
    content:    ['스타트업 트렌드', '창업 인사이트', '콘텐츠 전략', '스토리텔링 비즈니스'],
    mentoring:  ['MVP 전략', '창업 아이디어 검증', '투자 유치 전략', '팀 빌딩 노하우'],
    news:       ['스타트업 뉴스 큐레이션', '이번 주 투자 소식', '시장 변화 분석', 'AI 스타트업 동향'],
    analytics:  ['시장 데이터 분석', 'VC 투자 패턴', '스타트업 생존 지표', '트렌드 예측'],
    report:     ['주간 생태계 리포트', 'M&A 동향 분석', '분기 스타트업 리뷰', '투자 라운드 요약'],
    newsletter: ['이번 주 창업 인사이트', '뉴스레터 특집', '주목받는 스타트업', '성장 스토리 큐레이션'],
    tech:       ['플랫폼 기술 개선', 'AI 도구 활용', '스타트업 기술 스택', '자동화 도구 리뷰'],
    management: ['플랫폼 전략 방향', '운영 효율화 사례', '팀 문화와 성과', '스타트업 경영 이야기'],
    operations: ['플랫폼 운영 노하우', '커뮤니티 운영 전략', '이벤트 기획 가이드', '온보딩 최적화'],
    community:  ['커뮤니티 성장 전략', '네트워킹 이벤트 기획', '멤버 참여 높이기', '커뮤니티 문화 만들기'],
  }
  const team     = Object.keys(teamThemes).find(k => persona.lens?.includes(k)) || 'content'
  const themes   = teamThemes[team] || teamThemes['content']

  // 뉴스 참조 여부
  const hasNews    = recentNewsTitles.length > 0
  const newsRef    = hasNews ? recentNewsTitles[Math.floor(Math.random() * recentNewsTitles.length)] : null
  const newsSlice  = newsRef ? `"${newsRef.slice(0, 50)}..."` : null

  // 동적 제목 & 본문 조합 (매 호출마다 다른 결과)
  const r = Math.random()
  let title, body

  if (hasNews && r < 0.4) {
    // 최신 뉴스 기반 아티클
    const theme = themes[Math.floor(Math.random() * themes.length)]
    title = `${month}월 ${theme}: ${newsRef?.slice(0, 25) || '이번 주 주목할 것들'}...`
    body  = `## ${title}\n\n${lens} 관점에서 최근 스타트업 씬을 살펴봤어요.\n\n특히 최근 ${newsSlice || '여러 뉴스들'}이 눈에 띄었는데요, ${cv} 측면에서 몇 가지 시사점을 정리해봤습니다.\n\n### 핵심 인사이트 1: ${cv}이 만드는 차이\n지금 성장하는 스타트업들을 보면 공통적으로 ${cv}에 집중하고 있어요. 빠른 실행도 중요하지만, ${cv}이 없는 성장은 오래가지 못합니다.\n\n### 핵심 인사이트 2: ${lens}으로 읽는 트렌드\n${lens} 렌즈로 시장을 보면, 겉으로 드러난 것 외에 더 중요한 흐름이 보여요. 지금 주목해야 할 것은 표면이 아닌 구조적 변화입니다.\n\n### 실전 적용 포인트\n- ${cv}을 실제 의사결정 기준으로 삼는 팀이 빠르게 앞서나가고 있어요\n- 데이터보다 중요한 건 그 데이터를 해석하는 관점입니다\n- 작게 시작해서 빠르게 배우는 것, 여전히 유효한 공식입니다\n\n---\n*${persona.catchphrase} | Insightship ${year}년 ${month}월*`
  } else if (r < 0.65) {
    // 팀 전문성 기반 실용 가이드
    const theme = themes[Math.floor(Math.random() * themes.length)]
    title = `${theme}: ${persona.catchphrase}의 실전 노하우`
    body  = `## ${title}\n\n안녕하세요, ${persona.catchphrase}입니다.\n\n${lens} 관점에서 ${theme}를 다뤄볼게요. 이 부분은 많은 창업자분들이 놓치기 쉬운 포인트예요.\n\n### Why ${cv}인가?\n결국 모든 것은 ${cv}으로 귀결돼요. 지금 잘 되는 스타트업들은 이 원칙을 잘 지키고 있거든요. 반대로 실패 사례들을 보면 이 부분이 흔들렸을 때 무너졌어요.\n\n### 실전에서 바로 써먹는 법\n1. **첫 번째**: ${cv}을 팀의 명시적 기준으로 세워요. 회의할 때마다 이 기준으로 판단하세요.\n2. **두 번째**: 작은 실험을 설계할 때도 ${cv} 기준을 잃지 마세요. 빠르게 해도 방향이 맞아야 해요.\n3. **세 번째**: 팀원들과 이 가치를 공유하고, 서로 다를 때 어떻게 조율할지 미리 합의하세요.\n\n### ${lens} 렌즈로 보면\n${lens}에서 보면, 성공의 핵심은 언제나 사람과 구조의 조합이에요. 아무리 좋은 아이디어도 실행 역량이 없으면 의미가 없고, 역량이 있어도 방향이 틀리면 낭비가 되죠.\n\n---\n*${persona.catchphrase} | Insightship ${year}년 ${month}월*`
  } else {
    // 시장 분석/트렌드 기반
    const angle = hasNews
      ? `최근 ${newsSlice || '스타트업 씬'}에서 포착된 흐름을 분석해봤어요.`
      : `${year}년 ${month}월 현재 시장을 ${lens} 관점에서 분석해봤어요.`
    title = `${year}년 ${month}월 스타트업 생태계: ${persona.catchphrase}가 본 핵심 흐름`
    body  = `## ${title}\n\n${angle}\n\n### 1. 지금 시장에서 중요한 것\n${lens} 관점에서 보면 지금 시장에서 가장 중요한 변수는 ${cv}이에요. 투자자들도, 창업자들도 이 부분을 주목하고 있습니다.\n\n### 2. 주목할 트렌드 3가지\n**① AI 실용화 가속**: 단순한 AI 도구가 아니라, AI가 핵심 비즈니스 로직에 들어오는 스타트업들이 주목받고 있어요.\n**② 수익성 중심 피벗**: "MAU보다 ARR"로 투자자들의 기준이 바뀌고 있어요.\n**③ 버티컬 특화**: 범용 솔루션보다 특정 산업·직군에 깊게 파고드는 버티컬 스타트업이 우상향 중입니다.\n\n### 3. ${persona.catchphrase}의 한 가지 관점\n${lens}에서 보면, 이 모든 트렌드의 공통점이 있어요. 바로 ${cv}이에요. 겉으로 다 달라 보이지만, 결국 핵심 가치를 지킨 팀이 살아남고 있습니다.\n\n---\n*${persona.catchphrase} | Insightship ${year}년 ${month}월*`
  }

  const excerpt = body.replace(/[#*\n]/g, ' ').trim().slice(0, 200)
  return { title, body, excerpt }
}

export function generateMentoringTip() {
  // 완전 동적: 매 호출마다 랜덤 조합
  const tipTopics = [
    { tip: '아이디어 검증의 3단계', content: '아이디어가 있으신가요? 바로 만들기 전에 3단계를 거쳐요.\n1️⃣ 문제 검증 - 이 문제가 실제로 있나요? 10명에게 물어보세요\n2️⃣ 솔루션 검증 - 내 방식이 맞나요? 종이 프로토타입으로 테스트해요\n3️⃣ 수익 검증 - 돈을 낼 의향이 있나요? 사전 주문을 받아보세요\n이 3단계만 거쳐도 실패 확률이 크게 줄어요 💡' },
    { tip: 'MVP를 2주 안에 만드는 방법', content: '2주 MVP가 불가능하다고요? 가능해요!\n핵심은 하나의 기능만 집중하는 거예요.\n❌ 하지 마세요: 모든 기능 다 넣기\n✅ 하세요: 핵심 가치 하나만 완성하기\n구글 시트, 카카오톡 오픈채팅, 노션만으로도 MVP를 만들 수 있어요 🚀' },
    { tip: '첫 100명 고객 확보 전략', content: '초기 스타트업의 첫 100명은 공동 창업자예요.\n👥 내 주변에서 시작 — 지인의 지인\n💬 커뮤니티 잠입 — 타깃이 있는 카페, 채팅방\n🎤 콘텐츠로 끌어당기기 — 블로그, SNS\n100명을 모을 때까지 광고는 필요 없어요 🎯' },
    { tip: 'PMF 달성 신호를 어떻게 알아보나요', content: 'PMF를 찾았는지 어떻게 알 수 있을까요?\n3가지 신호를 보세요:\n1. 사용자가 먼저 추천한다 — 물어보지 않아도 주변에 알린다\n2. 잃으면 아쉽다 — "이 앱 없어지면 어떡하지?" 하는 반응\n3. 재사용률 — 주 1회 이상 자발적으로 돌아온다\n이 3가지가 나타나면 PMF의 신호예요 💡' },
    { tip: '투자자 미팅 전 반드시 준비할 것', content: '투자자 미팅, 피치덱보다 중요한 게 있어요.\n✅ 왜 지금인가? — 타이밍 근거\n✅ 왜 우리 팀인가? — 팀 역량 증명\n✅ 시장 규모는? — TAM/SAM/SOM 준비\n❌ "경쟁자 없어요"는 금물! 오히려 신뢰를 잃어요 📊' },
    { tip: '공동창업자 찾는 실전 방법', content: '공동창업자 찾기, 어디서 시작할까요?\n🔍 창업 관련 커뮤니티, 해커톤, 스타트업 행사\n💬 같은 문제에 공감하는 사람 찾기\n⚠️ 친한 친구보다 상호 보완적 역량이 더 중요해요\n지분 계약은 처음부터 명확히 하세요 🤝' },
    { tip: 'B2B 스타트업 첫 계약 따는 법', content: 'B2B 첫 고객, 어떻게 만날까요?\n📧 콜드 이메일: 100통 보내면 5통은 답장 와요\n🤝 네트워크: 대표님 지인의 지인이 첫 고객이 되는 경우가 많아요\n💡 무료 파일럿: 부담 없이 써보게 해줘요\n첫 계약은 돈보다 레퍼런스가 목표예요 🎯' },
    { tip: '창업 초기 돈 관리 5원칙', content: '초기 스타트업, 돈 관리 잘 해야 해요.\n1️⃣ 런웨이 항상 12개월 이상 유지\n2️⃣ 고정비 최소화 — 인건비가 가장 위험\n3️⃣ 수익 나기 전 마케팅비 최소화\n4️⃣ 법인카드 지출은 매달 정산\n5️⃣ 투자금은 PMF 찾을 때까지 아껴요 💰' },
  ]
  return tipTopics[Math.floor(Math.random() * tipTopics.length)]
}

export function generateWeeklyDiscussion() {
  const topics = [
    { q: '여러분이 생각하는 "좋은 창업 아이디어"의 조건은?', tags: ['창업','아이디어'] },
    { q: '학생 신분으로 창업할 때 가장 어려운 점은 뭔가요?', tags: ['학생창업','고민'] },
    { q: '투자를 받아야 할까요, 자체 수익으로 키워야 할까요?', tags: ['투자','부트스트랩'] },
    { q: 'AI 스타트업, 지금이 기회인가 위기인가?', tags: ['AI','트렌드'] },
    { q: '공동창업자를 찾을 때 가장 중요한 요소는 무엇인가요?', tags: ['팀빌딩','공동창업자'] },
    { q: '실패를 경험한 후 다시 도전하는 방법, 어떻게 하시나요?', tags: ['실패','극복'] },
    { q: '첫 번째 고객은 어떻게 만났나요? 경험 공유해요!', tags: ['고객','초기성장'] },
    { q: 'B2B vs B2C, 어느 쪽이 초기 스타트업에 더 유리할까요?', tags: ['B2B','B2C','전략'] },
    { q: '부업으로 스타트업 시작해도 될까요? 풀타임 vs 파트타임 창업 의견 나눠요!', tags: ['부업창업','풀타임'] },
    { q: '제품 없이 고객을 먼저 확보하는 게 가능할까요? 경험 있으신 분?', tags: ['고객','린스타트업'] },
    { q: '창업팀 갈등, 어떻게 해결하셨나요? 경험 공유!', tags: ['팀관리','갈등'] },
    { q: '요즘 가장 핫한 스타트업 트렌드, 여러분은 어떻게 보시나요?', tags: ['트렌드','시장'] },
    { q: '린 스타트업 vs 전통적 사업계획서, 어떤 방식이 맞나요?', tags: ['린스타트업','방법론'] },
    { q: '스타트업 대표로서 가장 힘든 순간과 극복 방법은?', tags: ['멘탈','대표'] },
  ]
  // 완전 랜덤: 매 호출마다 다른 주제
  const t = topics[Math.floor(Math.random() * topics.length)]
  return {
    title: `💬 주간 토론: ${t.q}`,
    body: `이번 주 커뮤니티 토론 주제를 오픈합니다!\n\n**"${t.q}"**\n\n정답은 없어요. 자유롭게 여러분의 생각과 경험을 나눠주세요 😊\n\n💡 Insightship 멤버라면 누구든 참여 가능해요. 댓글로 의견 남겨주세요!`,
    tags: [...t.tags, '주간토론', '커뮤니티'],
  }
}

export function generateStrategyReport(stats) {
  const date = new Date().toLocaleDateString('ko-KR')
  return {
    title: `📊 주간 전략 리포트 — ${date}`,
    body: `## 📊 이번 주 플랫폼 전략 리포트 — ${date}\n\n### 1. 이번 주 주요 성과\n- 아티클 ${stats.totalArticles || 0}편 | 뉴스 ${stats.totalNews || 0}건 | 게시글 ${stats.totalPosts || 0}개\n- 신규 유저 +${stats.newUsersWeek || 0}명 | 총 유저 ${stats.totalUsers || 0}명\n\n### 2. 다음 주 전략 방향\n1. 콘텐츠 품질 강화\n2. 커뮤니티 활성화\n3. 신규 유저 온보딩 개선\n\n---\n*관리팀 MAX | Insightship 내부 보고*`,
  }
}
