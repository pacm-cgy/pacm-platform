import { useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Briefcase, Mail, Building2, CheckCircle, ChevronRight, Users, Zap, Star } from 'lucide-react'
import { useProjects, useApplyProject } from '../hooks/useData'
import { supabase } from '../lib/supabase'

// ── 프로젝트 카드 (기존 유지)
function ProjectCard({ project, onApply }) {
  const deadline = project.deadline ? format(new Date(project.deadline), 'M월 d일', { locale: ko }) : '상시'
  return (
    <div className="card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: '6px' }}>{project.company_name || 'PACM'}</div>
          <div style={{ fontFamily: 'var(--f-serif)', fontSize: '17px', fontWeight: 700, lineHeight: 1.3 }}>{project.title}</div>
        </div>
        {project.status === 'open' && (
          <span style={{ background: 'var(--c-green)', color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontFamily: 'var(--f-mono)', whiteSpace: 'nowrap', flexShrink: 0 }}>모집중</span>
        )}
      </div>
      <p style={{ color: 'var(--c-muted)', fontSize: '13px', lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {project.description}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)' }}>마감 {deadline}</span>
        {project.status === 'open' && (
          <button onClick={e => { e.stopPropagation(); onApply(project) }}
            className="btn btn-gold btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Briefcase size={12} /> 참여 신청
          </button>
        )}
      </div>
    </div>
  )
}

// ── 신청 모달 (기존 유지)
function ApplyModal({ project, onClose }) {
  const [message, setMessage] = useState('')
  const [err, setErr] = useState('')
  const apply = useApplyProject()
  const handleApply = async () => {
    if (!message.trim()) { setErr('지원 동기를 작성해주세요'); return }
    try {
      await apply.mutateAsync({ projectId: project.id, message })
      onClose()
    }
    catch { setErr('신청 중 오류가 발생했습니다') }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '520px', padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{project.title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--c-muted)' }}>✕</button>
        </div>
        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="지원 동기와 역량을 간략히 소개해주세요 (최대 2000자)"
          rows={6} maxLength={2000} className="input" style={{ resize: 'vertical', minHeight: '120px', width: '100%', marginBottom: '12px' }} />
        {err && <div style={{ color: 'var(--c-red)', fontSize: '12px', marginBottom: '8px' }}>{err}</div>}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-outline btn-sm">취소</button>
          <button onClick={handleApply} disabled={apply.isPending} className="btn btn-gold btn-sm">
            {apply.isPending ? '신청 중...' : '신청하기'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 기업 파트너 신청 폼 (NEW)
function PartnerForm() {
  const [form, setForm] = useState({ company_name: '', contact_name: '', email: '', phone: '', inquiry_type: 'partnership', message: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.company_name || !form.contact_name || !form.email || !form.message) {
      setErr('필수 항목을 모두 입력해주세요'); return
    }
    setLoading(true)
    try {
      const { error } = await supabase.from('partner_inquiries').insert([form])
      if (error) throw error
      setDone(true)
    } catch { setErr('제출 중 오류가 발생했습니다. 이메일로 문의해주세요.') }
    finally { setLoading(false) }
  }

  if (done) return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <CheckCircle size={48} color="var(--c-green)" style={{ marginBottom: '16px' }} />
      <div style={{ fontFamily: 'var(--f-serif)', fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>신청이 접수되었습니다!</div>
      <div style={{ color: 'var(--c-muted)', fontSize: '14px', lineHeight: 1.8 }}>
        빠른 시일 내에 <strong>{form.email}</strong>로 연락드리겠습니다.<br />
        PACM과 함께해주셔서 감사합니다.
      </div>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)', display: 'block', marginBottom: '6px' }}>회사명 *</label>
          <input className="input" value={form.company_name} onChange={e => setForm(f => ({...f, company_name: e.target.value}))} placeholder="(주)예시컴퍼니" />
        </div>
        <div>
          <label style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)', display: 'block', marginBottom: '6px' }}>담당자명 *</label>
          <input className="input" value={form.contact_name} onChange={e => setForm(f => ({...f, contact_name: e.target.value}))} placeholder="홍길동" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)', display: 'block', marginBottom: '6px' }}>이메일 *</label>
          <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="contact@company.com" />
        </div>
        <div>
          <label style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)', display: 'block', marginBottom: '6px' }}>연락처</label>
          <input className="input" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="010-0000-0000" />
        </div>
      </div>
      <div>
        <label style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)', display: 'block', marginBottom: '6px' }}>문의 유형</label>
        <select className="input" value={form.inquiry_type} onChange={e => setForm(f => ({...f, inquiry_type: e.target.value}))}>
          <option value="partnership">기업 파트너십</option>
          <option value="project">프로젝트 의뢰</option>
          <option value="recruitment">인재 발굴</option>
          <option value="sponsorship">후원 / 협찬</option>
          <option value="other">기타</option>
        </select>
      </div>
      <div>
        <label style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)', display: 'block', marginBottom: '6px' }}>문의 내용 *</label>
        <textarea className="input" value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))}
          placeholder="파트너십 목적, 원하시는 협력 방식, 기업 소개 등을 자유롭게 작성해주세요."
          rows={5} style={{ resize: 'vertical', minHeight: '120px', width: '100%' }} />
      </div>
      {err && <div style={{ color: 'var(--c-red)', fontSize: '12px' }}>{err}</div>}
      <button type="submit" disabled={loading} className="btn btn-primary" style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {loading ? '제출 중...' : <><ChevronRight size={14} /> 파트너십 신청하기</>}
      </button>
    </form>
  )
}

export default function ConnectPage() {
  const [selectedProject, setSelectedProject] = useState(null)
  const { data: projects = [], isLoading } = useProjects()
  const openProjects  = projects.filter(p => p.status === 'open')
  const otherProjects = projects.filter(p => p.status !== 'open')

  return (
    <div style={{ paddingBottom: '80px' }}>
      {selectedProject && <ApplyModal project={selectedProject} onClose={() => setSelectedProject(null)} />}

      {/* 헤더 */}
      <div style={{ padding: '32px 0 28px', borderBottom: '1px solid var(--c-border)' }}>
        <div className="t-eyebrow" style={{ marginBottom: '8px' }}>PACM CONNECT</div>
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, marginBottom: '12px', lineHeight: 1.2 }}>
          기업 · 청소년 연결
        </h1>
        <p style={{ color: 'var(--c-muted)', fontSize: '14px', maxWidth: '540px', lineHeight: 1.8 }}>
          실제 기업 프로젝트에 참여하고 경험을 쌓으세요. 기업은 신선한 시각의 인재를 만납니다.
        </p>
      </div>

      {/* 가치 제안 3카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)', marginTop: '32px' }}>
        {[
          { icon: <Users size={20} />, title: '청소년 인재 발굴', desc: '전국 청소년 창업가들과 직접 연결됩니다. 기업의 새로운 시각을 만나보세요.' },
          { icon: <Zap size={20} />, title: '실전 프로젝트', desc: '실제 비즈니스 문제를 청소년 팀이 함께 해결합니다. 낮은 비용, 높은 창의성.' },
          { icon: <Star size={20} />, title: '브랜드 임팩트', desc: 'Insightship 플랫폼에 파트너사로 소개됩니다. 청소년 세대와의 접점을 만드세요.' },
        ].map((item, i) => (
          <div key={i} className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ color: 'var(--c-indigo)' }}>{item.icon}</div>
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: '16px', fontWeight: 700 }}>{item.title}</div>
            <div style={{ color: 'var(--c-muted)', fontSize: '13px', lineHeight: 1.7 }}>{item.desc}</div>
          </div>
        ))}
      </div>

      {/* 기업 파트너 신청 폼 */}
      <div style={{ marginTop: '48px', display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '40px', alignItems: 'start' }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: '12px' }}>PARTNER INQUIRY</div>
          <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: '24px', fontWeight: 700, marginBottom: '16px', lineHeight: 1.3 }}>
            파트너십을<br />시작해보세요
          </h2>
          <p style={{ color: 'var(--c-muted)', fontSize: '14px', lineHeight: 1.8, marginBottom: '20px' }}>
            신청서를 보내주시면 24시간 내에 담당자가 연락드립니다.
            부담 없이 문의해주세요.
          </p>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '12px', color: 'var(--c-muted)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div><Mail size={11} style={{ marginRight: '6px', verticalAlign: 'middle' }} />contact@pacm.kr</div>
          </div>
        </div>
        <div className="card" style={{ padding: '28px' }}>
          <PartnerForm />
        </div>
      </div>

      {/* 프로젝트 목록 */}
      <div style={{ marginTop: '64px' }}>
        <div className="t-eyebrow" style={{ marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--c-border)' }}>OPEN PROJECTS</div>
        {isLoading ? (
          <div className="grid-3 grid-bordered">
            {[0,1,2].map(i => <div key={i} className="card skeleton" style={{ height: '220px' }} />)}
          </div>
        ) : projects.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '16px', textAlign: 'center' }}>
            <Building2 size={48} color="var(--c-gray-4)" />
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: '20px', color: 'var(--c-paper)', fontWeight: 700 }}>프로젝트 준비 중</div>
            <p style={{ color: 'var(--c-muted)', fontSize: '14px', maxWidth: '340px', lineHeight: 1.8 }}>
              곧 기업 파트너십 프로젝트가 공개됩니다.<br />위 폼으로 먼저 문의해주세요.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '44px' }}>
            {openProjects.length > 0 && (
              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--c-border)' }}>
                  <div className="t-eyebrow">모집 중</div>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--c-green)', animation: 'pulse 2s infinite' }} />
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-green)' }}>{openProjects.length}개 진행중</span>
                </div>
                <div className="grid-3 grid-bordered">
                  {openProjects.map(p => <ProjectCard key={p.id} project={p} onApply={setSelectedProject} />)}
                </div>
              </section>
            )}
            {otherProjects.length > 0 && (
              <section>
                <div className="t-eyebrow" style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--c-border)' }}>
                  공개 예정 / 마감
                </div>
                <div className="grid-3 grid-bordered">
                  {otherProjects.map(p => <ProjectCard key={p.id} project={p} onApply={setSelectedProject} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
