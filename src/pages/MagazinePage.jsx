import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'

/**
 * PACM 창업 매거진
 * - 모든 내용은 공개된 사실, 검증된 개념, 실제 데이터 기반
 * - 특정 개인/기업의 미검증 수치나 인터뷰 내용은 포함하지 않음
 * - 창업 이론, 경영 방법론, 공개 사례만 수록
 */

const MAGAZINE_SECTIONS = [
  // 0: 커버
  { type: 'cover' },

  // ── SECTION 1: 창업의 기초
  {
    type: 'article', category: 'STARTUP BASICS',
    title: '창업이란 무엇인가',
    subtitle: '새로운 가치를 만드는 행위의 본질',
    body: `창업(起業)은 새로운 사업을 시작하는 행위다. 단순히 회사를 등록하는 것이 아니라, 세상의 문제를 발견하고 그 해결책을 제품이나 서비스로 만들어 사람들에게 제공하는 과정 전체를 의미한다.

경제학자 조지프 슘페터(Joseph Schumpeter)는 창업가를 "창조적 파괴(Creative Destruction)의 주체"로 정의했다. 기존의 것을 더 나은 것으로 대체하는 혁신을 통해 경제를 발전시키는 사람이라는 뜻이다.

스탠퍼드 대학교 교수 스티브 블랭크(Steve Blank)는 스타트업을 "반복 가능하고 확장 가능한 비즈니스 모델을 찾는 임시 조직"으로 정의했다. 이 정의에서 핵심은 '찾는'이라는 단어다. 스타트업은 아직 답을 모르는 상태에서 시작한다.

린 스타트업(Lean Startup) 방법론의 창시자 에릭 리스(Eric Ries)는 Build-Measure-Learn 사이클을 통해 빠르게 가설을 검증하고 방향을 수정하는 것이 스타트업의 핵심이라고 설명했다.`,
    insight: '창업은 문제를 발견하는 것에서 시작된다.',
    accent: '#6366F1'
  },
  {
    type: 'article', category: 'STARTUP BASICS',
    title: 'MVP — 최소 기능 제품의 원리',
    subtitle: 'Eric Ries의 린 스타트업에서 배우는 검증의 방법',
    body: `MVP(Minimum Viable Product)는 에릭 리스가 린 스타트업(2011) 에서 소개한 개념이다. 핵심 가설을 검증하기 위한 최소한의 기능을 가진 제품을 말한다.

MVP의 목적은 완성도가 아니라 학습이다. "고객이 이 문제를 해결하기 위해 돈을 지불할 것인가?"라는 가장 중요한 질문에 답하기 위해 최소한의 자원을 투입하는 것이다.

실제 사례로 자주 인용되는 것은 드롭박스(Dropbox)다. 공동창업자 드루 휴스턴(Drew Houston)은 실제 제품을 만들기 전에 제품이 작동하는 것처럼 보이는 데모 영상만 만들었다. 영상을 공개한 후 하룻밤 사이에 수천 명이 베타 대기 신청을 했고, 이를 통해 시장 수요를 검증했다.

중요한 것은 MVP가 '나쁜 제품'이 아니라는 점이다. 핵심 가치는 완전히 전달하되, 불필요한 기능을 제거한 제품이다.`,
    insight: 'MVP는 배우기 위한 실험이지, 출시를 위한 제품이 아니다.',
    accent: '#6366F1'
  },

  // ── SECTION 2: AI와 창업
  {
    type: 'article', category: 'AI × STARTUP',
    title: 'Large Language Model이 창업 생태계를 바꾸는 방식',
    subtitle: 'GPT, Claude 등 LLM의 등장이 스타트업 지형에 미친 영향',
    body: `2022년 11월 OpenAI가 ChatGPT를 공개한 이후 스타트업 생태계는 빠르게 재편됐다. 출시 5일 만에 사용자 100만 명을 돌파했으며, 이는 역사상 가장 빠른 소비자 서비스 성장 중 하나로 기록된다.

LLM의 등장이 스타트업에 미친 영향은 두 가지 방향에서 분석할 수 있다. 첫째, 개발 비용의 급격한 하락이다. 자연어 처리, 텍스트 생성, 코드 자동완성 등을 처음부터 개발할 필요 없이 API로 즉시 활용할 수 있게 됐다.

둘째, 새로운 경쟁 환경이다. 기술 장벽이 낮아지면서 "AI 래퍼(wrapper)" 스타트업이 급증했다. 투자자들은 이제 단순히 LLM API를 감싸는 것 이상의 차별화를 요구한다. 독자적 데이터, 특정 산업의 도메인 지식, 측정 가능한 비즈니스 성과가 핵심 평가 기준이 됐다.

Sequoia Capital은 2023년 리포트에서 "AI 네이티브 스타트업"과 "AI 지원 스타트업"을 구분했다. 전자는 AI 없이는 존재할 수 없는 비즈니스이고, 후자는 AI를 활용해 기존 비즈니스를 개선하는 형태다.`,
    insight: '기술 장벽이 낮아질수록 비즈니스 모델과 실행력의 중요성이 높아진다.',
    accent: '#8B5CF6'
  },
  {
    type: 'article', category: 'AI × STARTUP',
    title: 'No-Code·Low-Code 플랫폼의 현재',
    subtitle: '기술 없이 서비스를 만드는 시대의 도구들',
    body: `No-Code 플랫폼은 프로그래밍 없이 웹앱, 자동화 워크플로우, 데이터베이스를 구축할 수 있는 도구다. Gartner의 분석에 따르면 2025년까지 새로운 애플리케이션의 70%가 No-Code 또는 Low-Code 플랫폼으로 만들어질 것으로 예측됐다.

주요 플랫폼별 특성을 살펴보면, Bubble은 복잡한 웹앱 로직 구현에 강점이 있고, Webflow는 디자인 자유도가 높은 웹사이트 제작에 적합하다. Airtable은 스프레드시트와 데이터베이스를 결합한 형태로, 스타트업의 초기 백엔드로 널리 활용된다.

자동화 영역에서는 Zapier와 Make(구 Integromat)가 서로 다른 서비스를 연결하는 워크플로우 자동화를 제공한다. 예를 들어 구글 폼 응답이 들어오면 자동으로 Notion에 저장하고 슬랙으로 알림을 보내는 식이다.

중요한 것은 도구보다 문제 정의다. No-Code 도구는 아이디어를 빠르게 검증하는 수단이지, 그 자체가 목적이 아니다.`,
    insight: '올바른 도구는 올바른 문제 정의 다음에 선택된다.',
    accent: '#8B5CF6'
  },

  // ── SECTION 3: 경제·투자 이해
  {
    type: 'article', category: 'ECONOMY',
    title: '벤처 투자(VC)의 구조와 원리',
    subtitle: '스타트업 투자 생태계를 이해하는 기초',
    body: `벤처 캐피털(Venture Capital, VC)은 고위험 고수익을 추구하는 투자 구조다. LP(Limited Partner, 출자자)들의 자금을 모아 GP(General Partner, 운용사)가 스타트업에 투자하고, 수익을 나누는 방식이다.

투자 단계별 명칭은 일반적으로 다음과 같다. Pre-Seed·Seed는 아이디어 또는 초기 제품 단계, 수천만~수억 원 규모다. 시리즈 A는 제품-시장 적합성(PMF)이 어느 정도 검증된 단계로 수십억 원 규모, 시리즈 B 이후는 성장 가속화를 위한 단계로 수백억 원 이상이다.

CB Insights의 2023년 데이터에 따르면, 시드 투자를 받은 스타트업 중 약 1%만이 시리즈 C 이상의 투자를 유치한다. 이를 "VC 깔때기(VC Funnel)"라고 부른다.

유니콘 기업(기업 가치 1조 원 이상 비상장 스타트업)은 2023년 기준 전 세계 약 1,200개로, 미국·중국·인도가 대부분을 차지하며 한국은 22개(당시 기준)였다.`,
    insight: '투자는 사업의 시작이 아니라 성장의 도구다.',
    accent: '#10B981'
  },
  {
    type: 'article', category: 'ECONOMY',
    title: '스타트업 핵심 재무 지표 가이드',
    subtitle: 'MRR, CAC, LTV, Churn — 숫자로 사업을 읽는 법',
    body: `스타트업을 평가할 때 투자자들이 가장 먼저 보는 것은 핵심 재무 지표다. 이 지표들을 이해하면 자신의 사업 상태를 객관적으로 진단할 수 있다.

MRR(Monthly Recurring Revenue): 월간 반복 매출. 구독 모델 스타트업에서 핵심 지표다. MRR이 매달 일정하게 증가하면 예측 가능한 성장을 의미한다.

CAC(Customer Acquisition Cost): 고객 1명을 획득하는 데 드는 비용. 마케팅·영업 비용을 신규 고객 수로 나눈 값이다.

LTV(Lifetime Value): 고객 한 명이 서비스를 이용하는 동안 발생시키는 총 수익. 일반적으로 LTV가 CAC의 3배 이상이어야 건강한 사업으로 본다.

Churn Rate(이탈률): 일정 기간 동안 서비스를 떠난 고객의 비율. B2B SaaS의 연간 허용 이탈률은 보통 5~10% 이하다.

번 레이트(Burn Rate): 회사가 매달 소진하는 현금 규모. 보유 현금을 번 레이트로 나누면 "런웨이(Runway)", 즉 현재 자금으로 버틸 수 있는 개월 수가 나온다.`,
    insight: '숫자를 모르면 방향을 잃는다. 핵심 지표 3개만이라도 매주 확인하라.',
    accent: '#10B981'
  },

  // ── SECTION 4: 경영 방법론
  {
    type: 'article', category: 'MANAGEMENT',
    title: 'OKR — 구글이 채택한 목표 관리 방법론',
    subtitle: '인텔에서 시작해 전 세계 스타트업으로 퍼진 OKR의 원리',
    body: `OKR(Objectives and Key Results)은 인텔의 앤디 그로브(Andy Grove)가 개발하고, 투자자 존 도어(John Doerr)가 구글에 소개한 목표 관리 프레임워크다. 존 도어의 저서 『Measure What Matters』(2018)에 상세히 설명돼 있다.

구조는 단순하다. Objective(목표)는 질적이고 영감을 주는 목표다. Key Results(핵심 결과)는 목표 달성 여부를 측정하는 2~5개의 정량적 지표다.

OKR의 특징은 "Moonshot(문샷)" 사고를 장려한다는 점이다. 달성하기 어렵지만 불가능하지 않은 목표를 설정하고, 70% 달성을 성공으로 본다. 100% 달성하면 목표가 충분히 도전적이지 않았다는 신호다.

구글은 1999년 도입 이후 OKR을 전사적으로 운영하며, 직원 수가 수만 명이 된 지금도 분기별 OKR을 전 직원이 공개적으로 공유한다. 투명성이 OKR의 핵심 가치 중 하나다.

스타트업에서 OKR 도입 시 주의할 점은 지표를 너무 많이 설정하지 않는 것이다. 집중이 핵심이다.`,
    insight: '좋은 목표는 팀에게 방향을 주고, 좋은 지표는 그 방향을 확인해준다.',
    accent: '#F59E0B'
  },
  {
    type: 'article', category: 'MANAGEMENT',
    title: '애자일 방법론의 핵심 원리',
    subtitle: '2001년 애자일 선언문에서 시작된 소프트웨어 개발 혁명',
    body: `2001년 2월, 소프트웨어 개발자 17명이 미국 유타주 스노우버드 스키장에 모여 "애자일 소프트웨어 개발 선언문(Agile Manifesto)"을 작성했다. 4가지 핵심 가치와 12개 원칙으로 구성된 이 선언문은 이후 소프트웨어 산업 전체를 바꿨다.

4가지 핵심 가치: ①개인과 상호작용 > 프로세스와 도구, ②작동하는 소프트웨어 > 포괄적인 문서, ③고객과의 협력 > 계약 협상, ④변화에 대응 > 계획을 따름.

스크럼(Scrum)은 가장 널리 사용되는 애자일 프레임워크다. 2~4주 단위의 스프린트(Sprint)로 작업을 나누고, 매일 짧은 스탠드업 미팅(Daily Scrum)으로 진행 상황을 공유한다. 스프린트가 끝나면 작동하는 제품을 데모하고, 다음 스프린트를 계획한다.

칸반(Kanban)은 Toyota의 생산 방식에서 유래했다. 할 일(To Do), 진행 중(In Progress), 완료(Done) 3단계로 작업 흐름을 시각화하는 방식이다. Trello, Notion, GitHub Projects 같은 도구가 칸반 보드를 지원한다.

스타트업에서 애자일이 중요한 이유는 불확실성 때문이다. 시장과 고객이 원하는 것이 처음 생각과 다를 수 있으므로, 빠르게 테스트하고 수정할 수 있는 구조가 필요하다.`,
    insight: '계획을 세우되, 계획에 집착하지 마라. 학습이 계획보다 가치 있다.',
    accent: '#F59E0B'
  },

  // ── SECTION 5: 성공 기업 사례 (공개된 사실만)
  {
    type: 'article', category: 'CASE STUDY',
    title: '에어비앤비 — 거절과 피봇의 역사',
    subtitle: '공개된 자료를 바탕으로 정리한 에어비앤비 초기 창업 과정',
    body: `에어비앤비(Airbnb)는 2008년 브라이언 체스키(Brian Chesky), 조 게비아(Joe Gebbia), 네이선 블레차르지크(Nathan Blecharczyk)가 공동창업했다. 창업 배경은 샌프란시스코에서 열린 디자인 컨퍼런스 기간 동안 숙박이 부족하다는 것을 직접 경험한 것이었다.

초기에는 에어매트리스(Air Mattress)와 아침 식사(Breakfast)를 제공하는 서비스여서 "AirBed & Breakfast"로 시작했다.

창업 초기 여러 VC에게 투자를 거절당했다는 사실은 브라이언 체스키가 여러 인터뷰와 강연에서 직접 밝힌 내용이다. Y Combinator의 2009년 배치에 합류하며 시드 투자를 받았고, 이후 세코이아 캐피털 등으로부터 투자를 유치했다.

2020년 COVID-19 팬데믹으로 매출이 급감했으나, 비용을 절감하고 장기 숙박 수요에 집중하는 전략으로 회복해 같은 해 IPO에 성공했다. IPO 당일 시가총액은 약 1,000억 달러였다(공개 재무 정보).`,
    insight: '좋은 아이디어도 실행과 타이밍, 끈기가 없으면 빛을 발하지 못한다.',
    accent: '#F97316'
  },
  {
    type: 'article', category: 'CASE STUDY',
    title: '슬랙(Slack) — 게임 회사가 협업 툴이 된 이야기',
    subtitle: '대표적인 피봇 사례로 알려진 Slack의 창업 과정',
    body: `슬랙(Slack)은 원래 협업 툴이 아니었다. 스튜어트 버터필드(Stewart Butterfield)는 2009년 게임 회사 Tiny Speck을 창업하고 "Glitch"라는 온라인 게임을 개발했다. 게임 자체는 2012년 서비스 종료됐지만, 게임 개발 과정에서 팀 내부 소통을 위해 만든 메시징 도구가 있었다.

이 도구를 외부에 공개하자 예상치 못한 반응이 왔다. 많은 팀들이 "우리도 이런 것이 필요하다"고 했고, 버터필드 팀은 피봇(Pivot)을 결정했다. 게임 사업을 접고 메시징 툴에 집중한 것이다.

2013년 베타로 출시된 슬랙은 첫날 8,000개 이상의 팀이 가입 신청을 했다. 이후 기업용 협업 시장에서 빠르게 성장해, 2021년 세일즈포스(Salesforce)가 약 277억 달러에 인수했다(공개된 인수 금액).

슬랙 사례는 "원래 만들려던 것"이 실패해도 그 과정에서 얻은 것이 새로운 사업이 될 수 있음을 보여준다.`,
    insight: '실패한 프로젝트에서 숨겨진 가치를 찾아라.',
    accent: '#F97316'
  },

  // ── SECTION 6: 글로벌 창업 생태계
  {
    type: 'article', category: 'GLOBAL',
    title: '실리콘밸리 생태계의 구조',
    subtitle: '왜 실리콘밸리에서 스타트업이 집중적으로 탄생하는가',
    body: `실리콘밸리(Silicon Valley)가 전 세계 스타트업의 중심이 된 데는 몇 가지 구조적 요인이 있다. 스탠퍼드 대학교와 UC버클리를 중심으로 한 기술 인재 풀, 1970~80년대부터 형성된 VC 생태계, 그리고 실패를 용인하는 문화가 복합적으로 작용했다.

Y Combinator(YC)는 2005년 폴 그레이엄(Paul Graham)이 창업한 액셀러레이터로, 에어비앤비, 드롭박스, 레딧, 스트라이프 등을 초기에 지원했다. YC의 표준 조건은 창업팀 지분 7%를 받고 일정 금액의 투자를 제공하는 것이다(구체적 금액은 변경됨).

스탠퍼드 대학교는 교수진과 학생들이 창업한 기업의 총 가치가 수조 달러에 달한다고 자체 보고서에서 밝혔다. HP, 구글, 야후, 시스코 모두 스탠퍼드와 연관이 있다.

한국의 스타트업 생태계는 강남구 테헤란로를 중심으로 형성돼 있으며, 중소벤처기업부 자료에 따르면 벤처투자 규모가 2021년 약 7.7조 원으로 역대 최고를 기록했다가 이후 조정됐다.`,
    insight: '생태계는 혼자 만들 수 없다. 연결과 커뮤니티가 창업을 가능하게 한다.',
    accent: '#06B6D4'
  },
  {
    type: 'article', category: 'GLOBAL',
    title: '한국 스타트업 생태계 현황',
    subtitle: '중기부·통계청 공개 데이터로 본 한국 창업 지형',
    body: `중소벤처기업부가 발표한 공개 통계에 따르면, 한국의 신설 법인 수는 2022년 기준 약 13만 개 이상으로 역대 최고 수준을 기록했다.

한국의 유니콘 기업(기업 가치 1조 원 이상 비상장 스타트업) 수는 2023년 기준 22개로, 중기부가 공개적으로 발표했다. 쿠팡, 크래프톤, 하이브 등은 이미 상장해 유니콘을 졸업했다.

청소년 창업에 대한 제도적 지원으로는 교육부의 창업교육 생태계 구축 사업, 창업진흥원의 청년창업사관학교, 각 대학의 창업지원단 등이 있다. 초·중·고 단계의 창업 교육 시수는 지속적으로 늘어나는 추세다.

스타트업 생존율과 관련해, 중기부 데이터에 따르면 신설 기업의 5년 생존율은 업종별로 다르지만 평균 약 30% 수준으로, 창업 후 5년 안에 대부분이 폐업한다. 이는 글로벌 평균과 유사하다.`,
    insight: '숫자를 알면 현실이 보이고, 현실을 알면 전략이 생긴다.',
    accent: '#06B6D4'
  },

  // ── SECTION 7: 마케팅과 성장
  {
    type: 'article', category: 'GROWTH',
    title: 'PMF — 제품-시장 적합성을 찾는 방법',
    subtitle: 'Marc Andreessen이 정의한 스타트업 성공의 첫 번째 조건',
    body: `PMF(Product-Market Fit)는 벤처 투자자 마크 앤드리슨(Marc Andreessen)이 2007년 블로그 포스트에서 처음 체계화한 개념이다. 그는 "PMF란 좋은 시장에서 그 시장을 만족시킬 수 있는 제품을 갖추는 것"이라고 정의했다.

PMF를 발견했다는 신호는 주관적이지만 몇 가지 지표로 측정할 수 있다. 숀 엘리스(Sean Ellis) 테스트는 사용자에게 "이 제품을 더 이상 사용할 수 없다면 어떤 기분이겠냐?"고 묻고, "매우 실망할 것"이라는 응답이 40% 이상이면 PMF에 근접했다고 본다.

넷플릭스의 NPS(Net Promoter Score) 같은 지표도 PMF 측정에 활용된다. NPS는 "이 서비스를 지인에게 추천하겠냐?"는 단 하나의 질문으로 고객 충성도를 측정한다.

PMF 이전에 스케일(확장)을 시도하는 것은 가장 흔한 스타트업 실패 원인 중 하나다. CB Insights의 스타트업 실패 원인 분석에서 "시장 니즈 없음"은 가장 빈번한 이유로 꼽힌다.`,
    insight: 'PMF 없는 확장은 실패를 가속하는 것이다.',
    accent: '#EC4899'
  },
  {
    type: 'article', category: 'GROWTH',
    title: '그로스 해킹의 원리',
    subtitle: 'Sean Ellis가 만들고 드롭박스·에어비앤비가 실증한 성장 방법론',
    body: `그로스 해킹(Growth Hacking)은 2010년 숀 엘리스(Sean Ellis)가 만든 용어다. 마케팅과 제품 개발을 결합해 빠른 실험을 통해 성장 동력을 찾는 방법론이다.

에어비앤비의 그로스 해킹 사례는 업계에서 널리 인용된다. 공개된 바에 따르면, 초기 에어비앤비는 크레이그리스트(Craigslist)를 활용해 숙소 목록을 자동으로 두 플랫폼 모두에 올릴 수 있게 했다. 크레이그리스트의 방대한 사용자 기반을 레버리지한 것이다.

드롭박스는 추천 프로그램(Referral Program)으로 빠르게 성장했다. 기존 사용자가 친구를 초대하면 양쪽 모두 추가 저장 공간을 받는 방식이었다. 드롭박스 창업자 드루 휴스턴은 이 방법으로 15개월 만에 사용자가 10배 성장했다고 밝혔다.

AARRR 프레임워크(Acquisition, Activation, Retention, Revenue, Referral)는 그로스 해킹에서 활용하는 대표적인 성장 지표 구조다. 각 단계의 전환율을 측정하고 병목 구간을 개선하는 방식이다.`,
    insight: '성장은 마케팅 예산이 아니라 창의적 실험에서 나온다.',
    accent: '#EC4899'
  },

  // ── SECTION 8: 팀 빌딩
  {
    type: 'article', category: 'TEAM',
    title: '좋은 공동창업자를 찾는 방법',
    subtitle: 'Y Combinator와 Paul Graham이 강조하는 팀 구성의 원칙',
    body: `폴 그레이엄(Paul Graham)은 Y Combinator의 경험을 바탕으로 쓴 여러 에세이에서 공동창업자 선정이 스타트업의 가장 중요한 결정 중 하나라고 반복적으로 강조했다.

YC의 데이터에 따르면 단독 창업자보다 2~3명의 공동창업팀이 더 높은 성공률을 보였다. 폴 그레이엄은 "혼자 창업하는 것은 신뢰 신호(Trust Signal)가 약하다"고 했다. 투자자 입장에서, 아무도 공동으로 사업하고 싶어 하지 않는 사람은 신뢰하기 어렵다는 것이다.

좋은 공동창업자의 조건으로 폴 그레이엄이 꼽은 것들: 서로 오랫동안 알고 지낸 사이(최소 1년 이상), 기술 역량의 상호 보완, 어려운 상황에서도 포기하지 않는 끈기, 그리고 솔직한 의견을 나눌 수 있는 관계.

지분 분배에서 공통적으로 권장되는 것은 베스팅(Vesting) 조건이다. 4년 베스팅, 1년 클리프(Cliff)가 업계 표준이다. 공동창업자가 초기에 떠날 경우 지분 전체를 가져가지 못하도록 보호하는 장치다.`,
    insight: '팀이 전략보다 중요하고, 실행력이 아이디어보다 중요하다.',
    accent: '#6366F1'
  },
  {
    type: 'article', category: 'TEAM',
    title: '창업팀의 역할과 조직 문화',
    subtitle: 'Netflix Culture Deck에서 배우는 초기 조직 문화 설계',
    body: `넷플릭스 CEO 리드 헤이스팅스(Reed Hastings)와 패티 맥코드(Patty McCord)가 작성한 "넷플릭스 컬처 덱(Netflix Culture Deck)"은 2009년 공개된 이후 실리콘밸리에서 폭넓게 인용되는 문서다. 셰릴 샌드버그(Sheryl Sandberg)가 "실리콘밸리에서 나온 가장 중요한 문서"라고 평한 것으로 알려져 있다.

핵심 내용 중 하나는 "규칙 대신 맥락(Context, not Control)"이다. 규칙을 만들어 통제하는 대신, 직원들이 올바른 판단을 내릴 수 있도록 맥락과 목표를 공유하는 것이 더 효과적이라는 철학이다.

초기 스타트업의 조직 문화는 창업자들의 행동이 곧 문화가 된다. 에드거 샤인(Edgar Schein)의 조직문화 이론에 따르면, 문화는 명시적 선언보다 리더의 행동과 결정으로 전달된다.

또 하나의 중요한 원칙은 채용 기준이다. 넷플릭스는 "나중에 같이 일하고 싶은 사람인가?"를 핵심 채용 질문으로 삼는다. 초기 팀의 문화적 밀도(Culture Density)가 이후 성장에 결정적 영향을 미친다.`,
    insight: '문화는 선언이 아니라 매일의 결정이 만든다.',
    accent: '#6366F1'
  },

  // ── SECTION 9: 실전 가이드
  {
    type: 'article', category: 'PRACTICAL',
    title: '비즈니스 모델 캔버스 활용법',
    subtitle: 'Alexander Osterwalder의 9가지 블록으로 사업을 설계하라',
    body: `비즈니스 모델 캔버스(Business Model Canvas)는 알렉산더 오스터왈더(Alexander Osterwalder)와 예스 피뇨어(Yves Pigneur)가 2010년 저서 『Business Model Generation』에서 소개한 프레임워크다.

9가지 블록으로 구성된다. ①고객 세그먼트(Customer Segments), ②가치 제안(Value Propositions), ③채널(Channels), ④고객 관계(Customer Relationships), ⑤수익 구조(Revenue Streams), ⑥핵심 자원(Key Resources), ⑦핵심 활동(Key Activities), ⑧핵심 파트너십(Key Partnerships), ⑨비용 구조(Cost Structure).

한 페이지에 사업 전체를 시각화할 수 있는 것이 핵심 장점이다. 팀원들과 공유하기 쉽고, 어떤 부분이 취약한지 한눈에 파악할 수 있다.

중요한 것은 캔버스가 완성되면 실제로 가정(Assumption)을 검증하는 것이다. 특히 가치 제안과 고객 세그먼트가 실제로 맞는지 확인하는 고객 인터뷰가 필수적이다.`,
    insight: '계획의 도구가 아닌 학습의 도구로 캔버스를 활용하라.',
    accent: '#8B5CF6'
  },
  {
    type: 'article', category: 'PRACTICAL',
    title: '고객 인터뷰를 제대로 하는 법',
    subtitle: 'Rob Fitzpatrick의 "The Mom Test"에서 배우는 핵심 원칙',
    body: `롭 피츠패트릭(Rob Fitzpatrick)의 저서 『The Mom Test』(2013)는 창업자들이 고객 인터뷰에서 자주 저지르는 실수를 다룬다. 제목의 의미는 "엄마에게도 속을 수 있는 질문을 하지 마라"는 것이다.

흔한 실수: "이런 앱이 있으면 쓰겠어요?" 같은 질문에 대부분의 사람들은 "네"라고 답하지만, 실제로 돈을 내지는 않는다.

올바른 접근법: 미래 행동을 묻지 말고 과거 행동을 물어라. "마지막으로 이 문제를 겪은 게 언제였나요?", "지금 어떻게 해결하고 있나요?", "그 방법에서 가장 불편한 점은 무엇인가요?" 같은 질문이다.

인터뷰에서 얻어야 할 것은 사실(Facts)과 행동 패턴(Behaviors)이다. "정말 어려운 문제예요!"라는 말보다 "저는 이 문제 때문에 매주 2시간을 허비합니다"가 훨씬 가치 있는 정보다.

인터뷰 중에 아이디어를 설명하려는 충동을 억제하라. 듣는 것이 목적이다.`,
    insight: '고객이 원하는 것을 묻지 말고, 고객이 하는 것을 관찰하라.',
    accent: '#8B5CF6'
  },

  // ── SECTION 10: PACM & Insightship
  {
    type: 'article', category: 'ABOUT PACM',
    title: 'PACM과 Insightship이 존재하는 이유',
    subtitle: '청소년 창업 생태계의 정보 격차를 해소하기 위한 여정',
    body: `PACM(피에이씨엠)은 청소년 창업 생태계를 지원하는 것을 목표로 설립된 회사다. 인사이트쉽(Insightship)은 PACM이 운영하는 청소년 창업 인사이트 플랫폼이다.

인사이트쉽이 풀고자 하는 문제는 하나다: 창업에 필요한 정보와 연결이 특정 계층에게만 집중돼 있다는 것이다. 좋은 학교, 좋은 네트워크, 좋은 가정 환경을 가진 사람들은 이미 많은 정보와 연결을 갖고 있다. 그렇지 않은 청소년들을 위한 공간이 인사이트쉽이다.

플랫폼에서 제공하는 것들: 국내외 창업 뉴스 AI 요약 서비스, 주간 창업 인사이트 뉴스레터, 창업자 커뮤니티, 기업-청소년 연결(PACM Connect), 창업 학습 콘텐츠(PACM EDU), 그리고 이 매거진.

모든 서비스는 청소년을 포함해 누구나 무료로 접근할 수 있다. 이것이 인사이트쉽의 가장 중요한 원칙이다.`,
    insight: '정보의 격차 없이 도전할 수 있는 세상 — 그것이 인사이트쉽이 만들고 싶은 세상이다.',
    accent: '#6366F1'
  },

  // 뒷표지
  { type: 'backcover' }
]

// ── 스타일 (책 느낌)
const STYLES = `
  .mag-spread {
    display: grid; grid-template-columns: 1fr 1fr;
    min-height: 580px; position: relative;
    box-shadow: -6px 0 24px rgba(0,0,0,0.5), 8px 0 24px rgba(0,0,0,0.4), 0 24px 64px rgba(0,0,0,0.5);
  }
  .page-l {
    background: #090909; border-right: 1px solid #161616;
    border-radius: 8px 0 0 8px; padding: 52px 44px;
    position: relative; overflow: hidden;
  }
  .page-r {
    background: #0d0d0d; border-radius: 0 8px 8px 0;
    padding: 52px 44px; position: relative; overflow: hidden;
  }
  .spine-shadow {
    position: absolute; top: 0; bottom: 0; left: 0; width: 18px;
    background: linear-gradient(to right, rgba(0,0,0,0.55), transparent);
    pointer-events: none; z-index: 2;
  }
  .spine-center {
    position: absolute; top: 0; bottom: 0; left: 50%;
    width: 2px; transform: translateX(-50%);
    background: linear-gradient(to bottom, transparent 0%, #181818 15%, #181818 85%, transparent 100%);
    pointer-events: none; z-index: 1;
  }
  .pg-fade { animation: pgIn 0.4s cubic-bezier(0.4,0,0.2,1); }
  @keyframes pgIn { from { opacity: 0; transform: rotateY(-5deg) translateX(-8px); } to { opacity: 1; transform: none; } }
  .pgnum { font-family: 'JetBrains Mono',monospace; font-size: 10px; color: #2a2a2a; letter-spacing: 0.12em; margin-bottom: 20px; }
  .cat-tag { font-family: 'JetBrains Mono',monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 18px; display: flex; align-items: center; gap: 8px; }
  .cat-tag::after { content: ''; flex: 1; height: 1px; background: currentColor; opacity: 0.25; }
  .art-title { font-family: var(--f-serif); font-size: clamp(16px,2vw,21px); font-weight: 800; line-height: 1.2; color: #f0f0f0; margin: 0 0 8px; }
  .art-sub { font-size: 12px; color: #4a4a4a; line-height: 1.6; margin: 0 0 16px; font-style: italic; }
  .divider { width: 32px; height: 2px; border-radius: 1px; margin-bottom: 16px; }
  .art-body { font-size: 13px; color: #888; line-height: 1.9; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 14; -webkit-box-orient: vertical; flex: 1; }
  .ins-box { border-top: 1px solid #161616; padding-top: 14px; margin-top: auto; }
  .ins-label { font-family: 'JetBrains Mono',monospace; font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 5px; }
  .ins-text { font-size: 12px; color: #888; line-height: 1.6; font-style: italic; }
  @media (max-width: 680px) {
    .mag-spread { grid-template-columns: 1fr; }
    .page-r, .spine-center { display: none; }
    .page-l { border-radius: 8px; }
  }
`

export default function MagazinePage() {
  const [spread, setSpread] = useState(0)
  const [key, setKey] = useState(0)
  const total = Math.ceil(MAGAZINE_SECTIONS.length / 2)

  const go = useCallback((dir) => {
    const next = dir === 'next' ? Math.min(spread + 1, total - 1) : Math.max(spread - 1, 0)
    if (next === spread) return
    setSpread(next)
    setKey(k => k + 1)
  }, [spread, total])

  useEffect(() => {
    const fn = e => { if (e.key === 'ArrowRight') go('next'); if (e.key === 'ArrowLeft') go('prev') }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [go])

  const li = spread * 2
  const ri = spread * 2 + 1
  const ls = MAGAZINE_SECTIONS[li]
  const rs = MAGAZINE_SECTIONS[ri]

  const Page = ({ s, pn, side }) => {
    if (!s) return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <BookOpen size={36} color="#1a1a1a" />
      </div>
    )
    if (s.type === 'cover') return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '140px', height: '140px', background: 'radial-gradient(circle at top right, rgba(99,102,241,0.1), transparent 70%)', pointerEvents: 'none' }} />
        <div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color: '#6366F1', letterSpacing: '0.2em', marginBottom: '36px' }}>PACM × INSIGHTSHIP</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color: '#252525', letterSpacing: '0.1em', marginBottom: '10px' }}>VOL.1 · 2026.03</div>
          <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(30px,5vw,48px)', fontWeight: 900, lineHeight: 1.05, color: '#f0f0f0', margin: '0 0 18px', letterSpacing: '-0.02em' }}>
            창업의<br /><span style={{ color: '#6366F1' }}>모든 것</span>
          </h1>
          <p style={{ fontSize: '13px', color: '#3a3a3a', lineHeight: 1.75, maxWidth: '260px' }}>
            공개된 데이터와 검증된 이론으로<br />구성한 청소년 창업 인사이트
          </p>
        </div>
        <div>
          <div style={{ width: '40px', height: '2px', background: '#6366F1', borderRadius: '1px', marginBottom: '20px' }} />
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color: '#1e1e1e', lineHeight: 2 }}>
            {MAGAZINE_SECTIONS.filter(s => s.type === 'article').length * 2} PAGES<br />
            MONTHLY · INSIGHTSHIP.PACM.KR
          </div>
        </div>
      </div>
    )
    if (s.type === 'backcover') return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color: '#6366F1', letterSpacing: '0.18em', marginBottom: '28px' }}>THANK YOU</div>
          <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px,3vw,28px)', fontWeight: 800, color: '#f0f0f0', lineHeight: 1.25, marginBottom: '16px' }}>다음 호에서<br />다시 만나요</h2>
          <p style={{ fontSize: '13px', color: '#3a3a3a', lineHeight: 1.8 }}>매달 새로운 창업 인사이트와<br />함께 찾아옵니다.</p>
        </div>
        <div>
          <div style={{ width: '100%', height: '1px', background: '#161616', marginBottom: '18px' }} />
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color: '#1e1e1e', lineHeight: 2 }}>
            www.insightship.pacm.kr<br />contact@pacm.kr<br />© 2026 PACM Corp.
          </div>
        </div>
      </div>
    )
    // 커버 오른쪽 = 목차
    if (side === 'right' && ls?.type === 'cover') return (
      <div>
        <div className="cat-tag" style={{ color: '#6366F1' }}>CONTENTS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {MAGAZINE_SECTIONS.filter(x => x.type === 'article').map((x, i) => (
            <div key={i} style={{ display: 'flex', gap: '12px', cursor: 'pointer', alignItems: 'flex-start' }}
              onClick={() => { setSpread(Math.floor(i / 2) + 1); setKey(k => k + 1) }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9px', color: '#252525', minWidth: '18px', paddingTop: '2px' }}>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <div style={{ fontSize: '12px', color: '#aaa', fontWeight: 600, lineHeight: 1.35, marginBottom: '1px' }}>{x.title}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9px', color: '#2a2a2a' }}>{x.category}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
    // 일반 기사
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="pgnum">{String(pn).padStart(2, '0')}</div>
        <div className="cat-tag" style={{ color: s.accent }}>{s.category}</div>
        <h2 className="art-title">{s.title}</h2>
        <p className="art-sub">{s.subtitle}</p>
        <div className="divider" style={{ background: s.accent }} />
        <p className="art-body">{s.body}</p>
        {s.insight && (
          <div className="ins-box">
            <div className="ins-label" style={{ color: s.accent }}>Insight</div>
            <p className="ins-text">"{s.insight}"</p>
          </div>
        )}
      </div>
    )
  }

  const articles = MAGAZINE_SECTIONS.filter(s => s.type === 'article')
  const pageCount = articles.length * 2

  return (
    <div style={{ paddingBottom: '80px' }}>
      <style>{STYLES}</style>

      {/* 헤더 */}
      <div style={{ padding: '32px 0 28px', borderBottom: '1px solid #141414', marginBottom: '40px' }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: '#6366F1', letterSpacing: '0.18em', marginBottom: '8px' }}>
          PACM MAGAZINE · VOL.1 · 2026.03
        </div>
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, marginBottom: '10px', lineHeight: 1.2 }}>
          창업 매거진
        </h1>
        <p style={{ color: '#444', fontSize: '13px', maxWidth: '560px', lineHeight: 1.8 }}>
          공개된 데이터와 검증된 이론만으로 구성했습니다 · {pageCount}페이지 · {total} 스프레드
        </p>
        <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {['창업 기초', 'AI × 창업', '경제·투자', '경영 방법론', '성공 사례', '글로벌', '성장', '팀 빌딩', '실전 가이드', 'PACM'].map(t => (
            <span key={t} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color: '#252525', border: '1px solid #1a1a1a', padding: '3px 8px', borderRadius: '3px' }}>{t}</span>
          ))}
        </div>
      </div>

      {/* 책 뷰어 */}
      <div>
        {/* 책 그림자 */}
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', bottom: '-10px', left: '3%', right: '3%', height: '10px', background: 'radial-gradient(ellipse, rgba(0,0,0,0.35), transparent 70%)', filter: 'blur(3px)' }} />
          <div key={key} className="pg-fade mag-spread">
            <div className="spine-center" />
            <div className="page-l">
              <div className="spine-shadow" />
              <Page s={ls} pn={li + 1} side="left" />
            </div>
            <div className="page-r">
              <Page s={rs} pn={ri + 1} side="right" />
            </div>
          </div>
        </div>

        {/* 네비게이션 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '20px' }}>
          <button onClick={() => go('prev')} disabled={spread === 0}
            className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '5px', opacity: spread === 0 ? 0.25 : 1 }}>
            <ChevronLeft size={14} /> 이전
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {Array.from({ length: total }).map((_, i) => (
              <div key={i} onClick={() => { setSpread(i); setKey(k => k + 1) }}
                style={{ width: i === spread ? '16px' : '4px', height: '4px', borderRadius: i === spread ? '2px' : '50%', background: i === spread ? '#6366F1' : '#1e1e1e', cursor: 'pointer', transition: 'all 0.3s' }} />
            ))}
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color: '#252525', marginLeft: '10px' }}>
              {spread * 2 + 1}–{Math.min(spread * 2 + 2, MAGAZINE_SECTIONS.length)} / {MAGAZINE_SECTIONS.length}
            </span>
          </div>

          <button onClick={() => go('next')} disabled={spread >= total - 1}
            className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '5px', opacity: spread >= total - 1 ? 0.25 : 1 }}>
            다음 <ChevronRight size={14} />
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: '10px', fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', color: '#1e1e1e' }}>
          ← → 키보드로 넘기기
        </div>
      </div>
    </div>
  )
}
