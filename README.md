# Respondio - AI 배달 리뷰 자동답변 SaaS

## 프로젝트 개요
- **이름**: Respondio
- **목표**: 배달 음식점 사장님을 위한 AI 기반 리뷰 자동답변 및 관리 SaaS
- **대상**: 배달의민족 / 쿠팡이츠 / 요기요 운영 매장 사장님
- **아키텍처**: Hono + Cloudflare Pages + D1 (SQLite) + PWA

## 접속 URL
- **개발 서버**: http://localhost:3000
- **랜딩 페이지**: /
- **로그인**: /login
- **대시보드**: /dashboard
- **리뷰 관리**: /reviews
- **고객 분석**: /customers
- **구독/결제**: /billing
- **설정**: /settings
- **관리자 대시보드**: /admin

## 구현 완료 기능

### 사용자 (사장님) 페이지
1. **랜딩 페이지** - 서비스 소개, 기능 설명, 워크플로우, 요금제, 후기, FAQ
2. **로그인/회원가입** - 이메일 기반 인증 (데모 계정: owner@test.com)
3. **메인 대시보드** - 6개 KPI 카드, 최근 리뷰, 메뉴 평판 바 차트, 플랫폼 연결 상태, 충성 고객 인사이트, 리뷰 트렌드 라인 차트
4. **리뷰 관리** - 3컬럼 레이아웃 (필터 | 리뷰 리스트 | AI 답변 승인), 플랫폼/평점/감정별 필터, 탭별 상태 필터, AI 답변 승인/수정/재생성
5. **고객 분석** - 총 고객 수, 단골 고객, 재방문율 통계, 고객 테이블
6. **구독/결제** - 요금제 비교 테이블, 현재 요금제, 결제 내역, 결제 수단, 구독 해지
7. **설정** - 매장 정보, 답변 스타일, 자동 응답 설정

### 관리자 페이지
1. **관리자 대시보드** (다크 테마) - 전체 가입자/활성 구독자/에러율 KPI, 에러 로그 테이블, 에러율 라인 차트, 작업 큐 상태 바, DLQ 상태

### 백엔드 API
- `POST /api/v1/auth/login` - 로그인
- `POST /api/v1/auth/signup` - 회원가입
- `GET /api/v1/reviews` - 리뷰 목록 (필터 지원)
- `POST /api/v1/reviews/:id/generate` - AI 답변 생성
- `POST /api/v1/reviews/approve` - 답변 일괄 승인
- `GET /api/v1/dashboard/summary` - 대시보드 통계
- `GET /api/v1/dashboard/menus` - 메뉴별 분석
- `GET /api/v1/dashboard/repeat_customers` - 충성 고객 목록
- `GET /api/v1/dashboard/daily_trend` - 일별 트렌드
- `GET /api/v1/plans` - 요금제 목록
- `GET /api/v1/subscriptions` - 구독 정보
- `GET /api/v1/payments` - 결제 내역
- `GET /api/v1/platform_connections` - 플랫폼 연결 상태
- `GET /api/v1/admin/users` - 관리자 사용자 관리
- `GET /api/v1/admin/logs` - 관리자 로그
- `GET /api/v1/admin/stats` - 관리자 통계
- `POST /api/v1/admin/jobs/:id/retry` - 작업 재시도

### PWA
- manifest.json, Service Worker, 오프라인 캐싱

## 데이터 모델
- users, stores, store_platform_connections
- reviews, reply_candidates, replies
- customers, banned_words
- plans, subscriptions, payments, payment_methods
- dashboard_daily_summaries, job_logs

## 기술 스택
- **Backend**: Hono 4 on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Tailwind CSS (CDN), Chart.js, Font Awesome
- **PWA**: manifest.json + Service Worker
- **Build**: Vite

## 미구현 / 향후 개발
- [ ] 실제 AI (GPT) 연동 - 현재 템플릿 기반 답변
- [ ] 실제 배달 플랫폼 크롤링/연동
- [ ] PortOne 결제 연동
- [ ] JWT 기반 실제 인증
- [ ] 비동기 Worker (sync/ai/post) 
- [ ] 이메일 알림
- [ ] 금칙어 관리 UI
- [ ] 관리자 사용자/플랜 관리 상세 UI

## 배포
- **Platform**: Cloudflare Pages
- **Tech Stack**: Hono + TypeScript + TailwindCSS + Chart.js + D1
- **Last Updated**: 2026-03-10
