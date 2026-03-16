import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowLeft, Heart, Eye, MessageCircle, Trash2, Send } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store'

function usePost(id) {
  return useQuery({
    queryKey: ['post', id],
    queryFn: async () => {
      if (!id) return null
      // 조회수 증가
      supabase.from('community_posts').update({ view_count: supabase.rpc('increment_post_view', {post_id: id}) }).eq('id', id).then(() => {})
      const { data, error } = await supabase
        .from('community_posts')
        .select(`*, profiles!author_id(id, display_name, avatar_url, startup_name, school)`)
        .eq('id', id)
        .eq('is_deleted', false)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('게시글을 찾을 수 없습니다')
      return data
    },
    enabled: !!id,
  })
}

function useComments(postId) {
  return useQuery({
    queryKey: ['comments', postId],
    queryFn: async () => {
      if (!postId) return []
      const { data, error } = await supabase
        .from('comments')
        .select(`id, body, created_at, author_id, profiles!author_id(id, display_name, avatar_url)`)
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
      if (error) return [] // 테이블 없으면 빈 배열
      return data || []
    },
    enabled: !!postId,
  })
}

const TYPE_LABELS = { free: '자유', question: '질문', recruit: '팀원모집', feedback: '피드백', notice: '공지' }
const TYPE_COLORS = { free: 'var(--c-muted)', question: '#60A5FA', recruit: 'var(--c-gold)', feedback: '#34D399', notice: 'var(--c-red)' }

export default function PostDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const qc = useQueryClient()
  const { data: post, isLoading, isError } = usePost(id)
  const { data: comments = [] } = useComments(id)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleComment = async () => {
    if (!user) { alert('로그인이 필요합니다'); return }
    if (!comment.trim()) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from('comments').insert({
        post_id: id, body: comment.trim(), author_id: user.id
      })
      if (error) throw error
      setComment('')
      qc.invalidateQueries({ queryKey: ['comments', id] })
    } catch(e) {
      alert('댓글 작성 실패: ' + e.message?.slice(0,50))
    } finally { setSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!window.confirm('게시글을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('community_posts').update({ is_deleted: true }).eq('id', id)
    if (!error) navigate('/community')
  }

  if (isLoading) return (
    <div className="container" style={{ padding: '40px var(--pad-x) 80px' }}>
      {[...Array(5)].map((_, i) => <div key={i} className="skeleton skeleton-text" style={{ height: i === 0 ? '28px' : '16px', width: ['60%','100%','90%','100%','40%'][i], marginBottom: '14px' }} />)}
    </div>
  )

  if (isError || !post) return (
    <div className="container" style={{ textAlign: 'center', padding: '80px var(--pad-x)' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>404</div>
      <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px', marginBottom: '16px' }}>게시글을 찾을 수 없습니다</div>
      <button onClick={() => navigate('/community')} className="btn btn-gold">커뮤니티로</button>
    </div>
  )

  const isAuthor = user?.id === post.author_id
  const date = format(new Date(post.created_at), 'yyyy년 M월 d일 HH:mm', { locale: ko })

  return (
    <div style={{ paddingBottom: '80px' }}>
      <div style={{ borderBottom: '1px solid var(--c-gray-3)', padding: '14px 0' }}>
        <div className="container">
          <button onClick={() => navigate('/community')} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: 'var(--c-muted)', fontSize: '13px', fontFamily: 'var(--f-mono)', cursor: 'pointer' }}>
            <ArrowLeft size={14} /> 커뮤니티
          </button>
        </div>
      </div>

      <div className="container" style={{ maxWidth: '760px', margin: '0 auto', padding: '40px var(--pad-x)' }}>
        {/* 헤더 */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', padding: '2px 8px', border: '1px solid', borderColor: TYPE_COLORS[post.post_type] || 'var(--c-border)', color: TYPE_COLORS[post.post_type] || 'var(--c-muted)' }}>
              {TYPE_LABELS[post.post_type] || post.post_type}
            </span>
            {post.is_pinned && <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', padding: '2px 8px', border: '1px solid var(--c-red)', color: 'var(--c-red)' }}>PINNED</span>}
          </div>
          <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px,3.5vw,28px)', fontWeight: 700, lineHeight: 1.3, marginBottom: '16px' }}>{post.title}</h1>

          {/* 작성자 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '20px', borderBottom: '1px solid var(--c-gray-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="avatar avatar-sm">
                {post.profiles?.avatar_url ? <img src={post.profiles.avatar_url} alt="" /> : (post.profiles?.display_name?.[0] || 'U')}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{post.profiles?.display_name || '익명'}</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-muted)' }}>{date}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)' }}>
                <Eye size={12} /> {post.view_count || 0}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)' }}>
                <MessageCircle size={12} /> {comments.length}
              </span>
              {isAuthor && (
                <button onClick={handleDelete} style={{ background: 'none', border: 'none', color: 'var(--c-red)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                  <Trash2 size={13} /> 삭제
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 본문 */}
        <div style={{ fontSize: '15px', lineHeight: 1.9, color: 'var(--c-paper)', marginBottom: '40px', whiteSpace: 'pre-wrap', minHeight: '80px' }}>
          {post.body || post.content || '(내용 없음)'}
        </div>

        {/* 댓글 */}
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gold)', letterSpacing: '2px', marginBottom: '20px' }}>
            COMMENTS · {comments.length}
          </div>

          {/* 댓글 작성 */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            <div className="avatar avatar-sm" style={{ flexShrink: 0, marginTop: '2px' }}>
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile?.display_name?.[0] || '?')}
            </div>
            <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
              <input
                value={comment}
                onChange={e => setComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleComment()}
                placeholder={user ? '댓글을 입력하세요 (Enter로 전송)' : '로그인 후 댓글을 작성하세요'}
                disabled={!user}
                style={{ flex: 1, padding: '10px 14px', background: 'var(--c-gray-2)', border: '1px solid var(--c-gray-3)', color: 'var(--c-paper)', fontFamily: 'var(--f-sans)', fontSize: '14px' }}
              />
              <button onClick={handleComment} disabled={!user || submitting || !comment.trim()} className="btn btn-gold btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <Send size={13} /> 전송
              </button>
            </div>
          </div>

          {/* 댓글 목록 */}
          {comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--c-muted)', fontFamily: 'var(--f-mono)', fontSize: '12px' }}>
              첫 번째 댓글을 남겨보세요
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {comments.map(c => (
                <div key={c.id} className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div className="avatar avatar-sm">
                      {c.profiles?.avatar_url ? <img src={c.profiles.avatar_url} alt="" /> : (c.profiles?.display_name?.[0] || 'U')}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{c.profiles?.display_name || '익명'}</div>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-muted)', marginLeft: 'auto' }}>
                      {format(new Date(c.created_at), 'M.d HH:mm', { locale: ko })}
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--c-paper)', paddingLeft: '34px' }}>{c.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
