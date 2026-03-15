import { useState } from 'react'
import { MessageCircle, Heart, Eye, Pin } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { usePosts, useCreatePost } from '../hooks/useData'
import { useAuthStore } from '../store'

const POST_TYPES = [
  { id:'all', label:'전체' }, { id:'question', label:'질문/답변' },
  { id:'feedback', label:'사업 피드백' }, { id:'recruit', label:'팀원 모집' },
  { id:'free', label:'자유게시판' }, { id:'notice', label:'공지' },
]
const TYPE_LABELS = { question:'질문', feedback:'피드백', recruit:'팀원 모집', free:'자유', notice:'공지' }
const TYPE_COLORS = { question:'var(--c-blue)', feedback:'var(--c-gold)', recruit:'var(--c-green)', free:'var(--c-muted)', notice:'var(--c-red)' }

function PostCard({ post }) {
  const author = post.profiles
  const date = post.created_at ? format(new Date(post.created_at), 'M월 d일', { locale: ko }) : ''
  return (
    <div className="card card-clickable" style={{ padding:'20px 24px', borderBottom:'1px solid var(--c-border)' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:'12px' }}>
        <div className="avatar avatar-sm" style={{ marginTop:'2px' }}>
          {author?.avatar_url ? <img src={author.avatar_url} alt=""/> : (author?.display_name?.[0]||'?')}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
            <div style={{ fontWeight:700, fontSize:'13px' }}>{author?.display_name}</div>
            <div style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-muted)' }}>
              {author?.startup_name||author?.school||''}
            </div>
            {post.is_pinned && <Pin size={11} color="var(--c-gold)"/>}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:TYPE_COLORS[post.post_type]||'var(--c-muted)', background:`${TYPE_COLORS[post.post_type]||'var(--c-muted)'}18`, padding:'2px 8px', borderRadius:'2px' }}>
              {TYPE_LABELS[post.post_type]||post.post_type}
            </span>
          </div>
          <h3 style={{ fontFamily:'var(--f-serif)', fontSize:'16px', fontWeight:600, marginBottom:'6px', lineHeight:1.4 }}>{post.title}</h3>
          <p style={{ fontSize:'13px', color:'var(--c-muted)', lineHeight:1.6, marginBottom:'12px',
            display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden'
          }}>{post.body}</p>
          <div style={{ display:'flex', gap:'14px', alignItems:'center' }}>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'#bbb', display:'flex', alignItems:'center', gap:'3px' }}><MessageCircle size={11}/>{post.reply_count||0}</span>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'#bbb', display:'flex', alignItems:'center', gap:'3px' }}><Heart size={11}/>{post.like_count||0}</span>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'#bbb', display:'flex', alignItems:'center', gap:'3px' }}><Eye size={11}/>{post.view_count||0}</span>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'#ccc', marginLeft:'auto' }}>{date}</span>
            {(post.tags||[]).slice(0,2).map(t=><span key={t} className="tag">{t}</span>)}
          </div>
        </div>
      </div>
    </div>
  )
}

function NewPostModal({ onClose }) {
  const [form, setForm] = useState({ title:'', body:'', postType:'free', tags:'' })
  const [error, setError] = useState('')
  const createPost = useCreatePost()
  const up = (k,v) => setForm(f=>({...f,[k]:v}))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.title.trim().length < 2) return setError('제목을 2자 이상 입력해주세요')
    if (form.body.trim().length < 10) return setError('내용을 10자 이상 입력해주세요')
    try {
      await createPost.mutateAsync({
        title: form.title, body: form.body,
        postType: form.postType,
        tags: form.tags.split(',').map(t=>t.trim()).filter(Boolean),
      })
      onClose()
    } catch(e) { setError(e.message) }
  }

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{ maxWidth:'600px' }}>
        <div className="modal-header">
          <div className="modal-title">새 글 작성</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'var(--c-muted)' }}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div style={{ background:'var(--c-red-dim)', color:'var(--c-red)', padding:'10px 14px', fontSize:'13px', marginBottom:'14px' }}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <label className="label">카테고리</label>
            <select className="input" value={form.postType} onChange={e=>up('postType',e.target.value)} style={{ marginBottom:'12px' }}>
              {POST_TYPES.filter(t=>t.id!=='all'&&t.id!=='notice').map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <label className="label">제목</label>
            <input className="input" value={form.title} onChange={e=>up('title',e.target.value)} placeholder="제목을 입력하세요" maxLength={200} required style={{ marginBottom:'12px' }}/>
            <label className="label">내용</label>
            <textarea className="input" value={form.body} onChange={e=>up('body',e.target.value)} placeholder="내용을 입력하세요 (최대 10,000자)" rows={8} maxLength={10000} required style={{ marginBottom:'12px', resize:'vertical' }}/>
            <label className="label">태그 (쉼표 구분, 선택사항)</label>
            <input className="input" value={form.tags} onChange={e=>up('tags',e.target.value)} placeholder="AI창업, 팀빌딩, 투자" style={{ marginBottom:'20px' }}/>
            <button type="submit" className="btn btn-gold btn-full" disabled={createPost.isPending}>
              {createPost.isPending ? '게시 중...' : '게시하기'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function CommunityPage() {
  const [activeType, setActiveType] = useState('all')
  const [showNew, setShowNew] = useState(false)
  const { user } = useAuthStore()
  const { data: posts = [], isLoading } = usePosts({ postType: activeType })

  const HOT = ['AI창업', '청소년창업', 'MVP', '투자유치', '에듀테크', '린스타트업', '팀빌딩', '사업계획서', '정부지원', '피벗']
  const POPULAR_TITLES = [
    'MVP 없이 투자 받은 고2의 피치덱 공개',
    '창업동아리 vs 창업 실전 — 어떤 선택이 맞을까',
    'Notion으로 만든 무료 사업계획서 템플릿 배포',
    '고등학생이 세금 신고하는 방법 총정리',
    '첫 번째 고객을 만난 그 날 — 감동 에피소드 모음',
  ]

  return (
    <div style={{ paddingBottom:'64px' }}>
      <div style={{ padding:'40px 0 24px', display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:'16px' }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom:'8px' }}>COMMUNITY</div>
          <h1 style={{ fontFamily:'var(--f-serif)', fontSize:'34px', fontWeight:700, marginBottom:'8px' }}>창업 커뮤니티</h1>
          <p style={{ color:'var(--c-muted)', fontSize:'14px' }}>청소년 창업가들이 모여 이야기를 나누고 서로 돕는 공간입니다.</p>
        </div>
        {user && <button className="btn btn-gold" onClick={()=>setShowNew(true)}>+ 새 글 작성</button>}
      </div>

      <div style={{ display:'flex', gap:'24px', alignItems:'flex-start' }}>
        {/* Feed */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', gap:'0', borderBottom:'2px solid var(--c-border)', marginBottom:'0' }}>
            {POST_TYPES.map(t=>(
              <button key={t.id} onClick={()=>setActiveType(t.id)}
                style={{ padding:'10px 16px', background:'none', border:'none', borderBottom:`2px solid ${activeType===t.id?'var(--c-ink)':'transparent'}`, marginBottom:'-2px', fontFamily:'var(--f-mono)', fontSize:'11px', letterSpacing:'1px', color:activeType===t.id?'var(--c-ink)':'var(--c-muted)', cursor:'pointer', fontWeight:activeType===t.id?700:400 }}
              >{t.label}</button>
            ))}
          </div>
          <div style={{ border:'1px solid var(--c-border)', borderTop:'none' }}>
            {isLoading ? (
              [...Array(5)].map((_,i)=>(
                <div key={i} style={{ padding:'20px 24px', borderBottom:'1px solid var(--c-border)' }}>
                  <div className="skeleton skeleton-text" style={{ width:'40%', height:'14px', marginBottom:'8px' }}/>
                  <div className="skeleton skeleton-text"/>
                  <div className="skeleton skeleton-text" style={{ width:'70%' }}/>
                </div>
              ))
            ) : posts.length > 0 ? (
              posts.map(p=><PostCard key={p.id} post={p}/>)
            ) : (
              <div style={{ padding:'60px 24px', textAlign:'center', color:'var(--c-muted)' }}>
                <div style={{ fontSize:'32px', marginBottom:'12px' }}>💬</div>
                <div style={{ fontFamily:'var(--f-serif)', fontSize:'16px', marginBottom:'8px' }}>아직 게시글이 없습니다</div>
                {user ? <button className="btn btn-gold btn-sm" onClick={()=>setShowNew(true)}>첫 글 작성하기</button>
                  : <div style={{ fontSize:'13px' }}>로그인 후 글을 작성해보세요</div>}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ width:'300px', flexShrink:0 }}>
          <div className="card" style={{ padding:'20px', marginBottom:'12px' }}>
            <div className="t-eyebrow" style={{ marginBottom:'14px' }}>인기 게시물</div>
            {POPULAR_TITLES.map((t,i)=>(
              <div key={i} style={{ display:'flex', gap:'10px', marginBottom:'12px', cursor:'pointer' }}>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:'14px', color:'var(--c-border)', fontWeight:700, minWidth:'20px' }}>{i+1}</div>
                <div style={{ fontSize:'13px', lineHeight:1.4 }}>{t}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding:'20px', marginBottom:'12px' }}>
            <div className="t-eyebrow" style={{ marginBottom:'14px' }}>인기 태그</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
              {HOT.map(t=><span key={t} className="tag" style={{ cursor:'pointer' }}>#{t}</span>)}
            </div>
          </div>
          <div className="card" style={{ padding:'20px' }}>
            <div className="t-eyebrow" style={{ marginBottom:'14px' }}>이번 주 멘토링</div>
            {[
              { title:'투자 유치 기초반', date:'3/20 목 19:00', type:'온라인' },
              { title:'사업계획서 피드백 세션', date:'3/22 토 14:00', type:'온라인' },
            ].map(m=>(
              <div key={m.title} style={{ background:'var(--c-cream)', padding:'12px', marginBottom:'8px' }}>
                <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'3px' }}>{m.title}</div>
                <div style={{ fontSize:'11px', color:'var(--c-muted)', fontFamily:'var(--f-mono)', marginBottom:'8px' }}>{m.date} · {m.type}</div>
                <button className="btn btn-gold btn-sm btn-full">신청하기</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showNew && <NewPostModal onClose={()=>setShowNew(false)}/>}
      <style>{`@media(max-width:768px){div[style*="width:300px"]{display:none}}`}</style>
    </div>
  )
}
