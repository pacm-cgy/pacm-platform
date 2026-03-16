// 아티클/뉴스 슬러그 자동 생성 유틸

const KO_MAP = {
  '가':'ga','나':'na','다':'da','라':'ra','마':'ma','바':'ba','사':'sa','아':'a','자':'ja','차':'cha','카':'ka','타':'ta','파':'pa','하':'ha',
  '각':'gak','낙':'nak','닥':'dak','락':'rak','막':'mak','박':'bak','삭':'sak','악':'ak','작':'jak','착':'chak',
  '강':'gang','낭':'nang','당':'dang','랑':'rang','망':'mang','방':'bang','상':'sang','양':'yang','장':'jang','창':'chang',
  '개':'gae','내':'nae','대':'dae','래':'rae','매':'mae','배':'bae','새':'sae','애':'ae','재':'jae','채':'chae',
  '거':'geo','너':'neo','더':'deo','러':'reo','머':'meo','버':'beo','서':'seo','어':'eo','저':'jeo','처':'cheo',
  '게':'ge','네':'ne','데':'de','레':'re','메':'me','베':'be','세':'se','에':'e','제':'je','체':'che',
  '겨':'gyeo','녀':'nyeo','뎌':'dyeo','려':'ryeo','며':'myeo','벼':'byeo','서':'seo','여':'yeo','저':'jeo','처':'cheo',
  '고':'go','노':'no','도':'do','로':'ro','모':'mo','보':'bo','소':'so','오':'o','조':'jo','초':'cho',
  '과':'gwa','놔':'nwa','돠':'dwa','롸':'rwa','뫄':'mwa','봐':'bwa','솨':'swa','와':'wa','좌':'jwa','촤':'chwa',
  '교':'gyo','뇨':'nyo','됴':'dyo','료':'ryo','묘':'myo','뵤':'byo','쇼':'syo','요':'yo','죠':'jyo','쵸':'chyo',
  '구':'gu','누':'nu','두':'du','루':'ru','무':'mu','부':'bu','수':'su','우':'u','주':'ju','추':'chu',
  '그':'geu','느':'neu','드':'deu','르':'reu','므':'meu','브':'beu','스':'seu','으':'eu','즈':'jeu','츠':'cheu',
  '기':'gi','니':'ni','디':'di','리':'ri','미':'mi','비':'bi','시':'si','이':'i','지':'ji','치':'chi',
  '창업':'startup','스타트업':'startup','투자':'investment','뉴스':'news','분석':'analysis',
  '인사이트':'insight','트렌드':'trend','마켓':'market','시장':'market','청소년':'youth','기업':'company',
}

/**
 * 한국어 텍스트를 영문 슬러그로 변환
 * @param {string} title - 제목
 * @param {string} type - 'article' | 'news' | 'report'
 */
export function generateSlug(title, type = 'article') {
  if (!title) return generateRandomSlug(type)

  // 특수 단어 먼저 교체
  let slug = title
  for (const [ko, en] of Object.entries(KO_MAP)) {
    slug = slug.replace(new RegExp(ko, 'g'), en + '-')
  }

  // 영문/숫자만 남기고 정리
  slug = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // 특수문자 → -
    .replace(/-{2,}/g, '-')        // 연속 - 제거
    .replace(/^-+|-+$/g, '')       // 앞뒤 - 제거
    .slice(0, 60)                  // 최대 60자

  // 너무 짧으면 랜덤 추가
  if (slug.length < 3) return generateRandomSlug(type)

  const ts = Date.now().toString(36)
  return `${type}-${slug}-${ts}`
}

/**
 * 랜덤 슬러그 생성
 */
export function generateRandomSlug(type = 'article') {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const random = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `${type}-${Date.now().toString(36)}-${random}`
}
