import { useState, useEffect } from 'react'
import { useAuthStore } from '../store'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBookmarks, usePosts } from '../hooks/useData'
import { Save, User, MapPin, Edit2, MessageCircle, Heart, Bookmark, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

const REGIONS = [
  '서울특별시','부산광역시','대구광역시','인천광역시','광주광역시',
  '대전광역시','울산광역시','세종특별자치시','경기도','강원도',
  '충청북도','충청남도','전라북도','전라남도','경상북도','경상남도','제주특별자치도',
]

// 내 게시글 훅
function useMyPosts(userId) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!userId) return
    setLoading(true)
    supabase.from('community_posts')
      .select('id,title,post_type,view_count,reply_count,like_count,created_at')
      .eq('author_id', userId).eq('is_deleted', false)
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => { setPosts(data || []); setLoading(false) })
  }, [userId])
  return { posts, loading }
}

// 뉴스 좋아요 목록
function useMyLikes(userId) {
  const [likes, setLikes] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!userId) return
    setLoading(true)
    supabase.from('article_likes')
      .select('article_id, articles(id,title,slug,published_at,source_name,ai_category)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => {
        setLikes((data||[]).map(l=>l.articles).filter(Boolean))
        setLoading(false)
      })
  }, [userId])
  return { likes, loading }
}

const TYPE_LABELS = { free:'자유', question:'질문', recruit:'팀원모집', feedback:'피드백', notice:'공지' }
const TYPE_COLORS = { free:'var(--c-muted)', question:'#60A5FA', recruit:'var(--c-gold)', feedback:'#34D399', notice:'var(--c-red)' }
const CAT_KO = { funding:'투자/펀딩', ai:'AI', ai_startup:'AI스타트업', edutech:'에듀테크', youth:'청소년창업', entrepreneurship:'창업', unicorn:'유니콘', climate:'기후테크', health:'헬스케어', fintech:'핀테크', general:'뉴스' }

export default function ProfilePage() {
  const { id: paramId } = useParams() // 타인 프로필용
  const { user, profile, setProfile } = useAuthStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('info')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [viewProfile, setViewProfile] = useState(null) // 타인 프로필
  const [form, setForm] = useState({ display_name:'', bio:'', school:'', region:'', startup_name:'' })

  const isOwn = !paramId || paramId === user?.id

  // 타인 프로필 조회
  useEffect(() => {
    if (paramId && paramId !== user?.id) {
      supabase.from('profiles').select('*').eq('id', paramId).maybeSingle()
        .then(({ data }) => setViewProfile(data))
    } else {
      setViewProfile(null)
    }
  }, [paramId, user])

  useEffect(() => {
    if (!user && isOwn) navigate('/') 
  }, [user])

  useEffect(() => {
    if (profile && isOwn) {
      setForm({ display_name:profile.display_name||'', bio:profile.bio||'', school:profile.school||'', region:profile.region||'', startup_name:profile.startup_name||'' })
    }
  }, [profile])

  const targetProfile = isOwn ? profile : viewProfile
  const targetId = targetProfile?.id

  const { posts: myPosts, loading: postsLoading } = useMyPosts(isOwn ? user?.id : null)
  const { data: bookmarks = [], isLoading: bookmarksLoading } = useBookmarks()
  const { likes, loading: likesLoading } = useMyLikes(isOwn ? user?.id : null)

  if (!targetProfile) return (
    <div style={{ padding:'80px 20px', textAlign:'center', color:'var(--c-muted)' }}>
      {isOwn ? '로그인이 필요합니다' : '프로필을 찾을 수 없습니다'}
    </div>
  )

  const handleSave = async () => {
    if (!form.display_name.trim()) { setError('이름을 입력해주세요'); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      const { data, error: err } = await supabase.from('profiles')
        .update({ display_name:form.display_name.trim(), bio:form.bio.trim().slice(0,300), school:form.school.trim().slice(0,100), region:form.region, startup_name:form.startup_name.trim().slice(0,100) })
        .eq('id', profile.id).select().single()
      if (err) throw err
      setProfile(data); setSuccess('저장됐습니다 ✓'); setEditing(false)
    } catch { setError('저장 중 오류가 발생했습니다') }
    finally { setSaving(false) }
  }

  const tabs = isOwn
    ? [{ id:'info', label:'기본 정보' }, { id:'posts', label:`내 게시글 (${myPosts.length})` }, { id:'bookmarks', label:`북마크 (${bookmarks.length})` }, { id:'likes', label:`좋아요 (${likes.length})` }]
    : [{ id:'info', label:'프로필' }]

  return (
    <div style={{ maxWidth:'680px', margin:'0 auto', padding:'40px var(--pad-x) 80px' }}>
      {/* 헤더 */}
      <div style={{ display:'flex', alignItems:'center', gap:'20px', marginBottom:'28px', flexWrap:'wrap' }}>
        <div className="avatar avatar-xl" style={{ width:'72px', height:'72px', fontSize:'28px', flexShrink:0 }}>
          {targetProfile.avatar_url ? <img src={targetProfile.avatar_url} alt=""/> : targetProfile.display_name?.[0]?.toUpperCase()||'U'}
        </div>
        <div style={{ flex:1 }}>
          <h1 style={{ fontFamily:'var(--f-serif)', fontSize:'22px', fontWeight:700, marginBottom:'4px' }}>{targetProfile.display_name}</h1>
          <div style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-muted)' }}>@{targetProfile.username}</div>
          {targetProfile.startup_name && <div style={{ fontSize:'13px', color:'var(--c-gold)', marginTop:'4px' }}>🚀 {targetProfile.startup_name}</div>}
          {targetProfile.school && <div style={{ fontSize:'12px', color:'var(--c-gray-5)', marginTop:'2px' }}>🏫 {targetProfile.school}</div>}
          {targetProfile.bio && <div style={{ fontSize:'13px', color:'var(--c-muted)', marginTop:'6px', lineHeight:1.6 }}>{targetProfile.bio}</div>}
        </div>
        {isOwn && !editing && (
          <button onClick={() => setEditing(true)} className="btn btn-outline btn-sm" style={{ gap:'5px' }}>
            <Edit2 size={13}/> 수정
          </button>
        )}
        {!isOwn && user && (
          <button onClick={() => navigate(`/messages?to=${targetProfile.id}`)} className="btn btn-gold btn-sm" style={{ gap:'5px' }}>
            <MessageCircle size={13}/> 메시지
          </button>
        )}
      </div>

      {/* 탭 */}
      <div className="tab-bar" style={{ marginBottom:'24px' }}>
        {tabs.map(t => (
          <button key={t.id} className={`tab-item${activeTab===t.id?' active':''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 기본 정보 탭 */}
      {activeTab === 'info' && (
        <div className="card" style={{ padding:'28px' }}>
          {isOwn && editing ? (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              {[
                { key:'display_name', label:'표시 이름', maxLength:50 },
                { key:'startup_name', label:'스타트업/프로젝트명', maxLength:100 },
                { key:'school', label:'학교', maxLength:100 },
              ].map(({ key, label, maxLength }) => (
                <div key={key}>
                  <label style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-gray-5)', display:'block', marginBottom:'6px' }}>{label}</label>
                  <input value={form[key]} onChange={e => setForm(f=>({...f,[key]:e.target.value}))}
                    maxLength={maxLength} className="input" style={{ width:'100%', boxSizing:'border-box' }}/>
                </div>
              ))}
              <div>
                <label style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-gray-5)', display:'block', marginBottom:'6px' }}>소개</label>
                <textarea value={form.bio} onChange={e=>setForm(f=>({...f,bio:e.target.value}))}
                  rows={3} maxLength={300} className="input" style={{ width:'100%', resize:'vertical', boxSizing:'border-box' }}/>
              </div>
              <div>
                <label style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-gray-5)', display:'block', marginBottom:'6px' }}>지역</label>
                <select value={form.region} onChange={e=>setForm(f=>({...f,region:e.target.value}))} className="input" style={{ width:'100%', boxSizing:'border-box' }}>
                  <option value="">선택하세요</option>
                  {REGIONS.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {error && <div style={{ color:'var(--c-red)', fontSize:'13px' }}>{error}</div>}
              {success && <div style={{ color:'var(--c-green)', fontSize:'13px' }}>{success}</div>}
              <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
                <button onClick={() => { setEditing(false); setError('') }} className="btn btn-outline btn-sm">취소</button>
                <button onClick={handleSave} disabled={saving} className="btn btn-gold btn-sm">
                  <Save size={13}/> {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              {[
                ['이메일', isOwn ? targetProfile.email : null],
                ['역할', targetProfile.role],
                ['지역', targetProfile.region],
                ['학교', targetProfile.school],
                ['가입일', format(new Date(targetProfile.created_at), 'yyyy년 M월 d일', { locale: ko })],
              ].filter(([,v]) => v).map(([label, value]) => (
                <div key={label} style={{ display:'flex', gap:'16px', padding:'10px 0', borderBottom:'1px solid var(--c-border)' }}>
                  <div style={{ width:'70px', flexShrink:0, fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-gray-5)' }}>{label}</div>
                  <div style={{ fontSize:'14px', color:'var(--c-paper)' }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 내 게시글 탭 */}
      {activeTab === 'posts' && (
        <div>
          {postsLoading ? (
            <div style={{ color:'var(--c-muted)', fontSize:'13px', padding:'20px 0' }}>로딩 중...</div>
          ) : myPosts.length === 0 ? (
            <div style={{ color:'var(--c-muted)', fontSize:'13px', padding:'40px 0', textAlign:'center' }}>작성한 게시글이 없습니다</div>
          ) : myPosts.map(p => (
            <div key={p.id} onClick={() => navigate(`/community/${p.id}`)}
              className="card card-clickable" style={{ padding:'16px', marginBottom:'8px', cursor:'pointer' }}>
              <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'6px' }}>
                <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', padding:'2px 7px', border:`1px solid ${TYPE_COLORS[p.post_type]||'var(--c-border)'}`, color:TYPE_COLORS[p.post_type]||'var(--c-muted)' }}>
                  {TYPE_LABELS[p.post_type]||p.post_type}
                </span>
                <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-gray-5)', marginLeft:'auto' }}>
                  {format(new Date(p.created_at), 'M월 d일', { locale: ko })}
                </span>
              </div>
              <div style={{ fontFamily:'var(--f-serif)', fontSize:'14px', fontWeight:600, marginBottom:'6px' }}>{p.title}</div>
              <div style={{ display:'flex', gap:'12px', fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-gray-5)' }}>
                <span>조회 {p.view_count||0}</span>
                <span>댓글 {p.reply_count||0}</span>
                <span>좋아요 {p.like_count||0}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 북마크 탭 */}
      {activeTab === 'bookmarks' && (
        <div>
          {bookmarksLoading ? (
            <div style={{ color:'var(--c-muted)', fontSize:'13px', padding:'20px 0' }}>로딩 중...</div>
          ) : bookmarks.length === 0 ? (
            <div style={{ color:'var(--c-muted)', fontSize:'13px', padding:'40px 0', textAlign:'center' }}>북마크한 아티클이 없습니다</div>
          ) : bookmarks.map(a => (
            <div key={a.id} onClick={() => navigate(`/article/${a.slug}`)}
              className="card card-clickable" style={{ padding:'16px', marginBottom:'8px', cursor:'pointer' }}>
              <div style={{ fontFamily:'var(--f-serif)', fontSize:'14px', fontWeight:600, marginBottom:'6px' }}>{a.title}</div>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-gray-5)' }}>
                {a.source_name && <span style={{ marginRight:'8px' }}>{a.source_name}</span>}
                {a.published_at && format(new Date(a.published_at), 'M월 d일', { locale: ko })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 좋아요 탭 */}
      {activeTab === 'likes' && (
        <div>
          {likesLoading ? (
            <div style={{ color:'var(--c-muted)', fontSize:'13px', padding:'20px 0' }}>로딩 중...</div>
          ) : likes.length === 0 ? (
            <div style={{ color:'var(--c-muted)', fontSize:'13px', padding:'40px 0', textAlign:'center' }}>좋아요한 뉴스가 없습니다</div>
          ) : likes.map(a => (
            <div key={a.id} onClick={() => navigate(`/article/${a.slug}`)}
              className="card card-clickable" style={{ padding:'16px', marginBottom:'8px', cursor:'pointer', display:'flex', gap:'10px', alignItems:'center' }}>
              <Heart size={14} color="var(--c-red)" fill="var(--c-red)" style={{ flexShrink:0 }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'var(--f-serif)', fontSize:'14px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.title}</div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-gray-5)', marginTop:'3px' }}>
                  {CAT_KO[a.ai_category]||'뉴스'} {a.source_name && `· ${a.source_name}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
