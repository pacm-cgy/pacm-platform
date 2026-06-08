# INSIGHTSHIP 플랫폼 전체 구조화 분석 & 개발 계획
> 작성일: 2026-06-08 | 버전: v1.0 | 분석자: Genspark AI Developer

---

## 목차

1. [플랫폼 개요](#1-플랫폼-개요)
2. [기술 스택 전체 맵](#2-기술-스택-전체-맵)
3. [백엔드 전체 구조화 분석](#3-백엔드-전체-구조화-분석)
   - 3.1 실제 배포 API 파일 (6개)
   - 3.2 IIFE 핸들러 전체 목록 (27개+)
   - 3.3 Cron 스케줄 14개 전체
   - 3.4 DB 스키마 (테이블 36개+)
4. [프론트엔드 전체 구조화 분석](#4-프론트엔드-전체-구조화-분석)
   - 4.1 페이지 25개 분석
   - 4.2 컴포넌트 구조
   - 4.3 상태관리 (Zustand)
   - 4.4 데이터 패칭 (TanStack Query)
5. [AI 엔진 구조 분석](#5-ai-엔진-구조-분석)
6. [알려진 버그 & 기술 부채](#6-알려진-버그--기술-부채)
7. [개발 계획 Phase 1~5](#7-개발-계획-phase-1~5)
8. [우선순위 매트릭스](#8-우선순위-매트릭스)

---

## 1. 플랫폼 개요

```
INSIGHTSHIP (구 PACM)
청소년·청년 창업가를 위한 올인원 플랫폼

핵심 가치 제공:
  - 창업 뉴스 자동 수집·정제·롱폼 생성 (AI 파이프라인)
  - AI 멘토 LUMI와 1:1 창업 코칭 (BM25 + Knowledge Graph)
  - 아이디어 공유 & 피드백 커뮤니티
  - 기업 연결 프로젝트 매칭
  - 창업 교육 & 이벤트 큐레이션
  - AI 운영팀 8명 (ARIA/NOVA/LUMI/PULSE/TREND/SAGE/ECHO/LEARN)
```

---

## 2. 기술 스택 전체 맵

### Frontend
| 항목 | 기술 | 버전 | 역할 |
|------|------|------|------|
| UI 프레임워크 | React | 19.2.4 | 컴포넌트 렌더링 |
| 라우팅 | React Router DOM | 7.13.1 | SPA 라우팅 |
| 서버 상태 | TanStack Query | 5.90.21 | API 캐싱, 리패칭 |
| 클라이언트 상태 | Zustand | 5.0.11 | Auth/Theme/UI 상태 |
| 빌드 도구 | Vite | 8.0.0 | 번들링, HMR |
| PWA | vite-plugin-pwa | 1.0.0 | 서비스워커, 오프라인 |
| 아이콘 | Lucide React | 0.577.0 | 아이콘 시스템 |
| SEO | react-helmet-async | 3.0.0 | 동적 메타태그 |
| 날짜 | date-fns | latest | 날짜 포맷 |
| CSS | CSS Variables | - | 다크/라이트 테마 |

### Backend
| 항목 | 기술 | 역할 |
|------|------|------|
| 서버리스 | Vercel Edge/Serverless | API 함수 실행 |
| 통합 패턴 | IIFE (즉시실행함수) | 12함수 제한 우회 |
| DB | Supabase PostgreSQL | 메인 데이터 저장 |
| 인증 | Supabase Auth | 소셜 로그인, JWT |
| 실시간 | Supabase Realtime | 메시지, 알림 구독 |
| 보안 | RLS (Row Level Security) | DB 접근 제어 |
| AI | 자체 개발 (외부 LLM $0) | BM25 + 지식그래프 |
| 스트리밍 | SSE (ReadableStream) | AI 응답 스트리밍 |
| 뉴스 | RSS 6소스 + 네이버 API | 뉴스 자동 수집 |
| Cron | Vercel Cron | 자동화 작업 14개 |

---

## 3. 백엔드 전체 구조화 분석

### 3.1 실제 배포 API 파일 (6개 + 보조)

```
api/
├── ai.js          ← AI 통합 라우터 (8059줄) — Edge Runtime
│   └── 핸들러: admin-ai, ai-engine, ai-mentor(v5.1), 
│                 ai-mentor-learn, ai-team, ai-workers,
│                 ai-platform-operator, ai-content-writer, badge-system
│
├── news.js        ← 뉴스 파이프라인 라우터 (3153줄) — Edge Runtime
│   └── 핸들러: fetch-news, summarize-news, run-summarize,
│                 quality-check, extract-trends, cleanup,
│                 recrawl-news, reset-summaries, self-ai-summarize
│
├── admin.js       ← 관리자 통합 라우터 (5384줄) — Edge Runtime
│   └── 핸들러: admin-action, auto-ops, dev-permissions,
│                 incident-response, security-audit, patch-notes,
│                 office, sync-ai-accounts, community-engine,
│                 feedback-reply, generate-report, generate-images,
│                 analyze-trend, report
│
├── inquiry.js     ← 문의/뉴스레터 라우터 (1076줄)
│   └── 핸들러: ad-inquiry, partner-inquiry, send-newsletter, unsubscribe
│
├── setup.js       ← DB 초기화 라우터 (769줄)
│   └── 핸들러: setup-db, db-setup, db-setup-staff, setup-rag, add-knowledge
│
├── staff-chat.js  ← 직원 채팅 API (744줄) — 관리자 전용
├── staff-chat-auto.js ← 직원 자동 채팅 (1008줄) — Cron 연동
├── fetch-og.js    ← OG 메타데이터 추출
├── reprocess-all-news.js ← 뉴스 일괄 재처리
├── debug.js       ← 디버그 엔드포인트
├── sitemap-dynamic.js ← 동적 사이트맵 생성
└── staff-auth.js  ← 직원 인증
```

### 3.2 IIFE 핸들러 전체 목록 (요청 경로 → 핸들러)

#### 📰 뉴스 파이프라인 (`api/news.js`)
| 경로 | 핸들러 | 기능 | 트리거 |
|------|--------|------|--------|
| `/api/news?action=fetch` | handleFetchNews | RSS 6소스+네이버 API 수집 | Cron 02:00 |
| `/api/news?action=summarize` | handleSummarizeNews | BM25 자동 요약 생성 | Cron 04:00 |
| `/api/news?action=run_summarize` | handleRunSummarize | 미요약 뉴스 롱폼 생성 | Cron 06:00 |
| `/api/news?action=quality_check` | handleLongformQualityCheck | 롱폼 품질 검사 | Cron 06:30 |
| `/api/news?action=extract_trends` | handleExtractTrends | 트렌드 키워드 추출 | Cron 08:00 |
| `/api/news?action=cleanup` | handleNewsCleanup | 오래된 뉴스 정리 | Cron 10:00 |
| `/api/recrawl-news` | handleRecrawlNews | 본문 재수집 | 수동 |
| `/api/reset-summaries` | handleResetSummaries | 요약 초기화 | 수동 |
| `/api/news?action=self_summarize` | handleSelfAiSummarize | AI 자기 요약 | 수동 |

#### 🤖 AI 엔진 (`api/ai.js`)
| 경로 | 핸들러 | 기능 | 트리거 |
|------|--------|------|--------|
| `/api/ai-mentor` | handleAiMentor (v5.1) | LUMI 멘토 대화 (SSE 스트리밍) | 실시간 |
| `/api/ai-engine` | handleAiEngine | AI 엔진 직접 호출 | 실시간 |
| `/api/admin-ai` | handleAdminAi | 관리자 AI 도구 | 관리자 |
| `/api/ai?action=mentor_learn` | handleAiMentorLearn | 멘토 학습 데이터 축적 | Cron 16:00 |
| `/api/ai?action=platform_operator` | handleAiPlatformOperator | 플랫폼 운영 AI | Cron 13:00 |
| `/api/ai?action=content_writer` | handleAiContentWriter | 콘텐츠 자동 작성 | Cron 14:00 |
| `/api/ai?action=badge` | handleBadgeSystem | 배지 자동 부여 | Cron 15:00 |
| `/api/ai-team` | handleAiTeam | AI팀 협업 시스템 | 실시간 |
| `/api/ai-workers` | handleAiWorkers | AI 워커 실행 | 수동 |

#### 🛠️ 관리자 (`api/admin.js`)
| 경로 | 핸들러 | 기능 | 트리거 |
|------|--------|------|--------|
| `/api/admin?action=community` | handleCommunityEngine | 커뮤니티 자동 관리 | Cron 12:00 |
| `/api/admin?action=generate_report` | handleGenerateReport | 주간 리포트 생성 | Cron 금 17:00 |
| `/api/admin?action=patch_notes` | handlePatchNotes | 패치노트 자동 생성 | Cron 1일/15일 |
| `/api/admin?action=newsletter` | handleSendNewsletter | 뉴스레터 발송 | Cron 일 23:00 |
| `/api/security-audit` | handleSecurityAudit | 보안 감사 로그 | 수동 |
| `/api/incident-response` | handleIncidentResponse | 사고 대응 자동화 | 수동 |
| `/api/sync-ai-accounts` | handleSyncAiAccounts | AI 계정 동기화 | 수동 |
| `/api/feedback-reply` | handleFeedbackReply | 피드백 자동 응답 | 수동 |
| `/api/analyze-trend` | handleAnalyzeTrend | 트렌드 심층 분석 | 수동 |
| `/api/generate-images` | handleGenerateImages | 이미지 생성 | 수동 |
| `/api/office` | handleOffice | 오피스 관리 | 수동 |
| `/api/report` | handleReport | 리포트 조회 | 수동 |
| `/api/admin-action` | handleAdminAction | 관리자 액션 | 관리자 |
| `/api/auto-ops` | handleAutoOps | 자동 운영 | Cron 연동 |
| `/api/dev-permissions` | handleDevPermissions | 개발 권한 관리 | 수동 |

#### 📬 문의/뉴스레터 (`api/inquiry.js`)
| 경로 | 핸들러 | 기능 |
|------|--------|------|
| `/api/ad-inquiry` | handleAdInquiry | 광고 문의 처리 |
| `/api/partner-inquiry` | handlePartnerInquiry | 파트너 문의 처리 |
| `/api/send-newsletter` | handleSendNewsletter | 뉴스레터 발송 |
| `/api/unsubscribe` | handleUnsubscribe | 뉴스레터 수신 거부 |

### 3.3 Cron 스케줄 14개 전체

```
뉴스 파이프라인 (UTC 기준):
  02:00 매일  → /api/news?action=fetch         [뉴스 수집]
  04:00 매일  → /api/news?action=summarize     [자동 요약]
  06:00 매일  → /api/news?action=run_summarize [롱폼 생성]
  06:30 매일  → /api/news?action=quality_check [품질 검사]
  08:00 매일  → /api/news?action=extract_trends[트렌드 추출]
  10:00 매일  → /api/news?action=cleanup       [뉴스 정리]

AI 운영:
  12:00 매일  → /api/admin?action=community    [커뮤니티 관리]
  13:00 매일  → /api/ai?action=platform_operator [플랫폼 운영]
  14:00 매일  → /api/ai?action=content_writer  [콘텐츠 작성]
  15:00 매일  → /api/ai?action=badge           [배지 부여]
  16:00 매일  → /api/ai?action=mentor_learn    [멘토 학습]

리포트/뉴스레터:
  17:00 매주금 → /api/admin?action=generate_report [주간 리포트]
  23:00 매주일 → /api/inquiry?action=newsletter    [뉴스레터 발송]
  00:00 1,15일 → /api/admin?action=patch_notes     [패치노트]
```

### 3.4 DB 스키마 (테이블 36개+)

#### 핵심 도메인 테이블
| 테이블 | 행 | 설명 | RLS |
|--------|-----|------|-----|
| `profiles` | - | 사용자 프로필 (user_role: reader/writer/admin) | ✅ |
| `articles` | - | 아티클/에디터리얼 (article_category enum) | ✅ |
| `article_images` | - | 아티클 이미지 첨부 | ✅ |
| `article_likes` | - | 아티클 좋아요 (복합PK) | ✅ |
| `bookmarks` | - | 북마크 (복합PK) | ✅ |

#### 커뮤니티
| 테이블 | 설명 | RLS |
|--------|------|-----|
| `community_posts` | 커뮤니티 게시글 (post_type: question/feedback/recruit/free/notice) | ✅ |
| `comments` | 댓글 (대댓글 지원 parent_id) | ✅ |

#### 비즈니스
| 테이블 | 설명 | RLS |
|--------|------|-----|
| `projects` | 기업연결 프로젝트 | ✅ |
| `project_applications` | 프로젝트 지원 | ✅ |
| `ideas` | 창업 아이디어 | ✅ |
| `idea_likes` | 아이디어 좋아요 | ✅ |
| `idea_comments` | 아이디어 댓글 | ✅ |
| `events` | 이벤트/해커톤 | ✅ |
| `event_registrations` | 이벤트 참가신청 | ✅ |

#### 뉴스 관련 (schema 외 news 테이블)
| 테이블 | 설명 |
|--------|------|
| `news` | 뉴스 메타 (title, slug, description, body, longform_story...) |
| `trend_snapshots` | 트렌드 스냅샷 |
| `trend_keywords` | 트렌드 키워드 |

#### AI/운영
| 테이블 | 설명 |
|--------|------|
| `ai_knowledge` | AI 지식베이스 (RAG 소스) |
| `mentor_chat_logs` | 멘토 대화 로그 |
| `mentor_intent_stats` | 의도 분류 통계 |
| `notifications` | 사용자 알림 |
| `badges` | 배지 시스템 |
| `ai_operations_log` | AI 운영 로그 |
| `ai_notices` | AI 공지사항 |
| `ai_team_members` | AI 팀원 정의 |

#### 메시지/소셜
| 테이블 | 설명 |
|--------|------|
| `messages_conversations` | 대화방 (participant_a, participant_b) |
| `messages` | 메시지 내용 |
| `user_follows` | 팔로우/팔로잉 |

#### 보안/관리
| 테이블 | 설명 |
|--------|------|
| `newsletter_subscribers` | 뉴스레터 구독자 |
| `newsletter_logs` | 발송 로그 |
| `audit_logs` | 감사 로그 |
| `reports` | 신고 시스템 |
| `dev_permissions` | 개발 권한 |
| `dev_permission_logs` | 권한 변경 로그 |
| `patch_notes` | 패치노트 |
| `security_audit_logs` | 보안 감사 로그 |
| `blocked_ips` | 차단 IP |
| `active_sessions` | 활성 세션 |
| `login_attempts` | 로그인 시도 |
| `work_logs` | AI 작업 로그 |
| `staff_chat_messages` | 직원 채팅 |

---

## 4. 프론트엔드 전체 구조화 분석

### 4.1 페이지 25개 분석

| 페이지 | 경로 | 코드량 | DB연동 | AI연동 | 구현상태 |
|--------|------|--------|--------|--------|----------|
| **HomePage** | `/` | 945줄 | ✅ 완전 | ✅ AI 통계 | 🟢 완성 |
| **InsightPage** | `/insight/:category` | 881줄 | ✅ articles | ❌ | 🟢 완성 |
| **TrendPage** | `/trend` | 743줄 | ✅ trend_keywords | ✅ TREND AI | 🟢 완성 |
| **NewsPage** | `/news` | 709줄 | ✅ news | ❌ | 🟢 완성 |
| **NewsDetailPage** | `/news/:slug` | 1158줄 | ✅ news+롱폼 | ❌ | 🟢 완성 |
| **ArticlePage** | `/article/:slug` | 634줄 | ✅ articles | ❌ | 🟢 완성 |
| **CommunityPage** | `/community` | 810줄 | ✅ community_posts | ❌ | 🟢 완성 |
| **PostDetailPage** | `/community/:id` | 414줄 | ✅ comments | ❌ | 🟢 완성 |
| **MentorPage** | `/mentor` | 815줄 | ✅ chat logs | ✅ LUMI SSE | 🟢 완성 |
| **IdeasPage** | `/ideas` | 710줄 | ⚠️ 부분연동 | ❌ | 🟡 부분 |
| **MessagesPage** | `/messages` | 698줄 | ⚠️ 실시간미완 | ❌ | 🟡 부분 |
| **ConnectPage** | `/connect` | 269줄 | ⚠️ projects | ❌ | 🟡 부분 |
| **EduPage** | `/edu` | 448줄 | ⚠️ 정적 데이터 | ❌ | 🟡 부분 |
| **EventsPage** | `/events` | 479줄 | ✅ events | ❌ | 🟢 완성 |
| **SearchPage** | `/search` | 452줄 | ✅ 멀티소스 검색 | ❌ | 🟢 완성 |
| **ProfilePage** | `/profile/:id` | 1202줄 | ✅ profiles | ❌ | 🟢 완성 |
| **StoryPage** | `/story` | ~200줄 | ⚠️ 부분 | ❌ | 🟡 부분 |
| **MagazinePage** | `/magazine` | 548줄 | ✅ articles | ❌ | 🟢 완성 |
| **OfficePage** | `/office` | ~300줄 | ⚠️ 부분 | ❌ | 🟡 부분 |
| **AdminPage** | `/admin` | 3877줄 | ✅ 완전 | ✅ 관리자AI | 🟢 완성 |
| **LoginPage** | `/login` | 370줄 | ✅ Supabase Auth | ❌ | 🟢 완성 |
| **AboutPage** | `/about` | ~200줄 | ❌ 정적 | ❌ | 🟢 완성 |
| **AdvertisePage** | `/advertise` | ~200줄 | ✅ 문의 저장 | ❌ | 🟢 완성 |
| **TermsPage/PrivacyPage** | `/terms`, `/privacy` | ~150줄 | ❌ 정적 | ❌ | 🟢 완성 |
| **NotFoundPage** | `/404` | ~100줄 | ❌ | ❌ | 🟢 완성 |

### 4.2 컴포넌트 구조

```
src/
├── App.jsx                          ← 최상위: ErrorBoundary, Routes, QueryClient
├── components/
│   ├── layout/
│   │   ├── Header.jsx               ← 네비게이션, 검색, 모바일메뉴, 인증상태
│   │   └── Footer.jsx               ← 링크, 뉴스레터 구독
│   ├── article/
│   │   ├── ArticleCard.jsx          ← 아티클 카드 (홈/인사이트/마가진)
│   │   └── ArticlePanel.jsx         ← 사이드 패널 (슬라이드아웃)
│   ├── ads/
│   │   └── AdBanner.jsx             ← 광고 배너
│   ├── FeedbackPopup.jsx            ← 전체 유저 피드백 수집 팝업
│   ├── ImageCropper.jsx             ← 프로필 이미지 크롭
│   └── StaffChatPopup.jsx           ← 관리자 전용 AI 직원 채팅 (lazy load)
├── hooks/
│   ├── useData.js                   ← TanStack Query 훅 모음 (useArticles, useTrends...)
│   └── useArticle.js                ← 단일 아티클 훅
├── store/
│   └── index.js                     ← Zustand stores (Auth, Theme, UI)
├── lib/
│   ├── supabase.js                  ← Supabase 클라이언트
│   ├── security.js                  ← 보안 유틸 (XSS 방어, rate limit)
│   ├── utils.js                     ← 공통 유틸
│   ├── schema.sql                   ← DB 스키마 정의
│   └── functions.sql                ← DB 함수/트리거
└── utils/
    └── slug.js                      ← 슬러그 생성
```

### 4.3 상태관리 (Zustand)

```javascript
// useAuthStore - 인증 상태
{
  user, profile, session, loading,
  initialize(), fetchProfile(), signOut(),
  isAdmin(), isSuspended(), isWriter(), isAuthenticated()
}

// useThemeStore - 테마
{ theme: 'dark'|'light', toggleTheme(), initTheme() }

// useUIStore - UI 상태
{
  searchOpen, articlePanelOpen, articlePanelId, mobileMenuOpen,
  openSearch(), closeSearch(), openArticlePanel(), closeArticlePanel(),
  toggleMobileMenu(), closeMobileMenu()
}
```

### 4.4 데이터 패칭 (TanStack Query)

```javascript
// useData.js 커스텀 훅
useArticles(category, limit)     // articles 테이블
useTrends()                      // trend_snapshots
useProjects()                    // projects 테이블
useSubscribeNewsletter()         // newsletter_subscribers
usePinnedNotices()               // community_posts (pinned)

// 쿼리 설정
staleTime: 5분, gcTime: 10분
retry: 401/403 제외 최대 2회
refetchOnWindowFocus: false
```

---

## 5. AI 엔진 구조 분석

### LUMI v5.1 (현재 서비스) vs v5.2 (Dead Code)

```
현재 서비스: api/ai.js > handleAiMentor (v5.1)
Dead code:  api/_ai-mentor.js (v5.2 — 1507줄)

v5.1 포함 기능:
  - BM25 검색 + KNOWLEDGE_GRAPH 12개 도메인
  - Intent 분류 (INTENT_RULES)
  - Self-Research (5소스 DB 리서치)
  - Simulation Engine (린캔버스, SWOT, 재무시뮬레이션)
  - SSE 스트리밍 (ReadableStream + TextEncoder)
  - Rate Limiter (메모리 기반 — ⚠️ Edge 재시작시 초기화)

v5.2 추가 기능 (미통합):
  - Cognitive Synthesis Engine v2 (cognitiveReasoning)
  - Context Reasoner v3 (contextualReasoning)
  - Ethics Filter v2 (ethicsCheck)
  - Streaming Engine v2 (개선된 청크 전송)
  ⚠️ 버그: cognitiveReasoning() 내 entities.idea circular reference
```

### AI 운영팀 8명

| 이름 | 역할 | 실행 시점 |
|------|------|----------|
| ARIA | 플랫폼 총괄 운영 | 매일 13:00 Cron |
| NOVA | 콘텐츠 큐레이션 작성 | 매일 14:00 Cron |
| LUMI | 창업 멘토링 (실시간) | 사용자 요청 실시간 |
| PULSE | 트렌드 분석 | 매일 08:00 Cron |
| TREND | 뉴스 요약 | 매일 04:00 Cron |
| SAGE | 커뮤니티 관리 | 매일 12:00 Cron |
| ECHO | 피드백 분석 | 매일 자동 |
| LEARN | 멘토 학습 | 매일 16:00 Cron |

### Knowledge Graph 12개 도메인

```
mvp, lean_canvas, funding, market_research, team,
pivot, growth_hack, unit_economics, legal, marketing,
product_market_fit, exit_strategy
→ 각 도메인: 개념 정의 + 관련 노드 + 가중치
```

---

## 6. 알려진 버그 & 기술 부채

### 🔴 즉시 수정 필요 (Critical)

| # | 위치 | 문제 | 영향도 |
|---|------|------|--------|
| 1 | `api/news.js` | ✅ **수정완료** HTML entity 노출 (stripHtml, cleanText, cleanBodyHtml) | High |
| 2 | `api/_ai-mentor.js:cognitiveReasoning()` | `entities.idea` circular reference 잠재적 버그 | Medium |
| 3 | `api/ai.js:handleAiMentor` | Rate Limiter가 Edge 메모리 기반 → 재시작시 초기화 | Medium |

### 🟡 단기 개선 필요 (High)

| # | 위치 | 문제 | 영향도 |
|---|------|------|--------|
| 4 | `api/ai.js` | handleAiMentor v5.1 — v5.2 기능(Cognitive Synthesis) 미통합 | Medium |
| 5 | `api/news.js` | 뉴스 수집 간헐적 실패 (RSS 타임아웃 미처리) | Medium |
| 6 | `src/pages/MessagesPage.jsx` | 실시간 채팅 Supabase Realtime 미완성 | High |
| 7 | `src/pages/IdeasPage.jsx` | 아이디어 수정/삭제 DB 연동 일부 미완 | Medium |
| 8 | 전체 | PWA 아이콘/manifest 미완성 | Low |

### 🟢 장기 개선 (Enhancement)

| # | 문제 | 영향도 |
|---|------|--------|
| 9 | Knowledge Graph 12개 → 50+개 확장 필요 | Medium |
| 10 | SEO 메타태그 전 페이지 미적용 | Medium |
| 11 | 팔로우/팔로잉 기능 미완성 | Low |
| 12 | ConnectPage 기업 연결 기능 확장 필요 | Medium |
| 13 | EduPage 실제 교육 콘텐츠 DB 연동 필요 | Medium |

---

## 7. 개발 계획 Phase 1~5

---

### Phase 1: 안정화 & 버그 수정 (1~2주)
> 목표: 서비스 신뢰성 확보, 기존 버그 완전 해결

#### P1-1. AI 엔진 v5.2 통합 (3일)
**파일:** `api/ai.js` (handleAiMentor 섹션), `api/_ai-mentor.js`

```
작업:
  1. _ai-mentor.js의 v5.2 함수 ai.js로 마이그레이션
     - cognitiveReasoning() circular reference 버그 수정
     - Context Reasoner v3 통합
     - Ethics Filter v2 통합
     - Streaming Engine v2 적용

  2. Rate Limiter Supabase DB 기반으로 교체
     - 테이블: rate_limit_log (ip, endpoint, count, window_start)
     - Edge 재시작 시에도 제한 유지

  3. _ai-mentor.js 파일 Dead code 정리 또는 주석 처리
```

**예상 공수:** 3일 | **우선순위:** 높음

#### P1-2. 뉴스 수집 안정화 (1일)
**파일:** `api/news.js` (handleFetchNews)

```
작업:
  1. RSS 개별 소스 타임아웃 8초 → 12초 (AbortSignal.timeout)
  2. 소스별 실패 시 다른 소스 계속 진행 (Promise.allSettled 완전 활용)
  3. 수집 성공/실패 카운트 상세 로깅
  4. 재시도 로직: 실패 소스 1회 재시도 추가
```

**예상 공수:** 1일 | **우선순위:** 높음

#### P1-3. MessagesPage 실시간 채팅 완성 (2일)
**파일:** `src/pages/MessagesPage.jsx`

```
현황: DB 쿼리 작동, 새 메시지 전송 구현됨
미완: Supabase Realtime 구독 → 실시간 수신

작업:
  1. useEffect에서 Realtime 채널 구독
     supabase.channel('messages:conv_id')
       .on('postgres_changes', { event:'INSERT', table:'messages' }, cb)
       .subscribe()
  2. 언마운트 시 채널 remove()
  3. 읽음 처리 (read_at timestamp 업데이트)
  4. 대화방 목록 실시간 업데이트 (마지막 메시지 프리뷰)
```

**예상 공수:** 2일 | **우선순위:** 높음

#### P1-4. IdeasPage DB 완전 연동 (1일)
**파일:** `src/pages/IdeasPage.jsx`

```
현황: 목록 조회, 좋아요 기능 구현됨
미완: 아이디어 수정/삭제, 댓글 실시간

작업:
  1. 아이디어 수정 모달 → PATCH /ideas/:id (본인만)
  2. 소프트 삭제 구현 (is_deleted 컬럼)
  3. 댓글 목록 → idea_comments 테이블 연동
  4. 조회수 increment (view_count++)
```

**예상 공수:** 1일 | **우선순위:** 중간

---

### Phase 2: 기능 완성 (2~3주)
> 목표: 미완성 기능 완전 구현, 사용자 경험 향상

#### P2-1. 팔로우/팔로잉 시스템 완성 (2일)
**파일:** `src/pages/ProfilePage.jsx`, `src/hooks/useData.js`

```
현황: user_follows 테이블 존재, UI 미구현

작업:
  1. 팔로우 버튼 → INSERT/DELETE user_follows
  2. 팔로워 수, 팔로잉 수 실시간 표시
  3. 팔로잉 사람의 새 아이디어/게시글 알림
  4. /profile/:id 에서 팔로워/팔로잉 목록 모달
```

**예상 공수:** 2일

#### P2-2. ConnectPage 기업 연결 강화 (2일)
**파일:** `src/pages/ConnectPage.jsx`

```
현황: 정적 UI + 기본 프로젝트 목록

작업:
  1. 지원 기능 완전 구현 (project_applications)
  2. 회사 필터링 (지역, 리모트, 분야)
  3. 지원 현황 대시보드 (내가 지원한 목록)
  4. 프로젝트 마감일 표시 및 마감 처리
```

**예상 공수:** 2일

#### P2-3. EduPage 콘텐츠 완성 (3일)
**파일:** `src/pages/EduPage.jsx`

```
현황: 정적 교육 카드 UI

작업:
  1. edu_content 테이블 신규 생성
     - title, body, category, difficulty, video_url, order_index
  2. 교육 콘텐츠 CRUD (관리자)
  3. 진행률 추적 (user_edu_progress 테이블)
  4. 커리큘럼 순서 완주 시 배지 부여 연동
```

**예상 공수:** 3일

#### P2-4. PWA 완성 (1일)
**파일:** `vite.config.js`, `public/`

```
작업:
  1. PWA 아이콘 생성 (16, 32, 72, 96, 128, 144, 152, 192, 384, 512px)
  2. manifest.json 완성 (name, theme_color, background_color, shortcuts)
  3. 오프라인 페이지 (offline.html)
  4. Workbox 캐싱 전략 설정 (NetworkFirst for API, CacheFirst for assets)
```

**예상 공수:** 1일

#### P2-5. SEO 전체 페이지 적용 (1일)
**파일:** 전체 pages/*.jsx

```
작업:
  1. 각 페이지 react-helmet-async 메타태그 표준화
     - title, description, og:title, og:description, og:image
  2. NewsDetailPage: 기사별 동적 OG 메타 (이미 일부 구현됨)
  3. ArticlePage: 아티클별 동적 OG
  4. ProfilePage: 프로필 OG (avatar, bio)
  5. sitemap-dynamic.js 개선 (news, articles, profiles 포함)
```

**예상 공수:** 1일

---

### Phase 3: AI 고도화 (3~4주)
> 목표: AI 엔진 v6.0 출시, Knowledge Graph 확장

#### P3-1. LUMI v6.0 AI 엔진 재설계 (5일)
**파일:** `api/ai.js` (새 LUMI 핸들러), `api/_ai-mentor.js`

```
v6.0 목표:
  ┌─ Intent Classification v4 ─────────────────────────────────┐
  │  BM25 + Semantic Similarity + Context Window               │
  │  의도 카테고리 확장: 12 → 25개 (재무, 법률, HR, 마케팅...)   │
  └────────────────────────────────────────────────────────────┘
  
  ┌─ Knowledge Graph v3 ───────────────────────────────────────┐
  │  도메인 노드: 12 → 50+개 확장                                │
  │  엣지 관계: 단순 연결 → 가중치 방향 그래프                   │
  │  동적 업데이트: mentor_learn Cron으로 실사용 데이터 반영     │
  └────────────────────────────────────────────────────────────┘
  
  ┌─ Multi-turn Context Engine v4 ─────────────────────────────┐
  │  대화 히스토리 최대 20턴 (현재: 10턴)                        │
  │  사용자 창업 프로필 기반 개인화 (school, startup_name)       │
  │  이전 대화 주제 연속성 추적                                  │
  └────────────────────────────────────────────────────────────┘
  
  ┌─ Cognitive Synthesis Engine v2 ────────────────────────────┐
  │  v5.2의 cognitiveReasoning() 통합 (버그 수정 후)            │
  │  다층 추론: 사실→원칙→적용→예측                             │
  └────────────────────────────────────────────────────────────┘
  
  ┌─ DB 기반 Rate Limiter ─────────────────────────────────────┐
  │  Edge 재시작 무관한 영구 Rate Limit                          │
  │  IP + userId 조합 제한                                      │
  └────────────────────────────────────────────────────────────┘

  circular reference 버그 수정:
    기존: cognitiveReasoning() 내 entities 선언 전 자기참조
    수정: entities를 함수 매개변수로 전달
```

**예상 공수:** 5일

#### P3-2. 뉴스 AI 파이프라인 v3 (3일)
**파일:** `api/news.js`

```
작업:
  1. 롱폼 생성 품질 향상
     - 제목 중복 섹션 제거 알고리즘 개선
     - 최소 롱폼 길이 1500자 보장
     - 이미지 없는 기사 OG 이미지 자동 생성 연동

  2. 다국어 처리 강화
     - 영문 기사 자동 번역 (한국어 요약)
     - 고유명사 보호 패턴 확장

  3. 뉴스 중복 감지 개선
     - 코사인 유사도 임계값 0.72 → 동적 조정
     - 24시간 내 동일 이벤트 클러스터링

  4. 추가 뉴스 소스 3개
     - techcrunch.com/kr RSS
     - startup.kr RSS
     - besuccess.com RSS
```

**예상 공수:** 3일

#### P3-3. 개인화 AI 추천 엔진 (4일)
**새 파일:** `api/_recommendation.js`

```
기능:
  1. 사용자 행동 로그 수집
     - user_behavior_log 테이블: (user_id, item_id, item_type, action)
  
  2. 콘텐츠 기반 필터링
     - 사용자 조회 아티클 → 태그 벡터 생성
     - 유사 콘텐츠 BM25 매칭

  3. 협업 필터링
     - 같은 학교/분야 사용자 행동 기반 추천

  4. 홈페이지 "당신을 위한 추천" 섹션
     - /api/recommendation?userId=xxx
     - TanStack Query staleTime: 30분
```

**예상 공수:** 4일

---

### Phase 4: 커뮤니티 & 소셜 강화 (2~3주)
> 목표: 커뮤니티 활성화, 소셜 네트워크 기능

#### P4-1. 알림 시스템 완성 (2일)
**파일:** `src/components/`, `api/admin.js`

```
작업:
  1. notifications 테이블 → Realtime 구독
  2. 헤더 알림 벨 UI (미읽 배지 카운트)
  3. 알림 드롭다운 (최근 10개)
  4. 알림 타입: 댓글, 좋아요, 팔로우, 배지 획득, 멘션
  5. 이메일 알림 선택 (newsletter_subscribers 연동)
```

**예상 공수:** 2일

#### P4-2. 커뮤니티 강화 (3일)
**파일:** `src/pages/CommunityPage.jsx`, `src/pages/PostDetailPage.jsx`

```
작업:
  1. 무한 스크롤 (Intersection Observer)
  2. 게시글 검색 (pg_trgm 인덱스 활용)
  3. 멘션 기능 (@username → 알림)
  4. 이미지 첨부 (Supabase Storage)
  5. 게시글 임시저장 (localStorage)
  6. 인기 태그 사이드바
```

**예상 공수:** 3일

#### P4-3. 프로필 강화 (2일)
**파일:** `src/pages/ProfilePage.jsx`

```
작업:
  1. 팔로우/팔로잉 기능 완성 (P2-1)
  2. 창업 이력 타임라인 (timeline 컴포넌트)
  3. 스킬 배지 갤러리
  4. 포트폴리오 링크 (GitHub, LinkedIn, 개인사이트)
  5. 활동 히트맵 (GitHub 스타일)
```

**예상 공수:** 2일

---

### Phase 5: 성능 & 인프라 최적화 (2주)
> 목표: 로딩 성능 50% 향상, DB 쿼리 최적화

#### P5-1. 프론트엔드 성능 최적화 (2일)

```
작업:
  1. React.memo, useCallback, useMemo 적용
     - ArticleCard, NewsCard (리스트 아이템 컴포넌트)
  2. 이미지 최적화
     - WebP 변환 + srcset 다중 해상도
     - Lazy loading (IntersectionObserver)
  3. 코드 스플리팅 강화
     - AdminPage (현재 3877줄) → 섹션별 lazy 분리
  4. 번들 크기 분석 (vite-bundle-analyzer)
     - 미사용 Lucide 아이콘 tree-shaking 확인
```

**예상 공수:** 2일

#### P5-2. DB 쿼리 최적화 (2일)

```
작업:
  1. N+1 쿼리 제거
     - ProfilePage: profiles + articles + ideas 각각 → 단일 JOIN 쿼리
  2. 복합 인덱스 추가
     - news: (status, published_at, category) 복합 인덱스
     - community_posts: (is_deleted, is_pinned, created_at)
  3. Supabase RPC 함수화
     - 복잡한 통계 쿼리 → PostgreSQL 함수
  4. Edge Cache 헤더 최적화
     - news 목록: Cache-Control: max-age=300
     - trend_snapshots: max-age=3600
```

**예상 공수:** 2일

#### P5-3. 모니터링 & 에러 추적 (1일)

```
작업:
  1. API 에러 중앙화
     - 모든 API 핸들러 try-catch → audit_logs 테이블 기록
  2. 프론트엔드 에러 수집
     - ErrorBoundary → /api/debug 에러 리포팅
  3. Cron 실행 결과 모니터링
     - ai_operations_log 테이블 Cron 결과 기록
  4. 성능 지표 대시보드 (AdminPage)
     - p95 응답시간, 에러율, Cron 성공률
```

**예상 공수:** 1일

---

## 8. 우선순위 매트릭스

```
임팩트 높음 / 공수 낮음 (즉시 실행):
  ★ P1-3  MessagesPage 실시간 채팅 (2일)
  ★ P1-4  IdeasPage DB 완전 연동 (1일)
  ★ P2-5  SEO 전체 적용 (1일)
  ★ P2-4  PWA 완성 (1일)

임팩트 높음 / 공수 높음 (계획적 실행):
  ◆ P3-1  LUMI v6.0 AI 엔진 (5일)
  ◆ P1-1  AI v5.2 통합 (3일)
  ◆ P4-2  커뮤니티 강화 (3일)
  ◆ P3-3  개인화 추천 엔진 (4일)

임팩트 중간 / 공수 낮음 (기회 있을 때):
  ◇ P1-2  뉴스 수집 안정화 (1일)
  ◇ P2-1  팔로우/팔로잉 (2일)
  ◇ P4-1  알림 시스템 (2일)

임팩트 중간 / 공수 높음 (장기 계획):
  △ P3-2  뉴스 AI v3 (3일)
  △ P2-2  ConnectPage 강화 (2일)
  △ P2-3  EduPage 콘텐츠 (3일)
  △ P5-1  프론트 성능 최적화 (2일)
  △ P5-2  DB 쿼리 최적화 (2일)
```

### 전체 로드맵 타임라인

```
Week 1-2   [Phase 1] 안정화
  ├── P1-1: AI v5.2 통합 + Rate Limiter DB 교체
  ├── P1-2: 뉴스 수집 안정화
  ├── P1-3: Messages 실시간 채팅
  └── P1-4: IdeasPage 완전 연동

Week 3-5   [Phase 2] 기능 완성
  ├── P2-1: 팔로우/팔로잉
  ├── P2-2: ConnectPage 강화
  ├── P2-3: EduPage 콘텐츠
  ├── P2-4: PWA 완성
  └── P2-5: SEO 전 페이지

Week 6-9   [Phase 3] AI 고도화
  ├── P3-1: LUMI v6.0
  ├── P3-2: 뉴스 AI v3
  └── P3-3: 개인화 추천 엔진

Week 10-12 [Phase 4] 커뮤니티
  ├── P4-1: 알림 시스템
  ├── P4-2: 커뮤니티 강화
  └── P4-3: 프로필 강화

Week 13-14 [Phase 5] 최적화
  ├── P5-1: 프론트 성능
  ├── P5-2: DB 쿼리
  └── P5-3: 모니터링

총 예상 기간: 14주 (3.5개월)
총 예상 공수: 약 55~65일
```

---

## 부록: 수정 이력

| 날짜 | 파일 | 내용 |
|------|------|------|
| 2026-06-08 | `api/news.js` | HTML entity 노출 버그 수정 (stripHtml, cleanText×3, cleanBodyHtml) |

---

*문서 최종 업데이트: 2026-06-08*
*다음 업데이트 예정: Phase 1 완료 후*
