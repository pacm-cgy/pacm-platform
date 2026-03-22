"""
뉴스 excerpt/body/title에서 HTML 태그 완전 제거
- 전체 뉴스 대상 (최대 10000개)
- excerpt, body, title 컬럼 정리
"""
import urllib.request, json, os, re
from concurrent.futures import ThreadPoolExecutor, as_completed

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY  = os.environ['SUPABASE_SERVICE_KEY']
H = {'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}', 'Content-Type': 'application/json'}

def strip_html(s):
    if not s: return ''
    s = re.sub(r'<(script|style)[^>]*>[\s\S]*?</(script|style)>', ' ', s, flags=re.I)
    s = re.sub(r'<[^>]+>', ' ', s)
    entities = [('&nbsp;',' '),('&amp;','&'),('&lt;','<'),('&gt;','>'),
                ('&quot;','"'),('&#39;',"'"),('&apos;',"'"),('\xa0',' '),
                ('&ldquo;','"'),('&rdquo;','"'),('&lsquo;',"'"),('&rsquo;',"'")]
    for e, r in entities:
        s = s.replace(e, r)
    s = re.sub(r'&#x?[0-9a-fA-F]+;', '', s)
    s = re.sub(r'https?://\S+', '', s)  # URL 제거
    return re.sub(r'\s+', ' ', s).strip()

def has_html(s):
    return bool(s and re.search(r'<[a-z][a-z0-9]*[\s>/]', s, re.I))

def supa_get(path):
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1{path}', headers=H)
    with urllib.request.urlopen(req, timeout=12) as r:
        return json.loads(r.read())

def fix_article(a):
    updates = {}
    if has_html(a.get('excerpt','')):
        cleaned = strip_html(a['excerpt'])
        if cleaned != a['excerpt']:
            updates['excerpt'] = cleaned[:500]
    if has_html(a.get('body','')):
        cleaned = strip_html(a['body'])
        if cleaned != a['body']:
            updates['body'] = cleaned[:500]
    if has_html(a.get('title','')):
        cleaned = strip_html(a['title'])
        if cleaned != a['title']:
            updates['title'] = cleaned[:200]
    if not updates:
        return 0
    url = f'{SUPABASE_URL}/rest/v1/articles?id=eq.{a["id"]}'
    data = json.dumps(updates).encode()
    req = urllib.request.Request(url, data=data,
        headers={**H, 'Prefer': 'return=minimal'}, method='PATCH')
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return 1 if r.status in (200,204) else 0
    except:
        return 0

total_fixed = 0
total_checked = 0

for offset in range(0, 10000, 200):
    arts = supa_get(
        f'/articles?status=eq.published&category=eq.news'
        f'&select=id,title,excerpt,body&order=published_at.desc&limit=200&offset={offset}'
    )
    if not arts:
        break
    
    bad = [a for a in arts if has_html(a.get('excerpt','')) or has_html(a.get('body','')) or has_html(a.get('title',''))]
    total_checked += len(arts)
    
    if bad:
        with ThreadPoolExecutor(max_workers=20) as ex:
            results = list(ex.map(fix_article, bad))
        cnt = sum(results)
        total_fixed += cnt
        print(f'offset={offset}: {len(arts)}개 확인, {len(bad)}개 HTML 발견, {cnt}개 수정')
    else:
        print(f'offset={offset}: {len(arts)}개 확인, HTML 없음 ✅')

print(f'\n완료: {total_checked}개 확인, {total_fixed}개 수정')
