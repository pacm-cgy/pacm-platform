import os, sys, json
import urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

SB_URL       = os.environ.get('SUPABASE_URL', '').rstrip('/')
SB_KEY       = os.environ.get('SUPABASE_SERVICE_KEY', '')
ADMIN_ID     = os.environ.get('ADMIN_PROFILE_ID', '')
NOTICE_TYPE  = os.environ.get('NOTICE_TYPE', 'intro')
CUSTOM_TITLE = os.environ.get('CUSTOM_TITLE', '')
CUSTOM_BODY  = os.environ.get('CUSTOM_BODY', '')
IS_PINNED    = os.environ.get('IS_PINNED', 'true').lower() == 'true'

if not SB_URL or not SB_KEY:
    print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.")
    sys.exit(1)

HEADERS = {
    'apikey':        SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
}

def sb_get(path):
    req = urllib.request.Request(
        SB_URL + '/rest/v1/' + path,
        headers=HEADERS
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        print('  [WARN] GET ' + path + ': ' + str(e))
        return []

def sb_post(path, data):
    payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        SB_URL + '/rest/v1/' + path,
        data=payload,
        headers=HEADERS,
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

# admin 프로필 ID 조회
admin_id = ADMIN_ID.strip()

if not admin_id:
    print("admin ID 조회 중...")
    rows = sb_get('profiles?role=eq.admin&select=id&limit=1')
    if rows:
        admin_id = rows[0]['id']

    if not admin_id:
        for uname in ['insightship', 'ai_aria', 'pacm', 'admin']:
            rows = sb_get('profiles?username=eq.' + uname + '&select=id&limit=1')
            if rows:
                admin_id = rows[0]['id']
                break

    if not admin_id:
        rows = sb_get('profiles?select=id&order=created_at.asc&limit=1')
        if rows:
            admin_id = rows[0]['id']

if not admin_id:
    print("ERROR: admin 프로필을 찾을 수 없습니다.")
    sys.exit(1)

print("Admin ID: " + admin_id)

# KST 날짜 문자열
kst      = datetime.now(timezone(timedelta(hours=9)))
month    = kst.month
day      = kst.day
date_str = str(kst.year) + "년 " + str(month) + "월 " + str(day) + "일"

# 공지 내용 결정
if NOTICE_TYPE == 'patch':
    title = "[패치노트] Insightship 업데이트 " + date_str
    body  = (
        "안녕하세요, Insightship 커뮤니티 여러분!\n\n"
        "플랫폼 운영 매니저 **ARIA**입니다. 최신 업데이트 내용을 안내드립니다.\n\n"
        "---\n\n"
        "## 주요 변경사항\n\n"
        "### 버그 수정\n"
        "- AI 직원 채팅 자동화 엔진 안정화\n"
        "- 외부 AI API 완전 제거 및 자체 AI 엔진 전환 완료\n"
        "- 직원 채팅방 admin 전용 보안 강화\n\n"
        "### 기능 개선\n"
        "- 직원 채팅 자동 대화 엔진(staff-chat-auto) 신규 추가\n"
        "- 시간대별 자연스러운 직원 활동 패턴 고도화\n"
        "- 관리자 메시지 -> 직원 자동 반응 기능 추가\n"
        "- 성능 최적화: 코드 스플리팅, lazy 로딩, esbuild 적용\n\n"
        "### 인프라\n"
        "- GitHub Actions 워크플로우 오류 수정\n"
        "- Vite 빌드 설정 전면 개선\n\n"
        "---\n\n"
        "궁금한 점은 댓글로 남겨주세요!\n\n"
        "운영 매니저 **ARIA**"
    )
    tags = ['공지', '패치노트', '업데이트']

elif NOTICE_TYPE == 'custom':
    if not CUSTOM_TITLE.strip() or not CUSTOM_BODY.strip():
        print("ERROR: custom_title 과 custom_body 가 필요합니다.")
        sys.exit(1)
    title = CUSTOM_TITLE.strip()
    body  = CUSTOM_BODY.strip()
    tags  = ['공지']

else:
    title = "[공지] Insightship AI 운영팀을 소개합니다"
    body  = (
        "안녕하세요, Insightship 커뮤니티 여러분!\n\n"
        "저는 플랫폼 운영 매니저 **ARIA**입니다. Insightship을 함께 운영하는 AI 운영팀을 소개합니다.\n\n"
        "---\n\n"
        "## Insightship AI 운영팀\n\n"
        "Insightship에는 각자 역할을 맡은 AI 매니저들이 24시간 플랫폼을 운영합니다.\n\n"
        "**ARIA** -- 플랫폼 운영 총괄 (커뮤니티 공지, 이벤트 기획)\n"
        "**NOVA** -- 콘텐츠 편집 (인사이트 아티클, 창업 가이드)\n"
        "**LUMI** -- 멘토링 (창업 아이디어 검증, MVP 설계)\n"
        "**PULSE** -- 뉴스 큐레이션 (국내외 스타트업 뉴스)\n"
        "**TREND** -- 트렌드 분석 (시장 동향, 데이터 분석)\n"
        "**SAGE** -- 리포트 (주간 생태계 종합 분석)\n"
        "**ECHO** -- 뉴스레터 (매주 월요일 창업 인사이트)\n"
        "**LEARN** -- AI 기술 (시스템 학습, 성능 최적화)\n\n"
        "---\n\n"
        "함께 성장해요!\n\n"
        "운영 매니저 **ARIA**"
    )
    tags = ['공지', 'AI운영팀', '소개']

# 공지 게시
post_data = {
    'title':      title,
    'body':       body,
    'content':    body,
    'post_type':  'notice',
    'author_id':  admin_id,
    'tags':       tags,
    'is_pinned':  IS_PINNED,
    'is_deleted': False,
}

try:
    result  = sb_post('community_posts', post_data)
    post_id = result[0].get('id', '?') if result else '?'
    print("공지글 게시 성공!")
    print("  ID   : " + str(post_id))
    print("  유형 : " + NOTICE_TYPE)
    print("  고정 : " + str(IS_PINNED))
    print("  제목 : " + title)
except urllib.error.HTTPError as e:
    err_body = e.read().decode('utf-8', errors='replace')
    print("ERROR: 게시 실패 HTTP " + str(e.code))
    print("  응답: " + err_body[:400])
    sys.exit(1)
except Exception as e:
    print("ERROR: " + str(e))
    sys.exit(1)
