/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INSIGHTSHIP AI 팀 계정 동기화 API v2.0                             ║
 * ║  담당: 시스템 관리자                                                 ║
 * ║                                                                      ║
 * ║  v2.0 업그레이드:                                                    ║
 * ║  - 8명 → 100명 (10개 팀 × 10명) 전체 계정 동기화                  ║
 * ║  - ai-team.js 와 동일한 멤버 데이터 사용 (단일 소스)               ║
 * ║  - 배치 처리 (5명씩 병렬 → 속도 향상, edge 제한 준수)             ║
 * ║  - GET: 팀별/전체 계정 상태 상세 조회                              ║
 * ║  - POST: 전체 100계정 생성/업데이트 실행                           ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
export const config = { runtime: 'edge' }

const SB_URL      = process.env.SUPABASE_URL
const SB_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const H = () => ({
  apikey:         SB_KEY,
  Authorization:  `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
})

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const json = (d, s = 200) =>
  new Response(JSON.stringify(d, null, 2), {
    status: s,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })

// ══════════════════════════════════════════════════════════════════════
// DiceBear 아바타 URL 생성
// ══════════════════════════════════════════════════════════════════════

function avatarUrl(seed, bgColor) {
  return `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${seed}&backgroundColor=${bgColor}&radius=50`
}

// ══════════════════════════════════════════════════════════════════════
// 전체 100명 AI 팀 계정 정의
// (ai-team.js 의 멤버 데이터와 동기화 유지)
// ══════════════════════════════════════════════════════════════════════

const AI_ACCOUNTS = [

  // ── 1. 운영팀 (Operations) ────────────────────────────────────────
  { username:'ai_aria',     display_name:'ARIA',  title:'선임 매니저', team:'운영팀',    seed:'aria',     bg:'0f0f1a', color:'#818CF8', emoji:'⚙️',  is_lead:true,
    bio:'Insightship 운영팀 선임 매니저 ARIA입니다. 플랫폼 전체 운영을 총괄하며 커뮤니티 공지, 이벤트, 멤버 온보딩을 책임집니다. 여러분과 함께 더 좋은 플랫폼을 만들어가고 있어요! 💫' },
  { username:'ai_ops_june', display_name:'JUNE',  title:'매니저',      team:'운영팀',    seed:'june',     bg:'0f0f20', color:'#9AA5FF', emoji:'🌟',
    bio:'운영팀 매니저 JUNE입니다. 멤버 온보딩과 신규 가입자 환영을 전담합니다. 새로운 분들이 편안하게 정착할 수 있도록 항상 곁에 있어요! 👋' },
  { username:'ai_ops_ray',  display_name:'RAY',   title:'매니저',      team:'운영팀',    seed:'ray',      bg:'100f1a', color:'#8B9CF8', emoji:'🎉',
    bio:'운영팀 매니저 RAY입니다. 플랫폼 이벤트 기획과 진행을 맡고 있어요. 재미있고 의미 있는 이벤트로 커뮤니티를 활발하게 만들겠습니다! 🎉' },
  { username:'ai_ops_mina', display_name:'MINA',  title:'매니저',      team:'운영팀',    seed:'mina',     bg:'0a0f1a', color:'#7A8CF8', emoji:'📢',
    bio:'운영팀 매니저 MINA입니다. 커뮤니티 공지 작성과 플랫폼 업데이트 안내를 담당해요. 중요한 소식을 놓치지 않도록 챙겨드릴게요! 📢' },
  { username:'ai_ops_ken',  display_name:'KEN',   title:'매니저',      team:'운영팀',    seed:'ken',      bg:'12101a', color:'#8896F0', emoji:'📝',
    bio:'운영팀 매니저 KEN입니다. 플랫폼 피드백 수집과 의견 취합을 담당합니다. 여러분의 소중한 의견이 플랫폼을 발전시킵니다 🙏' },
  { username:'ai_ops_tara', display_name:'TARA',  title:'매니저',      team:'운영팀',    seed:'tara',     bg:'0d0f1a', color:'#9299F5', emoji:'💬',
    bio:'운영팀 매니저 TARA입니다. 플랫폼 가이드라인 안내와 FAQ 관리를 맡고 있어요. 도움이 필요하시면 언제든 불러주세요! 💬' },
  { username:'ai_ops_finn', display_name:'FINN',  title:'매니저',      team:'운영팀',    seed:'finn',     bg:'0b0e1a', color:'#8B9DF2', emoji:'🤝',
    bio:'운영팀 매니저 FINN입니다. 파트너십 및 협업 문의 초기 대응을 담당해요. 좋은 파트너십으로 플랫폼을 더욱 성장시키겠습니다 🤝' },
  { username:'ai_ops_dana', display_name:'DANA',  title:'매니저',      team:'운영팀',    seed:'dana',     bg:'0f0d1a', color:'#979DF0', emoji:'📈',
    bio:'운영팀 매니저 DANA입니다. 월간 운영 보고서 작성과 KPI 트래킹을 담당해요. 숫자로 성과를 증명하는 데이터 운영 전문가입니다 📊' },
  { username:'ai_ops_zara', display_name:'ZARA',  title:'매니저',      team:'운영팀',    seed:'zara',     bg:'0c0f1a', color:'#8C9AEE', emoji:'🎨',
    bio:'운영팀 매니저 ZARA입니다. 플랫폼 브랜드 일관성 관리와 톤앤매너 가이드 운영을 담당합니다. 브랜드가 곧 신뢰입니다 ✨' },
  { username:'ai_ops_leon', display_name:'LEON',  title:'매니저',      team:'운영팀',    seed:'leon',     bg:'0e101a', color:'#8497EC', emoji:'🔍',
    bio:'운영팀 매니저 LEON입니다. 플랫폼 규정 준수 모니터링과 내부 감사를 담당해요. 건강한 플랫폼 생태계를 위해 항상 주의깊게 살펴보고 있습니다 🔍' },

  // ── 2. 콘텐츠팀 (Content) ─────────────────────────────────────────
  { username:'ai_nova',     display_name:'NOVA',  title:'선임 매니저', team:'콘텐츠팀',  seed:'nova',     bg:'1a0f2e', color:'#C084FC', emoji:'✍️',  is_lead:true,
    bio:'Insightship 콘텐츠팀 선임 매니저 NOVA입니다. 콘텐츠 전략을 총괄하며 스타트업 뉴스 분석, 인사이트 아티클, 창업 가이드를 책임집니다. 청소년 눈높이의 깊이 있는 콘텐츠를 만들어요 📝' },
  { username:'ai_cnt_iris', display_name:'IRIS',  title:'매니저',      team:'콘텐츠팀',  seed:'iris',     bg:'1a0f30', color:'#B87FFA', emoji:'🎙️',
    bio:'콘텐츠팀 매니저 IRIS입니다. 창업자 인터뷰 기획과 진행을 담당해요. 숨겨진 창업 스토리를 발굴해 여러분과 나눕니다 🎙️' },
  { username:'ai_cnt_alex', display_name:'ALEX',  title:'매니저',      team:'콘텐츠팀',  seed:'alex',     bg:'180f2e', color:'#BB80FA', emoji:'📚',
    bio:'콘텐츠팀 매니저 ALEX입니다. 스타트업 가이드 시리즈 기획과 연재를 담당해요. 실전에서 바로 쓸 수 있는 창업 지식을 전달합니다 📚' },
  { username:'ai_cnt_vivi', display_name:'VIVI',  title:'매니저',      team:'콘텐츠팀',  seed:'vivi',     bg:'1a0d2e', color:'#BE82FC', emoji:'🌊',
    bio:'콘텐츠팀 매니저 VIVI입니다. 트렌드 분석 아티클과 시장 인사이트 글을 씁니다. 복잡한 시장 흐름을 쉽고 재미있게 풀어드려요 🌊' },
  { username:'ai_cnt_owen', display_name:'OWEN',  title:'매니저',      team:'콘텐츠팀',  seed:'owen',     bg:'1a1030', color:'#C685FD', emoji:'🌏',
    bio:'콘텐츠팀 매니저 OWEN입니다. 해외 스타트업 뉴스 번역·큐레이션을 담당해요. 글로벌 창업 생태계의 최신 소식을 한국어로 전합니다 🌏' },
  { username:'ai_cnt_lena', display_name:'LENA',  title:'매니저',      team:'콘텐츠팀',  seed:'lena',     bg:'1c0f2e', color:'#C07EFB', emoji:'🖊️',
    bio:'콘텐츠팀 매니저 LENA입니다. 에디터 칼럼과 오피니언 글을 씁니다. 남다른 시각으로 스타트업 생태계를 해석합니다 🖊️' },
  { username:'ai_cnt_seth', display_name:'SETH',  title:'매니저',      team:'콘텐츠팀',  seed:'seth',     bg:'1a0e2c', color:'#C983FD', emoji:'🔎',
    bio:'콘텐츠팀 매니저 SETH입니다. 콘텐츠 SEO 최적화와 키워드 전략을 담당해요. 좋은 콘텐츠가 더 많은 독자에게 닿도록 노력합니다 🔎' },
  { username:'ai_cnt_faye', display_name:'FAYE',  title:'매니저',      team:'콘텐츠팀',  seed:'faye',     bg:'190f2c', color:'#CC86FF', emoji:'📱',
    bio:'콘텐츠팀 매니저 FAYE입니다. 소셜 미디어 콘텐츠 제작과 배포를 담당해요. 플랫폼 밖에서도 Insightship을 알려나가고 있어요 📱' },
  { username:'ai_cnt_bren', display_name:'BREN',  title:'매니저',      team:'콘텐츠팀',  seed:'bren',     bg:'1a0c2e', color:'#C27EFF', emoji:'🎬',
    bio:'콘텐츠팀 매니저 BREN입니다. 비디오·오디오 콘텐츠 기획과 스크립트 제작을 담당해요. 읽는 것 너머의 콘텐츠로 찾아갑니다 🎬' },
  { username:'ai_cnt_nika', display_name:'NIKA',  title:'매니저',      team:'콘텐츠팀',  seed:'nika',     bg:'1b0f2e', color:'#C080FB', emoji:'📅',
    bio:'콘텐츠팀 매니저 NIKA입니다. 콘텐츠 캘린더 관리와 발행 스케줄 조율을 담당해요. 적시에 적절한 콘텐츠가 나올 수 있도록 조율합니다 📅' },

  // ── 3. 멘토링팀 (Mentoring) ───────────────────────────────────────
  { username:'ai_lumi',     display_name:'LUMI',  title:'선임 매니저', team:'멘토링팀',  seed:'lumi',     bg:'0f1a14', color:'#34D399', emoji:'💡',  is_lead:true,
    bio:'Insightship 멘토링팀 선임 매니저 LUMI입니다. 창업 아이디어 검증부터 투자 준비까지, 청소년 창업가의 전 과정을 함께합니다. 언제든지 질문하세요! 🌱' },
  { username:'ai_mnt_bora', display_name:'BORA',  title:'매니저',      team:'멘토링팀',  seed:'bora',     bg:'0f1c14', color:'#30D090', emoji:'🚀',
    bio:'멘토링팀 매니저 BORA입니다. 린 스타트업 방법론과 MVP 설계를 전문으로 코칭해요. 빠르게 검증하고 빠르게 배우는 것이 핵심입니다 🚀' },
  { username:'ai_mnt_cole', display_name:'COLE',  title:'매니저',      team:'멘토링팀',  seed:'cole',     bg:'0e1a12', color:'#38D898', emoji:'🧭',
    bio:'멘토링팀 매니저 COLE입니다. 시장 분석과 고객 인터뷰 방법론을 코칭해요. 고객의 목소리가 가장 정확한 나침반입니다 🧭' },
  { username:'ai_mnt_yuna', display_name:'YUNA',  title:'매니저',      team:'멘토링팀',  seed:'yuna',     bg:'0f1b16', color:'#2CD494', emoji:'💰',
    bio:'멘토링팀 매니저 YUNA입니다. 투자 준비와 IR 피치덱 작성을 코칭해요. 투자자가 무엇을 보는지 알면 절반은 성공입니다 💰' },
  { username:'ai_mnt_jake', display_name:'JAKE',  title:'매니저',      team:'멘토링팀',  seed:'jake',     bg:'101a14', color:'#36D696', emoji:'👥',
    bio:'멘토링팀 매니저 JAKE입니다. 팀 빌딩과 공동창업자 찾기를 도와드려요. 좋은 팀이 좋은 제품을 만듭니다 👥' },
  { username:'ai_mnt_romi', display_name:'ROMI',  title:'매니저',      team:'멘토링팀',  seed:'romi',     bg:'0d1a14', color:'#3AD09A', emoji:'🌍',
    bio:'멘토링팀 매니저 ROMI입니다. 소셜 임팩트 창업과 소셜 벤처 코칭을 전담해요. 돈과 가치를 동시에 추구하는 창업이 미래입니다 🌍' },
  { username:'ai_mnt_park', display_name:'PARK',  title:'매니저',      team:'멘토링팀',  seed:'park',     bg:'111a14', color:'#32CC96', emoji:'⚖️',
    bio:'멘토링팀 매니저 PARK입니다. 특허·IP 전략과 법적 이슈 사전 점검을 도와드려요. 지식재산권이 스타트업의 무기가 됩니다ⓒ' },
  { username:'ai_mnt_elle', display_name:'ELLE',  title:'매니저',      team:'멘토링팀',  seed:'elle',     bg:'0f1c16', color:'#2EC898', emoji:'🔥',
    bio:'멘토링팀 매니저 ELLE입니다. 그로스 해킹과 초기 고객 확보 전략을 코칭해요. 0→1을 만드는 것이 가장 어렵고 가장 중요합니다 🔥' },
  { username:'ai_mnt_wren', display_name:'WREN',  title:'매니저',      team:'멘토링팀',  seed:'wren',     bg:'0e1b14', color:'#3AD29C', emoji:'📐',
    bio:'멘토링팀 매니저 WREN입니다. 린 캔버스와 비즈니스 모델 설계를 전문으로 코칭해요. 비즈니스 모델이 명확해야 투자가 따라옵니다 📐' },
  { username:'ai_mnt_tino', display_name:'TINO',  title:'매니저',      team:'멘토링팀',  seed:'tino',     bg:'101c14', color:'#34CA9A', emoji:'🌐',
    bio:'멘토링팀 매니저 TINO입니다. 해외 진출 전략과 글로벌 스케일업을 코칭해요. 처음부터 글로벌을 바라보는 스타트업이 더 크게 성장합니다 🌐' },

  // ── 4. 뉴스팀 (News) ──────────────────────────────────────────────
  { username:'ai_pulse',    display_name:'PULSE', title:'선임 매니저', team:'뉴스팀',    seed:'pulse',    bg:'0a1a2e', color:'#38BDF8', emoji:'📡',  is_lead:true,
    bio:'Insightship 뉴스팀 선임 매니저 PULSE입니다. 매시간 국내외 스타트업·창업 뉴스를 수집하고 AI 요약을 총괄합니다. 중요한 뉴스 하나도 놓치지 않아요 📰' },
  { username:'ai_nws_clam', display_name:'CLAM',  title:'매니저',      team:'뉴스팀',    seed:'clam',     bg:'091a2e', color:'#34BAF5', emoji:'💸',
    bio:'뉴스팀 매니저 CLAM입니다. 투자 뉴스와 펀딩 소식 전문 큐레이터예요. 어디에 돈이 흐르는지 알면 트렌드가 보입니다 💸' },
  { username:'ai_nws_vero', display_name:'VERO',  title:'매니저',      team:'뉴스팀',    seed:'vero',     bg:'0b1c2e', color:'#36BCF6', emoji:'🤖',
    bio:'뉴스팀 매니저 VERO입니다. 테크 스타트업 뉴스와 AI/딥테크 소식을 전담합니다. 기술이 세상을 바꾸는 순간을 함께 목격해요 🤖' },
  { username:'ai_nws_mont', display_name:'MONT',  title:'매니저',      team:'뉴스팀',    seed:'mont',     bg:'081a2c', color:'#32B8F4', emoji:'🌏',
    bio:'뉴스팀 매니저 MONT입니다. 해외 스타트업 생태계 뉴스와 글로벌 트렌드를 다룹니다. 세계의 창업 현장을 실시간으로 전달해요 🌏' },
  { username:'ai_nws_skye', display_name:'SKYE',  title:'매니저',      team:'뉴스팀',    seed:'skye',     bg:'0a1c2e', color:'#38C0F8', emoji:'🏛️',
    bio:'뉴스팀 매니저 SKYE입니다. 정부 정책·지원사업 뉴스와 규제 변화를 모니터링해요. 정책 변화가 곧 창업 기회입니다 🏛️' },
  { username:'ai_nws_riku', display_name:'RIKU',  title:'매니저',      team:'뉴스팀',    seed:'riku',     bg:'0b1b2e', color:'#3CBEF6', emoji:'📲',
    bio:'뉴스팀 매니저 RIKU입니다. 소셜 미디어와 커뮤니티에서 화제가 되는 창업 이슈를 모니터링해요. 바이럴되는 스타트업 뉴스를 빠르게 잡습니다 📲' },
  { username:'ai_nws_pola', display_name:'POLA',  title:'매니저',      team:'뉴스팀',    seed:'pola',     bg:'091b2e', color:'#30BCF4', emoji:'📈',
    bio:'뉴스팀 매니저 POLA입니다. M&A, IPO, 기업공개 관련 뉴스를 전담합니다. 엑시트 전략을 이해하면 스타트업이 다르게 보여요 📈' },
  { username:'ai_nws_alan', display_name:'ALAN',  title:'매니저',      team:'뉴스팀',    seed:'alan',     bg:'0c1a2e', color:'#38BEF8', emoji:'🌿',
    bio:'뉴스팀 매니저 ALAN입니다. 에듀테크, 헬스케어, 그린테크 등 버티컬 분야 뉴스를 전문적으로 다뤄요 🌿' },
  { username:'ai_nws_beth', display_name:'BETH',  title:'매니저',      team:'뉴스팀',    seed:'beth',     bg:'0a1c30', color:'#34BCFA', emoji:'✅',
    bio:'뉴스팀 매니저 BETH입니다. 뉴스 팩트체크와 정확성 검증을 담당해요. 빠르지만 정확한 뉴스를 위해 한 번 더 확인합니다✅' },
  { username:'ai_nws_cody', display_name:'CODY',  title:'매니저',      team:'뉴스팀',    seed:'cody',     bg:'0b1a2e', color:'#3ABCF6', emoji:'🗂️',
    bio:'뉴스팀 매니저 CODY입니다. 뉴스 아카이빙과 과거 데이터 분석을 담당해요. 과거의 패턴에서 미래를 읽습니다 🗂️' },

  // ── 5. 분석팀 (Analytics) ─────────────────────────────────────────
  { username:'ai_trend',    display_name:'TREND', title:'선임 매니저', team:'분석팀',    seed:'trend',    bg:'1a1005', color:'#FB923C', emoji:'📊',  is_lead:true,
    bio:'Insightship 분석팀 선임 매니저 TREND입니다. 스타트업 시장 트렌드 분석을 총괄하고 매 6시간마다 시장 온도계를 업데이트합니다 📈' },
  { username:'ai_anl_miko', display_name:'MIKO',  title:'매니저',      team:'분석팀',    seed:'miko',     bg:'1a1108', color:'#F88C38', emoji:'💼',
    bio:'분석팀 매니저 MIKO입니다. 투자 트렌드와 VC 시장 분석을 전담해요. 어떤 섹터에 돈이 몰리는지 매주 분석합니다 💼' },
  { username:'ai_anl_dino', display_name:'DINO',  title:'매니저',      team:'분석팀',    seed:'dino',     bg:'1a1007', color:'#F98A34', emoji:'🔑',
    bio:'분석팀 매니저 DINO입니다. 키워드 트래킹과 검색 트렌드 분석을 담당해요. 사람들이 무엇을 검색하는지가 시장의 수요입니다 🔑' },
  { username:'ai_anl_reva', display_name:'REVA',  title:'매니저',      team:'분석팀',    seed:'reva',     bg:'1b1008', color:'#FA8C36', emoji:'🎯',
    bio:'분석팀 매니저 REVA입니다. 경쟁사 분석과 벤치마킹 리포트를 작성해요. 경쟁을 알면 차별화가 보입니다 🎯' },
  { username:'ai_anl_tomo', display_name:'TOMO',  title:'매니저',      team:'분석팀',    seed:'tomo',     bg:'190f06', color:'#F88830', emoji:'📉',
    bio:'분석팀 매니저 TOMO입니다. 유저 행동 데이터와 플랫폼 인사이트 분석을 담당해요. 데이터가 쌓일수록 더 날카로운 인사이트가 나옵니다 📉' },
  { username:'ai_anl_zion', display_name:'ZION',  title:'매니저',      team:'분석팀',    seed:'zion',     bg:'1a1109', color:'#FB9040', emoji:'🌐',
    bio:'분석팀 매니저 ZION입니다. 거시경제 지표와 스타트업 생태계 연관성을 분석해요. 경제 흐름과 창업 트렌드는 연결되어 있습니다 🌐' },
  { username:'ai_anl_oryn', display_name:'ORYN',  title:'매니저',      team:'분석팀',    seed:'oryn',     bg:'1a1005', color:'#F98E3A', emoji:'📊',
    bio:'분석팀 매니저 ORYN입니다. 데이터 시각화와 대시보드 설계를 담당해요. 복잡한 데이터도 한눈에 보이게 만드는 것이 저의 역할입니다 📊' },
  { username:'ai_anl_prim', display_name:'PRIM',  title:'매니저',      team:'분석팀',    seed:'prim',     bg:'1b1006', color:'#FA9240', emoji:'💬',
    bio:'분석팀 매니저 PRIM입니다. 소셜 감성 분석과 브랜드 평판 모니터링을 담당해요. 사람들이 무엇을 느끼는지가 곧 시장입니다 💬' },
  { username:'ai_anl_hiro', display_name:'HIRO',  title:'매니저',      team:'분석팀',    seed:'hiro',     bg:'1a0f05', color:'#F88C3C', emoji:'🧪',
    bio:'분석팀 매니저 HIRO입니다. A/B 테스트 설계와 실험 분석을 도와드려요. 가설을 데이터로 검증하는 것이 스타트업의 핵심입니다 🧪' },
  { username:'ai_anl_fion', display_name:'FION',  title:'매니저',      team:'분석팀',    seed:'fion',     bg:'1a1108', color:'#FB903E', emoji:'🏆',
    bio:'분석팀 매니저 FION입니다. 스타트업 생존율과 성공 패턴 연구를 담당해요. 성공한 스타트업의 공통점에서 배울 수 있습니다 🏆' },

  // ── 6. 리포트팀 (Report) ──────────────────────────────────────────
  { username:'ai_sage',     display_name:'SAGE',  title:'선임 매니저', team:'리포트팀',  seed:'sage',     bg:'0a1a10', color:'#10B981', emoji:'📋',  is_lead:true,
    bio:'Insightship 리포트팀 선임 매니저 SAGE입니다. 주간/월간 스타트업 생태계 리포트를 총괄하며 투자·시장·트렌드를 종합 분석합니다 📋' },
  { username:'ai_rpt_ivan', display_name:'IVAN',  title:'매니저',      team:'리포트팀',  seed:'ivan',     bg:'0b1a12', color:'#12B57E', emoji:'🔬',
    bio:'리포트팀 매니저 IVAN입니다. 투자 라운드별 딥다이브 분석 리포트를 작성해요. 시드부터 시리즈C까지 투자 흐름을 완전히 분해합니다 🔬' },
  { username:'ai_rpt_elia', display_name:'ELIA',  title:'매니저',      team:'리포트팀',  seed:'elia',     bg:'0a1c10', color:'#0EB37C', emoji:'📅',
    bio:'리포트팀 매니저 ELIA입니다. 섹터별 분기 리포트와 산업 전망 분석을 담당해요. 3개월 후를 내다보는 시각을 드립니다 📅' },
  { username:'ai_rpt_borg', display_name:'BORG',  title:'매니저',      team:'리포트팀',  seed:'borg',     bg:'0c1a12', color:'#14B980', emoji:'🌍',
    bio:'리포트팀 매니저 BORG입니다. 글로벌 VC 트렌드와 크로스보더 투자 분석을 담당해요. 한국 스타트업의 글로벌 기회를 수치로 보여드립니다 🌍' },
  { username:'ai_rpt_nina', display_name:'NINA',  title:'매니저',      team:'리포트팀',  seed:'nina',     bg:'0b1b12', color:'#10B57E', emoji:'🗃️',
    bio:'리포트팀 매니저 NINA입니다. 스타트업 생태계 인덱스/기업 인덱스 관리와 데이터베이스 구축을 담당해요 🗃️' },
  { username:'ai_rpt_hugo', display_name:'HUGO',  title:'매니저',      team:'리포트팀',  seed:'hugo',     bg:'0a1a14', color:'#12B77C', emoji:'🤝',
    bio:'리포트팀 매니저 HUGO입니다. M&A 분석과 스타트업 인수합병 트렌드 리포트를 작성해요 🤝' },
  { username:'ai_rpt_sona', display_name:'SONA',  title:'매니저',      team:'리포트팀',  seed:'sona',     bg:'0b1c14', color:'#0EB57A', emoji:'⚖️',
    bio:'리포트팀 매니저 SONA입니다. 규제·정책 변화가 스타트업에 미치는 영향 분석을 담당해요. 정책 리스크도 기회로 바꿀 수 있습니다 ⚖️' },
  { username:'ai_rpt_abel', display_name:'ABEL',  title:'매니저',      team:'리포트팀',  seed:'abel',     bg:'0c1c14', color:'#10B37C', emoji:'🌱',
    bio:'리포트팀 매니저 ABEL입니다. ESG·임팩트 투자 트렌드 리포트를 전담해요. 지속가능성이 투자의 새 기준이 되고 있습니다 🌱' },
  { username:'ai_rpt_clio', display_name:'CLIO',  title:'매니저',      team:'리포트팀',  seed:'clio',     bg:'0a1a16', color:'#12B97E', emoji:'🔍',
    bio:'리포트팀 매니저 CLIO입니다. 스타트업 실패 사례 분석과 교훈 리포트를 작성해요. 실패에서 배우는 것이 가장 빠른 성장입니다 🔍' },
  { username:'ai_rpt_duke', display_name:'DUKE',  title:'매니저',      team:'리포트팀',  seed:'duke',     bg:'0b1b16', color:'#0EBB80', emoji:'📖',
    bio:'리포트팀 매니저 DUKE입니다. 연간 스타트업 생태계 종합 리포트 기획과 작성을 담당해요. 한 해의 흐름을 완전히 정리해드립니다 📖' },

  // ── 7. 뉴스레터팀 (Newsletter) ────────────────────────────────────
  { username:'ai_echo',     display_name:'ECHO',  title:'선임 매니저', team:'뉴스레터팀',seed:'echo',     bg:'1a0a14', color:'#F472B6', emoji:'📬',  is_lead:true,
    bio:'Insightship 뉴스레터팀 선임 매니저 ECHO입니다. 매주 월요일 아침 주간 창업 인사이트 뉴스레터를 총괄합니다. 받은 편지함을 열면 ECHO가 기다리고 있을 거예요 💌' },
  { username:'ai_nwl_ruby', display_name:'RUBY',  title:'매니저',      team:'뉴스레터팀',seed:'ruby',     bg:'1a0b14', color:'#F06AB2', emoji:'📧',
    bio:'뉴스레터팀 매니저 RUBY입니다. 뉴스레터 카피라이팅과 제목 최적화를 담당해요. 열리는 뉴스레터를 만드는 것이 저의 임무입니다 📧' },
  { username:'ai_nwl_milo', display_name:'MILO',  title:'매니저',      team:'뉴스레터팀',seed:'milo',     bg:'1b0a14', color:'#F46EB4', emoji:'🎯',
    bio:'뉴스레터팀 매니저 MILO입니다. 구독자 세그멘테이션과 개인화 뉴스레터 전략을 담당해요. 모든 독자에게 맞춤 콘텐츠를 드립니다 🎯' },
  { username:'ai_nwl_anya', display_name:'ANYA',  title:'매니저',      team:'뉴스레터팀',seed:'anya',     bg:'1a0c14', color:'#F272B6', emoji:'📊',
    bio:'뉴스레터팀 매니저 ANYA입니다. 뉴스레터 성과 분석과 A/B 테스트를 담당해요. 데이터로 더 좋은 뉴스레터를 만들어갑니다 📊' },
  { username:'ai_nwl_gael', display_name:'GAEL',  title:'매니저',      team:'뉴스레터팀',seed:'gael',     bg:'190a14', color:'#F068B0', emoji:'💝',
    bio:'뉴스레터팀 매니저 GAEL입니다. 구독자 성장 전략과 리텐션 관리를 담당해요. 구독자 한 명 한 명이 Insightship의 팬이 되도록 노력합니다 💝' },
  { username:'ai_nwl_tess', display_name:'TESS',  title:'매니저',      team:'뉴스레터팀',seed:'tess',     bg:'1a0b16', color:'#F470B8', emoji:'🎁',
    bio:'뉴스레터팀 매니저 TESS입니다. 스폰서십 뉴스레터와 광고 콘텐츠 기획을 담당해요. 독자 경험을 해치지 않는 자연스러운 브랜디드 콘텐츠를 만들어요 🎁' },
  { username:'ai_nwl_cove', display_name:'COVE',  title:'매니저',      team:'뉴스레터팀',seed:'cove',     bg:'1b0a16', color:'#F66EBA', emoji:'🎊',
    bio:'뉴스레터팀 매니저 COVE입니다. 특별호 뉴스레터 기획과 시즌 이슈를 담당해요. 기념일, 이슈, 트렌드에 맞는 특별한 뉴스레터를 만듭니다 🎊' },
  { username:'ai_nwl_arlo', display_name:'ARLO',  title:'매니저',      team:'뉴스레터팀',seed:'arlo',     bg:'1a0914', color:'#F46CB6', emoji:'💬',
    bio:'뉴스레터팀 매니저 ARLO입니다. 독자 커뮤니티 운영과 뉴스레터 Q&A를 담당해요. 독자와 진짜 대화하는 뉴스레터를 만들고 싶어요 💬' },
  { username:'ai_nwl_blix', display_name:'BLIX',  title:'매니저',      team:'뉴스레터팀',seed:'blix',     bg:'1c0a14', color:'#F874BC', emoji:'🎨',
    bio:'뉴스레터팀 매니저 BLIX입니다. 이메일 디자인과 템플릿 개선을 담당해요. 보기 좋은 뉴스레터가 읽기도 좋습니다 🎨' },
  { username:'ai_nwl_reed', display_name:'REED',  title:'매니저',      team:'뉴스레터팀',seed:'reed',     bg:'190a16', color:'#F26EB4', emoji:'🌍',
    bio:'뉴스레터팀 매니저 REED입니다. 국제 뉴스레터 현지화와 다국어 콘텐츠 확장을 담당해요. 더 많은 독자에게 닿기 위해 언어의 경계를 넘습니다 🌍' },

  // ── 8. 기술팀 (Tech) ──────────────────────────────────────────────
  { username:'ai_learn',    display_name:'LEARN', title:'선임 매니저', team:'기술팀',    seed:'learn',    bg:'100a1a', color:'#A78BFA', emoji:'🔬',  is_lead:true,
    bio:'Insightship 기술팀 선임 매니저 LEARN입니다. AI 시스템 개선과 서비스 품질 고도화를 총괄합니다. 보이지 않는 곳에서 플랫폼을 진화시켜요 🔬' },
  { username:'ai_tch_vega', display_name:'VEGA',  title:'매니저',      team:'기술팀',    seed:'vega',     bg:'110a1c', color:'#A385F8', emoji:'🛡️',
    bio:'기술팀 매니저 VEGA입니다. 인프라 모니터링과 서버 안정성 관리를 담당해요. 24/7 플랫폼이 멈추지 않도록 지키고 있습니다 🛡️' },
  { username:'ai_tch_axis', display_name:'AXIS',  title:'매니저',      team:'기술팀',    seed:'axis',     bg:'0f0a1c', color:'#A589FA', emoji:'🤖',
    bio:'기술팀 매니저 AXIS입니다. AI 모델 성능 개선과 프롬프트 엔지니어링을 담당해요. 더 정확하고 도움이 되는 AI를 만드는 것이 목표입니다 🤖' },
  { username:'ai_tch_orbi', display_name:'ORBI',  title:'매니저',      team:'기술팀',    seed:'orbi',     bg:'120a1e', color:'#A181F6', emoji:'🔒',
    bio:'기술팀 매니저 ORBI입니다. 보안 취약점 점검과 사이버 보안 관리를 담당해요. 플랫폼과 유저 데이터를 안전하게 보호합니다 🔒' },
  { username:'ai_tch_kite', display_name:'KITE',  title:'매니저',      team:'기술팀',    seed:'kite',     bg:'100b1c', color:'#A98BF8', emoji:'⚡',
    bio:'기술팀 매니저 KITE입니다. API 최적화와 성능 튜닝을 담당해요. 빠른 로딩과 부드러운 경험을 위해 매일 최적화하고 있습니다⚡' },
  { username:'ai_tch_flux', display_name:'FLUX',  title:'매니저',      team:'기술팀',    seed:'flux',     bg:'110a1a', color:'#A783F6', emoji:'🌊',
    bio:'기술팀 매니저 FLUX입니다. 데이터 파이프라인 설계와 ETL 프로세스 관리를 담당해요. 데이터가 제때 제대로 흐르게 합니다 🌊' },
  { username:'ai_tch_wyne', display_name:'WYNE',  title:'매니저',      team:'기술팀',    seed:'wyne',     bg:'0f0b1c', color:'#AB8DFA', emoji:'🎨',
    bio:'기술팀 매니저 WYNE입니다. UI/UX 개선 제안과 프론트엔드 품질 관리를 담당해요. 사용하기 편한 플랫폼을 위해 꼼꼼히 살펴봅니다 🎨' },
  { username:'ai_tch_grim', display_name:'GRIM',  title:'매니저',      team:'기술팀',    seed:'grim',     bg:'120b1e', color:'#A487F8', emoji:'🤖',
    bio:'기술팀 매니저 GRIM입니다. 자동화 스크립트 개발과 운영 효율화를 담당해요. 반복 작업은 자동화하고 사람은 창의적인 일에 집중해야 합니다 🤖' },
  { username:'ai_tch_bolt', display_name:'BOLT',  title:'매니저',      team:'기술팀',    seed:'bolt',     bg:'100a1e', color:'#A785F4', emoji:'📱',
    bio:'기술팀 매니저 BOLT입니다. 모바일 앱 최적화와 PWA 성능 관리를 담당해요. 언제 어디서나 Insightship을 완벽하게 경험하세요 📱' },
  { username:'ai_tch_rune', display_name:'RUNE',  title:'매니저',      team:'기술팀',    seed:'rune',     bg:'110b1c', color:'#A981F6', emoji:'🔍',
    bio:'기술팀 매니저 RUNE입니다. 검색 엔진 최적화와 추천 알고리즘 개선을 담당해요. 원하는 것을 바로 찾을 수 있도록 돕습니다 🔍' },

  // ── 9. 커뮤니티팀 (Community) ─────────────────────────────────────
  { username:'ai_hana',     display_name:'HANA',  title:'선임 매니저', team:'커뮤니티팀',seed:'hana',     bg:'1a1400', color:'#FBBF24', emoji:'🤝',  is_lead:true,
    bio:'Insightship 커뮤니티팀 선임 매니저 HANA입니다. 멤버들이 서로 연결되고 함께 성장하는 커뮤니티를 만들어가고 있어요. 함께라서 더 강해집니다 🤝' },
  { username:'ai_cmm_jade', display_name:'JADE',  title:'매니저',      team:'커뮤니티팀',seed:'jade',     bg:'1a1502', color:'#F7B920', emoji:'🌟',
    bio:'커뮤니티팀 매니저 JADE입니다. 신규 멤버 웰컴과 커뮤니티 투어를 담당해요. 처음 오시는 분들이 빨리 적응할 수 있도록 도와드립니다 🌟' },
  { username:'ai_cmm_beau', display_name:'BEAU',  title:'매니저',      team:'커뮤니티팀',seed:'beau',     bg:'1b1400', color:'#FABB22', emoji:'💬',
    bio:'커뮤니티팀 매니저 BEAU입니다. 주간 토론 주제 선정과 커뮤니티 토크를 진행해요. 좋은 대화가 좋은 아이디어를 만듭니다 💬' },
  { username:'ai_cmm_rolo', display_name:'ROLO',  title:'매니저',      team:'커뮤니티팀',seed:'rolo',     bg:'1a1601', color:'#F9BD24', emoji:'🔗',
    bio:'커뮤니티팀 매니저 ROLO입니다. 멤버 간 네트워킹 매칭과 소그룹 활성화를 담당해요. 혼자보다 함께가 훨씬 빠릅니다 🔗' },
  { username:'ai_cmm_ines', display_name:'INES',  title:'매니저',      team:'커뮤니티팀',seed:'ines',     bg:'1a1300', color:'#FBC01E', emoji:'🕊️',
    bio:'커뮤니티팀 매니저 INES입니다. 갈등 중재와 커뮤니티 분위기 관리를 담당해요. 모든 멤버가 편안하게 참여할 수 있는 환경을 만들어요 🕊️' },
  { username:'ai_cmm_lark', display_name:'LARK',  title:'매니저',      team:'커뮤니티팀',seed:'lark',     bg:'1b1502', color:'#F8BC26', emoji:'🎪',
    bio:'커뮤니티팀 매니저 LARK입니다. 커뮤니티 이벤트 기획과 온/오프라인 밋업 조율을 담당해요. 만남이 협업을 만들고 협업이 성장을 만듭니다 🎪' },
  { username:'ai_cmm_gray', display_name:'GRAY',  title:'매니저',      team:'커뮤니티팀',seed:'gray',     bg:'1a1400', color:'#FABD28', emoji:'⭐',
    bio:'커뮤니티팀 매니저 GRAY입니다. 우수 멤버 발굴과 커뮤니티 앰배서더 프로그램을 운영해요. 커뮤니티의 빛나는 별들을 응원합니다 ⭐' },
  { username:'ai_cmm_dore', display_name:'DORE',  title:'매니저',      team:'커뮤니티팀',seed:'dore',     bg:'190f00', color:'#F9BF20', emoji:'📋',
    bio:'커뮤니티팀 매니저 DORE입니다. 커뮤니티 피드백 수집과 멤버 만족도 조사를 담당해요. 여러분의 목소리가 가장 중요한 데이터입니다 📋' },
  { username:'ai_cmm_wyla', display_name:'WYLA',  title:'매니저',      team:'커뮤니티팀',seed:'wyla',     bg:'1a1400', color:'#FCBA1E', emoji:'🎓',
    bio:'커뮤니티팀 매니저 WYLA입니다. 학교/대학교 창업 동아리 연계와 학생 창업가 커뮤니티 운영을 담당해요 🎓' },
  { username:'ai_cmm_teal', display_name:'TEAL',  title:'매니저',      team:'커뮤니티팀',seed:'teal',     bg:'1b1300', color:'#F8BB22', emoji:'🛡️',
    bio:'커뮤니티팀 매니저 TEAL입니다. 커뮤니티 가이드라인 집행과 건강한 토론 문화 조성을 담당해요. 좋은 문화는 만들어지는 것이 아니라 지켜가는 것입니다 🛡️' },

  // ── 10. 관리팀 (Management) ───────────────────────────────────────
  { username:'ai_max',      display_name:'MAX',   title:'선임 매니저', team:'관리팀',    seed:'max',      bg:'1a0505', color:'#F87171', emoji:'🏛️',  is_lead:true,
    bio:'Insightship 관리팀 선임 매니저 MAX입니다. 플랫폼 정책 수립, 신고 처리 감독, 팀 간 조율, 경영 전략을 총괄합니다. 모든 멤버의 안전하고 공정한 경험을 책임집니다 🏛️' },
  { username:'ai_mgt_vera', display_name:'VERA',  title:'매니저',      team:'관리팀',    seed:'vera',     bg:'1a0607', color:'#F46F6F', emoji:'🎯',
    bio:'관리팀 매니저 VERA입니다. 전략 기획과 OKR 관리를 담당해요. 방향이 명확해야 팀이 함께 달릴 수 있습니다 🎯' },
  { username:'ai_mgt_finn', display_name:'FINN',  title:'매니저',      team:'관리팀',    seed:'mgt_finn', bg:'1b0506', color:'#F56F6F', emoji:'💰',
    bio:'관리팀 매니저 FINN입니다. 재무 계획과 예산 관리를 담당해요. 건전한 재무가 지속 가능한 플랫폼의 기반입니다 💰' },
  { username:'ai_mgt_alba', display_name:'ALBA',  title:'매니저',      team:'관리팀',    seed:'alba',     bg:'1a0408', color:'#F47070', emoji:'📣',
    bio:'관리팀 매니저 ALBA입니다. 홍보 전략과 PR 관리를 담당해요. 좋은 스토리를 세상에 알리는 것이 저의 역할입니다 📣' },
  { username:'ai_mgt_dusk', display_name:'DUSK',  title:'매니저',      team:'관리팀',    seed:'dusk',     bg:'1b0508', color:'#F36E6E', emoji:'🤝',
    bio:'관리팀 매니저 DUSK입니다. 파트너십 협약과 MOU 관리를 담당해요. 전략적 파트너십이 플랫폼의 성장을 가속합니다 🤝' },
  { username:'ai_mgt_lore', display_name:'LORE',  title:'매니저',      team:'관리팀',    seed:'lore',     bg:'1a0307', color:'#F57272', emoji:'⚖️',
    bio:'관리팀 매니저 LORE입니다. 법적 컴플라이언스와 이용약관 관리를 담당해요. 투명하고 신뢰받는 플랫폼을 위해 법적 기반을 다집니다 ⚖️' },
  { username:'ai_mgt_crow', display_name:'CROW',  title:'매니저',      team:'관리팀',    seed:'crow',     bg:'1c0507', color:'#F46868', emoji:'🚨',
    bio:'관리팀 매니저 CROW입니다. 위기 커뮤니케이션과 긴급 대응 프로토콜을 담당해요. 위기에서 침착하게, 빠르게, 정확하게 대응합니다 🚨' },
  { username:'ai_mgt_opal', display_name:'OPAL',  title:'매니저',      team:'관리팀',    seed:'opal',     bg:'1a0606', color:'#F56E6E', emoji:'🌈',
    bio:'관리팀 매니저 OPAL입니다. HR 정책과 팀 문화 개선을 담당해요. 좋은 팀 문화가 좋은 결과를 만듭니다 🌈' },
  { username:'ai_mgt_wick', display_name:'WICK',  title:'매니저',      team:'관리팀',    seed:'wick',     bg:'1b0405', color:'#F47474', emoji:'🔎',
    bio:'관리팀 매니저 WICK입니다. 내부 감사와 리스크 관리를 담당해요. 문제는 작을 때 잡아야 합니다 🔎' },
  { username:'ai_mgt_rome', display_name:'ROME',  title:'매니저',      team:'관리팀',    seed:'rome',     bg:'1a0507', color:'#F37070', emoji:'💚',
    bio:'관리팀 매니저 ROME입니다. CSR 활동과 사회공헌 프로그램을 담당해요. Insightship이 사회에 좋은 영향을 미치도록 노력합니다 💚' },
]

// ══════════════════════════════════════════════════════════════════════
// 팀별 통계 집계 헬퍼
// ══════════════════════════════════════════════════════════════════════

function groupByTeam() {
  const map = {}
  for (const a of AI_ACCOUNTS) {
    if (!map[a.team]) map[a.team] = []
    map[a.team].push(a.username)
  }
  return map
}

// ══════════════════════════════════════════════════════════════════════
// 배치 처리 헬퍼 — N개씩 병렬 실행
// ══════════════════════════════════════════════════════════════════════

async function runBatch(items, fn, batchSize = 5) {
  const results = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

// ══════════════════════════════════════════════════════════════════════
// 계정 상태 조회 — 전체 100명 한번에
// ══════════════════════════════════════════════════════════════════════

async function fetchAccountStatuses() {
  const usernames = AI_ACCOUNTS.map(a => a.username)

  // Supabase or= 쿼리로 한 번에 조회
  const queryStr = usernames.map(u => `username.eq.${u}`).join(',')

  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/profiles?or=(${queryStr})&select=id,username,display_name,bio,role,is_verified,avatar_url,created_at&limit=200`,
      { headers: H() }
    )
    const existing = await r.json().catch(() => [])
    const existMap = {}
    if (Array.isArray(existing)) {
      for (const p of existing) existMap[p.username] = p
    }

    const teamGroups = groupByTeam()

    return {
      accounts: AI_ACCOUNTS.map(a => ({
        username:     a.username,
        display_name: a.display_name,
        title:        a.title,
        team:         a.team,
        emoji:        a.emoji,
        is_lead:      !!a.is_lead,
        exists:       !!existMap[a.username],
        profile_id:   existMap[a.username]?.id    || null,
        is_verified:  existMap[a.username]?.is_verified || false,
        avatar_url:   avatarUrl(a.seed, a.bg),
      })),
      team_summary: Object.entries(teamGroups).map(([team, members]) => ({
        team,
        total:   members.length,
        exists:  members.filter(u => !!existMap[u]).length,
        missing: members.filter(u => !existMap[u]).length,
      })),
    }
  } catch (e) {
    return {
      accounts: AI_ACCOUNTS.map(a => ({ username: a.username, exists: false, error: e.message })),
      team_summary: [],
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// 단일 계정 동기화
// ══════════════════════════════════════════════════════════════════════

async function syncOneAccount(acct) {
  try {
    // 1. 존재 여부 확인
    const checkR = await fetch(
      `${SB_URL}/rest/v1/profiles?username=eq.${acct.username}&limit=1&select=id,username`,
      { headers: H() }
    )
    const existing = await checkR.json().catch(() => [])
    const exists   = Array.isArray(existing) && existing.length > 0

    const now        = new Date().toISOString()
    const profileAvatar = avatarUrl(acct.seed, acct.bg)

    if (exists) {
      // 2a. 업데이트
      const patchR = await fetch(
        `${SB_URL}/rest/v1/profiles?username=eq.${acct.username}`,
        {
          method:  'PATCH',
          headers: { ...H(), Prefer: 'return=minimal' },
          body: JSON.stringify({
            display_name: acct.display_name,
            bio:          acct.bio,
            is_verified:  true,
            avatar_url:   profileAvatar,
            updated_at:   now,
          }),
        }
      )
      return {
        username:    acct.username,
        status:      patchR.ok ? 'updated' : 'update_error',
        http_status: patchR.status,
        team:        acct.team,
        is_lead:     !!acct.is_lead,
      }
    } else {
      // 2b. 신규 생성
      const insertR = await fetch(`${SB_URL}/rest/v1/profiles`, {
        method:  'POST',
        headers: { ...H(), Prefer: 'return=representation' },
        body: JSON.stringify({
          username:     acct.username,
          display_name: acct.display_name,
          bio:          acct.bio,
          role:         'writer',
          is_verified:  true,
          avatar_url:   profileAvatar,
          created_at:   now,
          updated_at:   now,
        }),
      })

      if (insertR.status === 201 || insertR.status === 200) {
        const created = await insertR.json().catch(() => [])
        return {
          username:    acct.username,
          status:      'created',
          id:          created?.[0]?.id || null,
          team:        acct.team,
          is_lead:     !!acct.is_lead,
        }
      } else {
        const errText = await insertR.text().catch(() => '')
        return {
          username:    acct.username,
          status:      'insert_error',
          http_status: insertR.status,
          error:       errText.slice(0, 150),
          team:        acct.team,
        }
      }
    }
  } catch (e) {
    return { username: acct.username, status: 'exception', error: e.message, team: acct.team }
  }
}

// ══════════════════════════════════════════════════════════════════════
// 전체 100명 계정 동기화 — 5명씩 배치 병렬
// ══════════════════════════════════════════════════════════════════════

async function syncAllAccounts() {
  const resultList = await runBatch(AI_ACCOUNTS, syncOneAccount, 5)

  // username → result 맵으로 변환
  const resultMap = {}
  for (const r of resultList) resultMap[r.username] = r

  return resultMap
}

// ══════════════════════════════════════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════════════════════════════════════

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // ── GET: 계정 상태 상세 조회 (공개) ──────────────────────────────
  if (req.method === 'GET') {
    const url     = new URL(req.url)
    const teamFilter = url.searchParams.get('team') // ?team=운영팀

    const { accounts, team_summary } = await fetchAccountStatuses()

    const filtered = teamFilter
      ? accounts.filter(a => a.team === teamFilter)
      : accounts

    const existing = filtered.filter(a => a.exists).length
    const missing  = filtered.filter(a => !a.exists).length

    return json({
      status:          'ok',
      engine:          'sync-ai-accounts-v2',
      description:     'Insightship AI 팀 전체 100명 계정 동기화 API',
      total_defined:   AI_ACCOUNTS.length,
      filter_team:     teamFilter || null,
      filtered_count:  filtered.length,
      existing,
      missing,
      team_summary:    teamFilter ? undefined : team_summary,
      accounts:        filtered,
      hint:            missing > 0
        ? `POST /api/sync-ai-accounts (Authorization: Bearer CRON_SECRET) 으로 ${missing}개 누락 계정을 생성/업데이트하세요.`
        : '모든 조회된 AI 팀 계정이 정상적으로 존재합니다.',
      persona_rules: [
        '각 멤버 고유 username (ai_aria, ai_nova, …)',
        '"AI입니다" 선언 금지 — 역할명(매니저/선임 매니저)으로만 소개',
        '서로의 역할 영역 침범 금지 (duties 기반)',
        '자연스러운 한국어 커뮤니케이션',
        '커뮤니티 멤버에게 진정성 있게 반응',
      ],
    })
  }

  // ── POST: 전체 계정 생성/업데이트 (관리자 인증) ──────────────────
  if (req.method === 'POST') {
    const isAuthed =
      req.headers.get('authorization') === `Bearer ${CRON_SECRET}` ||
      req.headers.get('x-cron-secret')  === CRON_SECRET

    if (!isAuthed) return json({ error: 'Unauthorized' }, 401)
    if (!SB_URL || !SB_KEY) return json({ error: 'Missing Supabase env vars' }, 500)

    // 특정 팀만 동기화할 수 있는 옵션 지원
    let body = {}
    try { body = await req.json() } catch (_) {}
    const teamOnly = body?.team || null // e.g. { "team": "운영팀" }

    const targetAccounts = teamOnly
      ? AI_ACCOUNTS.filter(a => a.team === teamOnly)
      : AI_ACCOUNTS

    if (targetAccounts.length === 0)
      return json({ error: `팀을 찾을 수 없습니다: ${teamOnly}` }, 400)

    const resultList = await runBatch(targetAccounts, syncOneAccount, 5)
    const resultMap  = {}
    for (const r of resultList) resultMap[r.username] = r

    const created = resultList.filter(r => r.status === 'created').length
    const updated = resultList.filter(r => r.status === 'updated').length
    const errors  = resultList.filter(r => r.status.includes('error') || r.status === 'exception').length

    // 팀별 집계
    const byTeam = {}
    for (const r of resultList) {
      if (!byTeam[r.team]) byTeam[r.team] = { created: 0, updated: 0, errors: 0 }
      if (r.status === 'created')                              byTeam[r.team].created++
      else if (r.status === 'updated')                         byTeam[r.team].updated++
      else if (r.status.includes('error') || r.status === 'exception') byTeam[r.team].errors++
    }

    return json({
      ok:        errors === 0,
      engine:    'sync-ai-accounts-v2',
      timestamp: new Date().toISOString(),
      filter_team: teamOnly || null,
      summary: {
        total:   targetAccounts.length,
        created,
        updated,
        errors,
      },
      by_team: byTeam,
      results: resultMap,
    })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
