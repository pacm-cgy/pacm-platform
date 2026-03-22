"""
뉴스 자동 수집 - Google News RSS (30개 피드, 스마트 중복 제거)
매시간 실행 (GitHub Actions)
"""
import urllib.request, urllib.parse, json, re, time, random, string, os
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY  = os.environ['SUPABASE_SERVICE_KEY']
AUTHOR_ID    = os.environ['ADMIN_PROFILE_ID']

# ── 30개 피드 (청소년창업/투자/AI/에듀/핀테크/헬스/기후/글로벌/B2B/SaaS)
FEEDS = [
    # 청소년/청년 창업
    ('https://news.google.com/rss/search?q=%EC%B2%AD%EC%86%8C%EB%85%84+%EC%B0%BD%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '청소년창업', 'youth'),
    ('https://news.google.com/rss/search?q=%EC%B2%AD%EB%85%84+%EC%B0%BD%EC%97%85%EA%B0%80&hl=ko&gl=KR&ceid=KR:ko', '청년창업', 'youth'),
    # 투자/펀딩
    ('https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%ED%88%AC%EC%9E%90&hl=ko&gl=KR&ceid=KR:ko', '스타트업투자', 'funding'),
    ('https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%ED%8E%80%EB%94%A9&hl=ko&gl=KR&ceid=KR:ko', '펀딩', 'funding'),
    ('https://news.google.com/rss/search?q=%EB%B2%A4%EC%B2%98%EC%BA%90%ED%94%BC%ED%83%88+%ED%88%AC%EC%9E%90&hl=ko&gl=KR&ceid=KR:ko', 'VC투자', 'funding'),
    ('https://news.google.com/rss/search?q=%EC%8B%9C%EB%A6%AC%EC%A6%88+%ED%88%AC%EC%9E%90+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '시리즈투자', 'funding'),
    ('https://news.google.com/rss/search?q=%EC%95%A1%EC%85%80%EB%9F%AC%EB%A0%88%EC%9D%B4%ED%84%B0+%EB%8D%B0%EB%AA%A8%EB%8D%B0%EC%9D%B4&hl=ko&gl=KR&ceid=KR:ko', '액셀러레이터', 'funding'),
    ('https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+M%26A+%EC%9D%B8%EC%88%98&hl=ko&gl=KR&ceid=KR:ko', 'M&A', 'funding'),
    # AI/기술
    ('https://news.google.com/rss/search?q=AI+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%ED%95%9C%EA%B5%AD&hl=ko&gl=KR&ceid=KR:ko', 'AI스타트업', 'ai_startup'),
    ('https://news.google.com/rss/search?q=%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5+%EC%B0%BD%EC%97%85+%EC%84%9C%EB%B9%84%EC%8A%A4&hl=ko&gl=KR&ceid=KR:ko', 'AI창업서비스', 'ai_startup'),
    ('https://news.google.com/rss/search?q=%EB%94%A5%ED%85%8C%ED%81%AC+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '딥테크', 'ai_startup'),
    ('https://news.google.com/rss/search?q=SaaS+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', 'SaaS', 'ai_startup'),
    # 창업 인사이트/성공사례
    ('https://news.google.com/rss/search?q=%EC%B0%BD%EC%97%85+%EC%9D%B8%EC%82%AC%EC%9D%B4%ED%8A%B8+%EC%84%B1%EA%B3%B5&hl=ko&gl=KR&ceid=KR:ko', '창업인사이트', 'entrepreneurship'),
    ('https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%EC%B0%BD%EC%97%85%EC%9E%90+%EC%9D%B8%ED%84%B0%EB%B7%B0&hl=ko&gl=KR&ceid=KR:ko', '창업자인터뷰', 'entrepreneurship'),
    ('https://news.google.com/rss/search?q=%EC%B0%BD%EC%97%85+%EC%A7%80%EC%9B%90+%EC%A0%95%EB%B6%80+%EC%A0%95%EC%B1%85&hl=ko&gl=KR&ceid=KR:ko', '창업지원정책', 'entrepreneurship'),
    ('https://news.google.com/rss/search?q=%ED%98%81%EC%8B%A0+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%EB%B9%84%EC%A6%88%EB%8B%88%EC%8A%A4&hl=ko&gl=KR&ceid=KR:ko', '혁신비즈니스', 'entrepreneurship'),
    # 섹터별
    ('https://news.google.com/rss/search?q=%EC%97%90%EB%93%80%ED%85%8C%ED%81%AC+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '에듀테크', 'edutech'),
    ('https://news.google.com/rss/search?q=%ED%95%80%ED%85%8C%ED%81%AC+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '핀테크', 'fintech'),
    ('https://news.google.com/rss/search?q=%ED%97%AC%EC%8A%A4%EC%BC%80%EC%96%B4+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '헬스케어', 'health'),
    ('https://news.google.com/rss/search?q=%EA%B8%B0%ED%9B%84%ED%85%8C%ED%81%AC+%ED%81%B4%EB%A6%B0%ED%85%8C%ED%81%AC&hl=ko&gl=KR&ceid=KR:ko', '기후테크', 'climate'),
    ('https://news.google.com/rss/search?q=%EC%BB%A4%EB%A8%B8%EC%8A%A4+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '커머스', 'general'),
    ('https://news.google.com/rss/search?q=%EB%AA%A8%EB%B9%8C%EB%A6%AC%ED%8B%B0+%EC%9E%90%EC%9C%A8%EC%A3%BC%ED%96%89+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '모빌리티', 'general'),
    # 유니콘/IPO
    ('https://news.google.com/rss/search?q=%EC%9C%A0%EB%8B%88%EC%BD%98+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '유니콘', 'unicorn'),
    ('https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+IPO+%EC%83%81%EC%9E%A5&hl=ko&gl=KR&ceid=KR:ko', 'IPO상장', 'unicorn'),
    # 글로벌
    ('https://news.google.com/rss/search?q=%EA%B8%80%EB%A1%9C%EB%B2%8C+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%ED%8A%B8%EB%A0%8C%EB%93%9C&hl=ko&gl=KR&ceid=KR:ko', '글로벌트렌드', 'entrepreneurship'),
    ('https://news.google.com/rss/search?q=%EC%8B%A4%EB%A6%AC%EC%BD%98%EB%B0%B8%EB%A6%AC+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '실리콘밸리', 'entrepreneurship'),
    # B2B
    ('https://news.google.com/rss/search?q=B2B+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%EC%86%94%EB%A3%A8%EC%85%98&hl=ko&gl=KR&ceid=KR:ko', 'B2B', 'entrepreneurship'),
    # 경제/트렌드
    ('https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%EA%B2%BD%EC%A0%9C+%ED%8A%B8%EB%A0%8C%EB%93%9C&hl=ko&gl=KR&ceid=KR:ko', '창업경제', 'entrepreneurship'),
    ('https://news.google.com/rss/search?q=%EC%97%94%EC%A0%A4%ED%88%AC%EC%9E%90+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '엔젤투자', 'funding'),
    ('https://news.google.com/rss/search?q=%EC%A0%95%EB%B6%80+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%EC%A7%80%EC%9B%90+%EC%82%AC%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '정부지원사업', 'entrepreneurship'),
]

# 무관 키워드 필터 (스포츠/연예/코인/부동산 등 창업과 무관한 내용)
IRRELEVANT = [
    '야구','축구','골프','테니스','배구','농구','올림픽','월드컵','수영','육상',
    '씨름','유도','태권도','사격','펜싱','스케이팅','배드민턴','탁구',
    '아이돌','배우','드라마','영화관','음악방송','앨범','팬미팅','콘서트',
    '비트코인','암호화폐','코인','이더리움','NFT','가상화폐','채굴',
    '로또','카지노','도박','경마','경륜',
    '아파트분양','청약','재개발','재건축','아파트값','부동산투자','갭투자',
    '주식급등','코스닥급등','코스피급락','종목추천',
]

def strip_html(s):
    """HTML 태그와 엔티티를 완전히 제거"""
    if not s: return ''
    # 스크립트/스타일 블록 통째로 제거
    s = re.sub(r'<(script|style)[^>]*>[\s\S]*?</(script|style)>', ' ', s, flags=re.I)
    # HTML 태그 제거
    s = re.sub(r'<[^>]+>', ' ', s)
    # HTML 엔티티 디코딩
    entities = [('&nbsp;',' '),('&amp;','&'),('&lt;','<'),('&gt;','>'),
                ('&quot;','"'),('&#39;',"'"),('&apos;',"'"),('\xa0',' '),
                ('&ldquo;','"'),('&rdquo;','"'),('&lsquo;',"'"),('&rsquo;',"'"),
                ('&middot;','·'),('&bull;','•'),('&hellip;','...'),('&mdash;','—')]
    for e, r in entities:
        s = s.replace(e, r)
    # 숫자 엔티티 제거
    s = re.sub(r'&#x?[0-9a-fA-F]+;', '', s)
    # 연속 공백 정리
    return re.sub(r'\s+', ' ', s).strip()

def parse_google_desc(raw):
    """Google News RSS description에서 출처와 텍스트 추출 - HTML 완전 제거"""
    if not raw: return '', None
    # 1) 출처: <font color="#6f6f6f"> 또는 마지막 <a> 텍스트
    src_m = re.search(r'<font[^>]*color=["']?#6f6f6f["']?[^>]*>([\s\S]+?)</font>', raw, re.I)
    source = strip_html(src_m.group(1)) if src_m else None
    # 2) 본문: <a> 태그 안 텍스트 우선, 없으면 전체에서 HTML 제거
    a_m = re.search(r'<a[^>]+>([\s\S]+?)</a>', raw)
    text = strip_html(a_m.group(1)) if a_m else strip_html(raw)
    # 3) strip_html 후에도 남아있는 HTML 잔재 제거 (이중 안전장치)
    text = re.sub(r'<[^>]*>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    # 4) URL 제거 (http:// 또는 https:// 포함된 문자열)
    text = re.sub(r'https?://\S+', '', text).strip()
    # 5) 의미없는 짧은 텍스트 제거
    if len(text) < 5: text = ''
    return text[:400], source

def make_slug():
    r = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"news-{int(time.time()*1000)}-{r}"

def supa_get(path):
    url = f"{SUPABASE_URL}/rest/v1{path}"
    req = urllib.request.Request(url, headers={'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}'})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())

def supa_post(path, body):
    url = f"{SUPABASE_URL}/rest/v1{path}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={
        'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json', 'Prefer': 'return=minimal'
    }, method='POST')
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status, r.read().decode()

# 중복 확인 (URL + 7일 이내 유사 제목)
_url_cache = set()
_title_cache = set()

def load_recent_cache():
    """최근 7일 URL/제목 캐시 로드"""
    try:
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime('%Y-%m-%d')
        data = supa_get(f'/articles?status=eq.published&category=eq.news&published_at=gte.{week_ago}&select=source_url,title&limit=2000')
        for a in (data or []):
            if a.get('source_url'):
                _url_cache.add(a['source_url'])
            if a.get('title'):
                # 제목 핵심어만 추출 (앞 20자)
                _title_cache.add(a['title'][:20])
    except Exception as e:
        print(f"캐시 로드 오류: {e}")

def is_duplicate(link, title):
    if link in _url_cache:
        return True
    if title[:20] in _title_cache:
        return True
    return False

# 캐시 로드
print("최근 뉴스 캐시 로드 중...")
load_recent_cache()
print(f"  URL캐시: {len(_url_cache)}개, 제목캐시: {len(_title_cache)}개")

inserted = skipped_irrelevant = skipped_dup = errors = 0

for feed_url, tag, ai_cat in FEEDS:
    try:
        req = urllib.request.Request(feed_url, headers={'User-Agent': 'InsightshipBot/2.0'})
        with urllib.request.urlopen(req, timeout=15) as r:
            xml = r.read().decode('utf-8', errors='replace')
    except Exception as e:
        print(f"  RSS 오류 [{tag}]: {e}")
        continue

    for item_m in re.finditer(r'<item>([\s\S]*?)</item>', xml):
        block = item_m.group(1)

        def get_tag(t):
            m = re.search(rf'<{t}[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))</{t}>', block)
            return (m.group(1) or m.group(2) or '').strip() if m else ''

        raw_title = get_tag('title')
        link = get_tag('link') or get_tag('guid')
        if not raw_title or not link:
            continue

        # 구글 뉴스 출처 제거 (예: "~ - 한국경제")
        clean_title = re.sub(r'\s*-\s*[^-]+$', '', raw_title).strip()[:200]

        # 무관 키워드 필터
        if any(kw in clean_title for kw in IRRELEVANT):
            skipped_irrelevant += 1
            continue

        # 중복 확인
        if is_duplicate(link, clean_title):
            skipped_dup += 1
            continue

        raw_desc = get_tag('description')
        excerpt_text, desc_source = parse_google_desc(raw_desc) if raw_desc else ('', None)
        src_m = re.search(r'<source[^>]*url="[^"]*"[^>]*>([\s\S]*?)</source>', block)
        source_name = (strip_html(src_m.group(1)) if src_m else None) or desc_source or '뉴스'
        excerpt = (excerpt_text if excerpt_text and excerpt_text != clean_title else clean_title)[:400]

        pub_date = get_tag('pubDate')
        try:
            parsed_dt = parsedate_to_datetime(pub_date)
            now_utc = datetime.now(timezone.utc)
            # 연도가 현재와 1년 이상 차이나면 현재 연도로 교정
            # (RSS에서 연도 없이 "Mon, 05 Mar" 형태이거나 오래된 날짜인 경우)
            if abs(parsed_dt.year - now_utc.year) >= 1:
                corrected = parsed_dt.replace(year=now_utc.year)
                # 교정된 날짜가 미래면 작년으로
                if corrected > now_utc + timedelta(days=1):
                    corrected = corrected.replace(year=now_utc.year - 1)
                pub_iso = corrected.isoformat()
            else:
                pub_iso = parsed_dt.isoformat()
        except:
            pub_iso = datetime.now(timezone.utc).isoformat()

        article = {
            'title': clean_title, 'slug': make_slug(),
            'excerpt': excerpt, 'body': excerpt,
            'category': 'news', 'status': 'published',
            'author_id': AUTHOR_ID, 'read_time': 2,
            'source_name': source_name, 'source_url': link,
            'published_at': pub_iso, 'tags': ['뉴스', tag],
            'featured': False, 'is_duplicate': False,
            'ai_category': ai_cat,
        }
        try:
            status, _ = supa_post('/articles', article)
            if status == 201:
                inserted += 1
                _url_cache.add(link)
                _title_cache.add(clean_title[:20])
        except Exception as e:
            errors += 1

print(f"수집완료: inserted={inserted}, skipped_dup={skipped_dup}, skipped_irrelevant={skipped_irrelevant}, errors={errors}")
