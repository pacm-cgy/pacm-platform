"""
대량 AI 요약 처리 - Gemini API 직접 병렬 호출
GitHub Actions 전용: 최대 처리량으로 요약 실행
"""
import urllib.request, json, os, time
from concurrent.futures import ThreadPoolExecutor, as_completed

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY  = os.environ['SUPABASE_SERVICE_KEY']
GEMINI_KEY   = os.environ['GEMINI_API_KEY']
BATCH        = int(os.environ.get('BATCH_SIZE', '80'))  # 한 라운드에 처리할 수
MAX_WORKERS  = int(os.environ.get('MAX_WORKERS', '20')) # 동시 Gemini 호출 수

H = {'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}'}

SYSTEM = """Insightship 뉴스 에디터. 규칙:
- 800~1,000자, 완전한 문장으로 마무리 (절대 끊기지 않게)
- 인사말 절대 금지 (안녕하세요/여러분 등 사용 즉시 실격)
- 첫 팩트로 바로 시작: "[기업명/기관]이 ~했습니다" 형식
- ~입니다/~했습니다 체
- 어려운 용어 괄호 설명
- 창업·스타트업 생태계 의미 한 문장 포함"""

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
    """단일 기사 Gemini 요약 호출"""
    title = article.get('title', '')
    body  = article.get('body', '')
    exc   = article.get('excerpt', '')
    text  = body[:2000] if len(body) > 200 else (exc if len(exc) > 30 else title)

    payload = json.dumps({
        'system_instruction': {'parts': [{'text': SYSTEM}]},
        'contents': [{'role': 'user', 'parts': [{'text':
            f"제목: {title}\n내용: {text}\n\n위 뉴스를 800~1,000자로 요약하세요. 인사말 없이 첫 팩트로 바로 시작."
        }]}],
        'generationConfig': {
            'maxOutputTokens': 1200,
            'temperature': 0.3,
            'thinkingConfig': {'thinkingBudget': 0},
        }
    }).encode()

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_KEY}"
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.loads(r.read())
            txt = d.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '').strip()
            # 인사말 포함 시 첫 문장 제거
            if any(g in txt[:50] for g in ['안녕하세요','반갑습니다','여러분']):
                lines = txt.split('\n')
                txt = '\n'.join(lines[1:]).strip() if len(lines) > 1 else txt
                # 문장 단위 제거
                if '. ' in txt[:80] and any(g in txt[:80] for g in ['안녕','여러분']):
                    txt = txt[txt.index('. ')+2:].strip()
            return txt if len(txt) >= 100 else None
    except Exception as e:
        return None

def process_batch(articles):
    """배치 병렬 처리"""
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
    return done, failed

# null 요약 조회
articles = supa_get(
    f'/articles?status=eq.published&category=eq.news&ai_summary=is.null'
    f'&select=id,title,body,excerpt&order=published_at.desc&limit={BATCH}'
)

if not articles:
    print(f"처리할 뉴스 없음")
else:
    print(f"{len(articles)}개 요약 시작 (workers={MAX_WORKERS})...")
    start = time.time()
    done, failed = process_batch(articles)
    elapsed = round(time.time() - start, 1)
    print(f"완료: done={done}, failed={failed}, elapsed={elapsed}s, speed={round(done/elapsed,1) if elapsed>0 else 0}건/s")

    # 남은 null 확인
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/articles?status=eq.published&category=eq.news&ai_summary=is.null&select=id&limit=1",
            headers={**H, 'Prefer': 'count=exact'}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            remaining = r.headers.get('Content-Range', '*/0').split('/')[-1]
        print(f"남은 null: {remaining}개")
    except:
        pass
