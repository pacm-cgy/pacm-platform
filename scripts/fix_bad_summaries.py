"""
형식이 이상한 AI 요약 일괄 수정
- [제목], ** 볼드, ## 헤딩, 불릿 리스트 등 마크다운 잔재 제거
- 깔끔한 문장으로 재요약
"""
import urllib.request, json, os, re, time
from concurrent.futures import ThreadPoolExecutor, as_completed

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY  = os.environ['SUPABASE_SERVICE_KEY']
GEMINI_KEY   = os.environ['GEMINI_API_KEY']

H = {'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}'}

def is_bad(summary):
    if not summary: return False
    s = summary.strip()
    return (
        '**' in s or
        '##' in s or
        s.startswith('#') or
        bool(re.match(r'^\[.+\]', s)) or
        '---' in s or
        (s.startswith('- ') or '\n- ' in s[:100]) or
        bool(re.match(r'^\d+\.\s', s))
    )

def clean_markdown(text):
    """마크다운 제거만으로 해결되는 케이스"""
    t = text
    # [제목] 섹션 제거
    t = re.sub(r'\[제목\]\s*\n?', '', t)
    t = re.sub(r'\[뉴스 요약\]\s*\n?', '', t)
    t = re.sub(r'\[요약\]\s*\n?', '', t)
    # ** 볼드 제거
    t = re.sub(r'\*\*([^*]+)\*\*', r'\1', t)
    # # 헤딩 제거
    t = re.sub(r'^#{1,3}\s+', '', t, flags=re.MULTILINE)
    # --- 구분선 제거
    t = re.sub(r'^---+$', '', t, flags=re.MULTILINE)
    # 불릿 리스트를 문장으로
    t = re.sub(r'^\* ', '', t, flags=re.MULTILINE)
    t = re.sub(r'^- ', '', t, flags=re.MULTILINE)
    # 번호 리스트
    t = re.sub(r'^\d+\.\s', '', t, flags=re.MULTILINE)
    # 연속 빈줄 정리
    t = re.sub(r'\n{3,}', '\n\n', t)
    return t.strip()

def gemini_fix(article):
    title = article.get('title', '')
    bad_summary = article.get('ai_summary', '')
    body = article.get('body', '') or article.get('excerpt', '')

    # 클린업만으로 충분한 경우
    cleaned = clean_markdown(bad_summary)
    if not is_bad(cleaned) and len(cleaned) >= 200:
        return cleaned

    # Gemini로 재요약
    text = body[:1500] if len(body) > 200 else bad_summary[:1000]
    prompt = f"제목: {title}\n내용: {text}\n\n위 뉴스를 800~1000자로 요약하세요. 마크다운(**, ##, [], -, *) 절대 사용 금지. 핵심 팩트로 시작. 인사말 없이. 마침표로 끝내기."

    payload = json.dumps({
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {
            'maxOutputTokens': 1024,
            'temperature': 0.2,
            'thinkingConfig': {'thinkingBudget': 0},
        }
    }).encode()

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_KEY}"
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            d = json.loads(r.read())
            txt = d.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '').strip()
            if txt and len(txt) >= 100 and not is_bad(txt):
                return txt
            elif txt:
                return clean_markdown(txt)
    except:
        pass
    return cleaned  # 폴백: 클린업만

def supa_get(path):
    url = f"{SUPABASE_URL}/rest/v1{path}"
    req = urllib.request.Request(url, headers=H)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def supa_patch(article_id, summary):
    url = f"{SUPABASE_URL}/rest/v1/articles?id=eq.{article_id}"
    data = json.dumps({'ai_summary': summary}).encode()
    req = urllib.request.Request(url, data=data, headers={
        **H, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'
    }, method='PATCH')
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status

# 이상한 형식 뉴스 조회 (배치 80개)
BATCH = 80
articles = supa_get(
    f'/articles?status=eq.published&category=eq.news&ai_summary=not.is.null'
    f'&select=id,title,body,excerpt,ai_summary&order=published_at.desc&limit={BATCH}'
)

bad = [a for a in (articles or []) if is_bad(a.get('ai_summary', ''))]
print(f"이상한 요약: {len(bad)}개 / {len(articles)}개 조회")

if not bad:
    print("처리할 항목 없음")
else:
    done = fixed_clean = fixed_gemini = failed = 0
    with ThreadPoolExecutor(max_workers=15) as executor:
        futures = {executor.submit(gemini_fix, a): a for a in bad}
        for future in as_completed(futures):
            a = futures[future]
            try:
                new_summary = future.result()
                if new_summary and new_summary != a.get('ai_summary'):
                    supa_patch(a['id'], new_summary)
                    if not is_bad(new_summary):
                        done += 1
                    else:
                        failed += 1
                else:
                    failed += 1
            except Exception as e:
                failed += 1

    print(f"완료: done={done}, failed={failed}")
