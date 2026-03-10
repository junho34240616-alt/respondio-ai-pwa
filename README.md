# Respondio - AI 배달 리뷰 자동답변 SaaS

## Project Overview
- **Name**: Respondio
- **Goal**: 배달 플랫폼(배민/쿠팡이츠/요기요) 리뷰를 AI로 자동 관리하는 SaaS
- **Tech Stack**: Hono + TypeScript + Cloudflare Pages + Playwright + Tailwind CSS

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
| `/billing` | 구독/결제 (요금제 비교, 결제 내역, 결제 수단) |
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
| `/reviews` | GET | 리뷰 목록 (필터: status, platform, sentiment) |
| `/reviews/:id/generate` | POST | AI 답변 생성 (GPT/템플릿) |
| `/reviews/:id/analyze` | POST | 감정 분석 |
| `/reviews/batch-generate` | POST | 미답변 리뷰 일괄 AI 생성 |
| `/reviews/batch-analyze` | POST | 일괄 감정 분석 |
| `/reviews/approve` | POST | 답변 승인 |
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
1. **GenSpark LLM Proxy API 키 만료** - API Keys 탭에서 키 갱신 후 Inject 필요. 갱신 전까지 template_fallback으로 동작
2. **크롤링 데모 모드** - 현재 데모 데이터로 시뮬레이션. 실제 플랫폼 크리덴셜 입력 시 실제 크롤링 가능
3. **PWA** - manifest.json, service worker 구성 완료. HTTPS 환경에서 설치 가능

## 서버 실행
```bash
# 웹앱 (port 3000)
cd /home/user/webapp && npm run build && pm2 start ecosystem.config.cjs

# 크롤러 (port 4000)
pm2 start crawler/ecosystem.config.cjs

# 상태 확인
pm2 list
```

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: Sandbox에서 실행 중
- **Last Updated**: 2026-03-10
