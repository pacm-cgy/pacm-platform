import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, TrendingUp, BookOpen, Users, GraduationCap, Newspaper,
  Search, Bell, User, Menu, X, MessageSquare, Zap, BarChart2,
  ChevronRight, Pencil, LogOut, Settings, Star, Globe
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store'

const NAV_SECTIONS = [
  {
    label: 'DISCOVER',
    items: [
      { id: 'home',      path: '/',          icon: Home,        label: '홈' },
      { id: 'insight',   path: '/insight',   icon: Zap,         label: '인사이트',   badge: 'NEW' },
      { id: 'news',      path: '/news',      icon: Newspaper,   label: '뉴스 피드' },
      { id: 'trend',     path: '/trend',     icon: TrendingUp,  label: '트렌드' },
    ]
  },
  {
    label: 'LEARN',
    items: [
      { id: 'edu',       path: '/edu',       icon: GraduationCap, label: '창업 교육' },
      { id: 'magazine',  path: '/magazine',  icon: BookOpen,    label: '매거진' },
      { id: 'story',     path: '/story',     icon: Star,        label: '창업 스토리' },
    ]
  },
  {
    label: 'CONNECT',
    items: [
      { id: 'community', path: '/community', icon: Users,       label: '커뮤니티' },
      { id: 'messages',  path: '/messages',  icon: MessageSquare, label: '메시지', notif: true },
      { id: 'connect',   path: '/connect',   icon: Globe,       label: '파트너십' },
    ]
  },
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery]           = useState('')
  const [trends, setTrends]         = useState([])
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const searchRef = useRef(null)

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  useEffect(() => {
    loadTrends()
    if (user) loadNotifications()
  }, [user])

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 100)
  }, [searchOpen])

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
      setSearchOpen(false)
      setQuery('')
    }
  }

  // 공개 경로는 사이드바 없이
  const noSidebar = ['/login', '/signup', '/terms', '/privacy'].includes(location.pathname)

  return (
    <>
      {/* 사이드바 */}
      {!noSidebar && (
        <>
          {/* 모바일 오버레이 */}
          {mobileOpen && (
            <div
              style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:99 }}
              onClick={() => setMobileOpen(false)}
            />
          )}

          <nav className={`sidebar-nav${mobileOpen ? ' mobile-open' : ''}`}>
            {/* 로고 */}
            <div className="sidebar-logo">
              <Link to="/" onClick={() => setMobileOpen(false)}>
                <div className="sidebar-logo-text">Insightship</div>
                <div className="sidebar-logo-sub">BY PACM</div>
              </Link>
            </div>

            {/* 검색 (사이드바 내) */}
            <div style={{ padding:'12px 10px', borderBottom:'1px solid var(--line-1)' }}>
              <form onSubmit={handleSearch}>
                <div className="search-bar" style={{ width:'100%', borderRadius:'var(--r-md)' }}>
                  <Search size={13} color="var(--text-4)" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="검색..."
                    style={{ fontSize:'13px' }}
                  />
                </div>
              </form>
            </div>

            {/* 네비게이션 */}
            {NAV_SECTIONS.map(section => (
              <div key={section.label} className="sidebar-section">
                <div className="sidebar-label">{section.label}</div>
                {section.items.map(item => {
                  const Icon = item.icon
                  const active = isActive(item.path)
                  return (
                    <Link
                      key={item.id}
                      to={item.path}
                      className={`nav-item${active ? ' active' : ''}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <Icon size={16} className="nav-item-icon" />
                      <span>{item.label}</span>
                      {item.badge && <span className="nav-badge">{item.badge}</span>}
                      {item.notif && unreadCount > 0 && (
                        <span className="nav-badge">{unreadCount}</span>
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}

            {/* 하단 사용자 */}
            <div style={{ marginTop:'auto', padding:'12px 10px', borderTop:'1px solid var(--line-1)' }}>
              {user ? (
                <>
                  <Link to="/profile" className="nav-item" onClick={() => setMobileOpen(false)}>
                    <User size={16} className="nav-item-icon" /> <span>프로필</span>
                  </Link>
                  <button className="nav-item" onClick={handleLogout} style={{ color:'var(--rose)' }}>
                    <LogOut size={16} className="nav-item-icon" /> <span>로그아웃</span>
                  </button>
                </>
              ) : (
                <Link to="/login" className="btn btn-primary btn-sm" style={{ width:'100%', justifyContent:'center' }}>
                  로그인
                </Link>
              )}
            </div>
          </nav>
        </>
      )}

      {/* 상단 바 */}
      {!noSidebar && (
        <header className="top-bar" style={{ marginLeft: noSidebar ? 0 : 'var(--sidebar)' }}>
          {/* 모바일 햄버거 */}
          <button
            className="icon-btn"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ display:'none' }}
            id="mobile-menu-btn"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* 현재 페이지 타이틀 */}
          <div className="top-bar-title" style={{ display:'none' }} id="page-title">
            Insightship
          </div>

          <div className="top-bar-right">
            {/* 알림 */}
            <button
              className="icon-btn"
              onClick={() => setNotifOpen(!notifOpen)}
            >
              <Bell size={17} />
              {unreadCount > 0 && <span className="notif-dot" />}
            </button>

            {/* 사용자 아바타 */}
            {user ? (
              <Link to="/profile" className="icon-btn" style={{ overflow:'hidden', padding:0 }}>
                <div style={{
                  width:36, height:36, borderRadius:'var(--r-md)',
                  background:'var(--brand-dim)', display:'flex',
                  alignItems:'center', justifyContent:'center',
                  color:'var(--brand)', fontWeight:700, fontSize:14,
                  fontFamily:'var(--f-mono)'
                }}>
                  {(user.email?.[0] || 'U').toUpperCase()}
                </div>
              </Link>
            ) : (
              <Link to="/login" className="btn btn-primary btn-sm">로그인</Link>
            )}
          </div>
        </header>
      )}

      {/* 알림 패널 */}
      <div className={`notif-panel${notifOpen ? ' open' : ''}`}>
        <div className="notif-panel-hd">
          <Bell size={16} color="var(--brand)" />
          <span className="notif-panel-title">알림</span>
          {unreadCount > 0 && (
            <span className="badge badge-indigo" style={{ marginLeft:'auto' }}>{unreadCount}</span>
          )}
          <button className="icon-btn" onClick={() => setNotifOpen(false)} style={{ marginLeft: unreadCount > 0 ? 8 : 'auto' }}>
            <X size={16} />
          </button>
        </div>
        <div className="notif-list">
          {notifications.length === 0 ? (
            <div style={{ padding:'32px', textAlign:'center', color:'var(--text-3)', fontSize:14 }}>
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
          style={{ position:'fixed', inset:0, zIndex:150 }}
          onClick={() => setNotifOpen(false)}
        />
      )}

      {/* 모바일 CSS */}
      <style>{`
        @media (max-width: 768px) {
          #mobile-menu-btn { display: flex !important; }
          #page-title { display: block !important; }
        }
      `}</style>
    </>
  )
}
