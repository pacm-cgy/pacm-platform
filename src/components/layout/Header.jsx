import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, TrendingUp, Users, GraduationCap, Newspaper, Search,
  Bell, Menu, X, LogOut, BrainCircuit, Lightbulb, CalendarDays,
  Rocket, Zap, Globe, User, ChevronDown, Settings, Bookmark,
  MessageCircle, Heart, UserPlus, Award, CheckCheck, AlertCircle
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

// 알림 타입별 아이콘/색상 매핑
const NOTIF_CONFIG = {
  notice:       { icon: AlertCircle,    color: '#3B82F6', label: '공지' },
  follow_post:  { icon: UserPlus,       color: '#22C55E', label: '팔로우' },
  like:         { icon: Heart,          color: '#F43F5E', label: '좋아요' },
  like_milestone:{ icon: Heart,         color: '#F43F5E', label: '마일스톤' },
  comment:      { icon: MessageCircle,  color: '#A855F7', label: '댓글' },
  badge:        { icon: Award,          color: '#F59E0B', label: '배지' },
  default:      { icon: Bell,           color: '#60A5FA', label: '알림' },
}

function getNotifConfig(type) {
  return NOTIF_CONFIG[type] || NOTIF_CONFIG.default
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금 전'
  if (mins < 60) return `${mins}분 전`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}시간 전`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}일 전`
  return dateStr.slice(0, 10)
}

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
  const pollRef   = useRef(null)

  const isActive = p => p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p)

  useEffect(() => { setMobileOpen(false) }, [loc.pathname])

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // 알림 조회 함수 (실시간 폴링용)
  const fetchNotifs = useCallback(async () => {
    if (!user) return
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(25)
      if (data) {
        setNotifs(data)
        setUnread(data.filter(n => !n.is_read).length)
      }
    } catch {}
  }, [user])

  useEffect(() => {
    // 트렌드 키워드
    supabase.from('trend_keywords').select('keyword').order('count', { ascending: false }).limit(14)
      .then(({ data }) => { if (data?.length) setTrends(data.map(d => d.keyword)) }).catch(() => {})

    // 알림 초기 로드
    fetchNotifs()
  }, [user, fetchNotifs])

  // 실시간 알림 폴링 (60초마다)
  useEffect(() => {
    if (!user) return
    pollRef.current = setInterval(fetchNotifs, 60000)
    return () => clearInterval(pollRef.current)
  }, [user, fetchNotifs])

  // Supabase Realtime 알림 구독
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`notifs-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.new) {
          setNotifs(prev => [payload.new, ...prev].slice(0, 25))
          setUnread(prev => prev + 1)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
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
    if (query.trim()) { navigate(`/search?q=${encodeURIComponent(query.trim())}`); setSearchOn(false); setQuery('') }
  }

  const doLogout = async () => {
    if (signOut) await signOut()
    else { await supabase.auth.signOut(); window.location.href = '/' }
  }

  const markAllRead = async () => {
    if (!user || !notifs.length) return
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnread(0)
    } catch {}
  }

  const handleNotifClick = async (n) => {
    // 읽음 처리
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id).catch(() => {})
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      setUnread(prev => Math.max(0, prev - 1))
    }
    // 링크로 이동
    if (n.link) {
      setNotifOpen(false)
      navigate(n.link)
    }
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
                  placeholder="뉴스·인사이트 검색..." autoFocus
                  style={{ padding: '6px 12px', background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 6, color: 'var(--t1)', fontSize: 13, fontFamily: 'var(--f-sans)', outline: 'none', width: 200 }} />
                <button type="button" onClick={() => { setSearchOn(false); setQuery('') }}
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

            {/* ── Notification (logged in) ── */}
            {user && (
              <div ref={notifRef} style={{ position: 'relative' }}>
                <button onClick={() => setNotifOpen(p => !p)}
                  style={{ background: notifOpen ? 'var(--bg3)' : 'none', border: 'none', cursor: 'pointer', color: notifOpen ? 'var(--t1)' : 'var(--t3)', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', position: 'relative', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.background = 'var(--bg3)' }}
                  onMouseLeave={e => { if (!notifOpen) { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.background = 'none' } }}>
                  <Bell size={16} />
                  {unread > 0 && (
                    <span style={{
                      position: 'absolute', top: 3, right: 3,
                      minWidth: unread > 9 ? 14 : 8,
                      height: unread > 9 ? 14 : 8,
                      borderRadius: '50%',
                      background: '#F43F5E',
                      border: '1.5px solid var(--bg1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--f-mono)', fontSize: 8, fontWeight: 700, color: '#fff',
                      padding: unread > 9 ? '0 2px' : 0,
                    }}>
                      {unread > 9 ? '9+' : ''}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    width: 340,
                    background: 'var(--bg2)',
                    border: '1px solid var(--b2)',
                    borderRadius: 12,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
                    zIndex: 300,
                    overflow: 'hidden',
                    animation: 'fadeDown .15s ease',
                  }}>
                    {/* 헤더 */}
                    <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'var(--f-sans)', fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>알림</span>
                        {unread > 0 && (
                          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(244,63,94,0.15)', color: '#F43F5E', border: '1px solid rgba(244,63,94,0.25)' }}>
                            {unread}개 미확인
                          </span>
                        )}
                      </div>
                      {unread > 0 && (
                        <button onClick={markAllRead} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', fontSize: 11, color: '#3B82F6', cursor: 'pointer', fontFamily: 'var(--f-sans)', padding: '3px 6px', borderRadius: 4, transition: 'all .1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.1)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                          <CheckCheck size={12} /> 모두 읽음
                        </button>
                      )}
                    </div>

                    {/* 알림 목록 */}
                    <div style={{ maxHeight: 360, overflowY: 'auto', scrollbarWidth: 'thin' }}>
                      {notifs.length === 0 ? (
                        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--t3)' }}>
                          <Bell size={32} style={{ marginBottom: 12, opacity: 0.2, display: 'block', margin: '0 auto 12px' }} />
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t2)', marginBottom: 4 }}>알림이 없습니다</div>
                          <div style={{ fontSize: 11, color: 'var(--t4)' }}>커뮤니티에 참여하면 알림을 받아요</div>
                        </div>
                      ) : notifs.map(n => {
                        const cfg = getNotifConfig(n.type)
                        const NotifIcon = cfg.icon
                        return (
                          <div key={n.id}
                            onClick={() => handleNotifClick(n)}
                            style={{
                              padding: '12px 16px',
                              borderBottom: '1px solid var(--b0)',
                              background: n.is_read ? 'transparent' : `${cfg.color}06`,
                              cursor: n.link ? 'pointer' : 'default',
                              transition: 'background 0.12s',
                              display: 'flex', gap: 10, alignItems: 'flex-start',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                            onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : `${cfg.color}06`}>
                            {/* 타입 아이콘 */}
                            <div style={{
                              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                              background: `${cfg.color}15`, border: `1px solid ${cfg.color}25`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <NotifIcon size={13} color={cfg.color} />
                            </div>
                            {/* 내용 */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: n.is_read ? 400 : 600, color: 'var(--t1)', lineHeight: 1.5, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {n.title}
                              </div>
                              <div style={{ fontSize: 11.5, color: 'var(--t3)', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                {n.message}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--t4)' }}>
                                  {timeAgo(n.created_at)}
                                </span>
                                {!n.is_read && (
                                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* 푸터 */}
                    {notifs.length > 0 && (
                      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--b1)', textAlign: 'center' }}>
                        <button onClick={() => { navigate('/profile'); setNotifOpen(false) }}
                          style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--f-sans)', transition: 'color .1s' }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--t1)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}>
                          프로필에서 모두 보기 →
                        </button>
                      </div>
                    )}
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
                  <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 210, background: 'var(--bg2)', border: '1px solid var(--b2)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', zIndex: 300, overflow: 'hidden', animation: 'fadeDown .15s ease' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--b1)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>{profile?.display_name || '사용자'}</div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
                      {profile?.role === 'admin' && (
                        <span style={{ marginTop: 4, display: 'inline-block', fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(244,63,94,0.15)', color: '#F43F5E', border: '1px solid rgba(244,63,94,0.25)', fontFamily: 'var(--f-mono)' }}>ADMIN</span>
                      )}
                    </div>
                    {[
                      { icon: User,     label: '내 프로필', path: '/profile' },
                      { icon: Bookmark, label: '북마크',    path: '/profile' },
                      { icon: Settings, label: '설정',      path: '/profile' },
                    ].map(item => (
                      <button key={item.path + item.label} onClick={() => { navigate(item.path); setUserMenuOpen(false) }}
                        style={{ width: '100%', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)', fontSize: 13, fontFamily: 'var(--f-sans)', textAlign: 'left', transition: 'all 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <item.icon size={14} />
                        {item.label}
                      </button>
                    ))}
                    {profile?.role === 'admin' && (
                      <button onClick={() => { navigate('/admin'); setUserMenuOpen(false) }}
                        style={{ width: '100%', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#F43F5E', fontSize: 13, fontFamily: 'var(--f-sans)', textAlign: 'left', transition: 'all 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(244,63,94,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <Settings size={14} /> 관리자 패널
                      </button>
                    )}
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

      <style>{`
        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </>
  )
}
