import { useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Building2, Users, Briefcase, Mail } from 'lucide-react'
import { useProjects, useApplyProject } from '../hooks/useData'
import { useAuthStore } from '../store'

const STATUS_LABELS = { open: '모집 중', coming_soon: '공개 예정', closed: '마감' }
const STATUS_CLASSES = { open: 'badge badge-green', coming_soon: 'badge badge-gold', closed: 'badge badge-gray' }

function ProjectCard({ project, onApply }) {
  const deadline = project.deadline ? format(new Date(project.deadline), 'M월 d일', { locale: ko }) : null
  const dDay = project.deadline ? Math.ceil((new Date(project.deadline) - new Date()) / 86400000) : null

  return (
    <div className="card card-clickable" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--f-serif)', fontSize: '16px', fontWeight: 700, marginBottom: '5px', lineHeight: 1.35 }}>{project.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--c-muted)' }}>
            <Building2 size={11} /> {project.company_name || '기업명 비공개'}
          </div>
        </div>
        <span className={STATUS_CLASSES[project.status] || 'badge badge-gray'} style={{ flexShrink: 0 }}>
          {STATUS_LABELS[project.status] || project.status}
        </span>
      </div>

      {project.description && (
        <p style={{ fontSize: '13px', color: 'var(--c-muted)', lineHeight: 1.7,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
        }}>{project.description}</p>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {project.category && (
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', border: '1px solid rgba(249,115,22,0.3)', padding: '2px 8px' }}>
            {project.category}
          </span>
        )}
        {deadline && (
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: dDay !== null && dDay <= 7 ? 'var(--c-red)' : 'var(--c-gray-5)' }}>
            {dDay !== null && dDay > 0 ? `D-${dDay} · ` : '마감 · '}{deadline}
          </span>
        )}
        {project.max_participants && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gray-5)' }}>
            <Users size={10} /> {project.applicant_count || 0}/{project.max_participants}명
          </span>
        )}
      </div>

      {(project.tags || []).length > 0 && (
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {project.tags.slice(0, 4).map(t => <span key={t} className="tag">{t}</span>)}
        </div>
      )}

      {project.status === 'open' && (
        <button onClick={e => { e.stopPropagation(); onApply(project) }}
          className="btn btn-gold btn-sm"
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Briefcase size={12} /> 참여 신청
        </button>
      )}
    </div>
  )
}

function ApplyModal({ project, onClose }) {
  const [motivation, setMotivation] = useState('')
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const apply = useApplyProject()
  const { user } = useAuthStore()

  const handleApply = async () => {
    if (!user) { setErr('로그인이 필요합니다'); return }
    if (!motivation.trim()) { setErr('지원 동기를 입력해주세요'); return }
    if (motivation.length > 2000) { setErr('2000자 이하로 입력해주세요'); return }
    try { await apply.mutateAsync({ projectId: project.id, motivation: motivation.trim() }); setDone(true) }
    catch { setErr('신청 중 오류가 발생했습니다') }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        {done ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '44px', marginBottom: '14px' }}>✅</div>
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>신청 완료!</div>
            <p style={{ color: 'var(--c-muted)', fontSize: '13px', marginBottom: '24px', lineHeight: 1.7 }}>
              담당자가 검토 후 연락드립니다.
            </p>
            <button onClick={onClose} className="btn btn-outline btn-sm">닫기</button>
          </div>
        ) : (
          <>
            <div className="modal-header">
              <div>
                <div className="modal-title">{project.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--c-muted)', marginTop: '3px' }}>{project.company_name}</div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--c-muted)' }}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="label">지원 동기</label>
                <textarea value={motivation} onChange={e => setMotivation(e.target.value)}
                  placeholder="이 프로젝트에 참여하고 싶은 이유를 적어주세요"
                  rows={6} maxLength={2000} className="input" style={{ resize: 'vertical', minHeight: '140px' }} />
                <div style={{ fontSize: '11px', color: 'var(--c-gray-5)', textAlign: 'right', marginTop: '4px' }}>
                  {motivation.length} / 2000
                </div>
              </div>
              {err && <div style={{ color: 'var(--c-red)', fontSize: '12px' }}>{err}</div>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={onClose} className="btn btn-outline btn-sm">취소</button>
                <button onClick={handleApply} disabled={apply.isPending} className="btn btn-gold btn-sm">
                  {apply.isPending ? '신청 중...' : '신청하기'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
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
        <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, marginBottom: '8px', lineHeight: 1.2 }}>
          기업 · 청소년 연결
        </h1>
        <p style={{ color: 'var(--c-muted)', fontSize: '14px', maxWidth: '540px', lineHeight: 1.8 }}>
          실제 기업 프로젝트에 참여하고 경험을 쌓으세요. 기업은 신선한 시각의 인재를 만납니다.
        </p>
        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)' }}>
          <Mail size={12} />
          기업 파트너십 문의:&nbsp;
          <a href="mailto:contact@pacm.kr" style={{ color: 'var(--c-gold)' }}>contact@pacm.kr</a>
        </div>
      </div>

      {/* 콘텐츠 */}
      <div style={{ marginTop: '36px' }}>
        {isLoading ? (
          <div className="grid-3 grid-bordered">
            {[0,1,2].map(i => <div key={i} className="card skeleton" style={{ height: '220px' }} />)}
          </div>
        ) : projects.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: '18px', textAlign: 'center' }}>
            <Building2 size={48} color="var(--c-gray-4)" />
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: '20px', color: 'var(--c-paper)', fontWeight: 700 }}>기업 프로젝트 준비 중</div>
            <p style={{ color: 'var(--c-muted)', fontSize: '14px', maxWidth: '340px', lineHeight: 1.8 }}>
              현재 기업 파트너십을 구축 중입니다.<br />참여를 원하는 기업은 이메일로 문의해주세요.
            </p>
            <a href="mailto:contact@pacm.kr" className="btn btn-gold" style={{ textDecoration: 'none', display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
              <Mail size={14} /> 기업 문의하기
            </a>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '44px' }}>
            {openProjects.length > 0 && (
              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--c-border)' }}>
                  <div className="t-eyebrow">모집 중</div>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--c-green)' }} />
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-green)' }}>{openProjects.length}개</span>
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
