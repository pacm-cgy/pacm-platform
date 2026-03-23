"""
뉴스 AI 요약 생성 — Insightship AI v3 (완전 자체 독립)
외부 API 제로: Groq / Gemini / OpenAI 완전 배제
순수 Python 표준 라이브러리만 사용
"""
import urllib.request, json, os, time, sys, re
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(__file__))

# ── 자체 AI v3 로드 (외부 API 없음)
AI_OK = False
ai_summarize = None
for mod_name in ["insightship_ai_v3", "insightship_ai_v2", "insightship_ai"]:
    try:
        mod = __import__(mod_name)
        ai_summarize = mod.summarize
        AI_OK = True
        print(f"[PACM AI] 자체 AI 로드 완료: {mod_name}")
        break
    except Exception as e:
        print(f"[PACM AI] {mod_name} 실패: {e}")

if not AI_OK:
    print("[PACM AI] 자체 AI 로드 실패 — 종료")
    sys.exit(1)

# ── 환경변수
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")
MAX_PER_RUN  = int(os.environ.get("BATCH_SIZE", "100"))
WORKERS      = int(os.environ.get("MAX_WORKERS", "20"))

if not SUPABASE_URL or not SERVICE_KEY:
    print("[PACM AI] Supabase 환경변수 없음 — 종료")
    sys.exit(1)

H_R = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
H_W = {**H_R, "Content-Type": "application/json", "Prefer": "return=minimal"}


def clean(text):
    if not text: return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"https?://\S+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def supa_get(path):
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1{path}", headers=H_R)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def supa_patch(article_id, data):
    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/articles?id=eq.{article_id}",
        data=payload, headers=H_W, method="PATCH"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status in (200, 204)
    except urllib.error.HTTPError as e:
        print(f"[PATCH ERROR] {e.code}: {e.read().decode()[:80]}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[PATCH ERROR] {e}", file=sys.stderr)
        return False


def get_remaining():
    import urllib.parse
    v = urllib.parse.quote("(요약 생략)", safe="")
    base = SUPABASE_URL + "/rest/v1/articles"
    H_c = {**H_R, "Prefer": "count=exact"}
    try:
        n1 = n2 = 0
        with urllib.request.urlopen(urllib.request.Request(
                base + "?ai_summary=is.null&status=eq.published", headers=H_c), timeout=10) as r:
            n1 = int(r.headers.get("Content-Range","*/0").split("/")[-1])
        with urllib.request.urlopen(urllib.request.Request(
                base + f"?ai_summary=eq.{v}&status=eq.published", headers=H_c), timeout=10) as r:
            n2 = int(r.headers.get("Content-Range","*/0").split("/")[-1])
        print(f"  null:{n1}건 + 요약생략:{n2}건")
        return n1 + n2
    except Exception as e:
        print(f"[get_remaining] {e}", file=sys.stderr)
        return -1


def cleanup_old_null():
    return 0  # 비활성화: null 유지 방식으로 관리


# ── 메인 실행
remaining = get_remaining()
print(f"요약 필요: {remaining}개")

if remaining == 0:
    print("모두 완료. 종료.")
    sys.exit(0)

import urllib.parse as _up
_v = _up.quote("(요약 생략)", safe="")
_half = max(MAX_PER_RUN // 2, 50)
_a1 = supa_get(f"/articles?ai_summary=is.null&status=eq.published"
               f"&select=id,title,body,excerpt&order=published_at.desc&limit={_half}")
_a2 = supa_get(f"/articles?ai_summary=eq.{_v}&status=eq.published"
               f"&select=id,title,body,excerpt&order=published_at.desc&limit={_half}")
_a1 = _a1 if isinstance(_a1, list) else []
_a2 = _a2 if isinstance(_a2, list) else []
articles = _a1 + _a2
_seen = set()
articles = [a for a in articles if not (a["id"] in _seen or _seen.add(a["id"]))]
print(f"이번 배치: null {len(_a1)}건 + 요약생략 {len(_a2)}건 = {len(articles)}건")

if not articles:
    print("처리할 기사 없음. 종료.")
    sys.exit(0)

done = fail = 0
start = time.time()


def process(a):
    body = clean(a.get("body", "") or a.get("excerpt", "") or "")
    try:
        summary = ai_summarize(a["title"], body, target_len=2000)
        if summary and len(summary) >= 30:
            return "ok" if supa_patch(a["id"], {"ai_summary": summary}) else "fail"
        return "fail"
    except Exception as e:
        print(f"[PROCESS ERROR] {a.get('id','?')[:8]}: {e}", file=sys.stderr)
        return "fail"


with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    futures = {ex.submit(process, a): a for a in articles}
    for i, fut in enumerate(as_completed(futures), 1):
        result = fut.result()
        if result == "ok": done += 1
        else: fail += 1
        if i % 10 == 0:
            print(f"  {i}/{len(articles)} — 완료:{done} 실패:{fail} ({time.time()-start:.0f}s)")
        time.sleep(0.05)

print(f"[PACM AI] 완료: {done}개 성공 / {fail}개 실패 / {time.time()-start:.0f}초")
