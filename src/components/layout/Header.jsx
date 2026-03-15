import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Menu, X, Bell, Bookmark, ChevronDown } from 'lucide-react'
import { useAuthStore, useUIStore } from '../../store'
import { useSearchArticles } from '../../hooks/useData'
import { supabase } from '../../lib/supabase'

const NAV_ITEMS = [
  { id: 'home',      label: '홈',       path: '/' },
  { id: 'insight',   label: '인사이트', path: '/insight' },
  { id: 'story',     label: '스토리',   path: '/story' },
  { id: 'trend',     label: '트렌드',   path: '/trend' },
  { id: 'community', label: '커뮤니티', path: '/community' },
  { id: 'connect',   label: '기업연결', path: '/connect' },
]

// ── TOPBAR ────────────────────────────────────────────────────────
const TICKER_ITEMS = [
  'PACM 플랫폼 정식 출시 — 청소년 창업가와 기업을 연결합니다',
  '창업 인사이트 뉴스레터 구독자 돌파 기념 이벤트 진행 중',
  '2026 Q1 한국 스타트업 트렌드 리포트 공개 예정',
  '기업 파트너 모집 중 — 청소년 인재를 찾는 기업이라면 지금 신청하세요',
]

function Topbar() {
  return (
    <div style={{
      background: 'var(--c-ink)', color: 'var(--c-paper)',
      fontFamily: 'var(--f-mono)', fontSize: '11px',
      padding: '7px 0', borderBottom: '1px solid #ffffff12',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', maxWidth: 'var(--max-width)', margin: '0 auto', padding: '0 var(--pad-x)' }}>
        <span style={{ color: 'var(--c-gold)', whiteSpace: 'nowrap', marginRight: '16px' }}>PACM</span>
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            display: 'flex', gap: '60px', whiteSpace: 'nowrap',
            animation: 'ticker 30s linear infinite',
          }}>
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} style={{ color: '#888' }}>▸ {item}</span>
            ))}
          </div>
        </div>
        <span style={{ color: '#444', whiteSpace: 'nowrap', marginLeft: '16px' }}>
          {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
        </span>
      </div>
    </div>
  )
}

// ── SEARCH BAR ────────────────────────────────────────────────────
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

  const go = (slug) => {
    navigate(`/article/${slug}`)
    onClose()
  }

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
        {/* Input */}
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

        {/* Results */}
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
          <div style={{ marginTop: '20px', color: '#555', fontFamily: 'var(--f-mono)', fontSize: '13px' }}>검색 결과가 없습니다</div>
        ) : (
          <div style={{ marginTop: '20px' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: '#555', letterSpacing: '2px', marginBottom: '12px' }}>인기 검색어</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['AI 스타트업', '청소년 창업', '시드 투자', '제품 기획', '팀 빌딩', '피치덱'].map(t => (
                <button key={t} onClick={() => setQuery(t)}
                  style={{
                    padding: '5px 14px', border: '1px solid #333',
                    background: 'none', color: '#777', fontSize: '12px',
                    borderRadius: '20px', cursor: 'pointer',
                    fontFamily: 'var(--f-sans)', transition: 'var(--t-fast)',
                  }}
                  onMouseEnter={e => { e.target.style.borderColor = 'var(--c-gold)'; e.target.style.color = 'var(--c-gold)' }}
                  onMouseLeave={e => { e.target.style.borderColor = '#333'; e.target.style.color = '#777' }}
                >{t}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── USER MENU ─────────────────────────────────────────────────────
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
        color: '#999', transition: 'var(--t-fast)',
      }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--c-paper)'}
        onMouseLeave={e => e.currentTarget.style.color = '#999'}
      >
        <div className="avatar avatar-sm" style={{ background: 'var(--c-gold-dim)', color: 'var(--c-gold)', border: '1px solid var(--c-gold)44' }}>
          {profile.avatar_url ? <img src={profile.avatar_url} alt={initial} /> : initial}
        </div>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: 'var(--c-ink)', border: '1px solid #333',
          minWidth: '180px', zIndex: 200,
          animation: 'fadeUp 0.15s ease',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #333' }}>
            <div style={{ color: 'var(--c-paper)', fontSize: '13px', fontWeight: 700 }}>{profile.display_name}</div>
            <div style={{ color: '#666', fontSize: '11px', fontFamily: 'var(--f-mono)', marginTop: '2px' }}>{profile.role}</div>
          </div>
          {[
            { label: '내 프로필', path: '/profile' },
            { label: '내 북마크', path: '/bookmarks' },
            { label: '내 게시글', path: '/my-posts' },
          ].map(item => (
            <a key={item.path} href={item.path} style={{ display: 'block', padding: '10px 16px', color: '#888', fontSize: '13px', transition: 'var(--t-fast)' }}
              onMouseEnter={e => { e.target.style.color = 'var(--c-paper)'; e.target.style.background = '#ffffff08' }}
              onMouseLeave={e => { e.target.style.color = '#888'; e.target.style.background = 'none' }}
            >{item.label}</a>
          ))}
          <div style={{ borderTop: '1px solid #333' }}>
            <button onClick={() => { onSignOut(); setOpen(false) }}
              style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: 'var(--c-red)', fontSize: '13px', textAlign: 'left', cursor: 'pointer' }}
            >로그아웃</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MAIN HEADER ───────────────────────────────────────────────────
export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile, signOut } = useAuthStore()
  const { searchOpen, openSearch, closeSearch, mobileMenuOpen, toggleMobileMenu, closeMobileMenu } = useUIStore()
  const [scrolled, setScrolled] = useState(false)
  const [authModal, setAuthModal] = useState(null) // 'signin' | 'signup'

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  useEffect(() => { closeMobileMenu() }, [location.pathname])

  const handleNavClick = (path) => { navigate(path) }

  return (
    <>
      <Topbar />
      <header style={{
        background: 'var(--c-ink)',
        position: 'sticky', top: 0, zIndex: 'var(--z-nav)',
        borderBottom: `2px solid ${scrolled ? 'var(--c-gold)' : 'var(--c-gold)'}`,
        transition: 'box-shadow 0.2s',
        boxShadow: scrolled ? 'var(--shadow-md)' : 'none',
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          {/* Logo */}
          <button onClick={() => handleNavClick('/')} style={{
            display: 'flex', alignItems: 'baseline', gap: '10px',
            background: 'none', border: 'none', cursor: 'pointer',
          }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontWeight: 700, fontSize: '24px', color: 'var(--c-paper)', letterSpacing: '3px' }}>
              P<span style={{ color: 'var(--c-gold)' }}>A</span>CM
            </span>
            <span style={{ fontFamily: 'var(--f-serif)', fontSize: '10px', color: 'var(--c-muted)', letterSpacing: '1px' }}>청소년 창업 플랫폼</span>
          </button>

          {/* Desktop Nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '2px' }} className="no-mobile">
            {NAV_ITEMS.map(item => {
              const active = location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path))
              return (
                <button key={item.id} onClick={() => handleNavClick(item.path)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: active ? 'var(--c-gold)' : '#888',
                    fontSize: '13px', fontFamily: 'var(--f-sans)',
                    fontWeight: active ? 700 : 400,
                    padding: '8px 14px', borderRadius: '3px',
                    transition: 'var(--t-fast)',
                    letterSpacing: '0.3px',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--c-paper)' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#888' }}
                >{item.label}</button>
              )
            })}
          </nav>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={openSearch} style={{ background: 'none', border: 'none', color: '#777', padding: '8px', transition: 'var(--t-fast)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--c-paper)'}
              onMouseLeave={e => e.currentTarget.style.color = '#777'}
            ><Search size={17} /></button>

            {user && profile ? (
              <>
                <button style={{ background: 'none', border: 'none', color: '#777', padding: '8px' }}><Bookmark size={17} /></button>
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

            {/* Mobile Menu Toggle */}
            <button onClick={toggleMobileMenu}
              style={{ background: 'none', border: 'none', color: 'var(--c-paper)', display: 'none', padding: '8px' }}
              className="mobile-only"
            >{mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div style={{
            background: '#0a0a08', borderTop: '1px solid #222',
            animation: 'fadeUp 0.2s ease',
          }}>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => handleNavClick(item.path)}
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

      {/* Search Overlay */}
      {searchOpen && <SearchOverlay onClose={closeSearch} />}

      {/* Auth Modal */}
      {authModal && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} onSwitch={setAuthModal} />}

      {/* Inline styles for responsive */}
      <style>{`
        @media (max-width: 768px) {
          .no-mobile { display: none !important; }
          .mobile-only { display: flex !important; }
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

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email, password: form.password,
        })
        if (error) throw error
      } else {
        if (form.password.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다')
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(form.username)) throw new Error('아이디는 영문/숫자/밑줄 3-30자로 입력해주세요')
        const { error } = await supabase.auth.signUp({
          email: form.email, password: form.password,
          options: { data: { username: form.username, display_name: form.displayName || form.username } },
        })
        if (error) throw error
      }
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-fade-up">
        <div className="modal-header">
          <div className="modal-title">{mode === 'signin' ? '로그인' : '회원가입'}</div>
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
                <label className="label">아이디 (영문/숫자)</label>
                <input className="input" type="text" value={form.username}
                  onChange={e => update('username', e.target.value)}
                  placeholder="my_startup" autoComplete="username" required
                  style={{ marginBottom: '12px' }}
                />
                <label className="label">닉네임</label>
                <input className="input" type="text" value={form.displayName}
                  onChange={e => update('displayName', e.target.value)}
                  placeholder="이름 또는 닉네임"
                  style={{ marginBottom: '12px' }}
                />
              </>
            )}
            <label className="label">이메일</label>
            <input className="input" type="email" value={form.email}
              onChange={e => update('email', e.target.value)}
              placeholder="email@example.com" autoComplete="email" required
              style={{ marginBottom: '12px' }}
            />
            <label className="label">비밀번호 {mode === 'signup' ? '(8자 이상)' : ''}</label>
            <input className="input" type="password" value={form.password}
              onChange={e => update('password', e.target.value)}
              placeholder="••••••••" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required
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
