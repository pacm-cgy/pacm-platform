"""
Insightship AI - 자체 개발 뉴스 요약 엔진 v1.0
외부 AI API 완전 불필요 - 순수 Python + 통계/ML 기반

구조:
1. TextRank + TF-IDF 핵심 문장 추출
2. 한국어 형태소 분석 (규칙 기반 경량)
3. 청소년 친화적 재구성 (패턴 기반)
4. 선택적: transformers 경량 모델 (CPU 가능)
"""
import re, math, os, json, urllib.request
from collections import Counter, defaultdict

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. 한국어 텍스트 전처리
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 한국어 불용어
KO_STOPWORDS = {
    '이','그','저','것','수','들','및','등','에서','로서','으로','에게',
    '하지만','그러나','또한','그리고','따라서','때문에','때문','위해',
    '통해','대한','관련','관해','따른','있는','없는','되는','하는',
    '있다','없다','된다','한다','이다','있으며','되며','하며',
    '이번','지난','올해','올해는','작년','올','금','이달',
    '특히','또','더','가장','매우','모두','함께','이미','아직',
    '약','총','전','후','당','각','제','본','해당','관련',
}

# 창업/스타트업 핵심 키워드 (가중치 부여)
STARTUP_KEYWORDS = {
    '스타트업':2.0,'창업':2.0,'투자':1.8,'펀딩':1.8,'VC':1.8,
    '유니콘':2.5,'상장':1.7,'IPO':1.7,'매출':1.6,'성장':1.5,
    'AI':1.8,'인공지능':1.8,'플랫폼':1.5,'서비스':1.3,
    '청소년':2.5,'대학생':1.8,'청년':1.8,
    '억':1.6,'조':1.7,'억원':1.6,'조원':1.7,
    '시리즈':1.7,'라운드':1.6,'엑셀러레이터':1.8,'엔젤':1.6,
    '글로벌':1.5,'해외':1.4,'진출':1.4,'수출':1.4,
    '혁신':1.5,'기술':1.4,'솔루션':1.4,'앱':1.4,
}

def clean_text(text: str) -> str:
    """HTML, 특수문자 제거"""
    if not text: return ''
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&[a-z]+;', ' ', text)
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def split_sentences(text: str) -> list:
    """한국어 문장 분리"""
    # 마침표/느낌표/물음표 기준 분리 (단, 숫자 소수점 예외)
    text = re.sub(r'([.!?])\s+', r'\1\n', text)
    text = re.sub(r'([다요])\s+', r'\1\n', text)
    sents = [s.strip() for s in text.split('\n') if len(s.strip()) > 20]
    return sents

def tokenize_ko(text: str) -> list:
    """경량 한국어 토크나이저 (규칙 기반)"""
    # 숫자+단위 보존
    text = re.sub(r'(\d+)([억조만원%])', r'\1\2 ', text)
    # 영문 단어 보존
    tokens = re.findall(r'[가-힣]+|[A-Za-z]+|[0-9]+[억조만원%]?', text)
    # 불용어 제거 + 최소 길이
    tokens = [t for t in tokens if t not in KO_STOPWORDS and len(t) >= 2]
    return tokens

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. TF-IDF + TextRank 핵심 문장 추출
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def tfidf_sentence_score(sentences: list, title_tokens: list) -> list:
    """TF-IDF 기반 문장 중요도 계산"""
    if not sentences:
        return []

    # 전체 코퍼스 TF-IDF
    doc_freq = Counter()
    sent_tokens = []
    for s in sentences:
        toks = set(tokenize_ko(s))
        sent_tokens.append(toks)
        for t in toks:
            doc_freq[t] += 1

    N = len(sentences)
    scores = []
    for i, (s, toks) in enumerate(zip(sentences, sent_tokens)):
        if not toks:
            scores.append(0.0)
            continue

        # TF-IDF 점수
        tf_idf_score = 0.0
        for tok in toks:
            tf = 1.0 / len(toks)
            idf = math.log((N + 1) / (doc_freq[tok] + 1))
            weight = STARTUP_KEYWORDS.get(tok, 1.0)
            tf_idf_score += tf * idf * weight

        # 제목 키워드 보너스
        title_overlap = len(toks & set(title_tokens)) / max(len(toks), 1)

        # 위치 보너스 (앞 문장 중요)
        pos_bonus = 1.0 + (N - i) / (N * 2)

        # 길이 패널티 (너무 짧거나 긴 문장)
        length = len(s)
        len_bonus = 1.0 if 50 <= length <= 200 else 0.7

        # 숫자/수치 포함 보너스
        num_bonus = 1.3 if re.search(r'\d+[억조만원%]', s) else 1.0

        final = tf_idf_score * (1 + title_overlap) * pos_bonus * len_bonus * num_bonus
        scores.append(final)

    return scores

def textrank_rerank(sentences: list, scores: list, topk: int = 7) -> list:
    """TextRank로 문장 간 유사도 계산해서 재순위"""
    if len(sentences) <= topk:
        return list(range(len(sentences)))

    sent_tokens = [set(tokenize_ko(s)) for s in sentences]
    n = len(sentences)

    # 문장 간 유사도 행렬
    sim = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j: continue
            if not sent_tokens[i] or not sent_tokens[j]: continue
            inter = len(sent_tokens[i] & sent_tokens[j])
            denom = math.log(len(sent_tokens[i])+1) + math.log(len(sent_tokens[j])+1)
            sim[i][j] = inter / denom if denom > 0 else 0

    # PageRank (10회 반복)
    pr = [scores[i] for i in range(n)]  # TF-IDF 초기값
    damping = 0.85
    for _ in range(10):
        new_pr = []
        for i in range(n):
            denom = sum(sum(sim[j]) for j in range(n))
            rank_sum = sum(sim[j][i] * pr[j] for j in range(n)
                          if sum(sim[j]) > 0) / max(denom, 1e-9)
            new_pr.append((1 - damping) + damping * rank_sum)
        pr = new_pr

    # topk 선택 + 원래 순서 유지
    ranked = sorted(range(n), key=lambda i: pr[i], reverse=True)[:topk]
    return sorted(ranked)  # 원래 텍스트 순서

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. 청소년 친화적 변환
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 어려운 용어 → 쉬운 설명
TERM_DICT = {
    'IPO': 'IPO(기업공개, 주식시장에 처음 상장하는 것)',
    'VC': 'VC(벤처캐피털, 스타트업에 투자하는 전문 투자회사)',
    '시리즈A': '시리즈A(스타트업 초기 대규모 투자 단계)',
    '시리즈B': '시리즈B(스타트업 성장 단계 투자)',
    '시리즈C': '시리즈C(스타트업 확장 단계 투자)',
    '엑셀러레이터': '엑셀러레이터(초기 스타트업을 집중 육성하는 기관)',
    '유니콘': '유니콘(기업 가치 1조원 이상 비상장 스타트업)',
    '엔젤투자': '엔젤투자(초기 창업자에게 개인이 직접 투자하는 것)',
    'SaaS': 'SaaS(인터넷으로 제공하는 소프트웨어 서비스)',
    'B2B': 'B2B(기업 간 거래)',
    'B2C': 'B2C(기업과 소비자 간 거래)',
    'MVP': 'MVP(최소 기능 제품, 핵심 기능만 담은 첫 버전)',
    '풀필먼트': '풀필먼트(상품 보관·포장·배송을 대행하는 물류 서비스)',
    '데카콘': '데카콘(기업 가치 10조원 이상 스타트업)',
}

def apply_term_dict(text: str) -> str:
    """전문용어에 괄호 설명 추가 (첫 등장만)"""
    used = set()
    for term, explanation in TERM_DICT.items():
        if term in text and term not in used:
            text = text.replace(term, explanation, 1)
            used.add(term)
    return text

def make_intro(title: str, key_tokens: list) -> str:
    """도입부 생성"""
    # 핵심 키워드 추출
    top_kw = [t for t in key_tokens if t in STARTUP_KEYWORDS][:3]

    patterns = [
        f"최근 {title.rstrip('.')}와 관련한 소식이 전해졌습니다.",
        f"창업 생태계에서 주목할 만한 소식입니다.",
        f"스타트업 업계의 새로운 흐름을 전합니다.",
    ]
    if '청소년' in title or '청년' in title:
        patterns.insert(0, f"청소년 창업가들이 주목해야 할 소식입니다.")
    if '투자' in title or '펀딩' in title:
        patterns.insert(0, f"투자 시장에서 눈길을 끄는 소식이 들어왔습니다.")

    return patterns[0]

def make_conclusion(title: str, key_tokens: list) -> str:
    """마무리 문장 생성"""
    if any(k in key_tokens for k in ['청소년','청년','학생','대학생']):
        return "이번 소식은 창업을 꿈꾸는 청소년들에게 실질적인 참고가 될 것으로 보입니다."
    if any(k in key_tokens for k in ['투자','펀딩','시리즈']):
        return "이번 투자 소식은 국내 스타트업 생태계의 활발한 성장세를 보여주는 사례로 평가됩니다."
    if any(k in key_tokens for k in ['AI','인공지능']):
        return "AI 기술이 창업 생태계에 미치는 영향이 커지고 있는 만큼, 관련 동향에 지속적인 관심이 필요합니다."
    return "이번 사례는 창업을 준비하는 청소년들이 업계 흐름을 파악하는 데 도움이 될 것으로 기대됩니다."

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. 메인 요약 함수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def summarize(title: str, body: str, target_len: int = 800) -> str:
    """
    뉴스 요약 메인 함수
    title: 뉴스 제목
    body: 뉴스 본문
    target_len: 목표 글자 수 (기본 800자)
    """
    title = clean_text(title)
    body  = clean_text(body)

    if not body or len(body) < 50:
        body = title

    # 문장 분리
    sentences = split_sentences(body)
    if not sentences:
        sentences = [body]

    # 제목 토큰
    title_tokens = tokenize_ko(title)

    # 핵심 문장 추출
    scores = tfidf_sentence_score(sentences, title_tokens)
    topk = min(7, max(3, len(sentences) // 3))
    top_indices = textrank_rerank(sentences, scores, topk=topk)
    core_sentences = [sentences[i] for i in top_indices]

    # 글자 수 조정
    result_text = ' '.join(core_sentences)
    if len(result_text) < target_len * 0.5 and len(sentences) > topk:
        # 부족하면 더 추가
        extra = [sentences[i] for i in range(len(sentences))
                 if i not in top_indices][:3]
        core_sentences = core_sentences + extra
        result_text = ' '.join(core_sentences)

    # 도입부 + 핵심 내용 + 마무리 조립
    key_tokens = tokenize_ko(body)
    intro      = make_intro(title, key_tokens)
    conclusion = make_conclusion(title, key_tokens)

    # 용어 설명 적용
    core_text = apply_term_dict(result_text)

    summary = f"{intro}\n\n{core_text}\n\n{conclusion}"

    # 길이 조정 (최대 1200자)
    if len(summary) > 1200:
        summary = summary[:1197] + '...'

    return summary


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5. 배치 실행 (GitHub Actions에서 호출)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SERVICE_KEY  = os.environ.get('SUPABASE_SERVICE_KEY', '')
MAX_PER_RUN  = int(os.environ.get('BATCH_SIZE', '150'))

def run_batch():
    if not SUPABASE_URL:
        print("SUPABASE_URL 없음")
        return

    H = {'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}',
         'Content-Type': 'application/json'}

    # 요약 필요한 뉴스 조회
    url = (f"{SUPABASE_URL}/rest/v1/articles?status=eq.published"
           f"&category=eq.news&ai_summary=is.null"
           f"&select=id,title,body,excerpt"
           f"&order=published_at.desc&limit={MAX_PER_RUN}")
    req = urllib.request.Request(url, headers=H)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            articles = json.loads(r.read())
    except Exception as e:
        print(f"조회 오류: {e}")
        return

    print(f"처리 대상: {len(articles)}개")
    done, fail = 0, 0

    for a in articles:
        title = a.get('title', '')
        body  = a.get('body', '') or a.get('excerpt', '')

        try:
            summary = summarize(title, body)
            if not summary or len(summary) < 100:
                fail += 1
                continue

            # DB 업데이트
            payload = json.dumps({'ai_summary': summary}).encode()
            patch = urllib.request.Request(
                f"{SUPABASE_URL}/rest/v1/articles?id=eq.{a['id']}",
                data=payload,
                headers={**H, 'Prefer': 'return=minimal'},
                method='PATCH'
            )
            with urllib.request.urlopen(patch, timeout=10) as r:
                if r.status in (200, 204):
                    done += 1
                else:
                    fail += 1
        except Exception as e:
            fail += 1

    print(f"✅ 완료: {done}개 성공 / {fail}개 실패")
    print(f"   외부 AI API: 0원, 0 요청")


if __name__ == '__main__':
    run_batch()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6. 학습 기반 향상 — 실제 데이터로 키워드 가중치 자동 갱신
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import pickle, json, os, math, urllib.request
from collections import Counter

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'insightship_model.pkl')

def train_keyword_weights(articles: list) -> dict:
    """
    실제 뉴스 데이터에서 중요 키워드를 학습
    고품질 요약이 있는 기사의 키워드 → 가중치 높게
    """
    all_tokens = Counter()
    summary_tokens = Counter()

    for a in articles:
        body_toks = tokenize_ko(a.get('title','') + ' ' + a.get('excerpt',''))
        for t in body_toks:
            all_tokens[t] += 1

        if a.get('ai_summary') and len(a['ai_summary']) > 300:
            summ_toks = tokenize_ko(a['ai_summary'])
            for t in summ_toks:
                summary_tokens[t] += 1

    # 요약에 자주 나오는 단어 = 중요 키워드
    learned_weights = {}
    total = sum(all_tokens.values()) or 1
    for tok, cnt in summary_tokens.items():
        bg_prob = all_tokens.get(tok, 1) / total
        fg_prob = cnt / (sum(summary_tokens.values()) or 1)
        # 확률 비율 (PMI 유사)
        ratio = fg_prob / bg_prob
        if ratio > 2.0 and cnt >= 5:
            learned_weights[tok] = min(3.0, 1.0 + ratio * 0.3)

    return learned_weights


def save_model(weights: dict):
    with open(MODEL_PATH, 'wb') as f:
        pickle.dump({'keyword_weights': weights, 'version': '1.0'}, f)
    print(f"✅ 모델 저장: {MODEL_PATH} ({len(weights)}개 키워드)")


def load_model() -> dict:
    if not os.path.exists(MODEL_PATH):
        return {}
    with open(MODEL_PATH, 'rb') as f:
        data = pickle.load(f)
    return data.get('keyword_weights', {})


# 시작 시 모델 로드하여 STARTUP_KEYWORDS에 병합
def init_model():
    global STARTUP_KEYWORDS
    learned = load_model()
    if learned:
        merged = {**STARTUP_KEYWORDS, **learned}
        STARTUP_KEYWORDS = merged
        print(f"✅ 학습 모델 로드: {len(learned)}개 키워드 추가")


# ── 학습 실행 (GitHub Actions에서 주기적으로 호출) ────────────
def run_training():
    """DB에서 데이터 수집 → 키워드 가중치 학습 → 모델 저장"""
    if not SUPABASE_URL:
        print("SUPABASE_URL 없음")
        return

    H = {'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}'}
    articles = []

    # 최신 2000개 요약 완료 기사로 학습
    for offset in range(0, 2000, 200):
        url = (f"{SUPABASE_URL}/rest/v1/articles?status=eq.published"
               f"&category=eq.news&ai_summary=not.is.null"
               f"&select=title,excerpt,ai_summary"
               f"&order=published_at.desc&limit=200&offset={offset}")
        req = urllib.request.Request(url, headers=H)
        try:
            with urllib.request.urlopen(req, timeout=12) as r:
                batch = json.loads(r.read())
            if not batch:
                break
            articles.extend(batch)
        except Exception as e:
            print(f"오류 offset={offset}: {e}")
            break

    if len(articles) < 100:
        print(f"학습 데이터 부족: {len(articles)}개")
        return

    print(f"학습 데이터: {len(articles)}개")
    weights = train_keyword_weights(articles)
    save_model(weights)
    print(f"상위 키워드: {sorted(weights.items(), key=lambda x:-x[1])[:10]}")


# 모듈 로드 시 모델 초기화
init_model()

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == 'train':
        run_training()
    else:
        run_batch()
