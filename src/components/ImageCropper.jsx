import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Check, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

export default function ImageCropper({ src, aspectRatio = 16/9, onCrop, onCancel }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const containerRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imgLoaded, setImgLoaded] = useState(false)

  const CROP_W = 640
  const CROP_H = Math.round(CROP_W / aspectRatio)

  // 이미지 그리기
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !imgLoaded) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, CROP_W, CROP_H)

    // 이미지 크기 계산
    const baseScale = Math.max(CROP_W / img.naturalWidth, CROP_H / img.naturalHeight)
    const s = baseScale * scale
    const w = img.naturalWidth * s
    const h = img.naturalHeight * s
    const x = (CROP_W - w) / 2 + offset.x
    const y = (CROP_H - h) / 2 + offset.y

    ctx.drawImage(img, x, y, w, h)
  }, [scale, offset, imgLoaded, CROP_W, CROP_H])

  useEffect(() => { draw() }, [draw])

  // 드래그
  const onMouseDown = (e) => {
    e.preventDefault()
    setDragging(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }
  const onMouseMove = (e) => {
    if (!dragging) return
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }
  const onMouseUp = () => setDragging(false)

  // 터치 지원
  const onTouchStart = (e) => {
    const t = e.touches[0]
    setDragging(true)
    setDragStart({ x: t.clientX - offset.x, y: t.clientY - offset.y })
  }
  const onTouchMove = (e) => {
    if (!dragging) return
    const t = e.touches[0]
    setOffset({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y })
  }

  // 크롭 완료
  const handleCrop = () => {
    const canvas = canvasRef.current
    canvas.toBlob(blob => {
      if (blob) onCrop(blob, URL.createObjectURL(blob))
    }, 'image/jpeg', 0.92)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'var(--c-gray-1)', border: '1px solid var(--c-gray-3)', maxWidth: '720px', width: '100%' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--c-gray-3)' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '12px', color: 'var(--c-gold)', letterSpacing: '2px' }}>IMAGE CROP</div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--c-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {/* 캔버스 영역 */}
        <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
          <div ref={containerRef} style={{ position: 'relative', cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none', border: '2px solid var(--c-gold)', lineHeight: 0 }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onMouseUp}
          >
            <canvas ref={canvasRef} width={CROP_W} height={CROP_H} style={{ maxWidth: '100%', display: 'block' }} />
            {/* 격자 오버레이 */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: `${100/3}% ${100/3}%` }} />
          </div>
          {/* 숨겨진 이미지 */}
          <img ref={imgRef} src={src} style={{ display: 'none' }} onLoad={() => setImgLoaded(true)} crossOrigin="anonymous" />
        </div>

        {/* 컨트롤 */}
        <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} style={{ background: 'var(--c-gray-2)', border: '1px solid var(--c-gray-3)', color: 'var(--c-paper)', padding: '8px', cursor: 'pointer' }}><ZoomOut size={16} /></button>
          <input type="range" min={50} max={300} value={Math.round(scale * 100)}
            onChange={e => setScale(Number(e.target.value) / 100)}
            style={{ flex: 1, maxWidth: '200px', accentColor: 'var(--c-gold)' }} />
          <button onClick={() => setScale(s => Math.min(3, s + 0.1))} style={{ background: 'var(--c-gray-2)', border: '1px solid var(--c-gray-3)', color: 'var(--c-paper)', padding: '8px', cursor: 'pointer' }}><ZoomIn size={16} /></button>
          <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }) }} style={{ background: 'var(--c-gray-2)', border: '1px solid var(--c-gray-3)', color: 'var(--c-muted)', padding: '8px', cursor: 'pointer' }}><RotateCcw size={16} /></button>
        </div>

        {/* 안내 */}
        <div style={{ padding: '0 20px 12px', textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--c-gray-5)' }}>
          드래그로 위치 조정 · 슬라이더로 크기 조정 · {CROP_W}×{CROP_H}px (16:9)
        </div>

        {/* 버튼 */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--c-gray-3)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="btn btn-outline btn-sm">취소</button>
          <button onClick={handleCrop} className="btn btn-gold btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Check size={14} /> 적용
          </button>
        </div>
      </div>
    </div>
  )
}
