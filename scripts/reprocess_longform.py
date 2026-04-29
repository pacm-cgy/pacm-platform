import os, urllib.request, urllib.error, json, re, time, random

SB_URL   = os.environ.get('SUPABASE_URL', '').rstrip('/')
SB_KEY   = os.environ.get('SUPABASE_SERVICE_KEY', '')
BATCH    = int(os.environ.get('BATCH_SIZE', '80'))
ROUNDS   = int(os.environ.get('ROUNDS', '20'))

if not SB_URL or not SB_KEY:
    print("환경변수 없음")
    exit(1)

H = {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
}

# ──────────────────────────────────────────────────────────
# 텍스트 정제
# ──────────────────────────────────────────────────────────
def clean_text(text):
    if not text:
        return ''
    text = re.sub(r'<(script|style)[^>]*>[\s\S]*?</(script|style)>', '', text, flags=re.I)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<')
    text = text.replace('&gt;', '>').replace('&quot;', '"').replace('&#39;', "'")
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'공유하기|페이스북|트위터|카카오|무단전재|재배포\s*금지|저작권자|무단 복제', '', text)
    text = re.sub(r'\s{2,}', ' ', text).strip()
    return text

def split_sentences(text):
    text = re.sub(r'([.!?])\s+', r'\1\n', text)
    text = re.sub(r'([다요임음었겠])\s+', r'\1\n', text)
    sents = [s.strip() for s in text.split('\n')]
    return [s for s in sents if 15 <= len(s) <= 350]

STOPWORDS = set('이 그 저 것 수 들 및 등 에서 로서 으로 에게 하지만 그러나 또한 그리고 따라서 때문에 위해 통해 있는 없는 되는 하는 있다 없다 된다 한다 이다 있으며 되며 하며 이번 지난 올해 작년 최근 현재 특히 또 더 가장 매우 모두 함께 이미 아직 약 총 기자 특파원 뉴스 보도 발표 밝혔다 말했다 전했다 이라고 라고 했다 이다'.split())

def tokenize(text):
    if not text:
        return []
    tokens = re.findall(r'[가-힣]{2,}|[A-Za-z]{3,}|[0-9]+', text)
    return [t for t in tokens if t.lower() not in STOPWORDS and len(t) >= 2]

# ──────────────────────────────────────────────────────────
# 분류기
# ──────────────────────────────────────────────────────────
EVENT_TYPES = {
    'funding':     {'kw': ['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC','엔젤','투자금'], 'label':'투자 유치','emoji':'💰'},
    'product':     {'kw': ['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈','런칭'], 'label':'제품/서비스 출시','emoji':'🚀'},
    'policy':      {'kw': ['정부','지원','공모','선발','과기부','중기부','창진원','예산','규제','정책','공고','모집'], 'label':'정책/지원','emoji':'📋'},
    'acquisition': {'kw': ['인수','합병','M&A','지분','매각','합류'], 'label':'인수/합병','emoji':'🤝'},
    'research':    {'kw': ['연구','논문','결과','조사','분석','보고서','통계','조사결과'], 'label':'연구/조사','emoji':'🔬'},
    'person':      {'kw': ['대표','CEO','창업자','설립자','인터뷰','스토리','수상','공동창업'], 'label':'창업가 스토리','emoji':'👤'},
    'market':      {'kw': ['시장','성장','규모','트렌드','전망','예측','확대','글로벌'], 'label':'시장/트렌드','emoji':'📊'},
}
DOMAINS = {
    'investment': {'kw':['투자','펀딩','시리즈A','시리즈B','억원','조원','VC','벤처'],'ko':'투자·금융','cat':'trend'},
    'tech':       {'kw':['AI','인공지능','딥러닝','반도체','GPU','클라우드','SaaS','LLM','생성형'],'ko':'기술·AI','cat':'trend'},
    'youth':      {'kw':['청소년','청년','대학생','고등학생','창업교육','해커톤','비즈쿨'],'ko':'청소년·교육','cat':'insight'},
    'policy':     {'kw':['정부','지원','공모','과기부','중기부','창진원'],'ko':'정책·지원','cat':'insight'},
    'esg':        {'kw':['ESG','탄소중립','친환경','임팩트','소셜벤처'],'ko':'ESG·임팩트','cat':'insight'},
    'startup':    {'kw':['스타트업','창업','유니콘','피봇','글로벌'],'ko':'창업·비즈니스','cat':'news'},
    'edutech':    {'kw':['에듀테크','교육플랫폼','학습','온라인교육'],'ko':'에듀테크','cat':'insight'},
    'fintech':    {'kw':['핀테크','결제','금융','블록체인','토큰'],'ko':'핀테크','cat':'trend'},
    'health':     {'kw':['헬스케어','의료','바이오','건강','제약'],'ko':'헬스케어','cat':'trend'},
    'climate':    {'kw':['기후','탄소','친환경','에너지','태양광','수소'],'ko':'기후·에너지','cat':'insight'},
}

def detect_event(title, body):
    text = (title + ' ' + (body or '')[:500]).lower()
    priority = ['funding','acquisition','product','policy','research','person','market']
    scores = {}
    for t in priority:
        kw = EVENT_TYPES[t]['kw']
        scores[t] = sum(1 for k in kw if k.lower() in text)
        scores[t] += sum(2 for k in kw if k.lower() in title.lower())
    best = max(priority, key=lambda t: scores[t])
    return best if scores[best] > 0 else 'general'

def detect_domain(title, body):
    text = (title + ' ' + (body or '')[:800]).lower()
    best, best_score = 'startup', 0
    for domain, info in DOMAINS.items():
        score = sum(1 for k in info['kw'] if k.lower() in text)
        score += sum(2 for k in info['kw'] if k.lower() in title.lower())
        if score > best_score:
            best, best_score = domain, score
    return best

def map_category(domain, evt):
    if evt in ('policy',) or domain in ('youth','policy'): return 'insight'
    if evt in ('funding','market'): return 'trend'
    if evt == 'person': return 'magazine'
    return DOMAINS.get(domain, {}).get('cat', 'news')

def extract_numbers(text):
    patterns = [
        r'[\d,]+억\s*원', r'[\d,]+조\s*원', r'[\d,]+만\s*원',
        r'\d+\s*%', r'\d+\s*배', r'[\d,]+만\s*명',
        r'\d+[\d,]*\s*개\s*사', r'\d+[\d,]*\s*개월',
    ]
    nums = []
    for p in patterns:
        nums.extend(re.findall(p, text))
    return list(dict.fromkeys(nums))[:5]

def extract_entities(title, body):
    """기사에서 핵심 고유명사(회사명, 인명) 추출"""
    combined = title + ' ' + body
    # 회사/브랜드 패턴: 한글+테크, 한글+랩스, etc.
    companies = re.findall(r'[가-힣A-Za-z]+(?:테크|랩스|소프트|웍스|시스템|플랫폼|캐피탈|파트너스|벤처스|코리아|글로벌|그룹|홀딩스)', combined)
    # 영문 대문자 시작 단어 (회사/브랜드)
    eng_brands = re.findall(r'\b[A-Z][A-Za-z]{2,}\b', combined)
    # 직함 앞 인명
    persons = re.findall(r'([가-힣]{2,4})\s*(?:대표|CEO|창업자|설립자|이사|부사장|회장)', combined)
    all_entities = list(dict.fromkeys(companies[:3] + eng_brands[:2] + persons[:2]))
    return [e for e in all_entities if len(e) >= 2][:5]

TERM_DICT = {
    'IPO':    ('IPO(기업공개)', 'IPO란 기업이 주식시장에 처음으로 주식을 상장하는 것입니다. 일반 투자자들이 해당 기업의 주주가 될 수 있는 첫 기회입니다.'),
    'VC':     ('VC(벤처캐피털)', 'VC는 성장 가능성이 높은 스타트업에 투자하는 전문 투자사입니다. 단순 자금 외에 네트워크와 경영 자문도 제공합니다.'),
    '시리즈A': ('시리즈A(초기 대규모 투자)', '시리즈A는 PMF(제품-시장 적합성)를 입증한 후 받는 첫 번째 대규모 투자 단계입니다. 보통 수십억 원 규모로 팀 확장과 마케팅에 씁니다.'),
    '시리즈B': ('시리즈B(성장 단계 투자)', '시리즈B는 사업 모델이 검증된 스타트업이 본격적인 규모 확장을 위해 받는 투자입니다. 보통 수백억 원 이상 규모입니다.'),
    '유니콘':  ('유니콘(기업가치 1조원 이상 스타트업)', '유니콘 기업은 비상장 스타트업 중 기업가치가 1조 원(약 10억 달러) 이상인 회사입니다. 전 세계에 1,000개 이상 존재합니다.'),
    'SaaS':   ('SaaS(구독형 소프트웨어)', 'SaaS는 소프트웨어를 설치 없이 인터넷으로 구독료를 내고 사용하는 방식입니다. 슬랙, 노션, 줌이 대표적입니다.'),
    'MVP':    ('MVP(최소 기능 제품)', 'MVP는 핵심 기능만 갖춘 초기 버전의 제품입니다. 빠르게 출시해 실제 고객 반응으로 방향을 검증합니다.'),
    'PMF':    ('PMF(제품-시장 적합성)', 'PMF는 만든 제품이 시장의 수요와 딱 맞아떨어지는 상태입니다. \"유저들이 없으면 아쉬워한다\"는 느낌이 PMF의 신호입니다.'),
    'M&A':    ('M&A(기업 인수·합병)', 'M&A는 한 기업이 다른 기업을 사거나 합치는 것입니다. 스타트업의 주요 EXIT(투자 회수) 전략 중 하나입니다.'),
    'TIPS':   ('TIPS(정부 창업 지원 프로그램)', 'TIPS는 민간 투자사가 먼저 투자한 스타트업에 정부가 최대 7억 원을 매칭 지원하는 한국의 대표 창업 프로그램입니다.'),
    '피봇':   ('피봇(사업 방향 전환)', '피봇은 초기 아이디어가 시장에서 통하지 않을 때 사업 방향을 크게 바꾸는 것입니다. 유튜브는 원래 데이팅 앱이었습니다.'),
    'ARR':    ('ARR(연간 반복 수익)', 'ARR은 구독 기반 비즈니스에서 1년간 반복 발생하는 매출입니다. SaaS 기업의 성장 지표로 가장 많이 쓰입니다.'),
    'ESG':    ('ESG(환경·사회·지배구조)', 'ESG는 기업이 환경 보호, 사회적 책임, 투명한 지배구조를 얼마나 실천하는지 평가하는 기준입니다. 투자자들의 필수 고려 항목입니다.'),
    'AI':     ('AI(인공지능)', '인공지능은 컴퓨터가 학습·추론·판단하는 기술입니다. GPT, 이미지 생성, 자율주행 등이 모두 AI 기술의 산물입니다.'),
}

# ──────────────────────────────────────────────────────────
# 핵심 문장 추출
# ──────────────────────────────────────────────────────────
def extract_key_sentences(title, clean_body, n=8):
    sents = [s for s in split_sentences(clean_body)
             if not re.search(r'무단\s*(전재|배포|복제)|copyright|구독|광고|협찬|저작권', s, re.I)]
    if not sents:
        return []
    title_toks = set(tokenize(title))
    scored = []
    for i, s in enumerate(sents):
        stoks = tokenize(s)
        overlap = sum(1 for t in stoks if t in title_toks)
        pos_b = 1.5 if i < 3 else 1.2 if i < 6 else 1.0
        num_b = 1.6 if re.search(r'[\d,]+억|[\d,]+조|\d+%|\d+배', s) else 1.0
        cau_b = 1.3 if re.search(r'때문에|이유로|배경에는|결과로|따라서|통해서', s) else 1.0
        len_b = 1.2 if 30 <= len(s) <= 200 else 1.0
        scored.append((s, (overlap + 1) * pos_b * num_b * cau_b * len_b, i))
    scored.sort(key=lambda x: -x[1])
    return [x[0] for x in sorted(scored[:n], key=lambda x: x[2])]

# ──────────────────────────────────────────────────────────
# 동적 제목 생성
# ──────────────────────────────────────────────────────────
def make_insight_title(title, evt, dom, nums, entities, key_sents):
    """원문 제목을 기반으로 인사이트 중심의 새 제목을 생성"""
    dom_ko = DOMAINS.get(dom, {}).get('ko', '창업·비즈니스')

    # 숫자가 있는 경우 수치를 강조한 제목
    if nums and evt == 'funding':
        n = nums[0]
        entity = entities[0] if entities else ''
        if entity:
            templates = [
                f"{entity}, {n} 투자 유치 — 왜 투자자들이 선택했나",
                f"{n}의 의미: {entity}가 증명한 것들",
                f"{entity} {n} 투자 — 창업가가 봐야 할 3가지",
            ]
        else:
            templates = [
                f"{n} 투자 유치의 이면 — 무엇이 투자자를 움직였나",
                f"이번 {n} 투자, 창업 생태계에 던지는 시그널",
                f"{dom_ko}에 {n}이 들어온 이유",
            ]
        return random.choice(templates)

    if evt == 'product':
        entity = entities[0] if entities else ''
        product_kw = re.findall(r'[가-힣]{2,}(?:앱|서비스|플랫폼|솔루션|시스템)', title)
        product = product_kw[0] if product_kw else (entity if entity else '이 서비스')
        templates = [
            f"{product} 출시가 가져올 변화 — 창업가의 시선",
            f"왜 지금 {product}인가: 타이밍의 교훈",
            f"{product}에서 배우는 문제 해결의 기술",
        ]
        return random.choice(templates)

    if evt == 'policy':
        templates = [
            f"정부 지원, 제대로 받는 법 — 이번 공모가 주는 힌트",
            f"창업 지원 정책 읽는 법 — 기회를 잡는 창업가의 전략",
            f"이번 정책 지원이 가리키는 곳 — 어디에 기회가 있나",
        ]
        return random.choice(templates)

    if evt == 'acquisition':
        entity = entities[0] if entities else '이 스타트업'
        templates = [
            f"{entity} 인수의 이면 — EXIT 전략을 어떻게 설계할까",
            f"왜 {entity}를 샀나 — M&A에서 배우는 창업 전략",
            f"인수되는 스타트업의 공통점 — {dom_ko} 생태계의 신호",
        ]
        return random.choice(templates)

    if evt == 'person':
        person = entities[0] if entities else '이 창업가'
        templates = [
            f"{person}의 선택 — 그 결정이 의미하는 것",
            f"창업가 {person}에게 배우는 실행력의 비밀",
            f"{person} 스토리 — 실패와 성공 사이의 진짜 교훈",
        ]
        return random.choice(templates)

    if evt == 'market':
        templates = [
            f"{dom_ko} 시장의 변화 — 지금이 기회인 이유",
            f"이 트렌드가 만드는 창업 기회 — {dom_ko}의 미래",
            f"{dom_ko} 생태계 지금 무슨 일이 — 창업가 시선 분석",
        ]
        return random.choice(templates)

    if evt == 'research':
        templates = [
            f"데이터가 말하는 것 — {dom_ko} 생태계의 진짜 현실",
            f"숫자로 보는 {dom_ko} — 창업 기회는 어디에 있나",
            f"이 연구 결과가 가리키는 창업 방향",
        ]
        return random.choice(templates)

    # general: 원문 제목을 가공
    # 기사 키워드 추출해서 인사이트 제목 만들기
    kws = [t for t in tokenize(title) if len(t) >= 2][:3]
    if kws:
        kw_str = ' '.join(kws[:2])
        templates = [
            f"{kw_str} — 창업가가 주목해야 할 이유",
            f"이 소식이 {dom_ko}에 던지는 시사점",
            f"{kw_str}에서 찾는 창업 인사이트",
        ]
        return random.choice(templates)

    return title  # fallback: 원문 그대로

# ──────────────────────────────────────────────────────────
# 동적 롱폼 생성 (핵심: 고정 템플릿 없음, 기사 내용 기반)
# ──────────────────────────────────────────────────────────
def build_longform(title, body):
    clean_body = clean_text(body or '')
    evt  = detect_event(title, clean_body)
    dom  = detect_domain(title, clean_body)
    sents = extract_key_sentences(title, clean_body, n=10)
    nums  = extract_numbers(title + ' ' + clean_body)
    entities = extract_entities(title, clean_body)
    dom_ko = DOMAINS.get(dom, {}).get('ko', '창업·비즈니스')
    evt_info = EVENT_TYPES.get(evt, {'label': '주요 소식', 'emoji': '📰'})

    # 사용된 용어 검색
    used_terms = []
    combined = title + ' ' + clean_body
    for term, (short, long_) in TERM_DICT.items():
        if term in combined:
            used_terms.append((short, long_))
        if len(used_terms) >= 3:
            break

    # 인사이트 제목 생성
    insight_title = make_insight_title(title, evt, dom, nums, entities, sents)

    lines = []

    # ── 헤더 (기사별로 다른 인사이트 제목) ──
    lines.append('# ' + insight_title)
    lines.append('')

    # ── §1 오프닝: 기사의 핵심 팩트를 먼저 ──
    # 원문 제목 출처 표시
    lines.append('> **원문:** ' + title)
    lines.append('')

    # 리드 문장: 기사에서 가장 임팩트 있는 문장으로 시작
    if sents:
        lines.append(sents[0])
        lines.append('')
    elif nums:
        lines.append('이번 소식의 핵심은 **' + nums[0] + '**입니다.')
        lines.append('')

    # 수치가 있으면 강조
    if nums:
        lines.append('**핵심 수치**')
        lines.append('')
        for n in nums[:3]:
            lines.append('- **' + n + '**')
        lines.append('')

    # 추가 핵심 문장들 (있으면)
    if len(sents) > 1:
        for s in sents[1:3]:
            lines.append(s)
        lines.append('')

    # ── §2 무슨 일이 있었나 (원문 요약, 고정 문구 없이) ──
    lines.append('---')
    lines.append('')
    lines.append('## ' + evt_info['emoji'] + ' 무슨 일이 있었나')
    lines.append('')

    # 남은 핵심 문장들로 본문 요약
    if len(sents) > 3:
        for s in sents[3:7]:
            if s not in sents[:3]:
                lines.append(s)
                lines.append('')
    elif clean_body:
        # 원문 앞부분 활용
        short_body = clean_body[:300].strip()
        if short_body:
            lines.append(short_body)
            lines.append('')

    # 엔티티(회사/인물) 언급
    if entities:
        lines.append('**주요 등장인물/기업:** ' + ', '.join(entities))
        lines.append('')

    # ── §3 창업가 시선 분석 (이벤트 타입별로 다르게) ──
    lines.append('---')
    lines.append('')

    if evt == 'funding':
        lines.append('## 💡 투자 유치에서 배우는 것')
        lines.append('')
        investor_q = '이 기업은 어떤 문제를 해결했기에 투자자들이 선택했을까?'
        lines.append('**창업가 시선의 핵심 질문:** ' + investor_q)
        lines.append('')
        if nums:
            lines.append('**' + nums[0] + '**의 투자 유치는 단순한 자금 확보가 아닙니다.')
            lines.append('투자자들은 수백 개의 기업을 검토한 후 소수에만 투자합니다.')
            lines.append('이 기업이 선택된 이유를 역분석하는 것이 창업가의 공부입니다.')
        else:
            lines.append('투자는 시장이 이 문제와 팀을 인정했다는 신호입니다.')
            lines.append('어떤 문제를, 어떤 팀이, 어떻게 풀고 있는지가 핵심입니다.')
        lines.append('')
        lines.append('**지금 당장 해볼 것:**')
        lines.append('')
        lines.append('- 이 기업의 홈페이지와 제품을 직접 살펴보세요')
        lines.append('- 같은 문제를 해결하려는 경쟁자는 누가 있나요?')
        lines.append('- 왜 이 투자자가 이 기업을 선택했는지 생각해보세요')

    elif evt == 'product':
        lines.append('## 💡 제품 출시에서 배우는 것')
        lines.append('')
        lines.append('**핵심 질문:** 기존에 이 문제를 해결하던 방법과 무엇이 다른가?')
        lines.append('')
        lines.append('새로운 서비스의 출시는 두 가지를 동시에 말합니다.')
        lines.append('첫째, 이 문제가 충분히 크다는 것. 둘째, 기존 해결책이 부족하다는 것.')
        lines.append('')
        lines.append('**지금 당장 해볼 것:**')
        lines.append('')
        lines.append('- 이 서비스를 직접 사용해보고 불편한 점을 찾아보세요')
        lines.append('- 이 서비스가 없다면 사용자들은 어떻게 이 문제를 해결했을까요?')
        lines.append('- 아직 해결되지 않은 빈틈은 어디인가요?')

    elif evt == 'policy':
        lines.append('## 💡 정책 지원을 활용하는 법')
        lines.append('')
        lines.append('**핵심:** 정책 자금은 창업 초기 가장 저렴한 자본입니다.')
        lines.append('')
        lines.append('지분을 내주지 않고 초기 자금을 마련할 수 있는 방법 중 하나가 정부 지원입니다.')
        lines.append('지원 자격, 선발 기준, 지원 내용을 꼼꼼히 파악하는 것이 중요합니다.')
        lines.append('')
        lines.append('**지금 당장 해볼 것:**')
        lines.append('')
        lines.append('- K-스타트업 창업지원포털(k-startup.go.kr)을 즐겨찾기하세요')
        lines.append('- 지원 자격을 확인하고 해당 여부를 파악하세요')
        lines.append('- 사업계획서 작성 연습을 지금부터 시작하세요')

    elif evt == 'acquisition':
        lines.append('## 💡 인수·합병에서 배우는 EXIT 전략')
        lines.append('')
        lines.append('**핵심 질문:** 왜 이 기업이 인수됐을까?')
        lines.append('')
        lines.append('M&A는 스타트업의 중요한 출구 전략입니다.')
        lines.append('인수한 기업이 이 스타트업에서 원한 것이 무엇인지 분석하면,')
        lines.append('\"어떤 스타트업이 가치 있는가\"를 역으로 이해할 수 있습니다.')
        lines.append('')
        lines.append('**지금 당장 해볼 것:**')
        lines.append('')
        lines.append('- 인수 기업이 원한 자산(기술·유저·팀)을 분석해보세요')
        lines.append('- 나중에 어떤 기업에 인수되고 싶은지 역발상으로 창업 방향을 잡아보세요')

    elif evt == 'person':
        person = entities[0] if entities else '이 창업가'
        lines.append('## 💡 ' + person + '의 이야기에서 배우는 것')
        lines.append('')
        lines.append('성공한 창업가의 이야기에서 가장 중요한 것은 성공 비결이 아닙니다.')
        lines.append('\"어디서 실패했고, 어떻게 극복했는가\"가 진짜 교훈입니다.')
        lines.append('')
        lines.append('**지금 당장 해볼 것:**')
        lines.append('')
        lines.append('- 이 창업가가 겪은 가장 큰 위기가 무엇인지 찾아보세요')
        lines.append('- 같은 상황에서 나라면 어떤 선택을 했을지 생각해보세요')
        lines.append('- 나의 창업 방향과 어떤 접점이 있는지 메모해보세요')

    elif evt == 'market':
        lines.append('## 💡 이 시장 트렌드를 어떻게 읽을까')
        lines.append('')
        lines.append('**핵심 질문:** 이 시장이 지금 성장하는 이유는 무엇인가?')
        lines.append('')
        lines.append('트렌드를 읽는 능력은 창업 타이밍의 핵심입니다.')
        lines.append('너무 이르면 시장이 없고, 너무 늦으면 경쟁이 치열합니다.')
        lines.append('지금 이 시장의 변화 신호를 포착하는 것이 기회입니다.')
        lines.append('')
        lines.append('**지금 당장 해볼 것:**')
        lines.append('')
        lines.append('- 이 시장의 주요 플레이어 3~5개를 조사해보세요')
        lines.append('- 5년 후 이 시장은 어떤 모습일지 시나리오를 써보세요')
        lines.append('- 아직 해결되지 않은 빈 공간(white space)을 찾아보세요')

    elif evt == 'research':
        lines.append('## 💡 데이터에서 창업 기회 읽기')
        lines.append('')
        lines.append('**핵심 질문:** 이 연구 결과가 사실이라면, 어떤 새로운 기회가 생기나?')
        lines.append('')
        lines.append('숫자와 데이터는 막연한 아이디어를 검증해주는 도구입니다.')
        lines.append('이 연구가 발견한 것이 무엇인지, 그것이 무엇을 의미하는지를 창업가 시선으로 읽어야 합니다.')
        lines.append('')
        lines.append('**지금 당장 해볼 것:**')
        lines.append('')
        lines.append('- 이 데이터를 바탕으로 창업 아이디어 2~3개를 떠올려보세요')
        lines.append('- 이 연구 결과와 반대되는 시각은 없는지 찾아보세요')
        lines.append('- 5년 전과 비교했을 때 무엇이 달라졌는지 확인해보세요')

    else:  # general
        lines.append('## 💡 이 소식이 가져올 변화')
        lines.append('')
        lines.append('**핵심 질문:** 이 소식이 ' + dom_ko + ' 생태계에 어떤 변화를 가져올까?')
        lines.append('')
        lines.append('창업 생태계의 모든 변화는 누군가에겐 기회입니다.')
        lines.append('이 소식이 어떤 문제를 드러내고, 어떤 빈자리를 만드는지 생각해보세요.')
        lines.append('')
        lines.append('**지금 당장 해볼 것:**')
        lines.append('')
        lines.append('- 이 변화로 가장 이익을 보는 사람은 누구인가요?')
        lines.append('- 이 소식에서 창업 아이디어 하나를 뽑아보세요')

    lines.append('')

    # ── §4 배경 지식 (용어 설명) ──
    if used_terms:
        lines.append('---')
        lines.append('')
        lines.append('## 📚 이 기사를 읽기 위한 배경 지식')
        lines.append('')
        for short, long_ in used_terms:
            lines.append('**' + short + '**')
            lines.append('')
            lines.append(long_)
            lines.append('')

    # ── §5 생각해볼 질문 (이벤트별 맞춤) ──
    DEEP_Q = {
        'funding':     ['이 기업이 투자받은 후 다음 단계에서 증명해야 할 것은 무엇일까요?', '나라면 이 기업에 투자했을까요? 그 이유는?', '이 분야에서 아직 아무도 투자하지 않은 문제는 무엇일까요?'],
        'product':     ['이 제품이 없었다면 사용자들은 이 문제를 어떻게 해결했을까요?', '1년 후 이 서비스의 가장 큰 경쟁자는 누가 될까요?', '이 서비스에서 아직 해결하지 못한 불편함은 무엇인가요?'],
        'policy':      ['이 지원을 받기 위해 지금 준비해야 할 것은 무엇인가요?', '정부가 이 분야를 지원하는 진짜 이유는 무엇일까요?', '이 지원을 가장 잘 활용할 수 있는 팀의 조건은?'],
        'acquisition': ['인수된 창업가는 왜 IPO 대신 M&A를 선택했을까요?', '이 인수로 기존 경쟁자들은 어떤 영향을 받을까요?', '당신이 이 스타트업을 창업했다면, 팔겠습니까 아니면 계속 키우겠습니까?'],
        'research':    ['이 데이터가 5년 전과 다른 이유는 무엇일까요?', '이 연구 결과와 반대되는 의견은 없을까요?', '이 데이터를 바탕으로 지금 창업할 수 있는 아이디어 3개는?'],
        'person':      ['이 창업가의 가장 큰 실패는 무엇이고 어떻게 극복했나요?', '같은 상황에서 나라면 다른 선택을 했을까요?', '이 창업가처럼 되기 위해 지금 당장 할 수 있는 가장 작은 행동은?'],
        'market':      ['이 시장이 10배 성장했을 때 가장 큰 수혜자는 누구일까요?', '이 트렌드가 거품이 될 수 있을까요? 그 징후는?', '이 시장에서 아직 아무도 해결하지 못한 문제는?'],
        'general':     ['이 소식이 미치는 영향을 가장 많이 받는 사람은?', '5년 후 이 분야는 어떤 모습일까요?', '이 뉴스에서 창업 기회를 하나 뽑는다면 무엇인가요?'],
    }
    deep_q = DEEP_Q.get(evt, DEEP_Q['general'])

    lines.append('---')
    lines.append('')
    lines.append('## 💭 스스로에게 던져볼 질문')
    lines.append('')
    for q in deep_q:
        lines.append('- ' + q)
    lines.append('')

    return '\n'.join(lines)

# ──────────────────────────────────────────────────────────
# Supabase 헬퍼
# ──────────────────────────────────────────────────────────
def sb_get(path, params=''):
    url = SB_URL + '/rest/v1/' + path + '?' + params
    req = urllib.request.Request(url, headers={**H, 'Prefer':'count=exact'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read()), r.headers.get('content-range','')

def sb_patch(path, data):
    url = SB_URL + '/rest/v1/' + path
    req = urllib.request.Request(url, data=json.dumps(data).encode(),
                                 headers={**H,'Prefer':'return=minimal'}, method='PATCH')
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code

# ──────────────────────────────────────────────────────────
# 메인 루프
# ──────────────────────────────────────────────────────────
total_done = 0
total_fail = 0

for rnd in range(1, ROUNDS + 1):
    try:
        arts, cr = sb_get('articles',
            'status=eq.published&source_name=not.is.null'
            '&select=id,title,body,excerpt,ai_summary'
            '&order=published_at.desc&limit=' + str(BATCH))
    except Exception as e:
        print('[R' + str(rnd) + '] 조회 실패: ' + str(e))
        break

    if not isinstance(arts, list) or not arts:
        print('[R' + str(rnd) + '] 기사 없음 — 완료')
        break

    # 롱폼이 아닌 것 필터 (500자 미만 또는 ## 섹션 없는 것)
    pending = [a for a in arts if len(a.get('ai_summary') or '') < 500
               or '##' not in (a.get('ai_summary') or '')]
    if not pending:
        print('[R' + str(rnd) + '] 모두 롱폼 완료 — 종료')
        break

    done, fail = 0, 0
    for a in pending:
        art_id = a['id']
        title  = a.get('title') or ''
        body   = a.get('body') or a.get('excerpt') or title

        if not title:
            fail += 1
            continue

        try:
            summary = build_longform(title, body)
            evt     = detect_event(title, clean_text(body))
            dom     = detect_domain(title, clean_text(body))
            cat     = map_category(dom, evt)
            read_t  = max(3, len(summary) // 350)

            status = sb_patch(
                'articles?id=eq.' + str(art_id),
                {
                    'ai_summary': summary,
                    'ai_processed_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                    'ai_category': dom,
                    'category': cat,
                    'read_time': read_t,
                }
            )
            if status in (200, 204):
                done += 1
            else:
                fail += 1
                if fail <= 3:
                    print('  PATCH 실패 ' + str(status) + ': ' + str(art_id))
        except Exception as e:
            fail += 1
            if fail <= 3:
                print('  처리 오류: ' + str(e))

    total_done += done
    total_fail += fail
    print('[R' + str(rnd) + '/' + str(ROUNDS) + '] 처리 ' + str(len(pending)) +
          '건 → 성공 ' + str(done) + ' / 실패 ' + str(fail) +
          ' | 누적 성공 ' + str(total_done))

    if len(pending) < BATCH:
        print('마지막 배치 완료')
        break
    time.sleep(2)

print('\n=== 롱폼 v9 재처리 완료 ===')
print('총 성공: ' + str(total_done) + '건 | 총 실패: ' + str(total_fail) + '건')
