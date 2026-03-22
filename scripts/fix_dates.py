"""
잘못된 날짜(연도)의 뉴스 수정
- 현재 연도(2026) 기준 1년 이상 차이나는 뉴스의 published_at 교정
- "3월 5일" 같은 날짜가 2020, 2021 등 오래된 연도로 저장된 경우 2026년으로 수정
"""
import urllib.request, json, os
from datetime import datetime, timezone, timedelta

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY  = os.environ['SUPABASE_SERVICE_KEY']
H = {'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}', 'Content-Type': 'application/json'}

def supa_get(path):
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1{path}', headers=H)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read()), dict(r.headers)

def supa_patch(article_id, new_date):
    url = f'{SUPABASE_URL}/rest/v1/articles?id=eq.{article_id}'
    data = json.dumps({'published_at': new_date}).encode()
    req = urllib.request.Request(url, data=data, headers={**H, 'Prefer': 'return=minimal'}, method='PATCH')
    with urllib.request.urlopen(req, timeout=8) as r:
        return r.status

NOW = datetime.now(timezone.utc)
CURRENT_YEAR = NOW.year  # 2026
fixed = 0
checked = 0

# 2026년 이전 날짜 뉴스 조회 (최대 1000개)
for offset in range(0, 5000, 200):
    data, hdrs = supa_get(
        f'/articles?status=eq.published&category=eq.news'
        f'&published_at=lt.{CURRENT_YEAR}-01-01T00:00:00Z'
        f'&select=id,published_at,title&order=published_at.desc&limit=200&offset={offset}'
    )
    if not data:
        break
    
    for a in data:
        checked += 1
        try:
            orig_dt = datetime.fromisoformat(a['published_at'].replace('Z', '+00:00'))
            # 월/일은 유지하고 연도만 현재 연도로 교체
            corrected = orig_dt.replace(year=CURRENT_YEAR)
            # 교정된 날짜가 미래이면 작년으로
            if corrected > NOW + timedelta(days=1):
                corrected = corrected.replace(year=CURRENT_YEAR - 1)
            new_iso = corrected.isoformat()
            supa_patch(a['id'], new_iso)
            fixed += 1
            if fixed <= 3:
                print(f"  수정: {a['published_at'][:10]} → {new_iso[:10]} | {a['title'][:40]}")
        except Exception as e:
            print(f"  오류: {a['id']}: {e}")

print(f"\n완료: {checked}개 확인, {fixed}개 날짜 교정")
