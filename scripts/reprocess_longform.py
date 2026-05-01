#!/usr/bin/env python3
"""
롱폼 재처리 스크립트 v16
- 구버전 패턴([핵심 내용], [배경 및 분석]) 기사 → v16 엔진으로 재생성
- HTML 잔재(&amp; 등) 제거
- 배치 처리 (100개씩)
"""

import urllib.request, urllib.parse, json, re, sys, time
from datetime import datetime

SB_URL = 'https://itcbantrpkjpkfhnriom.supabase.co'
SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0Y2JhbnRycGtqcGtmaG5yaW9tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzU4NDkwNywiZXhwIjoyMDg5MTYwOTA3fQ.WTi9QnNyerC6X9xxcJgOJ0TpVk7VVzXqf85r3rN-o20'

H = {
    'apikey': SB_KEY,
    'Authorization': f'Bearer {SB_KEY}',
    'Content-Type': 'application/json',
}

LEGACY_PATTERNS = [
    '[핵심 내용]', '[배경 및 분석]', '[투자 시장 심층 분석',
    '[청소년 창업가를 위한', '[청소년 창업가 관점]', '[핵심 포인트]',
    '이번 투자 소식은 해당 기업의 기술력과 성장 가능성을 시장이 인정한',
    '스타트업 투자는 보통 시드(초기) →',
    '투자금은 통상 제품 개발 가속화, 핵심 인재 채용',
    '투자자는 창업가의 비전을 검증해주는 파트너',
    '스타트업 생태계의 변화는 새로운 창업 기회의 신호입니다',
    '스타트업 관련 업계에서 중요한 소식이 전해졌습니다',
    '투자·펀딩 관련 업계에서 중요한 소식이 전해졌습니다',
    'insightship-longform-v8', 'insightship-longform-v9',
    'insightship-longform-v10', 'insightship-longform-v11',
    'insightship-longform-v12', 'insightship-longform-v13',
    'insightship-longform-v14',
]

def is_legacy(text):
    if not text: return True
    return any(p in text for p in LEGACY_PATTERNS)

# ── 텍스트 정제 ────────────────────────────────────────────────────────
def clean_text(t):
    if not t: return ''
    t = re.sub(r'<(script|style)[^>]*>[\s\S]*?</(script|style)>', '', t, flags=re.I)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = t.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<')
    t = t.replace('&gt;', '>').replace('&quot;', '"').replace('&#39;', "'")
    t = re.sub(r'&#x?[0-9a-fA-F]+;', '', t)
    t = re.sub(r'https?://\S+', '', t)
    t = re.sub(r'공유하기|페이스북|트위터|카카오톡\s*공유|인스타그램|네이버\s*밴드|URL\s*복사', '', t)
    t = re.sub(r'기자\s*[가-힣]{2,4}\s*기자|^\s*[가-힣]{2,3}\s*기자', '', t, flags=re.M)
    t = re.sub(r'입력\s*\d{4}\.\d{2}\.\d{2}.*$', '', t, flags=re.M)
    t = re.sub(r'수정\s*\d{4}\.\d{2}\.\d{2}.*$', '', t, flags=re.M)
    t = re.sub(r'저작권자\s*©.*$', '', t, flags=re.M)
    t = re.sub(r'무단전재\s*및\s*재배포\s*금지', '', t)
    t = re.sub(r'\[.*?\]', '', t)
    t = re.sub(r'\(.*?기자\)', '', t)
    t = re.sub(r'\s{2,}', ' ', t)
    return t.strip()

# ── 이벤트/도메인 감지 ─────────────────────────────────────────────────
EVENT_TYPES = {
    'funding':     {'kw': ['투자','펀딩','시리즈','유치','억원','조원','라운드','시드','VC','엔젤','달러','Pre-A','CVC','브릿지'], 'label': '투자 유치', 'emoji': '💰'},
    'product':     {'kw': ['출시','론칭','선보','공개','베타','서비스','앱','플랫폼','오픈','런칭','배포','상용화','신기능'], 'label': '제품/서비스 출시', 'emoji': '🚀'},
    'policy':      {'kw': ['정부','지원','공모','선발','과기부','중기부','창진원','예산','규제','정책','공고','모집','개최','경진대회','프로그램','유니콘','바우처','R&D'], 'label': '정책/지원', 'emoji': '📋'},
    'acquisition': {'kw': ['인수','합병','M&A','지분','매각','인수합병','피인수','전략적투자'], 'label': '인수/합병', 'emoji': '🤝'},
    'research':    {'kw': ['연구','논문','결과','조사','분석','보고서','데이터','통계','발표','리포트','영향','설문'], 'label': '리서치/분석', 'emoji': '🔬'},
    'person':      {'kw': ['대표','CEO','창업자','설립자','인터뷰','스토리','수상','선정','창업가','강연','멘토'], 'label': '창업가 스토리', 'emoji': '👤'},
    'market':      {'kw': ['시장','성장','규모','트렌드','전망','예측','확대','점유율','글로벌','산업','진출','수출'], 'label': '시장/트렌드', 'emoji': '📊'},
    'ipo':         {'kw': ['IPO','상장','코스닥','코스피','증권','기업공개'], 'label': 'IPO/상장', 'emoji': '📈'},
}
DOMAINS = {
    'investment': {'kw': ['투자','펀딩','시리즈A','시리즈B','시리즈C','억원','조원','달러','VC','엑셀러레이터','벤처','자본','CVC'], 'ko': '투자·금융'},
    'tech':       {'kw': ['AI','인공지능','딥러닝','반도체','GPU','클라우드','SaaS','소프트웨어','로봇','자율주행','LLM','생성형'], 'ko': '기술·AI'},
    'youth':      {'kw': ['청소년','청년','대학생','고등학생','창업교육','해커톤','비즈쿨','학생창업','경진대회','여성창업'], 'ko': '청소년·교육'},
    'policy':     {'kw': ['정부','지원','공모','과기부','중기부','창진원','규제','정책','지자체','공공','유니콘','바우처','R&D'], 'ko': '정책·지원'},
    'esg':        {'kw': ['ESG','탄소중립','친환경','임팩트','소셜벤처','그린','지속가능','기후테크'], 'ko': 'ESG·임팩트'},
    'startup':    {'kw': ['스타트업','창업','유니콘','피봇','글로벌','스케일업'], 'ko': '창업·비즈니스'},
    'health':     {'kw': ['헬스케어','의료','바이오','디지털헬스','건강','제약','메디컬','신약'], 'ko': '헬스케어·바이오'},
    'fintech':    {'kw': ['핀테크','결제','금융','블록체인','암호화폐','뱅크'], 'ko': '핀테크'},
    'climate':    {'kw': ['기후','탄소','친환경','에너지','태양광','수소','배터리','전기차'], 'ko': '기후·에너지'},
}
STOPWORDS = {'이','그','저','것','수','들','및','등','에서','로서','으로','에게','하지만','그러나','또한','그리고','따라서','때문에','위해','통해','있는','없는','되는','하는','있다','없다','된다','한다','이다','있으며','되며','하며','이번','지난','올해','작년','최근','현재','특히','또','더','가장','매우','모두','함께','이미','아직','약','총','기자','특파원','뉴스','보도','발표','밝혔다','말했다','전했다','대한','관련','따른','이달','오늘','어제','지금','전','후','당','각','제','본','해당','설명했다','밝혀졌다','알려졌다','한편'}

def tokenize(text):
    if not text: return []
    tokens = re.findall(r'[가-힣]{2,}|[a-zA-Z]{3,}|[0-9]+', text.lower().replace('[', '').replace(']', ''))
    return [t for t in tokens if t not in STOPWORDS and len(t) >= 2]

def detect_event(title, body=''):
    text = (title + ' ' + (body or '')[:600]).lower()
    priority = ['funding','ipo','acquisition','product','policy','research','person','market']
    scores = {}
    for evt_type in priority:
        score = sum(1 for k in EVENT_TYPES[evt_type]['kw'] if k.lower() in text)
        score += sum(1.5 for k in EVENT_TYPES[evt_type]['kw'] if k.lower() in title.lower())
        scores[evt_type] = score
    best = max(priority, key=lambda t: scores[t])
    return best if scores[best] > 0 else 'general'

def detect_domain(title, body=''):
    text = (title + ' ' + (body or '')[:800]).lower()
    best, best_score = 'startup', 0
    for domain, info in DOMAINS.items():
        score = sum(1 for k in info['kw'] if k.lower() in text)
        if score > best_score:
            best, best_score = domain, score
    return best

def map_category(domain, event_type):
    if event_type == 'policy' or domain in ('youth','policy'): return 'insight'
    if event_type in ('funding','market','ipo'): return 'trend'
    if event_type == 'person': return 'magazine'
    return 'news'

def estimate_read_time(text):
    return max(3, (len(text or '') + 299) // 300)

GEO_LIST = ['서울','부산','대구','인천','광주','대전','울산','세종','수원','성남','고양','용인','천안','충남','충북','경기','강원','전북','전남','경북','경남','제주','아프리카','중동','동남아','유럽','미국','중국','일본','베트남','인도','싱가포르','영국','독일','이스라엘','브라질','프랑스','호주','캐나다','UAE','글로벌','해외','국내','한국']
TECH_LIST = ['AI','인공지능','GPT','LLM','머신러닝','딥러닝','자연어처리','컴퓨터비전','빅데이터','클라우드','SaaS','API','블록체인','핀테크','에듀테크','헬스테크','바이오','반도체','GPU','로봇','드론','자율주행','IoT','AR','VR','그린바이오','건기식']
INV_STAGES = ['시드','Pre-A','시리즈A','시리즈B','시리즈C','시리즈D','프리IPO','IPO']

def parse_title(title):
    ner = {'amounts': [], 'geo': [], 'tech': [], 'dates': [], 'metrics': [], 'stage': None, 'orgs': [], 'action': None}
    ner['amounts'] = re.findall(r'[\d,]+억\s*달러|[\d,]+만\s*달러|[\d,]+조\s*원|[\d,]+억\s*원|[\d,]+만\s*원|\d+억|\d+조|\d[\d,]*\s*달러', title)
    ner['geo'] = [g for g in GEO_LIST if g in title]
    ner['tech'] = [t for t in TECH_LIST if t.lower() in title.lower()]
    ner['dates'] = re.findall(r'\d+월\s*\d+일|\d+월|\d+분기|\d{4}년|상반기|하반기|올해|내년', title)
    ner['metrics'] = re.findall(r'유니콘|데카콘|IPO|상장|[\d]+위|[\d]+%|[\d]+배|[\d,]+만\s*명', title)
    for s in INV_STAGES:
        if s in title:
            ner['stage'] = s
            break
    if re.search(r'투자|펀딩|유치', title): ner['action'] = 'invest'
    elif re.search(r'인수|합병|M&A', title): ner['action'] = 'acquire'
    elif re.search(r'출시|론칭|공개|배포', title): ner['action'] = 'launch'
    elif re.search(r'개최|공모|모집|접수|선발|선정|합류|유니콘|육성|경진대회', title): ner['action'] = 'contest'
    elif re.search(r'분석|영향|전망|예측|조사', title): ner['action'] = 'analysis'
    elif re.search(r'진출|확장|스케일', title): ner['action'] = 'expand'
    else: ner['action'] = 'news'
    org_m = re.match(r'^([^,，·\[\]\s]{2,14}(?:테크|솔루션|랩스?|스튜디오|플랫폼|바이오|AI|Inc|Corp)?)\s*[,，·]', title)
    if org_m and len(org_m.group(1).strip()) >= 2 and org_m.group(1).strip() not in STOPWORDS:
        ner['orgs'] = [org_m.group(1).strip()]
    return ner

TERM_DICT = {
    'IPO':          ('IPO (기업공개)', '처음으로 주식시장에 상장해 일반 투자자에게 주식을 파는 것. 스타트업이 성장해 코스닥·코스피에 입성하는 과정입니다.'),
    'VC':           ('VC (벤처캐피털)', '스타트업 전문 투자회사. 고위험 고수익을 목표로 초기 기업에 집중 투자합니다.'),
    '시리즈A':      ('시리즈A (초기 대규모 투자)', '제품이 시장에서 검증된 후 팀·마케팅 확장을 위한 첫 번째 대규모 투자 단계(보통 수십억~수백억 원).'),
    '시리즈B':      ('시리즈B (성장 투자)', '매출이 증명되고 사업 확장을 위한 투자 단계. 시리즈A 이후 더 큰 규모로 진행됩니다.'),
    '유니콘':       ('유니콘 (기업가치 1조원+)', '기업가치가 1조원 이상인 비상장 스타트업. 국내 토스·야놀자 등이 대표적입니다.'),
    'SaaS':         ('SaaS (구독형 소프트웨어)', '월정액을 내고 인터넷으로 쓰는 소프트웨어 모델. 어도비·슬랙 등이 대표적입니다.'),
    'B2B':          ('B2B (기업간 거래)', '기업이 기업에게 제품·서비스를 파는 비즈니스 모델.'),
    'MVP':          ('MVP (최소 기능 제품)', '핵심 기능만 넣은 첫 번째 버전. 시장 반응을 빠르게 확인하기 위해 만듭니다.'),
    'M&A':          ('M&A (인수·합병)', '한 기업이 다른 기업을 사거나 합치는 것. 스타트업에겐 IPO 외 주요 출구 전략입니다.'),
    'ESG':          ('ESG (환경·사회·지배구조)', '기업이 환경, 사회적 책임, 투명한 지배구조를 얼마나 잘 지키는지 평가하는 기준.'),
    '피봇':         ('피봇 (사업 방향 전환)', '초기 아이디어가 통하지 않을 때 방향을 바꾸는 것. 유튜브·슬랙이 피봇으로 성공한 대표 사례.'),
    '엑셀러레이터': ('엑셀러레이터 (창업 가속화)', '초기 스타트업에 투자·멘토링·네트워크를 제공하는 기관.'),
    'LLM':          ('LLM (대규모 언어 모델)', 'GPT, Gemini 같은 대용량 AI 언어 모델. 텍스트를 읽고 생성하는 핵심 AI 기술입니다.'),
}

def split_sentences(text):
    text = re.sub(r'([.!?])\s+', r'\1\n', text)
    text = re.sub(r'([다요임음])\s+', r'\1\n', text)
    return [s.strip() for s in text.split('\n') if 20 <= len(s.strip()) <= 400]

def is_noise(s):
    return bool(re.search(r'무단\s*(전재|배포|복제)|copyright|all rights reserved|구독|좋아요|댓글|광고|협찬|PR\b', s, re.I))

def cosine_sim(a_set, b_set):
    if not a_set or not b_set: return 0
    inter = len(a_set & b_set)
    denom = (len(a_set) ** 0.5) * (len(b_set) ** 0.5)
    return inter / denom if denom > 0 else 0

def has_number(s):
    return bool(re.search(r'[\d,]+억|[\d,]+조|[\d,]+만\s*원|[\d]+%|[\d]+배|[\d,]+만\s*명|[\d,]+개', s))

def is_causal(s):
    return bool(re.search(r'때문에|이유로|원인은|배경에는|결과로|따라서|이로\s*인해|덕분에|영향으로', s))

def is_goal(s):
    return bool(re.search(r'목표|계획|예정|방침|전략|추진|노력|위해', s))

def is_quote(s):
    return ('"' in s or '\u201c' in s or '\u201d' in s) and bool(re.search(r'밝혔다|말했다|전했다|강조했다|설명했다|덧붙였다|언급했다', s))

def bm25_score(q_toks, d_toks, avg_len, n, df):
    K1, BP = 1.5, 0.75
    tf = {}
    for t in d_toks: tf[t] = tf.get(t, 0) + 1
    score = 0
    for q in q_toks:
        if q not in tf: continue
        idf = (n - df.get(q, 0) + 0.5) / (df.get(q, 0) + 0.5) + 1
        import math
        idf = math.log(idf)
        tfw = (tf[q] * (K1 + 1)) / (tf[q] + K1 * (1 - BP + BP * len(d_toks) / avg_len))
        score += idf * tfw
    return score

def build_context_lines(event_type, domain, ner):
    tech = ner.get('tech', [])
    geo = ner.get('geo', [])
    stage = ner.get('stage')
    dom_ko = DOMAINS.get(domain, {}).get('ko', '창업·비즈니스')
    lines = []
    if event_type == 'funding':
        stage_ctx = {
            '시드':    '시드 투자는 아이디어 검증 단계의 첫 번째 외부 자금입니다. 이 시점에서 투자자들은 팀의 역량과 문제 해결 방향성을 가장 중요하게 봅니다.',
            'Pre-A':   'Pre-A 투자는 초기 제품·서비스를 시장에서 검증하기 직전 단계입니다. MVP(최소 기능 제품)를 고도화하는 데 활용됩니다.',
            '시리즈A': '시리즈A는 제품·시장 적합성(PMF)이 검증된 후 팀·마케팅 확장을 위한 첫 번째 대규모 투자입니다. 보통 수십억~수백억 원 규모로 진행됩니다.',
            '시리즈B': '시리즈B는 검증된 수익 모델을 바탕으로 빠른 성장을 추진하는 단계입니다. 인력 채용·해외 확장·신사업 투자에 활용됩니다.',
            '시리즈C': '시리즈C 이상은 이미 규모 있는 매출을 가진 기업이 IPO 또는 글로벌 확장을 준비하는 단계입니다.',
        }
        if stage and stage in stage_ctx:
            lines.append(stage_ctx[stage])
        if tech:
            lines.append(f'현재 글로벌 VC 시장에서 **{tech[0]}** 분야는 집중 투자 대상 중 하나입니다. 금리 환경과 무관하게 실질 수익 모델이 있는 기업에 자금이 몰리는 추세입니다.')
        else:
            lines.append(f'{dom_ko} 투자 생태계는 선별적 투자 기조 속에서도 실질적인 성과를 낸 기업에게는 여전히 자금 접근 기회가 열려 있습니다.')
    elif event_type == 'acquisition':
        lines.append('M&A는 스타트업에게 IPO와 함께 대표적인 엑싯(Exit) 경로입니다. 대기업이 기술·인재·시장 점유율을 빠르게 확보하기 위한 수단으로 활용합니다.')
        if tech:
            lines.append(f'특히 **{tech[0]}** 분야의 M&A는 기술 역량 내재화를 목적으로 하는 경우가 많아, 인수 이후에도 팀·기술의 독립성이 유지되는 사례가 늘고 있습니다.')
    elif event_type == 'policy':
        lines.append(f'정부 및 공공기관의 {dom_ko} 지원 프로그램은 초기 스타트업에게 자금·네트워크·검증의 기회를 제공합니다. 선발 기준과 지원 혜택을 꼼꼼히 확인하고 적극적으로 활용하는 것이 중요합니다.')
    elif event_type == 'product':
        if tech:
            lines.append(f'**{"·".join(tech[:2])}** 기술을 활용한 신규 서비스 출시는 기존 시장에 새로운 기준을 제시할 수 있습니다. 초기 시장 반응과 사용자 피드백이 이후 방향성을 결정하는 핵심 요소가 됩니다.')
    elif event_type == 'research':
        lines.append(f'{dom_ko} 분야의 연구·분석 결과는 투자자·창업가·정책 입안자 모두에게 중요한 의사결정 근거가 됩니다.')
    elif event_type == 'market':
        tech_str = f'**{tech[0]}**' if tech else dom_ko
        lines.append(f'{tech_str} 시장은 기술 발전과 수요 변화가 맞물려 빠르게 재편되고 있습니다. 성장 곡선의 초기에 진입한 플레이어가 장기적으로 유리한 고지를 선점할 가능성이 높습니다.')
    return lines

def build_opportunity_lines(event_type, domain, ner):
    tech = ner.get('tech', [])
    dom_ko = DOMAINS.get(domain, {}).get('ko', '창업·비즈니스')
    lines = []
    if event_type == 'funding':
        lines.append(f'투자를 받은 기업의 행보를 주목하세요. 어떤 문제를 해결하려는지, 자금을 어떤 우선순위에 쓰는지 관찰하면 {dom_ko} 분야의 핵심 병목이 보입니다.')
    elif event_type == 'acquisition':
        lines.append('인수된 기업이 해결하던 문제 중 아직 미완성인 부분이 있다면, 그것이 새로운 창업 기회가 될 수 있습니다.')
    elif event_type == 'product':
        lines.append('새로운 서비스 출시는 경쟁사 분석의 좋은 기회입니다. 직접 써보고 아직 해결하지 못한 불편함을 찾아보세요.')
    elif event_type == 'policy':
        lines.append('지원 프로그램 신청 기간과 조건을 확인하고, 팀 빌딩·멘토링·네트워크 기회까지 최대한 활용하는 전략을 세우세요.')
    elif event_type == 'research':
        lines.append('연구 결과에서 아직 해결되지 않은 문제를 찾는 연습을 하세요. 데이터가 보여주는 갭(gap)이 바로 창업 기회입니다.')
    elif event_type == 'market':
        tech_str = tech[0] if tech else dom_ko
        lines.append(f'{tech_str} 시장이 성장한다는 것은, 그 시장에서 해결해야 할 문제도 함께 커진다는 뜻입니다.')
    elif event_type == 'person':
        lines.append('성공한 창업가의 스토리에서 패턴을 찾아보세요. 문제를 인식한 시점, 첫 번째 행동, 실패를 극복한 방식에서 나만의 교훈을 추출하세요.')
    else:
        lines.append(f'이 소식이 {dom_ko} 분야에 만드는 변화를 세 가지 관점으로 분석해보세요: ① 기회 ② 위협 ③ 아직 해결 안 된 문제.')
    return lines

def build_dynamic_questions(title, event_type, domain, key_sents, ner):
    questions = []
    amounts = ner.get('amounts', [])
    orgs = ner.get('orgs', [])
    tech = ner.get('tech', [])
    geo = ner.get('geo', [])
    stage = ner.get('stage')
    dom_ko = DOMAINS.get(domain, {}).get('ko', '창업·비즈니스')
    title_kw = [t for t in tokenize(title) if len(t) >= 2][:4]

    if amounts:
        questions.append(f'**{amounts[0]}** 규모는 {dom_ko} 업계 평균과 비교하면 어느 정도이며, 이 자금이 어느 분야에 먼저 쓰일까요?')
    if orgs:
        questions.append(f'**{orgs[0]}**이(가) 이번 소식으로 얻는 가장 큰 이점은 무엇이고, 앞으로 어떤 행보를 보일까요?')
    if event_type == 'funding':
        stage_str = f'{stage} 투자' if stage else '이번 투자'
        questions.append(f'{stage_str}를 받은 후 {orgs[0] if orgs else "이 스타트업"}이(가) 다음 단계로 넘어가려면 무엇을 증명해야 할까요?')
    elif event_type == 'product':
        questions.append('이 서비스가 기존 경쟁 제품 대비 실제로 해결하는 핵심 문제는 무엇이며, 어떤 사용자에게 가장 필요할까요?')
    elif event_type == 'policy':
        questions.append(f'이 정책·지원 프로그램을 가장 효과적으로 활용할 수 있는 스타트업 유형은 무엇일까요?')
    elif event_type == 'market':
        tech_str = tech[0] if tech else dom_ko
        questions.append(f'{tech_str} 시장 변화가 5년 후에도 지속된다면, 지금 어떤 포지션을 선점하는 것이 유리할까요?')
    elif event_type == 'ipo':
        questions.append(f'이번 IPO·상장이 {dom_ko} 생태계 전반에 주는 신호는 무엇이며, 후속 상장 기업에게 어떤 영향을 줄까요?')
    else:
        if len(title_kw) >= 2:
            questions.append(f"'{', '.join(title_kw[:2])}' 관련 소식이 {dom_ko} 분야 창업가에게 주는 기회와 위협은 각각 무엇일까요?")
        else:
            questions.append(f'이 소식이 {dom_ko} 분야 전반에 미치는 영향을 어떻게 평가할 수 있을까요?')
    return questions[:3]

def build_ner_sections(title, event_type, domain, ner):
    amounts = ner.get('amounts', [])
    orgs = ner.get('orgs', [])
    tech = ner.get('tech', [])
    geo = ner.get('geo', [])
    stage = ner.get('stage')
    dates = ner.get('dates', [])
    metrics = ner.get('metrics', [])
    dom_ko = DOMAINS.get(domain, {}).get('ko', '창업·비즈니스')
    evt_info = EVENT_TYPES.get(event_type, {'emoji': '📰', 'label': '주요 소식'})
    sections = []

    core_lines = []
    if event_type == 'funding':
        who = orgs[0] if orgs else title.split(',')[0].strip()[:20]
        stage_str = stage or '투자'
        if amounts:
            core_lines.append(f'**{who}**이(가) **{amounts[0]}** 규모의 {stage_str}를 유치했습니다.')
        else:
            core_lines.append(f'**{who}**이(가) {stage_str}를 성공적으로 유치했습니다.')
        if tech:
            core_lines.append(f'{dom_ko} 분야에서 **{"·".join(tech[:2])}** 기술을 기반으로 성장을 이어가고 있습니다.')
    elif event_type == 'acquisition':
        buyer = orgs[0] if orgs else (title.split(',')[0].strip()[:20] or '인수 기업')
        tech_str = f' **{tech[0]}** 등 핵심 기술 역량 확보를 위해' if tech else ''
        core_lines.append(f'{tech_str} **{buyer}**이(가) 인수·합병을 통해 {dom_ko} 분야 경쟁력을 강화하고 있습니다.')
        if amounts:
            core_lines.append(f'이번 거래 규모는 **{amounts[0]}**으로, {dom_ko} 업계 M&A 중 주목할 만한 사례입니다.')
    elif event_type == 'product':
        who = orgs[0] if orgs else (title.split(',')[0].strip()[:20] or '해당 기업')
        tech_str = f' **{"·".join(tech[:2])}** 기반' if tech else ''
        core_lines.append(f'**{who}**이(가){tech_str} 신규 서비스·제품을 출시하며 {dom_ko} 분야에 새로운 흐름을 만들고 있습니다.')
    elif event_type == 'policy':
        org = orgs[0] if orgs else '지원 기관'
        geo_str = f'{geo[0]} 지역의 ' if geo else ''
        core_lines.append(f'{geo_str}{dom_ko} 분야 스타트업·창업가를 대상으로 **{org}**이(가) 신규 지원 프로그램을 운영합니다.')
        if amounts:
            core_lines.append(f'지원 규모는 **{amounts[0]}** 수준이며, 관련 기업들의 관심이 높습니다.')
        if dates:
            core_lines.append(f'**{dates[0]}** 일정에 맞춰 신청·모집이 진행될 예정입니다.')
    elif event_type == 'research':
        tech_str = f'**{"·".join(tech[:2])}**' if tech else dom_ko
        core_lines.append(f'{tech_str} 분야에 대한 새로운 연구·분석 결과가 발표되며 업계의 이목을 끌고 있습니다.')
    elif event_type == 'person':
        who = orgs[0] if orgs else (title.split(',')[0].strip()[:20] or '창업가')
        core_lines.append(f'**{who}**의 창업 스토리와 {dom_ko} 분야 인사이트가 주목받고 있습니다.')
    elif event_type == 'market':
        tech_str = f'**{tech[0]}**' if tech else dom_ko
        geo_str = f'{geo[0]} 시장을 포함한 ' if geo else ''
        core_lines.append(f'{geo_str}{tech_str} 분야 시장 규모·트렌드 변화가 확인되며 투자자와 창업가 모두의 관심이 집중되고 있습니다.')
    elif event_type == 'ipo':
        who = orgs[0] if orgs else (title.split(',')[0].strip()[:20] or '해당 기업')
        core_lines.append(f'**{who}**이(가) IPO·상장을 추진하며 {dom_ko} 생태계에 새로운 기준점을 제시하고 있습니다.')
    else:
        who = orgs[0] if orgs else (title.split(',')[0].strip()[:20] or '해당 기업')
        tech_str = f' **{tech[0]}** 기반' if tech else ''
        core_lines.append(f'**{who}**이(가){tech_str} {dom_ko} 분야에서 주목할 만한 움직임을 보이고 있습니다.')

    if core_lines:
        sections.append({'title': '## 📌 핵심 내용', 'lines': core_lines, 'style': 'quote'})

    ctx_lines = build_context_lines(event_type, domain, ner)
    if ctx_lines:
        sections.append({'title': '## 🗺️ 배경과 맥락', 'lines': ctx_lines, 'style': 'plain'})

    opp_lines = build_opportunity_lines(event_type, domain, ner)
    if opp_lines:
        sections.append({'title': '## 🚀 창업가 시각으로 읽기', 'lines': opp_lines, 'style': 'plain'})

    return sections

def build_longform(title, body):
    clean_body = clean_text(body or '')
    event_type = detect_event(title, clean_body)
    domain = detect_domain(title, clean_body)
    ner = parse_title(title)
    dom_ko = DOMAINS.get(domain, {}).get('ko', '창업·비즈니스')
    evt_info = EVENT_TYPES.get(event_type, {'emoji': '📰', 'label': '주요 소식'})

    # 문장 분리
    raw_sents = [s for s in split_sentences(clean_body) if not is_noise(s)]
    title_toks = set(tokenize(title))
    sentences = [s for s in raw_sents if cosine_sim(set(tokenize(s)), title_toks) < 0.75]
    has_real_body = len(sentences) >= 3

    lines = []
    used = set()

    # 헤더
    lines.append(f'## {evt_info["emoji"]} {evt_info["label"]} · {dom_ko}')
    lines.append('')
    if ner['amounts']:
        lines.append(f'🔢 **핵심 수치**: {" / ".join(ner["amounts"])}')
        lines.append('')
    if ner['stage']:
        lines.append(f'🏷️ **투자 단계**: {ner["stage"]}')
        lines.append('')
    if ner['tech']:
        lines.append(f'🔧 **기술 키워드**: {" · ".join(ner["tech"][:3])}')
        lines.append('')
    if ner['geo']:
        lines.append(f'📍 **지역**: {" · ".join(ner["geo"][:2])}')
        lines.append('')

    if has_real_body:
        import math
        toks_list = [tokenize(s) for s in sentences]
        n = len(sentences) or 1
        df = {}
        for ts in toks_list:
            for t in set(ts): df[t] = df.get(t, 0) + 1
        avg_len = sum(len(t) for t in toks_list) / n or 1

        scored = []
        for i, (sent, toks) in enumerate(zip(sentences, toks_list)):
            bm = bm25_score(list(title_toks), toks, avg_len, n, df)
            pos = 1.5 if i < 2 else (1.25 if i < 5 else 1.0)
            l = len(sent)
            len_b = 1.3 if 40 <= l <= 180 else (0.7 if l > 250 else 1.0)
            num_b = 1.4 if has_number(sent) else 1.0
            cau_b = 1.25 if is_causal(sent) else 1.0
            scored.append((sent, bm * pos * len_b * num_b * cau_b, i))

        scored_f = [(s, sc, i) for s, sc, i in scored if sc >= 0]
        scored_f.sort(key=lambda x: -x[1])
        top_idx = set(x[2] for x in scored_f[:10])
        key_lines = [s for s, sc, i in sorted([(s, sc, i) for s, sc, i in scored_f if i in top_idx], key=lambda x: x[2])][:6]
        num_lines = [s for s in sentences if has_number(s) and s not in key_lines][:5]
        cau_lines = [s for s in sentences if is_causal(s) and s not in key_lines and s not in num_lines][:3]
        goal_lines = [s for s in sentences if is_goal(s) and s not in key_lines and s not in num_lines and s not in cau_lines][:3]
        quote_lines = [s for s in sentences if is_quote(s) and s not in key_lines][:3]

        # §1 도입
        if key_lines and len(key_lines[0]) >= 25:
            used.add(key_lines[0])
            lines.append(key_lines[0])
            lines.append('')
        # §2 핵심 내용
        main_sents = [s for s in key_lines if s not in used][:5]
        if main_sents:
            lines += ['---', '', '## 📌 핵심 내용', '']
            for s in main_sents:
                if s not in used: used.add(s); lines += [f'> {s}', '']
        # §3 주요 수치
        if num_lines:
            lines += ['---', '', '## 📊 주요 수치 & 데이터', '']
            for s in num_lines:
                if s not in used: used.add(s); lines.append(f'→ {s}')
            lines.append('')
        # §4 현장의 목소리
        if quote_lines:
            lines += ['---', '', '## 💬 현장의 목소리', '']
            for s in quote_lines:
                if s not in used: used.add(s); lines += [f'> {s}', '']
        # §5 배경과 맥락
        if cau_lines:
            lines += ['---', '', '## 🗺️ 배경과 맥락', '']
            for s in cau_lines:
                if s not in used: used.add(s); lines += [s, '']
        # §6 향후 방향
        if goal_lines:
            lines += ['---', '', '## 🎯 향후 방향', '']
            for s in goal_lines:
                if s not in used: used.add(s); lines += [f'• {s}', '']
        # 동적 질문
        questions = build_dynamic_questions(title, event_type, domain, key_lines, ner)
        if questions:
            lines += ['---', '', '## 💭 생각해볼 질문', '']
            for q in questions: lines += [f'• **Q.** {q}', '']
    else:
        ner_sections = build_ner_sections(title, event_type, domain, ner)
        for sec in ner_sections:
            lines += ['---', '', sec['title'], '']
            if sec['style'] == 'quote':
                for l in sec['lines']: lines += [f'> {l}', '']
            else:
                for l in sec['lines']: lines += [l, '']
        questions = build_dynamic_questions(title, event_type, domain, [], ner)
        if questions:
            lines += ['---', '', '## 💭 생각해볼 질문', '']
            for q in questions: lines += [f'• **Q.** {q}', '']

    # 용어 해설
    full_text = title + ' ' + clean_body
    used_terms = []
    for term, (short, explain) in TERM_DICT.items():
        if term in full_text and len(used_terms) < 3:
            used_terms.append((short, explain))
    if used_terms:
        lines += ['---', '', '## 📚 핵심 용어 정리', '']
        for short, explain in used_terms:
            lines += [f'**{short}**', '', explain, '']

    # 푸터
    lines += ['---', '', f'*Insightship · {dom_ko} · {evt_info["emoji"]} {evt_info["label"]} · insightship-longform-v16*']
    return '\n'.join(lines)

def sb_request(url, method='GET', data=None):
    headers = {**H}
    if method in ('PATCH', 'POST'):
        headers['Prefer'] = 'return=minimal'
    body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return 0, str(e).encode()

def fetch_batch(offset, limit=100):
    url = (f'{SB_URL}/rest/v1/articles'
           f'?select=id,title,body,excerpt,ai_summary'
           f'&ai_summary=not.is.null'
           f'&ai_summary=not.like.*insightship-longform-v16*'
           f'&order=published_at.desc'
           f'&limit={limit}&offset={offset}')
    status, body = sb_request(url)
    if status != 200:
        return []
    return json.loads(body) or []

def patch_article(article_id, summary, category, dom):
    url = f'{SB_URL}/rest/v1/articles?id=eq.{article_id}'
    data = {
        'ai_summary': summary,
        'category': category,
        'ai_processed_at': datetime.utcnow().isoformat() + 'Z',
        'read_time': estimate_read_time(summary),
        'ai_category': dom,
    }
    status, body = sb_request(url, method='PATCH', data=data)
    return status in (200, 204)

# ── 메인 실행 ─────────────────────────────────────────────────────────
if __name__ == '__main__':
    BATCH = 100
    MAX_BATCHES = int(sys.argv[1]) if len(sys.argv) > 1 else 5  # 기본 5배치(500개)
    offset = int(sys.argv[2]) if len(sys.argv) > 2 else 0

    total_processed = 0
    total_skipped = 0
    total_errors = 0

    for batch_num in range(MAX_BATCHES):
        current_offset = offset + batch_num * BATCH
        articles = fetch_batch(current_offset, BATCH)
        if not articles:
            print(f"[배치 {batch_num+1}] 더 이상 처리할 기사 없음. 종료.")
            break

        # legacy 패턴이거나 v16 없는 기사만
        to_process = [a for a in articles if is_legacy(a.get('ai_summary',''))]
        print(f"[배치 {batch_num+1}] offset={current_offset}, 가져옴={len(articles)}, 재처리대상={len(to_process)}")

        ok = 0
        fail = 0
        for a in to_process:
            title = a.get('title','')
            if not title:
                total_skipped += 1
                continue
            body = a.get('body','') or a.get('excerpt','') or ''
            summary = build_longform(title, body)
            event_type = detect_event(title, clean_text(body))
            domain = detect_domain(title, clean_text(body))
            category = map_category(domain, event_type)
            if patch_article(a['id'], summary, category, domain):
                ok += 1
            else:
                fail += 1
            time.sleep(0.05)  # rate limit 방지

        total_processed += ok
        total_errors += fail
        print(f"  → 성공 {ok}개, 실패 {fail}개 (누적: {total_processed}개 처리)")

    print(f"\n=== 완료 ===")
    print(f"총 처리: {total_processed}개, 스킵: {total_skipped}개, 오류: {total_errors}개")
