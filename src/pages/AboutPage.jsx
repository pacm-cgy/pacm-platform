import { useNavigate } from 'react-router-dom'
import { ArrowRight, Zap, BarChart2, Users, BookOpen, Globe, Shield } from 'lucide-react'

const FEATURES = [
  {
    icon: BookOpen,
    title: '창업 인사이트',
    desc: '스타트업 성공·실패 스토리, 투자 분석, 시장 트렌드를 청소년이 이해하기 쉽게 정리합니다.',
  },
  {
    icon: Zap,
    title: 'AI 뉴스 정리',
    desc: 'AI가 매일 창업·투자 뉴스를 수집하고 요약합니다. 어려운 금융 용어는 쉬운 설명으로 풀어드립니다.',
  },
  {
    icon: BarChart2,
    title: '트렌드 트래커',
    desc: '중소벤처기업부, 창업진흥원 등 공공기관 공인 데이터로 한국 스타트업 생태계 흐름을 추적합니다.',
  },
  {
    icon: Users,
    title: '커뮤니티',
    desc: '같은 꿈을 가진 청소년 창업가들과 아이디어를 나누고, 팀원을 모집하고, 피드백을 받으세요.',
  },
  {
    icon: Globe,
    title: '기업 연결',
    desc: '청소년 창업 프로젝트를 지원하는 기업·기관과 직접 연결됩니다. 멘토링, 투자, 파트너십 기회를 제공합니다.',
  },
  {
    icon: Shield,
    title: '신뢰할 수 있는 정보',
    desc: '검증된 공공기관 데이터와 AI 검수를 통해 사실에 기반한 정확한 정보만 제공합니다. 잘못된 정보는 없습니다.',
  },
]

const VALUES = [
  { num: '22+', label: '수집된 창업 뉴스', sub: '매일 자동 업데이트' },
  { num: '6개', label: '공공기관 트렌드 지표', sub: '중기부·창업진흥원 등' },
  { num: '주 1회', label: 'AI 뉴스레터', sub: '매주 월요일 발송' },
  { num: '무료', label: '완전 무료 서비스', sub: '청소년을 위한 개방형 플랫폼' },
]

export default function AboutPage() {
  const navigate = useNavigate()

  return (
    <div style={{ paddingBottom: '100px' }}>

      {/* ── 히어로 ─────────────────────────────────────── */}
      <div style={{ background: 'var(--c-ink)', color: '#F0EEE8', padding: 'clamp(60px,10vw,100px) var(--pad-x)', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gold)', letterSpacing: '3px', marginBottom: '20px' }}>
            ABOUT INSIGHTSHIP
          </div>
          <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(28px,5vw,48px)', fontWeight: 700, lineHeight: 1.2, marginBottom: '24px', color: '#F0EEE8' }}>
            청소년 창업가를 위한<br />
            <span style={{ color: 'var(--c-gold)' }}>인사이트 플랫폼</span>
          </h1>
          <p style={{ fontSize: 'clamp(15px,2vw,17px)', lineHeight: 1.9, color: '#A0A090', maxWidth: '540px', margin: '0 auto 36px' }}>
            Insightship은 창업에 관심 있는 청소년에게<br />
            검증된 정보, AI 뉴스 분석, 트렌드 데이터를 제공합니다.<br />
            스타트업 생태계를 가장 쉽고 정확하게 이해하세요.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/news')} className="btn btn-gold" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              뉴스 보기 <ArrowRight size={14} />
            </button>
            <button onClick={() => navigate('/insight')} className="btn btn-outline" style={{ borderColor: '#333', color: '#F0EEE8' }}>
              인사이트 보기
            </button>
          </div>
        </div>
      </div>

      {/* ── 수치 ───────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid var(--c-gray-3)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', borderTop: '1px solid var(--c-gray-3)' }}>
            {VALUES.map((v, i) => (
              <div key={i} style={{ padding: '32px 24px', borderRight: i < VALUES.length - 1 ? '1px solid var(--c-gray-3)' : 'none', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(24px,4vw,36px)', fontWeight: 700, color: 'var(--c-gold)', marginBottom: '6px' }}>
                  {v.num}
                </div>
                <div style={{ fontFamily: 'var(--f-sans)', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{v.label}</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-muted)' }}>{v.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 기능 소개 ───────────────────────────────────── */}
      <div className="container" style={{ marginTop: '72px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className="t-eyebrow" style={{ marginBottom: '10px' }}>FEATURES</div>
          <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(22px,3vw,30px)', fontWeight: 700 }}>
            Insightship이 제공하는 것
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px,100%), 1fr))', gap: '2px', background: 'var(--c-gray-3)', border: '1px solid var(--c-gray-3)' }}>
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <div key={i} style={{ background: 'var(--c-card)', padding: '32px 28px' }}>
              <div style={{ width: '40px', height: '40px', background: 'var(--c-gray-2)', border: '1px solid var(--c-gray-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px' }}>
                <Icon size={18} style={{ color: 'var(--c-gold)' }} />
              </div>
              <h3 style={{ fontFamily: 'var(--f-serif)', fontSize: '17px', fontWeight: 700, marginBottom: '10px' }}>{title}</h3>
              <p style={{ color: 'var(--c-muted)', fontSize: '14px', lineHeight: 1.8 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 운영사 정보 ─────────────────────────────────── */}
      <div className="container" style={{ marginTop: '72px' }}>
        <div style={{ background: 'var(--c-gray-2)', border: '1px solid var(--c-gray-3)', padding: 'clamp(32px,5vw,56px)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '40px', alignItems: 'center' }}>
          <div>
            <div className="t-eyebrow" style={{ marginBottom: '10px' }}>운영사</div>
            <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px,3vw,26px)', fontWeight: 700, marginBottom: '16px' }}>
              피에이씨엠 (PACM)
            </h2>
            <p style={{ color: 'var(--c-muted)', fontSize: '14px', lineHeight: 1.9, maxWidth: '480px', marginBottom: '20px' }}>
              피에이씨엠(PACM)은 청소년의 창업 역량 강화와 미래 혁신가 양성을 목표로 설립되었습니다.
              Insightship을 통해 청소년 창업 생태계를 연결하고, 올바른 정보 접근 기회를 제공합니다.
            </p>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: '12px', color: 'var(--c-muted)', lineHeight: 2 }}>
              <div>사업자등록번호: <strong style={{ color: 'var(--c-paper)' }}>891-45-01385</strong></div>
              <div>주업종: 응용 소프트웨어 개발 및 공급업</div>
              <div>문의: <a href="mailto:contact@pacm.kr" style={{ color: 'var(--c-gold)' }}>contact@pacm.kr</a></div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '160px' }}>
            <button onClick={() => navigate('/connect')} className="btn btn-gold" style={{ width: '100%', justifyContent: 'center' }}>
              파트너십 문의
            </button>
            <a href="mailto:contact@pacm.kr" className="btn btn-outline" style={{ width: '100%', textAlign: 'center', textDecoration: 'none', display: 'block', padding: '10px 20px' }}>
              이메일 문의
            </a>
          </div>
        </div>
      </div>

      {/* ── CTA ─────────────────────────────────────────── */}
      <div className="container" style={{ marginTop: '72px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px,3vw,28px)', fontWeight: 700, marginBottom: '14px' }}>
          지금 시작하세요
        </h2>
        <p style={{ color: 'var(--c-muted)', fontSize: '15px', marginBottom: '28px' }}>
          무료로 가입하고 창업 인사이트 뉴스레터를 받아보세요.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/news')} className="btn btn-gold" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            뉴스 탐색하기 <ArrowRight size={14} />
          </button>
          <button onClick={() => navigate('/community')} className="btn btn-outline">
            커뮤니티 참여
          </button>
        </div>
      </div>
    </div>
  )
}
