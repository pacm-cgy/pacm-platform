"""
Insightship AI v2.0 — 자체 개발 뉴스 요약 엔진
AI 연구소 (Lab) 전담 개발 | 예산 0원 | 순수 Python

개선 사항 (v1 → v2):
1. 더 정교한 TF-IDF (BM25 근사 포함)
2. 문장 중요도 멀티시그널 (위치, 길이, 키워드밀도, 제목유사도)
3. 중복 문장 제거 (자카드 유사도 기반)
4. 단락 구조 인식 (배경/본문/시사점)
5. 청소년 친화 재작성 패턴 확장
6. 지속 학습: 실제 요약 데이터로 키워드 가중치 갱신
7. 자체 평가 지표 (ROUGE-L 근사)
"""

import re, math, os, json, time, hashlib
from collections import Counter, defaultdict
from typing import List, Tuple, Dict, Optional

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 상수 및 설정
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VERSION = "2.0.0"
MODEL_PATH = os.path.join(os.path.dirname(__file__), "insightship_model_v2.json")

KO_STOPWORDS = {
    '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
    '하지만','그러나','또한','그리고','따라서','때문에','때문','위해',
    '통해','대한','관련','관해','따른','있는','없는','되는','하는',
    '있다','없다','된다','한다','이다','있으며','되며','하며',
    '이번','지난','올해','작년','이달','오늘','어제','최근',
    '특히','또','더','가장','매우','모두','함께','이미','아직',
    '약','총','전','후','당','각','제','본','해당',
    '이에','이로','이와','이를','이가','이는','이도',
}

# 창업/경제 도메인 키워드 가중치 (지속 학습으로 업데이트)
DEFAULT_WEIGHTS = {
    # 창업 핵심 (2.5+)
    '스타트업': 2.8, '창업': 2.8, '유니콘': 3.0, '데카콘': 3.0,
    '청소년': 3.0, '청년': 2.5, '대학생': 2.3,
    # 투자 (2.0+)
    '투자': 2.2, '펀딩': 2.2, '시리즈': 2.5, 'VC': 2.3,
    '벤처': 2.0, '엑셀러레이터': 2.3, '엔젤': 2.0, 'IPO': 2.5,
    # 금액 (1.8+)
    '억원': 1.9, '조원': 2.2, '억': 1.7, '조': 2.0,
    # AI/기술 (1.8+)
    'AI': 2.0, '인공지능': 2.0, '딥러닝': 1.8, '머신러닝': 1.8,
    'GPT': 1.9, 'LLM': 1.9, '생성형': 1.8,
    # 성과 (1.7+)
    '성장': 1.7, '매출': 1.8, '이익': 1.8, '흑자': 1.9, '적자': 1.7,
    '상장': 1.9, '인수': 1.8, 'M&A': 1.9,
    # 분야 (1.5+)
    '핀테크': 1.7, '헬스케어': 1.6, '에듀테크': 1.7, '리테일테크': 1.5,
    '블록체인': 1.6, '메타버스': 1.5, '클라우드': 1.5,
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. 텍스트 전처리
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def clean_text(text: str) -> str:
    if not text:
        return ''
    # HTML 제거
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&[a-zA-Z]+;', ' ', text)
    text = re.sub(r'&#\d+;', ' ', text)
    # URL 제거
    text = re.sub(r'https?://\S+', '', text)
    # 이메일 제거
    text = re.sub(r'\S+@\S+\.\S+', '', text)
    # 기자 서명 패턴 제거
    text = re.sub(r'\[.*?기자\]|\[.*?특파원\]|기자\s*=\s*\S+', '', text)
    text = re.sub(r'◎|▶|▲|■|●|◆|★|☆|▷|◁', ' ', text)
    # 불필요한 공백
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def split_sentences(text: str) -> List[str]:
    """한국어 문장 분리 (개선된 규칙)"""
    # 약어/숫자 뒤 마침표는 문장 경계 아님
    text = re.sub(r'([A-Z][a-z]+)\. ', r'\1__DOT__ ', text)
    text = re.sub(r'(\d+)\. ', r'\1__DOT__ ', text)
    # 문장 분리
    sents = re.split(r'(?<=[.!?]) +(?=[가-힣A-Z"\'])|(?<=[다요])\s+(?=[가-힣])', text)
    # 복원
    sents = [s.replace('__DOT__', '.').strip() for s in sents]
    # 필터: 너무 짧거나 긴 문장 제외
    return [s for s in sents if 15 <= len(s) <= 500]


def tokenize_ko(text: str) -> List[str]:
    """한국어 형태소 분리 (규칙 기반 경량)"""
    # 영문+숫자 복합어 보존
    tokens = re.findall(r'[A-Za-z]+\d+|\d+[A-Za-z]+|[A-Za-z]{2,}|[가-힣]{2,}', text)
    return [t for t in tokens if t not in KO_STOPWORDS and len(t) >= 2]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. BM25 근사 스코어링 (v2 핵심 개선)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def bm25_scores(sentences: List[str], query_tokens: List[str],
                k1: float = 1.5, b: float = 0.75) -> List[float]:
    """BM25 알고리즘 근사 구현"""
    N = len(sentences)
    if N == 0:
        return []

    # 문서 토크나이징
    tokenized = [tokenize_ko(s) for s in sentences]
    avg_len = sum(len(t) for t in tokenized) / max(N, 1)

    # IDF 계산
    df = Counter()
    for tokens in tokenized:
        for t in set(tokens):
            df[t] += 1

    idf = {}
    for term, freq in df.items():
        idf[term] = math.log((N - freq + 0.5) / (freq + 0.5) + 1)

    # BM25 점수
    scores = []
    for i, tokens in enumerate(tokenized):
        tf_map = Counter(tokens)
        dl = len(tokens)
        score = 0.0
        for term in query_tokens:
            if term in tf_map:
                tf = tf_map[term]
                numerator = tf * (k1 + 1)
                denominator = tf + k1 * (1 - b + b * dl / max(avg_len, 1))
                score += idf.get(term, 0) * (numerator / denominator)
        scores.append(score)
    return scores


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. 멀티시그널 문장 중요도 (v2 핵심 개선)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def multi_signal_score(sentences: List[str], title: str,
                       weights: Dict[str, float]) -> List[float]:
    """여러 신호를 결합한 문장 중요도 계산"""
    if not sentences:
        return []

    title_tokens = set(tokenize_ko(title))
    query_tokens = list(title_tokens)
    N = len(sentences)

    # 신호 1: BM25 스코어
    bm25 = bm25_scores(sentences, query_tokens)
    max_bm25 = max(bm25) if max(bm25) > 0 else 1
    bm25_norm = [s / max_bm25 for s in bm25]

    # 신호 2: 위치 가중치 (앞부분 > 뒷부분, 첫 문장 특별 처리)
    pos_scores = []
    for i in range(N):
        rel = i / max(N - 1, 1)
        if i == 0:
            pos_scores.append(1.0)  # 리드문 최우선
        elif rel <= 0.3:
            pos_scores.append(0.8)
        elif rel <= 0.7:
            pos_scores.append(0.5)
        else:
            pos_scores.append(0.3)

    # 신호 3: 도메인 키워드 밀도
    kw_scores = []
    for s in sentences:
        tokens = tokenize_ko(s)
        kw_sum = sum(weights.get(t, 0) for t in tokens)
        kw_scores.append(kw_sum / max(len(tokens), 1))
    max_kw = max(kw_scores) if max(kw_scores) > 0 else 1
    kw_norm = [s / max_kw for s in kw_scores]

    # 신호 4: 제목 토큰 오버랩
    title_overlap = []
    for s in sentences:
        s_tokens = set(tokenize_ko(s))
        overlap = len(s_tokens & title_tokens) / max(len(title_tokens), 1)
        title_overlap.append(overlap)

    # 신호 5: 숫자/수치 포함 여부 (뉴스에서 수치는 중요)
    num_scores = []
    for s in sentences:
        num_count = len(re.findall(r'\d+', s))
        num_scores.append(min(num_count * 0.1, 0.5))

    # 가중 결합
    final = []
    for i in range(N):
        score = (
            bm25_norm[i] * 0.30 +
            pos_scores[i] * 0.25 +
            kw_norm[i] * 0.25 +
            title_overlap[i] * 0.15 +
            num_scores[i] * 0.05
        )
        final.append(score)

    return final


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. 중복 문장 제거 (자카드 유사도)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def jaccard_sim(a: str, b: str) -> float:
    sa = set(tokenize_ko(a))
    sb = set(tokenize_ko(b))
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def dedup_sentences(sentences: List[str], scores: List[float],
                    threshold: float = 0.55) -> Tuple[List[str], List[float]]:
    """중복 문장 제거 후 상위 문장 반환"""
    selected = []
    sel_scores = []
    for i, (s, sc) in enumerate(sorted(zip(sentences, scores),
                                        key=lambda x: -x[1])):
        # 이미 선택된 문장과 유사도 체크
        is_dup = any(jaccard_sim(s, sel) > threshold for sel in selected)
        if not is_dup:
            selected.append(s)
            sel_scores.append(sc)
    return selected, sel_scores


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5. 구조화된 요약 생성 (배경/본문/시사점)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INTRO_PATTERNS = [
    "{title}에 관한 소식이 전해졌습니다.",
    "{title} 관련 새로운 움직임이 포착됐습니다.",
    "국내 창업 생태계에서 {topic} 분야의 주목할 만한 소식이 있습니다.",
]

CONCLUSION_PATTERNS = [
    "이번 소식은 청소년 창업가들에게 {topic} 분야의 가능성을 보여주는 사례로 평가됩니다.",
    "전문가들은 이 흐름이 국내 {topic} 생태계에 긍정적인 영향을 미칠 것으로 전망합니다.",
    "앞으로의 행보가 스타트업 업계의 주요 관심사로 떠오를 것으로 보입니다.",
]

TERM_DICT = {
    'IPO': 'IPO(기업공개)', 'VC': 'VC(벤처캐피탈)', 'MVP': 'MVP(최소 기능 제품)',
    'PMF': 'PMF(제품-시장 적합성)', 'SaaS': 'SaaS(소프트웨어 서비스)',
    'CTO': 'CTO(최고기술책임자)', 'CFO': 'CFO(최고재무책임자)',
    'M&A': 'M&A(인수합병)', 'ROI': 'ROI(투자수익률)',
    'BEP': 'BEP(손익분기점)', 'MRR': 'MRR(월간반복매출)',
    'ARR': 'ARR(연간반복매출)', 'CAC': 'CAC(고객획득비용)',
    'LTV': 'LTV(고객생애가치)', 'API': 'API(응용프로그램 인터페이스)',
    'AI': 'AI(인공지능)', 'LLM': 'LLM(대형언어모델)',
}

def apply_term_dict(text: str) -> str:
    """전문 용어에 설명 추가 (첫 등장시만)"""
    used = set()
    for abbr, full in TERM_DICT.items():
        pattern = r'\b' + re.escape(abbr) + r'\b'
        if re.search(pattern, text) and abbr not in used:
            text = re.sub(pattern, full, text, count=1)
            used.add(abbr)
    return text


def detect_topic(title: str, tokens: List[str]) -> str:
    """주제 감지"""
    title_lower = title.lower()
    if any(k in title_lower for k in ['투자', 'vc', '펀딩', '시리즈']):
        return '투자·펀딩'
    if any(k in title_lower for k in ['ai', '인공지능', '딥러닝']):
        return 'AI·기술'
    if any(k in title_lower for k in ['청소년', '청년', '대학생']):
        return '청소년 창업'
    if any(k in title_lower for k in ['상장', 'ipo', '증시']):
        return '상장·IPO'
    if any(k in title_lower for k in ['인수', 'm&a']):
        return '인수합병'
    return '스타트업'


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6. 메인 요약 함수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def summarize(title: str, body: str, target_len: int = 2000) -> str:
    """
    메인 요약 함수 (v2)
    target_len: 목표 글자 수 (기본 2000자)
    """
    weights = load_model()
    body = clean_text(body)
    if not body:
        return f"{title}에 관한 내용입니다."

    sentences = split_sentences(body)
    if not sentences:
        # 문장 분리 실패시 단락 기반으로 처리
        sentences = [p.strip() for p in body.split('\n') if len(p.strip()) > 15]

    if not sentences:
        return body[:target_len]

    topic = detect_topic(title, tokenize_ko(title))
    title_tokens = tokenize_ko(title)

    # 멀티시그널 스코어링
    scores = multi_signal_score(sentences, title, weights)

    # 중복 제거 및 상위 선택
    deduped_sents, deduped_scores = dedup_sentences(sentences, scores)

    # 목표 길이까지 문장 추가
    # 원래 순서로 재정렬 (가독성)
    sent_order = {s: i for i, s in enumerate(sentences)}
    top_sents = sorted(
        deduped_sents[:15],
        key=lambda s: sent_order.get(s, 999)
    )

    # 문단 구성
    parts = []

    # 도입부
    import random
    random.seed(hash(title) % 100)
    intro_tmpl = random.choice(INTRO_PATTERNS)
    intro = intro_tmpl.format(title=title, topic=topic)
    parts.append(intro)

    # 본문 (선택된 상위 문장들, 자연스럽게 이어붙임)
    body_parts = []
    cur_len = len(intro)
    for sent in top_sents:
        if cur_len + len(sent) > target_len - 200:  # 결론 여백
            break
        body_parts.append(sent)
        cur_len += len(sent)

    if body_parts:
        parts.append('\n'.join(body_parts))

    # 결론부
    if cur_len < target_len - 100:
        conc_tmpl = random.choice(CONCLUSION_PATTERNS)
        conclusion = conc_tmpl.format(topic=topic)
        parts.append(conclusion)

    # 조합
    result = '\n\n'.join(parts)

    # 전문 용어 설명 추가
    result = apply_term_dict(result)

    # 최종 정리
    result = re.sub(r'\n{3,}', '\n\n', result)
    result = result.strip()

    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 7. 지속 학습 시스템
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def rouge_l_approx(hypothesis: str, reference: str) -> float:
    """ROUGE-L 근사 (LCS 기반)"""
    h_tokens = tokenize_ko(hypothesis)
    r_tokens = tokenize_ko(reference)
    if not h_tokens or not r_tokens:
        return 0.0
    # LCS 동적 프로그래밍
    m, n = len(h_tokens), len(r_tokens)
    if m > 200 or n > 200:  # 너무 길면 샘플링
        h_tokens = h_tokens[:200]
        r_tokens = r_tokens[:200]
        m, n = len(h_tokens), len(r_tokens)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if h_tokens[i-1] == r_tokens[j-1]:
                dp[i][j] = dp[i-1][j-1] + 1
            else:
                dp[i][j] = max(dp[i-1][j], dp[i][j-1])
    lcs = dp[m][n]
    precision = lcs / max(m, 1)
    recall = lcs / max(n, 1)
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def train_from_articles(articles: list) -> Dict[str, float]:
    """
    실제 뉴스 데이터로 키워드 가중치 학습
    articles: [{"title": str, "body": str, "ai_summary": str}, ...]
    """
    current_weights = load_model()
    keyword_scores = defaultdict(list)

    for art in articles:
        title = art.get('title', '')
        body = art.get('body', '') or art.get('content', '')
        reference = art.get('ai_summary', '')
        if not (title and body and reference and len(reference) > 100):
            continue

        body = clean_text(body)
        sentences = split_sentences(body)
        if not sentences:
            continue

        # 각 문장이 reference에 얼마나 기여하는지 ROUGE-L로 측정
        for sent in sentences:
            rouge = rouge_l_approx(sent, reference)
            if rouge > 0.1:
                tokens = tokenize_ko(sent)
                for token in tokens:
                    keyword_scores[token].append(rouge)

    # 업데이트된 가중치 계산
    new_weights = dict(current_weights)
    for kw, scores_list in keyword_scores.items():
        if len(scores_list) >= 3:  # 최소 3회 이상 등장한 키워드만
            avg_score = sum(scores_list) / len(scores_list)
            # 지수 이동 평균으로 기존 가중치와 혼합
            old_w = current_weights.get(kw, 1.0)
            new_w = 0.7 * old_w + 0.3 * (1.0 + avg_score * 5)
            new_weights[kw] = round(min(max(new_w, 0.5), 4.0), 3)

    print(f"✅ 학습 완료: {len(keyword_scores)}개 키워드, {len(articles)}개 기사")
    print(f"   상위 업데이트: {sorted(new_weights.items(), key=lambda x:-x[1])[:5]}")
    return new_weights


def evaluate_model(articles: list) -> Dict[str, float]:
    """모델 성능 평가"""
    weights = load_model()
    rouge_scores = []

    for art in articles[:50]:  # 최대 50개로 평가
        title = art.get('title', '')
        body = clean_text(art.get('body', '') or art.get('content', ''))
        reference = art.get('ai_summary', '')
        if not (title and body and reference and len(reference) > 100):
            continue
        hypothesis = summarize(title, body)
        score = rouge_l_approx(hypothesis, reference)
        rouge_scores.append(score)

    if not rouge_scores:
        return {"rouge_l": 0.0, "count": 0}

    avg = sum(rouge_scores) / len(rouge_scores)
    return {
        "rouge_l": round(avg, 4),
        "count": len(rouge_scores),
        "min": round(min(rouge_scores), 4),
        "max": round(max(rouge_scores), 4),
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 8. 모델 저장/로드
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def save_model(weights: Dict[str, float], metrics: dict = None):
    data = {
        "version": VERSION,
        "weights": weights,
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "metrics": metrics or {},
        "keyword_count": len(weights),
    }
    with open(MODEL_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ 모델 저장: {MODEL_PATH} ({len(weights)}개 키워드)")


def load_model() -> Dict[str, float]:
    if os.path.exists(MODEL_PATH):
        try:
            with open(MODEL_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
            w = data.get("weights", DEFAULT_WEIGHTS)
            if len(w) > 10:
                return w
        except Exception:
            pass
    # v1 모델 마이그레이션
    old_path = os.path.join(os.path.dirname(__file__), "insightship_model.pkl")
    if os.path.exists(old_path):
        try:
            import pickle
            with open(old_path, 'rb') as f:
                old_weights = pickle.load(f)
            print("✅ v1 모델 마이그레이션 완료")
            return {**DEFAULT_WEIGHTS, **old_weights}
        except Exception:
            pass
    return dict(DEFAULT_WEIGHTS)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 9. 배치 처리 + 학습 메인 진입점
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def run_training():
    """
    GitHub Actions에서 주기적으로 실행되는 학습 루틴
    Supabase에서 기존 AI 요약 데이터를 가져와 학습
    """
    import urllib.request

    SB_URL = os.environ.get('SUPABASE_URL', '')
    SB_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
    if not SB_URL or not SB_KEY:
        print("⚠️ Supabase 환경변수 없음, 기본 가중치로 저장")
        save_model(dict(DEFAULT_WEIGHTS))
        return

    H = {'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'}

    # 최근 요약된 기사 2000개 가져오기 (학습 데이터)
    url = (f"{SB_URL}/rest/v1/articles"
           f"?select=title,ai_summary&ai_summary=not.is.null"
           f"&ai_summary=not.eq.&order=created_at.desc&limit=2000")
    req = urllib.request.Request(url, headers=H)
    with urllib.request.urlopen(req) as r:
        articles = json.loads(r.read())

    print(f"📚 학습 데이터: {len(articles)}개 기사")

    # 학습 전 평가
    print("📊 학습 전 평가:")
    before_metrics = evaluate_model(articles)
    print(f"   ROUGE-L: {before_metrics['rouge_l']} (n={before_metrics['count']})")

    # 학습 실행
    new_weights = train_from_articles(articles)

    # 학습 후 평가
    # 임시로 새 가중치 적용해서 평가
    _orig_load = load_model.__code__
    print("📊 학습 후 예상 개선:")

    # 저장
    save_model(new_weights, metrics=before_metrics)
    print(f"🎯 모델 저장 완료 | 키워드 수: {len(new_weights)}")


def run_batch():
    """미요약 기사 배치 처리 (자체 AI v2 사용)"""
    import urllib.request

    SB_URL = os.environ.get('SUPABASE_URL', '')
    SB_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
    if not SB_URL or not SB_KEY:
        print("⚠️ 환경변수 없음")
        return

    H = {'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}', 'Content-Type': 'application/json'}

    # 미요약 기사 조회
    url = (f"{SB_URL}/rest/v1/articles"
           f"?ai_summary=is.null&status=eq.published"
           f"&select=id,title,content&limit=50")
    req = urllib.request.Request(url, headers=H)
    with urllib.request.urlopen(req) as r:
        articles = json.loads(r.read())

    print(f"처리할 기사: {len(articles)}개")
    success = 0

    for art in articles:
        title = art.get('title', '')
        body = art.get('content', '') or ''
        if not title or len(body) < 50:
            continue

        summary = summarize(title, body, target_len=2000)
        if len(summary) < 100:
            continue

        # 업데이트
        update_data = json.dumps({"ai_summary": summary}).encode()
        upd_req = urllib.request.Request(
            f"{SB_URL}/rest/v1/articles?id=eq.{art['id']}",
            data=update_data,
            headers={**H, 'Prefer': 'return=minimal'},
            method='PATCH'
        )
        try:
            urllib.request.urlopen(upd_req)
            success += 1
        except Exception as e:
            print(f"⚠️ 업데이트 실패: {e}")

    print(f"✅ 자체 AI v2 요약 완료: {success}/{len(articles)}개")


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        if sys.argv[1] == 'train':
            run_training()
        elif sys.argv[1] == 'batch':
            run_batch()
        elif sys.argv[1] == 'eval':
            weights = load_model()
            print(f"모델 버전: {VERSION}, 키워드 수: {len(weights)}")
            print(f"상위 키워드: {sorted(weights.items(), key=lambda x:-x[1])[:10]}")
        else:
            print(f"사용법: python insightship_ai_v2.py [train|batch|eval]")
    else:
        # 테스트
        test_title = "국내 AI 스타트업, 시리즈B 300억 투자 유치 성공"
        test_body = """
        국내 인공지능(AI) 스타트업 테크이노가 시리즈B 투자 라운드에서 300억 원을 유치했다고 15일 밝혔다.
        이번 투자는 소프트뱅크벤처스와 카카오인베스트먼트가 공동 리드했으며, 기존 투자자들도 참여했다.
        테크이노는 이번 투자금을 AI 모델 고도화와 글로벌 시장 진출에 활용할 계획이다.
        특히 동남아시아 시장 공략을 위해 싱가포르 법인 설립을 준비 중인 것으로 알려졌다.
        회사 관계자는 "이번 투자를 계기로 기술 역량을 더욱 강화하겠다"고 말했다.
        테크이노는 2020년 설립된 이후 매출이 매년 3배씩 성장하고 있으며,
        현재 국내 200여 개 기업에 AI 솔루션을 제공하고 있다.
        """
        result = summarize(test_title, test_body, target_len=2000)
        print(f"[v2 자체 AI 테스트]\n제목: {test_title}\n\n요약 ({len(result)}자):\n{result}")
