"""
Insightship 뉴스 본문 스크래퍼 v1.0
원문 URL에서 전체 본문을 추출하여 articles.body에 업데이트
외부 라이브러리: 없음 (stdlib only)
"""
import urllib.request, urllib.parse, json, re, os, time, ssl

SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SERVICE_KEY  = os.environ.get('SUPABASE_SERVICE_KEY', '')

HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
}

# SSL 무시 컨텍스트 (일부 뉴스 사이트 인증서 문제 대비)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
]

def fetch_page(url: str, timeout: int = 12) -> str:
    """URL에서 HTML 가져오기"""
    import random
    ua = random.choice(USER_AGENTS)
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,*/*',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Accept-Encoding': 'identity',
        })
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
            raw = resp.read()
            # 인코딩 감지
            ct = resp.headers.get('Content-Type', '')
            enc = 'utf-8'
            if 'charset=' in ct:
                enc = ct.split('charset=')[-1].split(';')[0].strip()
            try:
                return raw.decode(enc, errors='replace')
            except Exception:
                return raw.decode('utf-8', errors='replace')
    except Exception as e:
        return ''

def extract_body(html: str, url: str = '') -> str:
    """HTML에서 본문 텍스트 추출 - 순수 regex 기반"""
    if not html:
        return ''

    # 스크립트/스타일/네비/헤더/푸터 제거
    for tag in ['script', 'style', 'nav', 'header', 'footer', 'aside',
                'figure', 'figcaption', 'iframe', 'noscript', 'form']:
        html = re.sub(rf'<{tag}[^>]*>[\s\S]*?</{tag}>', ' ', html, flags=re.I)

    # 뉴스 본문 컨테이너 후보 찾기
    # 한국 주요 뉴스 사이트별 본문 selector 패턴
    candidates = []

    # 1. article 태그 (표준 HTML5)
    art_m = re.search(r'<article[^>]*>([\s\S]+?)</article>', html, re.I)
    if art_m:
        candidates.append(art_m.group(1))

    # 2. 한국 뉴스 사이트 공통 클래스
    for cls in ['article-body', 'article_body', 'articleBody', 'news-content',
                'news_content', 'content-article', 'cont_news', 'article-view-content',
                'article_view', 'view_con', 'article_txt', 'entry-content',
                'post-content', 'story-content', 'news_txt']:
        m = re.search(rf'class="[^"]*{cls}[^"]*"[^>]*>([\s\S]{{50,6000}}?)</(?:div|section|article)',
                      html, re.I)
        if m:
            candidates.append(m.group(1))

    # 3. itemprop=articleBody
    m = re.search(r'itemprop="articleBody"[^>]*>([\s\S]+?)</(?:div|article|section)', html, re.I)
    if m:
        candidates.append(m.group(1))

    # 가장 긴 후보 선택
    if candidates:
        best = max(candidates, key=lambda x: len(re.sub(r'<[^>]+>', '', x)))
    else:
        # fallback: p 태그들 모아서
        p_texts = re.findall(r'<p[^>]*>([\s\S]{20,500}?)</p>', html, re.I)
        best = ' '.join(p_texts[:30])

    # HTML 태그 제거
    text = re.sub(r'<[^>]+>', ' ', best)

    # HTML 엔티티 디코딩
    entities = [
        ('&nbsp;', ' '), ('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'),
        ('&quot;', '"'), ('&#39;', "'"), ('&apos;', "'"), ('\xa0', ' '),
        ('&ldquo;', '"'), ('&rdquo;', '"'), ('&lsquo;', "'"), ('&rsquo;', "'"),
        ('&middot;', '·'), ('&bull;', '•'), ('&hellip;', '...'), ('&mdash;', '—'),
        ('&ensp;', ' '), ('&emsp;', ' '), ('&thinsp;', ' '),
    ]
    for e, r in entities:
        text = text.replace(e, r)
    text = re.sub(r'&#x?[0-9a-fA-F]+;', '', text)

    # 광고/노이즈 라인 제거
    noise_patterns = [
        r'무단\s*전재.*금지', r'저작권.*보호', r'구독.*신청', r'기자.*메일',
        r'제보.*하기', r'관련\s*기사', r'많이\s*본\s*기사', r'다음\s*기사',
        r'©.*All\s*Rights', r'광고.*문의', r'출처\s*:', r'사진\s*=',
        r'^\s*더보기\s*$', r'^\s*댓글\s*$', r'^\s*공유하기\s*$',
    ]
    lines = text.split('\n')
    clean_lines = []
    for line in lines:
        line = line.strip()
        if len(line) < 5:
            continue
        if any(re.search(p, line) for p in noise_patterns):
            continue
        clean_lines.append(line)

    # 연속 공백 정리
    result = re.sub(r'\s{3,}', '  ', ' '.join(clean_lines)).strip()

    # 최소 길이 체크
    if len(result) < 100:
        return ''

    return result[:8000]  # 최대 8000자


def supa_request(method: str, path: str, body=None):
    url = f"{SUPABASE_URL}/rest/v1{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            content = r.read()
            return json.loads(content) if content else None
    except Exception as e:
        print(f"  Supabase {method} 오류: {e}")
        return None


def update_body(article_id: int, body_text: str):
    path = f"/articles?id=eq.{article_id}"
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1{path}",
        data=json.dumps({'body': body_text}).encode(),
        headers={**HEADERS, 'Prefer': 'return=minimal'},
        method='PATCH'
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except Exception as e:
        print(f"  PATCH 오류: {e}")
        return 0


def main():
    if not SUPABASE_URL or not SERVICE_KEY:
        print("⚠️  Supabase 환경변수 없음")
        return

    # body가 짧거나 없는 최근 기사 가져오기 (최대 60개씩)
    cutoff = time.strftime('%Y-%m-%dT00:00:00Z', time.gmtime(time.time() - 7 * 86400))
    path = (f"/articles?select=id,title,source_url,body"
            f"&status=eq.published"
            f"&source_url=not.is.null"
            f"&published_at=gte.{cutoff}"
            f"&order=published_at.desc"
            f"&limit=60")

    articles = supa_request('GET', path) or []
    # body가 짧은 것만 처리
    targets = [a for a in articles if len(a.get('body') or '') < 200]
    print(f"본문 스크래핑 대상: {len(targets)}개 / 전체 {len(articles)}개")

    ok = fail = skip = 0
    for a in targets:
        aid = a['id']
        url = a.get('source_url', '')
        title = a.get('title', '')[:50]

        if not url or 'google.com/url' in url:
            # Google 뉴스 리다이렉트 URL 처리
            m = re.search(r'url=([^&]+)', url)
            if m:
                url = urllib.parse.unquote(m.group(1))
            else:
                skip += 1
                continue

        print(f"  [{ok+fail+1}/{len(targets)}] {title[:40]}...")
        html = fetch_page(url)
        if not html:
            print(f"    ✗ 페이지 가져오기 실패")
            fail += 1
            time.sleep(0.5)
            continue

        body = extract_body(html, url)
        if not body:
            print(f"    ✗ 본문 추출 실패 (HTML: {len(html)}자)")
            fail += 1
            time.sleep(0.5)
            continue

        status = update_body(aid, body)
        if status in (200, 204):
            print(f"    ✓ {len(body)}자 저장")
            ok += 1
        else:
            print(f"    ✗ 저장 실패 (status={status})")
            fail += 1

        time.sleep(0.8)  # 서버 부하 방지

    print(f"\n본문 스크래핑 완료: 성공={ok} / 실패={fail} / 스킵={skip}")


if __name__ == '__main__':
    main()
