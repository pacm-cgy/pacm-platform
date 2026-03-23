"""
뉴스 AI 요약 생성
1차: Insightship 자체 AI (insightship_ai.py) — 완전 무료, API 불필요
2차: Groq API 폴백 (GROQ_API_KEY 있을 때)
3차: Gemini 폴백
"""
import urllib.request, json, os, time, re, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

# 자체 AI 엔진 로드
sys.path.insert(0, os.path.dirname(__file__))
# 자체 AI v2 우선 로드, v1 폴백
SELF_AI_OK = False
self_summarize = None
for ai_module in ['insightship_ai_v2', 'insightship_ai']:
    try:
        mod = __import__(ai_module)
        self_summarize = mod.summarize
        SELF_AI_OK = True
        print(f"✅ 자체 AI 로드 완료: {ai_module}")
        break
    except Exception as e:
        print(f"⚠️  {ai_module} 로드 실패: {e}")

SUPABASE_URL  = os.environ['SUPABASE_URL']
SERVICE_KEY   = os.environ['SUPABASE_SERVICE_KEY']
GROQ_API_KEY  = os.environ.get('GROQ_API_KEY', '')
GEMINI_KEY    = os.environ.get('GEMINI_API_KEY', '')  # 폴백용

# 처리 설정
MAX_PER_RUN = int(os.environ.get('BATCH_SIZE', '50'))   # 한 번에 처리할 기사 수
WORKERS     = int(os.environ.get('MAX_WORKERS', '10'))  # 병렬 처리 스레드 수

H = {'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}', 'Content-Type': 'application/json'}

SYSTEM = """당신은 Insightship 뉴스 에디터입니다. 청소년 창업가를 위한 심층 뉴스 요약을 작성합니다.
규칙:
- 인사말/서론 없이 핵심 내용으로 바로 시작
- 분량: 1,500~2,500자 수준으로 충분히 상세하게 작성
- 배경·맥락·의미·시사점까지 포함한 심층 분석 제공
- ~입니다/~했습니다/~됩니다 경어체
- 어려운 용어는 괄호(  )로 설명
- 수치·기업명·날짜·인물명 구체적으로 포함
- 문단 구분은 빈 줄로 구분
- 마지막 문장은 반드시 완전하게 마무리
- **볼드**, ## 마크다운 절대 금지. 순수 텍스트만 출력
- HTML 태그 절대 사용 금지"""


def call_groq(title, text):
    """Groq API 호출 (llama-3.3-70b)"""
    if not GROQ_API_KEY:
        return None
    payload = json.dumps({
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"제목: {title}\n본문: {text[:5000]}\n\n위 뉴스를 청소년 눈높이에 맞게 1,500~2,500자로 심층 요약하세요. 배경·맥락·의미·시사점을 포함하세요."}
        ],
        "max_tokens": 3500,
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
            'contents': [{'role': 'user', 'parts': [{'text': f"제목: {title}\n본문: {text[:4000]}\n\n1,500~2,500자 심층 요약. 핵심 팩트로 바로 시작하되 배경과 시사점까지 포함하세요."}]}],
            'generationConfig': {'maxOutputTokens': 4096, 'temperature': 0.2},
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
    """
    뉴스 1건 요약
    1순위: Insightship 자체 AI (완전 무료, API 불필요)
    2순위: Groq API 폴백
    3순위: Gemini 폴백
    """
    title = article.get('title', '')
    body  = article.get('body', '')
    exc   = article.get('excerpt', '')
    text  = body[:2000] if len(body) > 200 else (exc[:800] if len(exc) > 30 else title)

    # 1순위: 자체 AI (항상 사용 가능, API 비용 0원)
    if SELF_AI_OK:
        try:
            result = self_summarize(title, text)
            if result and len(result) >= 200:
                return clean_summary(result)
        except Exception as e:
            pass  # 폴백으로 진행

    # 2순위: Groq
    result = call_groq(title, text)
    if not result:
        # 3순위: Gemini
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
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status in (200, 204)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()[:200]
        print(f'⚠️ PATCH 오류 {e.code}: {err_body}', file=sys.stderr)
        return False
    except Exception as e:
        print(f'⚠️ PATCH 예외: {e}', file=sys.stderr)
        return False


def get_remaining():
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/articles?status=eq.published&category=eq.news&or=(ai_summary.is.null,ai_summary.eq.(요약 생략))&select=id&limit=1",
            headers={**H, 'Prefer': 'count=exact'}
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            return int(r.headers.get('Content-Range', '*/0').split('/')[-1])
    except:
        return -1


def cleanup_old_null():
    """비활성화 — (요약 생략) 대신 null 유지하여 재처리 대상 유지"""
    return 0


# ── 메인 실행 ────────────────────────────────────────────────

remaining = get_remaining()
print(f"요약 필요 뉴스: {remaining}개")

if remaining == 0:
    print("요약할 뉴스 없음. 종료.")
    exit(0)

# 요약 대상 조회 — null 및 "(요약 생략)" 모두 포함
articles = supa_get(
    '/articles?status=eq.published&category=eq.news'
    '&or=(ai_summary.is.null,ai_summary.eq.%28%EC%9A%94%EC%95%BD+%EC%83%9D%EB%9E%B5%29)'
    f'&select=id,title,body,excerpt&order=published_at.desc&limit={MAX_PER_RUN}'
)
print(f"이번 배치: {len(articles)}개")

if not articles:
    print("처리할 기사 없음. 종료.")
    exit(0)

done = 0
fail = 0
start = time.time()


def process(a):
    try:
        summary = summarize(a)
        if summary and len(summary) > 50:
            ok = supa_patch(a['id'], {'ai_summary': summary})
            return 'ok' if ok else 'fail'
        return 'fail'
    except Exception as e:
        print(f'⚠️ process 오류 [{a.get("id","?")}]: {e}', file=sys.stderr)
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
