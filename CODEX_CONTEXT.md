# Respondio - Codex 협업 컨텍스트 (2026-03-10)

## 프로젝트 한줄 요약
**배달 리뷰 AI 자동답변 SaaS** (배민/쿠팡이츠/요기요 → GPT 답변 생성 → 승인 → 자동 게시)

---

## 기술 스택
| 구분 | 기술 |
|------|------|
| 웹앱 프레임워크 | Hono 4 + TypeScript |
| 배포 타겟 | Cloudflare Pages (Workers runtime) |
| 빌드 | Vite 6 + @hono/vite-build |
| DB | Cloudflare D1 (SQLite, `--local` 모드) |
| AI | GPT-5-mini via GenSpark LLM Proxy |
| 크롤러 | Node.js + Playwright + Express (port 4000) |
| 프론트엔드 | Tailwind CSS (CDN) + Chart.js + FontAwesome |
| PM2 | 프로세스 매니저 (respondio:3000, respondio-crawler:4000) |
| PWA | manifest.json + service worker |

## 디렉토리 구조
```
/home/user/webapp/
├── src/
│   ├── index.tsx          # 메인 앱 + 전체 프론트엔드 HTML (1530줄)
│   ├── routes/api.ts      # REST API 엔드포인트 (632줄)
│   └── services/ai.ts     # GPT 호출, 감정분석, 품질점수 (316줄)
├── crawler/
│   ├── index.js           # Playwright 크롤링 서버 (626줄)
│   ├── ecosystem.config.cjs
│   └── package.json
├── migrations/
│   └── 0001_initial_schema.sql  # 14 테이블
├── public/
│   ├── static/            # CSS, 아이콘
│   └── sw.js              # Service Worker
├── seed.sql               # 테스트 데이터
├── .dev.vars              # OPENAI_API_KEY, OPENAI_BASE_URL
├── ecosystem.config.cjs   # PM2: wrangler pages dev (port 3000)
├── wrangler.jsonc         # D1 binding: DB → respondio-production
├── vite.config.ts
└── package.json
```

## 핵심 아키텍처 결정사항

### 프론트엔드: 전부 src/index.tsx에 인라인 HTML
- SSR이 아니라 `c.html()` 호출로 HTML 문자열 반환
- 페이지별 함수: `landingPage()`, `loginPage()`, `dashboardPage()`, `reviewsPage()`, `customersPage()`, `billingPage()`, `settingsPage()`, `adminDashboardPage()`
- Chart.js/Tailwind는 CDN으로 로드, API 호출은 fetch로 직접

### 백엔드: Hono + D1
- Bindings: `{ DB: D1Database, OPENAI_API_KEY: string, OPENAI_BASE_URL: string }`
- API base: `/api/v1`
- D1 로컬 모드: `wrangler pages dev dist --d1=respondio-production --local`

### AI 서비스 (src/services/ai.ts)
- `callGPT()`: fetch로 직접 호출 (model: gpt-5-mini, max_completion_tokens: 1000)
- `generateReply()`: 프롬프트 엔지니어링 → 답변 생성 → 품질 점수 평가
- `analyzeSentiment()`: JSON 포맷으로 감정 분석 응답 파싱
- API 실패시 `template_fallback`으로 자동 전환
- Base URL: `https://www.genspark.ai/api/llm_proxy/v1`

### 크롤러 서버 (crawler/index.js)
- Express on port 4000
- 데모 모드: 실제 로그인 없이 시뮬레이션 리뷰 생성
- 실제 모드: Playwright로 플랫폼 로그인 → 리뷰 수집 → 답변 게시
- 웹앱과 통신: `POST /api/v1/reviews/sync` → crawler → DB 저장

## DB 스키마 (14 테이블)
`users` → `stores` → `store_platform_connections`
`reviews` → `reply_candidates` → `replies`
`customers`, `banned_words`
`plans` → `subscriptions` → `payments`, `payment_methods`
`dashboard_daily_summaries`, `job_logs`

## 페이지 라우팅
| 경로 | 역할 | 설명 |
|------|------|------|
| `/` | 공개 | 랜딩 (기능/요금제/FAQ) |
| `/login` | 공개 | 로그인/가입 (사장님 & 관리자 퀵로그인) |
| `/dashboard` | 사장님 | KPI 6개, 최근리뷰, 메뉴차트, 충성고객, 트렌드 |
| `/reviews` | 사장님 | 필터/리스트/AI승인패널, 리뷰수집/일괄생성/전체승인 |
| `/customers` | 사장님 | 고객분석 테이블 |
| `/billing` | 사장님 | 요금제비교, 결제내역, 결제수단 |
| `/settings` | 사장님 | 매장정보, 답변스타일, 자동응답 토글 |
| `/admin` | 관리자 | 다크테마, KPI, 에러로그, 에러차트, 큐상태, DLQ, 사용자관리, 크롤러상태 |

## API 엔드포인트 요약
**Auth**: POST `/auth/login`, `/auth/signup`
**Reviews**: GET `/reviews`, POST `/reviews/:id/generate`, `/reviews/:id/analyze`, `/reviews/batch-generate`, `/reviews/batch-analyze`, `/reviews/approve`, PATCH `/reviews/:id/reply`, POST `/reviews/sync`
**Dashboard**: GET `/dashboard/summary`, `/dashboard/menus`, `/dashboard/repeat_customers`, `/dashboard/daily_trend`
**Plans/Billing**: GET `/plans`, `/subscriptions`, `/payments`, `/payment_methods`, `/platform_connections`
**Crawler**: GET `/crawler/status`, POST `/crawler/reviews`
**Admin**: GET `/admin/users`, `/admin/logs`, `/admin/stats`, POST `/admin/jobs/:id/retry`

## 테스트 계정
- 사장님: `owner@test.com` / `password` → `/dashboard`
- 관리자: `admin@respondio.com` / `admin123` → `/admin`

## 현재 작동 상태 (전부 ✅)
- [x] GPT-5-mini 실제 답변 생성 (API 키 정상)
- [x] 감정 분석 + 품질 점수 + 사장님 말투 학습
- [x] 리뷰당 최대 3회 재생성, 금칙어 필터링
- [x] 크롤러 서버 데모 모드 (3개 플랫폼)
- [x] 크롤러 ↔ 웹앱 DB 연동
- [x] 관리자 대시보드 (실시간 API 데이터)
- [x] PWA 설정 완료

## 남은 과제 / 개선 포인트
1. **프론트엔드 분리**: index.tsx 1530줄 → 별도 HTML 파일 또는 React/Svelte로 분리
2. **인증 강화**: 현재 데모용 간단 로그인 → JWT 토큰 인증 구현
3. **실제 크롤링**: 배달 플랫폼 실제 계정 연동 (데모→실제 모드 전환)
4. **PortOne 결제 연동**: 설계서에 명시된 결제 시스템
5. **Cloudflare 프로덕션 배포**: D1 실제 DB 생성 + wrangler pages deploy
6. **자동 스케줄링**: 크롤러 자동 동기화 (현재 수동/API 트리거)
7. **테스트 코드**: 유닛/E2E 테스트 없음
8. **에러 핸들링**: 전역 에러 미들웨어 보강

## 실행 명령어
```bash
# 빌드 + 실행
cd /home/user/webapp && npm run build
pm2 start ecosystem.config.cjs          # 웹앱 :3000
pm2 start crawler/ecosystem.config.cjs  # 크롤러 :4000

# DB 리셋
rm -rf .wrangler/state/v3/d1
npx wrangler d1 migrations apply respondio-production --local
npx wrangler d1 execute respondio-production --local --file=./seed.sql

# 로그 확인
pm2 logs --nostream
```

## Git 히스토리
```
ec9a8be fix: GPT API max_completion_tokens 적용
c86b32d docs: README 업데이트
37f9356 feat: 크롤링 서버 + 관리자 대시보드 개선
439ab74 feat: GPT AI 연동
c3115a2 docs: README.md 추가
9b81f14 feat: 초기 구현 (전체 UI + API + DB)
```
