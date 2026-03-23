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
    "investment": "이번 투자 소식은 해당 기업의 기술력과 성장 가능성을 시장이 인정한 것으로 볼 수 있습니다. 투자금은 통상 제품 개발 가속화, 팀 확충, 시장 확장에 활용됩니다.",
    "tech": "이 기술 분야는 현재 글로벌 산업의 판도를 바꾸고 있는 핵심 영역으로, 선제적으로 이해하고 활용하는 사람들이 미래 시장을 이끌게 됩니다.",
    "youth": "청소년 창업 교육과 지원 프로그램은 단순한 교육을 넘어 실제 창업으로 이어지는 디딤돌이 되고 있습니다. 참여 기회를 적극 탐색해보세요.",
    "policy": "정부의 창업 지원 정책은 예비 창업자들에게 실질적인 자금과 인프라를 제공합니다. 공모 일정과 조건을 미리 파악해 두는 것이 중요합니다.",
    "startup": "스타트업 생태계의 변화는 새로운 창업 기회의 신호입니다. 성공한 창업가들의 여정을 참고하여 자신만의 창업 스토리를 만들어가세요.",
}
YOUTH_NOTE = [
    "미래 창업가를 꿈꾸는 청소년들에게 시사하는 바가 큽니다.",
    "청소년 창업가들이 눈여겨볼 내용입니다.",
]
CLOSE = [
    "앞으로의 행보가 국내 창업 생태계에 미칠 영향이 주목됩니다.",
    "관련 분야의 흐름을 지속적으로 주시할 필요가 있습니다.",
    "이러한 변화 속에서 새로운 기회를 찾는 시각이 중요합니다.",
]


# ─── 전처리
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
def summarize(title: str, body: str, target_len: int = 1500) -> str:
    import random
    weights = load_model()
    body_c = clean(body or "")
    domain = detect_domain(title, body_c)
    d_ko = DOMAIN_KO.get(domain, "스타트업")
    random.seed(hash(title) % 1000)

    # 케이스 1: 충분한 본문
    if len(body_c) >= 200:
        sents = split_sents(body_c) or [p.strip() for p in body_c.split("\n") if len(p.strip()) >= 10]
        if sents:
            sc = score_sents(sents, title, domain, weights)
            deduped, _ = dedup(sents, sc)
            order = {s: i for i, s in enumerate(sents)}
            top = sorted(deduped[:20], key=lambda s: order.get(s, 999))
            facts = extract_facts(top)
            parts = [random.choice(INTRO).format(d=d_ko)]
            cur = len(parts[0])
            body_parts = []
            used_set = set()
            for s in facts[:5]:
                if cur + len(s) > target_len * 0.55: break
                body_parts.append(s); used_set.add(s); cur += len(s)
            for s in top:
                if s in used_set: continue
                if cur + len(s) > target_len - 200: break
                body_parts.append(s); cur += len(s)
            if body_parts:
                parts.append("\n".join(body_parts))
            parts.append(CONTEXT_HINTS.get(domain, CONTEXT_HINTS["startup"]))
            parts.append(random.choice(YOUTH_NOTE))
            parts.append(random.choice(CLOSE))
            return apply_terms("\n\n".join(parts)).strip()

    # 케이스 2: 짧은 본문
    if len(body_c) >= 30:
        return apply_terms(
            f"{random.choice(INTRO).format(d=d_ko)}\n\n"
            f"{title}\n\n{body_c}\n\n"
            f"{CONTEXT_HINTS.get(domain, CONTEXT_HINTS['startup'])}\n\n"
            f"{random.choice(YOUTH_NOTE)}\n\n{random.choice(CLOSE)}"
        ).strip()

    # 케이스 3: 제목만
    return apply_terms(
        f"{random.choice(INTRO).format(d=d_ko)}\n\n"
        f"{title}\n\n"
        f"{CONTEXT_HINTS.get(domain, CONTEXT_HINTS['startup'])}\n\n"
        f"관련 분야의 동향을 꾸준히 파악하고, 자신의 창업 아이디어와 연결해보세요.\n\n"
        f"{random.choice(CLOSE)}"
    ).strip()


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
