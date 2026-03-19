"""
대량 AI 요약 처리 - Gemini API 직접 호출
GitHub Actions에서 실행: 병렬로 100개씩 처리
"""
import urllib.request, urllib.parse, json, os, time
from concurrent.futures import ThreadPoolExecutor, as_completed

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY  = os.environ['SUPABASE_SERVICE_KEY']
GEMINI_KEY   = os.environ['GEMINI_API_KEY']
BATCH        = int(os.environ.get('BATCH_SIZE', '60'))

H = {'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}'}

SYSTEM = """Insightship 뉴스 에디터. 규칙:
- 800~1,000자, 완전한 문장으로 마무리
- 인사말 절대 금지 (안녕하세요/여러분 등)
- 첫 팩트로 바로 시작 ("[기업명]이 ~했습니다" 형식)
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
        }
    }).encode()

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_KEY}"
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.loads(r.read())
            return d.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '').strip()
    except Exception as e:
        print(f"  Gemini 오류: {e}")
        return None

def process_batch(articles):
    done = failed = 0
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(gemini_call, a): a for a in articles}
        for future in as_completed(futures):
            a = futures[future]
            try:
                summary = future.result()
                if summary and len(summary) >= 100:
                    supa_patch(a['id'], summary)
                    done += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"  처리 오류: {e}")
                failed += 1
    return done, failed

# null 요약 전체 조회
articles = supa_get(
    f'/articles?status=eq.published&category=eq.news&ai_summary=is.null'
    f'&select=id,title,body,excerpt&order=published_at.desc&limit={BATCH}'
)

if not articles:
    print("처리할 뉴스 없음")
else:
    print(f"총 {len(articles)}개 요약 시작...")
    done, failed = process_batch(articles)
    print(f"완료: done={done}, failed={failed}")

    # 남은 null 확인
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/articles?status=eq.published&category=eq.news&ai_summary=is.null&select=id&limit=1",
        headers={**H, 'Prefer': 'count=exact'}
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        remaining = r.headers.get('Content-Range', '*/0').split('/')[-1]
    print(f"남은 null: {remaining}개")
