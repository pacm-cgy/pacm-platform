import { useNavigate } from 'react-router-dom'
import { ArticleCard, ArticleCardSkeleton } from '../components/article/ArticleCard'
import { useArticles } from '../hooks/useData'

export default function StoryPage() {
  const navigate = useNavigate()
  const { data: stories = [], isLoading } = useArticles({ category: 'story', limit: 12 })
  const cover = stories[0]
  const rest = stories.slice(1)

  return (
    <div style={{ paddingBottom: '64px' }}>
      <div style={{ padding: '40px 0 24px' }}>
        <div className="t-eyebrow" style={{ marginBottom: '8px' }}>FOUNDER STORIES</div>
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: '34px', fontWeight: 700, marginBottom: '8px' }}>창업자의 이야기</h1>
        <p style={{ color: 'var(--c-muted)', fontSize: '14px', maxWidth: '560px' }}>성공과 실패, 피벗과 인내. 실제 창업자들의 날 것의 이야기를 전합니다.</p>
      </div>

      {isLoading ? (
        <div className="grid-3 grid-bordered">{[0,1,2,3].map(i=><ArticleCardSkeleton key={i}/>)}</div>
      ) : cover ? (
        <div style={{ display:'grid', gap:'2px', background:'var(--c-border)', border:'1px solid var(--c-border)' }}>
          {/* Cover interview */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px', background:'var(--c-border)' }}>
            <div style={{ background:'var(--c-card)', padding:'40px 48px', cursor:'pointer' }} onClick={()=>navigate(`/article/${cover.slug}`)}>
              <div className="t-eyebrow" style={{ marginBottom:'14px' }}>COVER INTERVIEW</div>
              <h2 style={{ fontFamily:'var(--f-serif)', fontSize:'26px', fontWeight:700, lineHeight:1.25, marginBottom:'16px' }}>{cover.title}</h2>
              <p style={{ color:'var(--c-muted)', fontSize:'14px', lineHeight:1.7, marginBottom:'20px' }}>{cover.excerpt}</p>
              <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                <div className="avatar avatar-md">{cover.profiles?.display_name?.[0]||'A'}</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:'14px' }}>{cover.profiles?.display_name}</div>
                  <div style={{ fontSize:'12px', color:'var(--c-muted)' }}>{cover.profiles?.startup_name}</div>
                </div>
              </div>
            </div>
            <div style={{ background:'var(--c-cream)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'80px', minHeight:'300px' }}>
              {cover.cover_image ? <img src={cover.cover_image} alt={cover.title} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : '🌱'}
            </div>
          </div>
          {rest.length > 0 && (
            <div className="grid-3" style={{ background:'var(--c-border)' }}>
              {rest.map(a=><ArticleCard key={a.id} article={a}/>)}
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign:'center', padding:'80px 0', color:'var(--c-muted)' }}>
          <div style={{ fontSize:'40px', marginBottom:'16px' }}>🎙️</div>
          <div style={{ fontFamily:'var(--f-serif)', fontSize:'18px' }}>창업자 스토리가 곧 공개됩니다</div>
        </div>
      )}

      <style>{`@media(max-width:768px){div[style*="gridTemplateColumns: 1fr 1fr"]{grid-template-columns:1fr!important}}`}</style>
    </div>
  )
}
