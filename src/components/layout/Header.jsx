import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Menu, X, Bookmark, ChevronDown } from 'lucide-react'
import { useAuthStore, useUIStore, useThemeStore } from '../../store'
import { useSearchArticles } from '../../hooks/useData'
import { supabase } from '../../lib/supabase'

const NAV_ITEMS = [
  { id: 'home',      label: '홈',       path: '/' },
  { id: 'insight',   label: '인사이트', path: '/insight' },
  { id: 'story',     label: '스토리',   path: '/story' },
  { id: 'trend',     label: '트렌드',   path: '/trend' },
  { id: 'community', label: '커뮤니티', path: '/community' },
  { id: 'connect',   label: '기업연결', path: '/connect' },
  { id: 'news',      label: '뉴스',     path: '/news' },
]

const TICKER_ITEMS = [
  'Insightship 정식 출시 — 청소년 창업가와 기업을 연결합니다',
  '창업 인사이트 뉴스레터 구독자 돌파 기념 이벤트 진행 중',
  '2026 Q1 한국 스타트업 트렌드 리포트 공개 예정',
  '기업 파트너 모집 중 — contact@pacm.kr 로 문의하세요',
]

// ── INSIGHTSHIP SVG LOGO ─────────────────────────────────────────
function InsightshipLogo({ size = 36, theme }) {
  // 테마에 따라 선체/돛대 색상 결정
  const hullColor = "currentColor"
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ color: 'var(--c-paper)', flexShrink: 0 }}>
      {/* 돛대 */}
      <line x1="20" y1="3" x2="20" y2="27" stroke="currentColor" strokeWidth="1.5"/>
      {/* 메인 돛 */}
      <path d="M20 4 L20 26 L7 26 Z" fill="var(--c-gold)" opacity="0.95"/>
      {/* 보조 돛 */}
      <path d="M20 9 L20 26 L30 26 Z" fill="var(--c-gold)" opacity="0.5"/>
      {/* 선체 */}
      <path d="M5 27 Q20 33 35 27 L33 30 Q20 36 7 30 Z" fill="currentColor"/>
      {/* 물결 */}
      <path d="M3 33 Q9 31 15 33 Q21 35 27 33 Q33 31 38 33" 
        stroke="var(--c-gold)" strokeWidth="1.4" fill="none" opacity="0.6"/>
      {/* 깃발 */}
      <path d="M20 3 L26 7 L20 10 Z" fill="var(--c-gold)"/>
    </svg>
  )
}

function Topbar() {
  return (
    <div style={{
      background: 'var(--c-ink)', color: 'var(--c-paper)',
      fontFamily: 'var(--f-mono)', fontSize: '11px',
      padding: '7px 0', borderBottom: '1px solid #ffffff12',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', maxWidth: 'var(--max-width)', margin: '0 auto', padding: '0 var(--pad-x)' }}>
        <span style={{ color: 'var(--c-gold)', whiteSpace: 'nowrap', marginRight: '16px' }}>INSIGHTSHIP</span>
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            display: 'flex', gap: '60px', whiteSpace: 'nowrap',
            animation: 'ticker 30s linear infinite',
          }}>
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} style={{ color: 'var(--c-gray-5)' }}>▸ {item}</span>
            ))}
          </div>
        </div>
        <span style={{ color: 'var(--c-gray-4)', whiteSpace: 'nowrap', marginLeft: '16px' }}>
          {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
        </span>
      </div>
    </div>
  )
}

function SearchOverlay({ onClose }) {
  const [query, setQuery] = useState('')
  const { data: results = [] } = useSearchArticles(query)
  const navigate = useNavigate()
  const inputRef = useRef()

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const go = (slug) => { navigate(`/article/${slug}`); onClose() }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,14,10,0.96)',
      zIndex: 'var(--z-modal)',
      display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', paddingTop: '100px',
      animation: 'fadeIn 0.15s ease',
    }}>
      <div style={{ width: '100%', maxWidth: '640px', padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '2px solid var(--c-gold)', paddingBottom: '12px' }}>
          <Search size={20} color="var(--c-gold)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="아티클, 키워드, 창업자 이름..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--c-paper)', fontFamily: 'var(--f-serif)',
              fontSize: '22px', caretColor: 'var(--c-gold)',
            }}
          />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--c-paper)', fontSize: '20px', lineHeight: 1 }}>✕</button>
        </div>
        {results.length > 0 ? (
          <div style={{ marginTop: '16px' }}>
            {results.map(r => (
              <div key={r.id} onClick={() => go(r.slug)}
                style={{ padding: '12px 0', borderBottom: '1px solid #ffffff10', cursor: 'pointer', transition: 'var(--t-fast)' }}
                onMouseEnter={e => e.currentTarget.style.paddingLeft = '8px'}
                onMouseLeave={e => e.currentTarget.style.paddingLeft = '0'}
              >
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '2px', marginBottom: '4px' }}>{r.category?.toUpperCase()}</div>
                <div style={{ color: 'var(--c-paper)', fontFamily: 'var(--f-serif)', fontSize: '15px' }}>{r.title}</div>
              </div>
            ))}
          </div>
        ) : query.length >= 2 ? (
          <div style={{ marginTop: '20px', color: 'var(--c-muted)', fontFamily: 'var(--f-mono)', fontSize: '13px' }}>검색 결과가 없습니다</div>
        ) : (
          <div style={{ marginTop: '20px' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)', letterSpacing: '2px', marginBottom: '12px' }}>추천 검색어</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['스타트업', '창업', '투자', '청소년', 'AI'].map(t => (
                <button key={t} onClick={() => setQuery(t)}
                  style={{
                    padding: '5px 14px', border: '1px solid var(--c-gray-3)',
                    background: 'none', color: 'var(--c-muted)', fontSize: '12px',
                    cursor: 'pointer', fontFamily: 'var(--f-sans)', transition: 'var(--t-fast)',
                  }}
                  onMouseEnter={e => { e.target.style.borderColor = 'var(--c-gold)'; e.target.style.color = 'var(--c-gold)' }}
                  onMouseLeave={e => { e.target.style.borderColor = 'var(--c-gray-3)'; e.target.style.color = 'var(--c-muted)' }}
                >{t}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function UserMenu({ profile, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initial = profile.display_name?.[0]?.toUpperCase() || 'U'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--c-gray-5)', transition: 'var(--t-fast)',
      }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--c-paper)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--c-gray-5)'}
      >
        <div className="avatar avatar-sm" style={{ background: 'var(--c-gold-dim)', color: 'var(--c-gold)', border: '1px solid var(--c-gold)44' }}>
          {profile.avatar_url ? <img src={profile.avatar_url} alt={initial} /> : initial}
        </div>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: 'var(--c-ink)', border: '1px solid var(--c-border)',
          minWidth: '180px', zIndex: 200,
          animation: 'fadeUp 0.15s ease',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ color: 'var(--c-paper)', fontSize: '13px', fontWeight: 700 }}>{profile.display_name}</div>
            <div style={{ color: 'var(--c-gray-6)', fontSize: '11px', fontFamily: 'var(--f-mono)', marginTop: '2px' }}>{profile.role}</div>
          </div>
          {[
            { label: '내 프로필', path: '/profile' },
            { label: '내 북마크', path: '/bookmarks' },
            { label: '내 게시글', path: '/my-posts' },
          ].map(item => (
            <a key={item.path} href={item.path} style={{ display: 'block', padding: '10px 16px', color: 'var(--c-gray-6)', fontSize: '13px', transition: 'var(--t-fast)' }}
              onMouseEnter={e => { e.target.style.color = 'var(--c-paper)'; e.target.style.background = '#ffffff08' }}
              onMouseLeave={e => { e.target.style.color = 'var(--c-gray-6)'; e.target.style.background = 'none' }}
            >{item.label}</a>
          ))}
          <div style={{ borderTop: '1px solid var(--c-border)' }}>
            <button onClick={() => { onSignOut(); setOpen(false) }}
              style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: 'var(--c-red)', fontSize: '13px', textAlign: 'left', cursor: 'pointer' }}
            >로그아웃</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile, signOut } = useAuthStore()
  const { searchOpen, openSearch, closeSearch, mobileMenuOpen, toggleMobileMenu, closeMobileMenu } = useUIStore()
  const { theme, toggleTheme } = useThemeStore()
  const [scrolled, setScrolled] = useState(false)
  const [authModal, setAuthModal] = useState(null)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  useEffect(() => { closeMobileMenu() }, [location.pathname])

  return (
    <>
      <Topbar />
      <header style={{
        background: 'var(--c-ink)',
        position: 'sticky', top: 0, zIndex: 'var(--z-nav)',
        borderBottom: '2px solid var(--c-gold)',
        transition: 'box-shadow 0.2s',
        boxShadow: scrolled ? 'var(--shadow-md)' : 'none',
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          {/* Logo */}
          <button onClick={() => navigate('/')} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'none', border: 'none', cursor: 'pointer',
          }}>
            <InsightshipLogo size={36} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontFamily: 'var(--f-mono)', fontWeight: 700, fontSize: '16px', color: 'var(--c-paper)', letterSpacing: '2px', lineHeight: 1.1 }}>
                INSIGHT<span style={{ color: 'var(--c-gold)' }}>SHIP</span>
              </span>
              <span style={{ fontFamily: 'var(--f-serif)', fontSize: '9px', color: 'var(--c-muted)', letterSpacing: '1px' }}>청소년 창업 플랫폼</span>
            </div>
          </button>

          {/* Desktop Nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '2px' }} className="no-mobile">
            {NAV_ITEMS.map(item => {
              const active = location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path))
              return (
                <button key={item.id} onClick={() => navigate(item.path)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: active ? 'var(--c-gold)' : '#888',
                    fontSize: '13px', fontFamily: 'var(--f-sans)',
                    fontWeight: active ? 700 : 400,
                    padding: '8px 14px', borderRadius: '3px',
                    transition: 'var(--t-fast)', letterSpacing: '0.3px',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--c-paper)' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--c-gray-6)' }}
                >{item.label}</button>
              )
            })}
          </nav>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* 테마 토글 */}
            <button
              onClick={toggleTheme}
              className="theme-toggle no-mobile"
              title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
              aria-label="테마 전환"
            />
            <button onClick={openSearch} style={{ background: 'none', border: 'none', color: '#777', padding: '8px', transition: 'var(--t-fast)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--c-paper)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--c-muted)'}
            ><Search size={17} /></button>

            {user && profile ? (
              <>
                <button style={{ background: 'none', border: 'none', color: 'var(--c-muted)', padding: '8px' }}><Bookmark size={17} /></button>
                <UserMenu profile={profile} onSignOut={signOut} />
              </>
            ) : (
              <>
                <button onClick={() => setAuthModal('signin')}
                  style={{ background: 'none', border: 'none', color: '#888', fontSize: '13px', fontFamily: 'var(--f-sans)', padding: '8px 14px', cursor: 'pointer' }}
                  className="no-mobile"
                >로그인</button>
                <button onClick={() => setAuthModal('signup')} className="btn btn-gold btn-sm">구독하기</button>
              </>
            )}

            <button onClick={toggleMobileMenu}
              style={{ background: 'none', border: 'none', color: 'var(--c-paper)', display: 'none', padding: '8px' }}
              className="mobile-only"
            >{mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div style={{ background: 'var(--c-ink)', borderTop: '1px solid var(--c-gray-3)', animation: 'fadeUp 0.2s ease' }}>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => navigate(item.path)}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '14px 20px', background: 'none', border: 'none',
                  color: location.pathname === item.path ? 'var(--c-gold)' : '#888',
                  fontSize: '15px', fontFamily: 'var(--f-sans)',
                  borderBottom: '1px solid #1a1a18', cursor: 'pointer',
                }}
              >{item.label}</button>
            ))}
          </div>
        )}
      </header>

      {searchOpen && <SearchOverlay onClose={closeSearch} />}
      {authModal && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} onSwitch={setAuthModal} />}

      <style>{`
        @media (max-width: 768px) {
          .no-mobile { display: none !important; }
          .mobile-only { display: flex !important; }
          /* 상단 바 모바일 */
          .topbar-inner { font-size: 10px !important; }
        }
        @media (min-width: 769px) {
          .mobile-only { display: none !important; }
        }
      `}</style>
    </>
  )
}

// ── AUTH MODAL ────────────────────────────────────────────────────
function AuthModal({ mode, onClose, onSwitch }) {
  const [form, setForm] = useState({ email: '', password: '', username: '', displayName: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // 보안: 입력값 검증
  const validateEmail = (email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  const validatePassword = (pw) => pw.length >= 8 && pw.length <= 128
  const validateUsername = (u) => /^[a-zA-Z0-9_]{3,30}$/.test(u)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      if (!validateEmail(form.email)) throw new Error('올바른 이메일 주소를 입력해주세요')

      if (mode === 'signin') {
        if (!form.password) throw new Error('비밀번호를 입력해주세요')
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email.trim().toLowerCase(),
          password: form.password,
        })
        if (error) {
          // 보안: 구체적인 에러 메시지 숨김
          if (error.message.includes('Invalid login')) throw new Error('이메일 또는 비밀번호가 올바르지 않습니다')
          throw error
        }
        onClose()
      } else {
        if (!validatePassword(form.password)) throw new Error('비밀번호는 8자 이상 128자 이하여야 합니다')
        if (!validateUsername(form.username)) throw new Error('아이디는 영문/숫자/밑줄 3-30자로 입력해주세요')
        // 보안: XSS 방지를 위한 displayName 제한
        const displayName = (form.displayName || form.username).replace(/[<>&"']/g, '').slice(0, 50)
        const { error } = await supabase.auth.signUp({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          options: {
            data: { username: form.username, display_name: displayName },
            emailRedirectTo: `${window.location.origin}/`,
          },
        })
        if (error) throw error
        setSuccess(true)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal animate-fade-up" style={{ textAlign: 'center' }}>
          <div style={{ padding: '40px 32px' }}>
            <InsightshipLogo size={48} />
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: '20px', marginTop: '16px', marginBottom: '8px' }}>
              이메일을 확인해주세요
            </div>
            <div style={{ color: 'var(--c-muted)', fontSize: '14px', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--c-gold)' }}>{form.email}</strong>로<br />
              인증 링크를 보냈습니다.<br />
              메일함을 확인하고 링크를 클릭하면 가입이 완료됩니다.
            </div>
            <button onClick={onClose} className="btn btn-gold" style={{ marginTop: '24px', width: '100%' }}>확인</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-fade-up">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <InsightshipLogo size={28} />
            <div className="modal-title">{mode === 'signin' ? '로그인' : '회원가입'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--c-muted)' }}>✕</button>
        </div>
        <div className="modal-body">
          {error && (
            <div style={{ background: 'var(--c-red-dim)', border: '1px solid var(--c-red)44', color: 'var(--c-red)', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <>
                <label className="label">아이디 (영문/숫자/밑줄)</label>
                <input className="input" type="text" value={form.username}
                  onChange={e => update('username', e.target.value)}
                  placeholder="my_startup" autoComplete="username" required maxLength={30}
                  style={{ marginBottom: '12px' }}
                />
                <label className="label">닉네임</label>
                <input className="input" type="text" value={form.displayName}
                  onChange={e => update('displayName', e.target.value)}
                  placeholder="이름 또는 닉네임" maxLength={50}
                  style={{ marginBottom: '12px' }}
                />
              </>
            )}
            <label className="label">이메일</label>
            <input className="input" type="email" value={form.email}
              onChange={e => update('email', e.target.value)}
              placeholder="email@example.com" autoComplete="email" required maxLength={254}
              style={{ marginBottom: '12px' }}
            />
            <label className="label">비밀번호 {mode === 'signup' ? '(8자 이상)' : ''}</label>
            <input className="input" type="password" value={form.password}
              onChange={e => update('password', e.target.value)}
              placeholder="••••••••" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required maxLength={128}
              style={{ marginBottom: '20px' }}
            />
            <button type="submit" className="btn btn-gold btn-full btn-lg" disabled={loading}>
              {loading ? '처리 중...' : mode === 'signin' ? '로그인' : '가입하기'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: 'var(--c-muted)' }}>
            {mode === 'signin' ? (
              <>계정이 없으신가요? <button onClick={() => onSwitch('signup')} style={{ background: 'none', border: 'none', color: 'var(--c-gold)', cursor: 'pointer', fontWeight: 700 }}>회원가입</button></>
            ) : (
              <>이미 계정이 있으신가요? <button onClick={() => onSwitch('signin')} style={{ background: 'none', border: 'none', color: 'var(--c-gold)', cursor: 'pointer', fontWeight: 700 }}>로그인</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export { InsightshipLogo }
