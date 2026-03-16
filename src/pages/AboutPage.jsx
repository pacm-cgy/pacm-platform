import { useNavigate } from 'react-router-dom'
import { ArrowRight, Users, Newspaper, TrendingUp, Zap, Shield, Heart, Mail } from 'lucide-react'

const FEATURES = [
  { icon: Newspaper, title: '창업 인사이트', desc: '국내외 스타트업 뉴스와 트렌드를 AI가 요약·분류하여 청소년이 읽기 쉽게 제공합니다. 매일 새로운 콘텐츠가 업데이트됩니다.' },
  { icon: TrendingUp, title: '트렌드 트래커', desc: '중소벤처기업부, 벤처캐피탈협회 등 공인 기관의 데이터를 기반으로 한국 스타트업 생태계 지표를 실시간으로 추적합니다.' },
  { icon: Zap, title: 'AI 리포트', desc: '매주 투자 동향, 시장 분석 AI 리포트가 자동 생성됩니다. 어려운 금융·창업 용어를 쉽게 풀어 설명합니다.' },
  { icon: Users, title: '청소년 커뮤니티', desc: '창업을 꿈꾸는 청소년들이 아이디어를 나누고, 팀원을 모집하고, 서로 도움을 주고받는 공간입니다.' },
  { icon: Heart, title: '창업자 스토리', desc: '실제 창업가들의 성공과 실패 경험을 인터뷰 형식으로 소개합니다. 날 것의 이야기에서 진짜 인사이트를 얻으세요.' },
  { icon: Shield, title: '기업 연결', desc: '청소년 스타트업에 관심 있는 기업, 투자자와의 연결 기회를 제공합니다. 파트너십 문의는 contact@pacm.kr 로 주세요.' },
]

const TEAM_VALUES = [
  { num: '01', title: '사실 기반', desc: '거짓 정보 없음. 공인된 자료와 데이터만 활용합니다.' },
  { num: '02', title: '쉬운 언어', desc: '어려운 용어는 반드시 설명합니다. 청소년 누구나 이해할 수 있어야 합니다.' },
  { num: '03', title: '유익한 콘텐츠', desc: '단순 정보 전달을 넘어, 실제로 창업에 도움이 되는 내용을 만듭니다.' },
  { num: '04', title: '투명한 운영', desc: '운영사 PACM, 사업자번호 891-45-01385. 모든 것을 공개합니다.' },
]

export default function AboutPage() {
  const navigate = useNavigate()

  return (
    <div style={{ paddingBottom: '80px' }}>
      {/* 히어로 */}
      <div style={{ background: 'var(--c-ink)', color: 'var(--c-paper)', padding: '80px 0 64px', marginBottom: '0' }}>
        <div className="container" style={{ maxWidth: '760px' }}>
          <div className="t-eyebrow" style={{ color: 'var(--c-gold)', marginBottom: '16px' }}>ABOUT INSIGHTSHIP</div>
          <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(28px,5vw,48px)', fontWeight: 700, lineHeight: 1.2, marginBottom: '20px' }}>
            청소년에게 창업의 <br />나침반을 드립니다
          </h1>
          <p style={{ fontSize: '16px', lineHeight: 1.9, color: 'var(--c-gray-6)', maxWidth: '560px', marginBottom: '32px' }}>
            Insightship은 창업을 꿈꾸는 청소년을 위한 미디어 플랫폼입니다.
            스타트업 뉴스, 트렌드 데이터, AI 분석 리포트를 통해 청소년이 창업 생태계를 쉽게 이해하고 실질적인 인사이트를 얻을 수 있도록 돕습니다.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/news')} className="btn btn-gold" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              뉴스 보기 <ArrowRight size={14} />
            </button>
            <button onClick={() => navigate('/community')} className="btn btn-outline" style={{ borderColor: '#444', color: 'var(--c-paper)' }}>
              커뮤니티 참여
            </button>
          </div>
        </div>
      </div>

      {/* 숫자 통계 */}
      <div style={{ background: 'var(--c-gray-2)', borderBottom: '1px solid var(--c-gray-3)', padding: '32px 0' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: '0', textAlign: 'center' }}>
            {[
              { num: '22+', label: '수집 뉴스' },
              { num: '6개', label: '공공기관 데이터' },
              { num: '매주', label: 'AI 리포트' },
              { num: '무료', label: '전체 서비스' },
            ].map(({ num, label }) => (
              <div key={label} style={{ padding: '20px', borderRight: '1px solid var(--c-gray-3)' }}>
                <div style={{ fontFamily: 'var(--f-serif)', fontSize: '28px', fontWeight: 700, color: 'var(--c-gold)', marginBottom: '4px' }}>{num}</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-muted)', letterSpacing: '1px' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 주요 기능 */}
      <div className="container" style={{ padding: '64px var(--pad-x)' }}>
        <div className="t-eyebrow" style={{ marginBottom: '8px' }}>FEATURES</div>
        <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(22px,3vw,30px)', fontWeight: 700, marginBottom: '40px' }}>
          Insightship이 제공하는 것
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px,100%),1fr))', gap: '2px' }}>
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card" style={{ padding: '28px' }}>
              <div style={{ width: '40px', height: '40px', background: 'var(--c-gray-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', border: '1px solid var(--c-gray-3)' }}>
                <Icon size={18} style={{ color: 'var(--c-gold)' }} />
              </div>
              <h3 style={{ fontFamily: 'var(--f-serif)', fontSize: '16px', fontWeight: 700, marginBottom: '10px' }}>{title}</h3>
              <p style={{ color: 'var(--c-muted)', fontSize: '13px', lineHeight: 1.8 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 가치관 */}
      <div style={{ background: 'var(--c-gray-2)', borderTop: '1px solid var(--c-gray-3)', padding: '64px 0' }}>
        <div className="container">
          <div className="t-eyebrow" style={{ marginBottom: '8px' }}>OUR VALUES</div>
          <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(22px,3vw,30px)', fontWeight: 700, marginBottom: '40px' }}>
            우리가 지키는 원칙
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px,100%),1fr))', gap: '2px' }}>
            {TEAM_VALUES.map(({ num, title, desc }) => (
              <div key={num} className="card" style={{ padding: '28px', display: 'flex', gap: '16px' }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: '20px', color: 'var(--c-gray-4)', fontWeight: 700, flexShrink: 0, lineHeight: 1 }}>{num}</div>
                <div>
                  <div style={{ fontFamily: 'var(--f-serif)', fontSize: '15px', fontWeight: 700, marginBottom: '8px' }}>{title}</div>
                  <div style={{ color: 'var(--c-muted)', fontSize: '13px', lineHeight: 1.7 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 운영사 정보 */}
      <div className="container" style={{ padding: '64px var(--pad-x)' }}>
        <div style={{ maxWidth: '600px' }}>
          <div className="t-eyebrow" style={{ marginBottom: '8px' }}>OPERATOR</div>
          <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: '24px', fontWeight: 700, marginBottom: '20px' }}>운영사 안내</h2>
          <div className="card" style={{ padding: '28px 32px' }}>
            {[
              ['운영사', '피에이씨엠(PACM)'],
              ['사업자등록번호', '891-45-01385'],
              ['주업종', '응용 소프트웨어 개발 및 공급업'],
              ['이메일', 'contact@pacm.kr'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', padding: '12px 0', borderBottom: '1px solid var(--c-gray-3)', gap: '20px', alignItems: 'center' }}>
                <div style={{ width: '120px', flexShrink: 0, fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-muted)' }}>{label}</div>
                <div style={{ fontSize: '14px', color: 'var(--c-paper)' }}>
                  {label === '이메일'
                    ? <a href="mailto:contact@pacm.kr" style={{ color: 'var(--c-gold)' }}>{value}</a>
                    : value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ background: 'var(--c-ink)', padding: '64px 0' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(22px,4vw,32px)', fontWeight: 700, color: 'var(--c-paper)', marginBottom: '16px' }}>
            청소년 창업가를 위한 플랫폼
          </h2>
          <p style={{ color: 'var(--c-gray-6)', fontSize: '15px', marginBottom: '32px', lineHeight: 1.8 }}>
            매주 월요일, 지난 주 스타트업 씬의 모든 것을<br />뉴스레터로 받아보세요.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/')} className="btn btn-gold" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              시작하기 <ArrowRight size={14} />
            </button>
            <a href="mailto:contact@pacm.kr" className="btn btn-outline" style={{ borderColor: '#444', color: 'var(--c-paper)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Mail size={14} /> 파트너십 문의
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
