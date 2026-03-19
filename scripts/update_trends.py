"""트렌드 업데이트 API 호출 - 뉴스 수집 후 실행"""
import urllib.request, json, os, sys

SITE = os.environ.get('SITE_URL', 'https://www.insightship.pacm.kr')
SECRET = os.environ.get('CRON_SECRET', '')

req = urllib.request.Request(
    f'{SITE}/api/extract-news-trends',
    data=b'{}',
    headers={'Authorization': f'Bearer {SECRET}', 'Content-Type': 'application/json'},
    method='POST'
)
try:
    with urllib.request.urlopen(req, timeout=25) as r:
        d = json.loads(r.read())
        print(f"트렌드 업데이트: {d.get('categories_updated',0)}개 카테고리 저장")
        insight = d.get('ai_insight', {})
        if insight:
            print(f"AI인사이트: {insight.get('summary','없음')} ({insight.get('market_mood','unknown')})")
        if d.get('errors'):
            print(f"오류: {d['errors']}")
except Exception as e:
    print(f"트렌드 업데이트 실패: {e}", file=sys.stderr)
    sys.exit(0)  # 실패해도 워크플로우 중단 안함
