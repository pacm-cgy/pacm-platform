import { generateSlug } from '../utils/slug'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useAuthStore } from '../store'
import { supabase } from '../lib/supabase'
import { BarChart2, FileText, Users, Newspaper, RefreshCw, Loader, Zap, Bell, Calendar, AlertTriangle } from 'lucide-react'

function AIAssistant({ context, onInsert }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [prompt, setPrompt] = useState('')

  const analyze = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      const r = await fetch(`/api/admin-ai?prompt=${encodeURIComponent(prompt)}&context=${encodeURIComponent(context || '')}`, {
        headers: { Authorization: 'Bearer ' + token }
      })
      const d = await r.json()
      setResult(d.result || '결과 없음')
    } catch {
      setResult('AI 분석 실패. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Zap size={14} color="#F59E0B" />
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: '#F59E0B', letterSpacing: '1px' }}>AI 작성 보조</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && analyze()}
          placeholder="분석 요청 입력 (예: 이번 주 AI 스타트업 투자 동향 분석해줘)"
          className="input"
          style={{ flex: 1, fontSize: 13 }}
        />
        <button onClick={analyze} disabled={loading} className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={12} />}
          분석
        </button>
      </div>
      {result && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.8, color: 'var(--t1)', maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
          {result}
          <button onClick={() => onInsert?.(result)} className="btn btn-ghost btn-sm" style={{ marginTop: 10, display: 'block' }}>
            본문에 삽입
          </button>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color = '#F59E0B' }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 10, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 42, height: 42, background: `${color}15`, border: `1px solid ${color}25`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 22, fontWeight: 700, color: 'var(--t1)' }}>{value}</div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)', letterSpacing: '1px' }}>{label}</div>
      </div>
    </div>
  )
}

function WritePanel({ onClose }) {
  const { profile } = useAuthStore()
  const [form, setForm] = useState({ title: '', body: '', category: 'insight', excerpt: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async (status = 'draft') => {
    if (!form.title.trim() || !form.body.trim()) { setMsg('제목과 본문을 입력하세요'); return }
    setSaving(true)
    try {
      const slug = generateSlug(form.title, 'article')
      const { error } = await supabase.from('articles').insert({
        title: form.title.trim(), slug, body: form.body.trim(),
        excerpt: (form.excerpt || form.body.slice(0, 200)).trim(),
        category: form.category, author_id: profile?.id, status,
        published_at: status === 'published' ? new Date().toISOString() : null,
      })
      if (error) throw error
      setMsg(status === 'published' ? '✅ 발행 완료!' : '✅ 임시저장 완료')
      if (status === 'published') setTimeout(onClose, 1500)
    } catch (e) {
      setMsg('❌ ' + e.message?.slice(0, 60))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg0)', zIndex: 1000, overflow: 'auto', padding: '24px var(--pad-x)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 700, color: 'var(--t1)' }}>아티클 작성</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => save('draft')} disabled={saving} className="btn btn-ghost btn-sm">임시저장</button>
            <button onClick={() => save('published')} disabled={saving} className="btn btn-primary btn-sm">발행하기</button>
            <button onClick={onClose} className="btn btn-ghost btn-sm">닫기</button>
          </div>
        </div>

        <AIAssistant context={form.title} onInsert={text => setForm(f => ({ ...f, body: f.body + '\n\n' + text }))} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="제목" className="input"
            style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 700, padding: '14px 16px' }} />

          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="input" style={{ width: 200 }}>
            <option value="insight">INSIGHT</option>
            <option value="story">FOUNDER STORY</option>
            <option value="trend">TREND</option>
            <option value="opinion">OPINION</option>
          </select>

          <textarea value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
            placeholder="요약 (미입력 시 본문 앞 200자 자동 사용)" rows={2}
            className="input" style={{ resize: 'vertical' }} />

          <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            placeholder="본문 (마크다운 지원)" rows={22}
            className="input" style={{ fontSize: 15, lineHeight: 1.9, resize: 'vertical' }} />
        </div>

        {msg && <div style={{ marginTop: 12, fontFamily: 'var(--f-mono)', fontSize: 13, color: msg.includes('✅') ? '#22C55E' : '#F43F5E' }}>{msg}</div>}
      </div>
    </div>
  )
}

export default function AdminPage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [writeOpen, setWriteOpen] = useState(false)
  const [runningCron, setRunningCron] = useState('')
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [noticeForm, setNoticeForm] = useState({ title: '', body: '', maintenanceDate: '', type: 'maintenance', timeRange: '' })
  const [noticeSaving, setNoticeSaving] = useState(false)
  const [noticeMsg, setNoticeMsg] = useState('')

  useEffect(() => {
    if (!user || profile?.role !== 'admin') { navigate('/'); return }
    loadStats()
  }, [user, profile])

  const loadStats = async () => {
    setLoading(true)
    const [art, news, sub, posts] = await Promise.all([
      supabase.from('articles').select('id', { count: 'exact' }).eq('status', 'published').is('source_name', null),
      supabase.from('articles').select('id', { count: 'exact' }).not('source_name', 'is', null),
      supabase.from('newsletter_subscribers').select('id', { count: 'exact' }).eq('is_active', true),
      supabase.from('community_posts').select('id', { count: 'exact' }),
    ])
    setStats({ articles: art.count || 0, news: news.count || 0, subscribers: sub.count || 0, posts: posts.count || 0 })
    setLoading(false)
  }

  const runCron = async (path, label) => {
    setRunningCron(label)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(path, { headers: { 'x-vercel-cron': '1', Authorization: 'Bearer ' + (session?.access_token || '') } })
      const d = await r.json()
      alert(`${label} 완료:\n${JSON.stringify(d, null, 2).slice(0, 300)}`)
    } catch (e) {
      alert('오류: ' + e.message)
    } finally {
      setRunningCron('')
    }
  }

  // 월간 점검 공지 게시 (최소 7일 전)
  const postMaintenanceNotice = async () => {
    if (!noticeForm.title.trim() || !noticeForm.body.trim() || !noticeForm.maintenanceDate) {
      setNoticeMsg('❌ 제목, 내용, 점검 예정일을 모두 입력하세요.')
      return
    }
    const maintenanceDate = new Date(noticeForm.maintenanceDate)
    const today = new Date()
    const daysUntil = Math.ceil((maintenanceDate - today) / (1000 * 60 * 60 * 24))
    if (daysUntil < 7) {
      setNoticeMsg(`❌ 점검 공지는 최소 7일 전에 게시해야 합니다. (현재 D-${daysUntil})`)
      return
    }
    setNoticeSaving(true)
    setNoticeMsg('')
    try {
      const TYPE_LABELS = { maintenance:'시스템 점검', qa:'QA 점검', update:'업데이트 배포', emergency:'긴급 점검' }
      const typeLabel = TYPE_LABELS[noticeForm.type] || '시스템 점검'
      const dateStr = maintenanceDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
      const dayOfWeek = maintenanceDate.toLocaleDateString('ko-KR', { weekday: 'long' })
      const timeStr = noticeForm.timeRange?.trim() ? `\n⏰ **점검 시간**: ${noticeForm.timeRange.trim()}` : ''
      const fullBody = `📅 **점검 예정일**: ${dateStr} (${dayOfWeek})${timeStr}\n🔧 **점검 유형**: ${typeLabel}\n\n${noticeForm.body.trim()}\n\n---\n*본 공지는 정기 월간 점검 ${daysUntil}일 전(D-${daysUntil}) 게시되었습니다. 점검 시간 동안 일부 기능이 제한될 수 있습니다.*`
      const { error } = await supabase.from('community_posts').insert({
        title: noticeForm.title.trim(),
        body: fullBody,
        content: fullBody,
        post_type: 'notice',
        is_pinned: true,
        author_id: profile?.id,
        tags: ['점검공지', '월간점검', typeLabel.replace(/ /g,'')],
      })
      if (error) throw error
      setNoticeMsg(`✅ 점검 공지가 게시되었습니다! (D-${daysUntil})`)
      setNoticeForm({ title: '', body: '', maintenanceDate: '', type: 'maintenance', timeRange: '' })
      setTimeout(() => setNoticeOpen(false), 2000)
    } catch (e) {
      setNoticeMsg('❌ ' + (e.message?.slice(0, 80) || '오류가 발생했습니다.'))
    } finally {
      setNoticeSaving(false)
    }
  }

  if (!user || profile?.role !== 'admin') return null

  return (
    <div style={{ paddingBottom: 80 }}>
      <Helmet>
        <title>관리자 대시보드 | Insightship</title>
        <meta name="robots" content="noindex, nofollow"/>
      </Helmet>
      <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--b1)', padding: '16px 0' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: '#60A5FA', letterSpacing: '3px', marginBottom: 4 }}>ADMIN</div>
            <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 700, color: 'var(--t1)' }}>관리자 대시보드</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setNoticeOpen(p => !p)} className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, borderColor: '#F59E0B30', color: '#F59E0B' }}>
              <Bell size={14} /> 점검 공지
            </button>
            <button onClick={() => setWriteOpen(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileText size={14} /> 아티클 작성
            </button>
          </div>
        </div>
      </div>

      <div className="container" style={{ marginTop: 32 }}>
        {/* ── 통계 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 10, marginBottom: 40 }}>
          {loading ? [...Array(4)].map((_,i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 10 }} />) : (
            <>
              <StatCard label="발행 아티클"  value={stats.articles}    icon={FileText}   color="#3B82F6" />
              <StatCard label="수집 뉴스"    value={stats.news}        icon={Newspaper}  color="#22C55E" />
              <StatCard label="구독자"       value={stats.subscribers} icon={Users}      color="#F59E0B" />
              <StatCard label="커뮤니티 글"  value={stats.posts}       icon={BarChart2}  color="#A855F7" />
            </>
          )}
        </div>

        {/* ── 월간 점검 공지 패널 */}
        {noticeOpen && (
          <div style={{ background: 'var(--bg2)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: 24, marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <Bell size={15} color="#F59E0B" />
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: '#F59E0B', letterSpacing: '2px' }}>월간 점검 공지 게시</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--f-mono)', fontSize: 10, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', padding: '2px 8px', borderRadius: 4 }}>
                <AlertTriangle size={10}/> 최소 7일 전 게시 의무
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)', marginBottom: 6 }}>공지 제목 *</div>
                  <input value={noticeForm.title}
                    onChange={e => setNoticeForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="예: [공지] 5월 정기 월간 점검 안내"
                    className="input" style={{ fontSize: 13 }} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)', marginBottom: 6 }}>점검 예정일 * (오늘로부터 7일 이상)</div>
                  <input type="date" value={noticeForm.maintenanceDate}
                    onChange={e => setNoticeForm(f => ({ ...f, maintenanceDate: e.target.value }))}
                    min={new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}
                    className="input" style={{ fontSize: 13 }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)', marginBottom: 6 }}>점검 유형</div>
                  <select value={noticeForm.type}
                    onChange={e => setNoticeForm(f => ({ ...f, type: e.target.value }))}
                    className="input" style={{ fontSize: 13 }}>
                    <option value="maintenance">시스템 점검</option>
                    <option value="qa">QA 점검</option>
                    <option value="update">업데이트 배포</option>
                    <option value="emergency">긴급 점검</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)', marginBottom: 6 }}>점검 시간대 (선택)</div>
                  <input value={noticeForm.timeRange || ''}
                    onChange={e => setNoticeForm(f => ({ ...f, timeRange: e.target.value }))}
                    placeholder="예: 오전 2:00 ~ 6:00"
                    className="input" style={{ fontSize: 13 }} />
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t3)', marginBottom: 6 }}>공지 내용 *</div>
                <textarea value={noticeForm.body}
                  onChange={e => setNoticeForm(f => ({ ...f, body: e.target.value }))}
                  placeholder={`점검 내용을 입력하세요.\n예) 정기 월간 QA 점검이 예정되어 있습니다.\n점검 중에는 일부 서비스 이용이 제한될 수 있습니다.\n불편을 드려 죄송합니다.`}
                  rows={4} className="input" style={{ fontSize: 13, resize: 'vertical' }} />
              </div>
              {/* D-day preview */}
              {noticeForm.maintenanceDate && (()=>{
                const d = Math.ceil((new Date(noticeForm.maintenanceDate) - new Date()) / 86400000)
                return d > 0 ? (
                  <div style={{ fontFamily:'var(--f-mono)', fontSize:11, color: d>=7?'#22C55E':'#F43F5E',
                    display:'flex', alignItems:'center', gap:6 }}>
                    <Calendar size={11}/>
                    {d>=7 ? `✅ D-${d} — 7일 규정 충족` : `❌ D-${d} — 최소 7일 전 게시 필요 (${7-d}일 부족)`}
                  </div>
                ) : null
              })()}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={postMaintenanceNotice} disabled={noticeSaving}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#F59E0B,#D97706)' }}>
                  {noticeSaving ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Bell size={13} />}
                  {noticeSaving ? '게시 중...' : '공지 게시'}
                </button>
                {noticeMsg && (
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12,
                    color: noticeMsg.includes('✅') ? '#22C55E' : '#F43F5E' }}>
                    {noticeMsg}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── AI 시장 분석 보조 */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
            <Zap size={14} color="#F59E0B"/>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#F59E0B', letterSpacing: '2px' }}>AI 시장 분석 · 운영 모니터링</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10, marginBottom:16 }}>
            {[
              { label:'뉴스 수집', icon:'📰', desc:'마지막 수집 현황' },
              { label:'AI 요약',   icon:'🤖', desc:'미처리 항목 확인' },
              { label:'트렌드 분석', icon:'📊', desc:'시장 지표 현황' },
              { label:'구독 현황', icon:'✉️',  desc:`활성 ${stats?.subscribers || 0}명` },
            ].map((item,i)=>(
              <div key={i} style={{ background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:10, padding:'14px 16px' }}>
                <div style={{ fontSize:18, marginBottom:6 }}>{item.icon}</div>
                <div style={{ fontFamily:'var(--f-sans)', fontSize:13, fontWeight:600, color:'var(--t1)', marginBottom:3 }}>{item.label}</div>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--t3)' }}>{item.desc}</div>
              </div>
            ))}
          </div>
          <AIAssistant context={`한국 스타트업 시장 현황. 현재 플랫폼 통계: 뉴스 ${stats?.news||0}건, 아티클 ${stats?.articles||0}편, 구독자 ${stats?.subscribers||0}명`} onInsert={() => {}} />
        </div>

        {/* ── Cron 수동 실행 */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#60A5FA', letterSpacing: '2px', marginBottom: 14 }}>수동 실행 · CRON JOBS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: '뉴스 수집',   path: '/api/fetch-news',        color:'#22C55E' },
              { label: 'AI 요약',     path: '/api/summarize-news',    color:'#A855F7' },
              { label: 'OG 이미지',   path: '/api/fetch-og',          color:'#3B82F6' },
              { label: 'AI 리포트',   path: '/api/generate-report',   color:'#F59E0B' },
              { label: '트렌드 업데이트', path: '/api/update-trends', color:'#F97316' },
            ].map(({ label, path, color }) => (
              <button key={path} onClick={() => runCron(path, label)}
                disabled={!!runningCron} className="btn btn-ghost btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 6, borderColor: runningCron===label ? color+'50' : undefined, color: runningCron===label ? color : undefined }}>
                {runningCron === label ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                {runningCron === label ? `${label} 실행 중...` : label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {writeOpen && <WritePanel onClose={() => { setWriteOpen(false); loadStats() }} />}


      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
