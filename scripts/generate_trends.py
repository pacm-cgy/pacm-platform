"""
Insightship 트렌드 트래커 생성기
PACM 자체 개발 | 외부 API 0%
매주 월요일 실행 → 키워드 트렌드 분석 → trends 테이블 저장
"""
import os, json, time, urllib.request, re
from collections import Counter
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
VERSION = "1.0.0"

STOPWORDS = {
    "이","그","저","것","수","들","및","등","에서","로서","으로","에게",
    "하지만","그러나","또한","그리고","따라서","때문에","위해","통해","대한",
    "있는","없는","되는","하는","있다","없다","된다","한다","이다","있으며",
    "이번","지난","올해","최근","현재","지금","특히","또","더","가장","매우",
    "기자","보도","발표","밝혔다","말했다","전했다","합니다","입니다","통해",
    "nbsp","amp","아","을","를","이","가","은","는","에","의","도","와","과",
    "사","회사","기업","서비스","사업","부분","경우","관련","위한","대한",
}

CATEGORY_KW = {
    "AI·테크": ["AI","인공지능","LLM","챗봇","딥러닝","GPU","반도체","클라우드","로봇","자율주행"],
    "투자·금융": ["투자","펀딩","시리즈","억원","VC","IPO","상장","엑싯","밸류에이션","유니콘"],
    "창업·스타트업": ["스타트업","창업","피봇","MVP","액셀러레이터","데모데이","린스타트업"],
    "정책·지원": ["정부","과기부","중기부","지원금","공모","예산","정책","규제","창진원"],
    "글로벌": ["글로벌","해외","진출","미국","동남아","베트남","싱가포르","유럽","일본"],
    "ESG·기후": ["ESG","탄소중립","친환경","지속가능","기후","그린","임팩트","소셜"],
    "핀테크": ["핀테크","결제","송금","금융","블록체인","암호화폐","토큰","뱅킹"],
    "에듀테크": ["에듀테크","교육","학습","튜터","코딩","강의","커리큘럼"],
    "헬스케어": ["헬스케어","바이오","의료","신약","임상","디지털헬스","의료기기"],
    "식품·F&B": ["식품","K푸드","푸드테크","외식","농업","음식","요식업","배달"],
}

def get_cfg():
    return {
        "url": os.environ.get("SUPABASE_URL", ""),
        "key": os.environ.get("SUPABASE_SERVICE_KEY", os.environ.get("SUPABASE_ANON_KEY", "")),
    }

def fetch_articles(days: int, offset_days: int = 0) -> list:
    cfg = get_cfg()
    if not cfg["url"] or not cfg["key"]:
        return []
    now = datetime.now(KST)
    end = now - timedelta(days=offset_days)
    start = end - timedelta(days=days)
    url = (f"{cfg['url']}/rest/v1/articles"
           f"?select=id,title,body,excerpt,ai_category,published_at"
           f"&status=eq.published"
           f"&published_at=gte.{start.strftime('%Y-%m-%dT00:00:00')}"
           f"&published_at=lte.{end.strftime('%Y-%m-%dT23:59:59')}"
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

def supabase_upsert(table: str, data: dict, conflict_col: str) -> int:
    cfg = get_cfg()
    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{cfg['url']}/rest/v1/{table}",
        data=payload,
        headers={
            "apikey": cfg["key"],
            "Authorization": f"Bearer {cfg['key']}",
            "Content-Type": "application/json",
            "Prefer": f"resolution=merge-duplicates,return=minimal",
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"upsert 오류 {e.code}: {body[:300]}")
        return e.code

def extract_keywords(articles: list, n: int = 50) -> list:
    """기사 목록에서 상위 키워드 추출"""
    word_cat = {}  # word -> 카테고리
    
    # 카테고리 키워드 우선 집계
    for cat, kws in CATEGORY_KW.items():
        for kw in kws:
            word_cat[kw] = cat
    
    all_text = " ".join(
        f"{a.get('title','')} {a.get('excerpt','')}"
        for a in articles
    )
    
    words = re.findall(r'[가-힣A-Za-z0-9]{2,10}', all_text)
    filtered = [w for w in words if w not in STOPWORDS and not w.isdigit() and len(w) >= 2]
    counter = Counter(filtered)
    
    result = []
    for word, count in counter.most_common(n):
        cat = word_cat.get(word, "기타")
        # 카테고리 찾기
        if cat == "기타":
            for c, kws in CATEGORY_KW.items():
                if word in kws:
                    cat = c
                    break
        result.append({"word": word, "count": count, "category": cat})
    
    return result

def calc_change(current: list, previous: list) -> tuple:
    """전주 대비 상승/하락 키워드 계산"""
    cur_dict = {k["word"]: k["count"] for k in current}
    prev_dict = {k["word"]: k["count"] for k in previous}
    
    rising = []
    declining = []
    
    all_words = set(list(cur_dict.keys())[:30]) | set(list(prev_dict.keys())[:30])
    
    for word in all_words:
        cur = cur_dict.get(word, 0)
        prev = prev_dict.get(word, 0)
        
        if prev == 0 and cur > 2:
            rising.append({"word": word, "change": "신규", "count": cur})
        elif prev > 0 and cur > prev * 1.5 and cur > 2:
            pct = round((cur - prev) / prev * 100)
            rising.append({"word": word, "change": f"+{pct}%", "count": cur})
        elif cur > 0 and prev > cur * 1.5 and prev > 2:
            pct = round((prev - cur) / prev * 100)
            declining.append({"word": word, "change": f"-{pct}%", "count": cur})
    
    rising.sort(key=lambda x: x["count"], reverse=True)
    declining.sort(key=lambda x: x["count"], reverse=False)
    
    return rising[:10], declining[:10]

def find_hot_topics(articles: list, keywords: list, n: int = 10) -> list:
    """핫 토픽 선정"""
    top_kws = {k["word"] for k in keywords[:20]}
    
    scored = []
    for a in articles:
        text = f"{a.get('title','')} {a.get('excerpt','')}"
        score = sum(1 for kw in top_kws if kw in text)
        if score > 0:
            scored.append({
                "title": a.get("title", ""),
                "article_id": a.get("id"),
                "category": a.get("ai_category", "startup"),
                "score": score,
                "date": (a.get("published_at") or "")[:10],
            })
    
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:n]

def analyze_categories(articles: list) -> dict:
    cats = Counter(a.get("ai_category") or "startup" for a in articles)
    return dict(cats.most_common())

def main():
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else "generate"
    print(f"📊 Insightship 트렌드 트래커 v{VERSION}")
    print(f"모드: {mode}")
    
    cfg = get_cfg()
    if not cfg["url"] or not cfg["key"]:
        print("⚠️  환경변수 없음 — 테스트 모드")
        return
    
    now = datetime.now(KST)
    
    if mode == "backfill":
        weeks = list(range(0, 8))  # 8주 소급
    else:
        weeks = [0]  # 이번 주만
    
    for week_offset in weeks:
        # 이번 주
        offset_days = week_offset * 7
        cur_articles = fetch_articles(7, offset_days)
        prev_articles = fetch_articles(7, offset_days + 7)
        
        period_end = now - timedelta(days=offset_days)
        period_start = period_end - timedelta(days=6)
        
        ps = period_start.strftime("%Y-%m-%d")
        pe = period_end.strftime("%Y-%m-%d")
        
        print(f"\n📅 {ps} ~ {pe}: {len(cur_articles)}건")
        
        if len(cur_articles) < 3:
            print("  기사 수 부족 — 스킵")
            continue
        
        cur_keywords = extract_keywords(cur_articles, 50)
        prev_keywords = extract_keywords(prev_articles, 50) if prev_articles else []
        rising, declining = calc_change(cur_keywords, prev_keywords)
        hot_topics = find_hot_topics(cur_articles, cur_keywords, 10)
        categories = analyze_categories(cur_articles)
        
        data = {
            "period_start": ps,
            "period_end": pe,
            "period_type": "weekly",
            "keywords": json.dumps(cur_keywords[:30], ensure_ascii=False),
            "categories": json.dumps(categories, ensure_ascii=False),
            "hot_topics": json.dumps(hot_topics, ensure_ascii=False),
            "rising_keywords": json.dumps(rising, ensure_ascii=False),
            "declining_keywords": json.dumps(declining, ensure_ascii=False),
            "total_articles": len(cur_articles),
            "generated_at": now.isoformat(),
            "ai_version": f"trend-tracker-{VERSION}",
        }
        
        status = supabase_upsert("trends", data, "period_start")
        if status in (200, 201):
            print(f"  ✅ 저장 완료")
            print(f"  상승 키워드: {[r['word'] for r in rising[:5]]}")
        else:
            print(f"  ❌ 저장 실패 (status {status})")
    
    print("\n✅ 트렌드 트래커 완료")

if __name__ == "__main__":
    main()
