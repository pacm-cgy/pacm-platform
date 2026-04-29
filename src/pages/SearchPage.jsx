import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  Search, X, Newspaper, FileText, MessageSquare,
  Clock, Eye, ArrowUpRight, Loader, Hash
} from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { supabase } from '../lib/supabase'

/* ─── CONSTANTS ─────────────────────────────────────────────────── */
const CAT_COLOR = {
  funding:'#F59E0B', investment:'#F59E0B',
  ai:'#818cf8', tech:'#818cf8', ai_startup:'#818cf8',
  edutech:'#38bdf8', youth:'#34d399', policy:'#a78bfa',
  startup:'#60A5FA', entrepreneurship:'#60A5FA', general:'#9CA3AF',
  unicorn:'#fb7185', climate:'#86efac', health:'#67e8f9', fintech:'#fb923c',
  insight:'#A855F7', trend:'#10B981', magazine:'#F59E0B', story:'#F97316',
}
const CAT_KO = {
  funding:'투자·펀딩', investment:'투자·펀딩', ai:'AI·기술', tech:'AI·기술',
  ai_startup:'AI·기술', edutech:'에듀테크', youth:'청소년창업', policy:'정책·지원',
  startup:'창업', entrepreneurship:'창업', general:'뉴스', unicorn:'유니콘',
  climate:'기후테크', health:'헬스케어', fintech:'핀테크',
  insight:'인사이트', trend:'트렌드', magazine:'매거진', story:'스토리',
}

const TABS = [
  { id: 'all',       label: '전체',     icon: Search      },
  { id: 'news',      label: '뉴스',     icon: Newspaper   },
  { id: 'articles',  label: '아티클',   icon: FileText    },
  { id: 'community', label: '커뮤니티', icon: MessageSquare },
]

/* ─── RESULT CARDS ──────────────────────────────────────────────── */
function NewsCard({ item, navigate }) {
  const color = CAT_COLOR[item.ai_category] || '#9CA3AF'
  return (
    <div
      onClick={() => navigate(`/news/${item.slug}`)}
      style={{
        background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10,
        padding:'14px 16px', cursor:'pointer', transition:'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = color}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--b1)'}
    >
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
        <span style={{ fontSize:9, fontFamily:'var(--f-mono)', background:`${color}20`, color, border:`1px solid ${color}40`, borderRadius:4, padding:'2px 6px', letterSpacing:'0.5px' }}>
          {CAT_KO[item.ai_category] || '뉴스'}
        </span>
        <span style={{ fontSize:10, color:'var(--t4)', fontFamily:'var(--f-mono)' }}>NEWS</span>
        {item.source_name && (
          <span style={{ fontSize:10, color:'var(--t4)', marginLeft:'auto', fontFamily:'var(--f-mono)' }}>
            {item.source_name}
          </span>
        )}
      </div>
      <div style={{ fontSize:14, fontWeight:600, color:'var(--t1)', lineHeight:1.45, marginBottom:6 }}>
        {item.title}
      </div>
      {item.ai_summary && (
        <div style={{ fontSize:12, color:'var(--t3)', lineHeight:1.55 }}>
          {item.ai_summary.replace(/##[^\n]+\n?/g,'').replace(/\*\*/g,'').slice(0,120)}…
        </div>
      )}
      <div style={{ display:'flex', gap:12, marginTop:8, alignItems:'center' }}>
        {item.published_at && (
          <span style={{ fontSize:10, color:'var(--t4)', fontFamily:'var(--f-mono)' }}>
            {format(new Date(item.published_at), 'MM.dd', { locale: ko })}
          </span>
        )}
        {item.view_count > 0 && (
          <span style={{ fontSize:10, color:'var(--t4)', display:'flex', alignItems:'center', gap:3 }}>
            <Eye size={10}/> {item.view_count.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}

function ArticleCard({ item, navigate }) {
  const color = CAT_COLOR[item.category] || '#A855F7'
  return (
    <div
      onClick={() => navigate(`/article/${item.slug}`)}
      style={{
        background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10,
        padding:'14px 16px', cursor:'pointer', transition:'border-color 0.15s',
        display:'flex', gap:12,
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = color}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--b1)'}
    >
      {item.cover_image && (
        <img src={item.cover_image} alt="" style={{ width:72, height:56, objectFit:'cover', borderRadius:6, flexShrink:0 }}
          onError={e => { e.target.style.display='none' }}/>
      )}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:5 }}>
          <span style={{ fontSize:9, fontFamily:'var(--f-mono)', background:`${color}20`, color, border:`1px solid ${color}40`, borderRadius:4, padding:'2px 6px' }}>
            {CAT_KO[item.category] || '아티클'}
          </span>
          <span style={{ fontSize:10, color:'var(--t4)', fontFamily:'var(--f-mono)' }}>ARTICLE</span>
        </div>
        <div style={{ fontSize:14, fontWeight:600, color:'var(--t1)', lineHeight:1.45, marginBottom:4 }}>
          {item.title}
        </div>
        {item.excerpt && (
          <div style={{ fontSize:12, color:'var(--t3)', lineHeight:1.5 }}>
            {item.excerpt.slice(0,100)}…
          </div>
        )}
        <div style={{ display:'flex', gap:12, marginTop:6, alignItems:'center' }}>
          {item.read_time && (
            <span style={{ fontSize:10, color:'var(--t4)', display:'flex', alignItems:'center', gap:3 }}>
              <Clock size={10}/> {item.read_time}분
            </span>
          )}
          {item.published_at && (
            <span style={{ fontSize:10, color:'var(--t4)', fontFamily:'var(--f-mono)' }}>
              {format(new Date(item.published_at), 'MM.dd', { locale: ko })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function PostCard({ item, navigate }) {
  return (
    <div
      onClick={() => navigate(`/community/${item.id}`)}
      style={{
        background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:10,
        padding:'14px 16px', cursor:'pointer', transition:'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#60A5FA'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--b1)'}
    >
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
        <span style={{ fontSize:9, fontFamily:'var(--f-mono)', background:'rgba(96,165,250,0.12)', color:'#60A5FA', border:'1px solid rgba(96,165,250,0.25)', borderRadius:4, padding:'2px 6px' }}>
          커뮤니티
        </span>
        <span style={{ fontSize:10, color:'var(--t4)', fontFamily:'var(--f-mono)' }}>COMMUNITY</span>
        {item.profiles?.display_name && (
          <span style={{ fontSize:10, color:'var(--t4)', marginLeft:'auto' }}>
            {item.profiles.display_name}
          </span>
        )}
      </div>
      <div style={{ fontSize:14, fontWeight:600, color:'var(--t1)', lineHeight:1.45, marginBottom:5 }}>
        {item.title}
      </div>
      {item.content && (
        <div style={{ fontSize:12, color:'var(--t3)', lineHeight:1.5 }}>
          {item.content.replace(/[#*>`]/g,'').trim().slice(0,100)}…
        </div>
      )}
      {item.tags?.length > 0 && (
        <div style={{ display:'flex', gap:5, marginTop:8, flexWrap:'wrap' }}>
          {item.tags.slice(0,4).map(t => (
            <span key={t} style={{ fontSize:9, background:'rgba(255,255,255,0.04)', border:'1px solid var(--b1)', borderRadius:3, padding:'1px 5px', color:'var(--t4)', fontFamily:'var(--f-mono)' }}>
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── EMPTY STATE ───────────────────────────────────────────────── */
function EmptyState({ query }) {
  return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t4)' }}>
      <Search size={36} style={{ opacity:0.2, marginBottom:16 }}/>
      <div style={{ fontSize:15, fontWeight:600, color:'var(--t3)', marginBottom:8 }}>
        {query ? `"${query}"에 대한 결과가 없습니다` : '검색어를 입력하세요'}
      </div>
      <div style={{ fontSize:12, lineHeight:1.6 }}>
        뉴스, 아티클, 커뮤니티 게시글을 통합 검색합니다<br/>
        두 글자 이상 입력하면 자동 검색됩니다
      </div>
    </div>
  )
}

/* ─── MAIN SEARCH PAGE ──────────────────────────────────────────── */
export default function SearchPage() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const inputRef  = useRef(null)
  const debounce  = useRef(null)

  const initQ = new URLSearchParams(location.search).get('q') || ''

  const [input,      setInput]      = useState(initQ)
  const [query,      setQuery]      = useState(initQ)
  const [tab,        setTab]        = useState('all')
  const [loading,    setLoading]    = useState(false)
  const [news,       setNews]       = useState([])
  const [articles,   setArticles]   = useState([])
  const [posts,      setPosts]      = useState([])

  // URL 쿼리 변경 감지
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('q') || ''
    setInput(q); setQuery(q)
  }, [location.search])

  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) {
      setNews([]); setArticles([]); setPosts([])
      return
    }
    setLoading(true)
    const term = q.trim()

    const [nR, aR, pR] = await Promise.allSettled([
      // 뉴스 검색
      supabase.from('articles')
        .select('id,title,slug,ai_category,source_name,published_at,ai_summary,view_count')
        .eq('status','published')
        .not('source_name','is',null)
        .or(`title.ilike.%${term}%,ai_summary.ilike.%${term}%`)
        .order('published_at',{ascending:false})
        .limit(12),
      // 아티클 검색
      supabase.from('articles')
        .select('id,title,slug,category,excerpt,cover_image,published_at,read_time')
        .eq('status','published')
        .is('source_name',null)
        .or(`title.ilike.%${term}%,excerpt.ilike.%${term}%`)
        .order('published_at',{ascending:false})
        .limit(12),
      // 커뮤니티 검색
      supabase.from('community_posts')
        .select('id,title,content,tags,created_at,profiles!author_id(display_name)')
        .eq('is_deleted',false)
        .or(`title.ilike.%${term}%,content.ilike.%${term}%`)
        .order('created_at',{ascending:false})
        .limit(10),
    ])

    setNews(nR.status==='fulfilled' ? (nR.value.data||[]) : [])
    setArticles(aR.status==='fulfilled' ? (aR.value.data||[]) : [])
    setPosts(pR.status==='fulfilled' ? (pR.value.data||[]) : [])
    setLoading(false)
  }, [])

  // query 변경 시 검색 실행
  useEffect(() => { doSearch(query) }, [query, doSearch])

  // 자동 포커스
  useEffect(() => { inputRef.current?.focus() }, [])

  const handleInput = e => {
    const v = e.target.value
    setInput(v)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      setQuery(v)
      // URL 업데이트 (히스토리 replace)
      const url = v.trim() ? `/search?q=${encodeURIComponent(v.trim())}` : '/search'
      window.history.replaceState({}, '', url)
    }, 280)
  }

  const handleSubmit = e => {
    e.preventDefault()
    clearTimeout(debounce.current)
    setQuery(input)
  }

  const clearSearch = () => {
    setInput(''); setQuery('')
    setNews([]); setArticles([]); setPosts([])
    window.history.replaceState({}, '', '/search')
    inputRef.current?.focus()
  }

  const totalCount  = news.length + articles.length + posts.length
  const tabCounts   = { all: totalCount, news: news.length, articles: articles.length, community: posts.length }

  const showNews     = tab === 'all' || tab === 'news'
  const showArticles = tab === 'all' || tab === 'articles'
  const showPosts    = tab === 'all' || tab === 'community'

  const displayedNews     = showNews     ? (tab === 'all' ? news.slice(0,5)     : news)     : []
  const displayedArticles = showArticles ? (tab === 'all' ? articles.slice(0,5) : articles) : []
  const displayedPosts    = showPosts    ? (tab === 'all' ? posts.slice(0,4)    : posts)    : []

  return (
    <div style={{ maxWidth:720, margin:'0 auto', padding:'32px 16px 80px' }}>
      <Helmet>
        <title>{query ? `"${query}" 검색 결과` : '통합 검색'} | Insightship</title>
        <meta name="description" content="뉴스, 아티클, 커뮤니티를 한 번에 검색하세요"/>
      </Helmet>

      {/* 검색 헤더 */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <Search size={14} color="var(--t4)"/>
          <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t4)', letterSpacing:'2px' }}>
            UNIFIED SEARCH
          </span>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ position:'relative' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={handleInput}
              placeholder="뉴스, 아티클, 커뮤니티 통합 검색…"
              className="input"
              style={{
                width:'100%', fontSize:16, padding:'14px 48px 14px 18px',
                background:'var(--bg2)', border:'1px solid var(--b2)',
                borderRadius:12, color:'var(--t1)', boxSizing:'border-box',
              }}
            />
            <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', display:'flex', alignItems:'center', gap:6 }}>
              {loading && <Loader size={14} style={{ animation:'spin 1s linear infinite', color:'var(--t4)' }}/>}
              {input && !loading && (
                <button type="button" onClick={clearSearch}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t4)', padding:4, display:'flex' }}>
                  <X size={14}/>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* 탭 */}
      {query.trim().length >= 2 && (
        <div style={{ display:'flex', gap:6, marginBottom:20, flexWrap:'wrap' }}>
          {TABS.map(t => {
            const Icon = t.icon
            const cnt  = tabCounts[t.id]
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`}
                style={{ gap:5, fontSize:12 }}>
                <Icon size={12}/>
                {t.label}
                {cnt > 0 && (
                  <span style={{ fontSize:10, background: active ? 'rgba(255,255,255,0.2)' : 'var(--bg3)', borderRadius:10, padding:'1px 6px', fontFamily:'var(--f-mono)' }}>
                    {cnt}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* 결과 */}
      {query.trim().length < 2 ? (
        <EmptyState query={query}/>
      ) : loading ? (
        <div style={{ textAlign:'center', padding:60 }}>
          <Loader size={24} style={{ animation:'spin 1s linear infinite', color:'var(--t4)' }}/>
          <div style={{ marginTop:12, fontSize:13, color:'var(--t4)' }}>검색 중…</div>
        </div>
      ) : totalCount === 0 ? (
        <EmptyState query={query}/>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

          {/* 뉴스 섹션 */}
          {showNews && displayedNews.length > 0 && (
            <div>
              {tab === 'all' && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <Newspaper size={13} color="#F59E0B"/>
                    <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)', letterSpacing:'1px' }}>
                      뉴스 {news.length}건
                    </span>
                  </div>
                  {news.length > 5 && (
                    <button onClick={() => setTab('news')} className="btn btn-ghost btn-sm" style={{ fontSize:11, gap:4 }}>
                      전체 보기 <ArrowUpRight size={11}/>
                    </button>
                  )}
                </div>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {displayedNews.map(n => <NewsCard key={n.id} item={n} navigate={navigate}/>)}
              </div>
            </div>
          )}

          {/* 아티클 섹션 */}
          {showArticles && displayedArticles.length > 0 && (
            <div>
              {tab === 'all' && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <FileText size={13} color="#A855F7"/>
                    <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)', letterSpacing:'1px' }}>
                      아티클 {articles.length}건
                    </span>
                  </div>
                  {articles.length > 5 && (
                    <button onClick={() => setTab('articles')} className="btn btn-ghost btn-sm" style={{ fontSize:11, gap:4 }}>
                      전체 보기 <ArrowUpRight size={11}/>
                    </button>
                  )}
                </div>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {displayedArticles.map(a => <ArticleCard key={a.id} item={a} navigate={navigate}/>)}
              </div>
            </div>
          )}

          {/* 커뮤니티 섹션 */}
          {showPosts && displayedPosts.length > 0 && (
            <div>
              {tab === 'all' && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <MessageSquare size={13} color="#60A5FA"/>
                    <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'var(--t3)', letterSpacing:'1px' }}>
                      커뮤니티 {posts.length}건
                    </span>
                  </div>
                  {posts.length > 4 && (
                    <button onClick={() => setTab('community')} className="btn btn-ghost btn-sm" style={{ fontSize:11, gap:4 }}>
                      전체 보기 <ArrowUpRight size={11}/>
                    </button>
                  )}
                </div>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {displayedPosts.map(p => <PostCard key={p.id} item={p} navigate={navigate}/>)}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
