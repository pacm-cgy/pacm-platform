"""
Nova — PACM Insightship 콘텐츠 에디터 AI
매월 1일 실행: edu_contents 테이블에 새 학습 콘텐츠 추가
- Groq/Gemini API를 활용해 창업 교육 콘텐츠 생성
- 실제 검증된 개념과 공개된 사실 기반으로만 작성
- 지어낸 사례나 수치는 포함하지 않음
"""
import os, json, time, urllib.request

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY  = os.environ['SUPABASE_SERVICE_KEY']
GROQ_KEY     = os.environ.get('GROQ_API_KEY', '')
GEMINI_KEY   = os.environ.get('GEMINI_API_KEY', '')

H = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json'
}

# 매월 생성할 콘텐츠 토픽 (순환)
MONTHLY_TOPICS = [
    {'title': '창업 용어 사전 — 알아야 할 필수 비즈니스 용어 20선',
     'category': 'startup_basics', 'level': 'beginner',
     'prompt': '창업·스타트업·VC 분야에서 실제로 사용되는 핵심 용어 20개를 정리하세요. 각 용어의 정확한 정의와 실제 쓰임새를 설명하세요. 지어낸 사례 없이, 업계에서 공인된 정의만 사용하세요. 700-900자.'},
    {'title': '비즈니스 모델 유형별 완전 정리',
     'category': 'startup_basics', 'level': 'beginner',
     'prompt': 'SaaS, 마켓플레이스, 구독, 프리미엄, D2C 등 주요 비즈니스 모델 유형을 설명하세요. 각 모델의 수익 구조와 특성을 정확하게 설명하세요. 700-900자.'},
    {'title': '주식과 지분 — 창업팀이 알아야 할 기초',
     'category': 'investment', 'level': 'beginner',
     'prompt': '주식, 지분, 베스팅, 스톡옵션, 희석 등 창업팀이 반드시 알아야 할 지분 관련 개념을 정확하게 설명하세요. 법적 정의와 실무적 의미를 함께 설명하세요. 700-900자.'},
    {'title': '마케팅 깔때기(Funnel)의 이해',
     'category': 'marketing', 'level': 'beginner',
     'prompt': 'TOFU-MOFU-BOFU, AIDA, AARRR 등 마케팅 깔때기 모델을 설명하세요. 각 단계의 의미와 측정 방법을 정확하게 설명하세요. 700-900자.'},
    {'title': '특허와 지식재산권 — 스타트업이 알아야 할 것들',
     'category': 'startup_basics', 'level': 'intermediate',
     'prompt': '특허, 상표권, 저작권, 영업비밀 등 스타트업이 알아야 할 지식재산권의 종류와 기본 개념을 설명하세요. 정확한 법적 개념을 사용하세요. 700-900자.'},
]

SYSTEM = """당신은 Insightship 창업 교육 콘텐츠 에디터입니다.
반드시 지켜야 할 규칙:
- 공개된 사실, 검증된 이론, 업계에서 인정된 개념만 사용하세요
- 특정 인물이나 기업의 미검증 수치, 지어낸 사례는 절대 포함하지 마세요
- 불확실한 내용은 포함하지 말고, 확실한 내용만 쓰세요
- ~입니다/~됩니다 경어체, 마크다운 없이 순수 텍스트
- 분량: 700-900자 이내"""

def call_groq(prompt):
    if not GROQ_KEY:
        return None
    try:
        data = json.dumps({
            'model': 'llama-3.3-70b-versatile',
            'messages': [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': prompt}],
            'max_tokens': 700, 'temperature': 0.3
        }).encode()
        req = urllib.request.Request(
            'https://api.groq.com/openai/v1/chat/completions',
            data=data,
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {GROQ_KEY}'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())['choices'][0]['message']['content'].strip()
    except Exception as e:
        print(f'Groq 오류: {e}')
        return None

def call_gemini(prompt):
    if not GEMINI_KEY:
        return None
    try:
        data = json.dumps({
            'system_instruction': {'parts': [{'text': SYSTEM}]},
            'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
            'generationConfig': {'maxOutputTokens': 700, 'temperature': 0.3}
        }).encode()
        req = urllib.request.Request(
            f'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_KEY}',
            data=data, headers={'Content-Type': 'application/json'}, method='POST'
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())['candidates'][0]['content']['parts'][0]['text'].strip()
    except Exception as e:
        print(f'Gemini 오류: {e}')
        return None

def generate(prompt):
    result = call_groq(prompt)
    if result and len(result) > 100:
        return result
    return call_gemini(prompt)

def already_exists(title):
    url = f"{SUPABASE_URL}/rest/v1/edu_contents?title=eq.{urllib.parse.quote(title)}&select=id"
    req = urllib.request.Request(url, headers=H)
    with urllib.request.urlopen(req) as r:
        return len(json.loads(r.read())) > 0

import urllib.parse
from datetime import datetime

def main():
    month_idx = datetime.now().month % len(MONTHLY_TOPICS)
    topic = MONTHLY_TOPICS[month_idx]

    print(f'Nova 콘텐츠 생성 시작: {topic["title"]}')

    if already_exists(topic['title']):
        print('이미 존재하는 콘텐츠, 건너뜀')
        return

    content = generate(topic['prompt'])
    if not content:
        print('콘텐츠 생성 실패')
        return

    row = {
        'title': topic['title'],
        'category': topic['category'],
        'level': topic['level'],
        'content': content,
        'summary': content[:150] + '...',
        'tags': ['창업교육', '기초'],
        'read_time': max(3, len(content) // 400),
        'is_published': True,
        'is_featured': False
    }

    data = json.dumps(row).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/edu_contents',
        data=data,
        headers={**H, 'Prefer': 'return=minimal'},
        method='POST'
    )
    with urllib.request.urlopen(req) as r:
        if r.status in (200, 201):
            print(f'✅ Nova 콘텐츠 저장 완료: {topic["title"]}')
        else:
            print(f'❌ 저장 실패: {r.status}')

if __name__ == '__main__':
    main()
