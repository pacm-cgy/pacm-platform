import { useNavigate } from 'react-router-dom'
import { Rocket, Home, ArrowLeft, Search } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight: '70vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      padding: '60px 24px',
    }}>
      {/* Decorative number */}
      <div style={{
        fontFamily: 'var(--f-mono)', fontSize: 'clamp(80px,15vw,140px)',
        fontWeight: 700, lineHeight: 1,
        background: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(59,130,246,0.05))',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        marginBottom: 16, userSelect: 'none',
      }}>
        404
      </div>

      <div style={{
        fontFamily: 'var(--f-display)', fontSize: 'clamp(18px,3vw,24px)',
        fontWeight: 700, color: 'var(--t1)', marginBottom: 10,
      }}>
        페이지를 찾을 수 없습니다
      </div>

      <p style={{
        color: 'var(--t3)', fontSize: 14, lineHeight: 1.7,
        maxWidth: 360, marginBottom: 36,
      }}>
        요청하신 페이지가 존재하지 않거나 이동되었습니다.<br />
        홈으로 돌아가거나 인사이트를 탐색해보세요.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={() => navigate(-1)} className="btn btn-ghost">
          <ArrowLeft size={14} /> 이전 페이지
        </button>
        <Link to="/" className="btn btn-primary">
          <Home size={14} /> 홈으로
        </Link>
        <Link to="/insight" className="btn btn-ghost">
          인사이트 보기
        </Link>
      </div>

      {/* Floating rocket decoration */}
      <div style={{
        marginTop: 60, width: 60, height: 60, borderRadius: 16,
        background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'float 3s ease-in-out infinite',
      }}>
        <Rocket size={24} color="rgba(59,130,246,0.5)" />
      </div>

      <style>{`
        @keyframes float {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  )
}
