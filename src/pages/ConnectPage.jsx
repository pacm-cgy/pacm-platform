import { useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useProjects, useApplyProject } from '../hooks/useData'
import { useAuthStore } from '../store'

function ProjectModal({ project, onClose }) {
  const [motivation, setMotivation] = useState('')
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const apply = useApplyProject()
  const { user } = useAuthStore()

  const handleApply = async () => {
    if (!user) return setErr('로그인이 필요합니다')
    try {
      await apply.mutateAsync({ projectId: project.id, motivation })
      setDone(true)
    } catch(e) { setErr(e.message) }
  }

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{ maxWidth:'560px' }}>
        <div className="modal-header">
          <div>
            <div className="t-eyebrow" style={{ marginBottom:'4px' }}>{project.company_name}</div>
            <div className="modal-title" style={{ fontSize:'18px' }}>{project.title}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'var(--c-muted)' }}>✕</button>
        </div>
        <div className="modal-body">
          {done ? (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ fontSize:'40px', marginBottom:'12px' }}>✅</div>
              <div style={{ fontFamily:'var(--f-serif)', fontSize:'18px', marginBottom:'8px' }}>지원이 완료되었습니다!</div>
              <div style={{ color:'var(--c-muted)', fontSize:'14px' }}>담당자가 검토 후 연락드릴 예정입니다.</div>
            </div>
          ) : (
            <>
              <p style={{ color:'var(--c-muted)', fontSize:'14px', lineHeight:1.7, marginBottom:'20px' }}>{project.description}</p>
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'20px' }}>
                {(project.tags||[]).map(t=><span key={t} className="tag">{t}</span>)}
              </div>
              {err && <div style={{ background:'var(--c-red-dim)', color:'var(--c-red)', padding:'10px 14px', fontSize:'13px', marginBottom:'14px' }}>{err}</div>}
              {user ? (
                <>
                  <label className="label">지원 동기 (선택사항)</label>
                  <textarea className="input" value={motivation} onChange={e=>setMotivation(e.target.value)} placeholder="이 프로젝트에 지원하는 이유와 본인의 강점을 간략히 적어주세요" rows={4} maxLength={1000} style={{ marginBottom:'16px', resize:'vertical' }}/>
                  <button className="btn btn-gold btn-full" onClick={handleApply} disabled={apply.isPending}>
                    {apply.isPending ? '처리 중...' : '지원하기'}
                  </button>
                </>
              ) : (
                <div style={{ textAlign:'center', padding:'16px', background:'var(--c-cream)', color:'var(--c-muted)', fontSize:'14px' }}>
                  로그인 후 지원할 수 있습니다
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ConnectPage() {
  const { data: projects = [], isLoading } = useProjects()
  const [selected, setSelected] = useState(null)

  const open = projects.filter(p=>p.status==='open')
  const soon = projects.filter(p=>p.status==='coming_soon')
  const all = [...open, ...soon]

  return (
    <div style={{ paddingBottom:'64px' }}>
      <div style={{ padding:'40px 0 24px' }}>
        <div className="t-eyebrow" style={{ marginBottom:'8px' }}>PACM CONNECT</div>
        <h1 style={{ fontFamily:'var(--f-serif)', fontSize:'34px', fontWeight:700, marginBottom:'8px' }}>기업 · 청소년 연결</h1>
        <p style={{ color:'var(--c-muted)', fontSize:'14px', maxWidth:'560px' }}>실제 기업 프로젝트에 참여하고 경험을 쌓으세요. 기업은 신선한 시각의 인재를 만납니다.
        기업 파트너십 문의: <a href="mailto:contact@pacm.kr" style={{color:"var(--c-gold)"}}>contact@pacm.kr</a></p>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'2px', background:'var(--c-border)', border:'1px solid var(--c-border)', marginBottom:'32px' }}>
        {[
          { label:'현재 모집 중', value:open.length||'0', unit:'개 프로젝트' },
          { label:'파트너 기업', value:'14', unit:'개 기업' },
          { label:'누적 참여자', value:'320', unit:'명' },
        ].map(s=>(
          <div key={s.label} style={{ background:'var(--c-card)', padding:'24px', textAlign:'center' }}>
            <div style={{ fontFamily:'var(--f-serif)', fontSize:'32px', fontWeight:700, marginBottom:'4px' }}>{s.value}</div>
            <div className="t-caption">{s.unit}</div>
            <div style={{ fontSize:'12px', color:'var(--c-muted)', marginTop:'2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Project Grid */}
      {isLoading ? (
        <div className="grid-3 grid-bordered">
          {[0,1,2].map(i=>(
            <div key={i} style={{ background:'var(--c-card)', padding:'24px' }}>
              <div className="skeleton skeleton-text" style={{ width:'80px', height:'20px', marginBottom:'12px' }}/>
              <div className="skeleton skeleton-text skeleton-title"/>
              <div className="skeleton skeleton-text"/>
              <div className="skeleton skeleton-text" style={{ width:'60%' }}/>
            </div>
          ))}
        </div>
      ) : all.length > 0 ? (
        <div className="grid-3 grid-bordered">
          {all.map(p=>{
            const isOpen = p.status==='open'
            const deadline = p.deadline ? format(new Date(p.deadline),'M/d',{locale:ko}) : null
            const dDay = p.deadline ? Math.ceil((new Date(p.deadline)-new Date())/86400000) : null
            return (
              <div key={p.id} className="card card-clickable" style={{ padding:'24px' }} onClick={()=>setSelected(p)}>
                <div className={`badge ${isOpen?'badge-green':'badge-gold'}`} style={{ marginBottom:'12px' }}>
                  <div style={{ width:'5px', height:'5px', borderRadius:'50%', background:'currentColor' }}/>
                  {isOpen?'RECRUITING':'COMING SOON'}
                </div>
                {p.company_logo && <img src={p.company_logo} alt={p.company_name} style={{ height:'28px', objectFit:'contain', marginBottom:'10px', filter:'grayscale(1)', opacity:0.7 }}/>}
                <h3 style={{ fontFamily:'var(--f-serif)', fontSize:'17px', fontWeight:700, lineHeight:1.3, marginBottom:'6px' }}>{p.title}</h3>
                <div style={{ fontSize:'12px', color:'var(--c-muted)', marginBottom:'10px' }}>
                  📍 {p.company_name}{p.location?` · ${p.location}`:''}{p.is_remote?' · 원격 가능':''}
                </div>
                <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', marginBottom:'12px' }}>
                  {(p.tags||[]).map(t=><span key={t} className="tag">{t}</span>)}
                </div>
                <p style={{ fontSize:'13px', color:'var(--c-muted)', lineHeight:1.6, marginBottom:'14px',
                  display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden'
                }}>{p.description}</p>
                <div style={{ display:'flex', justifyContent:'space-between', paddingTop:'12px', borderTop:'1px solid var(--c-border)', fontFamily:'var(--f-mono)', fontSize:'11px', color:'var(--c-muted)' }}>
                  <span>{deadline?(dDay>0?`마감 D-${dDay} · ${deadline}`:'마감'):'마감 미정'}</span>
                  <span style={{ color:'var(--c-gold)' }}>지원 {p.applicant_count}명</span>
                </div>
              </div>
            )
          })}
          {/* Partner CTA */}
          <div className="card" style={{ padding:'24px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--c-cream)', cursor:'pointer', textAlign:'center', minHeight:'200px' }}>
            <div style={{ fontSize:'28px', marginBottom:'10px' }}>+</div>
            <div style={{ fontFamily:'var(--f-serif)', fontSize:'16px', fontWeight:600, marginBottom:'8px' }}>기업 파트너 신청</div>
            <div style={{ fontSize:'13px', color:'var(--c-muted)', maxWidth:'180px', lineHeight:1.5 }}>청소년 인재를 찾는 기업이라면 파트너로 참여하세요</div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign:'center', padding:'80px 0', color:'var(--c-muted)' }}>
          <div style={{ fontSize:'40px', marginBottom:'16px' }}>🔗</div>
          <div style={{ fontFamily:'var(--f-serif)', fontSize:'18px' }}>기업 프로젝트가 곧 공개됩니다</div>
        </div>
      )}

      {selected && <ProjectModal project={selected} onClose={()=>setSelected(null)}/>}
      <style>{`@media(max-width:768px){.grid-3{grid-template-columns:1fr!important}}`}</style>
    </div>
  )
}
