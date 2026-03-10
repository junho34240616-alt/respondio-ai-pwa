-- Respondio: AI 배달 리뷰 자동답변 SaaS DB Schema

-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'owner' CHECK(role IN ('owner','admin','super_admin')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active','suspended','deleted')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 매장 테이블
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  store_name TEXT NOT NULL,
  business_number_masked TEXT,
  reply_style TEXT DEFAULT 'friendly' CHECK(reply_style IN ('friendly','polite','casual','custom')),
  reply_tone_sample TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 플랫폼 연결 테이블
CREATE TABLE IF NOT EXISTS store_platform_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('baemin','coupang_eats','yogiyo')),
  connection_status TEXT DEFAULT 'connected' CHECK(connection_status IN ('connected','disconnected','error')),
  platform_store_id TEXT,
  last_sync_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  UNIQUE(store_id, platform)
);

-- 리뷰 테이블
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('baemin','coupang_eats','yogiyo')),
  platform_review_id TEXT,
  customer_name TEXT,
  rating REAL,
  review_text TEXT,
  menu_items TEXT, -- JSON array
  order_date DATETIME,
  sentiment TEXT CHECK(sentiment IN ('positive','neutral','negative')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','generated','approved','posted','failed')),
  is_repeat_customer INTEGER DEFAULT 0,
  customer_type TEXT DEFAULT 'new' CHECK(customer_type IN ('new','repeat','loyal')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- AI 답변 후보 테이블
CREATE TABLE IF NOT EXISTS reply_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL,
  reply_text TEXT NOT NULL,
  style_type TEXT,
  quality_score REAL DEFAULT 0,
  is_selected INTEGER DEFAULT 0,
  regenerate_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id)
);

-- 최종 답변 테이블
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL,
  candidate_id INTEGER,
  final_reply_text TEXT NOT NULL,
  posted_at DATETIME,
  post_status TEXT DEFAULT 'pending' CHECK(post_status IN ('pending','posted','failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id),
  FOREIGN KEY (candidate_id) REFERENCES reply_candidates(id)
);

-- 고객 테이블
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  customer_key TEXT NOT NULL,
  customer_name TEXT,
  customer_type TEXT DEFAULT 'new' CHECK(customer_type IN ('new','repeat','loyal')),
  order_count INTEGER DEFAULT 1,
  last_order_at DATETIME,
  favorite_menu TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  UNIQUE(store_id, customer_key)
);

-- 금칙어 테이블
CREATE TABLE IF NOT EXISTS banned_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL UNIQUE,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 요금제 테이블
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  price INTEGER NOT NULL, -- 원 단위
  review_limit INTEGER NOT NULL,
  features TEXT, -- JSON
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 구독 테이블
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','cancelled','expired','past_due')),
  current_period_start DATETIME,
  current_period_end DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

-- 결제 테이블
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subscription_id INTEGER,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'KRW',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','completed','failed','refunded')),
  payment_method TEXT,
  transaction_id TEXT,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

-- 결제 수단 테이블
CREATE TABLE IF NOT EXISTS payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT DEFAULT 'card',
  card_last4 TEXT,
  card_brand TEXT,
  expiry_date TEXT,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 대시보드 일별 요약 테이블
CREATE TABLE IF NOT EXISTS dashboard_daily_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  summary_date DATE NOT NULL,
  total_reviews INTEGER DEFAULT 0,
  responded_reviews INTEGER DEFAULT 0,
  avg_rating REAL DEFAULT 0,
  positive_count INTEGER DEFAULT 0,
  negative_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  repeat_customer_count INTEGER DEFAULT 0,
  new_customer_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  UNIQUE(store_id, summary_date)
);

-- 작업 로그 테이블
CREATE TABLE IF NOT EXISTS job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed','dlq')),
  payload TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_reviews_store_id ON reviews(store_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_platform ON reviews(platform);
CREATE INDEX IF NOT EXISTS idx_reviews_sentiment ON reviews(sentiment);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_store_date ON dashboard_daily_summaries(store_id, summary_date);
CREATE INDEX IF NOT EXISTS idx_job_logs_status ON job_logs(status);
