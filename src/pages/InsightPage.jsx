import { useState, useEffect, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Search, X, Clock, Eye, Heart, Zap, TrendingUp, Users,
  BrainCircuit, Lightbulb, GraduationCap, Newspaper, Flame,
  Star, BookOpen, ChevronRight, ArrowUpRight, Filter,
  SlidersHorizontal, Grid, List, Tag
} from 'lucide-react'
import { useArticles } from '../hooks/useData'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

const CATS = [
  { id:'all',       label:'전체',     color:'#F0F0F0', icon:Zap },
  { id:'startup',   label:'스타트업', color:'#3B82F6', icon:Zap },
  { id:'ai',        label:'AI/테크',  color:'#A855F7', icon:BrainCircuit },
  { id:'fintech',   label:'핀테크',   color:'#22C55E', icon:TrendingUp },
  { id:'edutech',   label:'에듀테크', color:'#F97316', icon:GraduationCap },
  { id:'insight',   label:'인사이트', color:'#60A5FA', icon:Lightbulb },
  { id:'trend',     label:'트렌드',   color:'#F59E0B', icon:TrendingUp },
  { id:'community', label:'커뮤니티', color:'#06B6D4', icon:Users },
  { id:'news',      label:'뉴스',     color:'#60A5FA', icon:Newspaper },
]
const CC = { startup:'#3B82F6',ai:'#A855F7',fintech:'#22C55E',edutech:'#F97316',
  insight:'#60A5FA',trend:'#F59E0B',community:'#06B6D4',news:'#60A5FA' }
const catColor = c => CC[c]||'#3B82F6'

/* ── Skeleton ─────────────────────────────────────────── */
function Sk({ h=16, w='100%', r=6 }) {
  return <div style={{ height:h, width:w, background:'var(--bg3)',
    borderRadius:r, animation:'skPulse 1.6s ease-in-out infinite' }}/>
}
function SkCard() {
  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)',
      borderRadius:14, overflow:'hidden' }}>
      <div style={{ height:185, background:'var(--bg3)' }}/>
      <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:8 }}>
        <Sk h={10} w="40%" r={4}/><Sk h={19} r={5}/><Sk h={14} w="80%" r={4}/>
        <div style={{ display:'flex', gap:6 }}><Sk h={10} w={50} r={4}/><Sk h={10} w={50} r={4}/></div>
      </div>
    </div>
  )
}

/* ── Featured card (2-col spanning) ─────────────────── */
function FeaturedCard({ art }) {
  const navigate = useNavigate()
  const [hov, setHov] = useState(false)
  const c = catColor(art.category)
  return (
    <div onClick={()=>navigate(`/article/${art.slug||art.id}`)}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ gridColumn:'span 2', display:'grid', gridTemplateColumns:'1fr 1fr',
        background:'var(--bg2)', border:`1px solid ${hov?`${c}40`:'var(--b1)'}`,
        borderRadius:16, overflow:'hidden', cursor:'pointer', transition:'all .28s cubic-bezier(.4,0,.2,1)',
        transform:hov?'translateY(-3px)':'none',
        boxShadow:hov?`0 16px 52px rgba(0,0,0,.65),0 0 0 1px ${c}30`:'none' }}>
      {/* image */}
      <div style={{ position:'relative', overflow:'hidden', minHeight:280 }}>
        {art.cover_image
          ? <img src={art.cover_image} alt={art.title}
              style={{ width:'100%', height:'100%', objectFit:'cover',
                transition:'transform .5s', transform:hov?'scale(1.06)':'scale(1)' }}/>
          : <div style={{ width:'100%', height:'100%', minHeight:280,
              background:`linear-gradient(135deg,${c}22,var(--bg4))`,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Zap size={70} color={`${c}25`}/>
            </div>
        }
        <div style={{ position:'absolute', inset:0,
          background:'linear-gradient(to right,transparent 55%,rgba(9,9,9,.95))' }}/>
        <div style={{ position:'absolute', inset:0,
          background:'linear-gradient(to top,rgba(0,0,0,.5) 0%,transparent 50%)' }}/>
        <div style={{ position:'absolute', top:16, left:16, display:'flex', gap:8 }}>
          <span style={{ fontSize:10, fontWeight:700, fontFamily:'var(--f-mono)',
            letterSpacing:'.1em', padding:'3px 9px', borderRadius:5, background:c, color:'#000' }}>
            {CATS.find(x=>x.id===art.category)?.label||art.category}
          </span>
          {art.featured && (
            <span style={{ fontSize:9, fontFamily:'var(--f-mono)', padding:'3px 8px',
              borderRadius:5, background:'rgba(255,215,0,0.2)',
              border:'1px solid rgba(255,215,0,0.4)', color:'#FFD700',
              display:'flex', alignItems:'center', gap:3 }}>
              ★ FEATURED
            </span>
          )}
        </div>
      </div>
      {/* text */}
      <div style={{ padding:'30px 32px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:c,
          letterSpacing:'.12em', marginBottom:12, textTransform:'uppercase' }}>
          {art.read_time?`${art.read_time}분 읽기`:'FEATURED STORY'}
        </div>
        <h2 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(17px,2.2vw,24px)',
          fontWeight:800, color:'var(--t1)', lineHeight:1.32, marginBottom:14,
          letterSpacing:'-.025em' }}>{art.title}</h2>
        {art.excerpt && (
          <p style={{ fontSize:13, color:'var(--t2)', lineHeight:1.75, marginBottom:22,
            display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
            {art.excerpt}
          </p>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
          {[
            [Eye, (art.view_count||0).toLocaleString()],
            [Heart, (art.like_count||0).toLocaleString()],
            [Clock, art.published_at?format(new Date(art.published_at),'M.d',{locale:ko}):''],
          ].map(([Icon,val],i)=>val&&(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:4,
              fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)' }}>
              <Icon size={11}/>{val}
            </div>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6,
          color:c, fontSize:13, fontWeight:700, transition:'gap .2s',
          gap:hov?10:6 }}>
          읽기 <ArrowUpRight size={14}/>
        </div>
        {art.tags?.length>0 && (
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:16 }}>
            {art.tags.slice(0,4).map(t=>(
              <span key={t} style={{ fontSize:10, padding:'2px 8px', borderRadius:4,
                background:`${c}12`, border:`1px solid ${c}22`, color:c, fontFamily:'var(--f-mono)' }}>
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Regular card ───────────────────────────────────── */
function ArticleCard({ art, view='grid' }) {
  const navigate = useNavigate()
  const [hov, setHov] = useState(false)
  const c = catColor(art.category)

  if (view==='list') return (
    <div onClick={()=>navigate(`/article/${art.slug||art.id}`)}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ display:'flex', gap:16, padding:'16px 20px', background:hov?'var(--bg3)':'var(--bg2)',
        border:`1px solid ${hov?'var(--b2)':'var(--b1)'}`, borderRadius:12,
        cursor:'pointer', transition:'all .2s', alignItems:'flex-start' }}>
      {art.cover_image && (
        <div style={{ width:90, height:68, borderRadius:9, overflow:'hidden', flexShrink:0 }}>
          <img src={art.cover_image} alt="" style={{ width:'100%', height:'100%',
            objectFit:'cover', transition:'transform .35s',
            transform:hov?'scale(1.07)':'scale(1)' }}/>
        </div>
      )}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:7 }}>
          <span style={{ fontSize:9, fontWeight:700, fontFamily:'var(--f-mono)',
            padding:'2px 7px', borderRadius:4, background:c, color:'#000' }}>
            {CATS.find(x=>x.id===art.category)?.label||art.category}
          </span>
          {art.read_time && <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)',
            display:'flex', alignItems:'center', gap:3 }}><Clock size={9}/>{art.read_time}분</span>}
        </div>
        <h3 style={{ fontSize:15, fontWeight:700, color:'var(--t1)', lineHeight:1.4,
          marginBottom:7, display:'-webkit-box', WebkitLineClamp:2,
          WebkitBoxOrient:'vertical', overflow:'hidden' }}>{art.title}</h3>
        {art.excerpt && (
          <p style={{ fontSize:12, color:'var(--t3)', lineHeight:1.6, display:'-webkit-box',
            WebkitLineClamp:1, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{art.excerpt}</p>
        )}
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8, flexShrink:0 }}>
        <div style={{ display:'flex', gap:12 }}>
          <span style={{ display:'flex', alignItems:'center', gap:3, fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}>
            <Eye size={10}/>{(art.view_count||0).toLocaleString()}
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:3, fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)' }}>
            <Heart size={10}/>{(art.like_count||0).toLocaleString()}
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:4,
          color:hov?c:'var(--t4)', fontSize:12, transition:'color .15s' }}>
          읽기 <ArrowUpRight size={11}/>
        </div>
      </div>
    </div>
  )

  return (
    <div onClick={()=>navigate(`/article/${art.slug||art.id}`)}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:'var(--bg2)', border:`1px solid ${hov?'var(--b2)':'var(--b1)'}`,
        borderRadius:14, overflow:'hidden', cursor:'pointer', transition:'all .22s cubic-bezier(.4,0,.2,1)',
        transform:hov?'translateY(-4px)':'none',
        boxShadow:hov?'0 12px 40px rgba(0,0,0,.6)':'none',
        display:'flex', flexDirection:'column' }}>
      <div style={{ position:'relative', height:175, overflow:'hidden', flexShrink:0 }}>
        {art.cover_image
          ? <img src={art.cover_image} alt={art.title}
              style={{ width:'100%', height:'100%', objectFit:'cover',
                transition:'transform .45s', transform:hov?'scale(1.07)':'scale(1)' }}/>
          : <div style={{ width:'100%', height:'100%',
              background:`linear-gradient(135deg,${c}18,var(--bg4))`,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Zap size={40} color={`${c}22`}/>
            </div>
        }
        <div style={{ position:'absolute', inset:0,
          background:'linear-gradient(to top,rgba(0,0,0,.4) 0%,transparent 60%)' }}/>
        <div style={{ position:'absolute', top:11, left:11 }}>
          <span style={{ fontSize:8.5, fontWeight:700, fontFamily:'var(--f-mono)',
            letterSpacing:'.08em', padding:'2px 7px', borderRadius:4, background:c, color:'#000' }}>
            {CATS.find(x=>x.id===art.category)?.label||art.category}
          </span>
        </div>
        {art.read_time && (
          <div style={{ position:'absolute', bottom:9, right:9,
            display:'flex', alignItems:'center', gap:3,
            background:'rgba(0,0,0,0.7)', padding:'2px 7px', borderRadius:4,
            backdropFilter:'blur(6px)' }}>
            <Clock size={8} color="rgba(255,255,255,0.65)"/>
            <span style={{ fontFamily:'var(--f-mono)', fontSize:8, color:'rgba(255,255,255,0.65)' }}>
              {art.read_time}분
            </span>
          </div>
        )}
      </div>
      <div style={{ padding:'15px 17px 17px', flex:1, display:'flex', flexDirection:'column', gap:8 }}>
        <h3 style={{ fontSize:14.5, fontWeight:700, color:'var(--t1)', lineHeight:1.42,
          display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {art.title}
        </h3>
        {art.excerpt && (
          <p style={{ fontSize:12, color:'var(--t3)', lineHeight:1.65, display:'-webkit-box',
            WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden', flex:1 }}>
            {art.excerpt}
          </p>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:'auto',
          paddingTop:10, borderTop:'1px solid var(--b0)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:3,
            fontFamily:'var(--f-mono)', fontSize:9.5, color:'var(--t4)' }}>
            <Eye size={10}/>{(art.view_count||0).toLocaleString()}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:3,
            fontFamily:'var(--f-mono)', fontSize:9.5, color:'var(--t4)' }}>
            <Heart size={10}/>{(art.like_count||0).toLocaleString()}
          </div>
          <span style={{ marginLeft:'auto', fontFamily:'var(--f-mono)', fontSize:9, color:'var(--t4)' }}>
            {art.published_at?format(new Date(art.published_at),'M.d',{locale:ko}):''}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────── */
export default function InsightPage() {
  const navigate = useNavigate()
  const { category: paramCat } = useParams()
  const [cat, setCat] = useState(paramCat||'all')
  const [sort, setSort] = useState('latest')
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [searchOn, setSearchOn] = useState(false)
  const [view, setView] = useState('grid')
  const searchRef = useRef(null)

  const { data, isLoading } = useArticles({
    category: cat==='all'?undefined:cat,
    limit:12, page,
  })

  const articles = Array.isArray(data) ? data : (data?.articles||[])
  const featured = articles.find(a=>a.featured)
  const rest = articles.filter(a=>!a.featured||articles.indexOf(a)>0)
  const filtered = query
    ? rest.filter(a=>a.title?.toLowerCase().includes(query.toLowerCase())||a.excerpt?.toLowerCase().includes(query.toLowerCase()))
    : rest

  useEffect(() => { if (searchOn) setTimeout(()=>searchRef.current?.focus(),80) }, [searchOn])

  return (
    <div style={{ maxWidth:'var(--max-w)', margin:'0 auto',
      padding:'0 var(--pad-x)', paddingBottom:80 }}>
      <Helmet>
        <title>인사이트 | Insightship — 청소년 창업 인사이트</title>
        <meta name="description" content="AI·스타트업·핀테크·에듀테크 등 청소년 창업에 필요한 최신 인사이트와 아티클을 만나보세요."/>
        <meta property="og:title" content="인사이트 | Insightship"/>
        <meta property="og:description" content="청소년 창업가를 위한 최신 스타트업·AI·에듀테크 인사이트"/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://insightship.vercel.app/insight"/>
        <meta name="twitter:card" content="summary"/>
        <meta name="twitter:title" content="인사이트 | Insightship"/>
        <meta name="twitter:description" content="청소년 창업가를 위한 최신 스타트업 인사이트"/>
        <link rel="canonical" href="https://insightship.vercel.app/insight"/>
      </Helmet>

      {/* ── PAGE HEADER ── */}
      <div style={{ padding:'36px 0 24px', borderBottom:'1px solid var(--b1)', marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between',
          gap:16, flexWrap:'wrap' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <div style={{ width:3, height:18, background:'linear-gradient(to bottom,#3B82F6,#1D4ED8)',
                borderRadius:2 }}/>
              <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'#3B82F6',
                letterSpacing:'.16em' }}>INSIGHTSHIP · ARTICLES</span>
            </div>
            <h1 style={{ fontFamily:'var(--f-display)', fontSize:'clamp(26px,4vw,38px)',
              fontWeight:900, color:'var(--t1)', lineHeight:1.1, marginBottom:8,
              letterSpacing:'-.03em' }}>인사이트</h1>
            <p style={{ fontSize:14, color:'var(--t2)', lineHeight:1.65 }}>
              청소년 창업가를 위한 스타트업 분석, 트렌드, 성공 사례
            </p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {/* View toggle */}
            <div style={{ display:'flex', background:'var(--bg2)', border:'1px solid var(--b1)',
              borderRadius:8, overflow:'hidden' }}>
              {[['grid',Grid],['list',List]].map(([v,Icon])=>(
                <button key={v} onClick={()=>setView(v)}
                  style={{ padding:'7px 10px', background:view===v?'var(--bg4)':'transparent',
                    border:'none', cursor:'pointer', display:'flex', alignItems:'center',
                    color:view===v?'var(--t1)':'var(--t3)', transition:'all .15s' }}>
                  <Icon size={14}/>
                </button>
              ))}
            </div>
            {/* Search */}
            {searchOn ? (
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <input ref={searchRef} autoFocus value={query} onChange={e=>setQuery(e.target.value)}
                  placeholder="아티클 검색..."
                  style={{ padding:'8px 14px', background:'var(--bg3)', border:'1px solid var(--b2)',
                    borderRadius:8, color:'var(--t1)', fontSize:13, outline:'none', width:220,
                    fontFamily:'var(--f-sans)' }}
                  onFocus={e=>e.target.style.borderColor='rgba(59,130,246,0.5)'}
                  onBlur={e=>e.target.style.borderColor='var(--b2)'}/>
                <button onClick={()=>{ setSearchOn(false); setQuery('') }}
                  style={{ background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:8,
                    padding:'8px 10px', cursor:'pointer', color:'var(--t3)', display:'flex' }}>
                  <X size={14}/>
                </button>
              </div>
            ) : (
              <button onClick={()=>setSearchOn(true)}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
                  background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:8,
                  color:'var(--t2)', fontSize:13, cursor:'pointer', fontFamily:'var(--f-sans)',
                  transition:'all .15s' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor='var(--b2)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='var(--b1)'}>
                <Search size={14}/> 검색
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── CATEGORY TABS ── */}
      <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4,
        marginBottom:20, scrollbarWidth:'none' }}>
        {CATS.map(c=>(
          <button key={c.id} onClick={()=>{ setCat(c.id); setPage(0) }}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
              background:cat===c.id?c.color:'var(--bg2)',
              border:`1px solid ${cat===c.id?c.color:'var(--b1)'}`,
              borderRadius:20, color:cat===c.id?'#000':'var(--t2)',
              fontSize:12, fontFamily:'var(--f-sans)', fontWeight:cat===c.id?700:400,
              cursor:'pointer', whiteSpace:'nowrap', transition:'all .18s', flexShrink:0,
              boxShadow:cat===c.id?`0 4px 14px ${c.color}35`:'none' }}>
            <c.icon size={11}/>{c.label}
          </button>
        ))}
      </div>

      {/* ── SORT + COUNT ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)' }}>
          {isLoading?'로딩 중...':`${filtered.length}개 아티클`}
          {query&&` · "${query}" 검색 결과`}
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {[['latest','최신순'],['popular','인기순'],['views','조회순']].map(([id,label])=>(
            <button key={id} onClick={()=>setSort(id)}
              style={{ padding:'5px 10px', background:sort===id?'var(--bg4)':'none',
                border:`1px solid ${sort===id?'var(--b2)':'transparent'}`,
                borderRadius:6, color:sort===id?'var(--t1)':'var(--t3)',
                fontSize:11, cursor:'pointer', fontFamily:'var(--f-mono)',
                transition:'all .15s' }}>{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ── */}
      {isLoading ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
          {Array(8).fill(0).map((_,i)=><SkCard key={i}/>)}
        </div>
      ) : filtered.length===0 ? (
        <div style={{ textAlign:'center', padding:'80px 20px', color:'var(--t3)' }}>
          <BookOpen size={52} style={{ marginBottom:18, opacity:.25 }}/>
          <div style={{ fontSize:16, fontWeight:600, marginBottom:8, color:'var(--t2)' }}>아티클이 없습니다</div>
          <div style={{ fontSize:13 }}>{query?`"${query}" 검색 결과가 없습니다.`:'이 카테고리에 아티클이 아직 없습니다.'}</div>
        </div>
      ) : view==='list' ? (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {featured&&page===0&&!query&&<FeaturedCard art={featured}/>}
          {filtered.map(art=><ArticleCard key={art.id} art={art} view="list"/>)}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16 }}>
          {featured&&page===0&&!query&&<FeaturedCard art={featured}/>}
          {filtered.map(art=><ArticleCard key={art.id} art={art} view="grid"/>)}
        </div>
      )}

      {/* ── PAGINATION ── */}
      {(page>0||(Array.isArray(data)?data:data?.hasMore)) && (
        <div style={{ display:'flex', justifyContent:'center', gap:10, marginTop:36 }}>
          {page>0 && (
            <button onClick={()=>setPage(p=>p-1)}
              style={{ padding:'10px 22px', background:'var(--bg3)', border:'1px solid var(--b1)',
                borderRadius:9, color:'var(--t2)', fontSize:13, cursor:'pointer',
                fontFamily:'var(--f-sans)', transition:'all .15s' }}
              onMouseEnter={e=>e.currentTarget.style.borderColor='var(--b2)'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='var(--b1)'}>
              ← 이전
            </button>
          )}
          {(Array.isArray(data)?data.length>=12:data?.hasMore) && (
            <button onClick={()=>setPage(p=>p+1)}
              style={{ padding:'10px 22px', background:'linear-gradient(135deg,#3B82F6,#1D4ED8)',
                border:'none', borderRadius:9, color:'#fff', fontSize:13, cursor:'pointer',
                fontFamily:'var(--f-sans)', fontWeight:700, transition:'opacity .15s',
                boxShadow:'0 4px 16px rgba(59,130,246,0.35)' }}
              onMouseEnter={e=>e.currentTarget.style.opacity='.85'}
              onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
              더 보기 →
            </button>
          )}
        </div>
      )}

      <style>{`
        @keyframes skPulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @media(max-width:900px){
          div[style*="grid-template-columns: repeat(2,1fr)"] { grid-template-columns:1fr!important; }
          div[style*="gridColumn: span 2"] { grid-column:span 1!important; grid-template-columns:1fr!important; }
        }
      `}</style>
    </div>
  )
}
