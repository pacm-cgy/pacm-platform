import { useNavigate } from 'react-router-dom'
export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div style={{ textAlign:'center', padding:'100px 0', minHeight:'60vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontFamily:'var(--f-mono)', fontSize:'80px', fontWeight:700, color:'var(--c-border)', marginBottom:'16px' }}>404</div>
      <div style={{ fontFamily:'var(--f-serif)', fontSize:'22px', fontWeight:700, marginBottom:'8px' }}>페이지를 찾을 수 없습니다</div>
      <div style={{ color:'var(--c-muted)', fontSize:'14px', marginBottom:'28px' }}>요청하신 페이지가 존재하지 않거나 이동되었습니다.</div>
      <button className="btn btn-gold" onClick={()=>navigate('/')}>홈으로 돌아가기</button>
    </div>
  )
}
