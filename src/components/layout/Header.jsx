import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Menu, X, Home, Newspaper, TrendingUp, MessageSquare, Briefcase, Zap, Bookmark, Bell } from 'lucide-react'
import { useAuthStore, useUIStore } from '../../store'
import { useSearchArticles } from '../../hooks/useData'
import { supabase } from '../../lib/supabase'

const NAV_ITEMS = [
  { id: 'home',      label: '홈',       path: '/' },
  { id: 'insight',   label: '인사이트', path: '/insight' },
  { id: 'office', label: '🏢 오피스', path: '/office' },
  { id: 'story',     label: '스토리',   path: '/story' },
  { id: 'trend',     label: '트렌드',   path: '/trend' },
  { id: 'community', label: '커뮤니티', path: '/community' },
  { id: 'edu',       label: '창업 EDU', path: '/edu' },
  { id: 'magazine',  label: '매거진',   path: '/magazine' },
  { id: 'connect',   label: '기업연결', path: '/connect' },
  { id: 'news',      label: '뉴스',     path: '/news' },
]

const TICKER_ITEMS = [
  'Insightship — 청소년 창업가를 위한 인사이트 플랫폼',
  '주간 뉴스레터 구독자 모집 중',
  '2026 Q1 스타트업 트렌드 리포트 공개 예정',
  '기업 파트너 모집 — contact@pacm.kr',
]

const MOBILE_NAV = [
  { path:'/', icon:Home, label:'홈' },
  { path:'/news', icon:Newspaper, label:'뉴스' },
  { path:'/trend', icon:TrendingUp, label:'트렌드' },
  { path:'/community', icon:MessageSquare, label:'커뮤니티' },
  { path:'/edu', icon:Zap, label:'EDU' },
  { path:'/connect', icon:Briefcase, label:'기업연결' },
]

/* ── SVG 로고 ─────────────────────────────────────────────────── */
function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="13" stroke="#6366F1" strokeWidth="1.5" opacity=".4"/>
      <path d="M14 4 L14 22 L6 22 Z" fill="#6366F1" opacity=".9"/>
      <path d="M14 9 L14 22 L21 22 Z" fill="#818CF8" opacity=".5"/>
      <path d="M5 23 Q14 27 23 23" stroke="#84CC16" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <circle cx="14" cy="4" r="2" fill="#6366F1"/>
    </svg>
  )
}

/* ── 검색 오버레이 ─────────────────────────────────────────────── */
function SearchOverlay({ onClose }) {
  const [q, setQ] = useState('')
  const { data: results } = useSearchArticles(q)
  const navigate = useNavigate()
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

  const go = (slug) => { navigate(`/article/${slug}`); onClose() }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:250,
      background:'rgba(0,0,0,.85)', backdropFilter:'blur(12px)',
      display:'flex', alignItems:'flex-start', justifyContent:'center',
      padding:'80px 20px 20px',
      animation:'fadeIn .15s ease',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width:'100%', maxWidth:600 }}>
        {/* 검색창 */}
        <div style={{
          display:'flex', alignItems:'center', gap:12,
          background:'#1a1a1a', border:'1px solid rgba(99,102,241,.4)',
          borderRadius:12, padding:'0 16px', marginBottom:8,
          boxShadow:'0 0 40px rgba(99,102,241,.15)',
        }}>
          <Search size={18} color="#6366F1"/>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="뉴스, 인사이트, 스토리 검색..."
            style={{
              flex:1, height:52, background:'none', border:'none',
              color:'#F5F5F5', fontSize:16, outline:'none', fontFamily:'var(--f-sans)',
            }}
          />
          {q && (
            <button onClick={() => setQ('')} style={{ color:'#6B6B6B', background:'none', border:'none', cursor:'pointer' }}>
              <X size={16}/>
            </button>
          )}
          <button onClick={onClose} style={{
            color:'#6B6B6B', background:'#222', border:'1px solid #333',
            borderRadius:6, padding:'3px 8px', fontSize:12, cursor:'pointer', fontFamily:'var(--f-mono)',
          }}>ESC</button>
        </div>

        {/* 검색 결과 */}
        {q.length >= 2 && (
          <div style={{ background:'#141414', border:'1px solid #222', borderRadius:10, overflow:'hidden' }}>
            {results?.length > 0 ? (
              results.slice(0,6).map(a => (
                <div key={a.id} onClick={() => go(a.slug)}
                  style={{
                    padding:'14px 18px', borderBottom:'1px solid #1a1a1a',
                    cursor:'pointer', transition:'background .1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background='#1a1a1a'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                >
                  <div style={{ fontSize:14, fontWeight:500, color:'#F5F5F5', marginBottom:2 }}
                    dangerouslySetInnerHTML={{ __html: a.title?.replace(new RegExp(q,'gi'), m=>`<mark style="background:rgba(99,102,241,.3);color:#818CF8;border-radius:2px">${m}</mark>`) }}
                  />
                  <div style={{ fontSize:12, color:'#6B6B6B', fontFamily:'var(--f-mono)' }}>
                    {a.source_name} · {a.published_at?.slice(0,10)}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding:'24px', textAlign:'center', color:'#6B6B6B', fontSize:14 }}>
                '{q}' 검색 결과가 없습니다
              </div>
            )}
          </div>
        )}

        {!q && (
          <div style={{ textAlign:'center', color:'#404040', fontSize:13, paddingTop:16, fontFamily:'var(--f-mono)' }}>
            검색어를 입력하세요
          </div>
        )}
      </div>
    </div>
  )
}

/* ── 유저 메뉴 ─────────────────────────────────────────────────── */
function UserMenu({ profile, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display:'flex', alignItems:'center', gap:8,
        background:'none', border:'none', cursor:'pointer', padding:'4px',
      }}>
        <div className="avatar avatar-sm">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt=""/>
            : (profile.display_name?.[0] || 'U')}
        </div>
      </button>
      {open && (
        <div style={{
          position:'absolute', right:0, top:'calc(100% + 8px)',
          background:'#141414', border:'1px solid #222',
          borderRadius:10, overflow:'hidden', minWidth:180,
          boxShadow:'0 8px 32px rgba(0,0,0,.6)',
          animation:'slideDown .15s ease',
          zIndex:300,
        }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #1a1a1a' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#F5F5F5' }}>{profile.display_name}</div>
            <div style={{ fontSize:11, color:'#6B6B6B', fontFamily:'var(--f-mono)' }}>{profile.role === 'admin' ? 'ADMIN' : 'MEMBER'}</div>
          </div>
          {[
            { label:'프로필', path:'/profile' },
            { label:'북마크', path:'/bookmarks' },
            { label:'설정', path:'/settings' },
          ].map(item => (
            <button key={item.path} onClick={() => { navigate(item.path); setOpen(false) }} style={{
              display:'block', width:'100%', textAlign:'left',
              padding:'10px 16px', background:'none', border:'none',
              color:'#A1A1A1', fontSize:13, cursor:'pointer',
              borderBottom:'1px solid #1a1a1a', transition:'all .1s',
              fontFamily:'var(--f-sans)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='#1a1a1a'; e.currentTarget.style.color='#F5F5F5' }}
            onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.color='#A1A1A1' }}
            >{item.label}</button>
          ))}
          <button onClick={() => { onSignOut(); setOpen(false) }} style={{
            display:'block', width:'100%', textAlign:'left',
            padding:'10px 16px', background:'none', border:'none',
            color:'#F43F5E', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)',
          }}>로그아웃</button>
        </div>
      )}
    </div>
  )
}

/* ── AuthModal ─────────────────────────────────────────────────── */
function AuthModal({ mode, onClose, onSwitch }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const isLogin = mode === 'login'

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      if (isLogin) {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (err) throw err
        onClose()
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password: pw })
        if (err) throw err
        setDone(true)
      }
    } catch(e) {
      setError(e.message === 'Invalid login credentials' ? '이메일 또는 비밀번호가 틀렸습니다' : e.message)
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <div>
            <div style={{ fontSize:11, fontFamily:'var(--f-mono)', color:'var(--brand-lt)', letterSpacing:1.5, marginBottom:4, textTransform:'uppercase' }}>
              Insightship
            </div>
            <h3 style={{ fontFamily:'var(--f-display)', fontSize:22, letterSpacing:'-0.02em' }}>
              {done ? '이메일을 확인하세요' : isLogin ? '로그인' : '회원가입'}
            </h3>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm">
            <X size={16}/>
          </button>
        </div>
        <div className="modal-body">
          {done ? (
            <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text-2)', lineHeight:1.7 }}>
              <div style={{ fontSize:32, marginBottom:16 }}>📬</div>
              <strong style={{ display:'block', color:'var(--text-1)', marginBottom:8 }}>{email}</strong>
              이메일로 인증 링크를 보냈습니다.<br/>링크를 클릭해서 가입을 완료하세요.
            </div>
          ) : (
            <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {error && (
                <div style={{ padding:'10px 14px', background:'rgba(244,63,94,.1)', border:'1px solid rgba(244,63,94,.3)', borderRadius:8, color:'var(--rose)', fontSize:13 }}>
                  {error}
                </div>
              )}
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">이메일</label>
                <input className="input" type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required/>
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">비밀번호</label>
                <input className="input" type="password" value={pw}
                  onChange={e => setPw(e.target.value)}
                  placeholder="8자 이상" required minLength={8}/>
              </div>
              <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
                {loading ? <span className="spinner"/> : (isLogin ? '로그인' : '회원가입')}
              </button>
              <div style={{ textAlign:'center', fontSize:13, color:'var(--text-3)' }}>
                {isLogin ? '계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
                <button type="button" onClick={() => onSwitch(isLogin ? 'signup' : 'login')}
                  style={{ color:'var(--brand-lt)', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
                  {isLogin ? '회원가입' : '로그인'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── 메인 헤더 ─────────────────────────────────────────────────── */
export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile, signOut } = useAuthStore()
  const { searchOpen, openSearch, closeSearch, mobileMenuOpen, toggleMobileMenu, closeMobileMenu } = useUIStore()
  const [authModal, setAuthModal] = useState(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  useEffect(() => { closeMobileMenu() }, [location.pathname])

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  return (
    <>
      {/* ── 티커 바 ── */}
      <div style={{
        background:'var(--bg-0)',
        borderBottom:'1px solid var(--line-1)',
        overflow:'hidden', contain:'paint', maxWidth:'100vw',
      }}>
        <div style={{
          display:'flex', alignItems:'center',
          maxWidth:'var(--max-width)', margin:'0 auto',
          padding:'0 var(--pad-x)', height:32,
          overflow:'hidden',
        }}>
          <span style={{
            fontFamily:'var(--f-mono)', fontSize:'10px',
            color:'var(--brand)', letterSpacing:'1.5px',
            marginRight:16, flexShrink:0, fontWeight:600,
          }}>INSIGHTSHIP</span>
          <div style={{ flex:1, overflow:'hidden', position:'relative' }}>
            <div style={{
              display:'flex', gap:'60px', whiteSpace:'nowrap',
              animation:'ticker 32s linear infinite',
            }}>
              {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
                <span key={i} style={{ color:'var(--text-4)', fontSize:11, fontFamily:'var(--f-mono)' }}>
                  ·&nbsp;{item}
                </span>
              ))}
            </div>
          </div>
          <span className="no-mobile" style={{
            fontFamily:'var(--f-mono)', fontSize:'10px',
            color:'var(--text-4)', flexShrink:0, marginLeft:16,
          }}>
            {new Date().toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'})}
          </span>
        </div>
      </div>

      {/* ── 메인 헤더 ── */}
      <header style={{
        position:'sticky', top:0, zIndex:'var(--z-nav)',
        background: scrolled ? 'rgba(8,8,8,.92)' : 'var(--bg-0)',
        backdropFilter: scrolled ? 'blur(16px) saturate(180%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(16px) saturate(180%)' : 'none',
        borderBottom:`1px solid ${scrolled ? 'var(--line-1)' : 'transparent'}`,
        transition:'all .2s ease',
      }}>
        <div className="container" style={{
          display:'flex', alignItems:'center', height:56, gap:8,
        }}>
          {/* 로고 */}
          <button onClick={() => navigate('/')} style={{
            display:'flex', alignItems:'center', gap:10,
            background:'none', border:'none', cursor:'pointer', padding:'4px 0', flexShrink:0,
          }}>
            <Logo/>
            <span style={{
              fontFamily:'var(--f-display)', fontWeight:900,
              fontSize:17, letterSpacing:'-0.04em',
              color:'var(--text-1)',
            }}>
              Insight<span style={{ color:'var(--brand-lt)' }}>ship</span>
            </span>
          </button>

          {/* 데스크탑 네비 */}
          <nav className="no-mobile" style={{ display:'flex', alignItems:'center', gap:2, marginLeft:12 }}>
            {NAV_ITEMS.map(item => {
              const active = isActive(item.path)
              return (
                <button key={item.id} onClick={() => navigate(item.path)} style={{
                  background: active ? 'var(--bg-3)' : 'none',
                  border: 'none', cursor:'pointer',
                  color: active ? 'var(--text-1)' : 'var(--text-3)',
                  fontSize:13, fontFamily:'var(--f-sans)',
                  fontWeight: active ? 600 : 400,
                  padding:'5px 12px', borderRadius:8,
                  transition:'all var(--t-fast)',
                  letterSpacing:'-0.01em',
                }}
                onMouseEnter={e => { if(!active) { e.currentTarget.style.background='var(--bg-2)'; e.currentTarget.style.color='var(--text-2)' }}}
                onMouseLeave={e => { if(!active) { e.currentTarget.style.background='none'; e.currentTarget.style.color='var(--text-3)' }}}
                >{item.label}</button>
              )
            })}
          </nav>

          <div style={{ flex:1 }}/>

          {/* 우측 액션 */}
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button onClick={openSearch} style={{
              display:'flex', alignItems:'center', gap:8,
              background:'var(--bg-2)', border:'1px solid var(--line-1)',
              borderRadius:8, padding:'6px 12px', cursor:'pointer',
              color:'var(--text-4)', transition:'all var(--t-fast)',
            }}
            className="no-mobile"
            onMouseEnter={e => { e.currentTarget.style.borderColor='var(--line-2)'; e.currentTarget.style.color='var(--text-3)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='var(--line-1)'; e.currentTarget.style.color='var(--text-4)' }}
            >
              <Search size={14}/>
              <span style={{ fontSize:12, fontFamily:'var(--f-mono)' }}>검색</span>
              <span style={{ fontSize:11, fontFamily:'var(--f-mono)', color:'var(--text-4)' }}>⌘K</span>
            </button>

            <button onClick={openSearch} className="mobile-only btn btn-ghost btn-icon btn-sm">
              <Search size={17}/>
            </button>

            {user && profile ? (
              <>
                <button style={{ background:'none', border:'none', color:'var(--text-4)', padding:8, borderRadius:8, cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.color='var(--text-2)'}
                  onMouseLeave={e => e.currentTarget.style.color='var(--text-4)'}
                  className="no-mobile"
                ><Bookmark size={16}/></button>
                <UserMenu profile={profile} onSignOut={signOut}/>
              </>
            ) : (
              <>
                <button onClick={() => setAuthModal('login')}
                  className="btn btn-ghost btn-sm no-mobile"
                  style={{ color:'var(--text-2)' }}
                >로그인</button>
                <button onClick={() => setAuthModal('signup')}
                  className="btn btn-primary btn-sm"
                >구독하기</button>
              </>
            )}

            <button onClick={toggleMobileMenu} className="mobile-only btn btn-ghost btn-icon btn-sm">
              {mobileMenuOpen ? <X size={18}/> : <Menu size={18}/>}
            </button>
          </div>
        </div>

        {/* 모바일 드롭다운 메뉴 */}
        {mobileMenuOpen && (
          <div style={{
            background:'var(--bg-1)', borderTop:'1px solid var(--line-1)',
            animation:'slideDown .15s ease',
          }}>
            {NAV_ITEMS.map(item => {
              const active = isActive(item.path)
              return (
                <button key={item.id} onClick={() => navigate(item.path)} style={{
                  width:'100%', textAlign:'left',
                  padding:'13px 20px', background:'none', border:'none',
                  color: active ? 'var(--brand-lt)' : 'var(--text-3)',
                  fontSize:14, fontFamily:'var(--f-sans)',
                  fontWeight: active ? 600 : 400,
                  borderBottom:'1px solid var(--line-1)', cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                }}>{item.label} {active && <span style={{ fontSize:10, fontFamily:'var(--f-mono)', color:'var(--brand)' }}>●</span>}</button>
              )
            })}
            {!user && (
              <div style={{ padding:'14px 16px', display:'flex', gap:8 }}>
                <button onClick={() => { setAuthModal('login'); closeMobileMenu() }} className="btn btn-secondary btn-full">로그인</button>
                <button onClick={() => { setAuthModal('signup'); closeMobileMenu() }} className="btn btn-primary btn-full">구독하기</button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* 모바일 하단 탭바 */}
      <nav className="mobile-bottom-nav">
        {MOBILE_NAV.map(item => {
          const active = isActive(item.path)
          const Icon = item.icon
          return (
            <button key={item.path} onClick={() => navigate(item.path)}>
              <Icon size={20} color={active ? 'var(--brand-lt)' : 'var(--text-4)'} strokeWidth={active ? 2.2 : 1.6}/>
              <span className="nav-label" style={{ color: active ? 'var(--brand-lt)' : 'var(--text-4)', fontWeight: active ? 600 : 400 }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>

      {searchOpen && <SearchOverlay onClose={closeSearch}/>}
      {authModal && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} onSwitch={setAuthModal}/>}
    </>
  )
}
