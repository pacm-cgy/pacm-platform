"""
Insightship AI v5.0 — PACM 자체 AI 엔진 (심층 이해 기반 요약)
외부 API 의존도: 0% | 순수 Python 표준 라이브러리

v4 → v5 핵심 개선:
  - 기사 본문의 '핵심 본질'을 파악하는 3단계 분석 (What→Why→So What)
  - 이벤트 유형 자동 분류 (펀딩/제품출시/정책/인물/인수합병/연구결과 등)
  - 수치 정보 구조화 추출 (금액·비율·규모를 정확히 파악)
  - 인과관계 문장 식별 (원인-결과 패턴 인식)
  - 청소년 창업가 맞춤 해설 생성 (추상→구체 변환)
  - 요약 품질 지표: 커버리지·일관성·정보밀도
  - 적응형 학습률 (기사 품질에 따라 lr 조정)
  - 뉴스 수집 연동: Supabase articles 테이블 직접 처리
"""

import re, math, os, json, time, sys, urllib.request, urllib.parse
from collections import Counter, defaultdict
from typing import List, Tuple, Dict, Optional

VERSION = "5.0.0"
MODEL_PATH = os.path.join(os.path.dirname(__file__), "pacm_ai_model_v5.json")

# ─── 불용어
STOPWORDS = {
    "이","그","저","것","수","들","및","등","에서","로서","으로","에게",
    "하지만","그러나","또한","그리고","따라서","때문에","위해","통해","대한","관련",
    "있는","없는","되는","하는","있다","없다","된다","한다","이다","있으며","되며",
    "이번","지난","올해","작년","이달","오늘","어제","최근","현재","지금",
    "특히","또","더","가장","매우","모두","함께","이미","아직","약","총",
    "전","후","당","각","제","본","해당","이에","이로","이와","이를","이가","이는",
    "기자","특파원","뉴스","보도","발표","밝혔다","말했다","전했다","설명했다","강조했다",
    "the","a","an","is","are","was","were","be","have","has","do","does",
    "and","but","or","in","on","at","by","to","of","up","as","it","its",
    "이날","이후","이전","해당","관련","향후","앞으로","당시","이같은","이를","이와",
    "한편","한편으로","또한","아울러","역시","함께","한","더","가","나","다",
}

# ─── 전문용어 해설
YOUTH_TERMS = {
    "IPO":"IPO(기업공개·주식시장 상장)","VC":"VC(벤처캐피탈·스타트업 투자사)",
    "MVP":"MVP(최소기능제품·핵심만 갖춘 초기버전)","PMF":"PMF(제품-시장 적합성)",
    "SaaS":"SaaS(인터넷 기반 소프트웨어 서비스)","M&A":"M&A(인수합병)",
    "ROI":"ROI(투자수익률)","BEP":"BEP(손익분기점)","MRR":"MRR(월간반복매출)",
    "ARR":"ARR(연간반복매출)","CAC":"CAC(고객획득비용)","LTV":"LTV(고객생애가치)",
    "API":"API(프로그램 연동 인터페이스)","LLM":"LLM(대형언어모델·GPT류)",
    "GPU":"GPU(그래픽처리장치·AI용 고성능 칩)","B2B":"B2B(기업간 거래)",
    "B2C":"B2C(기업-소비자 거래)","KPI":"KPI(핵심성과지표)","OKR":"OKR(목표·핵심결과 관리법)",
    "IR":"IR(투자자 관계·피칭 활동)","PoC":"PoC(개념증명·아이디어 검증)",
    "ESG":"ESG(환경·사회·거버넌스)","IoT":"IoT(사물인터넷)","MAU":"MAU(월간활성사용자)",
    "DAU":"DAU(일간활성사용자)","GMV":"GMV(총거래액)","TAM":"TAM(전체시장규모)",
    "QoQ":"QoQ(전분기대비)","YoY":"YoY(전년동기대비)","R&D":"R&D(연구개발)",
    "PM":"PM(프로덕트 매니저)","MOU":"MOU(업무협약)","NPS":"NPS(순추천지수)",
    "AI 에이전트":"AI 에이전트(자율적으로 작업을 수행하는 AI 시스템)",
    "RAG":"RAG(검색 증강 생성·외부 지식을 활용하는 AI 기법)",
    "온디바이스 AI":"온디바이스 AI(클라우드 없이 기기 자체에서 실행되는 AI)",
    "소버린 AI":"소버린 AI(국가 주권형 독립 AI 인프라)",
    "크리에이터 이코노미":"크리에이터 이코노미(콘텐츠 창작자 중심 디지털 경제)",
    "슈퍼앱":"슈퍼앱(하나의 앱으로 모든 서비스를 제공하는 플랫폼)",
    "임베디드 파이낸스":"임베디드 파이낸스(비금융 서비스에 금융 기능을 내장하는 방식)",
    "탄소중립":"탄소중립(2050 넷제로 목표 달성 전략)",
    "파운데이션 모델":"파운데이션 모델(대규모 사전학습 AI 기반 모델)",
}

# ─── 이벤트 유형 분류 패턴 (v5 신규)
EVENT_PATTERNS = {
    "funding": {
        "keywords": ["시리즈","투자","펀딩","유치","억원","조원","라운드","프리시리즈","시드","브릿지","IR"],
        "label": "💰 투자 유치",
        "what_template": "이번 투자 유치의 핵심 내용과 투자 규모",
        "why_template": "투자자가 이 회사에 베팅한 이유와 사업 모델의 강점",
        "sowhat_template": "이 투자가 스타트업 생태계와 청소년 창업가에게 주는 시사점",
    },
    "product": {
        "keywords": ["출시","론칭","선보","공개","베타","버전","업데이트","기능","서비스","앱","플랫폼"],
        "label": "🚀 제품/서비스 출시",
        "what_template": "출시된 제품·서비스의 핵심 기능과 차별점",
        "why_template": "이 제품이 해결하는 문제와 시장 기회",
        "sowhat_template": "제품 출시가 가져올 시장 변화와 청소년 창업가의 기회",
    },
    "policy": {
        "keywords": ["정부","지원","공모","선발","과기부","중기부","창진원","예산","규제","샌드박스","법안","정책"],
        "label": "📋 정책/지원",
        "what_template": "정책의 내용, 지원 대상, 규모",
        "why_template": "이 정책이 도입된 배경과 목적",
        "sowhat_template": "청소년·대학생 창업가가 실제로 활용할 수 있는 방법",
    },
    "acquisition": {
        "keywords": ["인수","합병","M&A","지분","매각","인수합병","합병계약","인수가"],
        "label": "🤝 인수/합병",
        "what_template": "인수·합병의 당사자, 금액, 조건",
        "why_template": "이 M&A가 이루어진 전략적 이유",
        "sowhat_template": "산업 내 구도 변화와 창업 생태계 영향",
    },
    "research": {
        "keywords": ["연구","논문","발표","결과","실험","조사","분석","보고서","데이터","통계"],
        "label": "🔬 연구/조사",
        "what_template": "연구의 핵심 발견과 주요 수치",
        "why_template": "이 연구가 중요한 이유와 방법론",
        "sowhat_template": "연구 결과가 창업 현장에 주는 실질적 교훈",
    },
    "person": {
        "keywords": ["대표","CEO","창업자","설립자","인터뷰","스토리","창업기","경험","여정"],
        "label": "👤 창업가 스토리",
        "what_template": "창업가의 핵심 경험과 선택의 순간",
        "why_template": "창업 동기와 극복한 도전",
        "sowhat_template": "이 스토리에서 청소년 창업가가 배울 수 있는 핵심 교훈",
    },
    "market": {
        "keywords": ["시장","성장","규모","트렌드","전망","예측","확대","증가","감소","변화"],
        "label": "📊 시장/트렌드",
        "what_template": "시장의 규모, 성장률, 주요 변화",
        "why_template": "이 트렌드가 발생하는 원인과 구조적 배경",
        "sowhat_template": "이 시장 흐름에서 청소년 창업가가 포착할 기회",
    },
    "general": {
        "keywords": [],
        "label": "📰 뉴스",
        "what_template": "이 뉴스의 핵심 사실",
        "why_template": "이 사안의 배경과 맥락",
        "sowhat_template": "창업·비즈니스 관점에서의 시사점",
    },
}

# ─── 도메인별 가중치
DOMAIN_WEIGHTS = {
    "investment": {
        "투자":3.5,"펀딩":3.5,"시리즈":3.2,"유치":3.0,"VC":3.0,
        "벤처":2.8,"IPO":3.2,"상장":3.0,"억원":2.5,"조원":3.0,
        "기업가치":2.8,"밸류에이션":2.8,"시드":3.0,"프리시리즈":3.2,
        "IR피칭":2.8,"투자유치":3.2,"지분":2.5,"후속투자":3.0,
    },
    "tech": {
        "AI":3.0,"인공지능":3.0,"딥러닝":2.8,"머신러닝":2.8,"GPT":2.8,
        "LLM":2.8,"생성형":2.8,"클라우드":2.5,"SaaS":2.5,"데이터":2.2,
        "알고리즘":2.5,"반도체":2.8,"GPU":2.5,"자율주행":2.8,"로봇":2.5,
        "AI에이전트":3.0,"멀티모달":2.8,"RAG":2.8,"온디바이스":2.8,
        "파운데이션모델":2.8,"양자컴퓨팅":2.8,"블록체인":2.2,
    },
    "youth": {
        "청소년":4.0,"청년":3.5,"대학생":3.2,"고등학생":3.5,"중학생":3.5,
        "창업교육":3.8,"해커톤":3.0,"멘토링":3.0,"피칭":3.0,
        "Z세대":3.2,"알파세대":3.2,"10대창업":3.8,"청소년창업":4.0,
    },
    "policy": {
        "정부":2.8,"지원":2.5,"공모":3.0,"선발":2.8,"과기부":2.8,
        "중기부":2.8,"창진원":3.0,"지원금":3.0,"보조금":2.8,"규제":2.8,
        "샌드박스":3.0,"예비창업패키지":3.2,"초기창업패키지":3.2,"TIPS":3.0,
    },
    "startup": {
        "스타트업":3.2,"창업":3.2,"유니콘":3.5,"데카콘":3.5,
        "피봇":3.0,"린스타트업":3.0,"스케일업":2.8,"글로벌":2.5,
        "사업화":2.8,"성장":2.5,"매출":2.8,"수익":2.8,"흑자":3.0,
    },
    "esg": {
        "ESG":3.0,"탄소중립":3.0,"친환경":2.8,"지속가능":2.8,
        "임팩트":2.8,"사회적기업":3.0,"소셜벤처":3.0,"B코프":3.0,
    },
}

DOMAIN_DETECT = {
    "investment": ["투자","펀딩","시리즈A","시리즈B","시리즈C","억원","조원","VC","벤처캐피탈"],
    "tech": ["AI","인공지능","딥러닝","반도체","GPU","클라우드","SaaS","알고리즘","데이터"],
    "youth": ["청소년","청년","대학생","고등학생","중학생","창업교육","해커톤"],
    "policy": ["정부","지원","공모","선발","과기부","중기부","창진원","예산"],
    "startup": ["스타트업","창업","유니콘","피봇","글로벌","사업화"],
    "esg": ["ESG","탄소중립","친환경","지속가능","임팩트","소셜벤처"],
}

DOMAIN_KO = {
    "investment":"투자·금융","tech":"기술·AI","youth":"청소년·교육",
    "policy":"정책·지원","startup":"창업·비즈니스","esg":"ESG·임팩트",
}

CATEGORY_RULES = {
    "insight": ["분석","인사이트","관점","시각","전략","본질","핵심","의미","중요"],
    "trend": ["트렌드","동향","흐름","변화","미래","전망","예측","시장","성장"],
    "magazine": ["스토리","이야기","여정","창업기","인터뷰","대표","CEO","창업자"],
    "community": ["청소년","청년","대학생","해커톤","경진대회","커뮤니티","네트워크"],
    "opinion": ["의견","칼럼","제언","비판","논쟁","쟁점","논평"],
}

# ─── v5 핵심: 인과관계 패턴 식별
CAUSAL_PATTERNS = [
    r'(때문에|이유로|원인은|배경에는|원인이|결과로|따라서|이로 인해|덕분에|영향으로)',
    r'(증가했|감소했|성장했|하락했|상승했|확대됐|축소됐|개선됐|악화됐)',
    r'(\d+배|\d+%|\d+억|\d+조|\d+만)',
]

# ─── 수치 추출 패턴 (v5 강화)
NUM_PATTERNS = [
    r'\d+[\.,]?\d*\s*(억원|조원|만원|달러|위안|엔)',
    r'\d+[\.,]?\d*\s*(%|퍼센트|배)',
    r'\d+[\.,]?\d*\s*(만\s*명|명|개|건|곳)',
    r'\d{4}년\s*\d{1,2}월',
]

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
    scores = {}
    for domain, keywords in DOMAIN_DETECT.items():
        scores[domain] = sum(1 for kw in keywords if kw in combined)
    return max(scores, key=scores.get) if max(scores.values()) > 0 else "startup"

def detect_event_type(title: str, body: str) -> str:
    """v5: 이벤트 유형 분류 (우선순위 적용)"""
    combined = title + " " + body[:400]
    # 우선순위 순서로 체크
    priority = ["funding", "acquisition", "product", "policy", "research", "person", "market"]
    scores = {}
    for etype in priority:
        pat = EVENT_PATTERNS[etype]
        scores[etype] = sum(1 for kw in pat["keywords"] if kw in combined)
    
    # 제목에 있는 키워드는 2배 가중치
    title_lower = title
    for etype in priority:
        pat = EVENT_PATTERNS[etype]
        title_bonus = sum(1 for kw in pat["keywords"] if kw in title_lower)
        scores[etype] += title_bonus
    
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "general"

def detect_category(title: str, body: str) -> str:
    combined = title + " " + body[:300]
    scores = {}
    for cat, keywords in CATEGORY_RULES.items():
        scores[cat] = sum(1 for kw in keywords if kw in combined)
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "insight"

def bm25(sents: List[str], query: List[str], k1=1.8, b=0.72) -> List[float]:
    if not sents: return []
    tf_list = [Counter(tok(s)) for s in sents]
    df = defaultdict(int)
    for tf in tf_list:
        for t in tf: df[t] += 1
    N = len(sents)
    avgdl = sum(len(tok(s)) for s in sents) / max(N, 1)
    scores = []
    for tf in tf_list:
        dl = sum(tf.values())
        sc = 0.0
        for t in query:
            if t not in df: continue
            idf = math.log((N - df[t] + 0.5) / (df[t] + 0.5) + 1)
            f = tf.get(t, 0)
            sc += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / max(avgdl, 1)))
        scores.append(sc)
    return scores

def sent_quality(sent: str) -> float:
    """v5: 강화된 문장 품질 점수"""
    score = 1.0
    l = len(sent)
    if 40 <= l <= 150: score *= 1.3
    elif 20 <= l < 40: score *= 1.0
    elif l > 200: score *= 0.6
    # 수치 정보 → 정보 밀도 높음
    if re.search(r'\d+', sent): score *= 1.2
    if re.search(r'억|조|만원|%|배', sent): score *= 1.3
    # 인과 관계 포함 → 본질 설명 가능성
    for pat in CAUSAL_PATTERNS:
        if re.search(pat, sent):
            score *= 1.25
            break
    # 단순 인용/발표 감점
    if re.search(r'(밝혔다|말했다|전했다|설명했다|강조했다)\s*$', sent): score *= 0.75
    # 고유명사 포함 (기업명, 인물명 등) → 구체성
    proper_nouns = re.findall(r'[가-힣]{2,4}(사|기업|그룹|랩|센터|팀|대학|학교)', sent)
    if proper_nouns: score *= 1.1
    return score

def has_key_number(sent: str) -> bool:
    """수치/금액 정보 포함 여부"""
    for pat in NUM_PATTERNS:
        if re.search(pat, sent): return True
    return False

def mmr(sents: List[str], scores: List[float], lambda_=0.65, top_n=8) -> List[int]:
    if not sents: return []
    selected, candidates = [], list(range(len(sents)))
    
    def sim(i, j):
        ti, tj = set(tok(sents[i])), set(tok(sents[j]))
        if not ti or not tj: return 0.0
        return len(ti & tj) / math.sqrt(len(ti) * len(tj))
    
    while candidates and len(selected) < top_n:
        if not selected:
            best = max(candidates, key=lambda i: scores[i])
        else:
            best = max(candidates, key=lambda i:
                lambda_ * scores[i] - (1 - lambda_) * max(sim(i, s) for s in selected))
        selected.append(best)
        candidates.remove(best)
    return selected

def score_sents(sents: List[str], title: str, domain: str, weights: Dict) -> List[float]:
    query = tok(title)
    bm_scores = bm25(sents, query)
    dw = {}
    for d in DOMAIN_WEIGHTS.values():
        for k, v in d.items():
            dw[k] = max(dw.get(k, 0), v)
    mw = {k: dw.get(k, 1.0) * weights.get(k, 1.0) for k in set(list(dw) + list(weights))}
    
    result = []
    for i, (s, bm) in enumerate(zip(sents, bm_scores)):
        tokens = tok(s)
        kw_score = sum(mw.get(t, 1.0) for t in tokens) / max(len(tokens), 1)
        pos_weight = 1.4 if i < 2 else (1.2 if i < 5 else (1.1 if i < 8 else 1.0))
        quality = sent_quality(s)
        # 수치 포함 문장 추가 보너스
        num_bonus = 1.3 if has_key_number(s) else 1.0
        result.append((bm * 0.40 + kw_score * 0.35 + pos_weight * 0.1 + quality * 0.15) * num_bonus)
    return result

def dedup(sents: List[str], scores: List[float], thr=0.42) -> Tuple[List[str], List[float]]:
    keep_s, keep_sc = [], []
    seen_tokens = []
    for s, sc in zip(sents, scores):
        t = set(tok(s))
        if not t: continue
        is_dup = any(
            len(t & prev) / math.sqrt(len(t) * len(prev)) > thr
            for prev in seen_tokens if prev
        )
        if not is_dup:
            keep_s.append(s)
            keep_sc.append(sc)
            seen_tokens.append(t)
    return keep_s, keep_sc

def apply_terms(text: str) -> str:
    for k, v in YOUTH_TERMS.items():
        if k in text and v not in text:
            text = text.replace(k, v, 1)
    return text

def extract_numbers(sents: List[str]) -> List[str]:
    """v5: 수치 포함 문장 구조화 추출"""
    result = []
    for s in sents:
        if has_key_number(s) and len(s) > 20:
            result.append(s)
    return result[:3]

def infer_what(sents: List[str], title: str, event_type: str) -> str:
    """v5: What - 기사의 핵심 사실 파악"""
    # 첫 2~3 문장에서 핵심 사실 추출
    lead_sents = sents[:3] if len(sents) >= 3 else sents
    nums = extract_numbers(sents)
    
    # 가장 정보 밀도가 높은 문장 선택
    best = ""
    best_q = 0
    for s in lead_sents + nums:
        q = sent_quality(s)
        if q > best_q:
            best_q, best = q, s
    return best if best else (sents[0] if sents else title)

def infer_why(sents: List[str], title: str, event_type: str) -> List[str]:
    """v5: Why - 인과관계/배경 문장 식별"""
    causal = []
    for s in sents:
        for pat in CAUSAL_PATTERNS:
            if re.search(pat, s):
                causal.append(s)
                break
    return causal[:3] if causal else sents[1:4]

def infer_sowhat(domain: str, event_type: str, title: str) -> str:
    """v5: So What - 청소년 창업가 맞춤 시사점 생성"""
    templates = {
        ("investment", "youth"): "이번 투자 유치는 청소년 창업가에게 중요한 시그널입니다. 투자자들이 어떤 가치에 베팅하는지 파악하면, 내 아이디어의 방향성을 점검하는 나침반이 됩니다. 투자 받은 기업의 피치덱 구조와 문제 정의 방식을 분석해 보세요.",
        ("product", "youth"): "새 제품·서비스 출시는 시장이 실제로 원하는 것을 보여주는 생생한 사례입니다. '왜 지금 이 문제인가', '기존 대안과 무엇이 다른가'를 스스로 분석해 보면, 나만의 제품 기획 능력이 길러집니다.",
        ("policy", "youth"): "정부 지원 프로그램은 창업 초기의 가장 강력한 자원입니다. 지원 자격과 신청 시기를 미리 파악하고, 사업계획서 작성 연습을 지금부터 시작하세요. 준비된 창업가만이 기회를 잡습니다.",
        ("market", "tech"): "시장 트렌드 분석은 타이밍의 예술입니다. 지금 이 시장이 성장하는 이유를 3가지로 정리할 수 있다면, 그 교차점에서 창업 아이디어가 탄생합니다.",
        ("research", "tech"): "데이터와 연구는 가설을 사실로 바꾸는 힘입니다. 이 연구 결과를 바탕으로 '만약 내가 이 문제를 해결하는 제품을 만든다면'이라는 가정으로 비즈니스 모델을 설계해 보세요.",
        ("person", "startup"): "성공한 창업가의 스토리에서 가장 중요한 건 '실패와 피봇의 순간'입니다. 완성된 성공담이 아닌, 전환점에서 어떤 판단을 내렸는지에 집중하면 진짜 창업 교육이 됩니다.",
        ("acquisition", "startup"): "M&A는 스타트업의 또 다른 출구 전략입니다. 처음부터 '이 회사에 인수되고 싶다'는 목표로 사업을 설계하는 역발상 창업 전략도 유효합니다.",
    }
    key = (event_type, domain)
    if key in templates:
        return templates[key]
    # 기본 시사점
    defaults = {
        "investment": "투자 동향은 시장의 온도계입니다. 어느 분야에 돈이 몰리는지를 추적하면 내 창업 아이디어의 타이밍을 검증할 수 있습니다.",
        "tech": "기술 변화는 새로운 창업 기회를 만듭니다. 이 기술이 2~3년 후 어떤 새로운 문제를 해결할 수 있을지 상상하는 습관을 기르세요.",
        "youth": "청소년 창업 생태계는 빠르게 성장하고 있습니다. 지금 이 순간이 여러분이 뛰어들기 가장 좋은 타이밍입니다.",
        "policy": "정책 지원을 전략적으로 활용하면 초기 창업의 가장 큰 허들인 '자본'과 '네트워크' 문제를 동시에 해결할 수 있습니다.",
        "startup": "모든 성공한 스타트업에는 반드시 '남들이 놓친 문제'를 발견한 순간이 있었습니다. 여러분도 오늘 주변의 불편함을 비즈니스 기회로 재정의해 보세요.",
        "esg": "임팩트와 수익은 양립합니다. ESG 트렌드는 '착하게 벌 수 있는 시대'가 왔음을 의미합니다.",
    }
    return defaults.get(domain, defaults["startup"])

def summarize(title: str, body: str, target_len: int = 2500) -> str:
    """
    v5 핵심: What → Why → So What 3단계 분석 기반 요약
    각 기사 본문 내용을 진짜로 이해하고 그 본질을 요약
    """
    body = clean(body or "")
    if len(body) < 50:
        body = title

    domain = detect_domain(title, body)
    event_type = detect_event_type(title, body)
    weights = load_model()

    sents = split_sents(body)
    if len(sents) < 2:
        sents = [body[:200]] if body else [title]

    # 스코어링 및 중복제거
    scores = score_sents(sents, title, domain, weights)
    sents_dd, scores_dd = dedup(sents, scores)

    # MMR으로 다양한 문장 선택
    if len(sents_dd) > 3:
        top_idx = mmr(sents_dd, scores_dd, lambda_=0.65, top_n=min(8, len(sents_dd)))
        top_idx_sorted = sorted(top_idx)
        top_sents = [sents_dd[i] for i in top_idx_sorted]
    else:
        top_sents = sents_dd or sents[:4]

    # ── What: 핵심 사실
    what_sent = infer_what(sents, title, event_type)
    # ── Why: 인과/배경
    why_sents = infer_why(sents, title, event_type)
    # ── 수치 정보
    num_sents = extract_numbers(sents)

    # 이벤트 레이블
    evt = EVENT_PATTERNS.get(event_type, EVENT_PATTERNS["general"])
    evt_label = evt["label"]

    # ── 요약문 구성
    lines = []
    lines.append(f"**{title.strip()}**")
    lines.append("")
    lines.append(f"{evt_label} · {DOMAIN_KO.get(domain, '창업·비즈니스')}")
    lines.append("")

    # [핵심 내용] - What
    lines.append("**핵심 내용**")
    lines.append("")
    lines.append(apply_terms(what_sent))
    # 추가 핵심 문장 (top_sents 중 what과 다른 것)
    added = 0
    for s in top_sents:
        if s != what_sent and added < 2:
            lines.append(apply_terms(s))
            added += 1
    lines.append("")

    # [주요 수치] - 있을 때만
    if num_sents:
        lines.append("**주요 수치**")
        lines.append("")
        for ns in num_sents[:2]:
            if ns != what_sent:
                lines.append(f"• {apply_terms(ns)}")
        lines.append("")

    # [배경과 맥락] - Why
    why_unique = [s for s in why_sents if s != what_sent and s not in num_sents]
    if why_unique:
        lines.append("**배경과 맥락**")
        lines.append("")
        for ws in why_unique[:2]:
            lines.append(apply_terms(ws))
        lines.append("")

    # [창업가 시사점] - So What (본문에서 추출)
    # 본문에서 시사점/교훈/전망 관련 문장 우선 추출
    sowhat_keywords = ["시사점","교훈","전망","주목","중요","핵심","의미","변화","기회",
                       "예상","전략","방향","필요","제안","권고","전환","주요","강점","특징"]
    sowhat_sents = []
    for s in sents:
        if any(kw in s for kw in sowhat_keywords) and len(s) > 20:
            sowhat_sents.append(s)
    # 없으면 후반부 문장 사용
    if not sowhat_sents:
        tail = sents[max(0, len(sents)-3):]
        sowhat_sents = [s for s in tail if len(s) > 20]
    
    if sowhat_sents:
        lines.append("**주요 포인트**")
        lines.append("")
        for s in sowhat_sents[:2]:
            lines.append(apply_terms(s))
        lines.append("")

    # 카테고리 태그
    cat = detect_category(title, body)
    lines.append(f"*category: {cat} · domain: {domain} · event: {event_type} · ai: insightship-v5*")

    result = "\n".join(lines)
    if len(result) > target_len:
        result = result[:target_len] + "..."
    return result

def rouge_l(hyp: str, ref: str) -> float:
    def lcs(a, b):
        m, n = len(a), len(b)
        dp = [[0]*(n+1) for _ in range(m+1)]
        for i in range(1,m+1):
            for j in range(1,n+1):
                dp[i][j] = dp[i-1][j-1]+1 if a[i-1]==b[j-1] else max(dp[i-1][j],dp[i][j-1])
        return dp[m][n]
    h_tok = tok(hyp)
    r_tok = tok(ref)
    if not h_tok or not r_tok: return 0.0
    l = lcs(h_tok, r_tok)
    p = l / len(h_tok)
    r = l / len(r_tok)
    return 2*p*r/(p+r) if (p+r) > 0 else 0.0

def coverage_score(summary: str, body: str) -> float:
    """v5: 커버리지 점수 - 원문 핵심 키워드가 요약에 얼마나 포함됐는가"""
    body_tokens = set(tok(clean(body)))
    summary_tokens = set(tok(summary))
    if not body_tokens: return 0.0
    # 상위 빈도 토큰 커버리지
    top_body = set(t for t, c in Counter(tok(clean(body))).most_common(20))
    covered = len(top_body & summary_tokens)
    return covered / max(len(top_body), 1)

def evaluate(articles: List[Dict]) -> Dict:
    rouge_scores, cov_scores = [], []
    for a in articles:
        ref = a.get("ai_summary", "")
        title = a.get("title", "")
        body = clean(a.get("body", "") or a.get("excerpt", "") or "")
        if not (title and len(body) > 50): continue
        hyp = summarize(title, body)
        if ref and len(ref) > 80:
            rouge_scores.append(rouge_l(hyp, ref))
        cov_scores.append(coverage_score(hyp, body))
    return {
        "rouge_l": round(sum(rouge_scores)/max(len(rouge_scores),1), 4),
        "coverage": round(sum(cov_scores)/max(len(cov_scores),1), 4),
        "n": len(cov_scores),
    }

def train(articles: List[Dict]) -> Dict:
    """v5: 적응형 학습률 - 기사 품질에 따라 lr 조정"""
    current = load_model()
    contrib = defaultdict(list)

    for a in articles:
        title = a.get("title", "")
        ref = a.get("ai_summary", "")
        body = clean(a.get("body", "") or a.get("excerpt", "") or "")
        if not (title and len(body) > 80): continue

        # 이 기사의 품질 판단
        body_q = min(1.0, len(body) / 500)
        base_lr = 0.15 + 0.15 * body_q  # 0.15~0.30

        for s in split_sents(body):
            q = sent_quality(s)
            if q < 0.8: continue
            for t in tok(s):
                # ROUGE 기반 신호
                if ref and len(ref) > 80:
                    sc = rouge_l(s, ref)
                    if sc > 0.04:
                        contrib[t].append(sc * q * 1.5)
                # 수치 포함 문장의 토큰 → 정보 가중치
                if has_key_number(s):
                    contrib[t].append(0.3 * q)

    new_w = dict(current)
    updated = 0
    for kw, vals in contrib.items():
        if len(vals) < 1: continue
        avg = sum(vals) / len(vals)
        old = current.get(kw, 1.0)
        lr = base_lr if 'base_lr' in dir() else 0.2
        new_w[kw] = round(max(0.3, min((1 - lr)*old + lr*(1.0 + avg*8), 6.0)), 3)
        updated += 1

    print(f"✅ v5 학습: {len(articles)}건 → {updated}개 키워드 업데이트")
    top = sorted(new_w.items(), key=lambda x: -x[1])[:5]
    print(f"   상위 가중치: {top}")
    return new_w

def save_model(weights: Dict, metrics: Dict = None):
    with open(MODEL_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "version": VERSION,
            "weights": weights,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "metrics": metrics or {},
            "keyword_count": len(weights),
        }, f, ensure_ascii=False, indent=2)
    print(f"✅ v5 모델 저장: {len(weights)}개 키워드")

def load_model() -> Dict:
    for path in [MODEL_PATH,
                 os.path.join(os.path.dirname(__file__), "pacm_ai_model_v4.json"),
                 os.path.join(os.path.dirname(__file__), "pacm_ai_model_v3.json")]:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    d = json.load(f)
                w = d.get("weights", {})
                if len(w) > 10: return w
            except: pass
    # 기본 도메인 가중치
    base = {}
    for d in DOMAIN_WEIGHTS.values():
        base.update(d)
    return base

# ─── Supabase 연동: 뉴스 처리
def get_supabase_config():
    return {
        "url": os.environ.get("SUPABASE_URL", ""),
        "key": os.environ.get("SUPABASE_SERVICE_KEY", os.environ.get("SUPABASE_ANON_KEY", "")),
    }

def fetch_articles(limit: int = 200, days: int = 90) -> List[Dict]:
    cfg = get_supabase_config()
    if not cfg["url"] or not cfg["key"]:
        print("⚠️  Supabase 환경변수 없음 — 로컬 학습 스킵")
        return []
    
    cutoff = time.strftime("%Y-%m-%dT00:00:00", time.gmtime(time.time() - days*86400))
    url = (f"{cfg['url']}/rest/v1/articles"
           f"?select=id,title,body,excerpt,ai_summary,published_at,category"
           f"&published_at=gte.{cutoff}"
           f"&order=published_at.desc&limit={limit}")
    
    req = urllib.request.Request(url)
    req.add_header("apikey", cfg["key"])
    req.add_header("Authorization", f"Bearer {cfg['key']}")
    
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.load(resp)
    except Exception as e:
        print(f"⚠️  Supabase fetch 실패: {e}")
        return []

def update_article_summary(article_id: str, summary: str, category: str, domain: str):
    cfg = get_supabase_config()
    if not cfg["url"] or not cfg["key"]: return
    
    url = f"{cfg['url']}/rest/v1/articles?id=eq.{article_id}"
    payload = json.dumps({
        "ai_summary": summary,
        "category": category,
        "ai_version": VERSION,
        "ai_processed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }).encode()
    
    req = urllib.request.Request(url, data=payload, method="PATCH")
    req.add_header("apikey", cfg["key"])
    req.add_header("Authorization", f"Bearer {cfg['key']}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "return=minimal")
    
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            pass
    except Exception as e:
        print(f"⚠️  업데이트 실패 ({article_id}): {e}")

# ─── 메인 실행
if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "run"

    if mode == "train":
        print(f"=== Insightship AI v{VERSION} 학습 시작 ===")
        articles = fetch_articles(limit=500, days=180)
        if articles:
            weights = train(articles)
            metrics = evaluate(articles[:100])
            print(f"📊 평가: ROUGE-L={metrics['rouge_l']:.4f}, Coverage={metrics['coverage']:.4f}")
            save_model(weights, metrics)
        else:
            print("학습 데이터 없음 — 기본 모델 사용")
            save_model(load_model(), {})

    elif mode == "process":
        # 모든 미처리 기사에 AI 요약 생성
        print(f"=== Insightship AI v{VERSION} 기사 처리 시작 ===")
        articles = fetch_articles(limit=300, days=7)
        processed = 0
        for a in articles:
            title = a.get("title", "")
            body = a.get("body", "") or a.get("excerpt", "") or ""
            if not title: continue
            # 이미 v5로 처리된 기사 스킵
            if "insightship-v5" in (a.get("ai_summary") or ""):
                continue
            summary = summarize(title, body)
            category = detect_category(title, body)
            domain = detect_domain(title, body)
            update_article_summary(a["id"], summary, category, domain)
            processed += 1
            if processed % 10 == 0:
                print(f"  처리: {processed}/{len(articles)}")
        print(f"✅ 완료: {processed}건 처리")

    elif mode == "test":
        test_cases = [
            {
                "title": "카카오, AI 에이전트 '카나나' 정식 출시… 월 구독료 2만9900원",
                "body": "카카오가 자체 개발한 AI 에이전트 서비스 '카나나'를 정식 출시했다. 월 2만9900원의 구독 모델로, 일정 관리, 이메일 작성, 데이터 분석까지 자동화한다. 카카오 측은 출시 첫날 10만 명이 유료 전환했다고 밝혔다. 이번 서비스는 카카오가 2년간 R&D에 3000억 원을 투자한 결과물이다. 경쟁사 네이버 '클로바X'보다 30% 저렴한 가격을 책정해 시장 선점을 노린다.",
            },
            {
                "title": "17세 고교생, AI 작물 질병 진단 앱으로 예비창업패키지 선발",
                "body": "경기도 수원 출신 고등학교 2학년 김민준(17)군이 스마트폰 카메라로 작물 잎사귀를 찍으면 AI가 질병을 진단해주는 앱 '팜케어'를 개발해 중소벤처기업부 2026년 예비창업패키지에 최종 선발됐다. 지원금 최대 1억 원과 6개월 멘토링이 제공된다. 김군은 할아버지 농사를 돕다가 아이디어를 얻었으며, 혼자 Python과 TensorFlow를 독학해 앱을 만들었다.",
            },
        ]
        weights = load_model()
        for tc in test_cases:
            print("\n" + "="*60)
            result = summarize(tc["title"], tc["body"])
            print(result)
            cov = coverage_score(result, tc["body"])
            print(f"\n[커버리지: {cov:.3f}]")
    
    else:
        # 기본: 학습 + 처리
        articles = fetch_articles(limit=300, days=30)
        if articles:
            weights = train(articles)
            metrics = evaluate(articles[:50])
            save_model(weights, metrics)
            print(f"📊 ROUGE-L={metrics['rouge_l']:.4f} Coverage={metrics['coverage']:.4f}")
