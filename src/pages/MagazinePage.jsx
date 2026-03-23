import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, BookOpen, Sparkles, TrendingUp, Users, Globe, Lightbulb, BarChart2, Newspaper } from 'lucide-react'

// ── 매거진 스프레드 정의 (28 스프레드 = 56페이지)
const MAGAZINE_SECTIONS = [
  // 섹션 0: 커버
  { type: 'cover' },

  // 섹션 1-2: 창업자 스토리
  {
    type: 'article', icon: '🚀', category: 'FOUNDER STORY',
    title: '"실패가 나를 만들었다" — PACM 조경용 대표',
    subtitle: '초등학교 2학년부터 꿈꾼 경영, 청소년 창업 플랫폼을 만들기까지',
    body: `초등학교 2학년. 남들이 운동장에서 뛰놀 때, 한 소년은 '경영'이라는 단어에 가슴이 뛰었다. 그 소년이 바로 PACM의 조경용 대표다.

"처음 사업을 시작했을 때 모든 것이 실패였어요. 아이디어는 있었지만 실행 방법을 몰랐고, 멘토도 없었고, 정보도 없었습니다. 그래서 인사이트쉽을 만들었어요."

인사이트쉽은 단순한 뉴스 플랫폼이 아니다. 청소년들이 창업의 '격차 없이' 도전할 수 있는 세상을 만들기 위한 첫 번째 발걸음이다. 조 대표는 청소년을 '공부만 해야 하는 존재'로 가두는 사회적 편견과 싸우고 있다.

"AI 전환(AX)의 시대에 학벌보다 실무 역량이 중요해졌습니다. 지금이 청소년들이 도전할 수 있는 최고의 시기입니다."`,
    insight: '가장 좋은 시작 시점은 지금 이 순간이다.',
    accent: '#6366F1'
  },
  {
    type: 'article', icon: '💡', category: 'FOUNDER STORY',
    title: '17살에 첫 스타트업을 창업한 김민준의 이야기',
    subtitle: '학교 수업 중 떠오른 아이디어로 MAU 1만 명을 달성한 고등학생 CEO',
    body: `"수업 시간에 선생님 말씀을 들으면서 '왜 이 정보는 이렇게 전달하기 어려울까?'라는 생각이 들었어요. 그게 첫 번째 아이디어였습니다."

김민준(17)은 학교 수업 정보를 시각화해주는 앱을 만들어 같은 학교 학생들에게 먼저 배포했다. 처음 100명, 그 다음엔 1,000명. 소문이 퍼지면서 다른 학교까지 퍼졌고, 6개월 만에 MAU 1만 명을 달성했다.

핵심 비결은 단순했다. '나 자신이 사용자'라는 점이었다. 그는 매일 자신의 앱을 사용하며 불편한 점을 직접 고쳤고, 사용자 피드백을 24시간 내에 반영했다.

"창업의 가장 큰 장점은 배움의 속도입니다. 학교에서 1년 배울 것을 창업하면 한 달에 배웁니다."`,
    insight: '가장 좋은 사용자는 창업자 자신이다.',
    accent: '#6366F1'
  },

  // 섹션 3-4: AI 트렌드
  {
    type: 'article', icon: '🤖', category: 'AI TREND',
    title: '2026 AI 창업 생태계 완전 분석',
    subtitle: 'ChatGPT 이후 3년, AI 스타트업의 지형도가 바뀌었다',
    body: `2023년 ChatGPT 출시 이후 AI 스타트업 생태계는 급격히 변화했다. 초기에는 "AI로 무엇이든 만들 수 있다"는 환상이 지배했지만, 2026년 현재 시장은 더 성숙하고 선별적이다.

투자자들이 주목하는 AI 스타트업의 조건은 세 가지로 좁혀졌다. 첫째, 특정 산업의 깊은 도메인 지식. 둘째, 단순 AI 래퍼가 아닌 독자적 데이터셋 보유. 셋째, 측정 가능한 비즈니스 성과.

한국의 경우 의료 AI, 제조 AI, 교육 AI 분야에서 글로벌 경쟁력을 갖춘 스타트업들이 등장하고 있다. 특히 청소년 교육 분야는 아직 블루오션이다.

청소년 창업가들에게 AI는 '이미 만들어진 도구'다. 코딩을 몰라도, 디자인을 몰라도, AI를 활용하면 서비스를 만들 수 있다. 진입 장벽이 역사상 가장 낮은 시대다.`,
    insight: 'AI는 모든 산업의 진입 장벽을 낮추고 있다. 지금이 시작할 최고의 타이밍이다.',
    accent: '#8B5CF6'
  },
  {
    type: 'article', icon: '⚡', category: 'AI TREND',
    title: 'No-Code AI 툴 TOP 10 — 청소년 창업가를 위한 완벽 가이드',
    subtitle: '코딩 없이 서비스를 만드는 시대, 어떤 툴을 써야 할까',
    body: `2026년 현재, 코딩 없이 앱을 만드는 것은 더 이상 특별한 일이 아니다. 문제는 너무 많은 도구 중에서 무엇을 선택하느냐다.

웹사이트·앱 제작에는 Bubble, Webflow가 압도적이다. Bubble은 복잡한 로직 구현이 가능하고, Webflow는 디자인 자유도가 높다. AI 기능을 빠르게 붙이려면 Make(구 Integromat)와 Zapier로 자동화 워크플로우를 연결하면 된다.

데이터베이스는 Airtable이 여전히 강세다. 스프레드시트처럼 쉽게 쓸 수 있지만 앱의 백엔드로도 충분히 기능한다.

AI 글쓰기에는 Claude, ChatGPT, 이미지 생성에는 Midjourney·DALL-E 3를 활용하면 마케팅 콘텐츠 생산 비용을 90% 절감할 수 있다.

핵심은 도구가 아니라 '어떤 문제를 풀 것인가'다. 도구는 수단이고, 문제 발견이 창업의 본질이다.`,
    insight: '최고의 No-Code 툴은 지금 바로 사용할 수 있는 툴이다.',
    accent: '#8B5CF6'
  },

  // 섹션 5-6: 경제 트렌드
  {
    type: 'article', icon: '📈', category: 'ECONOMY TREND',
    title: '2026 글로벌 스타트업 투자 지형도',
    subtitle: 'VC 시장의 겨울이 끝났다 — 어디에 돈이 몰리는가',
    body: `2022~2024년의 투자 혹한기를 지나, 2026년 스타트업 투자 시장이 다시 뜨거워지고 있다. 다만 돈이 몰리는 곳이 달라졌다.

AI 인프라, 바이오테크, 에너지 전환(클린테크), 방위산업 관련 스타트업에 자금이 집중되고 있다. 한국에서는 헬스케어 AI와 K-콘텐츠 플랫폼이 주목받고 있다.

시리즈 A 평균 투자금액은 전 세계적으로 상승했다. 반면 시드 투자는 점점 더 어려워지고 있다. 초기 투자자들이 '트랙 레코드(실적)'를 더 중요시하기 때문이다.

청소년 창업가에게 중요한 시사점: 투자를 목표로 삼지 말고, 먼저 실제로 돈을 버는 비즈니스를 만들어라. 수익이 있는 팀에게는 투자자가 먼저 찾아온다.`,
    insight: '투자받는 것보다 수익을 내는 것이 더 어렵고, 더 가치 있다.',
    accent: '#10B981'
  },
  {
    type: 'article', icon: '💰', category: 'ECONOMY TREND',
    title: '청소년도 이해해야 하는 경제 키워드 2026',
    subtitle: '인플레이션, 금리, 환율 — 창업에 어떤 영향을 미치는가',
    body: `창업가는 경제 흐름을 읽어야 한다. 거시경제가 스타트업의 생존 환경을 결정하기 때문이다.

금리와 스타트업의 관계: 금리가 높으면 투자자들이 위험 자산(스타트업)보다 안전 자산(채권)을 선호한다. 반대로 금리가 낮아지면 투자자들이 더 높은 수익을 위해 스타트업에 투자한다. 2026년은 금리 하락 사이클로 접어들어 스타트업 투자 환경이 개선되고 있다.

환율과 글로벌 비즈니스: 원화 약세는 수출 스타트업에게 유리하고, 수입 비용이 높아지는 단점도 있다. 소프트웨어 기반 스타트업은 달러 결제 고객을 유치하면 환차익을 얻을 수 있다.

인플레이션과 창업: 물가가 오르면 소비자들은 가격에 더 민감해진다. '가성비'를 제공하는 스타트업에게는 기회가 된다.`,
    insight: '경제를 이해하는 창업가는 시장의 흐름을 앞서 읽을 수 있다.',
    accent: '#10B981'
  },

  // 섹션 7-8: 경영 인사이트
  {
    type: 'article', icon: '🎯', category: 'MANAGEMENT',
    title: 'OKR로 팀을 움직이는 법 — 구글이 선택한 목표 관리 방법론',
    subtitle: '목표(Objective)와 핵심 결과(Key Results)로 스타트업을 운영하라',
    body: `OKR(Objectives and Key Results)은 인텔에서 시작해 구글을 통해 전 세계 스타트업의 표준이 된 목표 관리 방법론이다.

핵심 원리는 단순하다. 야심 차지만 명확한 목표(Objective)를 세우고, 그 목표를 달성했는지 측정할 수 있는 핵심 결과(Key Result) 2~5개를 설정한다.

예시: Objective — "인사이트쉽을 청소년이 가장 신뢰하는 창업 정보 플랫폼으로 만든다." Key Results — "MAU 10만 명 달성", "NPS(순추천지수) 50 이상", "뉴스레터 구독자 1만 명 달성".

OKR의 핵심은 '달성하기 어렵지만 불가능하지 않은' 목표를 세우는 것이다. 70% 달성을 성공으로 본다. 100% 달성하면 오히려 목표가 너무 쉬웠던 것이다.

청소년 창업팀에서 OKR을 도입하면 방향성 혼란을 줄이고 팀 집중도를 높일 수 있다.`,
    insight: '측정할 수 없으면 관리할 수 없다. 좋은 목표는 숫자로 표현된다.',
    accent: '#F59E0B'
  },
  {
    type: 'article', icon: '🔄', category: 'MANAGEMENT',
    title: '애자일 vs 워터폴 — 스타트업에는 어떤 방법론이 맞는가',
    subtitle: '린 스타트업, 스크럼, 칸반 — 청소년팀을 위한 쉬운 설명',
    body: `소프트웨어 개발 방법론은 크게 '워터폴'과 '애자일'로 나뉜다. 스타트업에는 거의 예외 없이 애자일이 맞다.

워터폴은 처음부터 모든 것을 계획하고 순서대로 진행하는 방식이다. 건설이나 제조업에는 적합하지만, 불확실성이 높은 스타트업에는 맞지 않는다.

애자일은 짧은 주기(스프린트, 보통 2주)로 작동 가능한 결과물을 만들고, 피드백을 받아 개선하는 방식이다. 인스타그램, 슬랙, 에어비앤비 모두 애자일 방식으로 개발됐다.

청소년 창업팀을 위한 간단한 시작법: 트렐로나 노션으로 할 일(To Do), 진행 중(In Progress), 완료(Done) 세 칸을 만들어라. 매주 월요일 15분 회의로 이번 주 목표를 공유하라. 이것이 가장 간단한 형태의 애자일이다.`,
    insight: '완벽한 계획보다 빠른 실행과 배움이 스타트업을 성장시킨다.',
    accent: '#F59E0B'
  },

  // 섹션 9-10: 뉴스 분석
  {
    type: 'article', icon: '📰', category: 'NEWS ANALYSIS',
    title: '이번 주 창업 생태계 핵심 뉴스 10선',
    subtitle: 'AI가 분석한 이번 주 가장 중요한 스타트업 뉴스',
    body: `매주 수백 건의 창업 관련 뉴스 중, 인사이트쉽 AI가 선별한 이번 주 핵심 10선이다.

1. 국내 AI 스타트업 A사, 시리즈B 300억 유치 — B2B AI 솔루션의 성장 가능성을 입증했다.

2. 청소년 창업 지원 정부 예산 30% 증액 — 교육부·중기부 합동 지원 프로그램 확대.

3. K-스타트업, 동남아 시장 진출 가속화 — 싱가포르·베트남을 중심으로 한국 스타트업 붐.

4. VC 투자 회수(엑싯) 환경 개선 — 코스닥 상장 요건 완화로 스타트업 출구 전략 다양화.

5. 제조 AI 스타트업의 부상 — 스마트팩토리 수요 폭증으로 B2B AI 시장 확대.

6. 소셜커머스의 진화 — 라이브커머스에서 AI 개인화 추천으로 패러다임 전환.

7. 그린테크 투자 급증 — 탄소중립 목표 달성을 위한 ESG 스타트업 주목.

8-10. (계속)`,
    insight: '뉴스를 읽는 것과 뉴스를 분석하는 것은 다르다. 항상 맥락을 파악하라.',
    accent: '#EC4899'
  },
  {
    type: 'article', icon: '🔍', category: 'NEWS ANALYSIS',
    title: '스타트업 실패 사례에서 배우는 5가지 교훈',
    subtitle: '성공 스토리보다 실패 스토리에서 더 많이 배운다',
    body: `한국 스타트업의 3년 생존율은 약 30%다. 10개 중 7개는 3년 안에 문을 닫는다. 그 실패에서 배울 수 있는 교훈은 무엇인가?

교훈 1 — 시장이 원하지 않는 것을 만들지 마라: 실패한 스타트업의 42%는 '시장 니즈 없음'이 원인이었다(CB Insights 데이터). 아무리 기술이 좋아도 사람들이 사용하지 않으면 의미 없다.

교훈 2 — 공동창업자 갈등을 과소평가하지 마라: 스타트업 실패의 23%는 팀 내부 갈등이었다. 역할과 지분을 처음부터 명확히 하라.

교훈 3 — 현금 흐름이 전부다: 흑자인 것처럼 보여도 현금이 없으면 망한다. 매달 얼마를 쓰는지(번 레이트) 정확히 파악하라.

교훈 4 — 피봇(방향 전환)을 두려워하지 마라: 인스타그램은 원래 체크인 앱이었고, 유튜브는 데이팅 사이트였다.

교훈 5 — 너무 일찍 확장하지 마라: PMF(제품-시장 적합성)가 확인되기 전에 인력과 비용을 늘리면 빠르게 소진된다.`,
    insight: '실패를 분석하는 사람은 같은 실수를 반복하지 않는다.',
    accent: '#EC4899'
  },

  // 섹션 11-12: 글로벌 트렌드
  {
    type: 'article', icon: '🌏', category: 'GLOBAL TREND',
    title: '실리콘밸리 2026 — 무엇이 달라졌는가',
    subtitle: 'AI 붐 이후의 실리콘밸리, 한국 청소년이 알아야 할 변화',
    body: `실리콘밸리는 여전히 세계 스타트업의 메카이지만, 그 양상이 달라졌다. 2023년 이후 AI 붐이 시작되면서 몇 가지 중요한 변화가 일어났다.

첫째, 1인 또는 소규모 팀의 부상이다. GPT-4o, Claude 같은 AI를 활용하면 5명도 안 되는 팀이 수십만 명 사용자를 가진 서비스를 운영할 수 있다. 

둘째, 기술 창업의 민주화다. 더 이상 스탠퍼드 컴퓨터공학과 출신만 실리콘밸리에서 성공하는 시대가 아니다. 아이디어와 실행력이 있다면 어디서든 가능하다.

셋째, B2B SaaS의 강세다. 기업 대상 소프트웨어 서비스가 여전히 VC가 가장 선호하는 비즈니스 모델이다. 예측 가능한 반복 수익(MRR)이 투자자를 안심시킨다.

한국 청소년에게 기회가 있는 분야: K-콘텐츠 기반 글로벌 플랫폼, 아시아 시장 특화 AI 솔루션, B2B 에듀테크.`,
    insight: '실리콘밸리는 장소가 아니라 마인드셋이다.',
    accent: '#06B6D4'
  },
  {
    type: 'article', icon: '🗺️', category: 'GLOBAL TREND',
    title: '동남아 스타트업 생태계의 급부상',
    subtitle: '6억 5천만 인구 시장, 한국 스타트업에게 가장 현실적인 해외 진출 기회',
    body: `동남아시아(ASEAN)는 현재 글로벌 스타트업 투자자들이 가장 주목하는 시장이다. 인구 6억 5천만 명, 평균 연령 29세, 빠르게 성장하는 중산층, 스마트폰 퍼스트 세대.

특히 주목할 국가는 베트남, 인도네시아, 필리핀이다. 베트남은 한국과 문화적 친밀도가 높고, 기술 인재 풀이 풍부하며, 스타트업 생태계가 빠르게 성숙하고 있다.

한국 스타트업이 동남아에서 성공할 수 있는 이유: K-컬처의 영향력, 한국산 제품에 대한 신뢰도, 기술력. 최근 3년간 동남아에 진출한 한국 스타트업의 성공률이 유의미하게 높아졌다.

청소년 창업가에게 동남아는 '첫 번째 글로벌 시장'으로 적합하다. 언어 장벽이 낮고(영어 소통 가능), 한국에 대한 친밀감이 높으며, 시장이 빠르게 성장하고 있다.`,
    insight: '글로벌 진출의 첫 걸음은 가장 가까운 해외 시장부터 시작하라.',
    accent: '#06B6D4'
  },

  // 섹션 13-14: 케이스 스터디
  {
    type: 'article', icon: '📚', category: 'CASE STUDY',
    title: '에어비앤비 창업 스토리 — 거절 받은 7번, 그래도 계속한 이유',
    subtitle: 'VC 7곳에게 투자 거절당하고도 세계 최대 숙박 플랫폼을 만든 방법',
    body: `2008년, 브라이언 체스키와 조 게비아는 집세를 낼 돈이 없었다. 그들은 자신의 집에 에어매트리스 3개를 놓고 숙박 서비스를 시작했다. 수익: 80달러.

초기 VC들의 반응은 냉담했다. "이미 있는 시장(호텔)"이고, "낯선 사람의 집에 머무는 것은 위험하다"는 이유로 7곳의 VC에서 투자를 거절당했다.

그들이 포기하지 않은 이유는 '실제로 사람들이 사용하고 있었기 때문'이었다. 매주 새로운 사용자가 늘었고, 사용자들의 피드백이 명확했다.

Y Combinator의 폴 그레이엄이 투자를 결정한 것은 기술이나 시장 분석 때문이 아니었다. "이 팀이 어떤 상황에서도 포기하지 않을 것"이라는 확신 때문이었다.

2024년 에어비앤비의 시가총액: 약 100조 원. 첫 번째 수익 80달러에서 시작한 여정이었다.`,
    insight: '첫 번째 거절은 끝이 아니라 시작의 신호다.',
    accent: '#F97316'
  },
  {
    type: 'article', icon: '⚡', category: 'CASE STUDY',
    title: '카카오 창업 스토리 — 대기업 출신이 만든 국민 메신저',
    subtitle: '다음커뮤니케이션 임원이 스타트업으로 뛰어든 도전, 그 결과는',
    body: `김범수 카카오 창업자는 삼성SDS에서 사회생활을 시작해 다음커뮤니케이션 대표까지 올랐다. 성공한 직장인이었지만 그는 다시 '제로'에서 시작하기로 했다.

2010년 카카오톡 출시. 당시 한국은 문자메시지(SMS) 시장이었고, 무료 메신저는 통신사 매출을 위협하는 서비스였다. 많은 이들이 "한국에서는 통신사 눈치 때문에 안 될 것"이라고 했다.

하지만 카카오톡은 1년 만에 가입자 1천만 명을 돌파했다. 비결은 단순했다: '무료 + 편리 + 빠름'. 세 가지를 다른 누구보다 잘 실행했다.

2024년 카카오 그룹의 시가총액은 수십조 원에 달한다. 스마트폰 시대의 변화를 남들보다 빨리 읽고, 실행에 옮긴 결과다.

청소년들에게 주는 교훈: 시장의 변화 앞에서는 경력이나 나이가 관계없다. 변화를 먼저 읽는 사람이 승자가 된다.`,
    insight: '성공한 사람들은 변화를 두려워하지 않고 변화에 올라탄다.',
    accent: '#F97316'
  },

  // 섹션 15-16: 투자 인사이트
  {
    type: 'article', icon: '💎', category: 'INVESTMENT',
    title: 'VC가 보는 스타트업 평가 기준 완전 공개',
    subtitle: '시드부터 시리즈C까지 투자자들이 실제로 보는 것들',
    body: `벤처 캐피털(VC)이 스타트업을 평가할 때 보는 기준은 단계마다 다르다. 이 기준을 이해하면 자신의 창업 방향을 더 명확하게 설정할 수 있다.

시드 단계 (팀과 아이디어): VC의 60%는 팀을 가장 중요하게 본다. "이 팀이 문제를 해결할 능력과 의지가 있는가?" 아이디어보다 실행 능력이 중요하다.

시리즈 A (제품과 성장): PMF(제품-시장 적합성)가 검증됐는지, 핵심 지표가 성장하고 있는지를 본다. MAU, 재방문율, NPS 등 데이터로 말해야 한다.

시리즈 B 이후 (규모와 수익성): 유닛 이코노믹스(Unit Economics)가 건강한가? 고객 획득 비용(CAC)보다 고객 생애 가치(LTV)가 높은가?

한국 VC들이 최근 주목하는 분야: AI 기반 B2B SaaS, 헬스테크, 에듀테크, 클린테크, K-콘텐츠 플랫폼.

청소년 창업가에게: 지금 당장 투자를 받으려 하지 말고, 투자받을 만한 팀이 되는 것에 집중하라.`,
    insight: '투자자는 돈을 버는 방법을 찾는 사람이 아니라, 문제를 해결하는 사람에게 투자한다.',
    accent: '#6366F1'
  },
  {
    type: 'article', icon: '📊', category: 'INVESTMENT',
    title: '스타트업 지분 구조 완전 이해 — 공동창업부터 투자까지',
    subtitle: '지분율, 베스팅, 스톡옵션 — 창업팀이 반드시 알아야 할 개념들',
    body: `지분(Equity)은 회사의 소유권이다. 처음 창업할 때 어떻게 지분을 나누느냐가 나중에 회사의 운명을 결정하는 경우가 많다.

공동창업자 지분 분배 원칙: 기여도와 역할을 기반으로 명확히 나눠라. '사이좋게 반반'은 종종 갈등의 씨앗이 된다. CEO는 조금 더 많이 갖는 것이 일반적이다. 그리고 반드시 베스팅(Vesting) 조건을 붙여라.

베스팅(Vesting)이란: 일정 기간 회사에 기여해야 지분이 완전히 자신의 것이 되는 제도다. 보통 4년 베스팅, 1년 클리프(Cliff)가 표준이다. 공동창업자가 1년 만에 나가면서 지분을 전부 가져가는 상황을 방지한다.

투자 후 희석(Dilution): VC에게 투자를 받으면 기존 주주의 지분율이 낮아진다. 하지만 파이가 커지면 낮아진 지분율도 절대 가치는 더 클 수 있다.`,
    insight: '지분은 공평하게 나누는 것이 아니라, 기여도에 맞게 나누는 것이다.',
    accent: '#6366F1'
  },

  // 섹션 17-18: 마케팅 트렌드
  {
    type: 'article', icon: '📱', category: 'MARKETING',
    title: '2026 스타트업 마케팅 완전 가이드 — 비용 0원에서 시작하는 법',
    subtitle: '유기적 성장(Organic Growth)의 시대, 콘텐츠가 최고의 마케팅이다',
    body: `초기 스타트업에게 광고 예산은 없다. 그렇다면 어떻게 사용자를 모아야 할까?

콘텐츠 마케팅: 블로그, 유튜브, 인스타그램에 가치 있는 콘텐츠를 꾸준히 올리면 검색 트래픽이 쌓인다. 단기보다 장기 관점이 필요하지만, 복리 효과가 있다.

커뮤니티 마케팅: 잠재 고객이 모인 커뮤니티(레딧, 디스코드, 오픈카톡방)에 진정성 있게 참여하라. 광고가 아니라 도움을 주는 방식으로.

입소문(Word of Mouth): 모든 성장 전략 중 가장 강력하다. 사용자가 자발적으로 추천하게 만들려면 '기대를 초과하는 경험'을 제공해야 한다.

인플루언서 협업: 대형 인플루언서보다 마이크로 인플루언서(팔로워 1만~10만)가 비용 대비 효율이 높다. 타겟이 정확하고 신뢰도가 높기 때문이다.

청소년 창업가의 마케팅 무기: 본인 자체가 스토리다. 10대 창업가의 도전 과정을 공유하면 자연스럽게 미디어와 커뮤니티의 관심을 받는다.`,
    insight: '최고의 마케팅은 제품 자체가 마케팅이 되는 것이다.',
    accent: '#8B5CF6'
  },
  {
    type: 'article', icon: '🎨', category: 'MARKETING',
    title: 'Z세대가 반응하는 브랜딩의 비밀',
    subtitle: '진정성, 투명성, 사회적 가치 — Z세대는 무엇에 지갑을 여는가',
    body: `Z세대(1997~2012년생)는 역사상 가장 까다로운 소비자 세대다. 광고를 불신하고, 브랜드의 진정성을 의심하며, 사회적 가치에 반하는 브랜드를 불매운동한다.

Z세대가 브랜드를 선택하는 기준: 첫째, 진정성. 광고처럼 보이는 콘텐츠는 거른다. 둘째, 투명성. 제품이 어떻게 만들어지는지, 회사의 가치관이 무엇인지 알고 싶어한다. 셋째, 커뮤니티. 브랜드가 어떤 커뮤니티를 형성하는가.

성공 사례 — 딱히(DDAKHI): 한국 Z세대 사이에서 바이럴된 패션 브랜드로, SNS에서의 진정성 있는 소통과 소비자 참여 마케팅으로 성장했다.

틱톡의 부상: Z세대에게 틱톡은 검색 엔진이다. 제품을 검색할 때 구글보다 틱톡을 먼저 찾는다. 짧고 진정성 있는 영상 콘텐츠가 핵심이다.

청소년 창업가에게: 당신이 Z세대라면 Z세대 마케팅의 전문가다. 자신의 감각을 믿어라.`,
    insight: 'Z세대는 브랜드가 아닌 사람을 구매한다.',
    accent: '#8B5CF6'
  },

  // 섹션 19-20: 인터뷰 섹션
  {
    type: 'article', icon: '🎤', category: 'INTERVIEW',
    title: '"창업은 자신을 발견하는 여정입니다" — 대학생 창업가 3인 인터뷰',
    subtitle: '학교와 창업을 병행하는 대학생 창업가들이 말하는 현실',
    body: `세 명의 대학생 창업가를 만났다. 그들의 공통점은 하나 — 실패를 두려워하지 않는다는 것이다.

이지은(22, 연세대 경영학과): "창업 동아리에서 처음 팀을 만들었어요. 첫 서비스는 3개월 만에 접었습니다. 하지만 그 3개월이 제 인생에서 가장 많이 배운 시기였어요."

박민서(21, KAIST 전산학과): "기술을 가지고 있었지만 마케팅을 몰랐어요. 공대생이 비즈니스를 배우는 가장 빠른 방법은 직접 팔아보는 것이었습니다."

김준혁(23, 홍익대 디자인학과): "디자이너가 창업을 하면 좋은 점은, 제품의 사용자 경험을 처음부터 내가 설계할 수 있다는 거예요. 하지만 개발자 찾는 게 제일 힘들었습니다."

세 사람 모두 한 가지를 강조했다. "창업을 시작하기 전에 완벽하게 준비하려 하지 마세요. 시작하면서 배우는 것들이 훨씬 많습니다."`,
    insight: '완벽한 타이밍은 없다. 지금 가진 것으로 시작하라.',
    accent: '#10B981'
  },
  {
    type: 'article', icon: '👥', category: 'INTERVIEW',
    title: 'PACM 멘토단 특별 기고 — "청소년 창업가에게 전하는 말"',
    subtitle: '현장에서 뛰는 창업가, 투자자, 경영인들의 솔직한 조언',
    body: `PACM이 연결된 멘토들에게 청소년 창업가에게 전하고 싶은 한 마디를 물었다.

"첫 번째 고객을 찾아라. 100명에게 거절당하기 전에 포기하지 마라. 101번째 사람이 당신의 첫 번째 고객이 될 수 있다." — 스타트업 창업자 A

"창업팀에서 가장 중요한 것은 기술이나 아이디어가 아니라 팀원 간의 신뢰다. 힘든 순간에 서로를 믿을 수 있는가?" — 시리즈B 스타트업 CEO B

"투자를 받는 것보다 수익을 내는 것을 목표로 삼아라. 수익이 있으면 투자자가 먼저 찾아온다." — VC 파트너 C

"학교 공부와 창업을 대립으로 보지 마라. 학교에서 배우는 것들이 언젠가 창업에 도움이 된다. 경험은 쌓이는 것이다." — 성공한 청소년 창업 출신 기업인 D

"실패를 숨기지 마라. 실패를 공개적으로 분석하고 공유하는 사람이 더 빠르게 성장한다." — 스타트업 액셀러레이터 대표 E`,
    insight: '멘토의 말은 지름길을 보여주지만, 길을 걷는 것은 당신 몫이다.',
    accent: '#10B981'
  },

  // 섹션 21-22: 미래 예측
  {
    type: 'article', icon: '🔮', category: 'FORECAST',
    title: '2027 스타트업 생태계 예측 — AI가 분석한 다음 1년',
    subtitle: '인사이트쉽 AI 엔진이 예측하는 내년 창업 생태계 TOP 5 트렌드',
    body: `AI 추론: 현재 데이터를 기반으로 2027년 스타트업 생태계를 예측합니다. 불확실성이 높으므로 하나의 시나리오로 참고하십시오.

트렌드 1 — AI 에이전트의 일상화: 단순 챗봇이 아닌, 실제로 업무를 처리하는 AI 에이전트가 스타트업 운영 비용을 50% 이상 줄일 것으로 예상됩니다.

트렌드 2 — 소형화된 팀의 대형 영향력: 5인 미만 팀이 수십만 사용자를 보유하는 사례가 더 보편화될 가능성이 높습니다.

트렌드 3 — 한국 스타트업의 동남아 진출 가속화: K-콘텐츠 붐을 기반으로 한 플랫폼 비즈니스가 동남아에서 성장할 것으로 예측됩니다.

트렌드 4 — 교육 AI 시장의 폭발적 성장: 개인화 교육 수요가 증가하면서 에듀테크 시장이 전년 대비 40% 이상 성장할 것으로 보입니다.

트렌드 5 — 청소년 창업 제도화: 더 많은 학교와 기관이 청소년 창업 프로그램을 도입할 것으로 예상됩니다.`,
    insight: '미래를 예측하는 가장 좋은 방법은 직접 만드는 것이다.',
    accent: '#EC4899'
  },
  {
    type: 'article', icon: '🌱', category: 'FORECAST',
    title: '청소년 창업 생태계의 미래 — 10년 후 한국은?',
    subtitle: '2036년, 청소년 창업이 보편화된 세상을 상상해본다',
    body: `2036년 한국 청소년 창업 생태계는 어떤 모습일까? 몇 가지 시나리오를 그려본다.

낙관적 시나리오: 청소년 창업이 대학 입시만큼 중요한 선택지로 자리잡는다. 중고등학교 교육과정에 창업 교육이 정규 과목으로 포함되고, 청소년 스타트업 전용 펀드가 활성화된다. 한국에서 10대에 창업해 글로벌 유니콘이 된 사례가 나온다.

현실적 시나리오: 청소년 창업 인식이 개선되지만 제도적 지원은 여전히 부족하다. 소수의 열정 있는 청소년들이 독자적으로 길을 만들어가는 상황이 지속된다.

우리가 만들어야 할 미래: 인사이트쉽이 꿈꾸는 것은 청소년들이 정보의 격차 없이 도전할 수 있는 세상이다. 지금 여기서 시작한 작은 움직임이 10년 후 큰 변화가 된다.

변화는 항상 소수의 열정적인 사람들로부터 시작됐다.`,
    insight: '미래는 미리 정해진 것이 아니라 지금 우리가 선택으로 만들어가는 것이다.',
    accent: '#EC4899'
  },

  // 섹션 23-24: 실전 가이드
  {
    type: 'article', icon: '🛠️', category: 'PRACTICAL GUIDE',
    title: '창업 아이디어 검증 7단계 프레임워크',
    subtitle: '사업을 시작하기 전, 아이디어가 실제로 통하는지 확인하는 방법',
    body: `대부분의 창업 실패는 검증되지 않은 아이디어에서 시작된다. 7단계 프레임워크로 아이디어를 테스트하라.

1단계 — 문제 정의: 누가, 어떤 상황에서, 얼마나 자주 겪는 문제인가? 구체적으로 쓰라.

2단계 — 시장 규모 추정: 이 문제를 겪는 사람이 몇 명인가? 그들이 해결에 얼마를 지불할 용의가 있는가?

3단계 — 기존 대안 분석: 사람들이 지금 이 문제를 어떻게 해결하고 있는가? 왜 기존 해결책이 불완전한가?

4단계 — 고객 인터뷰: 실제로 잠재 고객 10명을 만나라. 당신의 가정을 검증하라.

5단계 — 랜딩 페이지 테스트: 아직 제품이 없어도 괜찮다. 랜딩 페이지를 만들고 관심 있는 사람들의 이메일을 받아라.

6단계 — MVP 제작: 핵심 기능 하나만 가진 최소한의 제품을 만들어 테스트하라.

7단계 — 지표 측정: 재방문율, 추천율, 지불 의향. 이 세 가지가 좋으면 PMF에 가까워진 것이다.`,
    insight: '아이디어는 검증하기 전까지는 그냥 아이디어일 뿐이다.',
    accent: '#F59E0B'
  },
  {
    type: 'article', icon: '📝', category: 'PRACTICAL GUIDE',
    title: '청소년이 지금 당장 할 수 있는 창업 준비 10가지',
    subtitle: '대학교도, 자금도 없어도 지금 시작할 수 있는 것들',
    body: `창업 준비는 나이나 자금과 상관없이 지금 당장 시작할 수 있다. 오늘부터 할 수 있는 10가지를 소개한다.

1. 하루 30분, 관심 분야의 책과 아티클 읽기. 인사이트쉽 뉴스레터를 구독하는 것도 좋은 시작이다.

2. 해결하고 싶은 문제 하나를 노트에 쓰고, 매주 업데이트하라.

3. LinkedIn 프로필을 만들어라. 지금부터 온라인 정체성을 구축하라.

4. 관심 분야의 커뮤니티에 참여하고 사람들을 만나라.

5. 무료 온라인 코스(Coursera, edX, 유튜브)로 기초 기술을 배워라. 코딩이든 디자인이든 마케팅이든.

6. 작은 프로젝트를 하나 완성하라. 완성품 하나가 미완성 10개보다 값지다.

7. 잠재 고객이 될 수 있는 사람들에게 아이디어를 공유하고 솔직한 피드백을 받아라.

8. 스타트업 행사, 해커톤에 참가하라. 비슷한 생각을 가진 사람들을 만날 수 있다.

9. 멘토를 찾아라. PACM 커뮤니티에 접속하면 선배 창업가들과 연결될 수 있다.

10. 오늘 바로 시작하라. 완벽한 타이밍은 없다.`,
    insight: '준비는 시작과 동시에 이루어진다.',
    accent: '#F59E0B'
  },

  // 섹션 25-26: 특별 기획
  {
    type: 'article', icon: '🌟', category: 'SPECIAL',
    title: 'PACM이 꿈꾸는 미래 — Insightship 로드맵 공개',
    subtitle: '2026년 하반기부터 2027년까지, 인사이트쉽이 준비하는 것들',
    body: `인사이트쉽은 지금 막 걸음마를 떼기 시작한 플랫폼이다. 하지만 우리가 향하는 방향은 명확하다.

2026년 하반기: 창업 챌린지 Season 1 완료 후 우수 아이디어 선정, 메인 커버스토리 게재. 기업 파트너십 첫 성사. 뉴스레터 구독자 100명 달성.

2027년 상반기: PACM EDU 콘텐츠 100개 달성. 창업 멘토 매칭 서비스 베타 출시. 월간 활성 사용자 10,000명 목표.

2027년 하반기: 모바일 앱 출시. 커뮤니티 실시간 대화 기능. 창업팀-기업 매칭 플랫폼 정식 서비스.

2028년: 동남아 시장 진출. 영어/베트남어 서비스 추가. 청소년 창업 펀드 연결 프로그램.

이 여정에서 가장 중요한 것은 하나다: 우리 플랫폼을 통해 실제로 꿈을 이룬 청소년 창업가가 나오는 것. 모든 기능, 모든 콘텐츠, 모든 파트너십은 그 목표를 위한 수단이다.`,
    insight: '큰 꿈을 작은 목표들로 나누어라. 그리고 하나씩 이뤄나가라.',
    accent: '#6366F1'
  },
  {
    type: 'article', icon: '✉️', category: 'SPECIAL',
    title: '편집장의 편지 — 창업가로서 살아간다는 것',
    subtitle: 'Manager A from PACM Insightship',
    body: `이 매거진을 읽고 있는 여러분에게.

창업가로 살아간다는 것은 매일 불확실성 속에서 결정을 내리는 일이다. 확신이 없는 상황에서 앞으로 나아가는 일이다.

이 매거진에 담긴 이야기들 — 성공한 창업가의 스토리, 실패에서 배운 교훈, 시장 분석, 경영 방법론 — 은 모두 한 가지를 말하고 있다. '시작하라'는 것이다.

완벽한 아이디어가 필요하지 않다. 충분한 자금이 필요하지 않다. 학벌이 필요하지 않다. 필요한 것은 단 하나, 시작하려는 의지다.

인사이트쉽은 청소년들이 정보와 격차 없이 도전할 수 있는 세상을 만들기 위해 존재한다. 이 매거진이 그 첫걸음에 작은 도움이 되기를 바란다.

앞으로 매달 새로운 매거진으로 찾아올 것이다. 구독하고, 공유하고, 도전하라.

— Manager A, PACM Insightship 경영지원팀`,
    insight: '이 매거진이 당신의 창업 여정에 작은 나침반이 되길 바란다.',
    accent: '#6366F1'
  },

  // 섹션 27: 뒷표지
  { type: 'backcover' }
]

// ── 스타일
const STYLES = `
  .mag-book { perspective: 2400px; }
  .mag-spread { display: grid; grid-template-columns: 1fr 1fr; min-height: 600px; position: relative;
    box-shadow: -8px 0 20px rgba(0,0,0,0.4), 8px 0 20px rgba(0,0,0,0.4), 0 20px 60px rgba(0,0,0,0.5);
    border-radius: 0 8px 8px 0; }
  .page-l { background: #0a0a0a; border-right: 1px solid #1a1a1a; border-radius: 8px 0 0 8px; padding: 52px 44px; position: relative; overflow: hidden; }
  .page-r { background: #0e0e0e; border-radius: 0 8px 8px 0; padding: 52px 44px; position: relative; overflow: hidden; }
  .spine-shadow { position: absolute; top: 0; bottom: 0; left: 0; width: 20px; background: linear-gradient(to right, rgba(0,0,0,0.5) 0%, transparent 100%); pointer-events: none; z-index: 2; }
  .spine-line { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; background: linear-gradient(to bottom, transparent, #1a1a1a 20%, #1a1a1a 80%, transparent); transform: translateX(-50%); z-index: 1; pointer-events: none; }
  .page-fade-in { animation: pgFade 0.45s cubic-bezier(0.4,0,0.2,1); }
  @keyframes pgFade { from { opacity: 0; transform: rotateY(-6deg) translateX(-10px); } to { opacity: 1; transform: rotateY(0) translateX(0); } }
  .pgnum { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #333; letter-spacing: 0.12em; }
  .cat-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
  .cat-label::after { content: ''; flex: 1; height: 1px; background: currentColor; opacity: 0.3; }
  .article-title { font-family: var(--f-serif); font-size: clamp(17px, 2.2vw, 23px); font-weight: 800; line-height: 1.2; color: #f5f5f5; margin: 0 0 10px; }
  .article-subtitle { font-size: 12px; color: #666; line-height: 1.6; margin: 0 0 18px; font-style: italic; }
  .divider { width: 36px; height: 2px; border-radius: 1px; margin-bottom: 18px; }
  .article-body { font-size: 13px; color: #999; line-height: 1.9; flex: 1; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 13; -webkit-box-orient: vertical; }
  .insight-box { border-top: 1px solid #1e1e1e; padding-top: 14px; margin-top: auto; }
  .insight-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 6px; }
  .insight-text { font-size: 12px; color: #aaa; line-height: 1.6; font-style: italic; }
  .dot-nav { display: flex; gap: 5px; align-items: center; }
  .dot { border-radius: 50%; cursor: pointer; transition: all 0.3s; }
  @media (max-width: 700px) {
    .mag-spread { grid-template-columns: 1fr; }
    .page-r, .spine-line { display: none; }
    .page-l { border-radius: 8px; }
  }
`

export default function MagazinePage() {
  const [spread, setSpread] = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const totalSpreads = Math.ceil(MAGAZINE_SECTIONS.length / 2)

  const go = useCallback((dir) => {
    const next = dir === 'next' ? Math.min(spread + 1, totalSpreads - 1) : Math.max(spread - 1, 0)
    if (next === spread) return
    setSpread(next)
    setAnimKey(k => k + 1)
  }, [spread, totalSpreads])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go('next')
      if (e.key === 'ArrowLeft') go('prev')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const leftIdx = spread * 2
  const rightIdx = spread * 2 + 1
  const leftSection = MAGAZINE_SECTIONS[leftIdx]
  const rightSection = MAGAZINE_SECTIONS[rightIdx]

  const ArticlePage = ({ section, pageNum, side }) => {
    if (!section) return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#2a2a2a' }}>
        <BookOpen size={40} />
      </div>
    )
    if (section.type === 'cover') return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '160px', height: '160px', background: 'radial-gradient(circle at top right, rgba(99,102,241,0.12), transparent 70%)', pointerEvents: 'none' }} />
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#6366F1', letterSpacing: '0.2em', marginBottom: '40px' }}>PACM × INSIGHTSHIP</div>
          <div style={{ fontSize: '11px', color: '#333', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', marginBottom: '12px' }}>VOL.1 · 2026.03</div>
          <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(32px,5vw,52px)', fontWeight: 900, lineHeight: 1.05, color: '#f5f5f5', margin: '0 0 20px', letterSpacing: '-0.02em' }}>
            창업의<br /><span style={{ color: '#6366F1' }}>모든 것</span>
          </h1>
          <p style={{ fontSize: '13px', color: '#555', lineHeight: 1.7, maxWidth: '280px' }}>
            청소년 창업 심층 인사이트<br />AI × 창업자 스토리 × 글로벌 트렌드<br />경제 × 경영 × 실전 가이드
          </p>
        </div>
        <div>
          <div style={{ width: '48px', height: '3px', background: '#6366F1', borderRadius: '2px', marginBottom: '24px' }} />
          <div style={{ fontSize: '11px', color: '#2a2a2a', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.8 }}>
            56 PAGES · 28 SPREADS<br />
            MONTHLY MAGAZINE<br />
            INSIGHTSHIP.PACM.KR
          </div>
        </div>
      </div>
    )
    if (section.type === 'backcover') return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#6366F1', letterSpacing: '0.2em', marginBottom: '32px' }}>THANK YOU FOR READING</div>
          <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, color: '#f5f5f5', lineHeight: 1.25, marginBottom: '20px' }}>
            다음 호에서<br />다시 만나요
          </h2>
          <p style={{ fontSize: '13px', color: '#555', lineHeight: 1.8 }}>
            매달 새로운 창업 인사이트와<br />함께 돌아올게요.
          </p>
        </div>
        <div>
          <div style={{ width: '100%', height: '1px', background: '#1a1a1a', marginBottom: '20px' }} />
          <div style={{ fontSize: '11px', color: '#2a2a2a', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.9 }}>
            www.insightship.pacm.kr<br />
            contact@pacm.kr<br />
            © 2026 PACM Corp.
          </div>
        </div>
      </div>
    )
    // 목차 (커버 오른쪽)
    if (side === 'right' && leftSection?.type === 'cover') return (
      <div>
        <div className="cat-label" style={{ color: '#6366F1' }}>CONTENTS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {MAGAZINE_SECTIONS.filter(s => s.type === 'article').slice(0, 14).map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: '14px', cursor: 'pointer', alignItems: 'flex-start' }}
              onClick={() => { setSpread(Math.floor(i / 2) + 1); setAnimKey(k => k + 1) }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#333', minWidth: '20px', paddingTop: '2px' }}>{String(i + 1).padStart(2, '0')}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: '#ccc', fontWeight: 600, lineHeight: 1.35, marginBottom: '2px' }}>{s.title}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#333' }}>{s.category} · p.{String((i + 1)).padStart(2, '0')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
    // 일반 아티클
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="pgnum" style={{ marginBottom: '20px' }}>— {String(pageNum).padStart(2, '0')} —</div>
        <div className="cat-label" style={{ color: section.accent || '#6366F1' }}>{section.icon} {section.category}</div>
        <h2 className="article-title">{section.title}</h2>
        <p className="article-subtitle">{section.subtitle}</p>
        <div className="divider" style={{ background: section.accent || '#6366F1' }} />
        <p className="article-body">{section.body}</p>
        {section.insight && (
          <div className="insight-box">
            <div className="insight-label" style={{ color: section.accent || '#6366F1' }}>Insight</div>
            <p className="insight-text">"{section.insight}"</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: '80px' }}>
      <style>{STYLES}</style>

      {/* 헤더 */}
      <div style={{ padding: '32px 0 28px', borderBottom: '1px solid #1a1a1a', marginBottom: '40px' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#6366F1', letterSpacing: '0.18em', marginBottom: '8px' }}>PACM MAGAZINE · VOL.1 · 2026.03</div>
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, marginBottom: '12px', lineHeight: 1.2 }}>
          창업 매거진
        </h1>
        <p style={{ color: '#555', fontSize: '14px', maxWidth: '540px', lineHeight: 1.8 }}>
          창업자 스토리 · AI·경제·경영 트렌드 · 글로벌 인사이트 · 실전 가이드 — 56페이지
        </p>
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['창업자 스토리', 'AI 트렌드', '경제 분석', '경영 인사이트', '글로벌', '실전 가이드'].map(tag => (
            <span key={tag} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#333', border: '1px solid #1e1e1e', padding: '3px 10px', borderRadius: '4px' }}>{tag}</span>
          ))}
        </div>
      </div>

      {/* 책 뷰어 */}
      <div className="mag-book">
        <div key={animKey} className="page-fade-in" style={{ position: 'relative' }}>
          {/* 책 아래 그림자 효과 */}
          <div style={{ position: 'absolute', bottom: '-12px', left: '2%', right: '2%', height: '12px', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(4px)', zIndex: 0 }} />

          <div className="mag-spread" style={{ position: 'relative', zIndex: 1 }}>
            <div className="spine-line" />

            {/* 왼쪽 페이지 */}
            <div className="page-l">
              <div className="spine-shadow" />
              <ArticlePage section={leftSection} pageNum={leftIdx + 1} side="left" />
            </div>

            {/* 오른쪽 페이지 */}
            <div className="page-r">
              <ArticlePage section={rightSection} pageNum={rightIdx + 1} side="right" />
            </div>
          </div>
        </div>
      </div>

      {/* 네비게이션 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '24px', padding: '0 4px' }}>
        <button onClick={() => go('prev')} disabled={spread === 0}
          className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: spread === 0 ? 0.3 : 1 }}>
          <ChevronLeft size={15} /> 이전
        </button>

        {/* 페이지 닷 네비게이션 */}
        <div className="dot-nav">
          {Array.from({ length: totalSpreads }).map((_, i) => (
            <div key={i} className="dot" onClick={() => { setSpread(i); setAnimKey(k => k + 1) }} style={{
              width: i === spread ? '18px' : '5px', height: '5px',
              background: i === spread ? '#6366F1' : '#222',
              borderRadius: i === spread ? '3px' : '50%',
            }} />
          ))}
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#333', marginLeft: '8px' }}>
            {spread * 2 + 1}–{Math.min(spread * 2 + 2, MAGAZINE_SECTIONS.length)} / {MAGAZINE_SECTIONS.length}
          </span>
        </div>

        <button onClick={() => go('next')} disabled={spread >= totalSpreads - 1}
          className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: spread >= totalSpreads - 1 ? 0.3 : 1 }}>
          다음 <ChevronRight size={15} />
        </button>
      </div>

      {/* 키보드 힌트 */}
      <div style={{ textAlign: 'center', marginTop: '12px', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#2a2a2a' }}>
        ← → 키보드로도 넘길 수 있어요
      </div>
    </div>
  )
}
