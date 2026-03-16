import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Heart, Bookmark, Share2, ArrowLeft, Clock, Eye } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useArticle } from '../hooks/useArticle'
import { useLikeArticle, useToggleBookmark, useIsBookmarked } from '../hooks/useData'
import { useAuthStore } from '../store'


function BookmarkButton({ articleId }) {
  const { data: isBookmarked = false } = useIsBookmarked(articleId)
  const toggle = useToggleBookmark()
  const { user } = useAuthStore()

  return (
    <button
      className="btn btn-outline"
      style={{ gap: '6px', color: isBookmarked ? 'var(--c-gold)' : undefined, borderColor: isBookmarked ? 'var(--c-gold)' : undefined }}
      onClick={() => {
        if (!user) { alert('로그인이 필요합니다'); return }
        toggle.mutate({ articleId, isBookmarked })
      }}
      disabled={toggle.isPending}
    >
      <Bookmark size={14} fill={isBookmarked ? 'currentColor' : 'none'} />
      {isBookmarked ? '저장됨' : '북마크'}
    </button>
  )
}

export default function ArticlePage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { data: article, isLoading, isError } = useArticle(slug)
  const [progress, setProgress] = useState(0)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const likeMutation = useLikeArticle()
  const { user } = useAuthStore()

  useEffect(() => {
    if (article) setLikeCount(article.like_count || 0)
  }, [article])

  useEffect(() => {
    const handler = () => {
      const el = document.documentElement
      const pct = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100
      setProgress(Math.min(100, pct))
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const handleLike = () => {
    if (!user) return
    const next = !liked
    setLiked(next)
    setLikeCount(c => next ? c+1 : c-1)
    likeMutation.mutate({ articleId: article.id, liked })
  }

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: article.title, url: window.location.href })
    } else {
      navigator.clipboard.writeText(window.location.href)
    }
  }

  if (isLoading) return (
    <div style={{ maxWidth:'720px', margin:'0 auto', padding:'40px 0 80px' }}>
      {[...Array(8)].map((_,i)=>(
        <div key={i} className="skeleton skeleton-text" style={{ width:['60%','100%','90%','100%','70%','100%','85%','50%'][i], height:i===0?'32px':i===2?'22px':'16px', marginBottom:'14px' }}/>
      ))}
    </div>
  )

  if (isError || !article) return (
    <div style={{ textAlign:'center', padding:'80px 0' }}>
      <div style={{ fontSize:'48px', marginBottom:'16px' }}>404</div>
      <div style={{ fontFamily:'var(--f-serif)', fontSize:'20px', marginBottom:'16px' }}>아티클을 찾을 수 없습니다</div>
      <button className="btn btn-gold" onClick={()=>navigate('/')}>홈으로</button>
    </div>
  )

  const CATEGORY_LABELS = { insight:'INSIGHT', story:'FOUNDER STORY', trend:'TREND', magazine:'MAGAZINE', community:'COMMUNITY', opinion:'OPINION' }

  return (
    <>
      {/* Reading Progress */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height:'3px', background:'var(--c-cream)', zIndex:200 }}>
        <div style={{ height:'100%', width:`${progress}%`, background:'var(--c-gold)', transition:'width 0.1s linear' }}/>
      </div>

      <div style={{ maxWidth:'720px', margin:'0 auto', padding:'40px 0 80px' }}>
        {/* Back */}
        <button onClick={()=>navigate(-1)} className="btn btn-ghost" style={{ marginBottom:'24px', paddingLeft:0, gap:'6px' }}>
          <ArrowLeft size={14}/> 뒤로
        </button>

        {/* Category + Title */}
        <div className="t-eyebrow" style={{ marginBottom:'14px' }}>{CATEGORY_LABELS[article.category]||article.category}</div>
        <h1 style={{ fontFamily:'var(--f-serif)', fontSize:'34px', fontWeight:700, lineHeight:1.2, marginBottom:'16px' }}>
          {article.title}
        </h1>
        {article.excerpt && (
          <p style={{ color:'var(--c-muted)', fontSize:'16px', lineHeight:1.7, marginBottom:'20px', fontFamily:'var(--f-serif)', fontStyle:'italic' }}>
            {article.excerpt}
          </p>
        )}

        {/* Meta */}
        <div style={{ display:'flex', alignItems:'center', gap:'16px', padding:'16px 0', borderTop:'1px solid var(--c-border)', borderBottom:'1px solid var(--c-border)', marginBottom:'32px' }}>
          <div className="avatar avatar-md">
            {article.profiles?.avatar_url ? <img src={article.profiles.avatar_url} alt=""/> : (article.profiles?.display_name?.[0]||'A')}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'14px', fontWeight:600 }}>{article.profiles?.display_name||'편집부'}</div>
            {article.profiles?.startup_name && <div style={{ fontSize:'12px', color:'var(--c-muted)' }}>{article.profiles.startup_name}</div>}
          </div>
          <div style={{ display:'flex', gap:'12px', alignItems:'center', fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-muted)' }}>
            {article.published_at && <span>{format(new Date(article.published_at),'yyyy.MM.dd')}</span>}
            {article.read_time && <span style={{ display:'flex', alignItems:'center', gap:'3px' }}><Clock size={11}/>{article.read_time}분</span>}
            <span style={{ display:'flex', alignItems:'center', gap:'3px' }}><Eye size={11}/>{article.view_count||0}</span>
          </div>
        </div>

        {/* Cover Image */}
        {article.cover_image && (
          <div style={{ marginBottom:'32px' }}>
            <img src={article.cover_image} alt={article.title} style={{ width:'100%', border:'1px solid var(--c-border)' }}/>
          </div>
        )}

        {/* Additional Images */}
        {article.article_images?.length > 0 && (
          <div className={`img-gallery count-${Math.min(3,article.article_images.length)}`} style={{ marginBottom:'32px' }}>
            {article.article_images.sort((a,b)=>a.order_index-b.order_index).map(img=>(
              <div key={img.id} className="img-item">
                <img src={img.url} alt={img.alt_text||''}/>
              </div>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="article-body" dangerouslySetInnerHTML={{ __html: article.body || article.excerpt || '' }}/>

        {/* Tags */}
        {article.tags?.length > 0 && (
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'32px', paddingTop:'20px', borderTop:'1px solid var(--c-border)' }}>
            {article.tags.map(t=><span key={t} className="tag">{t}</span>)}
          </div>
        )}

        {/* Actions */}
        <div style={{ display:'flex', gap:'12px', marginTop:'28px', paddingTop:'20px', borderTop:'1px solid var(--c-border)' }}>
          <button onClick={handleLike} className="btn btn-outline"
            style={{ color: liked ? 'var(--c-red)' : undefined, borderColor: liked ? 'var(--c-red)44' : undefined, gap:'6px' }}
          >
            <Heart size={14} fill={liked?'currentColor':'none'}/> {likeCount}
          </button>
          <BookmarkButton articleId={article?.id} />
          <button onClick={handleShare} className="btn btn-outline" style={{ gap:'6px', marginLeft:'auto' }}><Share2 size={14}/> 공유</button>
        </div>
      </div>
    </>
  )
}
