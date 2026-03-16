import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function PrivacyPage() {
  const navigate = useNavigate()
  return (
    <div style={{ paddingBottom: '80px' }}>
      <div style={{ borderBottom: '1px solid var(--c-gray-3)', padding: '14px 0' }}>
        <div className="container">
          <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: 'var(--c-muted)', fontSize: '13px', fontFamily: 'var(--f-mono)', cursor: 'pointer' }}>
            <ArrowLeft size={14} /> 돌아가기
          </button>
        </div>
      </div>
      <div className="container" style={{ maxWidth: '800px', margin: '0 auto', padding: '48px var(--pad-x)' }}>
        <div className="t-eyebrow" style={{ marginBottom: '8px' }}>LEGAL</div>
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,32px)', fontWeight: 700, marginBottom: '8px' }}>개인정보처리방침</h1>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)', marginBottom: '40px' }}>시행일: 2026년 1월 1일 | 버전: 1.0</div>

        <div style={{ background: 'var(--c-gray-2)', border: '1px solid var(--c-gold)', padding: '20px 24px', marginBottom: '40px' }}>
          <p style={{ fontFamily: 'var(--f-sans)', fontSize: '14px', color: 'var(--c-paper)', lineHeight: 1.8 }}>
            피에이씨엠(PACM)은 개인정보보호법 등 관련 법령을 준수하며, 이용자의 개인정보를 소중히 보호합니다.<br />
            문의: <a href="mailto:contact@pacm.kr" style={{ color: 'var(--c-gold)' }}>contact@pacm.kr</a>
          </p>
        </div>

        <div style={{ fontFamily: 'var(--f-sans)', fontSize: '15px', lineHeight: 1.9, color: 'var(--c-paper)' }}>
          {[
            { title: '1. 수집하는 개인정보 항목', content: `필수항목: 이메일 주소, 닉네임(표시명)\n선택항목: 학교명, 지역, 소개글, 프로필 이미지, 스타트업명\n자동수집: IP 주소, 쿠키, 서비스 이용 기록, 접속 로그` },
            { title: '2. 개인정보 수집 목적', content: `• 회원 가입 및 서비스 제공\n• 커뮤니티 기능 운영\n• 뉴스레터 발송 (동의한 경우)\n• 서비스 개선 및 통계 분석\n• 불법 이용 방지 및 보안` },
            { title: '3. 개인정보 보유 및 이용기간', content: `• 회원 탈퇴 시 즉시 삭제 (단, 법령에 따라 보존 필요한 경우 제외)\n• 뉴스레터 구독 해지 시 이메일 즉시 삭제\n• 전자상거래법 관련 기록: 5년\n• 접속 로그: 3개월` },
            { title: '4. 개인정보 제3자 제공', content: `원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 단, 법령의 규정에 의거하거나 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우는 예외입니다.` },
            { title: '5. 쿠키 사용', content: `서비스는 이용자에게 개인화된 서비스를 제공하기 위해 쿠키를 사용합니다. 브라우저 설정을 통해 쿠키 수집을 거부할 수 있으나, 이 경우 서비스 일부가 정상적으로 작동하지 않을 수 있습니다.` },
            { title: '6. AI 서비스 관련 개인정보', content: `• 뉴스 요약, 콘텐츠 생성 등 AI 기능 이용 시 입력된 내용이 AI 처리에 활용됩니다.\n• AI 처리 과정에서 개인 식별 정보는 분리 처리됩니다.\n• AI 생성 결과물은 서비스 개선에 활용될 수 있습니다.` },
            { title: '7. 이용자의 권리', content: `이용자는 언제든지 다음 권리를 행사할 수 있습니다:\n• 개인정보 열람 요청\n• 오류 정정 요청\n• 삭제 요청 (탈퇴)\n• 처리 정지 요청\n요청: contact@pacm.kr` },
            { title: '8. 개인정보 보호 책임자', content: `운영사: 피에이씨엠(PACM)\n사업자등록번호: 891-45-01385\n문의: contact@pacm.kr` },
          ].map((section, i) => (
            <div key={i} style={{ marginBottom: '36px' }}>
              <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: '17px', fontWeight: 700, color: 'var(--c-paper)', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--c-gray-3)' }}>
                {section.title}
              </h2>
              <p style={{ color: 'var(--c-muted)', whiteSpace: 'pre-line', fontSize: '14px', lineHeight: 1.9 }}>
                {section.content}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
