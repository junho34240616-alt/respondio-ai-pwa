# Respondio - Codex 협업 컨텍스트 (2026-03-11)

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
/Users/junho/Documents/Respondio/
├── src/
│   ├── index.tsx          # 메인 앱 + 전체 프론트엔드 HTML (1530줄)
│   ├── routes/api.ts      # REST API 엔드포인트 (632줄)
│   └── services/ai.ts     # GPT 호출, 감정분석, 품질점수 (316줄)
├── crawler/
│   ├── index.js           # Playwright 크롤링 서버 (626줄)
│   ├── ecosystem.config.cjs
│   └── package.json
├── migrations/
│   ├── 0001_initial_schema.sql  # 초기 14 테이블
│   └── 0002_auth_sessions.sql   # refresh token 세션 테이블
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

### 배포 기준 아키텍처 방향 (확정)
- **젠스파크 AI개발자 배포 기준 기본 방향은 유지보수보다 "배포 성공률" 우선**
- **메인 웹앱/API는 현재 구조인 Hono + D1 + Cloudflare Pages/Workers를 유지하며 고도화**
- **크롤러는 Node.js + Playwright 외부 프로세스로 유지**하고, 웹앱과 HTTP API로 통신
- **상세 설계서의 Next.js + Redis + R2 + worker 분리 구조는 장기 확장안**으로 보관하고, 지금 당장 전체 마이그레이션은 하지 않음
- **Redis/R2/worker 세분화는 실제 병목 또는 운영 요구가 확인된 뒤 단계적으로 도입**

### 단계적 확장 원칙
- **지금 바로 도입하지 않는 것**: Next.js 전면 전환, Redis 큐, AI worker/post worker 분리, R2 screenshot 저장
- **조만간 도입 가능한 것**: JWT 인증, 실사용 크롤러 연동, PortOne 일반결제, Cloudflare 프로덕션 배포
- **도입 시점 조건**:
  - Redis: 동기화/생성/등록 작업이 눈에 띄게 쌓일 때
  - R2: 실패 스크린샷/HTML dump 보관이 필요해질 때
  - worker 분리: crawler 외 작업까지 비동기 처리량이 커질 때
  - Next.js 전환: UI 복잡도와 컴포넌트 재사용 요구가 현재 인라인 HTML 구조를 넘을 때

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
- 웹앱과 통신: crawler API 호출 후 웹앱 DB 저장

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
| `/billing` | 사장님 | 무료 베타 운영 안내 / 추후 구독·결제 화면 |
| `/settings` | 사장님 | 매장정보, 답변스타일, 자동응답 토글 |
| `/admin` | 관리자 | 다크테마, KPI, 에러로그, 에러차트, 큐상태, DLQ, 사용자관리, 크롤러상태 |

## API 엔드포인트 요약
**Auth**: POST `/auth/login`, `/auth/signup`, `/auth/refresh`, `/auth/logout`, GET `/auth/me`
**Reviews**: GET `/reviews`, POST `/reviews/:id/generate`, `/reviews/:id/analyze`, `/reviews/batch-generate`, `/reviews/batch-analyze`, `/reviews/approve`, POST `/reviews/:id/post`, PATCH `/reviews/:id/reply`, POST `/reviews/sync`
**Dashboard**: GET `/dashboard/summary`, `/dashboard/menus`, `/dashboard/repeat_customers`, `/dashboard/daily_trend`
**Plans/Billing**: GET `/plans`, `/subscriptions`, `/payments`, `/payment_methods`, `/platform_connections`
**Crawler**: GET `/crawler/status`, POST `/crawler/reviews`
**Admin**: GET `/admin/users`, `/admin/logs`, `/admin/stats`, POST `/admin/jobs/:id/retry`

## 테스트 계정
- 사장님: `owner@test.com` / `password` → `/dashboard`
- 관리자: `admin@respondio.com` / `admin123` → `/admin`

## 현재 구현 상태 (프로토타입)
- [x] 리뷰 조회/필터, AI 답변 생성, 감정 분석, 품질 점수 계산
- [x] 데모 크롤러를 통한 리뷰 수집/DB 저장
- [x] 관리자 대시보드용 기본 통계/로그 조회 API
- [x] Cloudflare Pages + D1 기준 개발용 구조
- [x] JWT access token 기반 API 인증 + 관리자 API 보호
- [x] refresh token + httpOnly cookie + 401 자동 세션 갱신 + 초기 진입 시 세션 복구
- [x] 사용자/매장 기준 API 스코프 분리
- [x] 승인 후 `approved`/`posted` 분리 + 실제 등록 시도
- [x] 크롤러-웹앱 shared secret 연동
- [x] auth 유틸 기본 스모크 테스트
- [x] PortOne 결제 준비/승인/웹훅/API 기본 경로
- [x] PortOne 미설정 시 무료 베타 모드 UI 전환
- [x] 플랫폼 계정 연결 UI + 자격증명 암호화 저장
- [x] 로컬 Cloudflare + crawler + browser E2E smoke
- [ ] 기기별 세션 관리 / 강제 로그아웃 UI
- [ ] PortOne 실결제 검증 및 운영 시크릿 배선
- [ ] 서비스워커 등록을 포함한 PWA 완성

## 구현상 주의사항
- 로그인/회원가입은 실제 API 인증이며 refresh token/httpOnly cookie와 초기 세션 복구도 들어갔지만, 기기별 세션 관리 UI는 아직 없음
- 크롤러 URL은 설정 가능하고 shared secret도 연동됐지만 프로덕션 환경변수/시크릿 배선은 아직 필요
- 플랫폼 자격증명은 `CREDENTIALS_ENCRYPTION_KEY` 기반으로 암호화 저장되며, 로컬 운영 경로 E2E는 `CRAWLER_TEST_MODE=1`로 검증 가능
- 일부 UI 문구/시드 데이터는 여전히 데모 전제이며, 실제 운영 흐름과 완전히 동기화되어 있지 않음
- PortOne 결제 UI/API/웹훅 기본 경로는 추가됐지만, 값이 비어 있으면 앱은 무료 베타 모드로 동작하도록 정리됨

## 필수 환경변수
- **Cloudflare Pages / Workers secrets**: `OPENAI_API_KEY`, `JWT_SECRET`, `CRAWLER_SHARED_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`
- **Cloudflare Pages / Workers vars**: `OPENAI_BASE_URL`, `CRAWLER_API_BASE`, `APP_BASE_URL`
- **선택 결제값**: `PORTONE_STORE_ID`, `PORTONE_CHANNEL_KEY`, `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET`
- **Crawler server vars**: `WEBAPP_API`, `CRAWLER_SHARED_SECRET`, `CRAWLER_PORT`, `CRAWLER_TEST_MODE`

## 남은 과제 / 개선 포인트 (우선순위 재정렬)
1. **Cloudflare 프로덕션 배포 정리**: D1 실제 DB, 시크릿, 환경별 crawler URL, 배포 스모크체크
2. **세션 보강**: refresh token / httpOnly cookie / 자동 로그아웃 및 만료 처리 UX
3. **실제 크롤링 전환**: 데모/실모드 분리 유지, 플랫폼 연결 UX, 외부 크롤러 배포 환경 정리
4. **입력 검증/에러 포맷/보안 보강**: request validation, 공통 에러 응답, 로그 마스킹
5. **PortOne 실운영 전환**: 실제 Store/Channel/API Secret 연결, webhook endpoint 공개, 결제 성공/실패 운영 점검
6. **테스트 코드 확대**: API 핵심 유닛 테스트 확대, 현재 로컬 browser E2E를 CI 친화적으로 정리
7. **프론트엔드 구조 정리**: `src/index.tsx` 분리, 공통 UI/스크립트 추출
8. **관리자 운영 기능 확장**: 금칙어 CRUD, 플랜 CRUD, 결제 운영, 실패 재처리 정교화
9. **후순위 확장**: R2 screenshot/html dump, Redis 큐, AI/post worker 분리, Next.js 전환 검토

## 실행 명령어
```bash
# 빌드 + 실행
cd /Users/junho/Documents/Respondio && npm run build
pm2 start ecosystem.config.cjs          # 웹앱 :3000
pm2 start crawler/ecosystem.config.cjs  # 크롤러 :4000

# 테스트
npm test
npm run test:e2e

# DB 리셋
rm -rf .wrangler/state/v3/d1
npx wrangler d1 migrations apply respondio-production --local
npx wrangler d1 execute respondio-production --local --file=./seed.sql

# 로그 확인
pm2 logs --nostream
```

## 배포 상태
- 로컬 Cloudflare Pages/D1 smoke와 browser E2E는 2026-03-11 기준 통과
- 원격 Cloudflare 배포는 현재 `wrangler whoami`가 `You are not authenticated. Please run wrangler login.` 를 반환해서, 인증 전까지는 불가

## Git 히스토리
```
ec9a8be fix: GPT API max_completion_tokens 적용
c86b32d docs: README 업데이트
37f9356 feat: 크롤링 서버 + 관리자 대시보드 개선
439ab74 feat: GPT AI 연동
c3115a2 docs: README.md 추가
9b81f14 feat: 초기 구현 (전체 UI + API + DB)
```
