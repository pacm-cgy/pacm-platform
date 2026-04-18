import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, TrendingUp, BookOpen, Users, GraduationCap, Newspaper,
  Search, Bell, User, Menu, X, MessageSquare, Zap, Star, Globe, LogOut
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store'

const NAV_ITEMS = [
  { id: 'home',      path: '/',          icon: Home,           label: '홈' },
  { id: 'insight',   path: '/insight',   icon: Zap,            label: '인사이트', badge: 'NEW' },
  { id: 'news',      path: '/news',      icon: Newspaper,      label: '뉴스' },
  { id: 'trend',     path: '/trend',     icon: TrendingUp,     label: '트렌드' },
  { id: 'edu',       path: '/edu',       icon: GraduationCap,  label: '교육' },
  { id: 'magazine',  path: '/magazine',  icon: BookOpen,       label: '매거진' },
  { id: 'story',     path: '/story',     icon: Star,           label: '스토리' },
  { id: 'community', path: '/community', icon: Users,          label: '커뮤니티' },
  { id: 'messages',  path: '/messages',  icon: MessageSquare,  label: '메시지', notif: true },
  { id: 'connect',   path: '/connect',   icon: Globe,          label: '파트너십' },
]

// 실시간 트렌드 티커
function TrendTicker({ trends }) {
  const items = trends?.length > 0 ? trends : [
    '청소년 창업', 'AI 스타트업', '투자 유치', '유니콘 기업',
    '창업진흥원', '시리즈A', '핀테크', '에듀테크', '그린테크', '헬스케어'
  ]
  const doubled = [...items, ...items]
  return (
    <div className="ticker-wrap">
      <div className="ticker-track">
        {doubled.map((kw, i) => (
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
  const location = useLocation()
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifOpen, setNotifOpen]   = useState(false)
  const [query, setQuery]           = useState('')
  const [searchActive, setSearchActive] = useState(false)
  const [trends, setTrends]         = useState([])
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const searchRef = useRef(null)

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    loadTrends()
    if (user) loadNotifications()
  }, [user])

  useEffect(() => {
    if (searchActive) setTimeout(() => searchRef.current?.focus(), 100)
  }, [searchActive])

  async function loadTrends() {
    try {
      const { data } = await supabase
        .from('trend_keywords').select('keyword').order('count', { ascending: false }).limit(10)
      if (data?.length) setTrends(data.map(d => d.keyword))
    } catch {}
  }

  async function loadNotifications() {
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (data) {
        setNotifications(data)
        setUnreadCount(data.filter(n => !n.is_read).length)
      }
    } catch {}
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    navigate('/')
  }

  function handleSearch(e) {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/news?q=${encodeURIComponent(query.trim())}`)
      setSearchActive(false)
      setQuery('')
    }
  }

  const noSidebar = ['/login', '/signup', '/terms', '/privacy'].includes(location.pathname)
  if (noSidebar) return null

  return (
    <>
      {/* ── 메인 헤더 바 ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 200,
        background: 'rgba(6,6,6,0.95)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--line-1)',
      }}>
        {/* 상단 로고 + 액션 행 */}
        <div style={{
          display: 'flex', alignItems: 'center',
          height: 56, padding: '0 20px', gap: 12,
        }}>
          {/* 로고 */}
          <Link to="/" style={{
            fontWeight: 900, fontSize: 18, letterSpacing: '-0.04em',
            color: 'var(--bw-white)', textDecoration: 'none', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            INSIGHT<span style={{ color: '#F59E0B' }}>SHIP</span>
          </Link>

          {/* 검색바 (데스크탑 inline) */}
          <form onSubmit={handleSearch} style={{
            flex: 1, maxWidth: 360, marginLeft: 16,
            display: searchActive ? 'flex' : 'none',
          }} className="header-search-form">
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bw-900)', border: '1px solid var(--line-2)',
              borderRadius: 8, padding: '6px 12px', width: '100%',
            }}>
              <Search size={14} color="var(--text-4)" />
              <input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="뉴스, 인사이트 검색..."
                onBlur={() => !query && setSearchActive(false)}
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  fontSize: 13, color: 'var(--text-1)', width: '100%',
                }}
              />
            </div>
          </form>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* 검색 토글 */}
            <button
              className="icon-btn"
              onClick={() => setSearchActive(!searchActive)}
              style={{ color: searchActive ? 'var(--bw-white)' : 'var(--text-3)' }}
            >
              <Search size={17} />
            </button>

            {/* 알림 */}
            <button
              className="icon-btn"
              onClick={() => setNotifOpen(!notifOpen)}
              style={{ position: 'relative' }}
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: 6, right: 6,
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#6366F1', border: '1px solid var(--bw-black)',
                }} />
              )}
            </button>

            {/* 사용자 */}
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Link to="/profile" style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#818cf8', fontWeight: 700, fontSize: 13,
                  textDecoration: 'none', fontFamily: 'var(--f-mono)',
                }}>
                  {(user.email?.[0] || 'U').toUpperCase()}
                </Link>
                <button
                  className="icon-btn"
                  onClick={handleLogout}
                  title="로그아웃"
                  style={{ color: 'var(--text-4)' }}
                >
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <Link to="/login" className="btn btn-primary btn-sm" style={{ fontSize: 12 }}>
                로그인
              </Link>
            )}

            {/* 모바일 햄버거 */}
            <button
              className="icon-btn hdr-mobile-only"
              onClick={() => setMobileOpen(!mobileOpen)}
              style={{ marginLeft: 4 }}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* ── 탭 네비게이션 행 (데스크탑) ── */}
        <nav className="hdr-tab-nav hdr-desktop-only">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const active = isActive(item.path)
            return (
              <Link
                key={item.id}
                to={item.path}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '0 14px', height: 38,
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  color: active ? 'var(--bw-white)' : 'var(--text-4)',
                  textDecoration: 'none', position: 'relative',
                  borderBottom: active ? '2px solid #6366F1' : '2px solid transparent',
                  transition: 'color .15s, border-color .15s',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-2)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-4)' }}
              >
                <Icon size={13} />
                {item.label}
                {item.badge && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 4px',
                    borderRadius: 4, background: '#6366F1', color: '#fff',
                    lineHeight: 1.4, letterSpacing: '0.03em',
                  }}>{item.badge}</span>
                )}
                {item.notif && unreadCount > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 5px',
                    borderRadius: 9999, background: '#F43F5E', color: '#fff',
                    lineHeight: 1.4,
                  }}>{unreadCount}</span>
                )}
              </Link>
            )
          })}
        </nav>
      </header>

      {/* ── 모바일 드로어 ── */}
      {mobileOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 300 }}
            onClick={() => setMobileOpen(false)}
          />
          <div style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, width: 260,
            background: 'var(--bw-ink)', borderRight: '1px solid var(--line-1)',
            zIndex: 310, display: 'flex', flexDirection: 'column',
            overflowY: 'auto',
          }}>
            {/* 드로어 헤더 */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 16px 12px',
              borderBottom: '1px solid var(--line-1)',
            }}>
              <span style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.03em' }}>
                INSIGHT<span style={{ color: '#F59E0B' }}>SHIP</span>
              </span>
              <button className="icon-btn" onClick={() => setMobileOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {/* 검색 */}
            <div style={{ padding: '12px 12px 8px' }}>
              <form onSubmit={handleSearch}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--bw-900)', border: '1px solid var(--line-1)',
                  borderRadius: 8, padding: '8px 12px',
                }}>
                  <Search size={13} color="var(--text-4)" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="검색..."
                    style={{
                      background: 'none', border: 'none', outline: 'none',
                      fontSize: 13, color: 'var(--text-1)', width: '100%',
                    }}
                  />
                </div>
              </form>
            </div>

            {/* 메뉴 항목 */}
            <div style={{ flex: 1, padding: '4px 8px' }}>
              {NAV_ITEMS.map(item => {
                const Icon = item.icon
                const active = isActive(item.path)
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8, marginBottom: 2,
                      fontSize: 14, fontWeight: active ? 600 : 400,
                      color: active ? 'var(--bw-white)' : 'var(--text-3)',
                      background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                      textDecoration: 'none', transition: 'all .1s',
                    }}
                  >
                    <Icon size={16} color={active ? '#818cf8' : 'var(--text-4)'} />
                    {item.label}
                    {item.badge && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 4px',
                        borderRadius: 4, background: '#6366F1', color: '#fff',
                        lineHeight: 1.4, marginLeft: 'auto',
                      }}>{item.badge}</span>
                    )}
                    {item.notif && unreadCount > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px',
                        borderRadius: 9999, background: '#F43F5E', color: '#fff',
                        lineHeight: 1.4, marginLeft: 'auto',
                      }}>{unreadCount}</span>
                    )}
                  </Link>
                )
              })}
            </div>

            {/* 하단 */}
            <div style={{ padding: '12px', borderTop: '1px solid var(--line-1)' }}>
              {user ? (
                <button
                  onClick={() => { handleLogout(); setMobileOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 12px', borderRadius: 8, fontSize: 14,
                    color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  <LogOut size={15} />
                  로그아웃
                </button>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  로그인
                </Link>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── 알림 패널 ── */}
      <div className={`notif-panel${notifOpen ? ' open' : ''}`}>
        <div className="notif-panel-hd">
          <Bell size={16} color="var(--brand)" />
          <span className="notif-panel-title">알림</span>
          {unreadCount > 0 && (
            <span className="badge badge-white" style={{ marginLeft: 'auto' }}>{unreadCount}</span>
          )}
          <button className="icon-btn" onClick={() => setNotifOpen(false)}
            style={{ marginLeft: unreadCount > 0 ? 8 : 'auto' }}>
            <X size={16} />
          </button>
        </div>
        <div className="notif-list">
          {notifications.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
              새로운 알림이 없습니다
            </div>
          ) : notifications.map(n => (
            <div key={n.id} className={`notif-item${!n.is_read ? ' unread' : ''}`}>
              <div className="notif-icon">
                {n.type === 'comment' ? '💬' : n.type === 'like' ? '❤️' : n.type === 'newsletter' ? '📬' : '🔔'}
              </div>
              <div className="notif-content">
                <div className="notif-title">{n.title}</div>
                {n.body && <div className="notif-body">{n.body}</div>}
                <div className="notif-time">{new Date(n.created_at).toLocaleString('ko-KR')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {notifOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 150 }}
          onClick={() => setNotifOpen(false)}
        />
      )}

      <style>{`
        .hdr-tab-nav {
          display: flex;
          overflow-x: auto;
          padding: 0 8px;
          border-top: 1px solid var(--line-1);
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .hdr-tab-nav::-webkit-scrollbar { display: none; }

        @media (max-width: 768px) {
          .hdr-desktop-only { display: none !important; }
          .hdr-mobile-only  { display: inline-flex !important; }
        }
        @media (min-width: 769px) {
          .hdr-mobile-only { display: none !important; }
          .hdr-desktop-only { display: flex !important; }
        }
      `}</style>
    </>
  )
}
