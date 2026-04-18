import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, initialize } = useAuthStore()

  const isSignUp = location.pathname === '/signup'

  const [mode, setMode] = useState(isSignUp ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const from = location.state?.from || '/'

  // 이미 로그인되어 있으면 리다이렉트
  useEffect(() => {
    if (user) navigate(from, { replace: true })
  }, [user, navigate, from])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        await initialize()
        navigate(from, { replace: true })
      } else {
        if (!displayName.trim()) throw new Error('이름(닉네임)을 입력해주세요.')
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
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
      if (msg.includes('Invalid login credentials')) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      } else if (msg.includes('User already registered')) {
        setError('이미 가입된 이메일입니다.')
      } else if (msg.includes('Password should be at least')) {
        setError('비밀번호는 6자 이상이어야 합니다.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + from },
    })
    if (error) setError(error.message)
  }

  const tabBtn = (active) => ({
    flex: 1,
    padding: '12px',
    background: 'none',
    border: 'none',
    color: active ? 'var(--text-1)' : 'var(--text-3)',
    fontFamily: 'var(--f-sans)',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    borderBottom: active ? '2px solid var(--text-1)' : '2px solid transparent',
    marginBottom: '-1px',
    letterSpacing: '0.5px',
  })

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-0)',
      padding: '24px',
      fontFamily: 'var(--f-sans)',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* 로고 */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: '22px', fontWeight: 600, letterSpacing: '4px', color: 'var(--text-1)' }}>
              PACM
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-3)', letterSpacing: '2px', marginTop: '4px' }}>
              Platform for Asian Creative Minds
            </div>
          </Link>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', marginBottom: '28px', borderBottom: '1px solid var(--line-2)' }}>
          <button onClick={() => { setMode('login'); setError(''); setSuccess('') }} style={tabBtn(mode === 'login')}>로그인</button>
          <button onClick={() => { setMode('signup'); setError(''); setSuccess('') }} style={tabBtn(mode === 'signup')}>회원가입</button>
        </div>

        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.2)', borderRadius: 'var(--r-md)', color: '#FF8080', fontSize: '13px', marginBottom: '20px', lineHeight: 1.5 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ padding: '12px 16px', background: 'rgba(100,200,100,0.08)', border: '1px solid rgba(100,200,100,0.2)', borderRadius: 'var(--r-md)', color: '#80CC80', fontSize: '13px', marginBottom: '20px', lineHeight: 1.5 }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {mode === 'signup' && (
            <div>
              <label style={{ display: 'block', color: 'var(--text-3)', fontSize: '11px', letterSpacing: '1px', marginBottom: '6px', textTransform: 'uppercase' }}>이름 (닉네임)</label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="예: 김창업" required
                style={{ width: '100%', padding: '11px 14px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', color: 'var(--text-1)', fontFamily: 'var(--f-sans)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          )}
          <div>
            <label style={{ display: 'block', color: 'var(--text-3)', fontSize: '11px', letterSpacing: '1px', marginBottom: '6px', textTransform: 'uppercase' }}>이메일</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@pacm.kr" required
              style={{ width: '100%', padding: '11px 14px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', color: 'var(--text-1)', fontFamily: 'var(--f-sans)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', color: 'var(--text-3)', fontSize: '11px', letterSpacing: '1px', marginBottom: '6px', textTransform: 'uppercase' }}>비밀번호</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? '6자 이상' : '비밀번호 입력'} required minLength={6}
              style={{ width: '100%', padding: '11px 14px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', color: 'var(--text-1)', fontFamily: 'var(--f-sans)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={loading}
            style={{ marginTop: '6px', padding: '14px', background: loading ? 'var(--bw-700)' : 'var(--text-1)', color: 'var(--bg-0)', border: 'none', borderRadius: 'var(--r-md)', fontFamily: 'var(--f-sans)', fontSize: '14px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.5px', opacity: loading ? 0.7 : 1 }}>
            {loading ? '처리 중...' : (mode === 'login' ? '로그인' : '가입하기')}
          </button>
        </form>

        {/* 구분선 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '24px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--line-2)' }} />
          <span style={{ color: 'var(--text-3)', fontSize: '11px', letterSpacing: '1px' }}>또는</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--line-2)' }} />
        </div>

        {/* 구글 */}
        <button onClick={handleGoogleLogin}
          style={{ width: '100%', padding: '13px', background: 'transparent', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', color: 'var(--text-2)', fontFamily: 'var(--f-sans)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google로 {mode === 'login' ? '로그인' : '가입'}
        </button>

        <div style={{ textAlign: 'center', marginTop: '28px' }}>
          <Link to="/" style={{ color: 'var(--text-3)', fontSize: '12px', textDecoration: 'none', letterSpacing: '0.5px' }}>
            ← 홈으로 돌아가기
          </Link>
        </div>

        {mode === 'signup' && (
          <div style={{ textAlign: 'center', marginTop: '16px', color: 'var(--text-4)', fontSize: '11px', lineHeight: 1.6 }}>
            가입 시{' '}
            <Link to="/terms" style={{ color: 'var(--text-3)', textDecoration: 'underline' }}>이용약관</Link>
            {' '}및{' '}
            <Link to="/privacy" style={{ color: 'var(--text-3)', textDecoration: 'underline' }}>개인정보처리방침</Link>
            에 동의하는 것으로 간주됩니다.
          </div>
        )}
      </div>
    </div>
  )
}
