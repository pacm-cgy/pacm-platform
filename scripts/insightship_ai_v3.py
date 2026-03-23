"""
Insightship AI v3.0 — PACM 완전 독립 자체 AI 엔진
외부 API 의존도: 0% | 순수 Python 표준 라이브러리
"""

import re, math, os, json, time, sys
from collections import Counter, defaultdict
from typing import List, Tuple, Dict, Optional

VERSION = "3.0.0"
MODEL_PATH = os.path.join(os.path.dirname(__file__), "pacm_ai_model_v3.json")

# ─── 불용어
STOPWORDS = {
    "이","그","저","것","수","들","및","등","에서","로서","으로","에게",
    "하지만","그러나","또한","그리고","따라서","때문에","위해","통해","대한","관련",
    "있는","없는","되는","하는","있다","없다","된다","한다","이다","있으며","되며",
    "이번","지난","올해","작년","이달","오늘","어제","최근","현재","지금",
    "특히","또","더","가장","매우","모두","함께","이미","아직","약","총",
    "전","후","당","각","제","본","해당","이에","이로","이와","이를","이가","이는",
    "기자","특파원","뉴스","보도","발표","밝혔다","말했다","전했다",
    "the","a","an","is","are","was","were","be","have","has","do","does",
    "and","but","or","in","on","at","by","to","of","up","as","it","its",
}

# ─── 청소년 용어 변환
YOUTH_TERMS = {
    "IPO":"IPO(기업공개·주식시장 상장)","VC":"VC(벤처캐피탈·스타트업 투자사)",
    "MVP":"MVP(최소기능제품·핵심만 갖춘 초기버전)","PMF":"PMF(제품-시장 적합성)",
    "SaaS":"SaaS(인터넷 기반 소프트웨어 서비스)","M&A":"M&A(인수합병)",
    "ROI":"ROI(투자수익률)","BEP":"BEP(손익분기점)","MRR":"MRR(월간반복매출)",
    "ARR":"ARR(연간반복매출)","CAC":"CAC(고객획득비용)","LTV":"LTV(고객생애가치)",
    "API":"API(프로그램 연동 인터페이스)","AI":"AI(인공지능)",
    "LLM":"LLM(대형언어모델)","GPU":"GPU(그래픽처리장치·AI용 고성능 칩)",
    "B2B":"B2B(기업간 거래)","B2C":"B2C(기업-소비자 거래)","KPI":"KPI(핵심성과지표)",
    "OKR":"OKR(목표·핵심결과 관리법)","IR":"IR(투자자 관계·피칭 활동)",
    "PoC":"PoC(개념증명·아이디어 검증)","ESG":"ESG(환경·사회·거버넌스)",
    "IoT":"IoT(사물인터넷)","AR":"AR(증강현실)","VR":"VR(가상현실)",
    "NDA":"NDA(비밀유지계약)","CTO":"CTO(최고기술책임자)","CFO":"CFO(최고재무책임자)",
}

# ─── 도메인별 가중치
DOMAIN_WEIGHTS = {
    "investment": {
        "투자":3.0,"펀딩":3.0,"시리즈":2.8,"유치":2.5,"VC":2.5,
        "벤처":2.2,"엔젤":2.2,"IPO":2.8,"상장":2.5,"억원":2.0,"조원":2.5,
        "기업가치":2.3,"밸류에이션":2.3,"액셀러레이터":2.3,"프리시리즈":2.8,
    },
    "tech": {
        "AI":2.5,"인공지능":2.5,"딥러닝":2.3,"머신러닝":2.3,"GPT":2.3,
        "LLM":2.3,"생성형":2.2,"클라우드":2.0,"SaaS":2.0,"데이터":1.8,
        "알고리즘":2.0,"반도체":2.2,"GPU":2.0,"자율주행":2.2,"로봇":2.0,
    },
    "youth": {
        "청소년":3.5,"청년":3.0,"대학생":2.8,"고등학생":3.0,"중학생":3.0,
        "창업교육":3.2,"창업스쿨":3.0,"창업경진대회":3.0,"해커톤":2.5,
        "멘토링":2.5,"부트캠프":2.5,"피칭":2.5,"린스타트업":2.5,
    },
    "policy": {
        "정부":2.2,"지원":2.0,"공모":2.5,"선발":2.2,"과기부":2.3,
        "중기부":2.3,"창진원":2.5,"지원금":2.5,"보조금":2.3,"규제":2.2,
        "샌드박스":2.5,"예산":2.0,"패키지":2.0,"사업화":2.2,
    },
    "startup": {
        "스타트업":2.8,"창업":2.8,"유니콘":3.0,"데카콘":3.0,
        "성장":1.8,"매출":2.0,"이익":2.0,"흑자":2.2,"인수":2.2,
        "글로벌":2.0,"해외":1.8,"피벗":2.2,"팀빌딩":2.0,
    },
}

DOMAIN_DETECT = {
    "investment": ["투자","펀딩","시리즈","VC","IPO","상장","유치","억원","조원","벤처캐피탈"],
    "tech": ["AI","인공지능","딥러닝","머신러닝","클라우드","SaaS","데이터","알고리즘","GPU","반도체"],
    "youth": ["청소년","청년","대학생","고등학생","창업교육","창업스쿨","해커톤","창업경진"],
    "policy": ["정부","지원사업","공모","과기부","중기부","창진원","보조금","규제","샌드박스"],
    "startup": ["스타트업","창업","유니콘","피벗","팀빌딩","MVP","글로벌","성장","매출"],
}

DOMAIN_KO = {
    "investment":"투자·펀딩","tech":"AI·기술",
    "youth":"청소년 창업","policy":"창업 정책","startup":"스타트업",
}

INTRO = [
    "{d} 분야에서 주목할 만한 소식입니다.",
    "국내 {d} 생태계에서 새로운 움직임이 포착됐습니다.",
    "{d} 관련 업계에서 중요한 소식이 전해졌습니다.",
]
CONTEXT_HINTS = {
    "investment": (
        "이번 투자 소식은 해당 기업의 기술력과 성장 가능성을 시장이 인정한 결과입니다. "
        "스타트업 투자는 보통 시드(초기) → 시리즈A → 시리즈B → 시리즈C → IPO 순서로 진행됩니다. "
        "시리즈가 올라갈수록 기업 가치(밸류에이션)가 커지고, 투자 금액도 증가합니다. "
        "투자금은 통상 제품 개발 가속화, 핵심 인재 채용, 국내외 시장 확장에 집중 사용됩니다.\n\n"
        "청소년 창업가 관점에서 보면, 투자 유치는 단순히 돈을 받는 것이 아닙니다. "
        "투자자는 창업가의 비전을 검증해주는 파트너이자, 네트워크와 경험을 함께 제공하는 조언자 역할을 합니다. "
        "투자자가 왜 이 기업을 선택했는지, 어떤 가능성을 봤는지 분석하는 습관이 창업 감각을 키웁니다."
    ),
    "tech": (
        "기술 혁신은 창업 기회의 핵심 원천입니다. 특히 AI, 클라우드, 바이오테크 등 첨단 기술은 "
        "기존 산업의 규칙을 완전히 바꾸는 '파괴적 혁신'을 가능하게 합니다.\n\n"
        "중요한 것은 기술 자체보다 '그 기술이 어떤 문제를 해결하는가'입니다. "
        "훌륭한 창업가는 새로운 기술을 단순히 따라가는 것이 아니라, 기술의 본질을 이해하고 "
        "실제 사람들의 불편함을 해결하는 데 응용합니다. 이 소식이 어떤 문제를 해결하는지 생각해보세요."
    ),
    "youth": (
        "청소년 창업 생태계가 빠르게 성장하고 있습니다. 정부, 지자체, 대학, 민간 기업이 모두 "
        "청소년 창업가를 발굴하고 육성하는 데 투자를 늘리고 있습니다.\n\n"
        "창업 교육과 지원 프로그램은 단순한 교육을 넘어 실제 창업으로 이어지는 디딤돌입니다. "
        "해커톤, 창업경진대회, 예비창업패키지 등의 프로그램은 아이디어를 실제 제품으로 만들고 "
        "첫 번째 고객을 만나는 경험을 제공합니다. 지금 당장 참여할 수 있는 프로그램을 찾아보세요."
    ),
    "policy": (
        "창업 지원 정책은 예비 창업자들에게 실질적인 자금과 인프라를 제공합니다. "
        "정부의 창업 지원 사업은 크게 자금 지원(보조금/융자), 공간 지원(창업보육센터), "
        "교육·멘토링 지원으로 구분됩니다.\n\n"
        "정책 자금은 경쟁이 치열하지만, 제대로 준비하면 청소년도 충분히 도전할 수 있습니다. "
        "공모 일정을 미리 파악하고, 사업계획서 작성 역량을 키우는 것이 중요합니다. "
        "규제 샌드박스나 특구 지정 소식은 새로운 사업 기회의 신호이기도 합니다."
    ),
    "startup": (
        "스타트업 생태계의 변화는 새로운 창업 기회의 신호입니다. "
        "성공한 스타트업의 공통점은 '명확한 문제 정의', '검증된 시장', '실행력 있는 팀'입니다.\n\n"
        "린 스타트업 방법론에 따르면, 완벽한 제품보다 빠른 가설 검증이 중요합니다. "
        "MVP(최소기능제품)를 만들어 실제 고객에게 테스트하고, 피드백을 반영해 계속 개선하는 것이 "
        "성공 창업가들이 공통적으로 강조하는 접근법입니다. 이 기업의 여정에서 어떤 교훈을 얻을 수 있을지 생각해보세요."
    ),
}
YOUTH_NOTE = [
    "미래 창업가를 꿈꾸는 청소년들이 이 소식을 자신의 창업 아이디어와 연결 짓는 연습을 해보세요. 어떤 문제를 해결할 수 있을지, 어떤 시장이 열릴지 상상하는 것이 창업의 시작입니다.",
    "이 분야에 관심 있는 청소년 창업가라면 관련 동향을 꾸준히 팔로우하고, 비슷한 문제를 해결하는 다양한 접근법을 비교해보는 것을 추천합니다. 창업은 관찰에서 시작됩니다.",
    "이러한 소식 하나하나가 창업 아이디어의 씨앗이 될 수 있습니다. 왜 이 기업이 성공했는지, 어떤 고객 문제를 해결했는지, 어떤 팀이 만들었는지 분석해보는 습관을 들이세요.",
]
CLOSE = [
    "앞으로의 행보가 국내 창업 생태계에 미칠 영향이 주목됩니다. 이 소식을 단순한 뉴스가 아니라, 자신의 창업 방향을 가늠하는 나침반으로 활용해보세요.",
    "관련 분야의 흐름을 지속적으로 주시하는 것이 중요합니다. 한 번의 소식보다 그 흐름을 꿰뚫어보는 안목이 성공 창업가와 그렇지 않은 사람을 구분하는 차이입니다.",
    "이러한 변화 속에서 기회를 발견하는 시각이 중요합니다. 창업은 결국 변화하는 세상 속에서 사람들이 진짜 필요로 하는 것을 찾아내는 여정입니다.",
    "이 소식이 시사하는 트렌드를 잘 읽고, 청소년 창업가로서 어떤 포지셔닝을 가져갈지 깊이 고민해보는 것을 권합니다. 지금의 관심이 내일의 창업 기회가 됩니다.",
]


# ─── 전처리
# ── 추가 전문 용어 변환 (AI 전문화)
EXTRA_TERMS = {
    "VC": "VC(벤처캐피탈·스타트업 투자사)",
    "LP": "LP(출자자·펀드 투자자)",
    "IRR": "IRR(내부수익률·투자 성과 지표)",
    "EBITDA": "EBITDA(세전영업이익·기업 수익성 지표)",
    "B2B": "B2B(기업 간 거래)",
    "B2C": "B2C(기업-소비자 간 거래)",
    "B2G": "B2G(기업-정부 간 거래)",
    "LTV": "LTV(고객 생애 가치)",
    "CAC": "CAC(고객 획득 비용)",
    "ARR": "ARR(연간 반복 매출)",
    "MRR": "MRR(월간 반복 매출)",
    "TAM": "TAM(전체 시장 규모)",
    "SAM": "SAM(유효 시장 규모)",
    "SOM": "SOM(획득 가능 시장)",
    "NPS": "NPS(순추천지수·고객 만족도)",
    "MAU": "MAU(월간 활성 사용자)",
    "DAU": "DAU(일간 활성 사용자)",
    "GMV": "GMV(총 거래액)",
    "ROI": "ROI(투자수익률)",
    "KPI": "KPI(핵심성과지표)",
    "OKR": "OKR(목표·핵심 결과 지표)",
    "CTO": "CTO(최고기술책임자)",
    "CFO": "CFO(최고재무책임자)",
    "COO": "COO(최고운영책임자)",
    "CMO": "CMO(최고마케팅책임자)",
    "CPO": "CPO(최고제품책임자)",
    "SaaS": "SaaS(서비스형 소프트웨어·구독 기반 소프트웨어)",
    "PaaS": "PaaS(서비스형 플랫폼)",
    "IaaS": "IaaS(서비스형 인프라)",
    "API": "API(응용프로그램 인터페이스·소프트웨어 연결 규격)",
    "SDK": "SDK(소프트웨어 개발 키트)",
    "UI": "UI(사용자 인터페이스)",
    "UX": "UX(사용자 경험)",
    "A/B": "A/B(두 가지 방안 비교 테스트)",
    "ML": "ML(머신러닝·기계 학습)",
    "NLP": "NLP(자연어 처리·컴퓨터가 인간 언어를 이해하는 기술)",
    "LLM": "LLM(대형 언어 모델·GPT류 AI)",
    "ESG": "ESG(환경·사회·거버넌스 경영 지표)",
    "CSR": "CSR(기업의 사회적 책임)",
    "IPO": "IPO(기업공개·주식시장 상장)",
    "M&A": "M&A(인수합병)",
    "LOI": "LOI(투자 의향서)",
    "NDA": "NDA(비밀 유지 계약)",
    "MOU": "MOU(업무 협약)",
    "POC": "POC(개념 증명·실현 가능성 검증)",
    "QoQ": "QoQ(전 분기 대비 성장률)",
    "YoY": "YoY(전년 동기 대비 성장률)",
    "R&D": "R&D(연구개발)",
    "BM": "BM(비즈니스 모델)",
    "PM": "PM(프로덕트 매니저·제품 기획자)",
    "BI": "BI(비즈니스 인텔리전스·데이터 기반 의사결정)",
    "CI/CD": "CI/CD(지속적 통합·배포 자동화)",
    "CX": "CX(고객 경험)",
    "PO": "PO(제품 책임자)",    # 국내 창업 지원 프로그램
    "예비창업패키지": "예비창업패키지(중기부 지원, 최대 1억원)",
    "초기창업패키지": "초기창업패키지(중기부 지원, 최대 1억5천만원)",
    "창업도약패키지": "창업도약패키지(도약 단계 지원)",
    "TIPS": "TIPS(민간투자 주도형 기술 창업 지원 프로그램)",
    "K-스타트업": "K-스타트업(중기부 창업 지원 플랫폼)",
    "스타트업코리아": "스타트업코리아(범부처 창업 촉진 정책)",
    "비즈쿨": "비즈쿨(청소년 창업 교육 프로그램)",
    "CVC": "CVC(기업벤처캐피탈·대기업 직접투자)",
    "PBV": "PBV(목적기반차량·모빌리티 분야)",
    "NFT": "NFT(대체불가토큰·블록체인 기반 소유권 증명)",
    "DAO": "DAO(탈중앙화자율조직)",
    "DeFi": "DeFi(탈중앙화금융)",
    "RPA": "RPA(로봇프로세스자동화·반복 업무 자동화)",
    "MLOps": "MLOps(머신러닝 운영 자동화)",
    "RAG": "RAG(검색증강생성·AI 정확도 향상 기법)",
    "GenAI": "생성형 AI(텍스트·이미지·코드를 생성하는 인공지능)",

}

def clean(text: str) -> str:
    if not text: return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-zA-Z]+;|&#\d+;", " ", text)
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"\[.*?기자\]|\[.*?특파원\]|ⓒ.*?무단", "", text)
    text = re.sub(r"[◎▶▲■●◆★☆▷◁【】]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def split_sents(text: str) -> List[str]:
    text = re.sub(r"([A-Z]{2,})\. ", r"\1__D__ ", text)
    text = re.sub(r"(\d+)\. ", r"\1__D__ ", text)
    sents = re.split(
        r"(?<=[.!?]) +(?=[가-힣A-Z\"\'])|(?<=[다요죠])\s+(?=[가-힣])",
        text
    )
    return [s.replace("__D__", ".").strip() for s in sents if 10 <= len(s) <= 600]


def tok(text: str) -> List[str]:
    tokens = re.findall(r"[A-Z]{2,}|[A-Za-z]{3,}|[가-힣]{2,}", text)
    return [t for t in tokens if t.lower() not in STOPWORDS and len(t) >= 2]


def detect_domain(title: str, body: str) -> str:
    combined = (title + " " + body[:400]).lower()
    scores = {d: sum(1 for k in kws if k.lower() in combined)
              for d, kws in DOMAIN_DETECT.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "startup"


# ─── BM25
def bm25(sents: List[str], query: List[str], k1=1.5, b=0.75) -> List[float]:
    N = len(sents)
    if not N: return []
    toks = [tok(s) for s in sents]
    avg_len = sum(len(t) for t in toks) / max(N, 1)
    df = Counter(t for ts in toks for t in set(ts))
    idf = {t: math.log((N - f + 0.5) / (f + 0.5) + 1) for t, f in df.items()}
    scores = []
    for ts in toks:
        tf = Counter(ts)
        dl = len(ts)
        s = sum(
            idf.get(t, 0) * (tf[t] * (k1 + 1)) /
            (tf[t] + k1 * (1 - b + b * dl / max(avg_len, 1)))
            for t in query if t in tf
        )
        scores.append(s)
    mx = max(scores) if scores and max(scores) > 0 else 1
    return [s / mx for s in scores]


# ─── 멀티시그널 스코어
def score_sents(sents: List[str], title: str, domain: str, weights: Dict) -> List[float]:
    N = len(sents)
    if not N: return []
    qt = tok(title)
    tt = set(qt)

    # 도메인 + 학습 가중치 합산
    dw = DOMAIN_WEIGHTS.get(domain, DOMAIN_WEIGHTS["startup"])
    mw = {k: dw.get(k, 1.0) * weights.get(k, 1.0) for k in set(list(dw) + list(weights))}

    bm = bm25(sents, qt)

    tfidf_sc = []
    for s in sents:
        ts = tok(s)
        sc = sum(mw.get(t, 0) for t in ts) / max(len(ts), 1)
        tfidf_sc.append(sc)
    mx_t = max(tfidf_sc) if max(tfidf_sc) > 0 else 1
    tfidf_n = [s / mx_t for s in tfidf_sc]

    pos = []
    for i in range(N):
        r = i / max(N-1, 1)
        pos.append(1.0 if i==0 else 0.85 if r<=0.2 else 0.6 if r<=0.5 else 0.4 if r<=0.8 else 0.25)

    ovlp = [len(set(tok(s)) & tt) / max(len(tt), 1) for s in sents]

    facts = [min(len(re.findall(r"\d+", s)) * 0.1, 0.5) for s in sents]

    return [bm[i]*0.30 + tfidf_n[i]*0.25 + pos[i]*0.20 + ovlp[i]*0.15 + facts[i]*0.10
            for i in range(N)]


def dedup(sents: List[str], scores: List[float], thr=0.5) -> Tuple[List[str], List[float]]:
    pairs = sorted(zip(sents, scores), key=lambda x: -x[1])
    sel, sel_sc = [], []
    for s, sc in pairs:
        sa = set(tok(s))
        if not any(len(sa & set(tok(x))) / max(len(sa | set(tok(x))), 1) > thr for x in sel):
            sel.append(s); sel_sc.append(sc)
    return sel, sel_sc


def apply_terms(text: str) -> str:
    used = set()
    for abbr, full in YOUTH_TERMS.items():
        if re.search(r"\b" + re.escape(abbr) + r"\b", text) and abbr not in used:
            text = re.sub(r"\b" + re.escape(abbr) + r"\b", full, text, count=1)
            used.add(abbr)
    return text


def extract_facts(sents: List[str]) -> List[str]:
    pats = [r"\d+억\s*원", r"\d+조\s*원", r"\d+%", r"\d+배",
            r"시리즈\s*[A-Z가-힣]", r"프리시리즈", r"매출\s*\d+", r"흑자", r"적자"]
    return [s for s in sents if any(re.search(p, s) for p in pats)]


# ─── 메인 요약
def summarize(title: str, body: str, target_len: int = 2000) -> str:
    """
    완전 자체 AI 요약 (외부 API 제로)
    최소 1,000자 / 최대 2,000자 보장
    """
    import random
    weights = load_model()
    body_c = clean(body or "")
    domain = detect_domain(title, body_c)
    d_ko = DOMAIN_KO.get(domain, "스타트업")
    random.seed(hash(title) % 1000)

    # ── 공통 심층 맥락 섹션 (도메인별)
    DEEP_CONTEXT = {
        "investment": """[투자 시장 심층 분석]
스타트업 투자 생태계는 크게 엔젤투자 → 시드 → 시리즈A → 시리즈B → 시리즈C → 프리IPO → IPO(기업공개·주식시장 상장)의 단계로 진행됩니다. 각 단계마다 기업이 증명해야 할 것이 다릅니다. 시드 단계에서는 팀과 아이디어를, 시리즈A에서는 제품-시장 적합성(PMF(제품-시장 적합성))을, 시리즈B 이상에서는 스케일업(대규모 성장) 가능성을 보여줘야 합니다.

국내 벤처 투자 시장은 2020년대 들어 급성장하고 있습니다. AI(인공지능), 딥테크, 바이오, 클린에너지 분야에 특히 대규모 투자가 집중되고 있으며, 글로벌 VC(벤처캐피탈·스타트업 투자사)들의 한국 시장 관심도 높아지고 있습니다.

[청소년 창업가를 위한 핵심 교훈]
투자 유치는 목표가 아니라 수단입니다. 진짜 목표는 고객의 문제를 해결하고 지속 가능한 비즈니스를 만드는 것입니다. 투자자들이 이 기업에 왜 투자했는지, 어떤 가능성을 봤는지 분석하는 것이 창업 감각을 키우는 최고의 공부입니다. 또한 피칭(투자자 발표)에서 중요한 것은 화려한 발표보다 '이 팀이 왜 이 문제를 해결할 수 있는가'에 대한 진정성 있는 답변입니다.""",

        "tech": """[기술 트렌드 심층 분석]
현재 가장 주목받는 기술 분야는 AI(인공지능)/머신러닝, 양자컴퓨팅, 바이오테크, 클린에너지, 웹3.0 등입니다. 이 기술들은 기존 산업의 패러다임을 완전히 바꾸는 '파괴적 혁신(Disruptive Innovation)'을 만들어내고 있습니다.

특히 AI 기술은 의료, 금융, 교육, 제조, 유통 등 거의 모든 산업에 침투하고 있습니다. AI를 단순히 사용하는 기업과 AI를 핵심 역량으로 내재화한 기업 사이의 경쟁력 격차가 빠르게 벌어지고 있습니다.

[청소년 창업가를 위한 핵심 교훈]
기술 자체보다 중요한 것은 '그 기술이 해결하는 진짜 문제'입니다. 성공한 기술 창업가들은 기술을 위한 기술이 아니라, 사람들의 실제 불편함을 해결하기 위해 기술을 활용합니다. 지금 당장 주변에서 불편하게 느끼는 것을 기록해보고, 최신 기술로 어떻게 해결할 수 있을지 상상해보세요. 그것이 창업 아이디어의 씨앗이 됩니다.""",

        "youth": """[청소년 창업 생태계 현황]
한국의 청소년 창업 지원 인프라는 빠르게 성장하고 있습니다. 중기부(중소벤처기업부), 교육부, 과기부(과학기술정보통신부)가 협력해 청소년 창업 프로그램을 지속 확대하고 있으며, 전국 17개 광역자치단체 모두 청소년 창업 지원 사업을 운영하고 있습니다.

주요 지원 프로그램으로는 예비창업패키지(최대 1억원), 창업중심대학 프로그램, 청소년 비즈쿨, 고교창업교육 100선, 전국 청소년창업경진대회 등이 있습니다. 참가 자격은 프로그램마다 다르지만 대부분 만 15~39세 청소년 및 청년을 대상으로 합니다.

[지금 당장 할 수 있는 것]
창업을 시작하기 위해 완벽한 아이디어가 필요하지 않습니다. 먼저 가장 불편하게 느끼는 문제 5가지를 적어보세요. 그 중 가장 많은 사람들이 공감할 것 같은 문제 하나를 골라, 간단한 해결책을 생각해보세요. 이것이 바로 린 스타트업(Lean Startup)의 시작입니다. 지금 당장 친구들에게 아이디어를 공유하고 피드백을 받아보세요.""",

        "policy": """[정부 창업 지원 정책 체계]
한국 정부의 창업 지원 정책은 창업 단계별로 촘촘하게 설계되어 있습니다. 예비창업 단계에서는 예비창업패키지와 창업교육 프로그램이, 초기 창업 단계에서는 초기창업패키지와 창업보육센터(BI)가, 성장 단계에서는 창업도약패키지와 TIPS 프로그램이 지원됩니다.

특히 최근에는 딥테크(AI, 바이오, 소재, 우주 등 첨단기술 분야) 창업에 대한 지원이 대폭 강화되고 있습니다. 규제 샌드박스 제도를 통해 기존 법령의 규제를 받지 않고 혁신 서비스를 테스트할 수 있는 기회도 늘어나고 있습니다.

[청소년 창업가를 위한 정책 활용 전략]
정부 지원금을 받기 위해서는 체계적인 사업계획서 작성 능력이 필수입니다. 핵심은 '우리 팀이 왜 이 문제를 해결할 적임자인가', '우리 솔루션이 왜 시장에서 경쟁력이 있는가', '투자 대비 어떤 성과를 낼 수 있는가'를 명확히 설명하는 것입니다. 공모 일정은 보통 연초에 발표되므로 미리 달력에 표시해두는 습관을 들이세요.""",

        "startup": """[스타트업 성공 방정식]
성공한 스타트업들을 분석하면 공통적인 패턴이 보입니다. 첫째, 명확한 문제 정의입니다. '좋은 것을 만들자'가 아니라 '이 특정한 사람들이 겪는 이 특정한 문제를 해결하자'는 집중력이 중요합니다. 둘째, 빠른 검증입니다. 아이디어를 완벽하게 다듬기보다 빠르게 테스트해 피드백을 얻는 것이 핵심입니다. 셋째, 팀입니다. 훌륭한 팀은 어떤 문제도 해결할 수 있지만, 반대의 경우엔 좋은 아이디어도 실패합니다.

린 스타트업(Lean Startup) 방법론의 핵심은 Build-Measure-Learn 사이클입니다. 먼저 MVP(최소기능제품·핵심만 갖춘 초기버전)를 만들고, 실제 사용자에게 테스트하고, 데이터를 분석해 방향을 결정합니다. 이 사이클을 빠르게 반복할수록 성공 확률이 높아집니다.

[청소년 창업가를 위한 첫 걸음]
창업의 시작은 거창하지 않아도 됩니다. 주변의 불편한 점을 관찰하고, 그것을 해결하는 가장 단순한 방법을 생각해보세요. 카카오톡 오픈채팅방이나 인스타그램 계정 하나로도 첫 번째 고객을 만날 수 있습니다. 지금 당장 시작하는 것이 최고의 창업 교육입니다.""",
    }

    # ── 케이스 1: 충분한 본문 (200자 이상)
    if len(body_c) >= 200:
        sents = split_sents(body_c) or [p.strip() for p in body_c.split("\n") if len(p.strip()) >= 10]
        if sents:
            sc = score_sents(sents, title, domain, weights)
            deduped, _ = dedup(sents, sc)
            order = {s: i for i, s in enumerate(sents)}
            top = sorted(deduped[:25], key=lambda s: order.get(s, 999))
            facts = extract_facts(top)

            parts = [random.choice(INTRO).format(d=d_ko)]
            cur = len(parts[0])
            body_parts = []
            used_set = set()

            # 팩트 문장 우선
            for s in facts[:6]:
                if cur + len(s) > target_len * 0.50: break
                body_parts.append(s); used_set.add(s); cur += len(s)

            # 일반 상위 문장
            for s in top:
                if s in used_set: continue
                if cur + len(s) > target_len * 0.60: break
                body_parts.append(s); cur += len(s)

            if body_parts:
                parts.append("\n".join(body_parts))

            # 심층 맥락 추가
            deep = DEEP_CONTEXT.get(domain, DEEP_CONTEXT["startup"])
            parts.append(deep)

            # 청소년 노트 + 마무리
            parts.append(random.choice(YOUTH_NOTE))
            parts.append(random.choice(CLOSE))

            result = apply_terms("\n\n".join(parts)).strip()

            # 최소 길이 보장 — 부족하면 CONTEXT_HINTS 추가
            if len(result) < 1000:
                ctx = CONTEXT_HINTS.get(domain, CONTEXT_HINTS["startup"])
                result = result + "\n\n" + ctx
                result = apply_terms(result).strip()

            return result[:2500]  # 최대 2500자

    # ── 케이스 2: 짧은 본문 (30~200자)
    if len(body_c) >= 30:
        deep = DEEP_CONTEXT.get(domain, DEEP_CONTEXT["startup"])
        ctx = CONTEXT_HINTS.get(domain, CONTEXT_HINTS["startup"])
        result = apply_terms(
            f"{random.choice(INTRO).format(d=d_ko)}\n\n"
            f"[핵심 내용]\n{title}\n\n"
            f"{body_c}\n\n"
            f"[배경 및 분석]\n{ctx}\n\n"
            f"{deep}\n\n"
            f"{random.choice(YOUTH_NOTE)}\n\n"
            f"{random.choice(CLOSE)}"
        ).strip()
        return result[:2500]

    # ── 케이스 3: 제목만 — 제목 + 심층 분석으로 1,000자 이상 보장
    deep = DEEP_CONTEXT.get(domain, DEEP_CONTEXT["startup"])
    ctx = CONTEXT_HINTS.get(domain, CONTEXT_HINTS["startup"])
    result = apply_terms(
        f"{random.choice(INTRO).format(d=d_ko)}\n\n"
        f"[뉴스 요약]\n{title}\n\n"
        f"[심층 분석]\n{deep}\n\n"
        f"[추가 맥락]\n{ctx}\n\n"
        f"{random.choice(YOUTH_NOTE)}\n\n"
        f"{random.choice(CLOSE)}"
    ).strip()
    return result[:2500]


# ─── ROUGE-L
def rouge_l(hyp: str, ref: str) -> float:
    h, r = tok(hyp)[:300], tok(ref)[:300]
    if not h or not r: return 0.0
    m, n = len(h), len(r)
    dp = [[0]*(n+1) for _ in range(m+1)]
    for i in range(1, m+1):
        for j in range(1, n+1):
            dp[i][j] = dp[i-1][j-1]+1 if h[i-1]==r[j-1] else max(dp[i-1][j], dp[i][j-1])
    lcs = dp[m][n]
    p, rv = lcs/max(m,1), lcs/max(n,1)
    return 2*p*rv/(p+rv) if (p+rv) > 0 else 0.0


def evaluate(articles: List[Dict]) -> Dict:
    sc = []
    for a in articles[:100]:
        title, ref = a.get("title",""), a.get("ai_summary","")
        body = clean(a.get("body","") or a.get("excerpt",""))
        if not (title and ref and len(ref) > 100): continue
        sc.append(rouge_l(summarize(title, body), ref))
    if not sc: return {"rouge_l":0.0,"n":0}
    return {"rouge_l":round(sum(sc)/len(sc),4),"n":len(sc),"min":round(min(sc),4),"max":round(max(sc),4)}


# ─── 지속 학습
def train(articles: List[Dict]) -> Dict:
    current = load_model()
    contrib = defaultdict(list)
    for a in articles:
        title, ref = a.get("title",""), a.get("ai_summary","")
        body = clean(a.get("body","") or a.get("excerpt",""))
        if not (title and ref and len(ref) > 100): continue
        for s in split_sents(body):
            sc = rouge_l(s, ref)
            if sc > 0.05:
                for t in tok(s): contrib[t].append(sc)
    new_w = dict(current)
    updated = 0
    for kw, vals in contrib.items():
        if len(vals) < 3: continue
        avg = sum(vals)/len(vals)
        old = current.get(kw, 1.0)
        new_w[kw] = round(max(0.5, min(0.7*old + 0.3*(1.0+avg*8), 5.0)), 3)
        updated += 1
    print(f"✅ 학습: {len(articles)}건 → {updated}개 키워드 업데이트")
    top = sorted(new_w.items(), key=lambda x:-x[1])[:5]
    print(f"   상위: {top}")
    return new_w


# ─── 모델 저장/로드
def save_model(weights: Dict, metrics: Dict = None):
    with open(MODEL_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "version": VERSION,
            "weights": weights,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "metrics": metrics or {},
            "keyword_count": len(weights),
        }, f, ensure_ascii=False, indent=2)
    print(f"✅ 모델 저장: {len(weights)}개 키워드")


def load_model() -> Dict:
    if os.path.exists(MODEL_PATH):
        try:
            with open(MODEL_PATH,"r",encoding="utf-8") as f:
                d = json.load(f)
            w = d.get("weights",{})
            if len(w) > 20: return w
        except Exception: pass
    # v2 마이그레이션
    v2 = os.path.join(os.path.dirname(__file__), "insightship_model_v2.json")
    if os.path.exists(v2):
        try:
            with open(v2,"r",encoding="utf-8") as f:
                return json.load(f).get("weights",{})
        except Exception: pass
    # 기본: 도메인 가중치 병합
    merged = {}
    for dw in DOMAIN_WEIGHTS.values():
        for k,v in dw.items(): merged[k] = max(merged.get(k,0), v)
    return merged


def init_model():
    merged = {}
    for dw in DOMAIN_WEIGHTS.values():
        for k,v in dw.items(): merged[k] = max(merged.get(k,0), v)
    save_model(merged, {"init": True})
    return merged


# ─── GitHub Actions 진입점
def run_training():
    import urllib.request
    SB_URL = os.environ.get("SUPABASE_URL","")
    SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY","")
    if not (SB_URL and SB_KEY):
        print("⚠️ Supabase 환경변수 없음 — 기본 모델")
        init_model(); return
    H = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
    url = (f"{SB_URL}/rest/v1/articles?select=title,body,excerpt,ai_summary"
           f"&ai_summary=not.is.null&status=eq.published&order=created_at.desc&limit=2000")
    with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=30) as r:
        arts = json.loads(r.read())
    print(f"📚 학습 데이터: {len(arts)}건")
    before = evaluate(arts[:100])
    print(f"📊 학습 전 ROUGE-L: {before['rouge_l']} (n={before['n']})")
    new_w = train(arts)
    save_model(new_w, before)


def run_batch():
    import urllib.request
    SB_URL = os.environ.get("SUPABASE_URL","")
    SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY","")
    if not (SB_URL and SB_KEY): print("⚠️ 환경변수 없음"); return
    H_r = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
    H_w = {**H_r, "Content-Type": "application/json", "Prefer": "return=minimal"}
    url = (f"{SB_URL}/rest/v1/articles?select=id,title,body,excerpt"
           f"&or=(ai_summary.is.null,ai_summary.eq.%28%EC%9A%94%EC%95%BD%20%EC%83%9D%EB%9E%B5%29)"
           f"&status=eq.published&order=created_at.desc&limit=50")
    with urllib.request.urlopen(urllib.request.Request(url, headers=H_r), timeout=20) as r:
        arts = json.loads(r.read())
    print(f"처리할 기사: {len(arts)}건")
    ok = fail = 0
    for a in arts:
        body = clean(a.get("body","") or a.get("excerpt","") or "")
        result = summarize(a["title"], body)
        if not result or len(result) < 30: fail += 1; continue
        payload = json.dumps({"ai_summary": result}).encode()
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/articles?id=eq.{a['id']}",
            data=payload, headers=H_w, method="PATCH"
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                ok += 1 if r.status in (200, 204) else 0
                if r.status not in (200, 204): fail += 1
        except Exception as e:
            print(f"⚠️ {e}", file=sys.stderr); fail += 1
    print(f"✅ 완료: {ok}개 성공 / {fail}개 실패")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        cases = [
            ("AI 스타트업 테크이노, 시리즈B 300억 투자 유치",
             "인공지능 스타트업 테크이노가 시리즈B 라운드에서 300억 원을 유치했다. "
             "소프트뱅크벤처스와 카카오인베스트먼트가 공동 리드했다. "
             "이번 투자금은 AI 모델 고도화와 동남아 진출에 활용한다."),
            ("관악S밸리 청소년 창업학교, 미림마이스터고서 열려", ""),
            ("창업진흥원, 2026년 예비창업패키지 1200명 모집", ""),
        ]
        for title, body in cases:
            r = summarize(title, body)
            print(f"\n제목: {title}")
            print(f"길이: {len(r)}자 | 도메인: {detect_domain(title, body)}")
            print(f"요약:\n{r}\n{'─'*50}")
    elif sys.argv[1] == "train": run_training()
    elif sys.argv[1] == "batch": run_batch()
    elif sys.argv[1] == "init": init_model()
    elif sys.argv[1] == "eval":
        m = load_model()
        print(f"v{VERSION} | 키워드: {len(m)}개")
        print(f"상위 10: {sorted(m.items(), key=lambda x:-x[1])[:10]}")
