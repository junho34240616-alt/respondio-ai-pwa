import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { apiRoutes } from './routes/api'

type Bindings = {
  DB: D1Database
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

// API routes
app.route('/api/v1', apiRoutes)

// ============ LANDING PAGE ============
app.get('/', (c) => {
  return c.html(landingPage())
})

// ============ USER PAGES ============
app.get('/login', (c) => c.html(loginPage()))
app.get('/dashboard', (c) => c.html(dashboardPage()))
app.get('/reviews', (c) => c.html(reviewsPage()))
app.get('/billing', (c) => c.html(billingPage()))
app.get('/settings', (c) => c.html(settingsPage()))
app.get('/customers', (c) => c.html(customersPage()))

// ============ ADMIN PAGES ============
app.get('/admin', (c) => c.html(adminDashboardPage()))
app.get('/admin/users', (c) => c.html(adminDashboardPage()))
app.get('/admin/logs', (c) => c.html(adminDashboardPage()))
app.get('/admin/queue', (c) => c.html(adminDashboardPage()))

// ============ PWA ============
app.get('/manifest.json', (c) => {
  return c.json({
    name: 'Respondio - AI 배달 리뷰 자동답변',
    short_name: 'Respondio',
    description: '배달 리뷰를 AI로 자동 관리하세요',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#FFF7ED',
    theme_color: '#F97316',
    icons: [
      { src: '/static/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/static/icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  })
})

export default app

// ============================================================
//  SHARED HTML UTILITIES
// ============================================================
function baseHead(title: string, extraHead = '') {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#F97316">
  <link rel="manifest" href="/manifest.json">
  <title>${title} | Respondio</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: { 50:'#FFF7ED',100:'#FFEDD5',200:'#FED7AA',300:'#FDBA74',400:'#FB923C',500:'#F97316',600:'#EA580C',700:'#C2410C',800:'#9A3412',900:'#7C2D12' },
            dark: { 50:'#F8FAFC',100:'#F1F5F9',200:'#E2E8F0',300:'#CBD5E1',400:'#94A3B8',500:'#64748B',600:'#475569',700:'#334155',800:'#1E293B',900:'#0F172A',950:'#0B1120' }
          }
        }
      }
    }
  </script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;800&display=swap');
    * { font-family: 'Noto Sans KR', sans-serif; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .card-hover { transition: all 0.2s ease; }
    .card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.1); }
  </style>
  ${extraHead}
</head>`
}

// ============================================================
//  LANDING PAGE
// ============================================================
function landingPage() {
  return `${baseHead('쉽고 빠르게 리뷰 관리')}
<body class="bg-white">
  <!-- Nav -->
  <nav class="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
    <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center">
          <i class="fas fa-comment-dots text-white text-sm"></i>
        </div>
        <span class="text-xl font-bold text-gray-900">Respondio</span>
      </div>
      <div class="hidden md:flex items-center gap-8 text-sm text-gray-600">
        <a href="#features" class="hover:text-brand-500">기능</a>
        <a href="#workflow" class="hover:text-brand-500">워크플로우</a>
        <a href="#pricing" class="hover:text-brand-500">요금제</a>
        <a href="#faq" class="hover:text-brand-500">FAQ</a>
      </div>
      <div class="flex items-center gap-3">
        <a href="/login" class="text-sm text-gray-600 hover:text-brand-500">로그인</a>
        <a href="/login" class="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600 transition">무료 시작</a>
      </div>
    </div>
  </nav>

  <!-- Hero -->
  <section class="pt-28 pb-20 bg-gradient-to-br from-brand-50 via-white to-brand-50">
    <div class="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
      <div class="fade-in">
        <div class="inline-flex items-center gap-2 bg-brand-100 text-brand-700 px-3 py-1 rounded-full text-xs font-medium mb-6">
          <i class="fas fa-sparkles"></i> AI 기반 리뷰 자동답변 SaaS
        </div>
        <h1 class="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
          쉽고 빠르게<br><span class="text-brand-500">리뷰 관리!</span>
        </h1>
        <p class="text-lg text-gray-600 mb-8 leading-relaxed">
          배달 리뷰를 자동으로 목소리에 맞는 답변 작성,<br>시간을 아끼고 고객 만족을 챙기세요!
        </p>
        <div class="flex flex-wrap gap-4">
          <a href="/login" class="bg-brand-500 text-white px-8 py-3.5 rounded-xl font-semibold hover:bg-brand-600 transition shadow-lg shadow-brand-500/30">
            <i class="fas fa-rocket mr-2"></i>무료로 시작하기
          </a>
          <a href="#workflow" class="border-2 border-gray-300 text-gray-700 px-8 py-3.5 rounded-xl font-semibold hover:border-brand-500 hover:text-brand-500 transition">
            데모 보기
          </a>
        </div>
        <div class="flex items-center gap-6 mt-8 text-sm text-gray-500">
          <span><i class="fas fa-check text-green-500 mr-1"></i>신용카드 불필요</span>
          <span><i class="fas fa-check text-green-500 mr-1"></i>14일 무료 체험</span>
          <span><i class="fas fa-check text-green-500 mr-1"></i>즉시 시작</span>
        </div>
      </div>
      <div class="fade-in relative">
        <div class="bg-white rounded-2xl shadow-2xl p-6 border border-gray-100">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center"><i class="fas fa-chart-line text-white text-sm"></i></div>
            <div><div class="font-semibold text-gray-900">Overview</div><div class="text-xs text-gray-400">실시간 리뷰 현황</div></div>
          </div>
          <div class="grid grid-cols-3 gap-3 mb-4">
            <div class="bg-brand-50 rounded-xl p-3 text-center"><div class="text-2xl font-bold text-brand-600">2,450</div><div class="text-xs text-gray-500">총 리뷰</div></div>
            <div class="bg-green-50 rounded-xl p-3 text-center"><div class="text-2xl font-bold text-green-600">97%</div><div class="text-xs text-gray-500">응답률</div></div>
            <div class="bg-blue-50 rounded-xl p-3 text-center"><div class="text-2xl font-bold text-blue-600">4.6</div><div class="text-xs text-gray-500">평균 평점</div></div>
          </div>
          <div class="space-y-2">
            <div class="bg-gray-50 rounded-lg p-3 flex items-start gap-3">
              <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0"><i class="fas fa-star text-yellow-500 text-xs"></i></div>
              <div class="flex-1"><div class="text-xs font-medium text-gray-700">★★★★★ 배달 빠르고 맛있어요!</div><div class="text-xs text-brand-500 mt-1 bg-brand-50 rounded p-2">AI 응답: 감사합니다! 항상 빠른 배달로 보답하겠습니다 😊</div></div>
            </div>
          </div>
        </div>
        <div class="absolute -top-4 -right-4 w-20 h-20 bg-brand-400 rounded-full opacity-20 blur-xl"></div>
        <div class="absolute -bottom-4 -left-4 w-32 h-32 bg-yellow-400 rounded-full opacity-10 blur-xl"></div>
      </div>
    </div>
  </section>

  <!-- Features -->
  <section id="features" class="py-20 bg-white">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mb-16">
        <h2 class="text-3xl font-bold text-gray-900 mb-4">리뷰 응답 자동화 워크플로우</h2>
        <p class="text-gray-500">AI가 알아서, 사장님은 확인만 하세요</p>
      </div>
      <div class="grid md:grid-cols-3 gap-8">
        ${[
          { icon: 'fa-robot', title: '자동 응답 생성', desc: 'AI가 감정과 리뷰 내용을 분석해 자연스러운 답변을 자동 생성합니다.', color: 'brand' },
          { icon: 'fa-heart', title: '고객 맞춤 답변', desc: '단골 고객을 자동 감지하고, 재방문 고객에게 특별한 답변을 제공합니다.', color: 'pink' },
          { icon: 'fa-clock', title: '시간 절약', desc: '리뷰 답변 시간을 90% 절감! AI가 초안을 쓰고 사장님은 승인만 하세요.', color: 'blue' }
        ].map(f => `
          <div class="bg-white border border-gray-100 rounded-2xl p-8 text-center card-hover">
            <div class="w-16 h-16 bg-${f.color}-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <i class="fas ${f.icon} text-${f.color === 'brand' ? 'brand' : f.color}-500 text-2xl"></i>
            </div>
            <h3 class="text-lg font-bold text-gray-900 mb-3">${f.title}</h3>
            <p class="text-gray-500 text-sm leading-relaxed">${f.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- Workflow -->
  <section id="workflow" class="py-20 bg-brand-50">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mb-16">
        <h2 class="text-3xl font-bold text-gray-900 mb-4">리뷰 응답 자동화 워크플로우</h2>
        <p class="text-gray-500">4단계로 리뷰 답변 완료!</p>
      </div>
      <div class="grid md:grid-cols-4 gap-6">
        ${[
          { num: '1', title: '리뷰 수집', desc: '배민/쿠팡이츠/요기요에서 리뷰를 자동 수집', icon: 'fa-inbox' },
          { num: '2', title: 'AI 답변 생성', desc: 'AI가 사장님 말투로 맞춤 답변 작성', icon: 'fa-wand-magic-sparkles' },
          { num: '3', title: '자동 응답 전송', desc: '승인된 답변을 플랫폼에 자동 등록', icon: 'fa-paper-plane' },
          { num: '4', title: '성과 확인', desc: '대시보드에서 리뷰 성과를 한눈에 확인', icon: 'fa-chart-bar' }
        ].map((s, i) => `
          <div class="relative">
            <div class="bg-white rounded-2xl p-8 text-center shadow-sm card-hover">
              <div class="w-12 h-12 bg-brand-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">${s.num}</div>
              <div class="w-14 h-14 bg-brand-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <i class="fas ${s.icon} text-brand-500 text-xl"></i>
              </div>
              <h3 class="font-bold text-gray-900 mb-2">${s.title}</h3>
              <p class="text-sm text-gray-500">${s.desc}</p>
            </div>
            ${i < 3 ? '<div class="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2 text-brand-300 text-2xl"><i class="fas fa-chevron-right"></i></div>' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- Pricing -->
  <section id="pricing" class="py-20 bg-white">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mb-16">
        <h2 class="text-3xl font-bold text-gray-900 mb-4">요금제 안내</h2>
        <p class="text-gray-500">매장 규모에 맞는 플랜을 선택하세요</p>
      </div>
      <div class="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        ${[
          { name: '베이직', price: '29,000', reviews: '300', features: ['리뷰 응답 300건/월', '기본 분석 리포트', '1개 플랫폼 연결'], popular: false },
          { name: '프로', price: '59,000', reviews: '800', features: ['리뷰 응답 800건/월', '고급 분석 대시보드', '3개 플랫폼 연결', '말투 학습 기능', '단골 고객 분석'], popular: true },
          { name: '프리미엄', price: '99,000', reviews: '2,000', features: ['리뷰 응답 2,000건/월', '프리미엄 분석', '무제한 플랫폼', '우선 지원', 'API 연동'], popular: false }
        ].map(p => `
          <div class="relative bg-white rounded-2xl border-2 ${p.popular ? 'border-brand-500 shadow-xl shadow-brand-500/10' : 'border-gray-100'} p-8 card-hover">
            ${p.popular ? '<div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-bold px-4 py-1 rounded-full">가장 인기</div>' : ''}
            <h3 class="text-xl font-bold text-gray-900 mb-2">${p.name}</h3>
            <div class="mb-6">
              <span class="text-4xl font-extrabold text-gray-900">₩${p.price}</span>
              <span class="text-gray-400">/월</span>
            </div>
            <ul class="space-y-3 mb-8">
              ${p.features.map(f => `<li class="flex items-center gap-2 text-sm text-gray-600"><i class="fas fa-check text-brand-500 text-xs"></i>${f}</li>`).join('')}
            </ul>
            <a href="/login" class="block text-center py-3 rounded-xl font-semibold transition ${p.popular ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/30' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">
              지금 시작하기
            </a>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- Testimonials -->
  <section class="py-20 bg-brand-50">
    <div class="max-w-5xl mx-auto px-6">
      <div class="text-center mb-12"><h2 class="text-3xl font-bold text-gray-900">사장님들의 후기</h2></div>
      <div class="grid md:grid-cols-2 gap-8">
        ${[
          { name: '김모우', role: '임차서넌 사장님', text: '"리뷰 관리 누가 훅 줄었어요! AI가 알아서 답변해주니까 정말 편해요."' },
          { name: '여수정', role: '김밥들릭소가 사장님', text: '"고민 응답이 진짜 줄었습니다! 단골 고객 관리까지 되니 매출도 올랐어요."' }
        ].map(t => `
          <div class="bg-white rounded-2xl p-8 shadow-sm">
            <div class="flex items-center gap-4 mb-4">
              <div class="w-12 h-12 bg-brand-200 rounded-full flex items-center justify-center"><i class="fas fa-user text-brand-600"></i></div>
              <div><div class="font-bold text-gray-900">${t.name}</div><div class="text-xs text-gray-400">${t.role}</div></div>
            </div>
            <p class="text-gray-600 leading-relaxed">${t.text}</p>
            <div class="mt-4 text-yellow-400"><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i></div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- FAQ -->
  <section id="faq" class="py-20 bg-white">
    <div class="max-w-3xl mx-auto px-6">
      <div class="text-center mb-12"><h2 class="text-3xl font-bold text-gray-900">자주 묻는 질문</h2></div>
      <div class="space-y-4" id="faq-list">
        ${[
          { q: 'AI 답변은 얼마나 자연스러운가요?', a: 'GPT 기반으로 사장님의 말투를 학습하여 AI 티가 나지 않는 자연스러운 답변을 생성합니다. 품질 점수 시스템으로 답변 품질도 확인 가능합니다.' },
          { q: '리뷰 응답으로 저장할 수 있나요?', a: '네! 모든 리뷰와 답변은 자동으로 저장되며, 대시보드에서 언제든 확인할 수 있습니다. 메뉴별, 기간별 분석 리포트도 제공합니다.' },
          { q: '다른 배달 플랫폼도 지원하나요?', a: '현재 배달의민족, 쿠팡이츠, 요기요 3대 플랫폼을 모두 지원합니다. 향후 더 많은 플랫폼을 추가할 예정입니다.' },
          { q: '무료 체험 기간이 있나요?', a: '네, 14일 무료 체험을 제공합니다. 신용카드 정보 없이 바로 시작하실 수 있어요.' }
        ].map((faq, i) => `
          <div class="border border-gray-200 rounded-xl overflow-hidden">
            <button onclick="toggleFaq(${i})" class="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition">
              <span class="font-medium text-gray-900">${faq.q}</span>
              <i class="fas fa-chevron-down text-gray-400 transition-transform" id="faq-icon-${i}"></i>
            </button>
            <div class="hidden px-5 pb-5 text-sm text-gray-600 leading-relaxed" id="faq-answer-${i}">${faq.a}</div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="py-20 bg-gradient-to-r from-brand-500 to-brand-600">
    <div class="max-w-4xl mx-auto px-6 text-center">
      <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">지금 바로 시작해보세요!</h2>
      <p class="text-brand-100 mb-8 text-lg">14일 무료 체험 · 신용카드 불필요 · 즉시 시작</p>
      <div class="flex flex-wrap justify-center gap-4">
        <a href="/login" class="bg-white text-brand-600 px-8 py-3.5 rounded-xl font-bold hover:shadow-lg transition">무료로 시작하기 <i class="fas fa-arrow-right ml-2"></i></a>
        <a href="/login" class="border-2 border-white/50 text-white px-8 py-3.5 rounded-xl font-semibold hover:bg-white/10 transition">데모 요청하기</a>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="bg-gray-900 text-gray-400 py-12">
    <div class="max-w-7xl mx-auto px-6">
      <div class="flex flex-col md:flex-row items-center justify-between">
        <div class="flex items-center gap-2 mb-4 md:mb-0">
          <div class="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center"><i class="fas fa-comment-dots text-white text-xs"></i></div>
          <span class="text-white font-bold">Respondio</span>
        </div>
        <p class="text-sm">© 2024 Respondio. All rights reserved.</p>
      </div>
    </div>
  </footer>

  <script>
    function toggleFaq(i) {
      const answer = document.getElementById('faq-answer-' + i);
      const icon = document.getElementById('faq-icon-' + i);
      answer.classList.toggle('hidden');
      icon.style.transform = answer.classList.contains('hidden') ? '' : 'rotate(180deg)';
    }
  </script>
</body>
</html>`
}

// ============================================================
//  LOGIN PAGE
// ============================================================
function loginPage() {
  return `${baseHead('로그인')}
<body class="bg-brand-50 min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <div class="text-center mb-8">
      <div class="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <i class="fas fa-comment-dots text-white text-2xl"></i>
      </div>
      <h1 class="text-2xl font-bold text-gray-900">Respondio</h1>
      <p class="text-gray-500 text-sm mt-1">AI 배달 리뷰 자동답변</p>
    </div>
    <div class="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
      <div class="flex bg-gray-100 rounded-xl p-1 mb-6">
        <button id="tab-login" onclick="switchTab('login')" class="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-white shadow text-gray-900">로그인</button>
        <button id="tab-signup" onclick="switchTab('signup')" class="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-500">회원가입</button>
      </div>
      <form id="form-login" onsubmit="handleLogin(event)">
        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">이메일</label>
            <input type="email" id="login-email" value="owner@test.com" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="email@example.com">
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">비밀번호</label>
            <input type="password" id="login-pw" value="password" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="비밀번호">
          </div>
          <button type="submit" class="w-full bg-brand-500 text-white py-3 rounded-xl font-semibold hover:bg-brand-600 transition shadow-lg shadow-brand-500/30">
            <i class="fas fa-sign-in-alt mr-2"></i>로그인
          </button>
        </div>
      </form>
      <form id="form-signup" class="hidden" onsubmit="handleSignup(event)">
        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">이름</label>
            <input type="text" id="signup-name" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="사장님 이름">
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">이메일</label>
            <input type="email" id="signup-email" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="email@example.com">
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">비밀번호</label>
            <input type="password" id="signup-pw" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition" placeholder="비밀번호 (8자 이상)">
          </div>
          <div class="flex items-start gap-2">
            <input type="checkbox" id="agree" class="mt-1 rounded text-brand-500">
            <label for="agree" class="text-xs text-gray-500">서비스 이용약관 및 개인정보 처리방침에 동의합니다.</label>
          </div>
          <button type="submit" class="w-full bg-brand-500 text-white py-3 rounded-xl font-semibold hover:bg-brand-600 transition shadow-lg shadow-brand-500/30">
            <i class="fas fa-user-plus mr-2"></i>가입하기
          </button>
        </div>
      </form>
      <div class="mt-4 text-center">
        <a href="/dashboard" class="text-xs text-gray-400 hover:text-brand-500">데모 대시보드 바로가기 →</a>
      </div>
    </div>
  </div>
  <script>
    function switchTab(tab) {
      document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
      document.getElementById('form-signup').classList.toggle('hidden', tab !== 'signup');
      document.getElementById('tab-login').className = 'flex-1 py-2.5 rounded-lg text-sm font-semibold ' + (tab === 'login' ? 'bg-white shadow text-gray-900' : 'text-gray-500');
      document.getElementById('tab-signup').className = 'flex-1 py-2.5 rounded-lg text-sm font-semibold ' + (tab === 'signup' ? 'bg-white shadow text-gray-900' : 'text-gray-500');
    }
    function handleLogin(e) { e.preventDefault(); window.location.href = '/dashboard'; }
    function handleSignup(e) { e.preventDefault(); window.location.href = '/dashboard'; }
  </script>
</body>
</html>`
}

// ============================================================
//  SIDEBAR COMPONENT
// ============================================================
function userSidebar(active: string) {
  const items = [
    { id: 'dashboard', icon: 'fa-chart-pie', label: '대시보드', href: '/dashboard' },
    { id: 'reviews', icon: 'fa-comments', label: '리뷰 관리', href: '/reviews' },
    { id: 'customers', icon: 'fa-users', label: '고객 분석', href: '/customers' },
    { id: 'billing', icon: 'fa-credit-card', label: '구독/결제', href: '/billing' },
    { id: 'settings', icon: 'fa-cog', label: '설정', href: '/settings' },
  ]
  return `
  <aside class="fixed left-0 top-0 h-screen w-[72px] hover:w-[220px] bg-white border-r border-gray-100 z-40 transition-all duration-300 group overflow-hidden flex flex-col">
    <div class="h-16 flex items-center px-4 border-b border-gray-50 flex-shrink-0">
      <div class="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center flex-shrink-0"><i class="fas fa-comment-dots text-white"></i></div>
      <span class="ml-3 font-bold text-gray-900 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">Respondio</span>
    </div>
    <nav class="flex-1 py-4 px-2 space-y-1">
      ${items.map(it => `
        <a href="${it.href}" class="flex items-center gap-3 px-3 py-3 rounded-xl transition ${active === it.id ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}">
          <i class="fas ${it.icon} text-base w-5 text-center flex-shrink-0"></i>
          <span class="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">${it.label}</span>
        </a>
      `).join('')}
    </nav>
    <div class="p-2 border-t border-gray-50 flex-shrink-0">
      <a href="/" class="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
        <i class="fas fa-sign-out-alt text-base w-5 text-center flex-shrink-0"></i>
        <span class="text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">로그아웃</span>
      </a>
    </div>
  </aside>`
}

// ============================================================
//  DASHBOARD PAGE
// ============================================================
function dashboardPage() {
  return `${baseHead('대시보드')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('dashboard')}
  <main class="ml-[72px] p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">안녕하세요, 김사장님 👋</h1>
        <p class="text-sm text-gray-500 mt-1">맛있는 치킨집 · 오늘의 리뷰 현황</p>
      </div>
      <div class="flex items-center gap-3">
        <select class="text-sm border border-gray-200 rounded-xl px-4 py-2.5 bg-white focus:ring-2 focus:ring-brand-500 outline-none">
          <option>자동응답 켜짐</option>
          <option>자동응답 꺼짐</option>
        </select>
        <div class="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center">
          <i class="fas fa-bell text-brand-500"></i>
        </div>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      ${[
        { label: '총 리뷰', value: '2,450', sub: '건', icon: 'fa-comments', color: 'brand', bg: 'brand-50' },
        { label: '미응답 리뷰', value: '3', sub: '건', icon: 'fa-clock', color: 'red', bg: 'red-50' },
        { label: '평균 평점', value: '4.6', sub: '★★★★★', icon: 'fa-star', color: 'yellow', bg: 'yellow-50' },
        { label: '긍정 비율', value: '82', sub: '%', icon: 'fa-smile', color: 'green', bg: 'green-50' },
        { label: '재방문 고객', value: '45', sub: '%', icon: 'fa-user-check', color: 'blue', bg: 'blue-50' },
        { label: 'AI 품질점수', value: '9.2', sub: '우수', icon: 'fa-robot', color: 'brand', bg: 'brand-50' }
      ].map(kpi => `
        <div class="bg-white rounded-2xl p-5 border border-gray-100 card-hover">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-8 h-8 bg-${kpi.bg} rounded-lg flex items-center justify-center">
              <i class="fas ${kpi.icon} text-${kpi.color}-500 text-sm"></i>
            </div>
            <span class="text-xs text-gray-400 font-medium">${kpi.label}</span>
          </div>
          <div class="flex items-end gap-1">
            <span class="text-2xl font-bold text-gray-900">${kpi.value}</span>
            <span class="text-sm text-gray-400 mb-0.5">${kpi.sub}</span>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Main Grid: 3 columns -->
    <div class="grid lg:grid-cols-3 gap-6">
      <!-- 최근 리뷰 -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-bold text-gray-900">최근 리뷰</h2>
          <a href="/reviews" class="text-xs text-brand-500 font-medium hover:underline">전체 보기 →</a>
        </div>
        <div class="space-y-4" id="recent-reviews">
          <!-- Loaded via JS -->
        </div>
      </div>

      <!-- 메뉴 평판 분석 -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-bold text-gray-900">메뉴 평판 분석</h2>
          <select class="text-xs border border-gray-200 rounded-lg px-2 py-1"><option>최근 30일</option></select>
        </div>
        <canvas id="menuChart" height="200"></canvas>
        <div class="mt-6">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">플랫폼 연결 상태</h3>
          <div class="grid grid-cols-3 gap-3">
            ${[
              { name: '배달의민족', color: '#00C4B4', abbr: '배민' },
              { name: '쿠팡이츠', color: '#E4002B', abbr: '쿠팡' },
              { name: '요기요', color: '#FA0050', abbr: '요기요' }
            ].map(p => `
              <div class="text-center p-3 bg-gray-50 rounded-xl">
                <div class="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-xs font-bold" style="background:${p.color}">${p.abbr}</div>
                <div class="flex items-center justify-center gap-1 text-xs text-green-600"><i class="fas fa-check-circle"></i>연결됨</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- 충성 고객 인사이트 -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 class="text-lg font-bold text-gray-900 mb-5">충성 고객 인사이트</h2>
        <div class="mb-6">
          <h3 class="text-sm text-gray-500 mb-3">재방문 TOP 고객</h3>
          <div class="space-y-3" id="top-customers"></div>
        </div>
        <div class="mb-6">
          <h3 class="text-sm text-gray-500 mb-3">즐겨 찾는 주문 시간</h3>
          <div class="bg-brand-50 rounded-xl p-4 flex items-center gap-4">
            <div class="w-12 h-12 bg-brand-500 rounded-full flex items-center justify-center"><i class="fas fa-clock text-white"></i></div>
            <div>
              <div class="font-bold text-gray-900">오후 6시 - 8시</div>
              <div class="text-xs text-gray-500">전체 주문의 38%</div>
            </div>
          </div>
        </div>
        <div>
          <h3 class="text-sm text-gray-500 mb-3">리뷰 트렌드 (7일)</h3>
          <canvas id="trendChart" height="120"></canvas>
        </div>
      </div>
    </div>
  </main>

  <script>
    // Menu Rating Chart
    new Chart(document.getElementById('menuChart'), {
      type: 'bar',
      data: {
        labels: ['양념치킨', '후라이드', '김치찌개', '제육볶음', '돈까스'],
        datasets: [{
          data: [4.8, 4.6, 4.3, 4.5, 4.2],
          backgroundColor: ['#F97316','#FB923C','#FDBA74','#FED7AA','#FFEDD5'],
          borderRadius: 8,
          barThickness: 36
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 5, grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 } } },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });

    // Trend Chart
    new Chart(document.getElementById('trendChart'), {
      type: 'line',
      data: {
        labels: ['월', '화', '수', '목', '금', '토', '일'],
        datasets: [{
          data: [13, 11, 15, 9, 10, 12, 8],
          borderColor: '#F97316',
          backgroundColor: 'rgba(249,115,22,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#F97316'
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#F3F4F6' }, ticks: { font: { size: 10 } } },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      }
    });

    // Load recent reviews from API
    fetch('/api/v1/reviews?limit=4').then(r=>r.json()).then(data => {
      const reviews = data.reviews || data;
      const container = document.getElementById('recent-reviews');
      if(!container || !Array.isArray(reviews)) return;
      container.innerHTML = reviews.slice(0,4).map(r => {
        const stars = '★'.repeat(Math.floor(r.rating)) + (r.rating % 1 ? '½' : '');
        const sentimentColor = r.sentiment === 'positive' ? 'green' : r.sentiment === 'negative' ? 'red' : 'gray';
        const platformColors = { baemin: '#00C4B4', coupang_eats: '#E4002B', yogiyo: '#FA0050' };
        const platformNames = { baemin: '배민', coupang_eats: '쿠팡', yogiyo: '요기요' };
        const aiReply = r.reply_text || '';
        return \`
          <div class="p-4 bg-gray-50 rounded-xl fade-in">
            <div class="flex items-center gap-2 mb-2">
              <span class="w-6 h-6 rounded-full text-white text-[10px] flex items-center justify-center font-bold" style="background:\${platformColors[r.platform]}">\${platformNames[r.platform]?.[0]||'?'}</span>
              <span class="font-medium text-sm text-gray-900">\${r.customer_name}</span>
              <span class="text-yellow-500 text-xs">\${stars}</span>
              \${r.customer_type==='loyal'?'<span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">단골</span>':''}
              \${r.customer_type==='repeat'?'<span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">재방문</span>':''}
            </div>
            <p class="text-sm text-gray-600 mb-2">\${r.review_text}</p>
            \${aiReply ? \`<div class="bg-brand-50 rounded-lg p-3 text-xs text-brand-700"><i class="fas fa-robot mr-1"></i>AI: \${aiReply}</div>\` : \`<div class="flex gap-2 mt-2"><button onclick="generateReply(\${r.id})" class="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600 transition"><i class="fas fa-magic mr-1"></i>답변 생성</button></div>\`}
          </div>\`;
      }).join('');
    });

    // Load top customers
    fetch('/api/v1/dashboard/repeat_customers').then(r=>r.json()).then(data => {
      const customers = data.customers || data;
      const container = document.getElementById('top-customers');
      if(!container || !Array.isArray(customers)) return;
      container.innerHTML = customers.slice(0,3).map(c => \`
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 bg-brand-200 rounded-full flex items-center justify-center"><i class="fas fa-user text-brand-600 text-sm"></i></div>
            <div><div class="font-medium text-sm text-gray-900">\${c.customer_name}</div><div class="text-xs text-gray-400">\${c.favorite_menu || ''}</div></div>
          </div>
          <span class="text-sm font-bold text-brand-500">\${c.order_count}회</span>
        </div>
      \`).join('');
    });

    async function generateReply(id) {
      const btn = event.target;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>AI 생성 중...';
      try {
        const res = await fetch('/api/v1/reviews/' + id + '/generate', { method: 'POST' });
        const data = await res.json();
        if (data.error) { alert(data.error); return; }
        location.reload();
      } catch(e) { alert('AI 답변 생성 실패: ' + e.message); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic mr-1"></i>답변 생성'; }
    }
  </script>
</body>
</html>`
}

// ============================================================
//  REVIEWS PAGE
// ============================================================
function reviewsPage() {
  return `${baseHead('리뷰 관리')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('reviews')}
  <main class="ml-[72px] p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">리뷰 관리</h1>
      <div class="flex items-center gap-3">
        <button onclick="batchGenerate()" class="border border-brand-500 text-brand-500 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-50 transition" id="btn-batch-gen">
          <i class="fas fa-wand-magic-sparkles mr-2"></i>AI 일괄 생성
        </button>
        <button onclick="approveAll()" class="bg-brand-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-600 transition shadow-lg shadow-brand-500/30">
          <i class="fas fa-check-double mr-2"></i>전체 승인
        </button>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="flex items-center gap-1 bg-white rounded-xl p-1 border border-gray-100 w-fit mb-6">
      <button class="px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-500 text-white" onclick="filterTab('all')">리뷰</button>
      <button class="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50" onclick="filterTab('pending')">미답변</button>
      <button class="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50" onclick="filterTab('generated')">생성완료</button>
      <button class="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50" onclick="filterTab('posted')">등록완료</button>
    </div>

    <div class="grid lg:grid-cols-[240px_1fr_320px] gap-6">
      <!-- Filters -->
      <div class="space-y-4">
        <div class="bg-white rounded-2xl p-5 border border-gray-100">
          <h3 class="font-bold text-sm text-gray-900 mb-4">리뷰 플랫폼</h3>
          <div class="space-y-2">
            ${['전체', '배달의민족', '요기요', '쿠팡이츠'].map((p, i) => `
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" ${i === 0 ? 'checked' : ''} class="rounded text-brand-500 focus:ring-brand-500" onchange="applyFilter()">
                <span class="text-sm text-gray-600">${p}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="bg-white rounded-2xl p-5 border border-gray-100">
          <h3 class="font-bold text-sm text-gray-900 mb-4">평점</h3>
          <div class="space-y-2">
            ${['전체', '★★★★★', '★★★★', '★★★', '★★ 이하'].map((p, i) => `
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="rating" ${i === 0 ? 'checked' : ''} class="text-brand-500 focus:ring-brand-500">
                <span class="text-sm text-gray-600">${p}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="bg-white rounded-2xl p-5 border border-gray-100">
          <h3 class="font-bold text-sm text-gray-900 mb-4">감정 분석</h3>
          <div class="space-y-2">
            ${[
              { label: '전체', color: '' },
              { label: '긍정', color: 'text-green-500' },
              { label: '부정', color: 'text-red-500' },
              { label: '중립', color: 'text-gray-500' }
            ].map((s, i) => `
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="sentiment" ${i === 0 ? 'checked' : ''} class="text-brand-500 focus:ring-brand-500">
                <span class="text-sm ${s.color || 'text-gray-600'}">${s.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <button onclick="resetFilters()" class="w-full bg-brand-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-600 transition">필터 초기화</button>
      </div>

      <!-- Review List -->
      <div class="space-y-4" id="review-list">
        <div class="text-center py-20 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i><p class="mt-3 text-sm">리뷰 로딩 중...</p></div>
      </div>

      <!-- AI Response Panel -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100 h-fit sticky top-6" id="ai-panel">
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <i class="fas fa-robot text-brand-500"></i> AI 답변 승인
        </h3>
        <div id="ai-response-content">
          <div class="text-center py-12 text-gray-400">
            <i class="fas fa-hand-pointer text-3xl mb-3"></i>
            <p class="text-sm">리뷰를 선택해주세요</p>
          </div>
        </div>
      </div>
    </div>
  </main>

  <script>
    let allReviews = [];
    let selectedReview = null;

    fetch('/api/v1/reviews?limit=50').then(r=>r.json()).then(data => {
      allReviews = data.reviews || data || [];
      renderReviews(allReviews);
    });

    function renderReviews(reviews) {
      const container = document.getElementById('review-list');
      if(!reviews.length) { container.innerHTML = '<div class="text-center py-20 text-gray-400">리뷰가 없습니다.</div>'; return; }
      const platformColors = { baemin: '#00C4B4', coupang_eats: '#E4002B', yogiyo: '#FA0050' };
      const platformNames = { baemin: '배달의민족', coupang_eats: '쿠팡이츠', yogiyo: '요기요' };
      container.innerHTML = reviews.map(r => {
        const stars = '★'.repeat(Math.floor(r.rating));
        const sentClass = r.sentiment === 'positive' ? 'bg-green-100 text-green-700' : r.sentiment === 'negative' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600';
        const sentLabel = r.sentiment === 'positive' ? '긍정적' : r.sentiment === 'negative' ? '부정적' : '중립적';
        const custBadge = r.customer_type === 'loyal' ? '<span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">단골고객</span>' : r.customer_type === 'repeat' ? '<span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">재방문</span>' : '';
        const statusBadge = r.status === 'posted' ? '<span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">등록완료</span>' : r.status === 'approved' ? '<span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">승인됨</span>' : r.status === 'generated' ? '<span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">답변생성</span>' : '<span class="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">미답변</span>';
        let menus = [];
        try { menus = JSON.parse(r.menu_items || '[]'); } catch(e) {}
        return \`
          <div class="bg-white rounded-2xl p-5 border border-gray-100 card-hover cursor-pointer fade-in" onclick="selectReview(\${r.id})">
            <div class="flex items-center gap-2 mb-3 flex-wrap">
              <span class="w-7 h-7 rounded-full text-white text-[10px] flex items-center justify-center font-bold" style="background:\${platformColors[r.platform]}">\${platformNames[r.platform]?.[0]||'?'}</span>
              <span class="text-xs font-medium text-gray-500">\${platformNames[r.platform]||r.platform}</span>
              <span class="text-yellow-500 text-sm">\${stars}</span>
              \${statusBadge}
              \${custBadge}
            </div>
            <p class="text-sm text-gray-700 mb-3 leading-relaxed">\${r.review_text}</p>
            <div class="flex flex-wrap gap-2">
              \${menus.map(m => '<span class="text-[11px] bg-gray-100 text-gray-600 px-2 py-1 rounded-lg"><i class="fas fa-utensils mr-1 text-brand-400"></i>'+m+'</span>').join('')}
              <span class="text-[11px] \${sentClass} px-2 py-1 rounded-lg font-medium">\${sentLabel}</span>
            </div>
          </div>\`;
      }).join('');
    }

    function selectReview(id) {
      selectedReview = allReviews.find(r => r.id === id);
      if(!selectedReview) return;
      const panel = document.getElementById('ai-response-content');
      const replyText = selectedReview.reply_text || selectedReview.candidate_text || '';
      const score = selectedReview.quality_score || 0;
      if(replyText) {
        panel.innerHTML = \`
          <div class="mb-4">
            <label class="text-sm font-medium text-gray-700 mb-2 block">생성된 답변</label>
            <div class="bg-brand-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed border border-brand-100" id="reply-text">\${replyText}</div>
          </div>
          <div class="flex items-center gap-2 mb-4">
            <span class="text-sm text-gray-500">품질 점수:</span>
            <span class="text-lg font-bold text-brand-500">\${score.toFixed?.(1) || score}</span>
          </div>
          <div class="grid grid-cols-3 gap-2 mb-4">
            <button onclick="regenerate()" class="py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition"><i class="fas fa-redo mr-1"></i>재생성</button>
            <button onclick="editReply()" class="py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition"><i class="fas fa-pen mr-1"></i>수정</button>
            <button onclick="approveReply(\${selectedReview.id})" class="py-2.5 bg-brand-500 text-white rounded-xl text-sm font-semibold hover:bg-brand-600 transition"><i class="fas fa-check mr-1"></i>승인</button>
          </div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-500">자동 게시</span>
              <div class="w-10 h-6 bg-brand-500 rounded-full relative cursor-pointer"><div class="w-4 h-4 bg-white rounded-full absolute right-1 top-1 shadow"></div></div>
            </div>
            <button class="text-sm text-gray-400 border border-gray-200 px-3 py-1.5 rounded-lg hover:text-gray-600">건너뛰기</button>
          </div>\`;
      } else {
        panel.innerHTML = \`
          <div class="text-center py-8">
            <p class="text-sm text-gray-500 mb-4">이 리뷰에 대한 AI 답변이 아직 없습니다.</p>
            <button onclick="generateForReview(\${selectedReview.id})" class="bg-brand-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-600 transition">
              <i class="fas fa-magic mr-2"></i>AI 답변 생성
            </button>
          </div>\`;
      }
    }

    function filterTab(tab) {
      const buttons = document.querySelectorAll('main .flex.items-center.gap-1 button');
      buttons.forEach(b => { b.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50'; });
      event.target.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-500 text-white';
      if(tab === 'all') renderReviews(allReviews);
      else renderReviews(allReviews.filter(r => r.status === tab));
    }
    async function batchGenerate() {
      const btn = document.getElementById('btn-batch-gen');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>AI 생성 중...';
      try {
        const res = await fetch('/api/v1/reviews/batch-generate', { method:'POST' });
        const data = await res.json();
        if(data.error) { alert(data.error); return; }
        alert(data.generated_count + '건의 AI 답변이 생성되었습니다!');
        location.reload();
      } catch(e) { alert('일괄 생성 실패: ' + e.message); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-wand-magic-sparkles mr-2"></i>AI 일괄 생성'; }
    }
    function applyFilter() {}
    function resetFilters() { renderReviews(allReviews); }
    async function regenerate() {
      if(!selectedReview) return;
      const panel = document.getElementById('ai-response-content');
      panel.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i><p class="mt-3 text-sm text-gray-500">AI가 새로운 답변을 생성하고 있습니다...</p></div>';
      try {
        const res = await fetch('/api/v1/reviews/' + selectedReview.id + '/generate', { method: 'POST' });
        const data = await res.json();
        if (data.error) { alert(data.error); selectReview(selectedReview.id); return; }
        // Refresh reviews
        const rr = await fetch('/api/v1/reviews?limit=50');
        const rd = await rr.json();
        allReviews = rd.reviews || [];
        renderReviews(allReviews);
        selectedReview.candidate_text = data.reply_text;
        selectedReview.quality_score = data.quality_score;
        selectReview(selectedReview.id);
      } catch(e) { alert('재생성 실패: ' + e.message); selectReview(selectedReview.id); }
    }
    function editReply() { const el = document.getElementById('reply-text'); if(el) el.contentEditable = true; el.focus(); el.style.border = '2px solid #F97316'; }
    async function approveReply(id) {
      try {
        const res = await fetch('/api/v1/reviews/approve', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({review_ids:[id]}) });
        const data = await res.json();
        if(data.success) {
          const rr = await fetch('/api/v1/reviews?limit=50'); const rd = await rr.json(); allReviews = rd.reviews||[]; renderReviews(allReviews);
          document.getElementById('ai-response-content').innerHTML = '<div class="text-center py-8"><i class="fas fa-check-circle text-green-500 text-3xl"></i><p class="mt-3 text-sm text-green-600 font-semibold">답변이 승인되었습니다!</p></div>';
        }
      } catch(e) { alert('승인 실패: ' + e.message); }
    }
    async function approveAll() {
      const generatedIds = allReviews.filter(r => r.status === 'generated').map(r => r.id);
      if(!generatedIds.length) { alert('승인할 답변이 없습니다.'); return; }
      try {
        const res = await fetch('/api/v1/reviews/approve', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({review_ids:generatedIds}) });
        const data = await res.json();
        alert(data.approved_count + '건의 답변이 승인되었습니다!');
        location.reload();
      } catch(e) { alert('일괄 승인 실패: ' + e.message); }
    }
    async function generateForReview(id) {
      const panel = document.getElementById('ai-response-content');
      panel.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i><p class="mt-3 text-sm text-gray-500">AI가 답변을 생성하고 있습니다...</p><p class="text-xs text-gray-400 mt-1">GPT가 리뷰를 분석 중입니다...</p></div>';
      try {
        const res = await fetch('/api/v1/reviews/' + id + '/generate', { method: 'POST' });
        const data = await res.json();
        if (data.error) { alert(data.error); return; }
        // Refresh
        const rr = await fetch('/api/v1/reviews?limit=50'); const rd = await rr.json(); allReviews = rd.reviews||[]; renderReviews(allReviews);
        selectReview(id);
      } catch(e) { alert('AI 답변 생성 실패: ' + e.message); selectReview(id); }
    }
  </script>
</body>
</html>`
}

// ============================================================
//  CUSTOMERS PAGE
// ============================================================
function customersPage() {
  return `${baseHead('고객 분석')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('customers')}
  <main class="ml-[72px] p-6">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">고객 분석</h1>
    <div class="grid lg:grid-cols-3 gap-6 mb-6">
      <div class="bg-white rounded-2xl p-6 border border-gray-100 card-hover">
        <div class="text-sm text-gray-500 mb-2">총 고객 수</div>
        <div class="text-3xl font-bold text-gray-900">186</div>
        <div class="text-xs text-green-500 mt-1"><i class="fas fa-arrow-up"></i> +12 이번 주</div>
      </div>
      <div class="bg-white rounded-2xl p-6 border border-gray-100 card-hover">
        <div class="text-sm text-gray-500 mb-2">단골 고객</div>
        <div class="text-3xl font-bold text-brand-500">24</div>
        <div class="text-xs text-gray-400 mt-1">5회 이상 주문</div>
      </div>
      <div class="bg-white rounded-2xl p-6 border border-gray-100 card-hover">
        <div class="text-sm text-gray-500 mb-2">재방문율</div>
        <div class="text-3xl font-bold text-blue-500">45%</div>
        <div class="text-xs text-green-500 mt-1"><i class="fas fa-arrow-up"></i> +3.2%</div>
      </div>
    </div>
    <div class="bg-white rounded-2xl p-6 border border-gray-100">
      <h2 class="text-lg font-bold text-gray-900 mb-4">고객 목록</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-gray-500 border-b border-gray-100">
            <th class="pb-3 font-medium">고객명</th><th class="pb-3 font-medium">유형</th><th class="pb-3 font-medium">주문 횟수</th><th class="pb-3 font-medium">즐겨 메뉴</th><th class="pb-3 font-medium">최근 주문</th>
          </tr></thead>
          <tbody id="customer-table"></tbody>
        </table>
      </div>
    </div>
  </main>
  <script>
    fetch('/api/v1/dashboard/repeat_customers').then(r=>r.json()).then(data => {
      const customers = data.customers || data || [];
      document.getElementById('customer-table').innerHTML = customers.map(c => {
        const typeBadge = c.customer_type === 'loyal' ? '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs">단골</span>' : '<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">재방문</span>';
        return \`<tr class="border-b border-gray-50 hover:bg-gray-50"><td class="py-3 font-medium text-gray-900">\${c.customer_name}</td><td>\${typeBadge}</td><td class="font-bold text-brand-500">\${c.order_count}회</td><td class="text-gray-500">\${c.favorite_menu||'-'}</td><td class="text-gray-400 text-xs">\${new Date(c.last_order_at).toLocaleDateString('ko-KR')}</td></tr>\`;
      }).join('');
    });
  </script>
</body>
</html>`
}

// ============================================================
//  BILLING PAGE
// ============================================================
function billingPage() {
  return `${baseHead('구독 및 결제')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('billing')}
  <main class="ml-[72px] p-6">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">구독 및 결제</h1>

    <div class="grid lg:grid-cols-[1fr_380px] gap-6 mb-6">
      <!-- Plan Comparison -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 class="text-lg font-bold text-gray-900 mb-5">요금제 비교</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-100">
                <th class="pb-3 text-left text-gray-500 font-medium w-36"></th>
                <th class="pb-3 text-center font-bold text-gray-700">베이직</th>
                <th class="pb-3 text-center font-bold text-brand-600 bg-brand-50 rounded-t-xl">프로</th>
                <th class="pb-3 text-center font-bold text-gray-700">프리미엄</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b border-gray-50">
                <td class="py-4 text-gray-500">월 요금</td>
                <td class="py-4 text-center font-bold">₩29,000<span class="text-gray-400 font-normal">/월</span></td>
                <td class="py-4 text-center font-bold bg-brand-50">₩59,000<span class="text-gray-400 font-normal">/월</span></td>
                <td class="py-4 text-center font-bold">₩99,000<span class="text-gray-400 font-normal">/월</span></td>
              </tr>
              <tr class="border-b border-gray-50">
                <td class="py-4 text-gray-500">리뷰 응답</td>
                <td class="py-4 text-center">300건/월</td>
                <td class="py-4 text-center bg-brand-50">800건/월</td>
                <td class="py-4 text-center">2,000건/월</td>
              </tr>
              <tr class="border-b border-gray-50">
                <td class="py-4 text-gray-500">플랫폼 연결</td>
                <td class="py-4 text-center">1개</td>
                <td class="py-4 text-center bg-brand-50">3개</td>
                <td class="py-4 text-center">무제한</td>
              </tr>
              <tr class="border-b border-gray-50">
                <td class="py-4 text-gray-500">고급 분석</td>
                <td class="py-4 text-center text-gray-300"><i class="fas fa-times"></i></td>
                <td class="py-4 text-center bg-brand-50 text-brand-500"><i class="fas fa-check"></i></td>
                <td class="py-4 text-center text-brand-500"><i class="fas fa-check"></i></td>
              </tr>
              <tr>
                <td class="py-4 text-gray-500">말투 학습</td>
                <td class="py-4 text-center text-gray-300"><i class="fas fa-times"></i></td>
                <td class="py-4 text-center bg-brand-50 text-brand-500"><i class="fas fa-check"></i></td>
                <td class="py-4 text-center text-brand-500"><i class="fas fa-check"></i></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex gap-3 mt-6">
          <button class="bg-brand-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-600 transition">요금제 변경</button>
          <button class="border border-gray-200 text-gray-600 px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition">자세히 보기</button>
        </div>
      </div>

      <!-- Right Column -->
      <div class="space-y-6">
        <!-- Current Plan -->
        <div class="bg-white rounded-2xl p-6 border border-gray-100">
          <h3 class="text-sm text-gray-500 mb-2">현재 요금제</h3>
          <div class="text-brand-500 font-bold text-lg mb-1">프로 요금제</div>
          <div class="text-3xl font-extrabold text-gray-900 mb-3">₩59,000<span class="text-sm text-gray-400 font-normal">/월</span></div>
          <div class="text-sm text-gray-500 mb-2">다음 결제일: 2024년 5월 10일</div>
          <div class="flex items-center gap-2 text-sm text-green-600"><i class="fas fa-check-circle"></i>자동 결제 활성화</div>
        </div>

        <!-- Payment History -->
        <div class="bg-white rounded-2xl p-6 border border-gray-100">
          <h3 class="font-bold text-gray-900 mb-4">결제 내역</h3>
          <div class="space-y-3" id="payment-history">
            ${['2024.04.10', '2024.03.10', '2024.02.10', '2024.01.10'].map(d => `
              <div class="flex items-center justify-between py-2 border-b border-gray-50">
                <span class="text-sm text-gray-600">${d}</span>
                <div class="flex items-center gap-3">
                  <span class="font-bold text-gray-900">₩59,000</span>
                  <span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">결제 완료</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Row -->
    <div class="grid lg:grid-cols-2 gap-6">
      <!-- Payment Method -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h3 class="font-bold text-gray-900 mb-4">결제 수단</h3>
        <div class="flex items-center gap-4 p-4 bg-gray-50 rounded-xl mb-4">
          <div class="text-2xl font-bold text-blue-800">VISA</div>
          <div>
            <div class="font-medium text-gray-900">**** 4242</div>
            <div class="text-xs text-gray-400">만료일 08/27</div>
          </div>
        </div>
        <div class="flex gap-3">
          <button class="border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50 transition">결제 수단 변경</button>
          <button class="border border-red-200 text-red-500 px-4 py-2 rounded-xl text-sm hover:bg-red-50 transition">결제 수단 삭제</button>
        </div>
      </div>

      <!-- Subscription Cancel -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h3 class="font-bold text-gray-900 mb-4">구독 해지</h3>
        <p class="text-sm text-gray-500 mb-6 leading-relaxed">구독을 해지하시겠습니까? 구독을 해지하면 다음 결제단부터 요금제가 갱신되지 않습니다. 현재 결제기간이 끝날 때까지는 모든 기능을 이용하실 수 있습니다.</p>
        <button class="border-2 border-red-300 text-red-500 px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-50 transition">구독 해지하기</button>
      </div>
    </div>
  </main>
</body>
</html>`
}

// ============================================================
//  SETTINGS PAGE
// ============================================================
function settingsPage() {
  return `${baseHead('설정')}
<body class="bg-gray-50 min-h-screen">
  ${userSidebar('settings')}
  <main class="ml-[72px] p-6">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">설정</h1>
    <div class="max-w-3xl space-y-6">
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 class="text-lg font-bold text-gray-900 mb-4">매장 정보</h2>
        <div class="space-y-4">
          <div><label class="text-sm font-medium text-gray-700 mb-1 block">매장 이름</label><input type="text" value="맛있는 치킨집" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"></div>
          <div><label class="text-sm font-medium text-gray-700 mb-1 block">사업자번호</label><input type="text" value="123-45-***" class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"></div>
        </div>
      </div>
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 class="text-lg font-bold text-gray-900 mb-4">답변 스타일 설정</h2>
        <div class="grid grid-cols-2 gap-4">
          ${['친근형', '정중형', '캐주얼', '커스텀'].map((s, i) => `
            <label class="flex items-center gap-3 p-4 border ${i===0?'border-brand-500 bg-brand-50':'border-gray-200'} rounded-xl cursor-pointer hover:border-brand-300 transition">
              <input type="radio" name="style" ${i===0?'checked':''} class="text-brand-500"><span class="font-medium text-sm">${s}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 class="text-lg font-bold text-gray-900 mb-4">자동 응답 설정</h2>
        <div class="space-y-4">
          <div class="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div><div class="font-medium text-sm text-gray-900">자동 승인</div><div class="text-xs text-gray-400">품질 점수 8.0 이상 답변 자동 승인</div></div>
            <div class="w-12 h-7 bg-brand-500 rounded-full relative cursor-pointer"><div class="w-5 h-5 bg-white rounded-full absolute right-1 top-1 shadow"></div></div>
          </div>
          <div class="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div><div class="font-medium text-sm text-gray-900">자동 게시</div><div class="text-xs text-gray-400">승인된 답변 자동으로 플랫폼에 등록</div></div>
            <div class="w-12 h-7 bg-gray-300 rounded-full relative cursor-pointer"><div class="w-5 h-5 bg-white rounded-full absolute left-1 top-1 shadow"></div></div>
          </div>
        </div>
      </div>
      <button class="bg-brand-500 text-white px-8 py-3 rounded-xl font-semibold hover:bg-brand-600 transition">설정 저장</button>
    </div>
  </main>
</body>
</html>`
}

// ============================================================
//  ADMIN DASHBOARD
// ============================================================
function adminDashboardPage() {
  return `${baseHead('관리자', '<style>body{background:#0B1120;color:#F8FAFC;}</style>')}
<body class="min-h-screen">
  <!-- Admin Sidebar -->
  <aside class="fixed left-0 top-0 h-screen w-[200px] bg-dark-900 border-r border-white/5 z-40 flex flex-col">
    <div class="h-16 flex items-center px-6 border-b border-white/5">
      <span class="text-xl font-bold italic text-white">Admin</span>
    </div>
    <nav class="flex-1 py-4 px-3 space-y-1">
      ${[
        { icon: 'fa-chart-line', label: '운영 현황', active: true },
        { icon: 'fa-users', label: '사용자 관리', active: false },
        { icon: 'fa-file-alt', label: '로그', active: false },
        { icon: 'fa-database', label: '큐 관리', active: false }
      ].map(it => `
        <a href="#" class="flex items-center gap-3 px-4 py-3 rounded-xl transition ${it.active ? 'bg-white/10 text-white border-l-2 border-brand-500' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}">
          <i class="fas ${it.icon} text-sm w-5 text-center"></i>
          <span class="text-sm">${it.label}</span>
        </a>
      `).join('')}
    </nav>
  </aside>

  <!-- Main Content -->
  <main class="ml-[200px]">
    <!-- Header -->
    <header class="h-16 border-b border-white/5 flex items-center justify-between px-6">
      <div class="flex items-center gap-3">
        <i class="fas fa-bars text-gray-400 cursor-pointer"></i>
        <span class="text-gray-300 text-sm">Admin Operations</span>
      </div>
      <div class="flex items-center gap-4">
        <i class="fas fa-cog text-gray-400 hover:text-white cursor-pointer"></i>
        <i class="fas fa-bell text-gray-400 hover:text-white cursor-pointer"></i>
        <div class="w-9 h-9 bg-brand-500 rounded-full flex items-center justify-center"><i class="fas fa-user text-white text-sm"></i></div>
      </div>
    </header>

    <div class="p-6 space-y-6">
      <!-- KPI Cards -->
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-dark-800 rounded-2xl p-6 border border-white/5">
          <div class="flex items-center gap-2 text-gray-400 text-sm mb-2"><i class="fas fa-users"></i>전체 가입자</div>
          <div class="text-3xl font-bold text-white mb-1">12,450</div>
          <div class="text-xs text-red-400"><i class="fas fa-arrow-up"></i> +1.8% 어제</div>
        </div>
        <div class="bg-dark-800 rounded-2xl p-6 border border-white/5">
          <div class="flex items-center gap-2 text-gray-400 text-sm mb-2"><i class="fas fa-user-check"></i>활성 구독자</div>
          <div class="text-3xl font-bold text-white mb-1">9,230</div>
          <div class="text-xs text-red-400"><i class="fas fa-arrow-up"></i> +0.5% 어제</div>
        </div>
        <div class="bg-red-900/30 border border-red-500/20 rounded-2xl p-6">
          <div class="flex items-center gap-2 text-gray-400 text-sm mb-2"><i class="fas fa-exclamation-triangle"></i>에러율</div>
          <div class="text-3xl font-bold text-red-400 mb-1">3.8%</div>
          <div class="text-xs text-green-400"><i class="fas fa-arrow-down"></i> -1.2% 어제</div>
        </div>
      </div>

      <!-- Middle Grid -->
      <div class="grid lg:grid-cols-[1fr_400px] gap-6">
        <!-- Error Log -->
        <div class="bg-dark-800 rounded-2xl p-6 border border-white/5">
          <h3 class="font-bold text-white mb-4">에러 로그</h3>
          <div class="space-y-3" id="admin-logs">
            ${[
              { time: '10:45', type: '결제 에러', badge: 'bg-red-500/20 text-red-400', msg: 'Payment declined: Card expired.' },
              { time: '10:32', type: 'API 에러', badge: 'bg-yellow-500/20 text-yellow-400', msg: 'API Timeout: Request timed out.' },
              { time: '10:20', type: 'DB 에러', badge: 'bg-red-500/20 text-red-400', msg: 'Database Connection Error.' },
              { time: '10:15', type: '인증 에러', badge: 'bg-gray-500/20 text-gray-400', msg: 'Login Failed: Invalid password.' },
              { time: '09:16', type: '결제 에러', badge: 'bg-red-500/20 text-red-400', msg: 'Payment care reprocessed.' },
              { time: '08:05', type: 'DB 에러', badge: 'bg-red-500/20 text-red-400', msg: 'Operation implementation error.' }
            ].map(log => `
              <div class="flex items-center gap-4 py-2 border-b border-white/5">
                <span class="text-xs text-gray-500 w-12">${log.time}</span>
                <span class="text-xs px-2 py-0.5 rounded ${log.badge} font-medium">${log.type}</span>
                <span class="text-sm text-gray-300 flex-1">${log.msg}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Error Rate Chart -->
        <div class="bg-dark-800 rounded-2xl p-6 border border-white/5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-white">에러율 추이</h3>
            <span class="text-xs text-gray-400">최근 24시간</span>
          </div>
          <canvas id="errorChart" height="200"></canvas>
        </div>
      </div>

      <!-- Bottom Grid -->
      <div class="grid lg:grid-cols-2 gap-6">
        <!-- Job Queue Status -->
        <div class="bg-dark-800 rounded-2xl p-6 border border-white/5">
          <h3 class="font-bold text-white mb-4">작업 큐 상태</h3>
          <div class="space-y-4">
            ${[
              { label: '대기 중', count: 235, color: 'bg-yellow-500', pct: 16 },
              { label: '처리 중', count: 58, color: 'bg-blue-500', pct: 4 },
              { label: '완료', count: 1120, color: 'bg-green-500', pct: 80 }
            ].map(q => `
              <div>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm text-gray-400">${q.label}</span>
                  <span class="text-lg font-bold text-white">${q.count.toLocaleString()}</span>
                </div>
                <div class="w-full bg-white/5 rounded-full h-3">
                  <div class="${q.color} h-3 rounded-full transition-all" style="width:${q.pct}%"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- DLQ Status -->
        <div class="bg-dark-800 rounded-2xl p-6 border border-white/5">
          <h3 class="font-bold text-white mb-4">DLQ 상태</h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-dark-900 rounded-xl p-5 text-center">
              <div class="text-sm text-gray-400 mb-2">누적 실패</div>
              <div class="text-4xl font-bold text-red-400 mb-2">84</div>
              <div class="text-xs bg-red-500/20 text-red-400 px-3 py-1 rounded-full inline-block">감지중 12</div>
            </div>
            <div class="bg-dark-900 rounded-xl p-5 text-center">
              <div class="text-sm text-gray-400 mb-2">재시도 중</div>
              <div class="text-4xl font-bold text-yellow-400 mb-2">22</div>
              <div class="text-xs bg-red-500/20 text-red-400 px-3 py-1 rounded-full inline-block">실패 72</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <script>
    // Error Rate Chart
    new Chart(document.getElementById('errorChart'), {
      type: 'line',
      data: {
        labels: ['12AM','3AM','6AM','9AM','12PM','3PM','6PM','9PM'],
        datasets: [{
          data: [2.1, 3.5, 5.2, 4.8, 3.2, 2.8, 3.8, 3.1],
          borderColor: '#EF4444',
          backgroundColor: 'rgba(239,68,68,0.15)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#EF4444'
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 7, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', font: { size: 10 }, callback: v => v + '%' } },
          x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10 } } }
        }
      }
    });
  </script>
</body>
</html>`
}
