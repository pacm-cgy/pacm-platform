import urllib.request, os
try:
    req = urllib.request.Request(
        os.environ['SUPABASE_URL']+'/rest/v1/articles?status=eq.published&category=eq.news&ai_summary=is.null&select=id&limit=1',
        headers={'apikey':os.environ['SUPABASE_SERVICE_KEY'],'Authorization':'Bearer '+os.environ['SUPABASE_SERVICE_KEY'],'Prefer':'count=exact'}
    )
    with urllib.request.urlopen(req, timeout=8) as r:
        print(r.headers.get('Content-Range','*/0').split('/')[-1])
except:
    print('0')
