/**
 * src/components/FeedbackPopup.jsx
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  피드백 유도 팝업 — 모든 유저에게 표시 (관리자 제외 또는 포함)      ║
 * ║  - 로그인 유저에게 일정 시간 후 표시                                ║
 * ║  - 커뮤니티 피드백 게시물 작성 유도                                 ║
 * ║  - 하루 1회만 표시 (localStorage)                                   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'

const DISMISS_KEY  = 'insightship_feedback_dismiss'
const SHOW_DELAY   = 30000 // 30초 후 표시

export default function FeedbackPopup() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [hiding,  setHiding]  = useState(false)

  useEffect(() => {
    // 비로그인 유저는 표시하지 않음
    if (!user) return

    // 오늘 이미 닫은 경우 표시하지 않음
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (dismissed) {
      const dismissedDate = new Date(dismissed).toDateString()
      const today = new Date().toDateString()
      if (dismissedDate === today) return
    }

    const timer = setTimeout(() => setVisible(true), SHOW_DELAY)
    return () => clearTimeout(timer)
  }, [user])

  const dismiss = (permanent = false) => {
    setHiding(true)
    localStorage.setItem(DISMISS_KEY, new Date().toISOString())
    setTimeout(() => setVisible(false), 300)
  }

  const goFeedback = () => {
    dismiss()
    navigate('/community?write=feedback')
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: 24, zIndex: 9990,
      width: 320, background: 'linear-gradient(135deg,#0d1117,#1a1a2e)',
      border: '1px solid rgba(96,165,250,0.35)',
      borderRadius: 16, padding: 20,
      boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(96,165,250,0.1)',
      opacity: hiding ? 0 : 1,
      transform: hiding ? 'translateY(10px)' : 'translateY(0)',
      transition: 'opacity .3s, transform .3s',
      fontFamily: 'Pretendard,sans-serif',
    }}>
      {/* 닫기 */}
      <button onClick={() => dismiss()}
        style={{
          position: 'absolute', top: 10, right: 12,
          background: 'none', border: 'none', color: '#555',
          cursor: 'pointer', fontSize: 16, lineHeight: 1,
        }}>✕</button>

      {/* 배지 */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)',
        borderRadius: 20, padding: '3px 10px', marginBottom: 12,
      }}>
        <span style={{ width: 6, height: 6, background: '#3B82F6', borderRadius: '50%',
          boxShadow: '0 0 6px #3B82F6', animation: 'fbpulse 1.5s ease-in-out infinite' }} />
        <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#60A5FA', letterSpacing: '2px', fontWeight: 700 }}>
          BETA • 개발 중
        </span>
      </div>

      <div style={{ fontSize: 20, marginBottom: 8 }}>💬</div>

      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F0F0F0', marginBottom: 8, lineHeight: 1.4 }}>
        Insightship, 함께 만들어가요!
      </h3>

      <p style={{ fontSize: 12, color: '#888', lineHeight: 1.6, marginBottom: 16 }}>
        현재 열심히 개발 & 테스트 중입니다.<br />
        사용하면서 느낀 점, 개선 아이디어, 불편한 점<br />
        무엇이든 피드백 주시면 바로 반영할게요 🙏
      </p>

      {/* 팀 응답 예시 */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', borderRadius: 10,
        padding: '10px 12px', marginBottom: 14,
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ fontSize: 11, color: '#555', fontFamily: 'monospace', letterSpacing: '1px', marginBottom: 8 }}>
          TEAM RESPONSE
        </div>
        {[
          { emoji: '⚙️', name: 'ARIA', team: '운영팀', msg: '소중한 피드백 확인하고 있어요!' },
          { emoji: '🏛️', name: 'MAX',  team: '관리팀', msg: '개선 사항 바로 팀에 공유합니다.' },
        ].map(m => (
          <div key={m.name} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 13 }}>{m.emoji}</span>
            <span style={{ fontSize: 11, color: '#60A5FA', fontWeight: 600 }}>{m.name}</span>
            <span style={{ fontSize: 10, color: '#444' }}>{m.team}</span>
            <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>{m.msg}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={goFeedback}
          style={{
            flex: 1, background: 'linear-gradient(135deg,#3B82F6,#818CF8)',
            border: 'none', borderRadius: 8, padding: '9px 0',
            color: '#fff', fontWeight: 700, fontSize: 12,
            cursor: 'pointer', letterSpacing: '0.5px',
          }}>
          피드백 작성하기 →
        </button>
        <button onClick={() => dismiss()}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
            padding: '9px 12px', color: '#666', fontSize: 11,
            cursor: 'pointer',
          }}>
          나중에
        </button>
      </div>

      <style>{`
        @keyframes fbpulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
