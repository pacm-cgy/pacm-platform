"""
뉴스 AI 요약 생성 - Groq API (llama-3.3-70b)
무료 플랜: 14,400 req/day, 30 RPM — Gemini 대비 10배 여유
"""
import urllib.request, json, os, time, re
from concurrent.futures import ThreadPoolExecutor, as_completed

SUPABASE_URL  = os.environ['SUPABASE_URL']
SERVICE_KEY   = os.environ['SUPABASE_SERVICE_KEY']
GROQ_API_KEY  = os.environ.get('GROQ_API_KEY', '')
GEMINI_KEY    = os.environ.get('GEMINI_API_KEY', '')  # 폴백용

H = {'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}', 'Content-Type': 'application/json'}

SYSTEM = """당신은 Insightship 뉴스 에디터입니다. 청소년 창업가를 위한 뉴스 요약을 작성합니다.
규칙:
- 인사말/서론 없이 핵심 내용으로 바로 시작
- 800~1000자 분량
- ~입니다/~했습니다 경어체
- 어려운 용어는 괄호(  )로 설명
- 수치·기업명·날짜 구체적으로 포함
- 마지막 문장을 완전하게 마무리 (절대 끊기지 않게)
- **볼드**, ## 마크다운 금지. 순수 텍스트만 출력
- HTML 태그 절대 사용 금지"""


def call_groq(title, text):
    """Groq API 호출 (llama-3.3-70b)"""
    if not GROQ_API_KEY:
        return None
    payload = json.dumps({
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"제목: {title}\n본문: {text[:2000]}\n\n위 뉴스를 청소년 눈높이에 맞게 800~1000자로 요약하세요."}
        ],
        "max_tokens": 1200,
        "temperature": 0.3,
    }).encode()
    req = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        data=payload,
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {GROQ_API_KEY}'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.loads(r.read())
            return d['choices'][0]['message']['content'].strip()
    except urllib.error.HTTPError as e:
        if e.code == 429:
            time.sleep(2)
        return None
    except Exception:
        return None


def call_gemini(title, text):
    """Gemini 폴백"""
    if not GEMINI_KEY:
        return None
    for model in ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b']:
        payload = json.dumps({
            'system_instruction': {'parts': [{'text': SYSTEM}]},
            'contents': [{'role': 'user', 'parts': [{'text': f"제목: {title}\n본문: {text[:1500]}\n\n800~1000자 요약. 핵심 팩트로 바로 시작."}]}],
            'generationConfig': {'maxOutputTokens': 1024, 'temperature': 0.2},
        }).encode()
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_KEY}",
            data=payload, headers={'Content-Type': 'application/json'}, method='POST'
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                d = json.loads(r.read())
                txt = d.get('candidates',[{}])[0].get('content',{}).get('parts',[{}])[0].get('text','').strip()
                if txt:
                    return txt
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(0.5)
                continue
            break
        except Exception:
            break
    return None


def clean_summary(txt):
    """요약 텍스트 정리"""
    if not txt or len(txt) < 100:
        return None
    # 마크다운 제거
    txt = re.sub(r'\*\*(.+?)\*\*', r'\1', txt)
    txt = re.sub(r'^#{1,3}\s+', '', txt, flags=re.MULTILINE)
    txt = re.sub(r'^\s*[\-\*]\s+', '', txt, flags=re.MULTILINE)
    # 인사말 제거
    for greet in ['안녕하세요', '반갑습니다', '여러분,', '여러분!']:
        if txt.startswith(greet):
            for sep in ['. ', '.\n']:
                if sep in txt[:100]:
                    txt = txt[txt.index(sep)+2:].strip()
                    break
    # 마침표로 끝나지 않으면 정리
    if not txt.rstrip().endswith(('.', '다', '요')):
        last_end = max(txt.rfind('.'), txt.rfind('다'), txt.rfind('요'))
        if last_end > len(txt) * 0.6:
            txt = txt[:last_end+1].strip()
        else:
            return None
    return txt[:1500]


def summarize(article):
    """뉴스 1건 요약 - Groq 우선, Gemini 폴백"""
    title = article.get('title', '')
    body  = article.get('body', '')
    exc   = article.get('excerpt', '')
    text  = body[:2000] if len(body) > 200 else (exc[:800] if len(exc) > 30 else title)

    # 1차: Groq (빠르고 무료 할당량 넉넉)
    result = call_groq(title, text)
    if not result:
        # 2차: Gemini 폴백
        result = call_gemini(title, text)

    return clean_summary(result)


def supa_get(path):
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1{path}', headers=H)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def supa_patch(article_id, data):
    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/articles?id=eq.{article_id}',
        data=payload, headers={**H, 'Prefer': 'return=minimal'}, method='PATCH'
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status in (200, 204)


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


def cleanup_old_null():
    """30일 이상 오래된 null 요약 정리"""
    try:
        from datetime import datetime, timezone, timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%d')
        old = supa_get(f'/articles?status=eq.published&category=eq.news&ai_summary=is.null&published_at=lt.{cutoff}&select=id&limit=200')
        if not old:
            return 0
        count = 0
        for a in old:
            payload = json.dumps({'ai_summary': '(요약 생략)'}).encode()
            req = urllib.request.Request(
                f'{SUPABASE_URL}/rest/v1/articles?id=eq.{a["id"]}',
                data=payload, headers={**H, 'Prefer': 'return=minimal'}, method='PATCH'
            )
            try:
                with urllib.request.urlopen(req, timeout=8):
                    count += 1
            except:
                pass
        return count
    except:
        return 0


# ── 메인 ──────────────────────────────────────────────────────────
MAX_PER_RUN = 80   # Groq 14,400/day 기준 넉넉하게
WORKERS     = 5    # 동시 처리 수 (Groq 30 RPM 기준 안전)

print(f"Groq 연결: {'✅' if GROQ_API_KEY else '❌ (Gemini 폴백 사용)'}")
remaining = get_remaining()
print(f"요약 필요 뉴스: {remaining}개")

if remaining == 0:
    print("요약할 뉴스 없음. 종료.")
    exit(0)

# 오래된 null 정리 먼저
cleaned = cleanup_old_null()
if cleaned:
    print(f"오래된 null {cleaned}개 정리")

# 요약 대상 조회
articles = supa_get(
    f'/articles?status=eq.published&category=eq.news&ai_summary=is.null'
    f'&select=id,title,body,excerpt&order=published_at.desc&limit={MAX_PER_RUN}'
)
print(f"이번 배치: {len(articles)}개")

done = 0
fail = 0
start = time.time()

def process(a):
    summary = summarize(a)
    if summary:
        ok = supa_patch(a['id'], {'ai_summary': summary})
        return 'ok' if ok else 'fail'
    return 'fail'

with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    futures = {ex.submit(process, a): a for a in articles}
    for i, fut in enumerate(as_completed(futures), 1):
        result = fut.result()
        if result == 'ok':
            done += 1
        else:
            fail += 1
        if i % 10 == 0:
            elapsed = time.time() - start
            print(f"  {i}/{len(articles)} — 완료:{done} 실패:{fail} ({elapsed:.0f}s)")
        time.sleep(0.1)  # RPM 제한 여유

elapsed = time.time() - start
print(f"\n✅ 완료: {done}개 성공 / {fail}개 실패 / {elapsed:.0f}초")
