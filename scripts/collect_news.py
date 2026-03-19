import urllib.request, urllib.parse, json, re, time, random, string, os
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY  = os.environ['SUPABASE_SERVICE_KEY']
AUTHOR_ID    = os.environ['ADMIN_PROFILE_ID']

FEEDS = [
    ('https://news.google.com/rss/search?q=%EC%B2%AD%EC%86%8C%EB%85%84+%EC%B0%BD%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '청소년창업', 'youth'),
    ('https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%ED%88%AC%EC%9E%90&hl=ko&gl=KR&ceid=KR:ko', '스타트업투자', 'funding'),
    ('https://news.google.com/rss/search?q=%EC%B0%BD%EC%97%85+%EC%9D%B8%EC%82%AC%EC%9D%B4%ED%8A%B8&hl=ko&gl=KR&ceid=KR:ko', '창업인사이트', 'entrepreneurship'),
    ('https://news.google.com/rss/search?q=AI+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', 'AI스타트업', 'ai_startup'),
    ('https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%ED%8E%80%EB%94%A9&hl=ko&gl=KR&ceid=KR:ko', '펀딩', 'funding'),
    ('https://news.google.com/rss/search?q=%EC%97%90%EB%93%80%ED%85%8C%ED%81%AC&hl=ko&gl=KR&ceid=KR:ko', '에듀테크', 'edutech'),
    ('https://news.google.com/rss/search?q=%ED%95%80%ED%85%8C%ED%81%AC+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '핀테크', 'fintech'),
    ('https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+%EC%84%B1%EA%B3%B5+%EC%82%AC%EB%A1%80&hl=ko&gl=KR&ceid=KR:ko', '성공사례', 'entrepreneurship'),
    ('https://news.google.com/rss/search?q=%EC%B0%BD%EC%97%85+%EC%A7%80%EC%9B%90+%EC%A0%95%EC%B1%85&hl=ko&gl=KR&ceid=KR:ko', '창업지원', 'entrepreneurship'),
    ('https://news.google.com/rss/search?q=%ED%97%AC%EC%8A%A4%EC%BC%80%EC%96%B4+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '헬스케어', 'health'),
    ('https://news.google.com/rss/search?q=%EA%B8%B0%ED%9B%84%ED%85%8C%ED%81%AC&hl=ko&gl=KR&ceid=KR:ko', '기후테크', 'climate'),
    ('https://news.google.com/rss/search?q=%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85+IPO&hl=ko&gl=KR&ceid=KR:ko', '유니콘', 'unicorn'),
    ('https://news.google.com/rss/search?q=%EB%B2%A4%EC%B2%98%EC%BA%90%ED%94%BC%ED%83%88+%ED%88%AC%EC%9E%90&hl=ko&gl=KR&ceid=KR:ko', 'VC투자', 'funding'),
    ('https://news.google.com/rss/search?q=%EC%95%A0%EA%B7%B8%ED%85%8C%ED%81%AC&hl=ko&gl=KR&ceid=KR:ko', '애그테크', 'climate'),
    ('https://news.google.com/rss/search?q=%EB%94%A5%ED%85%8C%ED%81%AC+%EC%8A%A4%ED%83%80%ED%8A%B8%EC%97%85&hl=ko&gl=KR&ceid=KR:ko', '딥테크', 'ai_startup'),
]

IRRELEVANT = [
    '야구','축구','골프','테니스','배구','농구','올림픽','월드컵','수영','육상',
    '아이돌','배우','드라마','영화관','음악방송','앨범','팬미팅','콘서트',
    '비트코인','암호화폐','코인','이더리움','NFT',
    '로또','카지노','도박',
    '펜싱','씨름','유도','태권도','사격','스케이팅',
    '분양','청약','재개발','재건축','아파트값',
]

def strip_html(s):
    if not s: return ''
    s = re.sub(r'<[^>]+>', ' ', s)
    for e, r in [('&nbsp;',' '),('&amp;','&'),('&lt;','<'),('&gt;','>'),('&quot;','"'),('&#39;',"'"),('\xa0',' ')]:
        s = s.replace(e, r)
    s = re.sub(r'&#[0-9]+;', '', s)
    return re.sub(r'\s+', ' ', s).strip()

def parse_google_desc(raw):
    src_m = re.search(r'<font[^>]*color="#6f6f6f"[^>]*>([\s\S]+?)</font>', raw, re.I)
    source = strip_html(src_m.group(1)) if src_m else None
    a_m = re.search(r'<a[^>]+>([\s\S]+?)</a>', raw)
    text = strip_html(a_m.group(1)) if a_m else strip_html(raw)
    return text[:400], source

def make_slug():
    r = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"news-{int(time.time()*1000)}-{r}"

def supa_get(path):
    url = f"{SUPABASE_URL}/rest/v1{path}"
    req = urllib.request.Request(url, headers={
        'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}'
    })
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

def article_exists(link, title):
    try:
        d = supa_get(f'/articles?source_url=eq.{urllib.parse.quote(link, safe="")}&select=id&limit=1')
        if d: return True
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime('%Y-%m-%d')
        d2 = supa_get(f'/articles?title=eq.{urllib.parse.quote(title, safe="")}&published_at=gte.{week_ago}&select=id&limit=1')
        return bool(d2)
    except:
        return False

inserted = skipped = errors = 0

for feed_url, tag, ai_cat in FEEDS:
    try:
        req = urllib.request.Request(feed_url, headers={'User-Agent': 'InsightshipBot/1.0'})
        with urllib.request.urlopen(req, timeout=15) as r:
            xml = r.read().decode('utf-8', errors='replace')
    except Exception as e:
        print(f"RSS 오류 {tag}: {e}")
        continue

    for item_m in re.finditer(r'<item>([\s\S]*?)</item>', xml):
        block = item_m.group(1)

        def get_tag(t, b=None):
            b = b or block
            m = re.search(rf'<{t}[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))</{t}>', b)
            return (m.group(1) or m.group(2) or '').strip() if m else ''

        raw_title = get_tag('title')
        link = get_tag('link') or get_tag('guid')
        if not raw_title or not link:
            continue

        clean_title = re.sub(r' - [^-]+$', '', raw_title).strip()[:200]

        if any(kw in clean_title for kw in IRRELEVANT):
            skipped += 1
            continue

        raw_desc = get_tag('description')
        excerpt_text, desc_source = parse_google_desc(raw_desc) if raw_desc else ('', None)
        src_m = re.search(r'<source[^>]*url="[^"]*"[^>]*>([\s\S]*?)</source>', block)
        source_name = (strip_html(src_m.group(1)) if src_m else None) or desc_source or '뉴스'
        excerpt = (excerpt_text if (excerpt_text and excerpt_text != clean_title) else clean_title)[:400]

        if article_exists(link, clean_title):
            skipped += 1
            continue

        pub_date = get_tag('pubDate')
        try:
            pub_iso = parsedate_to_datetime(pub_date).isoformat()
        except:
            pub_iso = datetime.now(timezone.utc).isoformat()

        article = {
            'title': clean_title,
            'slug': make_slug(),
            'excerpt': excerpt,
            'body': excerpt,
            'category': 'news',
            'status': 'published',
            'author_id': AUTHOR_ID,
            'read_time': 2,
            'source_name': source_name,
            'source_url': link,
            'published_at': pub_iso,
            'tags': ['뉴스', tag],
            'featured': False,
            'is_duplicate': False,
            'ai_category': ai_cat,
        }
        try:
            status, resp = supa_post('/articles', article)
            if status == 201:
                inserted += 1
            else:
                errors += 1
                print(f"오류({status}): {resp[:80]}")
        except Exception as e:
            errors += 1
            print(f"예외: {e}")

print(f"완료: inserted={inserted}, skipped={skipped}, errors={errors}")
