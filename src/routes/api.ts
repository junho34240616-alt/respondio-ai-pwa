import { Hono } from 'hono'

type Bindings = { DB: D1Database }

export const apiRoutes = new Hono<{ Bindings: Bindings }>()

// ============ AUTH ============
apiRoutes.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json()
  const db = c.env.DB
  const user = await db.prepare('SELECT id, email, name, role FROM users WHERE email = ?').bind(email).first()
  if (!user) return c.json({ error: 'User not found' }, 404)
  return c.json({ user, token: 'demo-token-' + user.id })
})

apiRoutes.post('/auth/signup', async (c) => {
  const { email, password, name } = await c.req.json()
  const db = c.env.DB
  try {
    const result = await db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)').bind(email, 'hashed_' + password, name).run()
    return c.json({ success: true, user_id: result.meta.last_row_id })
  } catch (e: any) {
    return c.json({ error: e.message }, 400)
  }
})

// ============ REVIEWS ============
apiRoutes.get('/reviews', async (c) => {
  const db = c.env.DB
  const limit = Number(c.req.query('limit') || 50)
  const status = c.req.query('status')
  const platform = c.req.query('platform')
  const sentiment = c.req.query('sentiment')

  let query = `
    SELECT r.*, 
           rc.reply_text as candidate_text, 
           rc.quality_score,
           rep.final_reply_text as reply_text
    FROM reviews r
    LEFT JOIN reply_candidates rc ON rc.review_id = r.id AND rc.is_selected = 1
    LEFT JOIN replies rep ON rep.review_id = r.id
    WHERE r.store_id = 1
  `
  const params: any[] = []

  if (status) { query += ' AND r.status = ?'; params.push(status) }
  if (platform) { query += ' AND r.platform = ?'; params.push(platform) }
  if (sentiment) { query += ' AND r.sentiment = ?'; params.push(sentiment) }

  query += ' ORDER BY r.created_at DESC LIMIT ?'
  params.push(limit)

  const stmt = db.prepare(query)
  const result = await (params.length > 0 ? stmt.bind(...params) : stmt).all()
  return c.json({ reviews: result.results })
})

apiRoutes.post('/reviews/:id/generate', async (c) => {
  const reviewId = c.req.param('id')
  const db = c.env.DB
  const review = await db.prepare('SELECT * FROM reviews WHERE id = ?').bind(reviewId).first()
  if (!review) return c.json({ error: 'Review not found' }, 404)

  // Demo AI response generation
  const templates: Record<string, string[]> = {
    positive: [
      '리뷰 남겨주셔서 정말 감사합니다! 맛있게 드셨다니 보람차네요. 앞으로도 변함없는 맛으로 보답하겠습니다. 또 찾아주세요! 😊',
      '소중한 리뷰 감사합니다! 고객님의 만족이 저희의 원동력입니다. 다음에도 맛있는 음식으로 찾아뵙겠습니다!',
    ],
    negative: [
      '소중한 의견 감사합니다. 불편을 드려 정말 죄송합니다. 말씀해주신 부분을 꼭 개선하겠습니다. 다음엔 더 좋은 모습 보여드리겠습니다.',
      '리뷰 감사합니다. 기대에 못 미쳐 죄송합니다. 품질 개선에 최선을 다하겠습니다. 다시 기회를 주시면 감사하겠습니다.',
    ],
    neutral: [
      '리뷰 감사합니다! 더 나은 서비스를 위해 노력하겠습니다. 다음에도 맛있는 음식으로 찾아뵙겠습니다!',
      '소중한 리뷰 감사합니다. 말씀해주신 부분을 참고하여 더 좋은 음식을 만들겠습니다. 감사합니다!',
    ]
  }

  const sentiment = (review.sentiment as string) || 'neutral'
  const options = templates[sentiment] || templates.neutral
  const replyText = options[Math.floor(Math.random() * options.length)]
  const qualityScore = 7.5 + Math.random() * 2.5

  await db.prepare(
    'INSERT INTO reply_candidates (review_id, reply_text, style_type, quality_score, is_selected) VALUES (?, ?, ?, ?, 1)'
  ).bind(reviewId, replyText, 'friendly', qualityScore.toFixed(1)).run()

  await db.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind('generated', reviewId).run()

  return c.json({ reply_text: replyText, quality_score: qualityScore.toFixed(1) })
})

apiRoutes.post('/reviews/approve', async (c) => {
  const { review_ids } = await c.req.json()
  const db = c.env.DB
  for (const id of review_ids) {
    const candidate = await db.prepare(
      'SELECT * FROM reply_candidates WHERE review_id = ? AND is_selected = 1'
    ).bind(id).first()
    if (candidate) {
      await db.prepare(
        'INSERT INTO replies (review_id, candidate_id, final_reply_text, post_status) VALUES (?, ?, ?, ?)'
      ).bind(id, candidate.id, candidate.reply_text, 'posted').run()
      await db.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind('posted', id).run()
    }
  }
  return c.json({ success: true, approved_count: review_ids.length })
})

// ============ DASHBOARD ============
apiRoutes.get('/dashboard/summary', async (c) => {
  const db = c.env.DB
  const storeId = 1

  const totalReviews = await db.prepare('SELECT COUNT(*) as count FROM reviews WHERE store_id = ?').bind(storeId).first()
  const pendingReviews = await db.prepare("SELECT COUNT(*) as count FROM reviews WHERE store_id = ? AND status = 'pending'").bind(storeId).first()
  const avgRating = await db.prepare('SELECT AVG(rating) as avg FROM reviews WHERE store_id = ?').bind(storeId).first()
  const positiveCount = await db.prepare("SELECT COUNT(*) as count FROM reviews WHERE store_id = ? AND sentiment = 'positive'").bind(storeId).first()
  const totalForRatio = await db.prepare('SELECT COUNT(*) as count FROM reviews WHERE store_id = ?').bind(storeId).first()
  const repeatCustomers = await db.prepare("SELECT COUNT(*) as count FROM customers WHERE store_id = ? AND customer_type IN ('repeat','loyal')").bind(storeId).first()
  const totalCustomers = await db.prepare('SELECT COUNT(*) as count FROM customers WHERE store_id = ?').bind(storeId).first()

  return c.json({
    total_reviews: totalReviews?.count || 0,
    pending_reviews: pendingReviews?.count || 0,
    avg_rating: Number((avgRating?.avg as number || 0)).toFixed(1),
    positive_ratio: totalForRatio?.count ? Math.round(((positiveCount?.count as number || 0) / (totalForRatio?.count as number)) * 100) : 0,
    repeat_customer_ratio: totalCustomers?.count ? Math.round(((repeatCustomers?.count as number || 0) / (totalCustomers?.count as number)) * 100) : 0,
    ai_quality_score: 9.2
  })
})

apiRoutes.get('/dashboard/menus', async (c) => {
  const db = c.env.DB
  const reviews = await db.prepare("SELECT menu_items, rating FROM reviews WHERE store_id = 1 AND menu_items IS NOT NULL").all()
  
  const menuRatings: Record<string, { total: number; count: number }> = {}
  for (const r of reviews.results) {
    try {
      const menus = JSON.parse(r.menu_items as string)
      for (const menu of menus) {
        if (!menuRatings[menu]) menuRatings[menu] = { total: 0, count: 0 }
        menuRatings[menu].total += r.rating as number
        menuRatings[menu].count += 1
      }
    } catch (e) {}
  }

  const result = Object.entries(menuRatings)
    .map(([name, data]) => ({ name, avg_rating: (data.total / data.count).toFixed(1), review_count: data.count }))
    .sort((a, b) => Number(b.avg_rating) - Number(a.avg_rating))
    .slice(0, 10)

  return c.json({ menus: result })
})

apiRoutes.get('/dashboard/repeat_customers', async (c) => {
  const db = c.env.DB
  const customers = await db.prepare(
    "SELECT * FROM customers WHERE store_id = 1 AND customer_type IN ('repeat','loyal') ORDER BY order_count DESC LIMIT 10"
  ).all()
  return c.json({ customers: customers.results })
})

apiRoutes.get('/dashboard/daily_trend', async (c) => {
  const db = c.env.DB
  const summaries = await db.prepare(
    'SELECT * FROM dashboard_daily_summaries WHERE store_id = 1 ORDER BY summary_date DESC LIMIT 7'
  ).all()
  return c.json({ summaries: summaries.results })
})

// ============ PLANS ============
apiRoutes.get('/plans', async (c) => {
  const db = c.env.DB
  const plans = await db.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY price ASC').all()
  return c.json({ plans: plans.results })
})

// ============ SUBSCRIPTIONS ============
apiRoutes.get('/subscriptions', async (c) => {
  const db = c.env.DB
  const sub = await db.prepare(`
    SELECT s.*, p.name as plan_name, p.price, p.review_limit
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.user_id = 1 AND s.status = 'active'
  `).first()
  return c.json({ subscription: sub })
})

// ============ PAYMENTS ============
apiRoutes.get('/payments', async (c) => {
  const db = c.env.DB
  const payments = await db.prepare('SELECT * FROM payments WHERE user_id = 1 ORDER BY created_at DESC LIMIT 10').all()
  return c.json({ payments: payments.results })
})

// ============ PAYMENT METHODS ============
apiRoutes.get('/payment_methods', async (c) => {
  const db = c.env.DB
  const methods = await db.prepare('SELECT * FROM payment_methods WHERE user_id = 1').all()
  return c.json({ payment_methods: methods.results })
})

// ============ PLATFORM CONNECTIONS ============
apiRoutes.get('/platform_connections', async (c) => {
  const db = c.env.DB
  const connections = await db.prepare('SELECT * FROM store_platform_connections WHERE store_id = 1').all()
  return c.json({ connections: connections.results })
})

// ============ ADMIN ============
apiRoutes.get('/admin/users', async (c) => {
  const db = c.env.DB
  const users = await db.prepare('SELECT id, email, name, role, status, created_at FROM users ORDER BY created_at DESC').all()
  return c.json({ users: users.results })
})

apiRoutes.get('/admin/logs', async (c) => {
  const db = c.env.DB
  const logs = await db.prepare('SELECT * FROM job_logs ORDER BY created_at DESC LIMIT 50').all()
  return c.json({ logs: logs.results })
})

apiRoutes.get('/admin/stats', async (c) => {
  const db = c.env.DB
  const totalUsers = await db.prepare('SELECT COUNT(*) as count FROM users').first()
  const activeSubscriptions = await db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'").first()
  const failedJobs = await db.prepare("SELECT COUNT(*) as count FROM job_logs WHERE status = 'failed'").first()
  const dlqJobs = await db.prepare("SELECT COUNT(*) as count FROM job_logs WHERE status = 'dlq'").first()
  const processingJobs = await db.prepare("SELECT COUNT(*) as count FROM job_logs WHERE status = 'processing'").first()
  const completedJobs = await db.prepare("SELECT COUNT(*) as count FROM job_logs WHERE status = 'completed'").first()

  return c.json({
    total_users: totalUsers?.count || 0,
    active_subscriptions: activeSubscriptions?.count || 0,
    failed_jobs: failedJobs?.count || 0,
    dlq_jobs: dlqJobs?.count || 0,
    processing_jobs: processingJobs?.count || 0,
    completed_jobs: completedJobs?.count || 0,
    error_rate: 3.8
  })
})

apiRoutes.post('/admin/jobs/:id/retry', async (c) => {
  const jobId = c.req.param('id')
  const db = c.env.DB
  await db.prepare("UPDATE job_logs SET status = 'pending', retry_count = retry_count + 1 WHERE id = ?").bind(jobId).run()
  return c.json({ success: true })
})
