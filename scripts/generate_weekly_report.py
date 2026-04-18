"""
Insightship 주간 보고서 자동 생성기
PACM 자체 개발 | 외부 API 0%
매주 월요일 KST 06:00 실행 → 지난 7일 뉴스 분석 → weekly_reports 테이블 저장
"""
import os, json, time, urllib.request, hashlib, re
from collections import Counter
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
VERSION = "1.0.0"

# ── Supabase 설정 ─────────────────────────────────────────────
def get_cfg():
    return {
        "url": os.environ.get("SUPABASE_URL", ""),
        "key": os.environ.get("SUPABASE_SERVICE_KEY", os.environ.get("SUPABASE_ANON_KEY", "")),
    }

def supabase_get(path: str) -> list:
    cfg = get_cfg()
    req = urllib.request.Request(
        f"{cfg['url']}/rest/v1/{path}",
        headers={"apikey": cfg["key"], "Authorization": f"Bearer {cfg['key']}"}
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"GET 오류: {e}")
        return []

def supabase_post(table: str, data: dict) -> int:
    cfg = get_cfg()
    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{cfg['url']}/rest/v1/{table}",
        data=payload,
        headers={
            "apikey": cfg["key"],
            "Authorization": f"Bearer {cfg['key']}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"POST 오류 {e.code}: {body[:200]}")
        return e.code
    except Exception as e:
        print(f"POST 오류: {e}")
        return 0

def supabase_patch(table: str, filter_: str, data: dict) -> int:
    cfg = get_cfg()
    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{cfg['url']}/rest/v1/{table}?{filter_}",
        data=payload,
        headers={
            "apikey": cfg["key"],
            "Authorization": f"Bearer {cfg['key']}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="PATCH"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"PATCH 오류 {e.code}: {body[:200]}")
        return e.code

# ── 데이터 수집 ───────────────────────────────────────────────
def fetch_week_articles(days: int = 7) -> list:
    cfg = get_cfg()
    if not cfg["url"] or not cfg["key"]:
        print("⚠️  Supabase 환경변수 없음")
        return []
    cutoff = (datetime.now(KST) - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00")
    url = (f"{cfg['url']}/rest/v1/articles"
           f"?select=id,title,body,excerpt,ai_summary,ai_category,published_at,source_name"
           f"&status=eq.published&published_at=gte.{cutoff}"
           f"&order=published_at.desc&limit=500")
    req = urllib.request.Request(url, headers={
        "apikey": cfg["key"], "Authorization": f"Bearer {cfg['key']}"
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"fetch 오류: {e}")
        return []

# ── 분석 엔진 ─────────────────────────────────────────────────
STOPWORDS = {
    "이","그","저","것","수","들","및","등","에서","로서","으로","에게",
    "하지만","그러나","또한","그리고","따라서","때문에","위해","통해","대한",
    "있는","없는","되는","하는","있다","없다","된다","한다","이다","있으며",
    "이번","지난","올해","최근","현재","지금","특히","또","더","가장","매우",
    "기자","특파원","보도","발표","밝혔다","말했다","전했다","합니다","입니다",
}

CATEGORY_NAMES = {
    "investment": "투자·금융",
    "tech": "기술·AI",
    "youth": "청소년·교육",
    "policy": "정책·지원",
    "startup": "창업·스타트업",
    "esg": "ESG·임팩트",
    "fintech": "핀테크",
    "edutech": "에듀테크",
    "food": "식품·F&B",
    "health": "헬스케어",
}

def extract_keywords(text: str, n: int = 15) -> list:
    words = re.findall(r'[가-힣A-Za-z0-9]{2,10}', text)
    filtered = [w for w in words if w not in STOPWORDS and not w.isdigit()]
    counter = Counter(filtered)
    return [w for w, _ in counter.most_common(n)]

def extract_numbers(text: str) -> list:
    patterns = [
        r'\d{1,4}조\s*\d{0,4}억?', r'\d{1,5}억', r'\d{1,4}%',
        r'\d{1,5}만\s*명', r'\d{1,5}개',
    ]
    nums = []
    for p in patterns:
        nums.extend(re.findall(p, text))
    return list(dict.fromkeys(nums))[:8]

def analyze_categories(articles: list) -> dict:
    """카테고리별 기사 수 집계"""
    cats = Counter()
    for a in articles:
        cat = a.get("ai_category") or "startup"
        cats[cat] += 1
    return dict(cats.most_common())

def find_top_articles(articles: list, n: int = 5) -> list:
    """대표 기사 선정 — ai_summary 길이 기준 (콘텐츠가 풍부한 것)"""
    scored = []
    for a in articles:
        summary_len = len(a.get("ai_summary") or "")
        title_len = len(a.get("title") or "")
        scored.append((summary_len + title_len * 2, a))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [a for _, a in scored[:n]]

# ── 보고서 생성 ───────────────────────────────────────────────
def generate_report(articles: list, week_start: str, week_end: str) -> dict:
    """주간 보고서 딕셔너리 생성"""
    if not articles:
        return {}
    
    # 전체 텍스트 합산
    all_text = " ".join(
        f"{a.get('title','')} {a.get('body','')} {a.get('excerpt','')}"
        for a in articles
    )
    
    keywords = extract_keywords(all_text, 20)
    numbers = extract_numbers(all_text)
    categories = analyze_categories(articles)
    top_articles = find_top_articles(articles, 5)
    
    # 가장 많은 카테고리
    top_cat = max(categories, key=categories.get) if categories else "startup"
    top_cat_name = CATEGORY_NAMES.get(top_cat, top_cat)
    
    # 주간 요약 생성
    total = len(articles)
    investment_count = categories.get("investment", 0) + categories.get("fintech", 0)
    tech_count = categories.get("tech", 0) + categories.get("edutech", 0)
    policy_count = categories.get("policy", 0)
    
    # 핵심 수치 추출
    key_nums = numbers[:5]
    num_str = " · ".join(key_nums) if key_nums else "다양한 지표"
    kw_str = " · ".join(keywords[:8]) if keywords else "창업·혁신"
    
    # 보고서 마크다운 본문
    week_label = f"{week_start[:10]} ~ {week_end[:10]}"
    
    summary_md = f"""# 📊 Insightship 주간 인사이트 보고서
## {week_label}

---

이번 주 **{total}건**의 창업·경제 뉴스를 분석했습니다. 가장 활발했던 분야는 **{top_cat_name}**으로, 전체의 {round(categories.get(top_cat, 0)/total*100) if total else 0}%를 차지했습니다.

---

## 📈 이번 주 핵심 키워드

{kw_str}

---

## 🗂️ 분야별 동향

"""
    
    for cat, count in sorted(categories.items(), key=lambda x: x[1], reverse=True)[:6]:
        cat_name = CATEGORY_NAMES.get(cat, cat)
        pct = round(count/total*100) if total else 0
        bar = "█" * (pct // 10) + "░" * (10 - pct // 10)
        summary_md += f"**{cat_name}** [{bar}] {count}건 ({pct}%)\n\n"
    
    summary_md += f"""
---

## 💰 주목할 숫자

{chr(10).join(f"→ **{n}**" for n in key_nums) if key_nums else "→ 다양한 성장 지표가 이번 주 뉴스에 등장했습니다."}

---

## 🔥 이번 주 대표 뉴스 TOP 5

"""
    
    for i, a in enumerate(top_articles, 1):
        title = a.get("title", "")
        cat = CATEGORY_NAMES.get(a.get("ai_category"), "")
        pub = (a.get("published_at") or "")[:10]
        summary_md += f"**{i}. {title}**\n\n"
        if cat:
            summary_md += f"_{cat} · {pub}_\n\n"
    
    summary_md += f"""
---

## 🧠 AI 주간 분석

이번 주 {total}건의 뉴스에서 포착된 핵심 흐름:

"""
    
    if investment_count > 0:
        summary_md += f"**투자 흐름**: 이번 주 {investment_count}건의 투자·금융 관련 뉴스가 보고됐습니다. "
        if key_nums:
            summary_md += f"주요 투자 규모로는 {', '.join(key_nums[:3])}이 언급됐습니다. "
        summary_md += "고금리 시대가 마무리되며 선별적 투자가 재개되는 신호로 해석됩니다.\n\n"
    
    if tech_count > 0:
        summary_md += f"**기술 동향**: AI·테크 관련 {tech_count}건의 뉴스가 이번 주를 주도했습니다. "
        summary_md += "2026년 현재 AI 도입이 전 산업으로 확산되는 흐름이 뚜렷하게 나타나고 있습니다.\n\n"
    
    if policy_count > 0:
        summary_md += f"**정책 환경**: {policy_count}건의 정책·지원 뉴스가 발표됐습니다. "
        summary_md += "정부의 창업 생태계 지원이 지속되고 있으며, 청소년 창업자에게도 기회가 열려 있습니다.\n\n"
    
    summary_md += f"""
> ⚠️ 이 분석은 Insightship AI가 자동으로 생성한 내용입니다. 투자·사업 결정의 근거로 사용하지 마세요.

---

## 🚀 다음 주 주목할 트렌드

→ **{keywords[0] if keywords else '창업'}** 분야의 추가 움직임 예상
→ **{keywords[1] if len(keywords) > 1 else '투자'}** 관련 후속 뉴스 모니터링 필요
→ **{top_cat_name}** 분야 계속 주목

---

_by Insightship AI · {week_label} · {total}건 분석_
"""
    
    return {
        "week_start": week_start,
        "week_end": week_end,
        "article_count": total,
        "top_categories": json.dumps(categories, ensure_ascii=False),
        "top_keywords": json.dumps(keywords[:15], ensure_ascii=False),
        "key_numbers": json.dumps(key_nums, ensure_ascii=False),
        "top_article_ids": json.dumps([a["id"] for a in top_articles], ensure_ascii=False),
        "summary_markdown": summary_md,
        "generated_at": datetime.now(KST).isoformat(),
        "ai_version": f"weekly-report-{VERSION}",
    }

# ── Supabase 테이블 생성 (없는 경우) ──────────────────────────
def ensure_weekly_reports_table():
    """weekly_reports 테이블이 없으면 생성 시도 (migration SQL)"""
    # Supabase REST API로는 DDL 불가 → 별도 migration 파일 사용
    migration_sql = """
-- weekly_reports 테이블 생성
CREATE TABLE IF NOT EXISTS public.weekly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    article_count INTEGER DEFAULT 0,
    top_categories JSONB,
    top_keywords JSONB,
    key_numbers JSONB,
    top_article_ids JSONB,
    summary_markdown TEXT,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    ai_version TEXT,
    UNIQUE(week_start)
);

-- RLS 설정
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Public read" ON public.weekly_reports FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Service write" ON public.weekly_reports FOR ALL USING (auth.role() = 'service_role');
"""
    sql_path = "/tmp/pacm-platform/supabase/migrations/20260419_weekly_reports.sql"
    os.makedirs(os.path.dirname(sql_path), exist_ok=True)
    with open(sql_path, "w") as f:
        f.write(migration_sql)
    print(f"Migration SQL 저장: {sql_path}")
    return migration_sql

# ── 메인 ─────────────────────────────────────────────────────
def main():
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else "generate"
    
    print(f"🗓️  Insightship 주간 보고서 생성기 v{VERSION}")
    print(f"모드: {mode}")
    
    cfg = get_cfg()
    if not cfg["url"] or not cfg["key"]:
        # SQL 파일만 생성
        ensure_weekly_reports_table()
        print("환경변수 없음 — migration SQL 파일만 생성했습니다.")
        return
    
    # 기간 설정
    now = datetime.now(KST)
    if mode == "backfill":
        # 최근 8주 소급 생성
        weeks_to_generate = []
        for i in range(8):
            end = now - timedelta(days=now.weekday() + 1 + i*7)  # 지난 일요일
            start = end - timedelta(days=6)
            weeks_to_generate.append((start, end))
    else:
        # 지난 주 (월~일)
        last_monday = now - timedelta(days=now.weekday() + 7)
        last_sunday = last_monday + timedelta(days=6)
        weeks_to_generate = [(last_monday, last_sunday)]
    
    for week_start, week_end in weeks_to_generate:
        ws = week_start.strftime("%Y-%m-%d")
        we = week_end.strftime("%Y-%m-%d")
        print(f"\n📅 처리 중: {ws} ~ {we}")
        
        # 해당 주 기사 수집 (week_end + 1일까지)
        days_back = (now.date() - week_start.date()).days + 1
        articles = fetch_week_articles(days=days_back)
        
        # 날짜 필터
        week_articles = [
            a for a in articles
            if ws <= (a.get("published_at") or "")[:10] <= we
        ]
        
        print(f"  수집된 기사: {len(week_articles)}건")
        
        if len(week_articles) < 3:
            print(f"  기사 수 부족 — 스킵")
            continue
        
        report = generate_report(week_articles, ws, we)
        if not report:
            continue
        
        # Supabase에 저장 (upsert)
        status = supabase_post("weekly_reports", report)
        if status in (200, 201):
            print(f"  ✅ 저장 완료 (status {status})")
        elif status == 409:
            # 이미 존재 — 업데이트
            status2 = supabase_patch("weekly_reports", f"week_start=eq.{ws}", {
                "summary_markdown": report["summary_markdown"],
                "article_count": report["article_count"],
                "top_categories": report["top_categories"],
                "top_keywords": report["top_keywords"],
                "key_numbers": report["key_numbers"],
                "top_article_ids": report["top_article_ids"],
                "generated_at": report["generated_at"],
                "ai_version": report["ai_version"],
            })
            print(f"  🔄 업데이트 완료 (status {status2})")
        else:
            print(f"  ❌ 저장 실패 (status {status})")
    
    # Migration SQL 항상 생성
    ensure_weekly_reports_table()
    print("\n✅ 주간 보고서 생성 완료")


if __name__ == "__main__":
    main()
