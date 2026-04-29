import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { ArrowRight, Zap, BarChart2, Users, BookOpen, Globe, Shield, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'

const FEATURES = [
  { icon: BookOpen, title: '창업 인사이트', desc: '스타트업 성공·실패 스토리, 투자 분석, 시장 트렌드를 청소년이 이해하기 쉽게 정리합니다.', color: '#F59E0B' },
  { icon: Zap, title: 'AI 뉴스 요약', desc: 'AI가 매시간 국내외 창업·투자 뉴스를 수집하고 청소년 눈높이로 요약합니다. 어려운 금융 용어는 쉬운 설명으로 풀어드립니다.', color: '#3B82F6' },
  { icon: BarChart2, title: '트렌드 트래커', desc: '실시간 뉴스 데이터와 공공기관 지표로 한국 스타트업 생태계 흐름을 추적합니다. AI가 시장 분위기를 분석합니다.', color: '#22C55E' },
  { icon: Users, title: '커뮤니티', desc: '같은 꿈을 가진 청소년 창업가들과 아이디어를 나누고, 팀원을 모집하고, 피드백을 받으세요.', color: '#A855F7' },
  { icon: Globe, title: '기업 연결', desc: '청소년 창업 프로젝트를 지원하는 기업·기관과 직접 연결됩니다. 멘토링, 투자, 파트너십 기회를 제공합니다.', color: '#F97316' },
  { icon: Shield, title: '신뢰할 수 있는 정보', desc: 'AI 검수와 검증된 출처를 통해 사실에 기반한 정확한 정보만 제공합니다.', color: '#F43F5E' },
]

const HOW_IT_WORKS = [
  { step: '01', title: '뉴스 자동 수집', desc: '30개 RSS 피드에서 매시간 창업·스타트업 뉴스를 자동 수집합니다.' },
  { step: '02', title: 'AI 청소년 맞춤 요약', desc: 'Insightship AI가 800~2,000자로 청소년 눈높이에 맞게 요약합니다.' },
  { step: '03', title: '트렌드 자동 분석', desc: '수집된 뉴스를 분석해 카테고리별 트렌드와 시장 분위기를 자동 업데이트합니다.' },
  { step: '04', title: '큐레이션 발행', desc: '에디터가 엄선한 인사이트 아티클과 주간 뉴스레터를 발행합니다.' },
]

export default function AboutPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ news: '6,000+', articles: '20+', subscribers: '10+', trends: '30+' })

  useEffect(() => {
    Promise.all([
      supabase.from('articles').select('id', { count: 'exact', head: true }).eq('status', 'published').not('source_name', 'is', null),
      supabase.from('articles').select('id', { count: 'exact', head: true }).eq('status', 'published').is('source_name', null),
      supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('trend_snapshots').select('id', { count: 'exact', head: true }),
    ]).then(([news, art, subs, trends]) => {
      setStats({
        news: (news.count || 0).toLocaleString() + '+',
        articles: (art.count || 0) + '+',
        subscribers: (subs.count || 0) + '+',
        trends: (trends.count || 0) + '+',
      })
    }).catch(() => {})
  }, [])

  const VALUES = [
    { num: stats.news, label: 'AI 요약 뉴스', sub: '매시간 자동 업데이트' },
    { num: stats.articles, label: '큐레이션 아티클', sub: '에디터 직접 작성' },
    { num: stats.subscribers, label: '뉴스레터 구독자', sub: '매주 월요일 발송' },
    { num: '무료', label: '완전 무료 서비스', sub: '청소년을 위한 개방형 플랫폼' },
  ]

  return (
    <div style={{ paddingBottom: 100 }}>
      <Helmet>
        <title>소개 | Insightship — 청소년 창업 플랫폼 PACM</title>
        <meta name="description" content="Insightship는 PACM이 운영하는 청소년 창업가를 위한 무료 AI 기반 인사이트 플랫폼입니다."/>
        <meta property="og:title" content="소개 | Insightship"/>
        <meta property="og:description" content="청소년 창업가를 위한 무료 AI 기반 인사이트 플랫폼"/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content="https://insightship.vercel.app/about"/>
        <meta name="twitter:card" content="summary"/>
        <link rel="canonical" href="https://insightship.vercel.app/about"/>
      </Helmet>

      {/* ── 히어로 */}
      <div style={{ background: 'linear-gradient(135deg, #050505 0%, #0a0a1a 50%, #050505 100%)', padding: 'clamp(56px,9vw,96px) var(--pad-x)', textAlign: 'center', position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--b1)' }}>
        <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse,rgba(59,130,246,0.1) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 700, margin: '0 auto', position: 'relative' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: '#60A5FA', letterSpacing: '3px', marginBottom: 18, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', display: 'inline-block', padding: '4px 14px', borderRadius: 4 }}>
            ABOUT INSIGHTSHIP
          </div>
          <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(26px,5vw,46px)', fontWeight: 700, lineHeight: 1.25, marginBottom: 20, color: 'var(--t1)' }}>
            청소년 창업가를 위한<br />
            <span style={{ background: 'linear-gradient(135deg,#3B82F6,#60A5FA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>인사이트 플랫폼</span>
          </h1>
          <p style={{ fontSize: 'clamp(14px,2vw,16px)', lineHeight: 1.9, color: 'var(--t2)', maxWidth: 520, margin: '0 auto 32px' }}>
            Insightship은 창업에 관심 있는 청소년에게 AI 뉴스 요약, 트렌드 분석,
            창업 인사이트를 제공하는 무료 플랫폼입니다.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/news')} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              뉴스 보기 <ArrowRight size={14} />
            </button>
            <button onClick={() => navigate('/insight')} className="btn btn-ghost">
              인사이트 보기
            </button>
          </div>
        </div>
      </div>

      {/* ── 수치 */}
      <div style={{ borderBottom: '1px solid var(--b1)', background: 'var(--bg1)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {VALUES.map((v, i) => (
              <div key={i} style={{ padding: 'clamp(24px,4vw,40px) 20px', borderLeft: i > 0 ? '1px solid var(--b1)' : 'none', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(22px,4vw,36px)', fontWeight: 700, color: '#60A5FA', marginBottom: 6 }}>{v.num}</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>{v.label}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>{v.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 기능 소개 */}
      <div className="container" style={{ paddingTop: 60 }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#60A5FA', letterSpacing: '3px', marginBottom: 10 }}>FEATURES</div>
          <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(20px,3.5vw,30px)', fontWeight: 700, color: 'var(--t1)' }}>
            모든 기능은 청소년을 위해 설계되었습니다
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1, background: 'var(--b1)', border: '1px solid var(--b1)', borderRadius: 12, overflow: 'hidden' }}>
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <div key={i} style={{ background: 'var(--bg2)', padding: '28px 24px', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: `${f.color}15`, border: `1px solid ${f.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Icon size={18} color={f.color} />
                </div>
                <div style={{ fontFamily: 'var(--f-sans)', fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--t1)' }}>{f.title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--t2)' }}>{f.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 작동 방식 */}
      <div className="container" style={{ paddingTop: 64 }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#60A5FA', letterSpacing: '3px', marginBottom: 10 }}>HOW IT WORKS</div>
          <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(20px,3.5vw,30px)', fontWeight: 700, color: 'var(--t1)' }}>
            Insightship은 이렇게 작동합니다
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1, background: 'var(--b1)', border: '1px solid var(--b1)', borderRadius: 12, overflow: 'hidden' }}>
          {HOW_IT_WORKS.map((h, i) => (
            <div key={i} style={{ background: 'var(--bg2)', padding: '28px 24px', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 32, fontWeight: 700, color: '#3B82F6', opacity: 0.35, marginBottom: 14, lineHeight: 1 }}>{h.step}</div>
              <div style={{ fontFamily: 'var(--f-sans)', fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--t1)' }}>{h.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--t2)' }}>{h.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 대상 */}
      <div className="container" style={{ paddingTop: 64 }}>
        <div style={{ padding: '40px', background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 12 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#60A5FA', letterSpacing: '3px', marginBottom: 14 }}>FOR WHO</div>
          <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(18px,3vw,26px)', fontWeight: 700, marginBottom: 20, color: 'var(--t1)' }}>
            이런 분들을 위한 서비스입니다
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {[
              '🚀 창업을 꿈꾸는 중·고등학생',
              '📚 스타트업을 배우고 싶은 대학생',
              '💡 사이드 프로젝트를 시작하려는 청년',
              '👀 최신 창업 트렌드가 궁금한 누구나',
            ].map((t, i) => (
              <div key={i} style={{ padding: '14px 16px', background: 'var(--bg3)', border: '1px solid var(--b1)', borderRadius: 8, fontSize: 13, lineHeight: 1.5, color: 'var(--t1)' }}>{t}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA */}
      <div className="container" style={{ paddingTop: 48, textAlign: 'center' }}>
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#60A5FA', letterSpacing: '3px', marginBottom: 14 }}>GET STARTED</div>
          <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(20px,3.5vw,28px)', fontWeight: 700, marginBottom: 16, color: 'var(--t1)' }}>
            지금 바로 시작하세요
          </h2>
          <p style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.8, marginBottom: 28 }}>
            회원가입 없이도 뉴스와 트렌드를 볼 수 있습니다.<br />
            뉴스레터를 구독하면 매주 월요일 창업 소식을 받아보실 수 있습니다.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/news')} className="btn btn-primary" style={{ gap: 6, display: 'flex', alignItems: 'center' }}>
              <TrendingUp size={14} /> 뉴스 보러가기
            </button>
            <button onClick={() => navigate('/community')} className="btn btn-ghost" style={{ gap: 6, display: 'flex', alignItems: 'center' }}>
              <Users size={14} /> 커뮤니티 참여
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
