"""
대량 AI 요약 처리 - Gemini API 병렬 호출 (최대 처리량)
GitHub Actions 전용
"""
import urllib.request, json, os, time
from concurrent.futures import ThreadPoolExecutor, as_completed

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY  = os.environ['SUPABASE_SERVICE_KEY']
GEMINI_KEY   = os.environ['GEMINI_API_KEY']
BATCH        = int(os.environ.get('BATCH_SIZE', '80'))
MAX_WORKERS  = int(os.environ.get('MAX_WORKERS', '20'))

H = {'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}'}

# 간결하고 명확한 프롬프트 (토큰 절약 → 속도 향상)
SYSTEM = "Insightship 뉴스 에디터. 800~1000자 요약. 인사말 없이 핵심 팩트로 바로 시작. ~입니다/했습니다 체. 어려운 용어 괄호 설명. 마지막 문장 마침표로 끝낼 것. 절대 금지: **, ##, [], 불릿(- *), 번호리스트, 마크다운 헤딩. 순수 문장만 사용."

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

def gemini_call(article):
    title = article.get('title', '')
    body  = article.get('body', '')
    exc   = article.get('excerpt', '')
    # 입력 텍스트 최적화 (너무 길면 오히려 느림)
    text = body[:1500] if len(body) > 200 else (exc[:500] if len(exc) > 30 else title)

    payload = json.dumps({
        'system_instruction': {'parts': [{'text': SYSTEM}]},
        'contents': [{'role': 'user', 'parts': [{'text':
            f"제목: {title}\n본문: {text}\n\n800~1000자로 요약. 핵심 팩트로 바로 시작."
        }]}],
        'generationConfig': {
            'maxOutputTokens': 1024,
            'temperature': 0.2,
            'thinkingConfig': {'thinkingBudget': 0},  # 생각 없이 즉시 출력
        }
    }).encode()

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_KEY}"
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.loads(r.read())
            txt = d.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '').strip()
            # 품질 검증
            if not txt or len(txt) < 100:
                return None
            # 인사말 제거
            greets = ['안녕하세요', '반갑습니다', '여러분,', '여러분!', '안녕']
            if any(txt.startswith(g) for g in greets):
                # 첫 문장 이후부터 사용
                for sep in ['. ', '.\n']:
                    if sep in txt[:80]:
                        txt = txt[txt.index(sep)+2:].strip()
                        break
            # 끊김 확인 - 마침표로 끝나지 않으면 버림
            if not txt.rstrip().endswith('.'):
                # 마지막 마침표까지 자르기
                last_dot = txt.rfind('.')
                if last_dot > len(txt) * 0.6:  # 60% 이상 위치면 사용
                    txt = txt[:last_dot+1].strip()
                else:
                    return None
            return txt
    except Exception:
        return None

def get_remaining():
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/articles?status=eq.published&category=eq.news&ai_summary=is.null&select=id&limit=1",
            headers={**H, 'Prefer': 'count=exact'}
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            return int(r.headers.get('Content-Range', '*/0').split('/')[-1])
    except:
        return -1

# 오래된 null 뉴스 정리 (30일 이상)
def cleanup_old_null():
    try:
        from datetime import datetime, timezone, timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%d')
        old = supa_get(f'/articles?status=eq.published&category=eq.news&ai_summary=is.null&published_at=lt.{cutoff}&select=id&limit=200')
        if not old:
            return 0
        ids = ','.join(a['id'] for a in old)
        url = f"{SUPABASE_URL}/rest/v1/articles?id=in.({ids})"
        req = urllib.request.Request(url, headers={**H, 'Prefer': 'return=minimal'}, method='DELETE')
        with urllib.request.urlopen(req, timeout=15):
            pass
        return len(old)
    except Exception as e:
        print(f"  정리 오류: {e}")
        return 0

# 오래된 null 정리
cleaned = cleanup_old_null()
if cleaned:
    print(f"오래된 null 뉴스 {cleaned}개 정리")

# null 요약 조회
articles = supa_get(
    f'/articles?status=eq.published&category=eq.news&ai_summary=is.null'
    f'&select=id,title,body,excerpt&order=published_at.desc&limit={BATCH}'
)

if not articles:
    remaining = get_remaining()
    print(f"처리할 뉴스 없음 (remaining={remaining})")
else:
    print(f"{len(articles)}개 요약 시작 (workers={MAX_WORKERS})...")
    start = time.time()
    done = failed = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(gemini_call, a): a for a in articles}
        for future in as_completed(futures):
            a = futures[future]
            try:
                summary = future.result()
                if summary:
                    supa_patch(a['id'], summary)
                    done += 1
                else:
                    failed += 1
            except Exception:
                failed += 1

    elapsed = round(time.time() - start, 1)
    speed = round(done/elapsed, 2) if elapsed > 0 else 0
    remaining = get_remaining()
    print(f"완료: done={done}, failed={failed}, elapsed={elapsed}s, speed={speed}건/s, remaining={remaining}")
