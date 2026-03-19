import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowLeft, Heart, Eye, MessageCircle, Trash2, Send, CornerDownRight, Flag } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store'

function usePost(id) {
  return useQuery({
    queryKey: ['post', id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('community_posts')
        .select(`*, profiles!author_id(id, display_name, avatar_url, startup_name, school)`)
        .eq('id', id).eq('is_deleted', false).maybeSingle()
      if (error) throw error
      if (!data) throw new Error('게시글을 찾을 수 없습니다')
      // 조회수 증가 (fire & forget)
      setTimeout(async () => {
        const { error: rpcErr } = await supabase.rpc('increment_post_view', { post_id: id })
        if (rpcErr) {
          await supabase.from('community_posts')
            .update({ view_count: (data.view_count||0)+1 }).eq('id', id)
        }
      }, 500)
      return data
    },
    enabled: !!id,
    staleTime: 0,
  })
}

function useComments(postId) {
  return useQuery({
    queryKey: ['comments', postId],
    queryFn: async () => {
      if (!postId) return []
      const { data, error } = await supabase
        .from('comments')
        .select(`id, body, created_at, author_id, like_count, parent_id,
          profiles!author_id(id, display_name, avatar_url)`)
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
      if (error) return []
      return data || []
    },
    enabled: !!postId,
  })
}

const TYPE_LABELS = { free:'자유', question:'질문', recruit:'팀원모집', feedback:'피드백', notice:'공지' }
const TYPE_COLORS = { free:'var(--c-muted)', question:'#60A5FA', recruit:'var(--c-gold)', feedback:'#34D399', notice:'var(--c-red)' }

function CommentItem({ comment, onReply, onLike, onDelete, currentUserId, depth=0 }) {
  const [showReply, setShowReply] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [liked, setLiked] = useState(false)

  const date = format(new Date(comment.created_at), 'M월 d일 H:mm', { locale: ko })
  const isAuthor = currentUserId === comment.author_id

  const handleLike = () => {
    setLiked(l => !l)
    onLike(comment.id, liked)
  }

  return (
    <div style={{ marginLeft: depth > 0 ? '28px' : '0', marginBottom:'2px' }}>
      <div style={{ padding:'14px 0', borderBottom:'1px solid var(--c-border)' }}>
        <div style={{ display:'flex', gap:'10px' }}>
          <div className="avatar" style={{ width:'28px', height:'28px', fontSize:'11px', flexShrink:0 }}>
            {comment.profiles?.avatar_url ? <img src={comment.profiles.avatar_url} alt=""/> : comment.profiles?.display_name?.[0]||'U'}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
              <span style={{ fontSize:'13px', fontWeight:600 }}>{comment.profiles?.display_name||'익명'}</span>
              <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-gray-5)' }}>{date}</span>
              {depth > 0 && <CornerDownRight size={11} color="var(--c-gray-5)"/>}
            </div>
            <div style={{ fontSize:'14px', lineHeight:1.7, color:'var(--c-paper)', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
              {comment.body}
            </div>
            {/* 액션 버튼 */}
            <div style={{ display:'flex', gap:'12px', marginTop:'8px' }}>
              <button onClick={handleLike}
                style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px', fontFamily:'var(--f-mono)', fontSize:'11px', color: liked ? 'var(--c-red)' : 'var(--c-gray-5)', padding:0 }}>
                <Heart size={12} fill={liked?'currentColor':'none'}/> {(comment.like_count||0) + (liked?1:0)}
              </button>
              {depth === 0 && (
                <button onClick={() => setShowReply(s=>!s)}
                  style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px', fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-gray-5)', padding:0 }}>
                  <CornerDownRight size={12}/> 답글
                </button>
              )}
              {isAuthor && (
                <button onClick={() => onDelete(comment.id)}
                  style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px', fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-red)', padding:0, marginLeft:'auto' }}>
                  <Trash2 size={11}/> 삭제
                </button>
              )}
            </div>
            {/* 답글 입력 */}
            {showReply && depth === 0 && (
              <div style={{ display:'flex', gap:'6px', marginTop:'10px' }}>
                <input value={replyText} onChange={e=>setReplyText(e.target.value)}
                  placeholder="답글을 입력하세요..." maxLength={2000}
                  onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); onReply(comment.id, replyText); setReplyText(''); setShowReply(false) } }}
                  style={{ flex:1, padding:'7px 10px', background:'var(--c-gray-2)', border:'1px solid var(--c-border)', color:'var(--c-paper)', fontSize:'13px', fontFamily:'var(--f-sans)', outline:'none' }}/>
                <button onClick={() => { onReply(comment.id, replyText); setReplyText(''); setShowReply(false) }}
                  style={{ padding:'7px 12px', background:'var(--c-gold)', border:'none', cursor:'pointer' }}>
                  <Send size={13} color="#000"/>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PostDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const { data: post, isLoading, isError } = usePost(id)
  const { data: allComments = [] } = useComments(id)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [liked, setLiked] = useState(false)

  // 댓글 트리 구성
  const topComments = allComments.filter(c => !c.parent_id)
  const replies = allComments.filter(c => c.parent_id)
  const getReплies = (parentId) => replies.filter(r => r.parent_id === parentId)

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
      qc.invalidateQueries({ queryKey: ['post', id] })
      // reply_count 직접 증가
      if (post) {
        await supabase.from('community_posts')
          .update({ reply_count: (post.reply_count||0)+1 }).eq('id', id)
      }
    } catch(e) {
      alert('댓글 작성 실패: ' + e.message?.slice(0,50))
    } finally { setSubmitting(false) }
  }

  const handleReply = async (parentId, body) => {
    if (!user) { alert('로그인이 필요합니다'); return }
    if (!body?.trim()) return
    await supabase.from('comments').insert({ post_id: id, body: body.trim(), author_id: user.id, parent_id: parentId })
    qc.invalidateQueries({ queryKey: ['comments', id] })
  }

  const handleCommentLike = async (commentId, wasLiked) => {
    if (!user) { alert('로그인이 필요합니다'); return }
    const newLikeCount = wasLiked ? -1 : 1
    await supabase.from('comments')
      .update({ like_count: supabase.rpc ? undefined : undefined })
      .eq('id', commentId)
    // 직접 like_count 업데이트
    const target = allComments.find(c=>c.id===commentId)
    if (target) {
      await supabase.from('comments')
        .update({ like_count: Math.max(0, (target.like_count||0) + newLikeCount) })
        .eq('id', commentId)
      qc.invalidateQueries({ queryKey: ['comments', id] })
    }
  }

  const handleCommentDelete = async (commentId) => {
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return
    await supabase.from('comments').delete().eq('id', commentId)
    qc.invalidateQueries({ queryKey: ['comments', id] })
    if (post) {
      await supabase.from('community_posts')
        .update({ reply_count: Math.max(0, (post.reply_count||0)-1) }).eq('id', id)
      qc.invalidateQueries({ queryKey: ['post', id] })
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('게시글을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('community_posts').update({ is_deleted: true }).eq('id', id)
    if (!error) navigate('/community')
  }

  const handleLikePost = async () => {
    if (!user) { alert('로그인이 필요합니다'); return }
    setLiked(l => !l)
    await supabase.from('community_posts')
      .update({ like_count: Math.max(0, (post?.like_count||0) + (liked?-1:1)) }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['post', id] })
  }

  if (isLoading) return (
    <div className="container" style={{ padding:'40px var(--pad-x) 80px' }}>
      {[...Array(5)].map((_,i) => <div key={i} className="skeleton skeleton-text" style={{ height:i===0?'28px':'16px', width:['60%','100%','90%','100%','40%'][i], marginBottom:'14px' }}/>)}
    </div>
  )

  if (isError || !post) return (
    <div className="container" style={{ textAlign:'center', padding:'80px var(--pad-x)' }}>
      <div style={{ fontSize:'48px', marginBottom:'16px' }}>404</div>
      <div style={{ fontFamily:'var(--f-serif)', fontSize:'18px', marginBottom:'16px' }}>게시글을 찾을 수 없습니다</div>
      <button onClick={() => navigate('/community')} className="btn btn-gold">커뮤니티로</button>
    </div>
  )

  const isAuthor = user?.id === post.author_id
  const date = format(new Date(post.created_at), 'yyyy년 M월 d일 HH:mm', { locale: ko })

  return (
    <div style={{ paddingBottom:'80px' }}>
      <div style={{ borderBottom:'1px solid var(--c-gray-3)', padding:'14px 0' }}>
        <div className="container">
          <button onClick={() => navigate('/community')} style={{ display:'flex', alignItems:'center', gap:'8px', background:'none', border:'none', color:'var(--c-muted)', fontSize:'13px', fontFamily:'var(--f-mono)', cursor:'pointer' }}>
            <ArrowLeft size={14}/> 커뮤니티
          </button>
        </div>
      </div>

      <div className="container" style={{ maxWidth:'760px', margin:'0 auto', padding:'40px var(--pad-x)' }}>
        {/* 헤더 */}
        <div style={{ marginBottom:'24px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', padding:'2px 8px', border:'1px solid', borderColor:TYPE_COLORS[post.post_type]||'var(--c-border)', color:TYPE_COLORS[post.post_type]||'var(--c-muted)' }}>
              {TYPE_LABELS[post.post_type]||post.post_type}
            </span>
            {post.is_pinned && <span style={{ fontFamily:'var(--f-mono)', fontSize:'10px', padding:'2px 8px', border:'1px solid var(--c-red)', color:'var(--c-red)' }}>📌 고정</span>}
          </div>
          <h1 style={{ fontFamily:'var(--f-serif)', fontSize:'clamp(20px,3.5vw,28px)', fontWeight:700, lineHeight:1.3, marginBottom:'16px' }}>{post.title}</h1>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingBottom:'20px', borderBottom:'1px solid var(--c-gray-3)', flexWrap:'wrap', gap:'10px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <div className="avatar avatar-sm" onClick={() => navigate(`/profile/${post.profiles?.id}`)} style={{ cursor:'pointer' }}>
                {post.profiles?.avatar_url ? <img src={post.profiles.avatar_url} alt=""/> : post.profiles?.display_name?.[0]||'U'}
              </div>
              <div>
                <div style={{ fontSize:'14px', fontWeight:600, cursor:'pointer' }} onClick={() => navigate(`/profile/${post.profiles?.id}`)}>
                  {post.profiles?.display_name||'익명'}
                </div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:'10px', color:'var(--c-muted)' }}>{date}</div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
              <span style={{ display:'flex', alignItems:'center', gap:'4px', fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-muted)' }}>
                <Eye size={12}/> {post.view_count||0}
              </span>
              <span style={{ display:'flex', alignItems:'center', gap:'4px', fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-muted)' }}>
                <MessageCircle size={12}/> {allComments.length}
              </span>
              {isAuthor && (
                <button onClick={handleDelete} style={{ background:'none', border:'none', color:'var(--c-red)', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px', fontSize:'12px' }}>
                  <Trash2 size={13}/> 삭제
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 본문 */}
        <div style={{ fontSize:'15px', lineHeight:1.9, color:'var(--c-paper)', marginBottom:'32px', whiteSpace:'pre-wrap', minHeight:'80px', wordBreak:'break-word' }}>
          {post.body||post.content||'(내용 없음)'}
        </div>

        {/* 태그 */}
        {post.tags?.length > 0 && (
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'24px' }}>
            {post.tags.map(t=><span key={t} className="tag">{t}</span>)}
          </div>
        )}

        {/* 좋아요 */}
        <div style={{ display:'flex', gap:'10px', marginBottom:'36px', paddingTop:'16px', borderTop:'1px solid var(--c-border)' }}>
          <button onClick={handleLikePost} className="btn btn-outline"
            style={{ gap:'6px', color:liked?'var(--c-red)':undefined, borderColor:liked?'var(--c-red)44':undefined }}>
            <Heart size={14} fill={liked?'currentColor':'none'}/>
            {(post.like_count||0)+(liked?1:0)} 좋아요
          </button>
        </div>

        {/* 댓글 섹션 */}
        <div>
          <div style={{ fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-gold)', letterSpacing:'2px', marginBottom:'16px' }}>
            COMMENTS ({allComments.length})
          </div>

          {/* 댓글 목록 */}
          {topComments.map(c => (
            <div key={c.id}>
              <CommentItem comment={c} onReply={handleReply} onLike={handleCommentLike} onDelete={handleCommentDelete} currentUserId={user?.id} depth={0}/>
              {/* 대댓글 */}
              {getReплies(c.id).map(r => (
                <CommentItem key={r.id} comment={r} onReply={handleReply} onLike={handleCommentLike} onDelete={handleCommentDelete} currentUserId={user?.id} depth={1}/>
              ))}
            </div>
          ))}

          {/* 댓글 입력 */}
          <div style={{ marginTop:'20px' }}>
            <div style={{ display:'flex', gap:'8px', alignItems:'flex-start' }}>
              <div className="avatar" style={{ width:'32px', height:'32px', fontSize:'12px', flexShrink:0, marginTop:'4px' }}>
                {user ? (profile?.avatar_url ? <img src={profile.avatar_url} alt=""/> : profile?.display_name?.[0]||'U') : 'G'}
              </div>
              <div style={{ flex:1 }}>
                <textarea value={comment} onChange={e=>setComment(e.target.value)}
                  placeholder={user ? "댓글을 입력하세요..." : "로그인 후 댓글을 달 수 있습니다"}
                  disabled={!user} rows={3} maxLength={2000}
                  style={{ width:'100%', padding:'10px 12px', background:'var(--c-gray-1)', border:'1px solid var(--c-border)', color:'var(--c-paper)', fontSize:'14px', fontFamily:'var(--f-sans)', resize:'vertical', outline:'none', boxSizing:'border-box' }}
                  onKeyDown={e => { if (e.key==='Enter'&&e.metaKey) handleComment() }}/>
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'6px' }}>
                  <button onClick={handleComment} disabled={submitting||!user||!comment.trim()} className="btn btn-gold btn-sm" style={{ gap:'6px' }}>
                    <Send size={13}/> {submitting ? '작성 중...' : '댓글 달기'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// profile을 useAuthStore에서도 사용
function useProfile() {
  return useAuthStore(s => s.profile)
}
const profile = { avatar_url: null }
