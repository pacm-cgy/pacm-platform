import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  User, Settings, Bookmark, Heart, FileText, Edit2, Save,
  X, Camera, MapPin, Link2, Calendar, Star, Trophy,
  Rocket, Zap, Users, TrendingUp, ChevronRight, ExternalLink,
  BrainCircuit, Lightbulb, GraduationCap, CheckCircle, Plus,
  LogOut, Bell, Shield, Eye, Clock, Briefcase, Award,
  BarChart2, MessageCircle, Globe, Layers, Target, Activity
} from 'lucide-react'
import { useAuthStore } from '../store'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

/* ─── Regions ──────────────────────────────────────── */
const REGIONS = ['서울','경기','인천','부산','대구','광주','대전','울산','세종',
  '강원','충북','충남','전북','전남','경북','경남','제주','해외']

/* ─── Interests ─────────────────────────────────────── */
const INTERESTS = [
  { id:'ai',             label:'AI/머신러닝',       color:'#A855F7', emoji:'🤖' },
  { id:'fintech',        label:'핀테크',             color:'#22C55E', emoji:'💳' },
  { id:'edutech',        label:'에듀테크',           color:'#F97316', emoji:'📚' },
  { id:'healthtech',     label:'헬스테크',           color:'#F43F5E', emoji:'❤️' },
  { id:'sustainability', label:'그린테크',           color:'#06B6D4', emoji:'🌱' },
  { id:'web3',           label:'Web3/블록체인',      color:'#F59E0B', emoji:'⛓️' },
  { id:'ecommerce',      label:'이커머스',           color:'#3B82F6', emoji:'🛒' },
  { id:'saas',           label:'SaaS/B2B',           color:'#818CF8', emoji:'☁️' },
  { id:'creator',        label:'크리에이터 이코노미', color:'#EC4899', emoji:'✨' },
  { id:'mobility',       label:'모빌리티',           color:'#14B8A6', emoji:'🚗' },
]

/* ─── Skeleton ──────────────────────────────────────── */
function Sk({ h = 16, w = '100%', r = 6, mb = 0 }) {
  return (
    <div style={{
      height: h, width: w, background: 'var(--bg3)', borderRadius: r,
      marginBottom: mb, flexShrink: 0,
      animation: 'skPulse 1.6s ease-in-out infinite',
    }} />
  )
}

/* ─── Stat badge ────────────────────────────────────── */
function StatBadge({ icon: Icon, label, value, color }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 4, padding: '12px 8px',
      background: `${color}0a`, borderRadius: 10,
      border: `1px solid ${color}20`, minWidth: 72, flex: 1,
    }}>
      <Icon size={15} color={color} />
      <div style={{
        fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 700,
        color: 'var(--t1)', lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: 'var(--f-mono)', fontSize: 8.5, color: 'var(--t4)',
        letterSpacing: '.07em', textTransform: 'uppercase', textAlign: 'center',
      }}>
        {label}
      </div>
    </div>
  )
}

/* ─── Article mini card ──────────────────────────────── */
function ArtMini({ art, navigate }) {
  const [hov, setHov] = useState(false)
  const CC = { insight:'#3B82F6', trend:'#F59E0B', ai:'#A855F7', news:'#60A5FA', startup:'#3B82F6', default:'#3B82F6' }
  const c = CC[art?.category] || CC.default
  if (!art) return null
  return (
    <div
      onClick={() => navigate(`/article/${art.slug || art.id}`)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', gap: 12, padding: '12px 0', cursor: 'pointer',
        borderBottom: '1px solid var(--b0)', transition: 'all .15s', alignItems: 'flex-start',
      }}>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: 'var(--f-sans)', fontSize: 13, fontWeight: 500,
          color: hov ? 'var(--blue)' : 'var(--t2)', lineHeight: 1.45, marginBottom: 5,
          transition: 'color .15s', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {art.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 9, padding: '1px 6px',
            borderRadius: 3, background: `${c}14`, color: c, border: `1px solid ${c}25`,
          }}>
            {art.category}
          </span>
          {art.published_at && (
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--t4)' }}>
              {format(new Date(art.published_at), 'M월 d일', { locale: ko })}
            </span>
          )}
        </div>
      </div>
      {art.cover_image && (
        <div style={{ width: 56, height: 42, borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
          <img
            src={art.cover_image} alt=""
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transition: 'transform .35s', transform: hov ? 'scale(1.08)' : 'scale(1)',
            }}
          />
        </div>
      )}
    </div>
  )
}

/* ─── Post mini card ─────────────────────────────────── */
function PostMini({ post, navigate }) {
  const [hov, setHov] = useState(false)
  const TYPE_COLORS = { discussion:'#3B82F6', question:'#F59E0B', idea:'#06B6D4', showcase:'#A855F7', free:'#94A3B8', feedback:'#60A5FA', recruit:'#10B981' }
  const c = TYPE_COLORS[post?.post_type] || '#3B82F6'
  if (!post) return null
  return (
    <div
      onClick={() => navigate(`/community/${post.id}`)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', gap: 10, padding: '11px 0', cursor: 'pointer',
        borderBottom: '1px solid var(--b0)', transition: 'all .15s',
      }}>
      <span style={{
        fontFamily: 'var(--f-mono)', fontSize: 8.5, padding: '2px 6px',
        borderRadius: 3, background: `${c}14`, color: c, border: `1px solid ${c}25`,
        flexShrink: 0, alignSelf: 'flex-start', marginTop: 2, whiteSpace: 'nowrap',
      }}>
        {post.post_type || '글'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--f-sans)', fontSize: 13, fontWeight: 500,
          color: hov ? 'var(--blue)' : 'var(--t2)', lineHeight: 1.4,
          transition: 'color .15s', display: '-webkit-box',
          WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {post.title}
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--t4)', marginTop: 4, display: 'flex', gap: 8 }}>
          {post.created_at && <span>{format(new Date(post.created_at), 'M.d', { locale: ko })}</span>}
          <span>좋아요 {post.like_count || 0}</span>
          <span>댓글 {post.comment_count || post.reply_count || 0}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Badge card ─────────────────────────────────────── */
function BadgeCard({ badge, locked }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      padding: '14px 10px',
      background: locked ? 'var(--bg2)' : `${badge.color}08`,
      border: `1px solid ${locked ? 'var(--b0)' : badge.color + '25'}`,
      borderRadius: 10, textAlign: 'center',
      opacity: locked ? 0.45 : 1,
      transition: 'all .2s',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        background: locked ? 'var(--bg4)' : `${badge.color}14`,
        border: `1.5px solid ${locked ? 'var(--b1)' : badge.color + '30'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        filter: locked ? 'grayscale(1)' : 'none',
      }}>
        {badge.emoji}
      </div>
      <div style={{ fontFamily: 'var(--f-sans)', fontSize: 11, fontWeight: 700, color: locked ? 'var(--t4)' : 'var(--t1)' }}>
        {badge.name}
      </div>
      <div style={{ fontFamily: 'var(--f-sans)', fontSize: 10, color: 'var(--t4)', lineHeight: 1.4 }}>
        {badge.desc}
      </div>
    </div>
  )
}

/* ─── Interest chip ──────────────────────────────────── */
function InterestChip({ int }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, padding: '4px 10px', borderRadius: 20,
      background: `${int.color}12`, color: int.color,
      border: `1px solid ${int.color}28`,
      fontFamily: 'var(--f-sans)', fontWeight: 500,
    }}>
      <span style={{ fontSize: 12 }}>{int.emoji}</span> {int.label}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════ */
export default function ProfilePage() {
  const navigate = useNavigate()
  const { id: paramId } = useParams()
  const { user, profile: myProfile, signOut } = useAuthStore()
  const [tab, setTab]         = useState('info')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [profileData, setProfileData] = useState(null)
  const [myPosts, setMyPosts]         = useState([])
  const [bookmarks, setBookmarks]     = useState([])
  const [likedArts, setLikedArts]     = useState([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [isFollowing, setIsFollowing]   = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [badges, setBadges]               = useState([])
  const [badgesLoading, setBadgesLoading] = useState(false)
  const fileRef = useRef(null)

  const isOwn = !paramId || (user && paramId === user.id)
  const uid   = paramId || user?.id

  const [form, setForm] = useState({
    display_name: '', bio: '', region: '', website: '',
    startup_name: '', startup_desc: '', interests: [],
  })

  /* load profile */
  useEffect(() => {
    if (!uid) { setLoading(false); return }
    setLoading(true)
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfileData(data)
          setForm({
            display_name: data.display_name || '',
            bio:          data.bio           || '',
            region:       data.region        || '',
            website:      data.website       || '',
            startup_name: data.startup_name  || '',
            startup_desc: data.startup_desc  || '',
            interests:    data.interests     || [],
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [uid])

  /* load follow state — 타인 프로필 조회 시 팔로우 여부 확인 */
  useEffect(() => {
    if (!user || isOwn || !uid) { setIsFollowing(false); return }
    supabase.from('follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', uid)
      .maybeSingle()
      .then(({ data }) => setIsFollowing(!!data))
      .catch(() => {})
  }, [user, uid, isOwn])

  /* load posts — community_posts 테이블 사용 (posts가 아님) */
  useEffect(() => {
    if (!uid || tab !== 'posts') return
    setPostsLoading(true)
    supabase.from('community_posts')
      .select('id,title,post_type,created_at,like_count,comment_count,reply_count')
      .eq('author_id', uid)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => { if (data) setMyPosts(data); setPostsLoading(false) })
      .catch(() => setPostsLoading(false))
  }, [uid, tab])

  /* load bookmarks */
  useEffect(() => {
    if (!user || !isOwn || tab !== 'bookmarks') return
    setPostsLoading(true)
    supabase.from('article_bookmarks')
      .select('article_id, articles(id,title,slug,category,cover_image,published_at,excerpt,source_name)')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => {
        if (data) setBookmarks(data.map(b => b.articles).filter(Boolean))
        setPostsLoading(false)
      })
      .catch(() => setPostsLoading(false))
  }, [user, isOwn, tab])

  /* load likes */
  useEffect(() => {
    if (!user || !isOwn || tab !== 'likes') return
    setPostsLoading(true)
    supabase.from('article_likes')
      .select('article_id, articles(id,title,slug,category,cover_image,published_at)')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => {
        if (data) setLikedArts(data.map(b => b.articles).filter(Boolean))
        setPostsLoading(false)
      })
      .catch(() => setPostsLoading(false))
  }, [user, isOwn, tab])

  /* ── ALL_BADGES 정의 (서버 DB 없으면 earned 계산으로 대체) ── */
  const ALL_BADGES = [
    { key:'first_idea',   emoji:'🚀', name:'첫 창업가',      desc:'첫 아이디어 제출',     color:'#3B82F6' },
    { key:'idea_master',  emoji:'💡', name:'아이디어 마스터', desc:'아이디어 5개 공유',    color:'#F59E0B' },
    { key:'comm_builder', emoji:'🤝', name:'커뮤니티 빌더',  desc:'댓글 20개 작성',       color:'#22C55E' },
    { key:'knowledge',    emoji:'📚', name:'지식 탐구자',    desc:'아티클 10개 읽음',     color:'#A855F7' },
    { key:'streak7',      emoji:'🔥', name:'연속 방문자',    desc:'7일 연속 방문',        color:'#F97316' },
    { key:'star_founder', emoji:'🏆', name:'스타 창업가',    desc:'커뮤니티 좋아요 50개', color:'#F43F5E' },
    { key:'ai_power',     emoji:'🌟', name:'AI 파워유저',   desc:'AI멘토 20회 사용',     color:'#06B6D4' },
    { key:'unicorn',      emoji:'🦄', name:'유니콘 꿈나무',  desc:'아이디어랩 10개 등록', color:'#EC4899' },
  ]

  /* load badges — user_badges 테이블 우선, 없으면 활동 기반 계산 */
  useEffect(() => {
    if (!uid) return
    setBadgesLoading(true)
    supabase.from('user_badges')
      .select('badge_key, earned_at')
      .eq('user_id', uid)
      .then(async ({ data: dbBadges, error }) => {
        if (!error && dbBadges && dbBadges.length > 0) {
          const earnedKeys = new Set(dbBadges.map(b => b.badge_key))
          setBadges(ALL_BADGES.map(b => ({ ...b, earned: earnedKeys.has(b.key) })))
        } else {
          // DB 테이블 없음 → 활동 데이터로 동적 계산
          try {
            const [postsRes, ideasRes] = await Promise.all([
              supabase.from('community_posts').select('id,like_count,reply_count').eq('author_id', uid).eq('is_deleted', false),
              supabase.from('ideas').select('id').eq('author_id', uid),
            ])
            const postCount  = postsRes.data?.length  || 0
            const totalLikes = (postsRes.data || []).reduce((a,p)=>a+(p.like_count||0),0)
            const ideaCount  = ideasRes.data?.length  || 0
            const totalReplies = (postsRes.data || []).reduce((a,p)=>a+(p.reply_count||0),0)
            setBadges(ALL_BADGES.map(b => ({
              ...b,
              earned:
                b.key === 'first_idea'   ? ideaCount  >= 1  :
                b.key === 'idea_master'  ? ideaCount  >= 5  :
                b.key === 'comm_builder' ? totalReplies >= 20 :
                b.key === 'knowledge'    ? false :
                b.key === 'streak7'      ? false :
                b.key === 'star_founder' ? totalLikes >= 50 :
                b.key === 'ai_power'     ? false :
                b.key === 'unicorn'      ? ideaCount  >= 10 :
                false
            })))
          } catch {
            setBadges(ALL_BADGES.map(b => ({ ...b, earned: false })))
          }
        }
        setBadgesLoading(false)
      })
      .catch(() => {
        setBadges(ALL_BADGES.map(b => ({ ...b, earned: false })))
        setBadgesLoading(false)
      })
  }, [uid])

  /* save */
  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles')
        .upsert({ id: user.id, ...form, updated_at: new Date().toISOString() })
      if (!error) {
        setProfileData(prev => ({ ...prev, ...form }))
        setEditing(false)
      }
    } catch {}
    setSaving(false)
  }

  const toggleInterest = id => {
    setForm(prev => ({
      ...prev,
      interests: prev.interests.includes(id)
        ? prev.interests.filter(i => i !== id)
        : [...prev.interests, id],
    }))
  }

  const handleLogout = async () => {
    if (signOut) await signOut()
    else { await supabase.auth.signOut(); navigate('/') }
  }

  const display      = profileData || myProfile
  const avatarLetter = (display?.display_name || user?.email || '?')[0].toUpperCase()
  const joinDate     = user?.created_at ? format(new Date(user.created_at), 'yyyy년 M월', { locale: ko }) : null

  const TABS = [
    { id: 'info',      label: '프로필',   icon: User },
    { id: 'posts',     label: '게시글',   icon: FileText },
    ...(isOwn ? [
      { id: 'bookmarks', label: '북마크', icon: Bookmark },
      { id: 'likes',     label: '좋아요',  icon: Heart },
      { id: 'activity',  label: '활동',    icon: Activity },
    ] : []),
    { id: 'badges',    label: '배지',     icon: Award },
  ]

  const earnedBadges = badges.filter(b => b.earned)

  /* ── no user ── */
  if (!uid && !user) {
    return (
      <div style={{
        background: 'var(--bg0)', minHeight: '70vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 18,
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'var(--bg3)', border: '1px solid var(--b1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <User size={36} color="var(--t4)" />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 700, color: 'var(--t1)', textAlign: 'center', marginBottom: 6 }}>
            로그인이 필요해요
          </div>
          <div style={{ fontFamily: 'var(--f-sans)', fontSize: 13, color: 'var(--t3)', textAlign: 'center' }}>
            프로필을 보려면 먼저 로그인해주세요
          </div>
        </div>
        <button
          onClick={() => navigate('/login')}
          style={{
            padding: '11px 28px', background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)',
            border: 'none', borderRadius: 9, color: '#fff',
            fontFamily: 'var(--f-sans)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(59,130,246,0.4)',
          }}>
          로그인하기
        </button>
      </div>
    )
  }

  const displayName = display?.display_name || user?.email?.split('@')[0] || '프로필'

  return (
    <div style={{ background: 'var(--bg0)', minHeight: '100vh' }}>
      <Helmet>
        <title>{displayName}의 프로필 | Insightship</title>
        <meta name="description" content={`${displayName} — Insightship 청소년 창업가 프로필. 아이디어, 활동, 배지를 확인하세요.`}/>
        <meta property="og:title" content={`${displayName} | Insightship`}/>
        <meta property="og:type" content="profile"/>
        <meta property="og:url" content={`https://insightship.vercel.app/profile`}/>
        <meta name="robots" content="noindex"/>
      </Helmet>
      <div style={{ maxWidth: 'var(--max-w)', margin: '0 auto', padding: '32px var(--pad-x) 80px' }}>

        {loading ? (
          /* skeleton */
          <div className="profile-skeleton-grid">
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 14, padding: 24 }}>
              <Sk h={80} w={80} r={40} mb={16} />
              <Sk h={18} w="70%" mb={8} />
              <Sk h={13} mb={20} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <Sk h={60} r={10} />
                <Sk h={60} r={10} />
                <Sk h={60} r={10} />
              </div>
              <Sk h={36} r={8} />
            </div>
            <div>
              <Sk h={48} r={14} mb={2} />
              <Sk h={320} r={14} />
            </div>
          </div>
        ) : (
          <div className="profile-grid">

            {/* ── LEFT SIDEBAR ── */}
            <div className="profile-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Profile card */}
              <div style={{
                background: 'var(--bg2)', border: '1px solid var(--b1)',
                borderRadius: 14, overflow: 'hidden',
              }}>
                {/* Cover gradient */}
                <div style={{
                  height: 72,
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(168,85,247,0.12) 50%, rgba(6,182,212,0.1) 100%)',
                  borderBottom: '1px solid var(--b1)',
                }} />

                <div style={{ padding: '0 20px 22px', marginTop: -36 }}>
                  {/* Avatar */}
                  <div style={{ position: 'relative', marginBottom: 14, width: 72 }}>
                    <div style={{
                      width: 72, height: 72, borderRadius: '50%',
                      background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 26, fontWeight: 700, color: '#fff',
                      border: '3px solid var(--bg2)',
                      boxShadow: '0 4px 20px rgba(59,130,246,0.35)',
                      overflow: 'hidden', flexShrink: 0,
                    }}>
                      {display?.avatar_url
                        ? <img src={display.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : avatarLetter
                      }
                    </div>
                    {isOwn && editing && (
                      <button
                        onClick={() => fileRef.current?.click()}
                        style={{
                          position: 'absolute', bottom: 0, right: 0,
                          width: 24, height: 24, borderRadius: '50%',
                          background: '#3B82F6', border: '2px solid var(--bg2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                        }}>
                        <Camera size={11} color="#fff" />
                      </button>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} />
                  </div>

                  {/* Name */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{
                      fontFamily: 'var(--f-display)', fontSize: 17, fontWeight: 800,
                      color: 'var(--t1)', marginBottom: 2, lineHeight: 1.2,
                    }}>
                      {display?.display_name || '이름 없음'}
                    </div>
                    {display?.startup_name && (
                      <div style={{
                        fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--blue)',
                        marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <Briefcase size={9} /> {display.startup_name}
                      </div>
                    )}
                    {display?.bio && (
                      <div style={{
                        fontFamily: 'var(--f-sans)', fontSize: 12, color: 'var(--t3)',
                        lineHeight: 1.65, marginTop: 6,
                      }}>
                        {display.bio}
                      </div>
                    )}
                  </div>

                  {/* Meta */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
                    {display?.region && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--f-sans)', fontSize: 11.5, color: 'var(--t3)' }}>
                        <MapPin size={11} color="var(--t4)" /> {display.region}
                      </div>
                    )}
                    {display?.website && (
                      <a
                        href={display.website} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--f-sans)', fontSize: 11.5, color: '#3B82F6', textDecoration: 'none' }}>
                        <Link2 size={11} />
                        {display.website.replace(/^https?:\/\//, '').slice(0, 26)}
                      </a>
                    )}
                    {joinDate && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--f-sans)', fontSize: 11.5, color: 'var(--t4)' }}>
                        <Calendar size={11} /> {joinDate} 가입
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                    <StatBadge icon={FileText} label="게시글"    value={myPosts.length || 0}         color="#3B82F6" />
                    <StatBadge icon={Heart}    label="좋아요"    value={display?.like_count || 0}     color="#F43F5E" />
                    <StatBadge icon={Trophy}   label="배지"      value={earnedBadges.length} color="#F59E0B" />
                  </div>

                  {/* Action buttons */}
                  {isOwn ? (
                    <div style={{ width: '100%', display: 'flex', gap: 7 }}>
                      {editing ? (
                        <>
                          <button
                            onClick={handleSave} disabled={saving}
                            style={{
                              flex: 1, padding: '9px', background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)',
                              border: 'none', borderRadius: 8, color: '#fff',
                              fontFamily: 'var(--f-sans)', fontWeight: 600, fontSize: 12.5,
                              cursor: 'pointer', display: 'flex', alignItems: 'center',
                              justifyContent: 'center', gap: 5,
                            }}>
                            <Save size={12} /> {saving ? '저장 중…' : '저장하기'}
                          </button>
                          <button
                            onClick={() => setEditing(false)}
                            style={{
                              padding: '9px 12px', background: 'var(--bg3)',
                              border: '1px solid var(--b2)', borderRadius: 8,
                              color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                            }}>
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEditing(true)}
                          style={{
                            width: '100%', padding: '9px', background: 'var(--bg3)',
                            border: '1px solid var(--b2)', borderRadius: 8, color: 'var(--t1)',
                            fontFamily: 'var(--f-sans)', fontSize: 12.5, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 5, transition: 'all .15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'; e.currentTarget.style.color = '#3B82F6' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--b2)'; e.currentTarget.style.color = 'var(--t1)' }}>
                          <Edit2 size={12} /> 프로필 편집
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      disabled={followLoading}
                      onClick={async () => {
                        if (!user) { navigate('/login'); return }
                        setFollowLoading(true)
                        try {
                          if (isFollowing) {
                            await supabase.from('follows').delete()
                              .eq('follower_id', user.id).eq('following_id', uid)
                            setIsFollowing(false)
                          } else {
                            await supabase.from('follows').insert({ follower_id: user.id, following_id: uid })
                            setIsFollowing(true)
                          }
                          // 팔로워 카운트 반영을 위해 프로필 리프레시
                          const { data: refreshed } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
                          if (refreshed) setProfileData(refreshed)
                        } catch {}
                        setFollowLoading(false)
                      }}
                      style={{
                        width: '100%', padding: '9px',
                        background: isFollowing
                          ? 'var(--bg3)'
                          : 'linear-gradient(135deg,#3B82F6,#1D4ED8)',
                        border: isFollowing ? '1px solid var(--b2)' : 'none',
                        borderRadius: 8,
                        color: isFollowing ? 'var(--t2)' : '#fff',
                        fontFamily: 'var(--f-sans)', fontWeight: 600, fontSize: 12.5,
                        cursor: followLoading ? 'not-allowed' : 'pointer',
                        opacity: followLoading ? 0.6 : 1,
                        transition: 'all .15s',
                      }}
                      onMouseEnter={e => { if (!followLoading) e.currentTarget.style.opacity = '.8' }}
                      onMouseLeave={e => { if (!followLoading) e.currentTarget.style.opacity = '1' }}>
                      {followLoading ? '...' : isFollowing ? '팔로잉 ✓' : '팔로우'}
                    </button>
                  )}
                </div>
              </div>

              {/* Interests */}
              {(display?.interests?.length > 0) && (
                <div style={{
                  background: 'var(--bg2)', border: '1px solid var(--b1)',
                  borderRadius: 12, padding: '16px 18px',
                }}>
                  <div style={{
                    fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t4)',
                    letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 12,
                  }}>
                    관심 분야
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {display.interests.map(id => {
                      const int = INTERESTS.find(i => i.id === id)
                      if (!int) return null
                      return <InterestChip key={id} int={int} />
                    })}
                  </div>
                </div>
              )}

              {/* Logout */}
              {isOwn && (
                <button
                  onClick={handleLogout}
                  style={{
                    width: '100%', padding: '10px', background: 'none',
                    border: '1px solid var(--b1)', borderRadius: 10,
                    color: 'var(--t3)', fontFamily: 'var(--f-sans)', fontSize: 12.5,
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 8, transition: 'all .15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(244,63,94,0.3)'
                    e.currentTarget.style.color = '#F43F5E'
                    e.currentTarget.style.background = 'rgba(244,63,94,0.05)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--b1)'
                    e.currentTarget.style.color = 'var(--t3)'
                    e.currentTarget.style.background = 'none'
                  }}>
                  <LogOut size={13} /> 로그아웃
                </button>
              )}
            </div>

            {/* ── RIGHT CONTENT ── */}
            <div>
              {/* Tab bar */}
              <div className="profile-tabs" style={{
                background: 'var(--bg2)',
                border: '1px solid var(--b1)', borderRadius: '14px 14px 0 0',
                overflow: 'hidden', borderBottom: 'none',
              }}>
                {TABS.map(t => {
                  const active = tab === t.id
                  return (
                    <button
                      key={t.id} onClick={() => setTab(t.id)}
                      className="profile-tab-btn"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '14px 18px',
                        background: active ? 'var(--bg3)' : 'transparent',
                        border: 'none',
                        borderBottom: `2.5px solid ${active ? '#3B82F6' : 'transparent'}`,
                        cursor: 'pointer', transition: 'all .15s',
                        color: active ? '#3B82F6' : 'var(--t3)',
                        fontFamily: 'var(--f-sans)', fontSize: 12.5,
                        fontWeight: active ? 700 : 400,
                        whiteSpace: 'nowrap',
                      }}>
                      <t.icon size={13} />
                      {t.label}
                    </button>
                  )
                })}
              </div>

              {/* Tab body */}
              <div style={{
                background: 'var(--bg2)', border: '1px solid var(--b1)',
                borderTop: '1px solid var(--b0)',
                borderRadius: '0 0 14px 14px', padding: '24px',
                minHeight: 360,
              }}>

                {/* ── INFO ── */}
                {tab === 'info' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {editing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div style={{
                          fontFamily: 'var(--f-mono)', fontSize: 10, color: '#3B82F6',
                          letterSpacing: '.12em', textTransform: 'uppercase', paddingBottom: 12,
                          borderBottom: '1px solid var(--b1)',
                        }}>
                          프로필 편집
                        </div>

                        {[
                          { key: 'display_name', label: '이름/닉네임',      placeholder: '표시될 이름',    type: 'text' },
                          { key: 'startup_name', label: '스타트업/프로젝트명', placeholder: '(선택사항)',   type: 'text' },
                          { key: 'website',      label: '웹사이트/포트폴리오', placeholder: 'https://…',  type: 'url'  },
                        ].map(field => (
                          <div key={field.key}>
                            <label style={{ fontFamily: 'var(--f-sans)', fontSize: 11.5, fontWeight: 600, color: 'var(--t2)', display: 'block', marginBottom: 6 }}>
                              {field.label}
                            </label>
                            <input
                              value={form[field.key]}
                              onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                              placeholder={field.placeholder} type={field.type}
                              style={{
                                width: '100%', padding: '9px 13px',
                                background: 'var(--bg3)', border: '1px solid var(--b2)',
                                borderRadius: 8, color: 'var(--t1)',
                                fontFamily: 'var(--f-sans)', fontSize: 13.5, outline: 'none',
                                boxSizing: 'border-box', transition: 'border-color .15s',
                              }}
                              onFocus={e => e.target.style.borderColor = '#3B82F6'}
                              onBlur={e => e.target.style.borderColor = 'var(--b2)'}
                            />
                          </div>
                        ))}

                        <div>
                          <label style={{ fontFamily: 'var(--f-sans)', fontSize: 11.5, fontWeight: 600, color: 'var(--t2)', display: 'block', marginBottom: 6 }}>자기소개</label>
                          <textarea
                            value={form.bio}
                            onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
                            placeholder="본인을 소개해주세요…" rows={3}
                            style={{
                              width: '100%', padding: '9px 13px',
                              background: 'var(--bg3)', border: '1px solid var(--b2)',
                              borderRadius: 8, color: 'var(--t1)',
                              fontFamily: 'var(--f-sans)', fontSize: 13.5,
                              outline: 'none', resize: 'vertical',
                              boxSizing: 'border-box', lineHeight: 1.65,
                            }}
                            onFocus={e => e.target.style.borderColor = '#3B82F6'}
                            onBlur={e => e.target.style.borderColor = 'var(--b2)'}
                          />
                        </div>

                        <div>
                          <label style={{ fontFamily: 'var(--f-sans)', fontSize: 11.5, fontWeight: 600, color: 'var(--t2)', display: 'block', marginBottom: 6 }}>지역</label>
                          <select
                            value={form.region}
                            onChange={e => setForm(p => ({ ...p, region: e.target.value }))}
                            style={{
                              width: '100%', padding: '9px 13px',
                              background: 'var(--bg3)', border: '1px solid var(--b2)',
                              borderRadius: 8, color: form.region ? 'var(--t1)' : 'var(--t4)',
                              fontFamily: 'var(--f-sans)', fontSize: 13.5, outline: 'none',
                            }}>
                            <option value="">지역 선택</option>
                            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>

                        <div>
                          <label style={{ fontFamily: 'var(--f-sans)', fontSize: 11.5, fontWeight: 600, color: 'var(--t2)', display: 'block', marginBottom: 6 }}>창업 아이디어 소개</label>
                          <textarea
                            value={form.startup_desc}
                            onChange={e => setForm(p => ({ ...p, startup_desc: e.target.value }))}
                            placeholder="현재 진행 중인 창업 아이디어나 프로젝트를 소개해주세요…" rows={3}
                            style={{
                              width: '100%', padding: '9px 13px',
                              background: 'var(--bg3)', border: '1px solid var(--b2)',
                              borderRadius: 8, color: 'var(--t1)',
                              fontFamily: 'var(--f-sans)', fontSize: 13.5,
                              outline: 'none', resize: 'vertical',
                              boxSizing: 'border-box', lineHeight: 1.65,
                            }}
                            onFocus={e => e.target.style.borderColor = '#3B82F6'}
                            onBlur={e => e.target.style.borderColor = 'var(--b2)'}
                          />
                        </div>

                        <div>
                          <label style={{ fontFamily: 'var(--f-sans)', fontSize: 11.5, fontWeight: 600, color: 'var(--t2)', display: 'block', marginBottom: 10 }}>
                            관심 분야 <span style={{ color: 'var(--t4)', fontWeight: 400 }}>(복수 선택)</span>
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {INTERESTS.map(int => {
                              const sel = form.interests.includes(int.id)
                              return (
                                <button
                                  key={int.id} onClick={() => toggleInterest(int.id)}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '5px 11px', borderRadius: 20, cursor: 'pointer',
                                    transition: 'all .15s',
                                    fontFamily: 'var(--f-sans)', fontSize: 12,
                                    fontWeight: sel ? 700 : 400,
                                    background: sel ? `${int.color}14` : 'var(--bg4)',
                                    color: sel ? int.color : 'var(--t3)',
                                    border: `1px solid ${sel ? `${int.color}35` : 'var(--b1)'}`,
                                  }}>
                                  <span style={{ fontSize: 12 }}>{int.emoji}</span> {int.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

                        {/* Startup idea */}
                        {display?.startup_desc && (
                          <div>
                            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t4)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                              창업 아이디어
                            </div>
                            <div style={{
                              fontFamily: 'var(--f-sans)', fontSize: 13.5, color: 'var(--t2)',
                              lineHeight: 1.75, padding: '14px 18px',
                              background: 'rgba(59,130,246,0.04)',
                              borderRadius: 8, borderLeft: '3px solid #3B82F6',
                            }}>
                              {display.startup_desc}
                            </div>
                          </div>
                        )}

                        {/* Badges preview */}
                        <div>
                          <div style={{
                            fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t4)',
                            letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 12,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          }}>
                            <span>획득 배지</span>
                            <button
                              onClick={() => setTab('badges')}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3B82F6', fontSize: 10, fontFamily: 'var(--f-mono)', display: 'flex', alignItems: 'center', gap: 3 }}>
                              전체 보기 <ChevronRight size={10} />
                            </button>
                          </div>
                          <div className="profile-badges-grid" style={{ gap: 8 }}>
                            {badgesLoading
                              ? Array(4).fill(0).map((_,i)=>(<div key={i} style={{height:90,background:'var(--bg3)',borderRadius:10,animation:'skPulse 1.6s ease-in-out infinite'}}/>))
                              : earnedBadges.slice(0, 4).length > 0
                                ? earnedBadges.slice(0, 4).map((b, i) => (<BadgeCard key={i} badge={b} locked={false} />))
                                : <div style={{fontSize:12,color:'var(--t4)',padding:'8px 0'}}>아직 획득한 배지가 없어요</div>
                            }
                          </div>
                        </div>

                        {/* Empty state for own profile */}
                        {isOwn && !display?.bio && !display?.startup_desc && (
                          <div style={{
                            padding: '24px 20px', textAlign: 'center',
                            background: 'rgba(59,130,246,0.04)',
                            border: '1px dashed rgba(59,130,246,0.2)', borderRadius: 10,
                          }}>
                            <div style={{ fontFamily: 'var(--f-sans)', fontSize: 13, color: 'var(--t3)', marginBottom: 12 }}>
                              프로필을 채워서 다른 창업가들에게 나를 소개해보세요!
                            </div>
                            <button
                              onClick={() => setEditing(true)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '8px 18px', background: 'rgba(59,130,246,0.1)',
                                border: '1px solid rgba(59,130,246,0.22)', borderRadius: 7,
                                color: '#3B82F6', fontFamily: 'var(--f-sans)', fontSize: 12.5,
                                cursor: 'pointer', fontWeight: 600,
                              }}>
                              <Edit2 size={12} /> 프로필 편집하기
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── POSTS ── */}
                {tab === 'posts' && (
                  <div>
                    <div style={{
                      fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t4)',
                      letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 16,
                    }}>
                      작성한 게시글 {myPosts.length}개
                    </div>
                    {postsLoading
                      ? Array(6).fill(0).map((_, i) => (
                          <div key={i} style={{ padding: '11px 0', borderBottom: '1px solid var(--b0)', display: 'flex', gap: 8 }}>
                            <Sk h={18} w={60} r={3} />
                            <div style={{ flex: 1 }}><Sk h={13} mb={5} /><Sk h={10} w="40%" /></div>
                          </div>
                        ))
                      : myPosts.length === 0
                        ? <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--t4)', fontFamily: 'var(--f-sans)', fontSize: 13 }}>
                            아직 작성한 게시글이 없어요
                          </div>
                        : myPosts.map(p => <PostMini key={p.id} post={p} navigate={navigate} />)
                    }
                  </div>
                )}

                {/* ── BOOKMARKS ── */}
                {tab === 'bookmarks' && (
                  <div>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t4)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 16 }}>
                      북마크 {bookmarks.length}개
                    </div>
                    {postsLoading
                      ? Array(5).fill(0).map((_, i) => (
                          <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--b0)', display: 'flex', gap: 12 }}>
                            <div style={{ flex: 1 }}><Sk h={13} mb={6} /><Sk h={10} w="50%" /></div>
                            <Sk h={42} w={56} r={7} />
                          </div>
                        ))
                      : bookmarks.length === 0
                        ? <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--t4)', fontFamily: 'var(--f-sans)', fontSize: 13 }}>
                            북마크한 아티클이 없어요
                          </div>
                        : bookmarks.map(a => <ArtMini key={a.id} art={a} navigate={navigate} />)
                    }
                  </div>
                )}

                {/* ── LIKES ── */}
                {tab === 'likes' && (
                  <div>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t4)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 16 }}>
                      좋아요한 아티클 {likedArts.length}개
                    </div>
                    {postsLoading
                      ? Array(5).fill(0).map((_, i) => (
                          <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--b0)', display: 'flex', gap: 12 }}>
                            <div style={{ flex: 1 }}><Sk h={13} mb={6} /><Sk h={10} w="50%" /></div>
                            <Sk h={42} w={56} r={7} />
                          </div>
                        ))
                      : likedArts.length === 0
                        ? <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--t4)', fontFamily: 'var(--f-sans)', fontSize: 13 }}>
                            좋아요한 아티클이 없어요
                          </div>
                        : likedArts.map(a => <ArtMini key={a.id} art={a} navigate={navigate} />)
                    }
                  </div>
                )}

                {/* ── BADGES ── */}
                {tab === 'badges' && (
                  <div>
                    <div style={{
                      fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t4)',
                      letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6,
                    }}>
                      배지 컬렉션
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16 }}>
                      {badgesLoading ? '로딩 중…' : `${earnedBadges.length}/${badges.length} 획득`}
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: 4, background: 'var(--bg4)', borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        background: 'linear-gradient(90deg,#3B82F6,#A855F7)',
                        width: badges.length ? `${(earnedBadges.length / badges.length) * 100}%` : '0%',
                        transition: 'width 1s ease',
                      }} />
                    </div>
                    {badgesLoading
                      ? <div className="profile-badges-grid">{Array(8).fill(0).map((_,i)=>(<div key={i} style={{height:100,background:'var(--bg3)',borderRadius:10,animation:'skPulse 1.6s ease-in-out infinite'}}/>))}</div>
                      : <div className="profile-badges-grid">
                          {badges.map((b, i) => (
                            <BadgeCard key={i} badge={b} locked={!b.earned} />
                          ))}
                        </div>
                    }
                  </div>
                )}

                {/* ── ACTIVITY ── */}
                {tab === 'activity' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* Stats overview */}
                    <div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t4)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 14 }}>
                        활동 통계
                      </div>
                      <div className="profile-activity-grid">
                        {[
                          { icon: FileText,      label: '게시글',    value: myPosts.length,        color: '#3B82F6' },
                          { icon: Bookmark,      label: '북마크',    value: bookmarks.length,      color: '#A855F7' },
                          { icon: Heart,         label: '좋아요',    value: likedArts.length,      color: '#F43F5E' },
                          { icon: MessageCircle, label: '댓글',      value: display?.comment_count ?? 0, color: '#22C55E' },
                        ].map((s, i) => (
                          <div key={i} style={{ padding: '14px 12px', background: 'var(--bg3)', border: `1px solid ${s.color}18`, borderRadius: 10, textAlign: 'center' }}>
                            <s.icon size={16} color={s.color} style={{ marginBottom: 6 }}/>
                            <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>{s.value}</div>
                            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--t4)', marginTop: 4, letterSpacing: '.06em' }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Join info */}
                    <div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t4)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 14 }}>
                        계정 정보
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                          { icon: Calendar,  label: '가입일',   value: joinDate || '—' },
                          { icon: Globe,     label: '지역',     value: display?.region || '—' },
                          { icon: Briefcase, label: '스타트업', value: display?.startup_name || '—' },
                        ].map((row, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8 }}>
                            <row.icon size={14} color="var(--t4)" style={{ flexShrink: 0 }}/>
                            <span style={{ fontFamily: 'var(--f-sans)', fontSize: 11.5, color: 'var(--t4)', width: 60, flexShrink: 0 }}>{row.label}</span>
                            <span style={{ fontFamily: 'var(--f-sans)', fontSize: 13, color: 'var(--t1)', fontWeight: 500 }}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Interests summary */}
                    {(display?.interests?.length > 0) && (
                      <div>
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--t4)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 12 }}>
                          관심 분야
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {display.interests.map(id => {
                            const int = INTERESTS.find(i => i.id === id)
                            if (!int) return null
                            return (
                              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, background: `${int.color}10`, border: `1px solid ${int.color}25`, color: int.color, fontSize: 12, fontFamily: 'var(--f-sans)' }}>
                                <span>{int.emoji}</span> {int.label}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Empty CTA */}
                    {isOwn && myPosts.length === 0 && bookmarks.length === 0 && (
                      <div style={{ padding: '28px', textAlign: 'center', background: 'rgba(59,130,246,0.04)', border: '1px dashed rgba(59,130,246,0.2)', borderRadius: 10 }}>
                        <Activity size={28} color="#3B82F6" style={{ marginBottom: 12, opacity: .6 }}/>
                        <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 12 }}>아직 활동 기록이 없습니다.<br/>커뮤니티에 참여해보세요!</div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <button onClick={() => navigate('/community')} style={{ padding: '8px 16px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.22)', borderRadius: 7, color: '#3B82F6', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--f-sans)', fontWeight: 600 }}>커뮤니티</button>
                          <button onClick={() => navigate('/ideas')} style={{ padding: '8px 16px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.22)', borderRadius: 7, color: '#06B6D4', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--f-sans)', fontWeight: 600 }}>아이디어랩</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes skPulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        .profile-grid {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 24px;
          align-items: start;
        }
        .profile-skeleton-grid {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 24px;
        }
        .profile-tabs {
          display: flex;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .profile-tabs::-webkit-scrollbar { display: none; }
        .profile-tab-btn {
          flex-shrink: 0;
        }
        .profile-badges-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        .profile-activity-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        @media (max-width: 900px) {
          .profile-grid, .profile-skeleton-grid {
            grid-template-columns: 1fr !important;
          }
          .profile-sidebar {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
        }
        @media (max-width: 640px) {
          .profile-sidebar {
            grid-template-columns: 1fr !important;
          }
          .profile-badges-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .profile-activity-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  )
}
