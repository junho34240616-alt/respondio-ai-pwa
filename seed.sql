-- Respondio Seed Data

-- 요금제 데이터
INSERT OR IGNORE INTO plans (name, slug, price, review_limit, features) VALUES
  ('베이직', 'basic', 29000, 300, '{"analytics":"basic","reply_style":"default"}'),
  ('프로', 'pro', 59000, 800, '{"analytics":"advanced","reply_style":"custom","tone_learning":true}'),
  ('프리미엄', 'premium', 99000, 2000, '{"analytics":"premium","reply_style":"custom","tone_learning":true,"priority_support":true}');

-- 테스트 사용자
INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES
  ('owner@test.com', 'hashed_password_123', '김사장', 'owner'),
  ('admin@respondio.com', 'hashed_admin_123', '관리자', 'super_admin');

-- 테스트 매장
INSERT OR IGNORE INTO stores (user_id, store_name, business_number_masked, reply_style) VALUES
  (1, '맛있는 치킨집', '123-45-***', 'friendly');

-- 플랫폼 연결
INSERT OR IGNORE INTO store_platform_connections (store_id, platform, connection_status, platform_store_id) VALUES
  (1, 'baemin', 'connected', 'BM-12345'),
  (1, 'coupang_eats', 'connected', 'CE-67890'),
  (1, 'yogiyo', 'connected', 'YG-11111');

-- 테스트 리뷰 데이터
INSERT OR IGNORE INTO reviews (store_id, platform, platform_review_id, customer_name, rating, review_text, menu_items, sentiment, status, is_repeat_customer, customer_type, created_at) VALUES
  (1, 'baemin', 'baemin-seed-001', '김민수', 5.0, '치킨이 진짜 맛있어요! 배달도 빠르고 감자튀김도 바삭해요. 항상 만족합니다.', '["양념치킨","감자튀김"]', 'positive', 'posted', 1, 'loyal', datetime('now', '-2 hours')),
  (1, 'yogiyo', 'yogiyo-seed-002', '이영희', 4.0, '피자가 조금 식어서 왔어요. 그래도 맛은 괜찮았습니다.', '["페퍼로니 피자","콜라 1.25L"]', 'neutral', 'generated', 0, 'new', datetime('now', '-4 hours')),
  (1, 'coupang_eats', 'coupang-seed-003', '박지훈', 5.0, '항상 시켜 먹는 집이에요. 오늘도 맛있게 잘 먹었어요!', '["제육볶음","김치찌개"]', 'positive', 'approved', 1, 'loyal', datetime('now', '-6 hours')),
  (1, 'baemin', 'baemin-seed-004', '최수진', 3.0, '음식이 너무 늦게 왔어요. 가격에 비해 양도 적어요.', '["불고기 덮밥"]', 'negative', 'pending', 0, 'new', datetime('now', '-8 hours')),
  (1, 'baemin', 'baemin-seed-005', '정유진', 5.0, '여기 치킨은 언제 먹어도 맛있어요! 소스도 맛있고 양도 충분해요.', '["후라이드치킨","양념소스"]', 'positive', 'posted', 1, 'repeat', datetime('now', '-1 day')),
  (1, 'coupang_eats', 'coupang-seed-006', '한민지', 4.0, '배달은 빨랐는데 국물이 좀 쏟아져 왔어요. 맛은 좋아요.', '["김치찌개","공기밥"]', 'neutral', 'pending', 0, 'new', datetime('now', '-1 day')),
  (1, 'yogiyo', 'yogiyo-seed-007', '오세훈', 5.0, '사장님이 서비스도 넣어주시고 감동이에요. 단골될게요!', '["떡볶이","순대","튀김"]', 'positive', 'posted', 0, 'new', datetime('now', '-2 days')),
  (1, 'baemin', 'baemin-seed-008', '이원지', 4.0, '음식이 너무 늦게 왔어요. 가성비는 괜찮습니다.', '["비빔밥","된장찌개"]', 'negative', 'pending', 0, 'new', datetime('now', '-3 hours')),
  (1, 'baemin', 'baemin-seed-009', '박형준', 5.0, '항상 여기서 주문해요! 최고에요~', '["간장치킨","맥주"]', 'positive', 'posted', 1, 'loyal', datetime('now', '-2 days')),
  (1, 'coupang_eats', 'coupang-seed-010', '김태영', 4.5, '맛있게 잘 먹었습니다. 다음에도 주문할게요.', '["돈까스","우동"]', 'positive', 'generated', 1, 'repeat', datetime('now', '-3 days')),
  (1, 'yogiyo', 'yogiyo-seed-011', '윤서연', 2.0, '기대보다 별로였어요. 양도 적고 맛도 그냥 그래요.', '["짜장면"]', 'negative', 'pending', 0, 'new', datetime('now', '-4 days')),
  (1, 'baemin', 'baemin-seed-012', '장현우', 5.0, '매번 주문하는데 한번도 실망한 적이 없어요!', '["양념치킨","치즈볼"]', 'positive', 'posted', 1, 'loyal', datetime('now', '-5 days'));

-- AI 답변 후보 데이터
INSERT OR IGNORE INTO reply_candidates (review_id, reply_text, style_type, quality_score, is_selected) VALUES
  (1, '리뷰 남겨주셔서 감사합니다! 빠른 배달과 맛있는 치킨이 만족스러우셨다니 다행입니다. 앞으로도 맛있는 음식과 빠른 서비스로 보답하겠습니다. 언제든 찾아주세요!', 'friendly', 9.1, 1),
  (2, '리뷰 감사합니다! 피자가 식어서 도착했다니 정말 죄송합니다. 다음에는 더 빠르게 배달될 수 있도록 노력하겠습니다. 맛은 괜찮으셨다니 다행이에요!', 'polite', 8.5, 1),
  (3, '항상 찾아주셔서 감사합니다! 오늘도 맛있게 드셨다니 기분 좋습니다. 단골 고객님께 항상 최고의 맛을 드리겠습니다!', 'friendly', 9.3, 1),
  (4, '소중한 리뷰 감사합니다. 배달이 늦어져서 정말 죄송합니다. 양과 가격에 대해서도 다시 검토해보겠습니다. 다음엔 더 좋은 모습 보여드리겠습니다.', 'polite', 8.8, 0);

-- 최종 답변 데이터
INSERT OR IGNORE INTO replies (review_id, candidate_id, final_reply_text, posted_at, post_status) VALUES
  (1, 1, '리뷰 남겨주셔서 감사합니다! 빠른 배달과 맛있는 치킨이 만족스러우셨다니 다행입니다. 앞으로도 맛있는 음식과 빠른 서비스로 보답하겠습니다. 언제든 찾아주세요!', datetime('now', '-1 hour'), 'posted'),
  (5, NULL, '항상 찾아주셔서 정말 감사합니다! 치킨과 소스 모두 마음에 드셨다니 보람차네요. 단골 고객님 덕분에 힘을 내고 있답니다!', datetime('now', '-20 hours'), 'posted'),
  (7, NULL, '감동적인 리뷰 감사합니다! 서비스가 마음에 드셨다니 기쁩니다. 꼭 단골 되어주세요, 항상 정성껏 준비하겠습니다!', datetime('now', '-2 days'), 'posted'),
  (9, NULL, '항상 믿고 주문해주셔서 감사합니다! 앞으로도 변함없는 맛으로 보답하겠습니다. 간장치킨 최고죠!', datetime('now', '-2 days'), 'posted'),
  (12, NULL, '매번 찾아주시는 단골 고객님! 한번도 실망시키지 않았다니 정말 감사합니다. 앞으로도 더 맛있는 치킨 만들겠습니다!', datetime('now', '-5 days'), 'posted');

-- 고객 데이터
INSERT OR IGNORE INTO customers (store_id, customer_key, customer_name, customer_type, order_count, last_order_at, favorite_menu) VALUES
  (1, 'baemin-김민수', '김민수', 'loyal', 12, datetime('now', '-2 hours'), '양념치킨'),
  (1, 'coupang-박지훈', '박지훈', 'loyal', 15, datetime('now', '-6 hours'), '제육볶음'),
  (1, 'baemin-정유진', '정유진', 'repeat', 8, datetime('now', '-1 day'), '후라이드치킨'),
  (1, 'coupang-김태영', '김태영', 'repeat', 5, datetime('now', '-3 days'), '돈까스'),
  (1, 'baemin-박형준', '박형준', 'loyal', 20, datetime('now', '-2 days'), '간장치킨'),
  (1, 'baemin-장현우', '장현우', 'loyal', 18, datetime('now', '-5 days'), '양념치킨');

-- 구독 데이터
INSERT OR IGNORE INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end) VALUES
  (1, 2, 'active', datetime('now', '-30 days'), datetime('now', '+30 days'));

-- 결제 데이터
INSERT OR IGNORE INTO payments (user_id, subscription_id, amount, status, payment_method, paid_at) VALUES
  (1, 1, 59000, 'completed', 'card', datetime('now', '-30 days')),
  (1, 1, 59000, 'completed', 'card', datetime('now', '-60 days')),
  (1, 1, 59000, 'completed', 'card', datetime('now', '-90 days')),
  (1, 1, 59000, 'completed', 'card', datetime('now', '-120 days'));

-- 결제 수단
INSERT OR IGNORE INTO payment_methods (user_id, type, card_last4, card_brand, expiry_date, is_default) VALUES
  (1, 'card', '4242', 'VISA', '08/27', 1);

-- 대시보드 일별 요약 (최근 7일)
INSERT OR IGNORE INTO dashboard_daily_summaries (store_id, summary_date, total_reviews, responded_reviews, avg_rating, positive_count, negative_count, neutral_count, repeat_customer_count, new_customer_count) VALUES
  (1, date('now'), 8, 5, 4.6, 5, 2, 1, 3, 5),
  (1, date('now', '-1 day'), 12, 10, 4.4, 8, 2, 2, 4, 8),
  (1, date('now', '-2 days'), 10, 9, 4.5, 7, 1, 2, 3, 7),
  (1, date('now', '-3 days'), 15, 14, 4.3, 9, 3, 3, 5, 10),
  (1, date('now', '-4 days'), 9, 8, 4.7, 7, 1, 1, 2, 7),
  (1, date('now', '-5 days'), 11, 10, 4.2, 6, 3, 2, 4, 7),
  (1, date('now', '-6 days'), 13, 12, 4.5, 8, 2, 3, 5, 8);

-- 작업 로그
INSERT OR IGNORE INTO job_logs (job_type, status, payload, error_message, created_at) VALUES
  ('review_sync', 'completed', '{"platform":"baemin","store_id":1}', NULL, datetime('now', '-1 hour')),
  ('ai_generate', 'completed', '{"review_id":1}', NULL, datetime('now', '-50 minutes')),
  ('reply_post', 'completed', '{"reply_id":1}', NULL, datetime('now', '-45 minutes')),
  ('review_sync', 'failed', '{"platform":"yogiyo","store_id":1}', 'API Timeout: Request timed out.', datetime('now', '-30 minutes')),
  ('reply_post', 'failed', '{"reply_id":99}', 'Payment declined: Card expired.', datetime('now', '-20 minutes')),
  ('review_sync', 'processing', '{"platform":"coupang_eats","store_id":1}', NULL, datetime('now', '-5 minutes')),
  ('ai_generate', 'failed', '{"review_id":999}', 'Database Connection Error.', datetime('now', '-15 minutes')),
  ('review_sync', 'dlq', '{"platform":"baemin","store_id":2}', 'Login Failed: Invalid password.', datetime('now', '-10 minutes'));

-- 금칙어 데이터
INSERT OR IGNORE INTO banned_words (word, created_by) VALUES
  ('비속어1', 2),
  ('광고', 2),
  ('경쟁사이름', 2);
