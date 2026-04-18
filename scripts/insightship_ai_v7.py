"""
Insightship AI v7.0 - 청소년 경제창업 교육 콘텐츠 엔진
PACM 자체 개발 | 외부 API 0% | 순수 Python
철학: 요약이 아닌 교육 - 3000자+ 롱폼 몰입형 콘텐츠
"""
import re, os, json, time, sys, urllib.request
from collections import Counter
from typing import List, Dict, Tuple

VERSION = "7.0.0"

STOPWORDS = {
    "이","그","저","것","수","들","및","등","에서","로서","으로","에게",
    "하지만","그러나","또한","그리고","따라서","때문에","위해","통해","대한",
    "있는","없는","되는","하는","있다","없다","된다","한다","이다","있으며",
    "이번","지난","올해","최근","현재","지금","특히","또","더","가장","매우",
    "기자","특파원","보도","발표","밝혔다","말했다","전했다","합니다","입니다",
}

TERMS = {
    "IPO":("IPO(기업공개)","회사가 처음으로 주식시장에 상장해 일반 투자자들이 주식을 살 수 있게 되는 것. 이를 통해 회사는 수백억~수천억의 자금을 한 번에 조달합니다."),
    "VC":("VC(벤처캐피탈)","스타트업에 전문적으로 투자하는 회사. 은행과 달리 이자 없이 지분(주식)을 받는 대신 투자하고, 나중에 회사가 크면 지분을 팔아 수익을 냅니다."),
    "MVP":("MVP(최소기능제품)","핵심 기능만 갖춘 초기 버전. 완벽한 제품을 만들다 시간·돈 낭비하는 것보다, 빠르게 작은 버전을 출시해 실제 사용자 반응을 보는 것이 훨씬 효율적입니다."),
    "PMF":("PMF(제품-시장 적합성)","내 제품이 시장이 원하는 것과 딱 맞아떨어지는 상태. PMF를 찾으면 마케팅 없이도 사용자가 자연스럽게 늘어납니다."),
    "SaaS":("SaaS(서비스형 소프트웨어)","인터넷으로 소프트웨어를 빌려 쓰는 방식. 넷플릭스처럼 월 구독료를 내고 사용합니다. 기업은 예측 가능한 반복 수익이 생깁니다."),
    "M&A":("M&A(인수합병)","한 회사가 다른 회사를 사거나 합치는 것. 스타트업이 대기업에 인수되면 창업자는 큰돈을 받고, 대기업은 기술·팀을 빠르게 얻습니다."),
    "유니콘":("유니콘 기업","기업 가치 1조 원이 넘는 비상장 스타트업. 유니콘처럼 희귀하다는 뜻. 한국에는 당근마켓, 토스, 야놀자 등이 있습니다."),
    "피봇":("피봇(사업 방향 전환)","사업 방향을 크게 바꾸는 것. 유튜브는 원래 데이팅 사이트였고, 슬랙은 게임 회사였습니다. 피봇이 성공의 시작이 되는 경우가 많습니다."),
    "밸류에이션":("밸류에이션(기업가치평가)","투자자가 이 회사가 얼마짜리인지를 평가하는 것. 보통 ARR의 10~100배로 계산합니다."),
    "MAU":("MAU(월간활성사용자)","한 달에 한 번 이상 서비스를 사용한 사람 수."),
    "시리즈A":("시리즈A 투자","초기 검증 후 받는 본격 성장 자금. 보통 수십억~수백억 규모. PMF를 증명해야 받을 수 있습니다."),
    "시리즈B":("시리즈B 투자","시장 점유율을 늘리고 조직을 키우는 단계. 보통 수백억~수천억 규모."),
    "구독":("구독 경제","제품을 사는 대신 정기적으로 돈을 내고 사용하는 방식. 기업은 예측 가능한 매출, 사용자는 목돈 없이 서비스 이용."),
    "플랫폼":("플랫폼 비즈니스","공급자와 소비자를 연결하는 중개 역할. 사용자가 늘수록 더 많은 사람이 몰리는 네트워크 효과가 작동합니다."),
    "ESG":("ESG","환경(E)·사회(S)·지배구조(G)를 고려하는 경영 방식. 요즘 투자자들은 ESG 점수도 보고 투자를 결정합니다."),
    "BM":("비즈니스 모델(BM)","어떻게 돈을 버는가를 설계한 것. 같은 서비스도 어떤 BM을 쓰느냐에 따라 수익성이 완전히 달라집니다."),
    "엑싯":("엑싯(Exit)","창업자가 회사를 팔거나 상장시켜 수익을 실현하는 것. IPO와 M&A가 대표적인 엑싯 방법입니다."),
    "B2B":("B2B(기업 간 거래)","기업이 기업에게 파는 사업 모델. 고객 수는 적지만 거래 금액이 크고 안정적입니다."),
    "B2C":("B2C(기업-소비자 거래)","기업이 일반 소비자에게 직접 파는 사업 모델. 배달의민족, 쿠팡이 대표적입니다."),
    "네트워크 효과":("네트워크 효과","사용자가 많아질수록 서비스 가치가 높아지는 현상. 카카오톡이 좋은 예입니다."),
    "린스타트업":("린스타트업","낭비를 최소화하고 빠르게 실험하는 창업 방식. 만들기→측정→학습을 반복합니다."),
    "LLM":("LLM(대형언어모델)","ChatGPT, Claude 같은 대화형 AI의 기반 기술."),
}

EVENT_KW = {
    "funding":["시리즈A","시리즈B","시리즈C","시리즈D","프리시리즈","투자유치","펀딩","억원","조원","라운드","시드","IR","벤처캐피탈","후속투자","누적투자","엔젤투자"],
    "policy":["정부","과기부","중기부","창진원","예산","규제","정책","법안","예비창업","패키지","창업지원","보조금","지원금","공모","선발","액셀러레이팅","해커톤"],
    "product":["출시","론칭","선보","공개","베타","버전","업데이트","서비스 시작","오픈","런칭","출범","도입","개시"],
    "acquisition":["인수","합병","M&A","지분","매각","인수합병","지분투자","전략적 투자"],
    "research":["연구","논문","발표","결과","조사","분석","보고서","통계","실험","개발","특허"],
    "person":["대표","CEO","창업자","설립자","인터뷰","스토리","창업기","여정","창업이야기"],
    "market":["시장","성장","규모","트렌드","전망","예측","확대","증가","감소","점유율"],
}

DOMAIN_KW = {
    "investment":["투자","펀딩","시리즈","억원","조원","VC","벤처캐피탈","상장","IPO","엑싯"],
    "tech":["AI","인공지능","딥러닝","반도체","GPU","클라우드","SaaS","알고리즘","LLM","로봇"],
    "youth":["청소년","청년","대학생","고등학생","중학생","창업교육","해커톤","청년창업"],
    "policy":["정부","지원","공모","선발","과기부","중기부","창진원","예산","정책"],
    "startup":["스타트업","창업","유니콘","피봇","글로벌","사업화","엑셀러레이터"],
    "esg":["ESG","탄소중립","친환경","지속가능","임팩트","소셜벤처","기후"],
}

# 이벤트별 심층 개념 설명
DEEP_CONCEPTS = {
    "funding": {
        "title": "💡 투자와 지분의 세계: 창업가가 반드시 알아야 할 것",
        "body": """투자란 단순히 돈을 빌리는 게 아닙니다. 투자자는 돈 대신 **지분(주식)**을 받습니다. 회사의 주식 10%를 준다면, 투자자는 이 회사의 주인 중 한 명이 됩니다.

**왜 대출이 아닌 투자를 받을까요?**
스타트업은 담보가 없고, 망할 위험도 큽니다. 은행은 이런 회사에 돈을 빌려주지 않습니다. 그래서 '실패해도 갚을 필요 없지만, 성공하면 이익을 나누자'는 방식으로 투자가 이루어집니다.

**투자 단계별 이해:**

→ **시드(Seed):** 아이디어 단계. "이 문제가 실제로 존재하는가?" 증명. 보통 1억~5억 규모
→ **시리즈A:** 초기 검증 완료. "이 방법이 효과가 있는가?" 증명. 10억~100억 규모
→ **시리즈B:** 성장 단계. "얼마나 빠르게 키울 수 있는가?" 증명. 100억~500억 규모
→ **시리즈C 이후:** 글로벌 확장 또는 IPO 준비. 수천억 규모

**투자자가 보는 것:**
좋은 아이디어보다 좋은 팀을 봅니다. 시장이 충분히 큰가를 봅니다. 지금 이 타이밍이 맞는가를 봅니다. 아이디어는 1%, 실행은 99%라는 말이 있습니다. 투자자는 실행할 팀에 투자합니다.

**밸류에이션(기업가치평가) 계산:**
투자자가 10억을 투자해 10% 지분을 가져간다면, 이 회사의 기업가치(밸류에이션)는 100억입니다. 밸류에이션이 높을수록 적은 지분을 주고 더 많은 투자금을 받습니다.

투자를 받는다는 것은 단순히 돈을 받는 게 아닙니다. 투자자의 네트워크, 경험, 조언도 함께 옵니다. 좋은 투자자 한 명이 회사의 운명을 바꿀 수 있습니다.""",
        "question": "만약 내가 스타트업을 창업한다면, 시드 투자를 받기 위해 어떤 것을 증명해야 할까요? 그리고 투자자를 어떻게 설득할 수 있을까요?"
    },
    "policy": {
        "title": "💡 정책을 기회로 읽는 법: 규칙이 바뀌면 게임이 바뀐다",
        "body": """정부 정책은 단순한 규칙이 아닙니다. 정부가 어떤 분야에 돈을 쓰는지는, 국가가 어디에 미래가 있다고 보는지를 보여줍니다.

**정책을 창업 기회로 읽는 3단계:**

→ **방향 읽기:** 이 정책이 어떤 산업을 밀어주는가?
→ **수혜자 찾기:** 이 정책으로 가장 이익을 보는 사람은 누구인가?
→ **공백 찾기:** 이 정책이 해결하지 못한 부분(=창업 기회)은 무엇인가?

**정책과 시장의 관계:**
정부가 AI 교육 예산을 늘리면 → 에듀테크 스타트업에 기회가 생깁니다.
정부가 탄소중립을 강조하면 → 기후테크, 친환경 스타트업이 뜹니다.
정부가 청년 창업을 지원하면 → 액셀러레이터, 창업 교육 시장이 성장합니다.

**청소년이 받을 수 있는 정부 지원:**
K-startup.go.kr에서 '청년', '청소년', '대학생' 키워드로 검색해보세요. 아이디어만 있어도 지원받을 수 있는 프로그램이 생각보다 많습니다.

• 예비창업패키지: 아이디어 단계에서 최대 1억 지원
• 초기창업패키지: 창업 후 3년 이내, 최대 1억 지원
• 청년창업사관학교: 교육 + 공간 + 멘토링 + 자금 패키지
• 지역 창업진흥원: 각 시도별 별도 지원 프로그램

**타이밍이 전부입니다:**
정책의 효과는 출시 직후보다 1~3년 후에 나타납니다. 지금 이 정책을 보고 '2~3년 후 어떤 시장이 열릴까'를 생각하는 것이 창업가의 안목입니다.""",
        "question": "지금 정부가 가장 집중적으로 지원하는 창업 분야는 무엇이고, 여기서 어떤 창업 아이디어를 발견할 수 있을까요?"
    },
    "product": {
        "title": "💡 제품 출시의 진짜 의미: 출시는 시작이지 끝이 아니다",
        "body": """좋은 제품이 반드시 성공하지는 않습니다. 성공한 제품은 반드시 '올바른 타이밍'에 나옵니다.

**제품 성공의 세 가지 조건:**

→ **문제:** 실제로 많은 사람들이 겪고 있는 불편함인가?
→ **해결책:** 기존 방법보다 10배 더 좋거나, 10배 더 저렴한가?
→ **타이밍:** 지금 이 시장이 이 제품을 받아들일 준비가 되었는가?

**MVP(최소기능제품)의 철학:**
완벽한 제품을 기다리다가 시장 타이밍을 놓치는 것보다, 완성도 70%짜리 제품을 빨리 내놓고 사용자 반응을 보며 개선하는 것이 훨씬 현명합니다. 페이스북도 처음에는 하버드 학생들만 쓸 수 있는 허술한 사이트였습니다.

**출시 후가 더 중요합니다:**
출시 첫 날의 관심보다, 출시 후 6개월의 사용자 리텐션(재방문율)이 더 중요합니다. 사람들이 한 번 쓰고 돌아오는가? 이것이 제품의 진짜 가치를 보여줍니다.

**경쟁자 분석:**
새로운 제품이 나오면 경쟁자들이 긴장합니다. 하지만 경쟁자의 존재는 나쁜 게 아닙니다. 경쟁자가 있다는 것은 시장이 존재한다는 뜻입니다. 중요한 것은 내 제품만의 차별화 포인트를 명확히 하는 것입니다.

**사용자 피드백 루프:**
출시 → 사용자 반응 관찰 → 문제 파악 → 빠른 개선 → 재출시. 이 사이클을 얼마나 빠르게 돌리느냐가 스타트업의 경쟁력입니다.""",
        "question": "내가 만들고 싶은 제품이 있다면, MVP는 어떤 형태일까요? 어떤 기능 하나만 남긴다면 무엇을 남길 것인가요?"
    },
    "acquisition": {
        "title": "💡 인수합병을 해석하는 법: 적인가, 기회인가",
        "body": """스타트업이 대기업에 인수된다는 소식을 들으면 어떤 생각이 드나요? '실패해서 팔린 건가?' 아닙니다. 인수는 스타트업의 성공 경로 중 하나입니다.

**대기업이 스타트업을 인수하는 세 가지 이유:**

→ **기술 확보:** 자체 개발보다 스타트업을 사는 게 빠르고 저렴할 때
→ **인재 확보:** 뛰어난 팀을 통째로 가져오는 "어콰이하이어(Acqui-hire)"
→ **시장 점유율:** 경쟁자를 제거하거나, 새로운 시장을 빠르게 차지할 때

**인수 후 어떻게 될까요?**
인스타그램은 페이스북에 1조 원에 인수된 후에도 오랫동안 독립 브랜드로 운영됐습니다. 유튜브는 구글에 인수된 후 더 크게 성장했습니다. 반면 소리 없이 사라진 경우도 많습니다. 인수 후의 스토리는 케이스마다 다릅니다.

**창업을 처음부터 인수를 목표로 설계할 수 있습니다:**
어떤 대기업이 이 기술을 필요로 할까? 를 미리 생각하고 창업하면, 더 빠른 엑싯 경로를 만들 수 있습니다. 삼성, 카카오, 네이버, 현대차... 이들이 앞으로 5년 안에 가장 필요로 할 기술은 무엇일까요?

**M&A 시장의 흐름:**
AI 기술 기업들의 인수가 급증하고 있습니다. 대기업들이 AI 스타트업을 사들이며 경쟁적으로 AI 역량을 강화하고 있습니다. 이 흐름은 앞으로도 지속될 것입니다.""",
        "question": "지금 대기업들이 가장 필요로 하는 기술이나 서비스는 무엇일까요? 그것을 스타트업으로 만든다면 어떤 형태가 될까요?"
    },
    "market": {
        "title": "💡 시장을 읽는 눈: 숫자 뒤에 있는 진짜 이야기",
        "body": """시장을 읽는다는 것은 단순히 숫자를 보는 게 아닙니다. 사람들의 행동 변화, 기술의 진화, 사회의 변화를 연결해서 읽는 것입니다.

**시장 분석의 세 가지 레이어:**

→ **TAM(총 시장 규모):** 이 제품을 이론적으로 모든 사람이 산다면 얼마?
→ **SAM(서비스 가능한 시장):** 실제로 내가 공략할 수 있는 시장은?
→ **SOM(현실적 점유 가능 시장):** 처음 1~2년 안에 차지할 수 있는 규모는?

**성장하는 시장의 세 가지 신호:**
• 문제가 점점 커지고 있다 (예: 고령화 → 헬스케어 시장 성장)
• 기존 해결책이 불편하거나 너무 비싸다
• 기술 변화가 새로운 해결책을 가능하게 한다

**작은 시장에서 시작하는 전략:**
모든 사람이 주목하는 큰 시장보다, 아직 아무도 보지 않는 작은 시장에서 시작해 점점 영역을 넓히는 것이 좋습니다. 아마존도 처음에는 책만 팔았고, 넷플릭스는 DVD 배달로 시작했습니다.

**트렌드를 읽는 법:**
인구 변화, 기술 변화, 규제 변화, 소비자 인식 변화. 이 네 가지 변수가 교차하는 지점에서 새로운 시장이 열립니다. 오늘 이 뉴스가 이 네 가지 중 어떤 변화와 연결되는지 생각해보세요.""",
        "question": "5년 후 한국에서 가장 크게 성장할 시장은 어디라고 생각하나요? 그 근거는 무엇인가요?"
    },
    "general": {
        "title": "💡 비즈니스 뉴스를 읽는 진짜 방법",
        "body": """비즈니스 뉴스는 단순한 정보가 아닙니다. 시장이 어디로 움직이는지, 어떤 문제가 해결되고 있는지, 그리고 다음에 어떤 기회가 올지를 보여주는 나침반입니다.

**뉴스를 읽는 세 가지 핵심 질문:**

→ **누가 이익을 얻는가?** 이 사건으로 가장 이득을 보는 사람, 기업, 산업은?
→ **누가 손해를 보는가?** 어떤 기존 플레이어가 위협받는가?
→ **어떤 새로운 기회가 생기는가?** 이 변화가 만드는 새로운 시장은?

**맥락을 연결하는 습관:**
뉴스 하나를 읽고 끝내지 마세요. 이 뉴스와 관련된 다른 뉴스들을 찾아보세요. 점들이 선으로 연결될 때, 비로소 트렌드가 보입니다. 오늘 이 뉴스가 6개월 전 어떤 뉴스와 연결되는지, 6개월 후 어떤 뉴스로 이어질지 생각해보세요.

**창업가의 뉴스 읽기:**
일반인은 뉴스에서 '무슨 일이 일어났는가'를 봅니다. 창업가는 '이 변화에서 어떤 문제가 해결되지 않고 남아있는가'를 봅니다. 해결되지 않은 문제가 바로 창업 기회입니다.

**매일 10분의 힘:**
매일 비즈니스 뉴스를 10분씩 이런 방식으로 읽으면, 6개월 후에는 시장을 보는 눈이 완전히 달라집니다. 처음에는 어렵지만, 습관이 되면 자연스럽게 기회가 보이기 시작합니다.""",
        "question": "오늘 읽은 이 뉴스와 연결되는 다른 산업이나 트렌드를 3가지 생각해볼 수 있나요? 이 뉴스에서 아직 해결되지 않은 문제는 무엇인가요?"
    },
}

YOUTH_ACTIONS = {
    "funding": """**이 투자 뉴스에서 배울 것:**

• 투자를 받은 이 회사가 해결하는 문제는 정확히 무엇인가요?
• 투자자들이 이 회사를 선택한 이유는 무엇일까요?
• 이 회사의 비즈니스 모델(돈을 버는 방식)은 어떻게 생겼나요?

**직접 해보기:**
이 회사의 서비스를 직접 써보세요(무료 체험이 있다면). 서비스를 쓰면서 '내가 이 회사의 경쟁자라면 어떤 부분을 더 잘할 수 있을까?'를 생각해보세요.

**투자 단계별 창업 준비:**
시드 투자를 받으려면 → 문제를 정의하고, 왜 지금 내가 이 문제를 해결할 수 있는지 설명할 수 있어야 합니다. 완벽한 제품이 없어도 됩니다. 명확한 문제 정의와 팀의 역량이 중요합니다.

**참고할 곳:** 스타트업 얼라이언스(startupalliance.kr), 뱅크오브자금(BOQ) 투자 뉴스, 플래텀(platum.kr)에서 한국 스타트업 투자 동향을 꾸준히 보세요.""",

    "policy": """**이 정책에서 기회 찾기:**

지금 당장 K-startup.go.kr에 접속해서 현재 모집 중인 지원 프로그램을 확인해보세요. 생각보다 청소년·청년을 위한 프로그램이 많습니다.

**지원 전략:**
• 아직 창업 아이디어가 없어도 됩니다. 교육 프로그램부터 시작하세요
• 창업 경진대회 참가 → 상금 + 멘토링 + 네트워크를 한 번에 얻을 수 있습니다
• 지역 창업진흥원에는 학생도 이용할 수 있는 공간과 멘토링이 있습니다

**정책을 3년 단위로 읽기:**
오늘 발표된 정책이 3년 후 어떤 시장을 만들어낼지 예측해보세요. 그 시장에서 필요한 서비스를 지금부터 준비하는 것이 가장 좋은 창업 전략입니다.

**참고할 곳:** K-startup(k-startup.go.kr), 창업진흥원 공식 블로그, 중소벤처기업부 보도자료""",

    "product": """**출시된 제품을 해부하는 법:**

• 이 제품이 해결하는 핵심 문제는 무엇인가요?
• 누가 이 제품을 가장 필요로 하나요? (타겟 고객)
• 기존 대안 대비 어떤 점이 더 나은가요?
• 이 제품의 약점은 무엇인가요? (여기서 다음 창업 기회가 보입니다)

**경쟁자 분석의 힘:**
훌륭한 창업가는 경쟁자를 두려워하지 않습니다. 오히려 경쟁자의 약점을 찾아 그 틈에 들어갑니다. 이 제품의 사용자 리뷰를 읽어보세요. 가장 자주 나오는 불만 사항이 바로 창업 아이디어의 씨앗입니다.

**직접 해보기:**
이 서비스의 앱스토어 리뷰를 100개 읽어보세요. 사용자들이 무엇을 원하는지, 어디서 불편해하는지 패턴이 보입니다. 이것이 실제 시장 리서치입니다.""",

    "general": """**뉴스를 창업 기회로 바꾸는 3단계:**

**Step 1 - 문제 발견:**
이 뉴스에서 아직 해결되지 않은 문제는 무엇인가요? 뉴스가 다루는 현상의 '불편한 부분'을 찾아보세요.

**Step 2 - 사용자 정의:**
그 문제를 가장 심하게 겪는 사람은 누구인가요? 나이, 직업, 상황을 구체적으로 그려보세요.

**Step 3 - 해결책 스케치:**
그 사람들을 위한 해결책이 있다면 어떤 형태일까요? 앱? 커뮤니티? 교육 콘텐츠? 오프라인 서비스?

**지금 당장 할 수 있는 것:**
주변 친구, 가족 5명에게 "요즘 가장 불편한 것이 무엇인가요?"를 물어보세요. 그 대답들을 모아보면, 진짜 시장 조사가 됩니다.""",
}

MARKET_CONTEXT = {
    "investment": "지금 전 세계 VC들은 AI, 기후테크, 바이오테크에 집중적으로 투자하고 있습니다. 금리 인상 이후 투자가 선별적으로 이루어지고 있어, '실질적인 수익 모델'이 있는 스타트업이 주목받습니다.",
    "tech": "AI 기술은 지금 가장 빠르게 변화하는 분야입니다. 6개월 전의 '최신 AI'가 지금은 구식이 될 만큼 빠릅니다. 하지만 기술 자체보다 '어떤 문제에 이 기술을 연결하느냐'가 진짜 경쟁력입니다.",
    "youth": "청소년 창업 생태계는 점점 성숙해지고 있습니다. 정부 지원 프로그램도 늘고, 선배 창업자들의 멘토링도 활성화되고 있습니다. 이제 10대 창업가도 특별한 게 아닙니다.",
    "policy": "정부의 창업 지원 예산은 매년 증가하고 있습니다. 잘 찾으면 창업 초기에 실질적인 도움이 되는 지원을 받을 수 있습니다. 정책은 시장의 방향표입니다.",
    "startup": "한국 스타트업 생태계는 양적으로 크게 성장했습니다. 이제는 양보다 질의 시대, 실질적인 문제를 해결하고 지속 가능한 수익 모델을 가진 스타트업이 살아남습니다.",
    "esg": "ESG는 더 이상 대기업만의 이야기가 아닙니다. 소비자들이 기업의 가치관을 보고 구매 결정을 내리는 시대, 스타트업도 처음부터 ESG를 사업 설계에 반영해야 합니다.",
}


def clean(text: str) -> str:
    if not text: return ''
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'&[a-zA-Z#0-9]+;', ' ', text)
    text = re.sub(r'\s{2,}', ' ', text)
    return text.strip()

def sent_split(text: str) -> List[str]:
    text = clean(text)
    parts = re.split(r'(?<=[.!?다。])\s+', text)
    return [s.strip() for s in parts if len(s.strip()) > 12]

def top_keywords(text: str, n: int = 20) -> List[str]:
    words = re.findall(r'[가-힣]{2,}', text)
    cnt = Counter(w for w in words if w not in STOPWORDS)
    return [w for w, _ in cnt.most_common(n)]

def extract_numbers(text: str) -> List[str]:
    patterns = [
        r'\d+[\.,]?\d*\s*조\s*\d*\s*억?\s*원',
        r'\d+[\.,]?\d*\s*억\s*원',
        r'\d+[\.,]?\d*\s*만\s*원',
        r'\d+[\.,]?\d*\s*달러',
        r'\d+[\.,]?\d*\s*%',
        r'\d+[\.,]?\d*\s*배',
        r'\d+[\.,]?\d*\s*명',
    ]
    nums = []
    for p in patterns:
        nums += re.findall(p, text)
    return list(dict.fromkeys(nums))[:6]

def detect_event(text: str) -> str:
    scores = {}
    for ev, kws in EVENT_KW.items():
        scores[ev] = sum(text.count(k) for k in kws)
    order = ["funding","acquisition","policy","product","person","research","market"]
    for ev in order:
        if scores.get(ev, 0) > 0:
            return ev
    return "general"

def detect_domain(text: str) -> str:
    scores = {d: sum(text.count(k) for k in kws) for d, kws in DOMAIN_KW.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "startup"

def find_terms(text: str) -> List[Tuple]:
    found = []
    for key, (name, desc) in TERMS.items():
        if key in text:
            found.append((key, name, desc))
    return found[:5]

def best_sents(sents: List[str], keywords: List[str], n: int) -> List[str]:
    def score(s):
        kw_hit = sum(1 for k in keywords if k in s)
        has_num = 1.3 if re.search(r'\d', s) else 1.0
        noise = 0.2 if any(w in s for w in ["기자","무단전재","저작권","구독"]) else 1.0
        length = min(len(s) / 60, 2.0)
        return kw_hit * has_num * noise * length
    scored = sorted([(s, score(s)) for s in sents if len(s) > 15], key=lambda x: -x[1])
    seen, result = set(), []
    for s, _ in scored:
        k = s[:25]
        if k not in seen:
            seen.add(k)
            result.append(s)
        if len(result) >= n:
            break
    return result


def generate(title: str, body: str) -> str:
    full = f"{title} {body}"
    cleaned = clean(full)
    sents = sent_split(cleaned)
    keywords = top_keywords(cleaned, 25)
    nums = extract_numbers(cleaned)
    event = detect_event(cleaned)
    domain = detect_domain(cleaned)
    terms = find_terms(cleaned)

    parts = []

    # ── 이벤트/도메인 레이블
    ev_labels = {
        "funding":"💰 투자 유치","policy":"🏛️ 정책·지원",
        "product":"🚀 제품·서비스 출시","acquisition":"🤝 인수·합병",
        "research":"🔬 연구·기술","person":"👤 창업가 스토리",
        "market":"📊 시장·트렌드","general":"📰 비즈니스 뉴스",
    }
    dm_labels = {
        "investment":"투자·금융","tech":"기술·AI","youth":"청소년·교육",
        "policy":"정책","startup":"스타트업","esg":"ESG·임팩트",
    }
    parts.append(f"{ev_labels.get(event,'📰 뉴스')} · {dm_labels.get(domain,'창업')}")
    parts.append("")
    parts.append("---")
    parts.append("")

    # ── SECTION 1: HOOK
    hooks = {
        "funding": f"{'  '.join(nums[:2]) + '.' if nums else '투자자들이 지갑을 열었습니다.'}\n\n투자 유치 뉴스는 단순한 자금 조달 소식이 아닙니다. '이 팀, 이 아이디어, 이 시장을 우리가 믿는다'는 투자자의 공개 선언입니다. 투자자들은 수많은 스타트업 중 왜 이 회사를 골랐을까요?",
        "policy": "정부가 움직였습니다.\n\n정책은 규칙입니다. 그런데 창업가에게 규칙은 제약이 될 수도 있고, 누군가에게는 엄청난 기회가 됩니다. 이 정책이 어떤 새로운 게임을 만들어낼지, 함께 읽어봅시다.",
        "product": "새로운 것이 나왔습니다.\n\n출시 뒤에는 수개월, 때로는 수년간의 개발과 결정의 역사가 있습니다. 이 제품이 세상에 나오기까지 어떤 문제를 해결하려 했고, 지금 시장에 어떤 파장을 일으킬지 살펴봅시다.",
        "acquisition": "한 회사가 다른 회사를 샀습니다.\n\n인수합병은 끝이 아닙니다. 두 회사가 하나가 되는 순간, 시장의 판이 새로 짜입니다. 왜 지금, 왜 이 두 회사가 만났는지, 그 이후 어떤 세계가 펼쳐질지 생각해봅시다.",
        "market": "숫자 뒤에 더 큰 이야기가 있습니다.\n\n시장의 변화는 항상 신호가 먼저 옵니다. 오늘 이 뉴스도 이미 몇 달, 몇 년 전부터 형성되어 온 트렌드의 결과입니다. 이 변화가 어디서 왔고, 어디로 가는지 함께 추적해봅시다.",
        "general": "이 뉴스 뒤에 더 큰 이야기가 있습니다.\n\n비즈니스 세계에서 아무것도 우연히 일어나지 않습니다. 한 회사의 결정, 한 시장의 변화가 연결되고 연결되어 새로운 기회를 만들어냅니다. 이 연결 고리를 함께 추적해봅시다.",
    }
    parts.append(hooks.get(event, hooks["general"]))
    parts.append("")
    parts.append("---")
    parts.append("")

    # ── SECTION 2: 핵심 사실과 스토리
    parts.append("**무슨 일이 일어났나요?**")
    parts.append("")

    key_sents = best_sents(sents, keywords, 6)
    if key_sents:
        for s in key_sents[:5]:
            parts.append(s)
            parts.append("")
    else:
        # body가 없을 경우 title 기반 확장
        parts.append(f"{title}.")
        parts.append("")
        parts.append("이 뉴스의 자세한 내용은 원문 링크를 통해 확인해보세요.")
        parts.append("")

    if nums:
        parts.append("**주목할 숫자:**")
        parts.append("")
        for num in nums[:4]:
            parts.append(f"• {num}")
        parts.append("")

    # 미래 계획 문장
    plan_sents = [s for s in sents if any(k in s for k in ["계획","목표","예정","전망","추진","확대","글로벌","출시"])]
    if plan_sents:
        parts.append("**앞으로 어떻게 될까요:**")
        parts.append("")
        for s in plan_sents[:2]:
            parts.append(s)
        parts.append("")

    parts.append("---")
    parts.append("")

    # ── SECTION 3: 맥락과 배경
    parts.append("**왜 지금 이 뉴스가 나왔을까요?**")
    parts.append("")
    context_map = {
        "funding": "모든 투자에는 타이밍이 있습니다. 투자자들은 수백 개의 스타트업을 만나고, 그 중 극소수에만 투자합니다. 이 투자가 이루어졌다는 것은, 이 팀과 이 시장에서 명확한 성장 가능성을 봤다는 뜻입니다.\n\n한국 스타트업 투자 생태계는 2010년대부터 급성장했습니다. 카카오, 배달의민족, 토스 같은 성공 사례들이 '한국에서도 글로벌 스타트업이 나올 수 있다'는 믿음을 만들었습니다. 지금 투자자들은 그 다음 주자를 찾고 있습니다.\n\n투자 환경은 금리와 깊이 연결됩니다. 금리가 높으면 투자자들은 보수적으로 움직이고, 검증된 수익 모델이 있는 스타트업을 선호합니다. 반면 금리가 낮으면 더 과감하게 미래에 베팅합니다.",
        "policy": "정부 정책은 갑자기 나오지 않습니다. 수개월, 때로는 수년간의 연구·논의·협의 끝에 나옵니다. 이 정책이 지금 나온 배경에는 해결하려는 구체적인 문제가 있습니다.\n\n정책의 효과는 발표 직후보다 1~3년 후에 나타납니다. 지금 이 정책을 보고 '2~3년 후 어떤 시장이 열릴까'를 생각하는 것이 창업가의 안목입니다. 규제는 새로운 규칙을 만들고, 새로운 규칙은 새로운 게임을 만들며, 새로운 게임은 새로운 승자를 만듭니다.",
        "product": "새로운 제품이 나오기까지의 여정은 출시일보다 훨씬 깁니다. 아이디어 → 검증 → 개발 → 테스트 → 출시... 이 과정에서 수많은 결정이 이루어집니다.\n\n시장에 제품을 출시하는 타이밍은 매우 중요합니다. 너무 이르면 시장이 준비되지 않았고, 너무 늦으면 경쟁자가 이미 시장을 차지했습니다. 성공한 스타트업은 이 타이밍을 정확히 잡습니다. 오늘 이 출시가 왜 지금인지를 생각해보세요.",
        "acquisition": "인수합병은 오랜 협상의 결과입니다. 인수자는 보통 수개월에 걸쳐 실사(Due Diligence)를 진행하고, 가격을 협상하고, 법적 절차를 밟습니다. 오늘 발표된 소식은 이미 몇 달 전부터 준비된 것입니다.\n\n대기업이 스타트업을 인수하는 이유는 크게 세 가지입니다. 기술 확보, 인재 확보, 시장 점유율 확보. 이번 인수는 어떤 이유에서 가장 가까울까요?",
        "market": "시장의 변화는 항상 신호가 먼저 옵니다. 오늘 이 뉴스도 이미 몇 달, 몇 년 전부터 형성되어 온 트렌드의 결과입니다. 한 번의 큰 변화 뒤에는 항상 수많은 작은 변화들이 쌓여 있습니다.\n\n시장 변화를 읽는 가장 좋은 방법은 '이 변화로 가장 이익을 보는 사람은 누구인가'를 추적하는 것입니다. 돈이 흐르는 방향이 시장의 방향입니다.",
        "general": "모든 비즈니스 뉴스는 더 큰 경제적 흐름의 일부입니다. 한 회사의 결정이 시장 전체에 영향을 미치고, 그것이 다시 개별 창업자의 기회를 만듭니다.\n\n이 뉴스가 어떤 더 큰 트렌드의 일부인지 생각해보세요. 고립된 사건은 없습니다. 모든 사건은 연결되어 있습니다.",
    }
    parts.append(context_map.get(event, context_map["general"]))
    parts.append("")

    # 도메인별 추가 맥락
    if domain in MARKET_CONTEXT:
        parts.append("")
        parts.append(MARKET_CONTEXT[domain])
        parts.append("")

    parts.append("---")
    parts.append("")

    # ── SECTION 4: 시장 분석
    parts.append("**📈 시장 흐름 읽기**")
    parts.append("")
    market_map = {
        "funding": f"이번 투자는 {'·'.join(keywords[:3]) if keywords else '이 분야'} 시장이 투자자들의 관심을 받고 있다는 신호입니다. 투자금이 몰린다는 것은 이 시장에서 큰 기회가 있다고 많은 사람이 판단한다는 뜻입니다.\n\n지금 전 세계적으로 AI, 기후테크, 헬스케어, 에듀테크는 투자가 집중되는 분야입니다. 이 흐름은 5~10년간 지속될 가능성이 높습니다. 이 회사가 이 중 어느 분야와 연결되는지 생각해보세요.\n\n투자자들은 미래를 사는 사람들입니다. 이 투자가 어떤 미래를 베팅하는 것인지, 그 미래가 어떤 모습일지 상상해보세요.",
        "policy": "정부가 어떤 분야에 돈을 쓰는가 = 국가가 어디에 미래가 있다고 보는가. 이 정책이 집중하는 분야에서 창업 아이디어를 탐색하면, 지원도 받고 시장 수요도 검증된 아이템을 찾을 확률이 높아집니다.\n\n정책과 시장은 서로를 강화합니다. 정책이 특정 산업을 지원하면, 그 산업이 성장하고, 그 성장이 더 많은 정책을 이끌어냅니다. 이 선순환의 초입에 있는 분야를 찾는 것이 창업가의 기회입니다.",
        "product": "새로운 제품의 출시는 시장 지형을 바꿉니다. 이 제품이 해결하는 문제가 크면 클수록, 기존 플레이어들은 더 큰 위협을 받습니다.\n\n한편으로는 이 제품 주변에 새로운 생태계가 만들어지며, 그 안에서 또 다른 창업 기회가 생깁니다. 큰 플랫폼 주변에 작은 스타트업들이 생태계를 이루는 것처럼요.",
        "acquisition": "인수합병은 시장 통합의 신호입니다. 작은 플레이어들이 큰 플레이어에게 흡수되면서 시장이 재편됩니다.\n\n이런 시기에는 아직 통합되지 않은 틈새(니치) 시장에 기회가 생깁니다. 대기업이 집중하는 영역 주변의 작은 문제들을 해결하는 스타트업이 다음 인수 후보가 되기도 합니다.",
        "market": "시장 변화의 속도가 빨라질수록, 변화를 빨리 감지하고 적응하는 팀이 이깁니다. 대기업은 크기 때문에 느립니다. 스타트업의 속도와 유연성이 진짜 경쟁력입니다.\n\n이 시장의 변화가 앞으로 어떻게 전개될지, 어떤 플레이어가 이 변화를 활용할 수 있을지 생각해보세요.",
        "general": "모든 비즈니스 변화는 연결되어 있습니다. 이 뉴스가 어떤 다른 산업과 연결되는지 생각해보세요. 점들이 선으로 연결될 때, 트렌드가 보입니다.\n\n창업가는 트렌드를 따라가는 사람이 아닙니다. 트렌드가 되기 전에 그것을 먼저 보는 사람입니다.",
    }
    parts.append(market_map.get(event, market_map["general"]))
    parts.append("")
    parts.append("---")
    parts.append("")

    # ── SECTION 5: 용어 설명
    if terms:
        parts.append("**📚 이 뉴스의 핵심 용어 해설**")
        parts.append("")
        for key, name, desc in terms[:4]:
            parts.append(f"**{name}**")
            parts.append(desc)
            parts.append("")
        parts.append("---")
        parts.append("")

    # ── SECTION 6: 심층 개념 (핵심!)
    concept_key = event if event in DEEP_CONCEPTS else "general"
    concept = DEEP_CONCEPTS[concept_key]
    parts.append(concept["title"])
    parts.append("")
    parts.append(concept["body"])
    parts.append("")
    parts.append("---")
    parts.append("")

    # ── SECTION 7: 청소년 창업가 관점
    parts.append("**🚀 창업가 관점으로 읽기**")
    parts.append("")
    parts.append(YOUTH_ACTIONS.get(event, YOUTH_ACTIONS["general"]))
    parts.append("")
    parts.append("---")
    parts.append("")

    # ── SECTION 8: 클로징
    closings = {
        "funding": "투자는 미래에 대한 베팅입니다. 그리고 그 베팅은 누군가의 문제를 발견하고, 해결책을 만들어낸 사람에게 돌아옵니다.",
        "policy": "기회는 준비된 사람에게 옵니다. 오늘 읽은 이 정책이 여러분의 기회가 될 수도 있습니다.",
        "product": "시장에서 살아남는 제품은 가장 완벽한 제품이 아닙니다. 가장 빠르게 배우는 팀이 만든 제품입니다.",
        "acquisition": "M&A는 끝이 아닙니다. 어떤 조합이 어떤 새로운 가능성을 만드는지, 그것이 진짜 이야기입니다.",
        "market": "시장의 변화는 항상 새로운 기회를 만듭니다. 그 기회를 먼저 보는 것이 창업가의 역할입니다.",
        "general": "세상은 문제로 가득합니다. 그리고 그 문제 하나하나가 창업의 씨앗입니다.",
    }
    parts.append(f"*{closings.get(event, closings['general'])}*")
    parts.append("")
    parts.append(f"**💭 생각해볼 질문:**")
    parts.append(concept["question"])
    parts.append("")

    # ── 메타
    parts.append(f"*ai: insightship-v7 · domain: {domain} · event: {event}*")

    result = '\n'.join(parts)
    char_count = len(result)
    result += f"\n\n[길이: {char_count}자]"
    return result


# ── Supabase 연동
def get_cfg():
    return {
        "url": os.environ.get("SUPABASE_URL",""),
        "key": os.environ.get("SUPABASE_SERVICE_KEY", os.environ.get("SUPABASE_ANON_KEY","")),
    }

def fetch_articles(limit=300, days=7):
    cfg = get_cfg()
    if not cfg["url"] or not cfg["key"]:
        print("⚠️  Supabase 환경변수 없음")
        return []
    cutoff = time.strftime("%Y-%m-%dT00:00:00", time.gmtime(time.time() - days*86400))
    url = (f"{cfg['url']}/rest/v1/articles"
           f"?select=id,title,body,excerpt,ai_summary,published_at"
           f"&status=eq.published&published_at=gte.{cutoff}"
           f"&order=published_at.desc&limit={limit}")
    req = urllib.request.Request(url, headers={"apikey":cfg["key"],"Authorization":f"Bearer {cfg['key']}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"fetch 오류: {e}")
        return []

def update_summary(article_id, summary, domain):
    cfg = get_cfg()
    url = f"{cfg['url']}/rest/v1/articles?id=eq.{article_id}"
    data = json.dumps({
        "ai_summary": summary,
        "ai_category": domain,
        "ai_processed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }).encode()
    req = urllib.request.Request(url, data=data, headers={
        "apikey":cfg["key"],"Authorization":f"Bearer {cfg['key']}",
        "Content-Type":"application/json","Prefer":"return=minimal",
    }, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except Exception as e:
        print(f"  update 오류: {e}")
        return 0

# ── 데모
DEMO = [
    {"title":"뤼튼테크놀로지스, 시리즈B 500억 원 투자 유치… 누적 800억",
     "body":"AI 창작 도구 스타트업 뤼튼테크놀로지스가 시리즈B 라운드에서 500억 원을 유치했다. 알토스벤처스, 소프트뱅크벤처스가 주도했으며 기존 투자자들도 후속 투자에 참여했다. 이번 자금으로 글로벌 시장 진출과 기업용(B2B) 솔루션 개발에 집중할 계획이다. 이세영 대표는 아시아 전체를 겨냥한 AI 생산성 플랫폼이 목표라고 밝혔다. 현재 MAU 400만 명을 돌파했으며 MRR은 전년 대비 3배 성장했다."},
    {"title":"중소벤처기업부, 예비창업패키지 1000명 선발… 1인당 최대 1억 지원",
     "body":"중소벤처기업부는 2026년 예비창업패키지 사업을 통해 1000명을 선발한다고 밝혔다. 선발자에게는 최대 1억 원의 사업화 자금과 전담 멘토링, 창업 공간 지원이 제공된다. 특히 올해는 청소년 창업자(만 15~19세) 별도 트랙을 신설해 100명을 추가 선발할 예정이다. K-startup 홈페이지에서 4월 30일까지 접수 가능하다."},
]

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "demo"

    if mode == "demo":
        for a in DEMO:
            print("=" * 70)
            print(f"**{a['title']}**\n")
            result = generate(a['title'], a['body'])
            print(result)
            print()

    elif mode == "process":
        print(f"=== Insightship AI v{VERSION} 처리 시작 ===")
        articles = fetch_articles(limit=500, days=7)
        processed = 0
        for a in articles:
            title = a.get("title","")
            body = a.get("body","") or a.get("excerpt","") or ""
            if not title: continue
            if "insightship-v7" in (a.get("ai_summary") or ""): continue
            summary = generate(title, body)
            domain = detect_domain(f"{title} {body}")
            status = update_summary(a["id"], summary, domain)
            if status in (200,204):
                processed += 1
                print(f"  ✓ [{processed}] {title[:50]}")
            else:
                print(f"  ✗ {title[:40]} (status={status})")
            time.sleep(0.3)
        print(f"=== 처리 완료: {processed}개 ===")

    elif mode == "reprocess":
        print(f"=== Insightship AI v{VERSION} 전체 재처리 ===")
        articles = fetch_articles(limit=1000, days=30)
        processed = 0
        for a in articles:
            title = a.get("title","")
            body = a.get("body","") or a.get("excerpt","") or ""
            if not title: continue
            summary = generate(title, body)
            domain = detect_domain(f"{title} {body}")
            status = update_summary(a["id"], summary, domain)
            if status in (200,204):
                processed += 1
                if processed % 10 == 0:
                    print(f"  진행: {processed}개")
            time.sleep(0.2)
        print(f"=== 재처리 완료: {processed}개 ===")
