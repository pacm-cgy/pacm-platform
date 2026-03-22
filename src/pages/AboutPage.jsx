import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ArrowRight, Zap, BarChart2, Users, BookOpen, Globe, Shield, TrendingUp, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'

const FEATURES = [
  {
    icon: BookOpen,
    title: '창업 인사이트',
    desc: '스타트업 성공·실패 스토리, 투자 분석, 시장 트렌드를 청소년이 이해하기 쉽게 정리합니다.',
    color: '#D4AF37',
  },
  {
    icon: Zap,
    title: 'AI 뉴스 요약',
    desc: 'AI가 매시간 국내외 창업·투자 뉴스를 수집하고 청소년 눈높이로 요약합니다. 어려운 금융 용어는 쉬운 설명으로 풀어드립니다.',
    color: '#38bdf8',
  },
  {
    icon: BarChart2,
    title: '트렌드 트래커',
    desc: '실시간 뉴스 데이터와 공공기관 지표로 한국 스타트업 생태계 흐름을 추적합니다. AI가 시장 분위기를 분석합니다.',
    color: '#34d399',
  },
  {
    icon: Users,
    title: '커뮤니티',
    desc: '같은 꿈을 가진 청소년 창업가들과 아이디어를 나누고, 팀원을 모집하고, 피드백을 받으세요.',
    color: '#a78bfa',
  },
  {
    icon: Globe,
    title: '기업 연결',
    desc: '청소년 창업 프로젝트를 지원하는 기업·기관과 직접 연결됩니다. 멘토링, 투자, 파트너십 기회를 제공합니다.',
    color: '#f97316',
  },
  {
    icon: Shield,
    title: '신뢰할 수 있는 정보',
    desc: 'AI 검수와 검증된 출처를 통해 사실에 기반한 정확한 정보만 제공합니다.',
    color: '#fb7185',
  },
]

const HOW_IT_WORKS = [
  { step: '01', title: '뉴스 자동 수집', desc: '30개 RSS 피드에서 매시간 창업·스타트업 뉴스를 자동 수집합니다.' },
  { step: '02', title: 'AI 청소년 맞춤 요약', desc: 'Gemini AI가 800~2,000자로 청소년 눈높이에 맞게 요약합니다.' },
  { step: '03', title: '트렌드 자동 분석', desc: '수집된 뉴스를 분석해 카테고리별 트렌드와 시장 분위기를 자동 업데이트합니다.' },
  { step: '04', title: '큐레이션 발행', desc: '에디터가 엄선한 인사이트 아티클과 주간 뉴스레터를 발행합니다.' },
]

export default function AboutPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ news: '6,000+', articles: '20+', subscribers: '10+', trends: '30+' })

  useEffect(() => {
    // 실제 DB 수치 로드
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
    <div style={{ paddingBottom: '100px' }}>

      {/* ── 히어로 */}
      <div style={{ background: 'var(--c-ink)', padding: 'clamp(56px,9vw,96px) var(--pad-x)', textAlign: 'center' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gold)', letterSpacing: '3px', marginBottom: '18px' }}>
            ABOUT INSIGHTSHIP
          </div>
          <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(26px,5vw,46px)', fontWeight: 700, lineHeight: 1.25, marginBottom: '20px', color: '#F0EEE8' }}>
            청소년 창업가를 위한<br />
            <span style={{ color: 'var(--c-gold)' }}>인사이트 플랫폼</span>
          </h1>
          <p style={{ fontSize: 'clamp(14px,2vw,16px)', lineHeight: 1.9, color: '#A0A090', maxWidth: '520px', margin: '0 auto 32px' }}>
            Insightship은 창업에 관심 있는 청소년에게 AI 뉴스 요약, 트렌드 분석,
            창업 인사이트를 제공하는 무료 플랫폼입니다.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/news')} className="btn btn-gold" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              뉴스 보기 <ArrowRight size={14} />
            </button>
            <button onClick={() => navigate('/insight')} className="btn btn-outline" style={{ borderColor: '#444', color: '#F0EEE8' }}>
              인사이트 보기
            </button>
          </div>
        </div>
      </div>

      {/* ── 수치 */}
      <div style={{ borderBottom: '1px solid var(--c-border)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {VALUES.map((v, i) => (
              <div key={i} style={{ padding: 'clamp(24px,4vw,40px) 20px', borderLeft: i > 0 ? '1px solid var(--c-border)' : 'none', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(22px,4vw,36px)', fontWeight: 700, color: 'var(--c-gold)', marginBottom: '6px' }}>{v.num}</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>{v.label}</div>
                <div style={{ fontSize: '11px', color: 'var(--c-muted)' }}>{v.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 기능 소개 */}
      <div className="container" style={{ paddingTop: '60px' }}>
        <div style={{ marginBottom: '36px' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '3px', marginBottom: '10px' }}>
            FEATURES
          </div>
          <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px,3.5vw,30px)', fontWeight: 700 }}>
            모든 기능은 청소년을 위해 설계되었습니다
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)' }}>
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <div key={i} style={{ background: 'var(--c-card)', padding: '28px 24px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: f.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', border: `1px solid ${f.color}33` }}>
                  <Icon size={18} color={f.color} />
                </div>
                <div style={{ fontFamily: 'var(--f-serif)', fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>{f.title}</div>
                <div style={{ fontSize: '13px', lineHeight: 1.75, color: 'var(--c-muted)' }}>{f.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 작동 방식 */}
      <div className="container" style={{ paddingTop: '64px' }}>
        <div style={{ marginBottom: '36px' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '3px', marginBottom: '10px' }}>
            HOW IT WORKS
          </div>
          <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px,3.5vw,30px)', fontWeight: 700 }}>
            Insightship은 이렇게 작동합니다
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '2px', background: 'var(--c-border)', border: '1px solid var(--c-border)' }}>
          {HOW_IT_WORKS.map((h, i) => (
            <div key={i} style={{ background: 'var(--c-card)', padding: '28px 24px' }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: '28px', fontWeight: 700, color: 'var(--c-gold)', opacity: 0.4, marginBottom: '14px', lineHeight: 1 }}>{h.step}</div>
              <div style={{ fontFamily: 'var(--f-serif)', fontSize: '15px', fontWeight: 700, marginBottom: '8px' }}>{h.title}</div>
              <div style={{ fontSize: '13px', lineHeight: 1.75, color: 'var(--c-muted)' }}>{h.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 대상 */}
      <div className="container" style={{ paddingTop: '64px' }}>
        <div style={{ padding: '40px', background: 'var(--c-gray-1)', border: '1px solid var(--c-border)' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '3px', marginBottom: '14px' }}>FOR WHO</div>
          <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(18px,3vw,26px)', fontWeight: 700, marginBottom: '20px' }}>
            이런 분들을 위한 서비스입니다
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
            {[
              '🚀 창업을 꿈꾸는 중·고등학생',
              '📚 스타트업을 배우고 싶은 대학생',
              '💡 사이드 프로젝트를 시작하려는 청년',
              '👀 최신 창업 트렌드가 궁금한 누구나',
            ].map((t, i) => (
              <div key={i} style={{ padding: '14px 16px', background: 'var(--c-card)', border: '1px solid var(--c-border)', fontSize: '13px', lineHeight: 1.5 }}>{t}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA */}
      <div className="container" style={{ paddingTop: '48px', textAlign: 'center' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'var(--c-gold)', letterSpacing: '3px', marginBottom: '14px' }}>GET STARTED</div>
          <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(20px,3.5vw,28px)', fontWeight: 700, marginBottom: '16px' }}>
            지금 바로 시작하세요
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--c-muted)', lineHeight: 1.8, marginBottom: '28px' }}>
            회원가입 없이도 뉴스와 트렌드를 볼 수 있습니다.<br />
            뉴스레터를 구독하면 매주 월요일 창업 소식을 받아보실 수 있습니다.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/news')} className="btn btn-gold" style={{ gap: '6px' }}>
              <TrendingUp size={14} /> 뉴스 보러가기
            </button>
            <button onClick={() => navigate('/community')} className="btn btn-outline" style={{ gap: '6px' }}>
              <Users size={14} /> 커뮤니티 참여
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
