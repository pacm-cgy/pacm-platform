import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { MessageCircle, Heart, Eye, PenSquare, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { usePosts, useCreatePost } from '../hooks/useData'
import { useAuthStore } from '../store'
import { validateInput, checkRateLimit } from '../lib/security'

const POST_TYPES = [
  { id: 'all',      label: '전체' },
  { id: 'question', label: '질문/답변' },
  { id: 'feedback', label: '사업 피드백' },
  { id: 'recruit',  label: '팀원 모집' },
  { id: 'free',     label: '자유게시판' },
  { id: 'notice',   label: '공지' },
]
const TYPE_LABELS = { question:'질문', feedback:'피드백', recruit:'팀원 모집', free:'자유', notice:'공지' }
const TYPE_COLORS = { question:'var(--c-blue)', feedback:'var(--c-gold)', recruit:'var(--c-green)', free:'var(--c-muted)', notice:'var(--c-red)' }

function PostCard({ post }) {
  const navigate = useNavigate()
  const author = post.profiles
  const date = post.created_at ? format(new Date(post.created_at), 'M월 d일', { locale: ko }) : ''
  return (
    <div className="card card-clickable" onClick={() => navigate(`/community/${post.id}`)} style={{ padding: '20px 24px', borderBottom: '1px solid var(--c-border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {post.is_pinned && <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-red)', border: '1px solid var(--c-red)', padding: '1px 6px' }}>PINNED</span>}
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: TYPE_COLORS[post.post_type] || 'var(--c-muted)', border: `1px solid ${TYPE_COLORS[post.post_type] || 'var(--c-border)'}`, padding: '1px 6px' }}>
            {TYPE_LABELS[post.post_type] || post.post_type}
          </span>
        </div>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)', whiteSpace: 'nowrap' }}>{date}</span>
      </div>
      <div style={{ fontFamily: 'var(--f-serif)', fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>{post.title}</div>
      {post.content && <div style={{ fontSize: '13px', color: 'var(--c-muted)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.content}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--c-gray-6)' }}>
          <div className="avatar" style={{ width: '18px', height: '18px', fontSize: '10px' }}>
            {author?.avatar_url ? <img src={author.avatar_url} alt="" /> : (author?.display_name?.[0] || 'U')}
          </div>
          {author?.display_name || '익명'}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginLeft: 'auto' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>
            <Eye size={10} /> {post.view_count || 0}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>
            <Heart size={10} /> {post.like_count || 0}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>
            <MessageCircle size={10} /> {post.comment_count || 0}
          </span>
        </div>
      </div>
    </div>
  )
}

function WriteModal({ onClose }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [postType, setPostType] = useState('free')
  const [err, setErr] = useState('')
  const { user } = useAuthStore()
  const createPost = useCreatePost()

  const handleSubmit = async () => {
    const limit = checkRateLimit('post_create', 5, 60000)
    if (limit.limited) { setErr(`잠시 후 다시 시도해주세요 (${limit.retryAfter}초)`); return }
    const titleCheck = validateInput(title.trim(), 200)
    const contentCheck = validateInput(content.trim(), 5000)
    if (!title.trim()) { setErr('제목을 입력해주세요'); return }
    if (!titleCheck.ok) { setErr(titleCheck.error); return }
    if (!contentCheck.ok) { setErr(contentCheck.error); return }
    try {
      await createPost.mutateAsync({ title: title.trim(), content: content.trim(), post_type: postType })
      onClose()
    } catch (e) {
      setErr('게시글 작성 중 오류가 발생했습니다')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: '560px', padding: '32px' }}>
        <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px', fontWeight: 700, marginBottom: '24px' }}>새 글 작성</div>
        <select value={postType} onChange={e => setPostType(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', background: 'var(--c-gray-2)', border: '1px solid var(--c-border)', color: 'var(--c-paper)', fontFamily: 'var(--f-mono)', fontSize: '12px', marginBottom: '12px' }}>
          {POST_TYPES.filter(t => t.id !== 'all' && t.id !== 'notice').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="제목을 입력하세요"
          maxLength={200}
          style={{ width: '100%', padding: '10px 12px', background: 'var(--c-gray-2)', border: '1px solid var(--c-border)', color: 'var(--c-paper)', fontFamily: 'var(--f-sans)', fontSize: '14px', marginBottom: '12px' }} />
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="내용을 입력하세요" rows={6}
          maxLength={5000}
          style={{ width: '100%', padding: '10px 12px', background: 'var(--c-gray-2)', border: '1px solid var(--c-border)', color: 'var(--c-paper)', fontFamily: 'var(--f-sans)', fontSize: '14px', resize: 'vertical', marginBottom: '12px' }} />
        {err && <div style={{ display: 'flex', gap: '6px', alignItems: 'center', color: 'var(--c-red)', fontSize: '12px', marginBottom: '12px' }}><AlertCircle size={12}/>{err}</div>}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-outline btn-sm">취소</button>
          <button onClick={handleSubmit} disabled={createPost.isPending} className="btn btn-gold btn-sm">
            {createPost.isPending ? '작성 중...' : '게시하기'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CommunityPage() {
  const [activeType, setActiveType] = useState('all')
  const [showWrite, setShowWrite] = useState(false)
  const { user } = useAuthStore()
  const { data: posts = [], isLoading } = usePosts({ post_type: activeType === 'all' ? null : activeType })

  return (
    <div style={{ paddingBottom: '80px' }}>
      {showWrite && <WriteModal onClose={() => setShowWrite(false)} />}

      {/* 헤더 */}
      <div style={{ padding: '40px 0 0', borderBottom: '1px solid var(--c-gray-3)' }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div className="t-eyebrow" style={{ marginBottom: '8px' }}>COMMUNITY</div>
              <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, marginBottom: '6px' }}>창업 커뮤니티</h1>
              <p style={{ color: 'var(--c-muted)', fontSize: '13px' }}>청소년 창업가들이 모여 이야기를 나누고 서로 돕는 공간입니다.</p>
            </div>
            <button onClick={() => user ? setShowWrite(true) : alert('로그인이 필요합니다')} className="btn btn-gold" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PenSquare size={14} /> 글 쓰기
            </button>
          </div>
          {/* 탭 */}
          <div style={{ display: 'flex', gap: '0', overflowX: 'auto' }}>
            {POST_TYPES.map(t => (
              <button key={t.id} onClick={() => setActiveType(t.id)}
                style={{
                  padding: '10px 16px', background: 'none', border: 'none', whiteSpace: 'nowrap',
                  borderBottom: `2px solid ${activeType === t.id ? 'var(--c-gold)' : 'transparent'}`,
                  marginBottom: '-1px', fontFamily: 'var(--f-mono)', fontSize: '11px', letterSpacing: '1px',
                  color: activeType === t.id ? 'var(--c-paper)' : 'var(--c-muted)', cursor: 'pointer',
                  fontWeight: activeType === t.id ? 700 : 400, transition: 'var(--t-fast)'
                }}>{t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 게시글 목록 */}
      <div className="container" style={{ marginTop: '24px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[0,1,2,3].map(i => <div key={i} className="card skeleton" style={{ height: '100px' }} />)}
          </div>
        ) : posts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {posts.map(p => <PostCard key={p.id} post={p} />)}
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '80px 20px', gap: '16px',
          }}>
            <MessageCircle size={40} color="var(--c-gray-4)" />
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px', color: 'var(--c-paper)' }}>아직 게시글이 없습니다</div>
            <p style={{ color: 'var(--c-muted)', fontSize: '13px', textAlign: 'center' }}>첫 번째 글을 작성해보세요!</p>
            <button onClick={() => user ? setShowWrite(true) : alert('로그인이 필요합니다')} className="btn btn-gold btn-sm">
              <PenSquare size={12} /> 첫 글 작성하기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
