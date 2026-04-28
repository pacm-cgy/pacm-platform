import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store'
import {
  Rocket, Eye, EyeOff, ArrowRight, Mail, Lock,
  User, CheckCircle, AlertCircle, Sparkles, Zap,
  BrainCircuit, Globe, TrendingUp, Users
} from 'lucide-react'

const FEATURES = [
  { icon: Zap,          color: '#3B82F6', label: 'AI 인사이트',  desc: '매일 새로운 스타트업 분석' },
  { icon: BrainCircuit, color: '#A855F7', label: 'AI 멘토',     desc: '24시간 창업 멘토링' },
  { icon: TrendingUp,   color: '#F59E0B', label: '트렌드 분석', desc: '실시간 시장 동향 파악' },
  { icon: Users,        color: '#22C55E', label: '커뮤니티',    desc: '청소년 창업가 네트워크' },
]

export default function LoginPage() {
  const navigate   = useNavigate()
  const location   = useLocation()
  const { initialize } = useAuthStore()

  const isSignUp = location.pathname === '/signup'
  const [mode, setMode] = useState(isSignUp ? 'signup' : 'login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const from = location.state?.from || '/'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        await initialize()
        navigate(from, { replace: true })
      } else {
        if (!displayName.trim()) throw new Error('이름(닉네임)을 입력해주세요.')
        if (password.length < 6) throw new Error('비밀번호는 6자 이상이어야 합니다.')
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: displayName.trim() } },
        })
        if (error) throw error
        if (data?.user && !data.session) {
          setSuccess('가입 확인 이메일을 보냈습니다. 이메일을 확인해 주세요.')
        } else {
          await initialize()
          navigate(from, { replace: true })
        }
      }
    } catch (err) {
      const msg = err.message || '오류가 발생했습니다.'
      if (msg.includes('Invalid login credentials')) setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      else if (msg.includes('User already registered')) setError('이미 가입된 이메일입니다.')
      else if (msg.includes('Password should be at least')) setError('비밀번호는 6자 이상이어야 합니다.')
      else setError(msg)
    } finally { setLoading(false) }
  }

  const handleGoogle = async () => {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + from },
    })
    if (error) setError(error.message)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', background: 'var(--bg0)',
      fontFamily: 'var(--f-sans)',
    }}>
      {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
      <div style={{
        flex: '0 0 52%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '60px 64px',
        background: 'linear-gradient(145deg,#050d1f 0%,#080f1e 60%,#050810 100%)',
        borderRight: '1px solid var(--b1)', position: 'relative', overflow: 'hidden',
      }} className="hide-mobile">

        {/* BG ambient glows */}
        <div style={{ position: 'absolute', top: -120, left: -80, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle,rgba(59,130,246,0.12),transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -80, right: -40, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle,rgba(168,85,247,0.1),transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '40%', right: -60, width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle,rgba(34,197,94,0.06),transparent 70%)', pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 52 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(59,130,246,0.45)',
          }}>
            <Rocket size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--f-sans)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.04em', color: '#F0F0F0', lineHeight: 1.1 }}>
              INSIGHT<span style={{ color: '#3B82F6' }}>SHIP</span>
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: '#444', letterSpacing: '0.12em' }}>by PACM</div>
          </div>
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: 'var(--f-display)', fontSize: 'clamp(28px,3.5vw,42px)',
          fontWeight: 900, color: '#F0F0F0', lineHeight: 1.2, marginBottom: 16,
          letterSpacing: '-0.02em',
        }}>
          청소년 창업가를 위한<br />
          <span style={{ color: '#3B82F6' }}>올인원 플랫폼</span>
        </h1>
        <p style={{ color: '#777', fontSize: 15, lineHeight: 1.8, maxWidth: 380, marginBottom: 44 }}>
          AI 인사이트, 트렌드 분석, 멘토링까지<br />창업의 모든 여정을 Insightship과 함께하세요.
        </p>

        {/* Feature list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {FEATURES.map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: `${f.color}14`, border: `1px solid ${f.color}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <f.icon size={16} color={f.color} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#D0D0D0' }}>{f.label}</div>
                <div style={{ fontSize: 12, color: '#555' }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom stat */}
        <div style={{ marginTop: 52, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#333', letterSpacing: '0.1em' }}>
            INSIGHTSHIP · PACM 운영 · 완전 무료
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — form ──────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 32px', background: 'var(--bg0)',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {/* Mobile logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' }} className="show-mobile-only">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 12px rgba(59,130,246,0.4)' }}>
              <Rocket size={16} color="#fff" />
            </div>
            <div style={{ fontFamily: 'var(--f-sans)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.04em', color: 'var(--t1)' }}>
              INSIGHT<span style={{ color: '#3B82F6' }}>SHIP</span>
            </div>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'var(--bg2)', padding: 4, borderRadius: 10, border: '1px solid var(--b1)', marginBottom: 28 }}>
            {[['login','로그인'], ['signup','회원가입']].map(([m, label]) => (
              <button key={m} onClick={() => { setMode(m); setError(''); setSuccess('') }}
                style={{
                  flex: 1, padding: '9px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--f-sans)', fontSize: 14, fontWeight: mode === m ? 600 : 400,
                  background: mode === m ? 'var(--bg5)' : 'transparent',
                  color: mode === m ? 'var(--t1)' : 'var(--t3)',
                  transition: 'all 0.15s',
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Heading */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: 'var(--f-sans)', fontSize: 22, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>
              {mode === 'login' ? '다시 만나서 반가워요 👋' : '창업 여정을 시작해요 🚀'}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--t3)' }}>
              {mode === 'login' ? 'Insightship 계정으로 로그인하세요' : '무료로 가입하고 모든 기능을 이용하세요'}
            </p>
          </div>

          {/* Google OAuth */}
          <button onClick={handleGoogle}
            style={{
              width: '100%', padding: '12px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 10, background: 'var(--bg2)',
              border: '1px solid var(--b2)', borderRadius: 10, cursor: 'pointer',
              fontSize: 14, fontFamily: 'var(--f-sans)', color: 'var(--t1)',
              transition: 'all 0.15s', marginBottom: 20,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.borderColor = 'var(--b3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.borderColor = 'var(--b2)' }}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Google로 계속하기
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--b1)' }} />
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t4)', letterSpacing: '0.1em' }}>또는</span>
            <div style={{ flex: 1, height: 1, background: 'var(--b1)' }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'signup' && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--t3)', marginBottom: 6 }}>닉네임</label>
                <div style={{ position: 'relative' }}>
                  <User size={15} color="var(--t4)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                    placeholder="활동할 닉네임을 입력하세요"
                    style={{
                      width: '100%', padding: '12px 14px 12px 42px',
                      background: 'var(--bg2)', border: '1px solid var(--b2)',
                      borderRadius: 10, color: 'var(--t1)', fontSize: 14,
                      fontFamily: 'var(--f-sans)', outline: 'none', boxSizing: 'border-box',
                      transition: 'border-color 0.15s',
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--b2)'}
                  />
                </div>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--t3)', marginBottom: 6 }}>이메일</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} color="var(--t4)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="이메일 주소를 입력하세요"
                  required
                  style={{
                    width: '100%', padding: '12px 14px 12px 42px',
                    background: 'var(--bg2)', border: '1px solid var(--b2)',
                    borderRadius: 10, color: 'var(--t1)', fontSize: 14,
                    fontFamily: 'var(--f-sans)', outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--b2)'}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--t3)', marginBottom: 6 }}>비밀번호</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} color="var(--t4)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? '6자 이상 입력하세요' : '비밀번호를 입력하세요'}
                  required
                  style={{
                    width: '100%', padding: '12px 44px 12px 42px',
                    background: 'var(--bg2)', border: '1px solid var(--b2)',
                    borderRadius: 10, color: 'var(--t1)', fontSize: 14,
                    fontFamily: 'var(--f-sans)', outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--b2)'}
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', padding: 4, display: 'flex' }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Error / Success */}
            {error && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: 8 }}>
                <AlertCircle size={14} color="#F43F5E" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 13, color: '#F43F5E', lineHeight: 1.5 }}>{error}</span>
              </div>
            )}
            {success && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8 }}>
                <CheckCircle size={14} color="#22C55E" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 13, color: '#22C55E', lineHeight: 1.5 }}>{success}</span>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading}
              style={{
                width: '100%', padding: '13px',
                background: loading ? 'var(--bg4)' : 'linear-gradient(135deg,#3B82F6,#1D4ED8)',
                border: 'none', borderRadius: 10,
                color: loading ? 'var(--t4)' : '#fff',
                fontSize: 15, fontFamily: 'var(--f-sans)', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.15s',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(59,130,246,0.35)',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.88' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
              {loading ? (
                <>
                  <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid rgba(255,255,255,0.7)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  처리 중...
                </>
              ) : (
                <>{mode === 'login' ? '로그인' : '무료로 시작하기'} <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          {/* Switch mode */}
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--t3)' }}>
            {mode === 'login' ? '아직 계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
            <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3B82F6', fontSize: 13, fontFamily: 'var(--f-sans)', fontWeight: 600 }}>
              {mode === 'login' ? '회원가입' : '로그인'}
            </button>
          </p>

          {/* Back to home */}
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Link to="/" style={{ fontSize: 12, color: 'var(--t4)', textDecoration: 'none', fontFamily: 'var(--f-mono)', letterSpacing: '0.05em' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--t2)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--t4)'}>
              ← 홈으로 돌아가기
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .show-mobile-only { display: flex !important; }
        }
        .show-mobile-only { display: none; }
      `}</style>
    </div>
  )
}
