// 광고 배너 컴포넌트 - 향후 Google AdSense 또는 직접 광고 연동
// 현재는 빈 공간으로 표시, 광고 준비 완료 시 활성화

const AD_SIZES = {
  // 상단 배너 (Leaderboard)
  leaderboard: { width: '728px', height: '90px', mobile: { width: '320px', height: '50px' }, label: 'AD · 728×90' },
  // 사이드바 (Rectangle)
  rectangle: { width: '300px', height: '250px', mobile: null, label: 'AD · 300×250' },
  // 인피드 (In-Feed)
  infeed: { width: '100%', height: '120px', mobile: { width: '100%', height: '100px' }, label: 'AD · In-Feed' },
  // 모바일 배너
  mobile: { width: '320px', height: '50px', mobile: { width: '320px', height: '50px' }, label: 'AD · Mobile' },
  // 빌보드 (Large Rectangle)
  billboard: { width: '100%', height: '250px', mobile: { width: '100%', height: '200px' }, label: 'AD · Billboard' },
}

// 광고 활성화 여부 (환경변수로 제어)
const ADS_ENABLED = false // 향후 import.meta.env.VITE_ADS_ENABLED 로 교체

export default function AdBanner({ type = 'infeed', id, style = {} }) {
  const size = AD_SIZES[type] || AD_SIZES.infeed

  // 광고 비활성화 시 아무것도 표시 안 함
  if (!ADS_ENABLED) return null

  return (
    <div
      id={id || `ad-${type}-${Math.random().toString(36).slice(2,6)}`}
      data-ad-type={type}
      style={{
        width: size.width,
        height: size.height,
        background: 'var(--c-gray-2)',
        border: '1px dashed var(--c-gray-4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        margin: '0 auto',
        maxWidth: '100%',
        ...style,
      }}
    >
      <span style={{
        fontFamily: 'var(--f-mono)',
        fontSize: '10px',
        color: 'var(--c-gray-5)',
        letterSpacing: '1px',
      }}>
        {size.label}
      </span>
    </div>
  )
}

// 광고 위치별 래퍼 - 레이아웃에서 사용
export function AdSlot({ position, ...props }) {
  const slotMap = {
    'header-top':    { type: 'leaderboard', style: { margin: '0 auto 0' } },
    'content-top':   { type: 'billboard',   style: { margin: '24px 0' } },
    'content-mid':   { type: 'infeed',      style: { margin: '32px 0' } },
    'content-bottom':{ type: 'billboard',   style: { margin: '32px 0' } },
    'sidebar':       { type: 'rectangle',   style: {} },
    'news-between':  { type: 'infeed',      style: { margin: '16px 0' } },
    'mobile-fixed':  { type: 'mobile',      style: { position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 99 } },
  }

  const config = slotMap[position] || { type: 'infeed', style: {} }
  return <AdBanner {...config} {...props} />
}
