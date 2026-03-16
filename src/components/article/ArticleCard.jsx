import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Heart, Eye, Bookmark } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store'
import { useLikeArticle } from '../../hooks/useData'

const CATEGORY_LABELS = {
  insight:'INSIGHT', story:'FOUNDER STORY', trend:'TREND',
  magazine:'MAGAZINE', community:'COMMUNITY', opinion:'OPINION',
}

function CoverImage({ url, category, alt }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const BG = { insight:'var(--c-gray-2)', story:'var(--c-gray-2)', trend:'var(--c-gray-2)', magazine:'var(--c-gray-2)', community:'var(--c-gray-2)', opinion:'var(--c-gray-2)' }
  const ICON = { insight:'💡', story:'🎙️', trend:'📊', magazine:'📖', community:'👥', opinion:'✍️' }
  return (
    <div style={{ width:'100%', aspectRatio:'16/9', background:BG[category]||'var(--c-cream)', overflow:'hidden', position:'relative', flexShrink:0 }}>
      {url && !error ? (
        <>
          {!loaded && <div className="skeleton" style={{ position:'absolute', inset:0 }}/>}
          <img src={url} alt={alt||''} onLoad={()=>setLoaded(true)} onError={()=>setError(true)}
            style={{ width:'100%', height:'100%', objectFit:'cover', opacity:loaded?1:0, transition:'opacity 0.3s ease' }}/>
        </>
      ) : (
        <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'36px' }}>
          {ICON[category]||'📄'}
        </div>
      )}
    </div>
  )
}

export function ArticleCard({ article, onClick }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const likeMutation = useLikeArticle()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(article.like_count||0)
  const author = article.profiles
  const date = article.published_at ? format(new Date(article.published_at), 'M월 d일', { locale:ko }) : ''

  const handleClick = () => { if (onClick) return onClick(article); navigate(`/article/${article.slug}`) }
  const handleLike = (e) => {
    e.stopPropagation()
    if (!user) return
    const next = !liked; setLiked(next); setLikeCount(c => next?c+1:c-1)
    likeMutation.mutate({ articleId:article.id, liked })
  }

  return (
    <article className="card card-clickable" onClick={handleClick} style={{ display:'flex', flexDirection:'column', background:'var(--c-card)' }}>
      <CoverImage url={article.cover_image} category={article.category} alt={article.title}/>
      <div style={{ padding:'20px', flex:1, display:'flex', flexDirection:'column', gap:'7px' }}>
        <div className="t-eyebrow">{CATEGORY_LABELS[article.category]||article.category}</div>
        <h3 style={{ fontFamily:'var(--f-serif)', fontSize:'16px', fontWeight:700, lineHeight:1.4, flex:1 }}>
          {article.title?.startsWith('[AI 정리본]') && (
            <span style={{ display:'inline-block', background:'var(--c-gold)', color:'var(--c-ink)', fontFamily:'var(--f-mono)', fontSize: '10px', fontWeight:700, padding:'2px 6px', marginBottom:'6px', marginRight:'6px', verticalAlign:'middle' }}>AI</span>
          )}
          {article.title?.replace('[AI 정리본] ', '')}
        </h3>
        {article.excerpt && (
          <p style={{ fontSize:'13px', color:'var(--c-muted)', lineHeight:1.6,
            display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden'
          }}>{article.excerpt}</p>
        )}
        {article.source_name && (
          <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
            <span className="source-badge">
              출처 · {article.source_name}
            </span>
            {article.source_url && (
              <a href={article.source_url} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ fontSize:'10px', color:'var(--c-gold)', fontFamily:'var(--f-mono)' }}>
                원문↗
              </a>
            )}
          </div>
        )}
        {article.tags?.length>0 && (
          <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
            {article.tags.slice(0,3).map(t=><span key={t} className="tag">{t}</span>)}
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:'10px', borderTop:'1px solid var(--c-border)', marginTop:'4px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <div className="avatar avatar-sm">
              {author?.avatar_url ? <img src={author.avatar_url} alt={author.display_name}/> : (author?.display_name?.[0]||'A')}
            </div>
            <div>
              <div style={{ fontSize:'12px', fontWeight:600 }}>{author?.display_name||'편집부'}</div>
              <div className="t-caption">{date}{article.read_time?` · ${article.read_time}분`:''}</div>
            </div>
          </div>
          <button onClick={handleLike} style={{ background:'none', border:'none', cursor:user?'pointer':'default',
            display:'flex', alignItems:'center', gap:'3px', fontFamily:'var(--f-mono)', fontSize:'11px',
            color:liked?'var(--c-red)':'var(--c-muted)' }}>
            <Heart size={12} fill={liked?'currentColor':'none'}/>{likeCount}
          </button>
        </div>
      </div>
    </article>
  )
}

export function ArticleHero({ article, onClick }) {
  const navigate = useNavigate()
  const date = article.published_at ? format(new Date(article.published_at), 'yyyy.MM.dd') : ''
  return (
    <article className="card card-clickable" onClick={()=>{ if(onClick) return onClick(article); navigate(`/article/${article.slug}`) }}
      style={{ background:'var(--c-card)', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:0, width:'4px', height:'100%', background:'var(--c-gold)' }}/>
      <div style={{ padding:'44px 44px 44px 52px' }}>
        <div className="t-eyebrow" style={{ marginBottom:'14px' }}>COVER STORY · {date}</div>
        <h1 style={{ fontFamily:'var(--f-serif)', fontSize:'32px', fontWeight:700, lineHeight:1.2, marginBottom:'16px' }}>{article.title}</h1>
        {article.excerpt && <p style={{ color:'var(--c-muted)', fontSize:'15px', lineHeight:1.7, marginBottom:'24px', maxWidth:'520px' }}>{article.excerpt}</p>}
        <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
          {article.read_time && <span style={{ background:'var(--c-gold)', color:'var(--c-ink)', fontFamily:'var(--f-mono)', fontSize:'10px', fontWeight:700, padding:'3px 8px' }}>{article.read_time} MIN READ</span>}
          <span className="t-caption">{CATEGORY_LABELS[article.category]}</span>
          <span className="t-caption">{article.profiles?.display_name||'편집부'}</span>
          {article.source_name && (
            <span className="source-badge">출처 · {article.source_name}</span>
          )}
        </div>
      </div>
    </article>
  )
}

export function ArticleSideItem({ article, onClick }) {
  const navigate = useNavigate()
  return (
    <article className="card card-clickable" onClick={()=>{ if(onClick) return onClick(article); navigate(`/article/${article.slug}`) }}
      style={{ background:'var(--c-card)', padding:'20px 24px', flex:1 }}>
      <div className="t-caption" style={{ marginBottom:'8px', letterSpacing:'2px' }}>{CATEGORY_LABELS[article.category]}</div>
      <h3 style={{ fontFamily:'var(--f-serif)', fontSize:'15px', fontWeight:600, lineHeight:1.4, marginBottom:'8px' }}>{article.title}</h3>
      <div className="t-caption">{article.read_time?`${article.read_time}분 읽기`:''}</div>
      {article.source_name && <div className="source-badge" style={{ marginTop:'6px' }}>출처 · {article.source_name}</div>}
    </article>
  )
}

export function ArticleMagItem({ article, number, onClick }) {
  const navigate = useNavigate()
  return (
    <article className="card card-clickable" onClick={()=>{ if(onClick) return onClick(article); navigate(`/article/${article.slug}`) }}
      style={{ background:'var(--c-card)', padding:'20px 24px', display:'flex', gap:'16px', alignItems:'flex-start' }}>
      <div style={{ fontFamily:'var(--f-mono)', fontSize:'22px', color:'var(--c-border)', fontWeight:700, minWidth:'32px', lineHeight:1, marginTop:'2px' }}>
        {String(number).padStart(2,'0')}
      </div>
      <div>
        <div className="t-caption" style={{ marginBottom:'4px' }}>{CATEGORY_LABELS[article.category]}</div>
        <h3 style={{ fontFamily:'var(--f-serif)', fontSize:'15px', fontWeight:600, lineHeight:1.4, marginBottom:'6px' }}>{article.title}</h3>
        <div className="t-caption">{article.read_time?`${article.read_time}분 읽기`:''}</div>
      </div>
    </article>
  )
}

export function ArticleCardSkeleton() {
  return (
    <div className="card" style={{ display:'flex', flexDirection:'column' }}>
      <div className="skeleton skeleton-img"/>
      <div style={{ padding:'20px' }}>
        <div className="skeleton skeleton-text" style={{ width:'60px', height:'10px', marginBottom:'10px' }}/>
        <div className="skeleton skeleton-text skeleton-title"/>
        <div className="skeleton skeleton-text"/>
        <div className="skeleton skeleton-text" style={{ width:'80%' }}/>
      </div>
    </div>
  )
}
