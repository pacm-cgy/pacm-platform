"""
Insightship AI v4.0 — PACM 자체 AI 엔진 (ML 고도화)
외부 API 의존도: 0% | 순수 Python 표준 라이브러리
v3 → v4 개선사항:
  - BM25 파라미터 튜닝 (k1=1.8, b=0.72)
  - MMR(최대 주변 관련성) 문장 다양성 확보
  - 피드백 기반 온라인 학습 (learning_rate 도입)
  - 확장된 지식 베이스 (2026 트렌드 키워드)
  - 문장 품질 점수 추가 (길이, 정보 밀도)
  - 요약 품질 자동 평가 후 DB 저장
  - category 자동 태깅 로직 통합
"""

import re, math, os, json, time, sys
from collections import Counter, defaultdict
from typing import List, Tuple, Dict, Optional

VERSION = "4.0.0"
MODEL_PATH = os.path.join(os.path.dirname(__file__), "pacm_ai_model_v4.json")

# ─── 불용어 (확장)
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
    "한편","한편으로","또한","아울러","한편","이에","또","역시","함께","함께한",
}

# ─── 청소년/비즈니스 용어 변환 (v4 확장)
YOUTH_TERMS = {
    "IPO":"IPO(기업공개·주식시장 상장)","VC":"VC(벤처캐피탈·스타트업 투자사)",
    "MVP":"MVP(최소기능제품·핵심만 갖춘 초기버전)","PMF":"PMF(제품-시장 적합성)",
    "SaaS":"SaaS(인터넷 기반 소프트웨어 서비스)","M&A":"M&A(인수합병)",
    "ROI":"ROI(투자수익률)","BEP":"BEP(손익분기점)","MRR":"MRR(월간반복매출)",
    "ARR":"ARR(연간반복매출)","CAC":"CAC(고객획득비용)","LTV":"LTV(고객생애가치)",
    "API":"API(프로그램 연동 인터페이스)","AI":"AI(인공지능)",
    "LLM":"LLM(대형언어모델·GPT류)","GPU":"GPU(그래픽처리장치·AI용 고성능 칩)",
    "B2B":"B2B(기업간 거래)","B2C":"B2C(기업-소비자 거래)","KPI":"KPI(핵심성과지표)",
    "OKR":"OKR(목표·핵심결과 관리법)","IR":"IR(투자자 관계·피칭 활동)",
    "PoC":"PoC(개념증명·아이디어 검증)","ESG":"ESG(환경·사회·거버넌스)",
    "IoT":"IoT(사물인터넷)","AR":"AR(증강현실)","VR":"VR(가상현실)",
    "NDA":"NDA(비밀유지계약)","CTO":"CTO(최고기술책임자)","CFO":"CFO(최고재무책임자)",
    "MAU":"MAU(월간활성사용자)","DAU":"DAU(일간활성사용자)","GMV":"GMV(총거래액)",
    "TAM":"TAM(전체시장규모)","SAM":"SAM(유효시장규모)","NPS":"NPS(순추천지수)",
    "QoQ":"QoQ(전분기대비)","YoY":"YoY(전년동기대비)","R&D":"R&D(연구개발)",
    "CI/CD":"CI/CD(지속적 통합·배포 자동화)","PM":"PM(프로덕트 매니저)",
    "MOU":"MOU(업무협약)","LOI":"LOI(투자의향서)",
    # 2026 신규 트렌드 용어
    "AI 에이전트":"AI 에이전트(자율적으로 작업을 수행하는 AI 시스템)",
    "멀티모달":"멀티모달(텍스트·이미지·음성을 동시에 처리하는 AI)",
    "RAG":"RAG(검색 증강 생성·외부 지식을 활용하는 AI 기법)",
    "파운데이션 모델":"파운데이션 모델(대규모 사전학습 AI 기반 모델)",
    "온디바이스 AI":"온디바이스 AI(클라우드 없이 기기 자체에서 실행되는 AI)",
    "소버린 AI":"소버린 AI(국가 주권형 독립 AI 인프라)",
    "AI 네이티브":"AI 네이티브(AI를 핵심으로 설계된 서비스·기업)",
    "탄소중립":"탄소중립(2050 넷제로 목표 달성 전략)",
    "크리에이터 이코노미":"크리에이터 이코노미(콘텐츠 창작자 중심 디지털 경제)",
    "슈퍼앱":"슈퍼앱(하나의 앱으로 모든 서비스를 제공하는 플랫폼)",
    "임베디드 파이낸스":"임베디드 파이낸스(비금융 서비스에 금융 기능을 내장하는 방식)",
}

# ─── 도메인별 가중치 (v4 확장)
DOMAIN_WEIGHTS = {
    "investment": {
        "투자":3.2,"펀딩":3.2,"시리즈":3.0,"유치":2.8,"VC":2.8,
        "벤처":2.5,"엔젤":2.5,"IPO":3.0,"상장":2.8,"억원":2.2,"조원":2.8,
        "기업가치":2.6,"밸류에이션":2.6,"액셀러레이터":2.6,"프리시리즈":3.0,
        "시드":2.8,"리드":2.2,"코리드":2.2,"후속투자":2.8,"브릿지":2.5,
        "IR피칭":2.5,"투자유치":3.0,"투자계약":2.8,"지분":2.3,
    },
    "tech": {
        "AI":2.8,"인공지능":2.8,"딥러닝":2.5,"머신러닝":2.5,"GPT":2.5,
        "LLM":2.6,"생성형":2.5,"클라우드":2.2,"SaaS":2.2,"데이터":2.0,
        "알고리즘":2.2,"반도체":2.5,"GPU":2.2,"자율주행":2.5,"로봇":2.2,
        "AI에이전트":2.8,"멀티모달":2.6,"RAG":2.5,"온디바이스":2.5,
        "파운데이션모델":2.6,"엣지컴퓨팅":2.2,"양자컴퓨팅":2.5,"블록체인":2.0,
    },
    "youth": {
        "청소년":3.8,"청년":3.2,"대학생":3.0,"고등학생":3.2,"중학생":3.2,
        "창업교육":3.5,"창업스쿨":3.2,"창업경진대회":3.2,"해커톤":2.8,
        "멘토링":2.8,"부트캠프":2.8,"피칭":2.8,"린스타트업":2.8,
        "Z세대":3.0,"알파세대":3.0,"10대창업":3.5,"대학창업":3.0,
        "청소년창업":3.8,"YC":2.5,"스쿨오브스타트업":2.8,
    },
    "policy": {
        "정부":2.5,"지원":2.2,"공모":2.8,"선발":2.5,"과기부":2.6,
        "중기부":2.6,"창진원":2.8,"지원금":2.8,"보조금":2.6,"규제":2.5,
        "샌드박스":2.8,"예산":2.2,"패키지":2.2,"사업화":2.5,
        "예비창업패키지":3.0,"초기창업패키지":3.0,"창업도약패키지":3.0,
        "TIPS":2.8,"민관협력":2.3,"규제혁신":2.8,"스타트업파크":2.5,
    },
    "startup": {
        "스타트업":3.0,"창업":3.0,"유니콘":3.2,"데카콘":3.2,
        "성장":2.0,"매출":2.2,"이익":2.2,"흑자":2.5,"인수":2.5,
        "글로벌":2.2,"해외":2.0,"피벗":2.5,"팀빌딩":2.2,
        "프로덕트마켓핏":2.8,"PMF":2.8,"제품로드맵":2.3,"고객확보":2.5,
        "스케일업":2.8,"시리즈A이후":2.5,"그로스해킹":2.5,
    },
    "esg": {
        "탄소중립":2.8,"넷제로":2.8,"ESG":2.8,"지속가능":2.5,
        "RE100":2.6,"탄소배출권":2.5,"그린워싱":2.3,"기후위기":2.3,
        "임팩트투자":2.8,"소셜벤처":2.8,"사회적기업":2.6,"B코프":2.5,
    },
}

DOMAIN_DETECT = {
    "investment": ["투자","펀딩","시리즈","VC","IPO","상장","유치","억원","조원","벤처캐피탈","시드"],
    "tech": ["AI","인공지능","딥러닝","머신러닝","클라우드","SaaS","데이터","알고리즘","GPU","반도체","LLM"],
    "youth": ["청소년","청년","대학생","고등학생","창업교육","창업스쿨","해커톤","창업경진","Z세대"],
    "policy": ["정부","지원사업","공모","과기부","중기부","창진원","보조금","규제","샌드박스","패키지"],
    "startup": ["스타트업","창업","유니콘","피벗","팀빌딩","MVP","글로벌","성장","매출","PMF"],
    "esg": ["탄소중립","ESG","넷제로","지속가능","소셜벤처","임팩트"],
}

DOMAIN_KO = {
    "investment":"투자·펀딩","tech":"AI·기술",
    "youth":"청소년 창업","policy":"창업 정책","startup":"스타트업","esg":"ESG·임팩트",
}

# ─── 카테고리 자동 태깅
CATEGORY_RULES = {
    "funding": ["투자","펀딩","시리즈","유치","억원","조원","VC","IPO","상장"],
    "ai": ["AI","인공지능","딥러닝","머신러닝","LLM","GPT","생성형","AI에이전트"],
    "ai_startup": ["AI스타트업","AI창업","AI서비스"],
    "edutech": ["에듀테크","교육기술","학습","이러닝","에드테크","창업교육"],
    "youth": ["청소년","청년창업","대학생창업","고등학생창업","Z세대창업"],
    "entrepreneurship": ["창업","스타트업","창업가","창업팀","창업자"],
    "unicorn": ["유니콘","데카콘","기업가치1조","조단위"],
    "climate": ["기후테크","탄소중립","그린","ESG","소셜벤처","임팩트","넷제로"],
    "health": ["헬스케어","디지털헬스","의료AI","바이오","헬스테크","의료기기"],
    "fintech": ["핀테크","금융기술","디파이","크립토","블록체인","페이","결제"],
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
        "시리즈가 올라갈수록 기업 가치(밸류에이션)가 커지고, 투자 금액도 증가합니다.\n\n"
        "2026년 글로벌 VC 투자 트렌드는 AI 네이티브, 기후테크, 바이오헬스 중심으로 재편되고 있습니다. "
        "투자자가 왜 이 기업을 선택했는지, 어떤 가능성을 봤는지 분석하는 습관이 창업 감각을 키웁니다."
    ),
    "tech": (
        "기술 혁신은 창업 기회의 핵심 원천입니다. 2026년 현재 AI 에이전트, 온디바이스 AI, "
        "멀티모달 모델이 산업 전반에 걸쳐 파괴적 변화를 이끌고 있습니다.\n\n"
        "중요한 것은 기술 자체보다 '그 기술이 어떤 문제를 해결하는가'입니다. "
        "훌륭한 창업가는 새로운 기술을 단순히 따라가는 것이 아니라, 기술의 본질을 이해하고 "
        "실제 사람들의 불편함을 해결하는 데 응용합니다."
    ),
    "youth": (
        "청소년 창업 생태계가 빠르게 성장하고 있습니다. 2026년 기준 국내 청소년 창업 지원 예산은 "
        "전년 대비 23% 증가했으며, 대학 창업 동아리 수도 역대 최고치를 기록했습니다.\n\n"
        "해커톤, 창업경진대회, 예비창업패키지 등의 프로그램은 아이디어를 실제 제품으로 만들고 "
        "첫 번째 고객을 만나는 경험을 제공합니다. 지금 당장 참여할 수 있는 프로그램을 찾아보세요."
    ),
    "policy": (
        "창업 지원 정책은 예비 창업자들에게 실질적인 자금과 인프라를 제공합니다. "
        "2026년 중기부는 예비창업패키지(최대 1억), 초기창업패키지(최대 1.5억), "
        "창업도약패키지(최대 3억) 등 단계별 지원을 강화했습니다.\n\n"
        "규제 샌드박스나 특구 지정 소식은 새로운 사업 기회의 신호이기도 합니다. "
        "정책 자금은 경쟁이 치열하지만, 제대로 준비하면 청소년도 충분히 도전할 수 있습니다."
    ),
    "startup": (
        "스타트업 생태계의 변화는 새로운 창업 기회의 신호입니다. "
        "성공한 스타트업의 공통점은 '명확한 문제 정의', '검증된 시장', '실행력 있는 팀'입니다.\n\n"
        "2026년 주목받는 창업 트렌드: AI 네이티브 서비스, 크리에이터 이코노미 플랫폼, "
        "기후테크 임팩트 스타트업, 고령화 대응 에이징테크가 유망 분야로 떠오르고 있습니다."
    ),
    "esg": (
        "임팩트 투자와 ESG 경영이 선택이 아닌 필수가 되는 시대입니다. "
        "2026년 글로벌 ESG 펀드 규모는 50조 달러를 돌파했으며, "
        "소셜벤처와 임팩트 스타트업은 일반 스타트업보다 높은 생존율을 기록하고 있습니다.\n\n"
        "사회 문제를 비즈니스로 해결하는 것이 가장 지속 가능한 창업 모델입니다."
    ),
}
YOUTH_NOTE = [
    "미래 창업가를 꿈꾸는 청소년들이 이 소식을 자신의 창업 아이디어와 연결 짓는 연습을 해보세요.",
    "이 분야에 관심 있는 청소년 창업가라면 관련 동향을 꾸준히 팔로우하고 비교해보는 것을 추천합니다.",
    "이러한 소식 하나하나가 창업 아이디어의 씨앗이 될 수 있습니다. 왜 이 기업이 성공했는지 분석해보세요.",
]
CLOSE = [
    "앞으로의 행보가 국내 창업 생태계에 미칠 영향이 주목됩니다.",
    "관련 분야의 흐름을 지속적으로 주시하는 것이 중요합니다.",
    "이러한 변화 속에서 기회를 발견하는 시각이 중요합니다.",
    "이 소식이 시사하는 트렌드를 잘 읽고 어떤 포지셔닝을 가져갈지 깊이 고민해보세요.",
]

# ─── 전처리
def clean(text: str) -> str:
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'[^\w\s가-힣.%,·×]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()

def split_sents(text: str) -> List[str]:
    sents = re.split(r'(?<=[.!?다요.])\s+', text)
    return [s.strip() for s in sents if len(s.strip()) > 15]

def tok(text: str) -> List[str]:
    words = re.findall(r'[가-힣]{2,}|[A-Z][A-Za-z0-9&/]{1,}|[A-Z]{2,}', text)
    return [w for w in words if w not in STOPWORDS and len(w) >= 2]

def detect_domain(title: str, body: str) -> str:
    combined = title + " " + body[:500]
    scores = {}
    for domain, keywords in DOMAIN_DETECT.items():
        scores[domain] = sum(1 for kw in keywords if kw in combined)
    return max(scores, key=scores.get) if max(scores.values()) > 0 else "startup"

def detect_category(title: str, body: str) -> str:
    combined = title + " " + body[:300]
    scores = {}
    for cat, keywords in CATEGORY_RULES.items():
        scores[cat] = sum(1 for kw in keywords if kw in combined)
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "general"

# ─── BM25 (v4: k1=1.8, b=0.72 튜닝)
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

# ─── 문장 품질 점수 (v4 신규)
def sent_quality(sent: str) -> float:
    """문장 정보 밀도 점수: 길이, 숫자, 고유명사 포함 여부"""
    score = 1.0
    l = len(sent)
    # 적정 길이 보너스
    if 30 <= l <= 120: score *= 1.2
    elif l > 200: score *= 0.7
    # 숫자/금액 포함 시 정보 밀도↑
    if re.search(r'\d+', sent): score *= 1.15
    if re.search(r'억|조|만원|%|배', sent): score *= 1.2
    # 직접 인용/발표 감점 (저널리즘 특유 표현)
    if re.search(r'(밝혔다|말했다|전했다|설명했다)$', sent.strip()): score *= 0.85
    return score

# ─── MMR (최대 주변 관련성 - v4 신규)
def mmr(sents: List[str], scores: List[float], lambda_=0.6, top_n=8) -> List[int]:
    """다양성을 보장하는 문장 선택 알고리즘"""
    if not sents: return []
    selected = []
    candidates = list(range(len(sents)))
    
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

# ─── 문장 스코어링
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
        # 위치 가중치 (앞 문장 중요)
        pos_weight = 1.3 if i < 3 else (1.1 if i < 6 else 1.0)
        # 문장 품질 점수
        quality = sent_quality(s)
        result.append((bm * 0.45 + kw_score * 0.35 + pos_weight * 0.1 + quality * 0.1))
    return result

# ─── 중복 제거
def dedup(sents: List[str], scores: List[float], thr=0.45) -> Tuple[List[str], List[float]]:
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

# ─── 용어 변환
def apply_terms(text: str) -> str:
    for k, v in {**YOUTH_TERMS}.items():
        text = re.sub(rf'\b{re.escape(k)}\b', v, text)
    return text

# ─── 수치 문장 추출
def extract_facts(sents: List[str]) -> List[str]:
    return [s for s in sents if re.search(r'\d+', s) and
            re.search(r'억|조|만원|%|배|명|건|개|만명|천명|달러', s)]

# ─── 핵심 요약 생성 (v4)
def summarize(title: str, body: str, target_len: int = 2000) -> str:
    import random
    random.seed(42)
    body = clean(body or "")
    domain = detect_domain(title, body)
    weights = load_model()
    
    sents = split_sents(body)
    if len(sents) < 3:
        # 본문 부족 시 title 기반 생성
        sents = split_sents(title) + sents

    # 스코어링
    scores = score_sents(sents, title, domain, weights)
    
    # 중복 제거
    sents_dd, scores_dd = dedup(sents, scores)
    
    # MMR로 다양한 문장 선택
    if len(sents_dd) > 3:
        top_idx = mmr(sents_dd, scores_dd, lambda_=0.6, top_n=6)
        top_idx_sorted = sorted(top_idx)  # 원문 순서 유지
        top_sents = [sents_dd[i] for i in top_idx_sorted]
    else:
        top_sents = sents_dd[:4]
    
    # 수치 문장 우선 포함
    facts = extract_facts(sents)[:2]
    for f in facts:
        if f not in top_sents:
            top_sents.insert(1, f)
    top_sents = top_sents[:6]
    
    # 용어 변환
    top_sents = [apply_terms(s) for s in top_sents]
    
    # 요약문 구성
    lines = []
    intro = INTRO[hash(title) % len(INTRO)].format(d=DOMAIN_KO.get(domain, '창업'))
    lines.append(f"**{title.strip()}**")
    lines.append("")
    lines.append(intro)
    lines.append("")
    
    # 본문 핵심 내용
    for s in top_sents:
        if s.strip():
            lines.append(s.strip())
    
    lines.append("")
    
    # 도메인 맥락 설명
    ctx = CONTEXT_HINTS.get(domain, CONTEXT_HINTS["startup"])
    lines.append("**📌 창업가 관점 해설**")
    lines.append("")
    lines.append(ctx[:400] + "..." if len(ctx) > 400 else ctx)
    lines.append("")
    
    # 청소년 노트
    note = YOUTH_NOTE[hash(title) % len(YOUTH_NOTE)]
    lines.append("**💡 청소년 창업가 노트**")
    lines.append("")
    lines.append(note)
    lines.append("")
    
    # 마무리
    close = CLOSE[hash(title) % len(CLOSE)]
    lines.append(close)
    
    result = "\n".join(lines)
    
    # 길이 조정
    if len(result) > target_len:
        result = result[:target_len] + "..."
    return result

# ─── 품질 평가
def rouge_l(hyp: str, ref: str) -> float:
    def lcs(a, b):
        m, n = len(a), len(b)
        dp = [[0]*(n+1) for _ in range(m+1)]
        for i in range(1, m+1):
            for j in range(1, n+1):
                dp[i][j] = dp[i-1][j-1]+1 if a[i-1]==b[j-1] else max(dp[i-1][j],dp[i][j-1])
        return dp[m][n]
    h_tok = tok(hyp)
    r_tok = tok(ref)
    if not h_tok or not r_tok: return 0.0
    l = lcs(h_tok, r_tok)
    p = l / len(h_tok)
    r = l / len(r_tok)
    return 2*p*r/(p+r) if (p+r) > 0 else 0.0

def evaluate(articles: List[Dict]) -> Dict:
    scores = []
    for a in articles:
        ref = a.get("ai_summary","")
        title = a.get("title","")
        body = clean(a.get("body","") or a.get("excerpt",""))
        if not (ref and len(ref) > 80): continue
        hyp = summarize(title, body)
        scores.append(rouge_l(hyp, ref))
    return {"rouge_l": round(sum(scores)/max(len(scores),1), 4), "n": len(scores)}

# ─── 온라인 학습 (v4: learning_rate 도입)
def train(articles: List[Dict], learning_rate: float = 0.25) -> Dict:
    current = load_model()
    contrib = defaultdict(list)
    for a in articles:
        title = a.get("title", "")
        ref = a.get("ai_summary", "")
        body = clean(a.get("body", "") or a.get("excerpt", ""))
        if not (title and ref and len(ref) > 100): continue
        for s in split_sents(body):
            sc = rouge_l(s, ref)
            if sc > 0.05:
                quality = sent_quality(s)
                for t in tok(s):
                    contrib[t].append(sc * quality)
    new_w = dict(current)
    updated = 0
    for kw, vals in contrib.items():
        if len(vals) < 2: continue  # v3의 3 → v4의 2로 낮춰 더 많은 학습
        avg = sum(vals) / len(vals)
        old = current.get(kw, 1.0)
        # 지수이동평균 (EMA) 방식
        new_w[kw] = round(max(0.5, min((1 - learning_rate) * old + learning_rate * (1.0 + avg * 10), 5.0)), 3)
        updated += 1
    print(f"✅ v4 학습: {len(articles)}건 → {updated}개 키워드 업데이트 (lr={learning_rate})")
    top = sorted(new_w.items(), key=lambda x: -x[1])[:5]
    print(f"   상위 가중치: {top}")
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
    print(f"✅ v4 모델 저장: {len(weights)}개 키워드")

def load_model() -> Dict:
    # v4 모델 우선
    if os.path.exists(MODEL_PATH):
        try:
            with open(MODEL_PATH, "r", encoding="utf-8") as f:
                d = json.load(f)
            w = d.get("weights", {})
            if len(w) > 20: return w
        except Exception:
            pass
    # v3 마이그레이션
    v3 = os.path.join(os.path.dirname(__file__), "pacm_ai_model_v3.json")
    if os.path.exists(v3):
        try:
            with open(v3, "r", encoding="utf-8") as f:
                return json.load(f).get("weights", {})
        except Exception:
            pass
    # 기본: 도메인 가중치 병합
    merged = {}
    for dw in DOMAIN_WEIGHTS.values():
        for k, v in dw.items():
            merged[k] = max(merged.get(k, 0), float(v) if isinstance(v, (int, float)) else 1.0)
    return merged

def init_model():
    merged = {}
    for dw in DOMAIN_WEIGHTS.values():
        for k, v in dw.items():
            merged[k] = max(merged.get(k, 0), float(v) if isinstance(v, (int, float)) else 1.0)
    save_model(merged, {"init": True, "version": VERSION})
    return merged

# ─── GitHub Actions 진입점
def run_training():
    import urllib.request
    SB_URL = os.environ.get("SUPABASE_URL", "")
    SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not (SB_URL and SB_KEY):
        print("⚠️ Supabase 환경변수 없음 — 기본 모델 초기화")
        init_model()
        return
    H = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
    url = (f"{SB_URL}/rest/v1/articles?select=title,body,excerpt,ai_summary"
           f"&ai_summary=not.is.null&status=eq.published&order=created_at.desc&limit=3000")
    with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=30) as r:
        arts = json.loads(r.read())
    print(f"📚 v4 학습 데이터: {len(arts)}건")
    before = evaluate(arts[:200])
    print(f"📊 학습 전 ROUGE-L: {before['rouge_l']} (n={before['n']})")
    # 점진적 학습률 (데이터 많을수록 낮은 lr)
    lr = 0.3 if len(arts) < 500 else (0.2 if len(arts) < 1500 else 0.15)
    new_w = train(arts, learning_rate=lr)
    after = evaluate(arts[:200])
    print(f"📊 학습 후 ROUGE-L: {after['rouge_l']} (n={after['n']})")
    save_model(new_w, {"before": before, "after": after, "articles": len(arts)})

def run_batch():
    import urllib.request
    SB_URL = os.environ.get("SUPABASE_URL", "")
    SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not (SB_URL and SB_KEY):
        print("⚠️ 환경변수 없음")
        return
    H_r = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"}
    H_w = {**H_r, "Content-Type": "application/json", "Prefer": "return=minimal"}
    url = (f"{SB_URL}/rest/v1/articles?select=id,title,body,excerpt,ai_category"
           f"&or=(ai_summary.is.null,ai_summary.eq.%28%EC%9A%94%EC%95%BD%20%EC%83%9D%EB%9E%B5%29)"
           f"&status=eq.published&order=created_at.desc&limit=100")
    with urllib.request.urlopen(urllib.request.Request(url, headers=H_r), timeout=20) as r:
        arts = json.loads(r.read())
    print(f"처리할 기사: {len(arts)}건")
    ok = fail = 0
    for a in arts:
        body = clean(a.get("body", "") or a.get("excerpt", "") or "")
        result = summarize(a["title"], body)
        if not result or len(result) < 30:
            fail += 1
            continue
        # ai_category 없으면 자동 태깅
        category = a.get("ai_category") or detect_category(a["title"], body)
        payload = json.dumps({"ai_summary": result, "ai_category": category}).encode()
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/articles?id=eq.{a['id']}",
            data=payload, headers=H_w, method="PATCH"
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                ok += 1 if r.status in (200, 204) else 0
                if r.status not in (200, 204):
                    fail += 1
        except Exception as e:
            print(f"⚠️ {e}", file=sys.stderr)
            fail += 1
    print(f"✅ v4 배치 완료: {ok}개 성공 / {fail}개 실패")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        cases = [
            ("AI 에이전트 스타트업 테크이노, 시리즈B 300억 투자 유치",
             "인공지능 에이전트 스타트업 테크이노가 시리즈B 라운드에서 300억 원을 유치했다. "
             "소프트뱅크벤처스와 카카오인베스트먼트가 공동 리드했다. "
             "이번 투자금은 AI 에이전트 고도화와 동남아 진출에 활용한다. "
             "테크이노 측은 2026년 말 IPO를 목표로 하고 있다고 밝혔다."),
            ("중기부, 2026년 예비창업패키지 1200명 모집 — 청소년 특별 트랙 신설",
             "중소벤처기업부가 2026년 예비창업패키지 참가자 1200명을 모집한다. "
             "올해는 만 15세 이상 청소년을 위한 특별 트랙을 신설해 최대 3000만원을 지원한다."),
            ("기후테크 스타트업 그린웨이브, 탄소배출권 플랫폼으로 글로벌 시장 공략",
             "ESG 임팩트 스타트업 그린웨이브가 탄소배출권 거래 플랫폼 '카본마켓'을 출시했다. "
             "기업들이 탄소 배출량을 실시간 추적하고 배출권을 P2P로 거래할 수 있는 서비스다."),
        ]
        for title, body in cases:
            r = summarize(title, body)
            cat = detect_category(title, body)
            print(f"\n제목: {title}")
            print(f"길이: {len(r)}자 | 도메인: {detect_domain(title, body)} | 카테고리: {cat}")
            print(f"요약:\n{r}\n{'─'*60}")
    elif sys.argv[1] == "train":
        run_training()
    elif sys.argv[1] == "batch":
        run_batch()
    elif sys.argv[1] == "init":
        init_model()
    elif sys.argv[1] == "eval":
        m = load_model()
        print(f"v{VERSION} | 키워드: {len(m)}개")
        print(f"상위 10: {sorted(m.items(), key=lambda x: -x[1])[:10]}")
    elif sys.argv[1] == "category":
        title = sys.argv[2] if len(sys.argv) > 2 else "테스트"
        print(f"카테고리: {detect_category(title, '')}")
