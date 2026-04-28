import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, TrendingUp, Users, GraduationCap, Newspaper, Search,
  Bell, Menu, X, LogOut, BrainCircuit, Lightbulb, CalendarDays,
  Rocket, Zap, Globe, User, ChevronDown, Settings, Bookmark
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store'

const NAV = [
  { id: 'home',      path: '/',          icon: Home,          label: '홈' },
  { id: 'insight',   path: '/insight',   icon: Zap,           label: '인사이트', badge: 'NEW', color: '#3B82F6' },
  { id: 'trend',     path: '/trend',     icon: TrendingUp,    label: '트렌드',   color: '#F59E0B' },
  { id: 'news',      path: '/news',      icon: Newspaper,     label: '뉴스',     color: '#60A5FA' },
  { id: 'mentor',    path: '/mentor',    icon: BrainCircuit,  label: 'AI 멘토',  badge: 'AI', color: '#A855F7' },
  { id: 'ideas',     path: '/ideas',     icon: Lightbulb,     label: '아이디어랩', color: '#06B6D4' },
  { id: 'edu',       path: '/edu',       icon: GraduationCap, label: '학습센터', color: '#F97316' },
  { id: 'community', path: '/community', icon: Users,         label: '커뮤니티', color: '#10B981' },
  { id: 'events',    path: '/events',    icon: CalendarDays,  label: '이벤트',   color: '#F43F5E' },
  { id: 'connect',   path: '/connect',   icon: Globe,         label: '파트너십', color: '#818CF8' },
]

function Ticker({ items }) {
  const kws = items?.length
    ? items
    : ['AI 스타트업', '청소년 창업', '투자 유치', '핀테크', '에듀테크', '그린테크', '유니콘 기업', '창업진흥원', '시리즈A', '헬스케어', 'PACM 챌린지', '린 스타트업']
  const d = [...kws, ...kws]
  return (
    <div className="ticker-wrap">
      <div className="ticker-track">
        {d.map((kw, i) => (
          <div key={i} className="ticker-item">
            <div className="dot" />
            {typeof kw === 'string' ? kw : kw.keyword || kw}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Header() {
  const loc = useLocation()
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifOpen, setNotifOpen]   = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [query, setQuery]           = useState('')
  const [searchOn, setSearchOn]     = useState(false)
  const [trends, setTrends]         = useState([])
  const [notifs, setNotifs]         = useState([])
  const [unread, setUnread]         = useState(0)
  const [scrolled, setScrolled]     = useState(false)
  const searchRef = useRef(null)
  const notifRef  = useRef(null)
  const userRef   = useRef(null)

  const isActive = p => p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p)

  useEffect(() => { setMobileOpen(false) }, [loc.pathname])

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => {
    supabase.from('trend_keywords').select('keyword').order('count', { ascending: false }).limit(14)
      .then(({ data }) => { if (data?.length) setTrends(data.map(d => d.keyword)) }).catch(() => {})
    if (user) {
      supabase.from('notifications').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(20)
        .then(({ data }) => { if (data) { setNotifs(data); setUnread(data.filter(n => !n.is_read).length) } }).catch(() => {})
    }
  }, [user])

  useEffect(() => { if (searchOn) setTimeout(() => searchRef.current?.focus(), 80) }, [searchOn])

  // 외부 클릭으로 드롭다운 닫기
  useEffect(() => {
    const fn = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const doSearch = e => {
    e.preventDefault()
    if (query.trim()) { navigate(`/news?q=${encodeURIComponent(query.trim())}`); setSearchOn(false); setQuery('') }
  }

  const doLogout = async () => {
    if (signOut) await signOut()
    else { await supabase.auth.signOut(); window.location.href = '/' }
  }

  const markAllRead = async () => {
    if (!user || !notifs.length) return
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnread(0)
  }

  if (['/login', '/signup'].includes(loc.pathname)) return null

  const avatarLetter = (profile?.display_name || user?.email || 'U')[0].toUpperCase()

  return (
    <>
      {/* ── TICKER ── */}
      <div style={{
        height: 32, background: 'var(--bg1)', borderBottom: '1px solid var(--b1)',
        overflow: 'hidden', display: 'flex', alignItems: 'center',
      }}>
        <div style={{ flexShrink: 0, padding: '0 14px', fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '.18em', color: '#3B82F6', borderRight: '1px solid var(--b1)', height: '100%', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
          TRENDING
        </div>
        <Ticker items={trends} />
      </div>

      {/* ── MAIN HEADER ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 200,
        background: scrolled ? 'rgba(5,5,5,0.97)' : 'rgba(5,5,5,1)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: `1px solid ${scrolled ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.06)'}`,
        transition: 'all 0.2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 56, padding: '0 20px', gap: 8, maxWidth: 'var(--max-w)', margin: '0 auto' }}>

          {/* ── LOGO ── */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0, marginRight: 8 }}>
            <div style={{ width: 30, height: 30, background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 12px rgba(59,130,246,0.4)', flexShrink: 0 }}>
              <Rocket size={14} color="#fff" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--f-sans)', fontWeight: 800, fontSize: 15, letterSpacing: '-0.04em', color: 'var(--t1)', lineHeight: 1.1 }}>
                INSIGHT<span style={{ color: '#3B82F6' }}>SHIP</span>
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 7.5, color: 'var(--t3)', letterSpacing: '0.1em' }}>by PACM</div>
            </div>
          </Link>

          {/* ── NAV LINKS (desktop) ── */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflowX: 'auto' }} className="hide-mobile">
            {NAV.map(n => {
              const active = isActive(n.path)
              return (
                <Link key={n.id} to={n.path} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 10px', borderRadius: 6,
                  fontFamily: 'var(--f-sans)', fontSize: 13, fontWeight: active ? 600 : 400,
                  color: active ? 'var(--t1)' : 'var(--t3)',
                  background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                  textDecoration: 'none', whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease', position: 'relative',
                }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--t2)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.background = 'transparent' } else { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' } }}
                >
                  <n.icon size={13} color={active ? (n.color || 'var(--t1)') : 'currentColor'} />
                  {n.label}
                  {n.badge && (
                    <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3, fontFamily: 'var(--f-mono)', letterSpacing: '.04em', background: n.color ? `${n.color}22` : 'rgba(59,130,246,0.2)', color: n.color || '#3B82F6', border: `1px solid ${n.color || '#3B82F6'}30` }}>
                      {n.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* ── RIGHT ACTIONS ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 'auto' }}>

            {/* Search */}
            {searchOn ? (
              <form onSubmit={doSearch} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="뉴스 검색..." autoFocus
                  style={{ padding: '6px 12px', background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 6, color: 'var(--t1)', fontSize: 13, fontFamily: 'var(--f-sans)', outline: 'none', width: 180 }} />
                <button type="button" onClick={() => setSearchOn(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', padding: 4 }}>
                  <X size={14} />
                </button>
              </form>
            ) : (
              <button onClick={() => setSearchOn(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.background = 'var(--bg3)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.background = 'none' }}>
                <Search size={16} />
              </button>
            )}

            {/* Notification (logged in) */}
            {user && (
              <div ref={notifRef} style={{ position: 'relative' }}>
                <button onClick={() => setNotifOpen(p => !p)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', position: 'relative', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.background = 'var(--bg3)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.background = 'none' }}>
                  <Bell size={16} />
                  {unread > 0 && (
                    <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: '#F43F5E', border: '1px solid var(--bg1)' }} />
                  )}
                </button>

                {notifOpen && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 320, background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 10, boxShadow: 'var(--sh-lg)', zIndex: 300, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--f-sans)', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>알림</span>
                      {unread > 0 && (
                        <button onClick={markAllRead} style={{ background: 'none', border: 'none', fontSize: 11, color: '#3B82F6', cursor: 'pointer', fontFamily: 'var(--f-sans)' }}>
                          모두 읽음
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                      {notifs.length === 0 ? (
                        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
                          <Bell size={28} style={{ marginBottom: 10, opacity: 0.3 }} />
                          <div>알림이 없습니다</div>
                        </div>
                      ) : notifs.map(n => (
                        <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--b0)', background: n.is_read ? 'transparent' : 'rgba(59,130,246,0.04)', cursor: 'pointer', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                          onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(59,130,246,0.04)'}>
                          <div style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.5, marginBottom: 4 }}>{n.message || n.title}</div>
                          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)' }}>{n.created_at?.slice(0, 10)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* User Menu / Login */}
            {user ? (
              <div ref={userRef} style={{ position: 'relative' }}>
                <button onClick={() => setUserMenuOpen(p => !p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--b1)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--b2)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--b1)'}>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--f-mono)', fontSize: 10, fontWeight: 700, color: '#fff' }}>
                      {avatarLetter}
                    </div>
                  )}
                  <span style={{ fontFamily: 'var(--f-sans)', fontSize: 13, color: 'var(--t2)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="hide-mobile">
                    {profile?.display_name || '내 계정'}
                  </span>
                  <ChevronDown size={12} color="var(--t3)" />
                </button>

                {userMenuOpen && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 200, background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 10, boxShadow: 'var(--sh-lg)', zIndex: 300, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--b1)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>{profile?.display_name || '사용자'}</div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)' }}>{user.email}</div>
                    </div>
                    {[
                      { icon: User, label: '내 프로필', path: '/profile' },
                      { icon: Bookmark, label: '북마크', path: '/profile' },
                      { icon: Settings, label: '설정', path: '/profile' },
                    ].map(item => (
                      <button key={item.path + item.label} onClick={() => { navigate(item.path); setUserMenuOpen(false) }}
                        style={{ width: '100%', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)', fontSize: 13, fontFamily: 'var(--f-sans)', textAlign: 'left', transition: 'all 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <item.icon size={14} />
                        {item.label}
                      </button>
                    ))}
                    <div style={{ borderTop: '1px solid var(--b1)' }}>
                      <button onClick={doLogout}
                        style={{ width: '100%', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#F43F5E', fontSize: 13, fontFamily: 'var(--f-sans)', textAlign: 'left', transition: 'all 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(244,63,94,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <LogOut size={14} />
                        로그아웃
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => navigate('/login')} style={{ padding: '6px 14px', background: 'none', border: '1px solid var(--b2)', borderRadius: 6, color: 'var(--t2)', fontSize: 13, fontFamily: 'var(--f-sans)', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--b3)'; e.currentTarget.style.color = 'var(--t1)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--b2)'; e.currentTarget.style.color = 'var(--t2)' }}>
                  로그인
                </button>
                <button onClick={() => navigate('/signup')} style={{ padding: '6px 14px', background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontFamily: 'var(--f-sans)', fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  가입
                </button>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button onClick={() => setMobileOpen(p => !p)} className="hide-desktop"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)', padding: 6, display: 'flex' }}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── MOBILE DRAWER ── */}
      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 190 }} onClick={() => setMobileOpen(false)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} />
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', top: 0, left: 0, width: 280, height: '100%',
            background: 'var(--bg1)', borderRight: '1px solid var(--b2)',
            display: 'flex', flexDirection: 'column', animation: 'slideIn 0.22s ease',
            overflowY: 'auto',
          }}>
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'var(--f-sans)', fontWeight: 800, fontSize: 16, letterSpacing: '-0.04em', color: 'var(--t1)' }}>
                INSIGHT<span style={{ color: '#3B82F6' }}>SHIP</span>
              </div>
              <button onClick={() => setMobileOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '12px 0', flex: 1 }}>
              {NAV.map(n => {
                const active = isActive(n.path)
                return (
                  <Link key={n.id} to={n.path} onClick={() => setMobileOpen(false)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px',
                    textDecoration: 'none',
                    color: active ? 'var(--t1)' : 'var(--t2)',
                    background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                    borderLeft: active ? `2px solid ${n.color || '#3B82F6'}` : '2px solid transparent',
                    transition: 'all 0.15s',
                  }}>
                    <n.icon size={16} color={active ? (n.color || '#3B82F6') : 'currentColor'} />
                    <span style={{ fontFamily: 'var(--f-sans)', fontSize: 14, fontWeight: active ? 600 : 400 }}>{n.label}</span>
                    {n.badge && (
                      <span style={{ marginLeft: 'auto', fontSize: 9, padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--f-mono)', background: n.color ? `${n.color}22` : 'rgba(59,130,246,0.2)', color: n.color || '#3B82F6', border: `1px solid ${n.color || '#3B82F6'}30` }}>
                        {n.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>

            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--b1)' }}>
              {user ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--f-mono)', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {avatarLetter}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.display_name || '사용자'}</div>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                  </div>
                  <button onClick={doLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 4 }}>
                    <LogOut size={16} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { navigate('/login'); setMobileOpen(false) }} style={{ flex: 1, padding: '10px', background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 8, color: 'var(--t1)', fontSize: 13, fontFamily: 'var(--f-sans)', cursor: 'pointer' }}>로그인</button>
                  <button onClick={() => { navigate('/signup'); setMobileOpen(false) }} style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontFamily: 'var(--f-sans)', fontWeight: 600, cursor: 'pointer' }}>가입하기</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
