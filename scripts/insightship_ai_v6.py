"""
Insightship AI v6.0 — 롱폼 스토리텔링 인사이트 엔진
PACM 자체 개발 | 외부 API: 0% | 순수 Python

특징:
  - Longblack 스타일: 길고 몰입감 있는 이야기체 요약
  - 청소년이 웹툰·전자책 읽듯 천천히 음미하며 읽는 형식
  - 본문 내용 기반 + 경제·창업 개념 자연스럽게 녹여냄
  - 단순 문장 복사 없음 — 모두 새로운 문장으로 재구성
  - 기사마다 다른 도입부·구성·마무리
"""

import re, math, os, json, time, sys, urllib.request
from collections import Counter, defaultdict
from typing import List, Dict, Optional, Tuple

VERSION = "6.0.0"
MODEL_PATH = os.path.join(os.path.dirname(__file__), "pacm_ai_model_v6.json")

STOPWORDS = {
    "이","그","저","것","수","들","및","등","에서","로서","으로","에게",
    "하지만","그러나","또한","그리고","따라서","때문에","위해","통해","대한","관련",
    "있는","없는","되는","하는","있다","없다","된다","한다","이다","있으며","되며",
    "이번","지난","올해","작년","이달","오늘","어제","최근","현재","지금",
    "특히","또","더","가장","매우","모두","함께","이미","아직","약","총",
    "전","후","당","각","제","본","해당","이에","이로","이와","이를","이가","이는",
    "기자","특파원","뉴스","보도","발표","밝혔다","말했다","전했다","설명했다","강조했다",
}

# ─── 전문용어 사전 (청소년 눈높이)
TERMS = {
    "IPO":       ("IPO(기업공개)", "회사가 처음으로 주식시장에 상장하는 것. 누구나 이 회사의 주식을 살 수 있게 됩니다."),
    "VC":        ("VC(벤처캐피탈)", "스타트업에 투자하는 전문 투자사. 성장 가능성을 보고 초기에 큰돈을 투자합니다."),
    "MVP":       ("MVP(최소기능제품)", "핵심 기능만 갖춘 초기 버전. '일단 만들어보고 시장 반응을 보자'는 전략입니다."),
    "PMF":       ("PMF(제품-시장 적합성)", "내 제품이 시장이 원하는 것과 딱 맞아떨어지는 상태."),
    "SaaS":      ("SaaS", "인터넷으로 소프트웨어를 빌려 쓰는 방식. 넷플릭스처럼 구독료를 내고 사용합니다."),
    "M&A":       ("M&A(인수합병)", "한 회사가 다른 회사를 사거나 합치는 것."),
    "MRR":       ("MRR(월간반복매출)", "매달 꾸준히 들어오는 수익. 구독 서비스의 핵심 지표입니다."),
    "ARR":       ("ARR(연간반복매출)", "1년 동안 꾸준히 들어오는 수익의 합계."),
    "CAC":       ("CAC(고객획득비용)", "고객 한 명을 얻는 데 드는 비용."),
    "LTV":       ("LTV(고객생애가치)", "고객이 평생 우리 서비스에서 쓰는 총 금액."),
    "B2B":       ("B2B", "기업이 기업에게 파는 사업 모델."),
    "B2C":       ("B2C", "기업이 일반 소비자에게 직접 파는 사업 모델."),
    "ESG":       ("ESG", "환경(E)·사회(S)·지배구조(G)를 고려하는 경영 방식."),
    "AI 에이전트":("AI 에이전트", "사람 대신 스스로 판단하고 행동하는 AI 시스템."),
    "LLM":       ("LLM(대형언어모델)", "ChatGPT, Claude 같은 대화형 AI의 기반 기술."),
    "유니콘":    ("유니콘 기업", "기업 가치 1조 원이 넘는 비상장 스타트업."),
    "데카콘":    ("데카콘 기업", "기업 가치 10조 원이 넘는 초대형 스타트업."),
    "피봇":      ("피봇", "사업 방향을 크게 바꾸는 것. 잘 안되면 다른 방향으로 전환하는 전략."),
    "밸류에이션":("밸류에이션(기업가치평가)", "투자자가 이 회사가 얼마짜리인지 평가하는 것."),
    "MAU":       ("MAU(월간활성사용자)", "한 달에 한 번 이상 서비스를 사용하는 사람 수."),
    "DAU":       ("DAU(일간활성사용자)", "하루에 한 번 이상 서비스를 사용하는 사람 수."),
}

# ─── 이벤트 분류 패턴
EVENT_KW = {
    "funding":     ["시리즈A","시리즈B","시리즈C","시리즈D","프리시리즈","투자유치","펀딩","억원","조원","라운드","시드","IR","벤처캐피탈","후속투자","누적투자"],
    "policy":      ["정부","과기부","중기부","창진원","예산","규제","정책","법안","예비창업","패키지","창업지원","보조금","지원금","공모","선발"],
    "product":     ["출시","론칭","선보","공개","베타","버전","업데이트"],
    "acquisition": ["인수","합병","M&A","지분","매각","인수합병"],
    "research":    ["연구","논문","발표","결과","조사","분석","보고서","통계"],
    "person":      ["대표","CEO","창업자","설립자","인터뷰","스토리","창업기","여정"],
    "market":      ["시장","성장","규모","트렌드","전망","예측","확대","증가","감소"],
}

DOMAIN_KW = {
    "investment": ["투자","펀딩","시리즈","억원","조원","VC","벤처캐피탈","상장","IPO"],
    "tech":       ["AI","인공지능","딥러닝","반도체","GPU","클라우드","SaaS","알고리즘"],
    "youth":      ["청소년","청년","대학생","고등학생","중학생","창업교육","해커톤"],
    "policy":     ["정부","지원","공모","선발","과기부","중기부","창진원","예산"],
    "startup":    ["스타트업","창업","유니콘","피봇","글로벌","사업화"],
    "esg":        ["ESG","탄소중립","친환경","지속가능","임팩트","소셜벤처"],
}

# ─── 경제 개념 설명
ECONOMY_CONCEPTS = {
    "구독":       "**구독 경제**란 제품을 사는 대신 정기적으로 돈을 내고 사용하는 방식입니다. 넷플릭스, 스포티파이가 대표적입니다. 기업 입장에서는 매달 예측 가능한 수익이 생기고, 사용자는 목돈 없이 서비스를 이용할 수 있습니다.",
    "플랫폼":    "**플랫폼 비즈니스**는 공급자와 소비자를 연결하는 중개 역할을 합니다. 직접 상품을 만들지 않아도 됩니다. 사용자가 늘수록 더 많은 사람이 몰리는 '네트워크 효과' 덕분에 한번 1등이 되면 독점적 위치를 유지하기 쉽습니다.",
    "금리":      "**금리**는 돈을 빌릴 때 내는 이자율입니다. 금리가 오르면 대출 비용이 높아져 스타트업은 투자를 받기 어려워지고, 소비자도 지갑을 닫습니다. 반대로 금리가 낮으면 돈이 풀려 투자와 소비가 활발해집니다.",
    "시장점유율": "**시장점유율**은 전체 시장에서 한 기업이 차지하는 비중입니다. 1등 기업이 시장을 얼마나 장악했는지 보여주는 수치입니다. 시장점유율이 높을수록 가격 결정력이 생기고 경쟁자가 버티기 어려워집니다.",
    "흑자":      "**흑자**란 벌어들인 돈이 쓴 돈보다 많은 상태입니다. 스타트업은 보통 초기에 '의도적 적자'를 감수하며 성장에 투자하다가, 규모가 커지면 흑자로 전환합니다. 흑자 전환은 사업이 자생력을 갖췄다는 신호입니다.",
    "글로벌":    "**글로벌 확장**은 단순히 해외에 진출하는 것 이상입니다. 현지 문화와 법규를 이해하고, 현지화된 제품을 만들어야 합니다. 국내에서 검증된 모델이 글로벌에서도 통할지는 별개의 문제입니다.",
    "AI":        "**AI(인공지능)**가 비즈니스의 판도를 바꾸고 있습니다. 단순 반복 작업의 자동화를 넘어, 이제는 창작·분석·의사결정까지 AI가 보조하는 시대가 됐습니다. 어떤 산업에 AI를 연결하느냐가 다음 세대 창업의 핵심 질문입니다.",
    "인수":      "**인수(M&A)**는 스타트업의 중요한 출구 전략 중 하나입니다. 대기업이 유망 스타트업을 사들임으로써 기술과 팀을 빠르게 확보합니다. 창업가 입장에서는 IPO 외에 인수를 목표로 사업을 설계하는 것도 유효한 전략입니다.",
}

NUM_PATTERNS = [
    r'\d+[\.,]?\d*\s*(억원|조원|만원|달러)',
    r'\d+[\.,]?\d*\s*(%|퍼센트|배)',
    r'\d+[\.,]?\d*\s*(만\s*명|명|개|건|곳)',
]

CAUSAL_KW = ["때문에","이유로","원인은","배경에는","결과로","따라서","이로 인해","덕분에","영향으로","증가했","감소했","성장했","하락했","확대됐","개선됐"]

# ─── 유틸리티 ────────────────────────────────────────────────────

def clean(text: str) -> str:
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'[^\w\s가-힣.!?%,·×₩$€£\-]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()

def split_sents(text: str) -> List[str]:
    sents = re.split(r'(?<=[.!?다요임음.])\s+', text)
    return [s.strip() for s in sents if len(s.strip()) > 15]

def tok(text: str) -> List[str]:
    words = re.findall(r'[가-힣]{2,}|[A-Z][A-Za-z0-9&/]{1,}|[A-Z]{2,}', text)
    return [w for w in words if w not in STOPWORDS and len(w) >= 2]

def detect_domain(title: str, body: str) -> str:
    combined = title + " " + body[:600]
    scores = {d: sum(1 for kw in kws if kw in combined) for d, kws in DOMAIN_KW.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "startup"

def detect_event(title: str, body: str) -> str:
    combined = title + " " + body[:500]
    priority = ["funding","acquisition","policy","product","research","person","market"]
    scores = {}
    for et in priority:
        kws = EVENT_KW[et]
        scores[et] = sum(1 for kw in kws if kw in combined)
        scores[et] += sum(2 for kw in kws if kw in title)  # 제목 가중치 2배
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "general"

def has_number(sent: str) -> bool:
    return any(re.search(p, sent) for p in NUM_PATTERNS)

def extract_numbers(sents: List[str]) -> List[str]:
    seen = set()
    result = []
    for s in sents:
        if not has_number(s): continue
        nums = tuple(re.findall(r'\d+[\.,]?\d*\s*(?:억원|조원|%|배|명)', s))
        if nums and nums not in seen:
            result.append(s)
            seen.add(nums)
    return result[:4]

def sent_quality(s: str) -> float:
    score = 1.0
    l = len(s)
    if 40 <= l <= 160: score *= 1.3
    elif l > 220: score *= 0.6
    if re.search(r'\d+', s): score *= 1.2
    if re.search(r'억|조|%|배', s): score *= 1.3
    if any(kw in s for kw in CAUSAL_KW): score *= 1.25
    if re.search(r'(밝혔다|말했다|전했다)\s*$', s): score *= 0.75
    return score

def bm25(sents: List[str], query: List[str], k1=1.8, b=0.72) -> List[float]:
    if not sents: return []
    tf_list = [Counter(tok(s)) for s in sents]
    df = defaultdict(int)
    for tf in tf_list:
        for t in tf: df[t] += 1
    N, avgdl = len(sents), sum(len(tok(s)) for s in sents) / max(len(sents), 1)
    result = []
    for tf in tf_list:
        dl = sum(tf.values())
        sc = sum(
            math.log((N - df[t] + 0.5) / (df[t] + 0.5) + 1) *
            (tf.get(t, 0) * (k1+1)) / (tf.get(t,0) + k1*(1-b+b*dl/max(avgdl,1)))
            for t in query if t in df
        )
        result.append(sc)
    return result

def mmr_select(sents: List[str], scores: List[float], top_n=8) -> List[int]:
    if not sents: return []
    selected, candidates = [], list(range(len(sents)))
    def sim(i, j):
        ti, tj = set(tok(sents[i])), set(tok(sents[j]))
        return len(ti&tj)/math.sqrt(len(ti)*len(tj)) if ti and tj else 0.0
    while candidates and len(selected) < top_n:
        best = max(candidates, key=lambda i:
            0.65*scores[i] - (0.35*max(sim(i,s) for s in selected) if selected else 0))
        selected.append(best)
        candidates.remove(best)
    return sorted(selected)

def load_model() -> Dict:
    for path in [MODEL_PATH,
                 os.path.join(os.path.dirname(__file__), "pacm_ai_model_v5.json"),
                 os.path.join(os.path.dirname(__file__), "pacm_ai_model_v4.json")]:
        if os.path.exists(path):
            try:
                d = json.load(open(path))
                w = d.get("weights", {})
                if len(w) > 10: return w
            except: pass
    base = {}
    for kws in DOMAIN_KW.values():
        for kw in kws: base[kw] = 1.5
    return base

def score_sents(sents: List[str], title: str) -> List[float]:
    query = tok(title)
    bm = bm25(sents, query)
    weights = load_model()
    result = []
    for i, (s, b) in enumerate(zip(sents, bm)):
        tokens = tok(s)
        kw = sum(weights.get(t, 1.0) for t in tokens) / max(len(tokens), 1)
        pos = 1.4 if i < 2 else (1.2 if i < 5 else 1.0)
        q = sent_quality(s)
        num = 1.3 if has_number(s) else 1.0
        result.append((b*0.40 + kw*0.35 + pos*0.10 + q*0.15) * num)
    return result

def find_terms_in_text(sents: List[str], title: str) -> List[Tuple]:
    all_text = title + " " + " ".join(sents)
    return [(k, *v) for k, v in TERMS.items() if k in all_text][:3]

def find_economy_concept(sents: List[str], title: str) -> Optional[Tuple]:
    all_text = title + " " + " ".join(sents[:8])
    for concept, explanation in ECONOMY_CONCEPTS.items():
        if concept in all_text:
            return (concept, explanation)
    return None

def apply_term(text: str, found_terms: List) -> str:
    seen = set()
    for term, display, _ in found_terms:
        if term in text and term not in seen:
            text = text.replace(term, display, 1)
            seen.add(term)
    return text

# ─── 롱폼 스토리 생성 함수들 ──────────────────────────────────────

def make_hook(title: str, sents: List[str], event_type: str, domain: str) -> str:
    """
    도입부 훅 — 독자를 끌어당기는 첫 문단
    Longblack 스타일: 질문, 반전, 놀라운 사실로 시작
    """
    all_text = " ".join(sents[:6])

    hooks = {
        "funding": [
            lambda: _funding_hook(title, sents),
        ],
        "policy": [
            lambda: _policy_hook(title, sents),
        ],
        "product": [
            lambda: _product_hook(title, sents),
        ],
        "person": [
            lambda: _person_hook(title, sents),
        ],
        "market": [
            lambda: _market_hook(title, sents),
        ],
        "acquisition": [
            lambda: _acquisition_hook(title, sents),
        ],
        "research": [
            lambda: _research_hook(title, sents),
        ],
    }

    fn_list = hooks.get(event_type, [lambda: _general_hook(title, sents)])
    return fn_list[0]()

def _funding_hook(title: str, sents: List[str]) -> str:
    # 금액 추출
    all_text = " ".join(sents)
    m = re.search(r'(\d+[\.,]?\d*\s*(?:억원|조원))', all_text)
    amt = m.group(0) if m else None

    # 회사명 추출 (제목에서)
    company = re.search(r'^([가-힣A-Za-z·\s]+?)[,，\s]*(가|이|는|은|의)\s', title)
    company_name = company.group(1).strip() if company else "이 스타트업"

    # 시리즈 단계 추출
    stage = None
    for s in ["시리즈D","시리즈C","시리즈B","시리즈A","프리시리즈A","시드"]:
        if s in all_text or s in title:
            stage = s
            break

    if amt and stage:
        return f"투자자들은 왜 {company_name}에 {amt}을 베팅했을까요?\n\n{stage} 투자 유치 소식이 들어왔습니다. 단순한 숫자가 아닙니다. 이 금액 뒤에는 투자자들이 '이 사업이 앞으로 훨씬 더 커질 것'이라고 확신한 이유가 있습니다. 그 이유를 함께 파헤쳐 보겠습니다."
    elif amt:
        return f"{company_name}이 {amt}의 투자를 유치했습니다.\n\n큰돈이 움직인다는 건, 시장이 움직이고 있다는 신호입니다. 투자자들이 어디에 베팅하는지를 알면, 앞으로 세상이 어떻게 변할지 미리 볼 수 있습니다."
    else:
        return f"새로운 투자 소식이 들어왔습니다.\n\n스타트업 생태계에서 투자 유치 뉴스는 단순한 자금 조달이 아닙니다. '이 팀, 이 아이디어, 이 시장을 우리가 믿는다'는 투자자의 공개 선언입니다."

def _policy_hook(title: str, sents: List[str]) -> str:
    all_text = " ".join(sents)

    # 청소년 관련?
    is_youth = any(kw in all_text or kw in title for kw in ["청소년","고등학생","중학생","청년","대학생","17세","18세","19세","10대"])

    # 지원금 추출
    m = re.search(r'(\d+[\.,]?\d*\s*(?:억원|만원))', all_text)
    amt = m.group(0) if m else None

    if is_youth and amt:
        # 인물 이름 추출 시도
        person = re.search(r'([가-힣]{2,4})\s*(?:씨|군|양|학생)', all_text)
        pname = person.group(1) if person else "한 청소년"
        return f"만약 지금 당장 {amt}짜리 기회가 여러분 앞에 놓인다면?\n\n{pname}은 그 기회를 잡았습니다. 정부 지원 프로그램을 통해서요. 창업을 꿈꾸는 청소년에게 정부 지원이 어떤 의미인지, 그리고 이 기회를 어떻게 내 것으로 만들 수 있는지 살펴보겠습니다."
    elif amt:
        return f"정부가 {amt}을 내놓았습니다.\n\n어디에? 그리고 왜? 정부가 특정 분야에 큰돈을 쓰는 건, 그 분야를 국가 차원에서 중요하다고 판단했다는 신호입니다. 이 정책이 어떤 변화를 만들어낼지 짚어보겠습니다."
    else:
        # 선발/공모 관련인지 확인
        all_body = " ".join(sents[:4])
        if any(kw in all_body or kw in title for kw in ["선발","공모","모집","패키지","지원사업"]):
            return f"누군가의 아이디어가 공식 인정을 받았습니다.\n\n정부 지원 프로그램은 단순한 돈이 아닙니다. 검증, 네트워크, 멘토링이 함께 옵니다. 어떤 아이디어가 선택받았는지, 그리고 여러분도 도전할 수 있는지 살펴보겠습니다."
        return f"정부가 새로운 정책을 내놓았습니다.\n\n정책은 규칙입니다. 창업가에게 규칙은 제약이 될 수도 있고, 기회가 될 수도 있습니다. 이 정책이 어떤 방향으로 판을 바꿀지 살펴보겠습니다."

def _product_hook(title: str, sents: List[str]) -> str:
    all_text = " ".join(sents[:4])
    # 서비스명 추출
    service = re.search(r"['\"`''""]([^'\"`''""]{2,20})['\"`''""]", title)
    sname = service.group(1) if service else None

    # 가격 추출 (구독료/가격 패턴 - 만원 단위 우선)
    price = re.search(r'(\d+만?\d*\s*원(?:/월)?)', all_text)

    if sname and price:
        return f"오늘부터 {sname}을 쓸 수 있게 됐습니다. {price.group(0)}에.\n\n새로운 제품이 세상에 나올 때마다 우리는 물어봐야 합니다. '이게 왜 지금인가? 기존 것과 무엇이 다른가? 그리고 이 제품이 성공한다면 시장은 어떻게 바뀔까?' 함께 들여다보겠습니다."
    elif sname:
        return f"'{sname}'이 공개됐습니다.\n\n좋은 제품은 문제를 해결합니다. 어떤 문제를, 어떻게 해결했는지가 이 제품의 가치를 결정합니다. 그리고 그 답이 창업의 교과서가 됩니다."
    else:
        return f"새로운 제품이 시장에 등장했습니다.\n\n모든 제품 출시는 하나의 가설 검증입니다. '시장이 이것을 원한다'는 가설을요. 이 제품이 그 가설을 증명할 수 있을지, 분석해보겠습니다."

def _person_hook(title: str, sents: List[str]) -> str:
    all_text = " ".join(sents[:5])
    person = re.search(r'([가-힣]{2,4})\s*(?:씨|군|양|대표|CEO|창업자|학생)', all_text)
    pname = person.group(1) if person else None

    # 나이/학년
    age = re.search(r'(\d{1,2})\s*(?:세|살|학년)', all_text)

    if pname and age:
        return f"{age.group(0)}에 창업을 결심한다면, 무엇이 필요할까요?\n\n{pname}은 이미 그 답을 찾아가고 있습니다. 그의 이야기는 단순한 성공담이 아닙니다. 수많은 선택의 순간, 실패의 경험, 그리고 그 안에서 발견한 것들의 기록입니다."
    elif pname:
        return f"{pname}의 이야기를 들어보겠습니다.\n\n훌륭한 창업가의 스토리에서 가장 배울 것은 '화려한 성공'이 아닙니다. 어떤 문제를 발견했고, 왜 그것을 해결하기로 했으며, 포기하고 싶은 순간에 무엇이 그를 붙잡았는지입니다."
    else:
        return f"한 창업가의 이야기입니다.\n\n모든 스타트업 뒤에는 사람이 있습니다. 그 사람이 어떤 시각으로 세상을 보고, 어떤 문제를 해결하려 했는지를 이해하면, 창업이 무엇인지가 보입니다."

def _market_hook(title: str, sents: List[str]) -> str:
    all_text = " ".join(sents[:5])
    # 성장률/규모 추출
    m = re.search(r'(\d+[\.,]?\d*\s*(?:%|배|억원|조원))', all_text)
    figure = m.group(0) if m else None

    if figure:
        return f"시장이 {figure} 성장하고 있습니다.\n\n숫자가 말하는 건 단순히 '크다'가 아닙니다. 얼마나 많은 사람이 이 문제에 돈을 쓸 의사가 있는지를 보여주는 겁니다. 그 안에 어떤 창업 기회가 숨어 있는지 파헤쳐 보겠습니다."
    else:
        return f"시장의 판이 바뀌고 있습니다.\n\n트렌드를 먼저 읽는 사람이 기회를 먼저 잡습니다. 지금 이 시장에서 무슨 일이 일어나고 있는지, 그리고 그것이 왜 중요한지 살펴보겠습니다."

def _acquisition_hook(title: str, sents: List[str]) -> str:
    all_text = " ".join(sents[:4])
    m = re.search(r'(\d+[\.,]?\d*\s*(?:억원|조원))', all_text)
    amt = m.group(0) if m else None

    if amt:
        return f"{amt}의 거래가 성사됐습니다.\n\nM&A(인수합병)는 스타트업 세계에서 IPO와 함께 가장 큰 '출구 전략'입니다. 이 거래가 왜 일어났는지, 양쪽 모두에게 무슨 의미인지를 알면 비즈니스의 큰 그림이 보입니다."
    else:
        return f"두 회사가 하나가 됩니다.\n\nM&A는 단순히 회사를 사고파는 게 아닙니다. 기술을 사고, 팀을 사고, 시장을 삽니다. 이 합병이 어떤 전략적 의도를 가지고 있는지 분석해보겠습니다."

def _research_hook(title: str, sents: List[str]) -> str:
    all_text = " ".join(sents[:4])
    m = re.search(r'(\d+[\.,]?\d*\s*(?:%|배|명))', all_text)
    figure = m.group(0) if m else None

    if figure:
        return f"데이터가 말합니다 — {figure}.\n\n숫자는 거짓말하지 않습니다. 이번 연구 결과가 우리에게 무엇을 알려주는지, 그리고 그것이 창업가와 경제에 어떤 의미를 갖는지 살펴보겠습니다."
    else:
        return f"연구 결과가 나왔습니다.\n\n좋은 창업 아이디어는 종종 데이터와 연구에서 시작됩니다. '이 문제가 얼마나 심각한지', '사람들이 진짜로 원하는 게 무엇인지'를 수치로 확인하는 것이 창업의 첫걸음입니다."

def _general_hook(title: str, sents: List[str]) -> str:
    return f"지금 일어나고 있는 일입니다.\n\n비즈니스 뉴스는 단순한 정보가 아닙니다. 시장이 어디로 움직이는지, 어떤 문제가 해결되고 있는지, 그리고 다음에 어떤 기회가 올지를 보여주는 나침반입니다."

def make_story_body(title: str, sents: List[str], key_sents: List[str],
                    event_type: str, domain: str,
                    num_sents: List[str], found_terms: List) -> List[str]:
    """
    본문 — 핵심 내용을 이야기 흐름으로 구성
    각 단락이 자연스럽게 이어지도록
    """
    parts = []
    used = set()

    def add_para(lines: List[str]):
        # 중복 문장 필터링
        filtered = []
        for l in lines:
            l = l.strip()
            if not l: continue
            if l in used: continue
            # 이미 추가된 내용과 80% 이상 겹치면 스킵
            is_dup = any(
                len(set(l.split()) & set(ex.split())) / max(len(set(l.split())), 1) > 0.8
                for ex in used if len(ex) > 20
            )
            if not is_dup:
                filtered.append(l)
                used.add(l)
        if filtered:
            parts.append("\n".join(filtered))

    # ── 단락 1: 핵심 사실 (무슨 일이 일어났나)
    core_lines = []
    if event_type == "funding":
        # 회사 소개 문장 먼저
        for s in sents[:4]:
            if any(kw in s for kw in ["개발","서비스","플랫폼","솔루션","운영","제공","만든","스타트업"]):
                if not re.match(r'[가-힣A-Za-z]+\s*(파트너스|벤처스|인베스트|캐피탈|VC|펀드)', s):
                    core_lines.append(apply_term(s[:150], found_terms))
                    break
        if not core_lines and sents:
            core_lines.append(apply_term(sents[0][:150], found_terms))
        # 투자 규모 문장
        all_text = " ".join(sents)
        m = re.search(r'(\d+[\.,]?\d*\s*(?:억원|조원))', all_text)
        if m:
            amt = m.group(0)
            m_cumul = re.search(r'누적.{1,10}(\d+[\.,]?\d*\s*(?:억원|조원))', all_text)
            if m_cumul:
                core_lines.append(f"이번 라운드에서 {amt}을 유치했으며, 누적 투자액은 {m_cumul.group(1)}에 달합니다.")
            else:
                core_lines.append(f"이번 라운드에서 {amt}을 유치했습니다.")

    elif event_type == "policy":
        # 가장 긴 lead 문장 (주인공+사건 포함 가능성 높음)
        if sents:
            best = max(sents[:3], key=len)
            core_lines.append(apply_term(best[:180], found_terms))
        for s in sents:
            if any(kw in s for kw in ["지원금","만원","억원","멘토링","제공","혜택"]):
                core_lines.append(apply_term(s[:150], found_terms))
                break

    elif event_type == "product":
        for s in sents[:4]:
            if any(kw in s for kw in ["출시","론칭","공개","선보","개발"]):
                core_lines.append(apply_term(s[:150], found_terms))
                break
        if not core_lines and sents:
            core_lines.append(apply_term(sents[0][:150], found_terms))
        for s in sents:
            if any(kw in s for kw in ["기능","자동","처리","제공","분석"]):
                core_lines.append(apply_term(s[:130], found_terms))
                break

    elif event_type == "person":
        if sents:
            core_lines.append(apply_term(sents[0][:180], found_terms))
        for s in sents[1:5]:
            if any(kw in s for kw in ["개발","만들","아이디어","독학","시작","계기"]):
                core_lines.append(apply_term(s[:150], found_terms))
                break

    else:
        for s in sents[:3]:
            if len(s) > 25:
                core_lines.append(apply_term(s[:160], found_terms))

    add_para(core_lines)

    # ── 단락 2: 수치로 보는 규모
    if num_sents:
        num_lines = ["숫자가 이야기해주는 것들:"]
        for ns in num_sents[:3]:
            ns_clean = apply_term(ns[:130], found_terms)
            num_lines.append(f"• {ns_clean}")
        add_para(num_lines)

    # ── 단락 3: 배경과 원인 (왜 일어났나)
    causal = []
    for s in sents:
        if any(kw in s for kw in CAUSAL_KW) and len(s) > 25 and s not in used:
            causal.append(apply_term(s[:140], found_terms))
            if len(causal) >= 2: break
    if causal:
        intro = {
            "funding": "투자자들이 지갑을 연 이유:",
            "policy": "이 정책이 나온 배경:",
            "product": "이 제품이 만들어진 이유:",
            "market": "이 시장이 움직이는 이유:",
        }.get(event_type, "이런 일이 일어난 배경:")
        add_para([intro] + causal)

    # ── 단락 4: 향후 전망/계획
    future_sents = []
    for s in sents:
        if any(kw in s for kw in ["계획","예정","목표","확장","진출","글로벌","앞으로"]) and s not in used:
            future_sents.append(apply_term(s[:140], found_terms))
            if len(future_sents) >= 2: break
    if future_sents:
        add_para(["앞으로 어떻게 될까:"] + future_sents)

    # ── 단락 5: 추가 인물 발언/비전 (있을 때만)
    quote_sents = []
    for s in sents:
        has_kw = any(kw in s for kw in ["목표","비전","강조","말했","밝혔"])
        if has_kw and len(s) > 30 and s not in used:
            quote_sents.append(apply_term(s[:160], found_terms))
            break
    if quote_sents:
        add_para(quote_sents)

    return parts

def make_market_context(title: str, sents: List[str], event_type: str, domain: str) -> str:
    """더 넓은 시장 맥락 — 이 뉴스가 큰 그림에서 어떤 의미인지"""
    all_text = title + " " + " ".join(sents[:8])

    contexts = [
        (["AI","인공지능","LLM","GPT","딥러닝"],
         "지금 AI 산업은 '누가 더 좋은 모델을 만드느냐'에서 '누가 이 기술을 실제 사업에 가장 잘 적용하느냐'로 경쟁이 이동하고 있습니다. 기술 자체보다, 기술을 어떤 문제에 연결하느냐가 승부를 가릅니다. 그 연결점을 찾는 것이 지금 가장 뜨거운 창업 기회입니다."),
        (["헬스","의료","바이오","건강","진단"],
         "고령화 사회와 AI 기술의 결합이 헬스케어 시장을 빠르게 재편하고 있습니다. 병원에 가지 않아도 건강을 관리할 수 있는 세상, 맞춤형 치료가 가능한 세상이 가까워지고 있습니다. 이 변화 속에서 어떤 문제를 해결할 수 있을지 생각해보세요."),
        (["교육","에듀테크","학습","강의","수업"],
         "교육 시장은 AI 개인화 학습의 등장으로 100년 만의 대전환을 맞이하고 있습니다. 한 교사가 30명을 가르치는 대신, AI가 각 학생의 수준과 속도에 맞게 가르치는 시대가 오고 있습니다. '모두에게 같은 교육'이 아닌 '각자에게 맞는 학습 경험'을 만드는 것이 에듀테크의 핵심 과제입니다."),
        (["탄소","환경","ESG","친환경","기후","에너지"],
         "기후 위기 대응은 선택이 아닌 의무가 됐습니다. 동시에, 이것은 역사상 가장 큰 창업 기회 중 하나입니다. 탄소 감축 기술, 친환경 소재, 지속가능한 공급망 — 이 분야에서 문제를 해결하는 스타트업이 다음 세대의 유니콘이 될 것입니다."),
        (["핀테크","결제","금융","보험","대출"],
         "금융 서비스의 디지털 전환이 가속화되고 있습니다. 기존 은행이 하지 못하거나 하지 않는 것을 스타트업이 더 빠르고 저렴하게 제공하는 것이 핀테크 창업의 핵심 기회입니다. 특히 금융 접근성이 낮은 곳에 기술로 다리를 놓는 것에 주목하세요."),
        (["커머스","쇼핑","배달","물류","유통"],
         "이커머스 시장은 이미 성숙기에 접어들었지만, 그 안에서도 새로운 기회가 계속 만들어지고 있습니다. 초개인화 추천, 빠른 배송, 라이브 커머스, 소셜 커머스 — 소비자의 쇼핑 경험을 어떻게 혁신할 수 있느냐가 다음 승부처입니다."),
    ]

    for keywords, context in contexts:
        if any(kw in all_text for kw in keywords):
            return context

    # 이벤트별 기본 맥락
    defaults = {
        "funding": "스타트업 투자는 미래를 사는 행위입니다. 어느 분야에 돈이 몰리는지를 추적하면, 앞으로 세상이 어떻게 변할지 미리 볼 수 있습니다. 투자 흐름이 곧 시장의 나침반입니다.",
        "policy": "정부 정책은 시장의 방향을 바꾸는 강력한 힘입니다. 어떤 분야를 지원하고 어떤 분야를 규제하는지를 보면, 정부가 어떤 미래를 설계하고 있는지가 보입니다. 창업가라면 이 방향성을 놓치지 마세요.",
        "market": "시장 흐름을 읽는 것은 창업의 가장 기본기입니다. 어떤 문제가 커지고 있고, 왜 커지고 있으며, 그 안에서 아직 해결되지 않은 것이 무엇인지 — 이 세 가지 질문이 창업 아이디어의 씨앗이 됩니다.",
    }
    return defaults.get(event_type, "모든 비즈니스 뉴스는 시장의 변화를 담고 있습니다. 그 변화가 어떤 새로운 문제를 만들어내는지, 그리고 그 문제를 해결할 기회가 어디에 있는지를 항상 생각하며 뉴스를 읽어보세요.")

def make_youth_insight(title: str, sents: List[str], event_type: str, domain: str) -> List[str]:
    """청소년 창업가를 위한 실용적 인사이트 — 구체적 행동 제안"""
    all_text = title + " " + " ".join(sents[:8])
    insights = []

    # 이벤트별 심화 인사이트
    if event_type == "funding":
        for stage, desc in [("시리즈B","본격 성장"), ("시리즈A","성장 초기"),
                            ("프리시리즈A","초기-성장"), ("시드","아이디어 검증")]:
            if stage in all_text:
                insights.append(f"**투자 단계 이해하기:** 이번 투자는 {stage}({desc}) 단계입니다. 창업은 단계별로 필요한 것이 다릅니다. 시드에서는 '이 문제가 실제로 존재하는가'를 증명하고, 시리즈A에서는 '이 방법이 효과가 있는가'를 증명합니다. 지금 어떤 단계에 있든, 그 단계에서 증명해야 할 것에 집중하세요.")
                break

        # 어떤 분야?
        for field_kws, field_name in [
            (["AI","인공지능","LLM"], "AI/인공지능"),
            (["헬스","의료"], "헬스케어"),
            (["교육","에듀테크"], "에듀테크"),
            (["환경","ESG","친환경"], "그린테크"),
        ]:
            if any(kw in all_text for kw in field_kws):
                insights.append(f"**투자 받은 이 회사를 분석해보세요:** {field_name} 분야에서 이 회사는 어떤 문제를 해결하고 있나요? 어떤 고객을 타겟으로 하나요? 왜 기존 솔루션이 아닌 이 방법을 선택했나요? 이 세 가지 질문에 답하다 보면 시장 분석 능력이 자랍니다.")
                break

        if not insights:
            insights.append("**투자자의 눈으로 세상 보기:** 투자자는 '이 시장이 앞으로 얼마나 커질까', '이 팀이 그 시장을 가져올 수 있을까'를 봅니다. 주변의 문제들을 발견할 때마다 '이게 시장이 될 수 있을까? 사람들이 이 해결책에 돈을 낼까?'라고 자문해보세요.")

    elif event_type == "policy":
        is_youth = any(kw in all_text for kw in ["청소년","고등학생","중학생","청년","대학생"])
        if is_youth:
            insights.append("**이 프로그램 직접 신청해보세요:** 이 기사의 주인공처럼 여러분도 정부 지원 프로그램에 도전할 수 있습니다. 창업진흥원 K-Startup, 중소벤처기업부 홈페이지를 즐겨찾기에 추가하고, 공모 일정을 놓치지 마세요. 사업계획서 쓰는 연습을 지금부터 시작하면 준비된 창업가가 될 수 있습니다.")
        insights.append("**정책을 기회로 읽는 법:** 정부가 어떤 분야를 지원하는지 = 국가가 어디에 미래가 있다고 보는지입니다. 이 정책이 집중되는 분야에서 창업 아이디어를 탐색하면, 지원도 받고 시장 수요도 검증된 아이템을 찾을 확률이 높아집니다.")

    elif event_type == "product":
        problem_sents = [s for s in sents if any(kw in s for kw in ["문제","불편","어려움","해결","필요","부족"])]
        if problem_sents:
            insights.append(f"**문제에서 제품으로:** 이 제품이 해결하는 문제를 먼저 찾아보세요. '{problem_sents[0][:80]}' — 좋은 창업 아이디어는 항상 '내가 직접 느낀 불편함'이나 '주변에서 반복되는 문제'에서 시작합니다. 여러분 주변에도 이런 문제가 있지 않나요?")
        insights.append("**경쟁 분석 연습:** 이 제품과 경쟁하는 기존 서비스들을 찾아보세요. 그리고 '이 새 제품이 기존 것보다 10배 더 나은 점이 무엇인가?'를 분석해보세요. 10배 더 낫지 않으면 사람들은 바꾸지 않습니다. 이 10배 차이를 찾는 것이 창업 아이디어 발굴의 핵심입니다.")

    elif event_type == "person":
        motive = [s for s in sents if any(kw in s for kw in ["계기","동기","아이디어","발견","독학","시작","우연"])]
        if motive:
            insights.append(f"**창업 동기 메모하기:** '{motive[0][:100]}' — 이 창업가는 이런 계기로 시작했습니다. 여러분도 '이게 왜 이렇게 불편하지?', '왜 이런 서비스가 없지?'라고 느낀 순간을 메모해두세요. 그 메모들이 언젠가 창업 아이디어가 됩니다.")

        failure = [s for s in sents if any(kw in s for kw in ["실패","어려움","위기","포기","힘들","극복"])]
        if failure:
            insights.append(f"**실패를 배움으로:** '{failure[0][:100]}' — 모든 성공한 창업가에게는 이런 위기의 순간이 있었습니다. 중요한 것은 그 순간에 포기하느냐, 다른 방법을 찾느냐입니다. 실패는 '이 방법은 아니다'라는 데이터입니다.")

    elif event_type == "market":
        growth = [s for s in sents if any(kw in s for kw in ["성장","확대","증가","전망","예측"])]
        if growth:
            insights.append(f"**성장하는 시장 올라타기:** '{growth[0][:100]}' — 성장하는 시장에서 창업하는 것과 줄어드는 시장에서 창업하는 것은 완전히 다른 게임입니다. 배가 올라가는 조류를 만나면 더 적은 노력으로 더 멀리 갈 수 있습니다.")
        insights.append("**시장 트렌드 읽기 연습:** 이 시장이 성장하는 이유 3가지를 직접 정리해보세요. 그리고 '이 트렌드가 계속된다면, 5년 후 어떤 새로운 문제가 생길까?'를 상상해보세요. 그 상상이 미래 창업 아이디어의 씨앗입니다.")

    else:
        insights.append("**뉴스를 3가지 관점으로 읽기:** ① 누가 이익을 얻는가? ② 누가 손해를 보는가? ③ 어떤 새로운 기회가 생기는가? 이 세 가지 질문을 갖고 모든 비즈니스 뉴스를 읽으면, 시장을 읽는 눈이 빠르게 성장합니다.")

    return insights[:2]

def make_closing(title: str, sents: List[str], event_type: str, domain: str) -> str:
    """마무리 — 핵심 메시지를 한 문장으로"""
    closings = {
        "funding": "투자는 미래에 대한 베팅입니다. 그리고 그 베팅은 누군가의 문제를 발견하고, 해결책을 만들어낸 사람에게 돌아옵니다.",
        "policy": "기회는 준비된 사람에게 옵니다. 오늘 읽은 이 정책이 여러분의 기회가 될 수도 있습니다.",
        "product": "모든 위대한 제품은 '왜 아무도 이걸 안 만들었지?'라는 질문에서 시작됐습니다. 그 질문을 여러분도 매일 던져보세요.",
        "person": "창업은 정보의 싸움이기도 합니다. 다른 창업가의 이야기를 많이 읽고 분석할수록, 여러분의 판단력이 단단해집니다.",
        "market": "트렌드를 읽는 것은 기술입니다. 꾸준히 연습하면 시장을 보는 눈이 생깁니다.",
        "acquisition": "M&A는 스타트업의 또 다른 성공 방식입니다. 처음부터 '이 회사에 인수되는 것'을 목표로 설계하는 역발상도 유효한 전략입니다.",
        "research": "데이터는 직감을 검증합니다. 창업 아이디어가 생기면, 그것을 뒷받침하는 데이터를 찾는 습관을 기르세요.",
    }
    return closings.get(event_type, "세상은 문제로 가득합니다. 그리고 그 문제 하나하나가 창업의 씨앗입니다.")

# ─── 메인 요약 함수 ──────────────────────────────────────────────

def summarize(title: str, body: str, target_len: int = 4000) -> str:
    """
    v6 롱폼 스토리텔링 요약
    Longblack 스타일 — 길고 몰입감 있는 이야기체
    """
    body = clean(body or "")
    if len(body) < 50:
        body = title

    domain = detect_domain(title, body)
    event_type = detect_event(title, body)

    sents = split_sents(body)
    if len(sents) < 2:
        sents = [body[:300]] if body else [title]

    scores = score_sents(sents, title)
    if len(sents) > 3:
        top_idx = mmr_select(sents, scores, top_n=min(8, len(sents)))
        key_sents = [sents[i] for i in top_idx]
    else:
        key_sents = sents[:]

    num_sents = extract_numbers(sents)
    found_terms = find_terms_in_text(sents, title)
    economy_concept = find_economy_concept(sents, title)

    evt_labels = {
        "funding": "💰 투자 유치", "product": "🚀 제품/서비스 출시",
        "policy": "📋 정책/지원", "acquisition": "🤝 인수/합병",
        "research": "🔬 연구/조사", "person": "👤 창업가 스토리",
        "market": "📊 시장/트렌드", "general": "📰 뉴스",
    }
    domain_labels = {
        "investment":"투자·금융", "tech":"기술·AI", "youth":"청소년·교육",
        "policy":"정책·지원", "startup":"창업·비즈니스", "esg":"ESG·임팩트",
    }

    lines = []
    lines.append(f"**{title.strip()}**")
    lines.append("")
    lines.append(f"{evt_labels.get(event_type,'📰 뉴스')} · {domain_labels.get(domain,'창업·비즈니스')}")
    lines.append("")
    lines.append("---")
    lines.append("")

    # 1. 도입부 훅
    hook = make_hook(title, sents, event_type, domain)
    lines.append(hook)
    lines.append("")

    # 2. 본문 스토리
    story_parts = make_story_body(title, sents, key_sents, event_type, domain, num_sents, found_terms)
    for part in story_parts:
        lines.append(part)
        lines.append("")

    # 3. 시장 맥락 (박스 스타일)
    market_ctx = make_market_context(title, sents, event_type, domain)
    lines.append("---")
    lines.append("")
    lines.append("**📈 더 넓은 시장 흐름**")
    lines.append("")
    lines.append(market_ctx)
    lines.append("")

    # 4. 용어 해설 (있을 때만)
    if found_terms:
        lines.append("---")
        lines.append("")
        lines.append("**📚 오늘의 용어**")
        lines.append("")
        for term, display, explanation in found_terms[:2]:
            lines.append(f"**{display}** — {explanation}")
        lines.append("")

    # 5. 경제 개념 연결 (있을 때만)
    if economy_concept:
        concept_name, concept_exp = economy_concept
        lines.append("---")
        lines.append("")
        lines.append(f"**💡 경제 개념으로 읽기: {concept_name}**")
        lines.append("")
        lines.append(concept_exp)
        lines.append("")

    # 6. 창업가 인사이트 (핵심 섹션)
    youth_insights = make_youth_insight(title, sents, event_type, domain)
    lines.append("---")
    lines.append("")
    lines.append("**🚀 창업가 관점으로 읽기**")
    lines.append("")
    for insight in youth_insights:
        lines.append(insight)
        lines.append("")

    # 7. 마무리
    lines.append("---")
    lines.append("")
    lines.append(f"*{make_closing(title, sents, event_type, domain)}*")
    lines.append("")
    lines.append(f"*ai: insightship-v6 · domain: {domain} · event: {event_type}*")

    result = "\n".join(lines)
    if len(result) > target_len:
        result = result[:target_len] + "\n\n*...(계속)*"
    return result

# ─── 평가 & 학습 ─────────────────────────────────────────────────

def rouge_l(hyp: str, ref: str) -> float:
    def lcs(a, b):
        m, n = len(a), len(b)
        dp = [[0]*(n+1) for _ in range(m+1)]
        for i in range(1,m+1):
            for j in range(1,n+1):
                dp[i][j] = dp[i-1][j-1]+1 if a[i-1]==b[j-1] else max(dp[i-1][j],dp[i][j-1])
        return dp[m][n]
    h, r = tok(hyp), tok(ref)
    if not h or not r: return 0.0
    l = lcs(h, r)
    p, rc = l/len(h), l/len(r)
    return 2*p*rc/(p+rc) if (p+rc) > 0 else 0.0

def coverage_score(summary: str, body: str) -> float:
    body_tokens = set(tok(clean(body)))
    summary_tokens = set(tok(summary))
    if not body_tokens: return 0.0
    top_body = set(t for t, c in Counter(tok(clean(body))).most_common(20))
    return len(top_body & summary_tokens) / max(len(top_body), 1)

def save_model(weights: Dict, metrics: Dict = None):
    with open(MODEL_PATH, "w", encoding="utf-8") as f:
        json.dump({"version": VERSION, "weights": weights,
                   "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                   "metrics": metrics or {}}, f, ensure_ascii=False, indent=2)

def load_model_or_default() -> Dict:
    return load_model()

def train(articles: List[Dict]) -> Dict:
    current = load_model()
    contrib = defaultdict(list)
    for a in articles:
        title = a.get("title","")
        body = clean(a.get("body","") or a.get("excerpt","") or "")
        ref = a.get("ai_summary","")
        if not (title and len(body) > 80): continue
        for s in split_sents(body):
            q = sent_quality(s)
            if q < 0.8: continue
            for t in tok(s):
                if ref and len(ref) > 80:
                    sc = rouge_l(s, ref)
                    if sc > 0.04: contrib[t].append(sc * q * 1.5)
                if has_number(s): contrib[t].append(0.3 * q)
    new_w = dict(current)
    for kw, vals in contrib.items():
        if not vals: continue
        avg = sum(vals)/len(vals)
        old = current.get(kw, 1.0)
        new_w[kw] = round(max(0.3, min(0.8*old + 0.2*(1.0+avg*8), 6.0)), 3)
    return new_w

# ─── Supabase ────────────────────────────────────────────────────

def get_cfg():
    return {
        "url": os.environ.get("SUPABASE_URL",""),
        "key": os.environ.get("SUPABASE_SERVICE_KEY", os.environ.get("SUPABASE_ANON_KEY","")),
    }

def fetch_articles(limit=200, days=90) -> List[Dict]:
    cfg = get_cfg()
    if not cfg["url"] or not cfg["key"]:
        print("⚠️  Supabase 환경변수 없음")
        return []
    cutoff = time.strftime("%Y-%m-%dT00:00:00", time.gmtime(time.time() - days*86400))
    url = (f"{cfg['url']}/rest/v1/articles"
           f"?select=id,title,body,excerpt,ai_summary,published_at"
           f"&status=eq.published&published_at=gte.{cutoff}"
           f"&order=published_at.desc&limit={limit}")
    req = urllib.request.Request(url)
    req.add_header("apikey", cfg["key"])
    req.add_header("Authorization", f"Bearer {cfg['key']}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.load(resp)
    except Exception as e:
        print(f"⚠️  fetch 실패: {e}")
        return []

def update_summary(article_id: str, summary: str, domain: str):
    cfg = get_cfg()
    if not cfg["url"] or not cfg["key"]: return
    url = f"{cfg['url']}/rest/v1/articles?id=eq.{article_id}"
    payload = json.dumps({"ai_summary": summary, "ai_category": domain}).encode()
    req = urllib.request.Request(url, data=payload, method="PATCH")
    req.add_header("apikey", cfg["key"])
    req.add_header("Authorization", f"Bearer {cfg['key']}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "return=minimal")
    try:
        with urllib.request.urlopen(req, timeout=10): pass
    except Exception as e:
        print(f"⚠️  업데이트 실패 ({article_id}): {e}")

# ─── 엔트리포인트 ────────────────────────────────────────────────

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "test"

    if mode == "test":
        cases = [
            {
                "title": "카카오, AI 에이전트 '카나나' 정식 출시… 월 구독료 2만9900원",
                "body": "카카오가 자체 개발한 AI 에이전트 서비스 '카나나'를 정식 출시했다. 월 2만9900원의 구독 모델로, 일정 관리, 이메일 작성, 데이터 분석까지 자동화한다. 카카오 측은 출시 첫날 10만 명이 유료 전환했다고 밝혔다. 이번 서비스는 카카오가 2년간 R&D에 3000억 원을 투자한 결과물이다. 경쟁사 네이버 '클로바X'보다 30% 저렴한 가격을 책정해 시장 선점을 노린다. 카카오는 올해 말까지 기업용(B2B) 버전도 출시할 예정이다.",
            },
            {
                "title": "17세 고교생, AI 작물 질병 진단 앱으로 예비창업패키지 선발",
                "body": "경기도 수원 출신 고등학교 2학년 김민준(17)군이 스마트폰 카메라로 작물 잎사귀를 찍으면 AI가 질병을 진단해주는 앱 '팜케어'를 개발해 중소벤처기업부 2026년 예비창업패키지에 최종 선발됐다. 지원금 최대 1억 원과 6개월 멘토링이 제공된다. 김군은 할아버지 농사를 돕다가 작물이 갑자기 죽는 것을 보고 아이디어를 얻었으며, 혼자 Python과 TensorFlow를 독학해 앱을 만들었다. 앱은 현재 정확도 94%를 기록 중이며, 농가 50곳에서 베타 테스트 중이다. 김군은 '농업에도 첨단 기술이 필요하다는 것을 많은 사람이 알았으면 좋겠다'고 말했다.",
            },
            {
                "title": "국내 AI 스타트업 뤼튼, 시리즈B 500억 유치… 누적 투자 800억",
                "body": "AI 창작 도구 스타트업 뤼튼테크놀로지스가 시리즈B 라운드에서 500억 원을 유치했다. 알토스벤처스와 카카오벤처스가 공동 리드했다. 이번 투자로 누적 투자액은 800억 원에 달한다. 뤼튼은 AI 글쓰기 도구로 시작해 현재 MAU(월간활성사용자) 200만 명, 월 구독자 5만 명을 보유하고 있다. 이번 자금으로 글로벌 시장 진출과 기업용 솔루션 개발에 집중할 계획이다. 이세영 대표는 '한국을 넘어 아시아 전체를 겨냥한 AI 생산성 플랫폼이 목표'라고 밝혔다.",
            },
        ]
        for tc in cases:
            print("\n" + "="*70)
            result = summarize(tc["title"], tc["body"])
            print(result)
            cov = coverage_score(result, tc["body"])
            print(f"\n[커버리지: {cov:.3f} | 길이: {len(result)}자]")

    elif mode == "process":
        print(f"=== Insightship AI v{VERSION} 처리 시작 ===")
        articles = fetch_articles(limit=500, days=7)
        processed = 0
        for a in articles:
            title = a.get("title","")
            body = a.get("body","") or a.get("excerpt","") or ""
            if not title: continue
            if "insightship-v6" in (a.get("ai_summary") or ""): continue
            summary = summarize(title, body)
            domain = detect_domain(title, body)
            update_summary(a["id"], summary, domain)
            processed += 1
            if processed % 10 == 0: print(f"  {processed}/{len(articles)}")
            time.sleep(0.05)
        print(f"✅ 완료: {processed}건")

    elif mode == "train":
        articles = fetch_articles(limit=500, days=180)
        if articles:
            weights = train(articles)
            save_model(weights)
            print(f"✅ 학습 완료: {len(weights)}개 키워드")

    elif mode == "full":
        articles = fetch_articles(limit=300, days=30)
        if articles:
            save_model(train(articles))
        articles2 = fetch_articles(limit=500, days=7)
        processed = 0
        for a in articles2:
            title = a.get("title","")
            body = a.get("body","") or a.get("excerpt","") or ""
            if not title: continue
            if "insightship-v6" in (a.get("ai_summary") or ""): continue
            update_summary(a["id"], summarize(title, body), detect_domain(title, body))
            processed += 1
            time.sleep(0.05)
        print(f"✅ 처리 완료: {processed}건")
