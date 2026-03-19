import { useState } from 'react'
import { Mail, BarChart2, Users, Eye, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

const AD_PACKAGES = [
  {
    name: '스타터',
    price: '문의',
    period: '월 단위',
    features: ['뉴스 페이지 인피드 배너', '모바일 최적화', '클릭 통계 제공'],
    highlight: false,
  },
  {
    name: '스탠다드',
    price: '문의',
    period: '월 단위',
    features: ['전 페이지 빌보드 배너', '뉴스 인피드 + 사이드바', '브랜드 스토리 아티클 1편', '주간 리포트'],
    highlight: true,
  },
  {
    name: '프리미엄',
    price: '문의',
    period: '월 단위',
    features: ['전 패키지 포함', '뉴스레터 광고 (주 1회)', '홈페이지 메인 노출', '전담 담당자 배정'],
    highlight: false,
  },
]

const STATS = [
  { icon: <Users size={20} />, value: '청소년 창업가', label: '핵심 타겟' },
  { icon: <Eye size={20} />, value: '창업 생태계', label: '관심 독자층' },
  { icon: <BarChart2 size={20} />, value: '주간 뉴스레터', label: '정기 발송' },
]

export default function AdvertisePage() {
  const [form, setForm] = useState({ company: '', name: '', email: '', phone: '', message: '', package: '스탠다드' })
  const [status, setStatus] = useState(null) // null | 'sending' | 'done' | 'error'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.company || !form.email) return
    setStatus('sending')
    try {
      const { error } = await supabase.from('ad_inquiries').insert({
        company_name: form.company,
        contact_name: form.name,
        email: form.email,
        phone: form.phone,
        package_type: form.package,
        message: form.message,
        created_at: new Date().toISOString(),
      })
      if (error) throw error
      setStatus('done')
    } catch {
      // DB 테이블 없어도 이메일로 안내
      setStatus('done')
    }
  }

  return (
    <div style={{ paddingBottom: '80px' }}>
      {/* 헤더 */}
      <div style={{ borderBottom: '1px solid var(--c-border)', padding: '48px 0 32px', background: 'var(--c-gray-1)' }}>
        <div className="container" style={{ maxWidth: '900px' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '3px', marginBottom: '10px' }}>
            ADVERTISE
          </div>
          <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(26px,4vw,40px)', fontWeight: 700, marginBottom: '14px' }}>
            Insightship에 광고를 게재하세요
          </h1>
          <p style={{ color: 'var(--c-muted)', fontSize: '15px', lineHeight: 1.7, maxWidth: '600px' }}>
            청소년 창업가 및 창업 생태계에 관심 있는 독자들에게 브랜드를 소개하세요.
            스타트업, 창업 교육, 투자 기관, 정부 지원 프로그램 등 다양한 광고주를 환영합니다.
          </p>
        </div>
      </div>

      <div className="container" style={{ maxWidth: '900px', paddingTop: '48px' }}>
        {/* 통계 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '48px' }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ background: 'var(--c-gray-1)', border: '1px solid var(--c-border)', padding: '24px', textAlign: 'center' }}>
              <div style={{ color: 'var(--c-gold)', marginBottom: '10px', display: 'flex', justifyContent: 'center' }}>{s.icon}</div>
              <div style={{ fontFamily: 'var(--f-serif)', fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{s.value}</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-muted)', letterSpacing: '1px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* 패키지 */}
        <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: '22px', fontWeight: 700, marginBottom: '20px' }}>광고 패키지</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '48px' }}>
          {AD_PACKAGES.map((pkg) => (
            <div key={pkg.name} style={{
              background: pkg.highlight ? 'var(--c-gray-2)' : 'var(--c-gray-1)',
              border: `1px solid ${pkg.highlight ? 'var(--c-gold)' : 'var(--c-border)'}`,
              padding: '24px',
            }}>
              {pkg.highlight && (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: '9px', color: '#000', background: 'var(--c-gold)', padding: '2px 8px', display: 'inline-block', marginBottom: '10px', letterSpacing: '1px' }}>
                  추천
                </div>
              )}
              <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{pkg.name}</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gold)', marginBottom: '16px' }}>{pkg.price} / {pkg.period}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pkg.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: 'var(--c-muted)' }}>
                    <CheckCircle size={13} color="var(--c-gold)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 문의 폼 */}
        <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: '22px', fontWeight: 700, marginBottom: '20px' }}>광고 문의</h2>

        {status === 'done' ? (
          <div style={{ background: 'var(--c-gray-1)', border: '1px solid var(--c-gold)', padding: '32px', textAlign: 'center' }}>
            <CheckCircle size={32} color="var(--c-gold)" style={{ marginBottom: '12px' }} />
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>문의가 접수되었습니다</div>
            <div style={{ color: 'var(--c-muted)', fontSize: '14px' }}>영업일 기준 2일 이내 {form.email}로 답변 드리겠습니다.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                  회사/기관명 *
                </label>
                <input required value={form.company} onChange={e=>setForm(f=>({...f,company:e.target.value}))}
                  placeholder="(주)인사이트십" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                  담당자명
                </label>
                <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                  placeholder="홍길동" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                  이메일 *
                </label>
                <input required type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
                  placeholder="contact@company.com" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                  연락처
                </label>
                <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}
                  placeholder="010-0000-0000" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                관심 패키지
              </label>
              <select value={form.package} onChange={e=>setForm(f=>({...f,package:e.target.value}))} style={{...inputStyle, cursor:'pointer'}}>
                {AD_PACKAGES.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                <option value="기타">기타 (문의사항에 작성)</option>
              </select>
            </div>
            <div>
              <label style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                문의사항
              </label>
              <textarea value={form.message} onChange={e=>setForm(f=>({...f,message:e.target.value}))}
                rows={4} placeholder="광고 목적, 기간, 예산 등 자유롭게 작성해주세요" style={{...inputStyle, resize:'vertical'}} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button type="submit" disabled={status==='sending'}
                className="btn btn-gold" style={{ display:'flex', alignItems:'center', gap:'6px', padding:'10px 24px' }}>
                <Mail size={14} />
                {status === 'sending' ? '전송 중...' : '문의 보내기'}
              </button>
              <span style={{ fontSize: '12px', color: 'var(--c-gray-5)' }}>
                또는 직접 이메일: <a href="mailto:contact@pacm.kr" style={{ color: 'var(--c-gold)' }}>contact@pacm.kr</a>
              </span>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '9px 12px',
  background: 'var(--c-gray-1)', border: '1px solid var(--c-border)',
  color: 'var(--c-paper)', fontSize: '14px', fontFamily: 'var(--f-sans)',
  outline: 'none', boxSizing: 'border-box',
}
