# Respondio - AI 배달 리뷰 자동답변 SaaS

## Project Overview
- **Name**: Respondio
- **Goal**: 배달 플랫폼(배민/쿠팡이츠/요기요) 리뷰를 AI로 자동 관리하는 SaaS
- **Tech Stack**: Hono + TypeScript + Cloudflare Pages + Playwright + Tailwind CSS

## Current Architecture Direction
- **메인 웹앱/API는 Hono + D1 + Cloudflare Pages/Workers 유지**
- **크롤러는 Node.js + Playwright 별도 프로세스로 유지**
- **플랫폼 연결 방향은 `서버 자동 로그인`에서 `사용자 직접 로그인 세션`으로 전환 중**
- **최종 목표는 모바일 앱/WebView에서 직접 로그인하고, 로그인된 동안만 리뷰 수집/답변 등록**
- **Next.js + Redis + R2 + worker 분리는 장기 확장안**이며, 즉시 마이그레이션 대상이 아님
- **젠스파크 AI개발자 배포 기준으로는 현재 구조를 고도화하는 편이 더 안전**

## URLs
- **웹앱**: https://3000-ir517r00gc4sr4252u90m-82b888ba.sandbox.novita.ai
- **크롤러 API**: https://4000-ir517r00gc4sr4252u90m-82b888ba.sandbox.novita.ai

## 완료된 기능

### 사용자 (사장님) 페이지
| 경로 | 설명 |
|------|------|
| `/` | 랜딩 페이지 (기능 소개, 요금제, FAQ) |
| `/login` | 로그인/회원가입 (사장님/관리자 빠른 로그인) |
| `/dashboard` | 메인 대시보드 (KPI 6개, 최근 리뷰, 메뉴 평판 차트, 충성 고객, 트렌드) |
| `/reviews` | 리뷰 관리 (필터, AI 답변 생성/승인, 리뷰 수집) |
| `/customers` | 고객 분석 (단골/재방문 고객 목록) |
| `/billing` | 무료 베타 운영 안내 / 추후 구독·결제 전환 화면 |
| `/settings` | 설정 (매장 정보, 답변 스타일, 자동 응답) |

### 관리자 페이지
| 경로 | 설명 |
|------|------|
| `/admin` | 운영 대시보드 (KPI, 에러 로그, 에러율 차트, 작업 큐, DLQ, 사용자 관리, 크롤러 상태) |

### 접속 방법
- **사장님**: `/login` → 사장님 로그인 버튼 (owner@test.com / password)
- **관리자**: `/login` → 관리자 로그인 버튼 (admin@respondio.com / admin123)

### 백엔드 API (base: /api/v1)
| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/auth/login` | POST | 로그인 |
| `/auth/signup` | POST | 회원가입 |
| `/auth/refresh` | POST | refresh token으로 access token 재발급 |
| `/auth/logout` | POST | 로그아웃 및 세션 폐기 |
| `/auth/me` | GET | 현재 로그인 사용자 조회 |
| `/health/public` | GET | 공개 상태 점검 (DB / crawler / billing mode) |
| `/reviews` | GET | 리뷰 목록 (필터: status, platform, sentiment) |
| `/reviews/:id/generate` | POST | AI 답변 생성 (GPT/템플릿) |
| `/reviews/:id/analyze` | POST | 감정 분석 |
| `/reviews/batch-generate` | POST | 미답변 리뷰 일괄 AI 생성 |
| `/reviews/batch-analyze` | POST | 일괄 감정 분석 |
| `/reviews/approve` | POST | 답변 승인 |
| `/reviews/:id/post` | POST | 승인된 답변 수동 등록 |
| `/reviews/:id/reply` | PATCH | 답변 수정 |
| `/reviews/sync` | POST | 크롤러를 통한 리뷰 수집 |
| `/dashboard/summary` | GET | 대시보드 KPI |
| `/dashboard/menus` | GET | 메뉴 평판 분석 |
| `/dashboard/repeat_customers` | GET | 재방문/단골 고객 |
| `/dashboard/daily_trend` | GET | 7일 리뷰 트렌드 |
| `/plans` | GET | 요금제 목록 |
| `/subscriptions` | GET | 현재 구독 정보 |
| `/payments` | GET | 결제 내역 |
| `/crawler/status` | GET | 크롤러 서버 상태 |
| `/crawler/reviews` | POST | 크롤러에서 수집한 리뷰 DB 저장 |
| `/admin/users` | GET | 사용자 관리 |
| `/admin/logs` | GET | 작업 로그 |
| `/admin/stats` | GET | 관리자 통계 |
| `/admin/jobs/:id/retry` | POST | 실패 작업 재시도 |

### 크롤링 서버 API (port 4000)
| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/health` | GET | 서버 상태 |
| `/platforms` | GET | 지원 플랫폼 목록 |
| `/sessions` | GET | 세션 상태 |
| `/login` | POST | 플랫폼 로그인 |
| `/fetch-reviews` | POST | 리뷰 수집 (단일 플랫폼) |
| `/fetch-all` | POST | 전체 플랫폼 리뷰 수집 |
| `/post-reply` | POST | 답변 게시 |
| `/sync-to-webapp` | POST | 수집 + DB 동기화 |
| `/auto-sync/start` | POST | 자동 동기화 시작 |
| `/auto-sync/stop` | POST | 자동 동기화 중지 |
| `/jobs` | GET | 작업 이력 |

## 데이터 아키텍처
- **Database**: Cloudflare D1 (SQLite)
- **테이블**: users, stores, store_platform_connections, reviews, reply_candidates, replies, customers, banned_words, plans, subscriptions, payments, payment_methods, dashboard_daily_summaries, job_logs

## AI 기능
- GPT 기반 리뷰 답변 생성 (gpt-5-mini via GenSpark LLM Proxy)
- 감정 분석 (positive/neutral/negative)
- 품질 점수 산정 (1.0~10.0, 5가지 기준)
- 사장님 말투 학습 (reply_tone_sample)
- 4가지 답변 스타일 (친근/정중/캐주얼/커스텀)
- 고객 유형별 맞춤 답변 (신규/재방문/단골)
- 금칙어 필터링
- 리뷰당 최대 3회 재생성
- API 오류 시 템플릿 폴백

## 현재 제한사항
1. **JWT access token + refresh token/httpOnly cookie는 구현됨** - 다만 기기별 세션 관리/강제 로그아웃 UI는 아직 없음
2. **API 스코프는 사용자/매장 기준으로 정리됨** - 일부 UI 문구와 시드 데이터는 여전히 데모 전제
3. **플랫폼 연결 구조 전환 중** - 현재는 `credentials`와 `direct_session` 두 모드를 동시에 이해하지만, 모바일 직접 로그인 앱/WebView는 아직 구현 전
4. **크롤러 URL은 설정 가능** - 프로덕션에서는 `CRAWLER_API_BASE`, `CRAWLER_SHARED_SECRET`, `CREDENTIALS_ENCRYPTION_KEY` 배선이 필요
5. **PortOne 결제는 선택 기능** - 지금은 `PORTONE_*` 값 없이도 무료 베타 모드로 배포 가능하며, 결제 화면은 베타 안내로 동작
6. **테스트는 확장됨** - auth/API 스모크와 로컬 Cloudflare+Crawler 브라우저 E2E(`npm run test:e2e`)가 추가됨
7. **PWA는 부분 구현** - 서비스워커 등록은 추가됐지만 설치/오프라인 동작 검증은 아직 필요

## Direct Session Roadmap
- 세부 설계 문서: [docs/MOBILE_DIRECT_LOGIN_ARCHITECTURE.md](/Users/junho/Documents/Respondio%20/docs/MOBILE_DIRECT_LOGIN_ARCHITECTURE.md)
- 현재 추가된 토대:
  - 플랫폼 연결에 `auth_mode`, `session_status`, `session_connected_at`, `session_last_validated_at` 저장
  - 크롤러 세션을 `platform + store_id` 단위로 분리
  - 리뷰 수집 시 `direct_session` 모드면 서버 재로그인 대신 활성 세션을 우선 확인
- 아직 남은 핵심 작업:
  - 모바일 앱/WebView 로그인 UX
  - 세션 연결/만료/재로그인 흐름
  - 레거시 이메일+비밀번호 연결 제거

## Required Environment Variables
- **Cloudflare Pages / Workers secrets**: `OPENAI_API_KEY`, `JWT_SECRET`, `CRAWLER_SHARED_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`
- **Cloudflare Pages / Workers vars**: `OPENAI_BASE_URL`, `CRAWLER_API_BASE`, `APP_BASE_URL`
- **선택 결제값**: `PORTONE_STORE_ID`, `PORTONE_CHANNEL_KEY`, `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET`
- **Crawler server vars**: `WEBAPP_API`, `CRAWLER_SHARED_SECRET`, `CRAWLER_PORT`, `CRAWLER_TEST_MODE`

## 서버 실행
```bash
# 웹앱 (port 3000)
cd /Users/junho/Documents/Respondio && npm run build && pm2 start ecosystem.config.cjs

# 크롤러 (port 4000)
pm2 start crawler/ecosystem.config.cjs

# 상태 확인
pm2 list
```

## 테스트
```bash
# auth + API smoke
npm test

# production readiness
npm run doctor:prod

# 로컬 Cloudflare Pages + D1 + crawler + browser E2E
npm run test:e2e
```

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: Sandbox에서 실행 중
- **Last Updated**: 2026-03-11

### Recommended Deployment Split
- **웹앱/API**: Cloudflare Pages + Workers + D1
- **크롤러**: 별도 Node.js 서버(Render/VPS/PM2 등)
- **추후 필요 시 추가**: R2 for failure artifacts, Redis for queueing
- **Render 배포 파일 포함**: `render.yaml`, `crawler/Dockerfile`

### Production Deploy Note
- **로컬 smoke는 통과**: `wrangler pages dev` + D1 migration/seed + crawler 운영 경로 + browser E2E 확인
- **원격 배포는 현재 보류**: 이 환경에서 `wrangler whoami` 결과가 `You are not authenticated. Please run wrangler login.` 이므로 실제 Cloudflare 배포는 인증 후 진행 가능
- **사용자 가이드북**: [docs/PRODUCTION_SETUP_GUIDE.md](/Users/junho/Documents/Respondio%20/docs/PRODUCTION_SETUP_GUIDE.md)
