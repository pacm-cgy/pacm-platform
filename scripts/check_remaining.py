import urllib.request, json, os, sys

SB_URL = os.environ.get('SUPABASE_URL','')
SK = os.environ.get('SUPABASE_SERVICE_KEY','')
if not SB_URL or not SK:
    print(0)
    sys.exit(0)

H = {'apikey':SK,'Authorization':f'Bearer {SK}','Prefer':'count=exact'}
try:
    # null 요약
    req1 = urllib.request.Request(
        f"{SB_URL}/rest/v1/articles?select=count&ai_summary=is.null&status=eq.published&category=eq.news",
        headers=H
    )
    with urllib.request.urlopen(req1,timeout=10) as r:
        null_cnt = int(r.headers.get('Content-Range','0/0').split('/')[-1] or 0)

    # "(요약 생략)" 요약
    import urllib.parse
    req2 = urllib.request.Request(
        f"{SB_URL}/rest/v1/articles?select=count&ai_summary=eq.%28%EC%9A%94%EC%95%BD%20%EC%83%9D%EB%9E%B5%29&status=eq.published&category=eq.news",
        headers=H
    )
    with urllib.request.urlopen(req2,timeout=10) as r:
        skip_cnt = int(r.headers.get('Content-Range','0/0').split('/')[-1] or 0)

    print(null_cnt + skip_cnt)
except Exception as e:
    print(0)
