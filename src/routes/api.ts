import { Hono } from 'hono'
import { generateReply, analyzeSentiment, batchAnalyzeSentiments } from '../services/ai'

type Bindings = {
  DB: D1Database
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
}

export const apiRoutes = new Hono<{ Bindings: Bindings }>()

// AI config helper
function getAIConfig(c: any) {
  return {
    apiKey: c.env.OPENAI_API_KEY || '',
    baseUrl: c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  }
}

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

// ============ AI REPLY GENERATION (GPT 연동) ============
apiRoutes.post('/reviews/:id/generate', async (c) => {
  const reviewId = c.req.param('id')
  const db = c.env.DB
  const aiConfig = getAIConfig(c)

  const review = await db.prepare('SELECT r.*, s.store_name, s.reply_style, s.reply_tone_sample FROM reviews r JOIN stores s ON s.id = r.store_id WHERE r.id = ?').bind(reviewId).first()
  if (!review) return c.json({ error: 'Review not found' }, 404)

  // 재생성 횟수 체크 (최대 3회)
  const existingCandidates = await db.prepare('SELECT COUNT(*) as count FROM reply_candidates WHERE review_id = ?').bind(reviewId).first()
  if ((existingCandidates?.count as number || 0) >= 3) {
    return c.json({ error: '재생성 횟수 초과 (최대 3회)', max_regenerations: true }, 400)
  }

  // 금칙어 조회
  const bannedWordsResult = await db.prepare('SELECT word FROM banned_words').all()
  const bannedWords = bannedWordsResult.results.map((bw: any) => bw.word)

  // 메뉴 아이템 파싱
  let menuItems: string[] = []
  try { menuItems = JSON.parse(review.menu_items as string || '[]') } catch (e) {}

  // 감정 분석 (아직 안 되어 있으면 GPT로 분석)
  let sentiment = review.sentiment as string
  if (!sentiment && aiConfig.apiKey) {
    try {
      const sentimentResult = await analyzeSentiment(aiConfig, review.review_text as string)
      sentiment = sentimentResult.sentiment
      // DB에 감정 분석 결과 저장
      await db.prepare('UPDATE reviews SET sentiment = ? WHERE id = ?').bind(sentiment, reviewId).run()
    } catch (e) {
      sentiment = 'neutral'
    }
  }

  // GPT API 키가 있으면 실제 AI 답변 생성, 없으면 템플릿 fallback
  let replyText: string
  let qualityScore: number
  let styleUsed: string

  if (aiConfig.apiKey) {
    try {
      const result = await generateReply(aiConfig, {
        review_text: review.review_text as string,
        rating: review.rating as number,
        customer_name: review.customer_name as string,
        menu_items: menuItems,
        platform: review.platform as string,
        customer_type: (review.customer_type as 'new' | 'repeat' | 'loyal') || 'new',
        sentiment,
        store_name: review.store_name as string,
        reply_style: (review.reply_style as any) || 'friendly',
        reply_tone_sample: review.reply_tone_sample as string,
        banned_words: bannedWords
      })

      replyText = result.reply_text
      qualityScore = result.quality_score
      styleUsed = result.style_used

      // 감정 분석 결과 업데이트
      if (result.sentiment !== sentiment) {
        await db.prepare('UPDATE reviews SET sentiment = ? WHERE id = ?').bind(result.sentiment, reviewId).run()
        sentiment = result.sentiment
      }
    } catch (e: any) {
      console.error('GPT API error, falling back to template:', e.message)
      // Fallback to template
      const fallback = getTemplateFallback(sentiment, review.customer_name as string)
      replyText = fallback.text
      qualityScore = fallback.score
      styleUsed = 'template_fallback'
    }
  } else {
    const fallback = getTemplateFallback(sentiment, review.customer_name as string)
    replyText = fallback.text
    qualityScore = fallback.score
    styleUsed = 'template'
  }

  // 기존 선택 해제
  await db.prepare('UPDATE reply_candidates SET is_selected = 0 WHERE review_id = ?').bind(reviewId).run()

  // 새 후보 저장
  await db.prepare(
    'INSERT INTO reply_candidates (review_id, reply_text, style_type, quality_score, is_selected, regenerate_count) VALUES (?, ?, ?, ?, 1, ?)'
  ).bind(reviewId, replyText, styleUsed, qualityScore, (existingCandidates?.count as number || 0) + 1).run()

  // 리뷰 상태 업데이트
  await db.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind('generated', reviewId).run()

  return c.json({
    reply_text: replyText,
    quality_score: qualityScore,
    sentiment,
    style_used: styleUsed,
    regeneration_count: (existingCandidates?.count as number || 0) + 1,
    max_regenerations: 3,
    ai_powered: !!aiConfig.apiKey
  })
})

// ============ AI SENTIMENT ANALYSIS ============
apiRoutes.post('/reviews/:id/analyze', async (c) => {
  const reviewId = c.req.param('id')
  const db = c.env.DB
  const aiConfig = getAIConfig(c)

  if (!aiConfig.apiKey) return c.json({ error: 'AI API key not configured' }, 500)

  const review = await db.prepare('SELECT * FROM reviews WHERE id = ?').bind(reviewId).first()
  if (!review) return c.json({ error: 'Review not found' }, 404)

  const result = await analyzeSentiment(aiConfig, review.review_text as string)

  // DB 업데이트
  await db.prepare('UPDATE reviews SET sentiment = ? WHERE id = ?').bind(result.sentiment, reviewId).run()

  return c.json({
    review_id: reviewId,
    ...result
  })
})

// ============ BATCH SENTIMENT ANALYSIS ============
apiRoutes.post('/reviews/batch-analyze', async (c) => {
  const db = c.env.DB
  const aiConfig = getAIConfig(c)

  if (!aiConfig.apiKey) return c.json({ error: 'AI API key not configured' }, 500)

  // 감정 분석이 안 된 리뷰들 조회
  const unanalyzed = await db.prepare(
    "SELECT id, review_text FROM reviews WHERE store_id = 1 AND sentiment IS NULL LIMIT 20"
  ).all()

  if (!unanalyzed.results.length) return c.json({ message: 'No reviews to analyze', count: 0 })

  const results = await batchAnalyzeSentiments(
    aiConfig,
    unanalyzed.results.map((r: any) => ({ id: r.id, review_text: r.review_text }))
  )

  // 결과 DB 업데이트
  for (const r of results) {
    await db.prepare('UPDATE reviews SET sentiment = ? WHERE id = ?').bind(r.sentiment, r.id).run()
  }

  return c.json({ analyzed_count: results.length, results })
})

// ============ BATCH GENERATE (미답변 리뷰 일괄 AI 답변 생성) ============
apiRoutes.post('/reviews/batch-generate', async (c) => {
  const db = c.env.DB
  const aiConfig = getAIConfig(c)

  if (!aiConfig.apiKey) return c.json({ error: 'AI API key not configured' }, 500)

  const pendingReviews = await db.prepare(
    "SELECT r.*, s.store_name, s.reply_style, s.reply_tone_sample FROM reviews r JOIN stores s ON s.id = r.store_id WHERE r.store_id = 1 AND r.status = 'pending' LIMIT 10"
  ).all()

  if (!pendingReviews.results.length) return c.json({ message: 'No pending reviews', count: 0 })

  const bannedWordsResult = await db.prepare('SELECT word FROM banned_words').all()
  const bannedWords = bannedWordsResult.results.map((bw: any) => bw.word)

  const generated: any[] = []

  for (const review of pendingReviews.results) {
    try {
      let menuItems: string[] = []
      try { menuItems = JSON.parse(review.menu_items as string || '[]') } catch (e) {}

      const result = await generateReply(aiConfig, {
        review_text: review.review_text as string,
        rating: review.rating as number,
        customer_name: review.customer_name as string,
        menu_items: menuItems,
        platform: review.platform as string,
        customer_type: (review.customer_type as any) || 'new',
        sentiment: review.sentiment as string,
        store_name: review.store_name as string,
        reply_style: (review.reply_style as any) || 'friendly',
        reply_tone_sample: review.reply_tone_sample as string,
        banned_words: bannedWords
      })

      // DB 저장
      await db.prepare(
        'INSERT INTO reply_candidates (review_id, reply_text, style_type, quality_score, is_selected, regenerate_count) VALUES (?, ?, ?, ?, 1, 1)'
      ).bind(review.id, result.reply_text, result.style_used, result.quality_score).run()

      await db.prepare('UPDATE reviews SET status = ?, sentiment = ? WHERE id = ?')
        .bind('generated', result.sentiment, review.id).run()

      generated.push({
        review_id: review.id,
        reply_text: result.reply_text,
        quality_score: result.quality_score,
        sentiment: result.sentiment
      })
    } catch (e: any) {
      console.error(`Failed to generate for review ${review.id}:`, e.message)
    }
  }

  return c.json({ generated_count: generated.length, generated })
})

// ============ APPROVE ============
apiRoutes.post('/reviews/approve', async (c) => {
  const { review_ids } = await c.req.json()
  const db = c.env.DB
  for (const id of review_ids) {
    const candidate = await db.prepare(
      'SELECT * FROM reply_candidates WHERE review_id = ? AND is_selected = 1'
    ).bind(id).first()
    if (candidate) {
      await db.prepare(
        'INSERT OR REPLACE INTO replies (review_id, candidate_id, final_reply_text, posted_at, post_status) VALUES (?, ?, ?, datetime("now"), ?)'
      ).bind(id, candidate.id, candidate.reply_text, 'posted').run()
      await db.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind('posted', id).run()
    }
  }
  return c.json({ success: true, approved_count: review_ids.length })
})

// ============ REPLY EDIT ============
apiRoutes.patch('/reviews/:id/reply', async (c) => {
  const reviewId = c.req.param('id')
  const { reply_text } = await c.req.json()
  const db = c.env.DB

  // 기존 후보 업데이트
  await db.prepare(
    'UPDATE reply_candidates SET reply_text = ? WHERE review_id = ? AND is_selected = 1'
  ).bind(reply_text, reviewId).run()

  return c.json({ success: true, review_id: reviewId })
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
  const avgQuality = await db.prepare('SELECT AVG(quality_score) as avg FROM reply_candidates WHERE is_selected = 1 AND review_id IN (SELECT id FROM reviews WHERE store_id = ?)').bind(storeId).first()

  return c.json({
    total_reviews: totalReviews?.count || 0,
    pending_reviews: pendingReviews?.count || 0,
    avg_rating: Number((avgRating?.avg as number || 0)).toFixed(1),
    positive_ratio: totalForRatio?.count ? Math.round(((positiveCount?.count as number || 0) / (totalForRatio?.count as number)) * 100) : 0,
    repeat_customer_ratio: totalCustomers?.count ? Math.round(((repeatCustomers?.count as number || 0) / (totalCustomers?.count as number)) * 100) : 0,
    ai_quality_score: avgQuality?.avg ? Number((avgQuality.avg as number).toFixed(1)) : 9.2
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

// ============ TEMPLATE FALLBACK ============
function getTemplateFallback(sentiment: string, customerName: string) {
  const templates: Record<string, { text: string; score: number }[]> = {
    positive: [
      { text: `${customerName}님, 리뷰 남겨주셔서 감사합니다! 맛있게 드셨다니 정말 기쁘네요. 다음에도 맛있는 음식으로 보답하겠습니다 😊`, score: 7.5 },
      { text: `${customerName}님 감사합니다! 만족하셨다니 보람차네요. 앞으로도 변함없는 맛으로 찾아뵙겠습니다!`, score: 7.3 },
    ],
    negative: [
      { text: `${customerName}님, 불편을 드려 정말 죄송합니다. 말씀해주신 부분 꼭 개선하겠습니다. 다음엔 더 좋은 모습 보여드리겠습니다.`, score: 7.0 },
      { text: `${customerName}님, 기대에 못 미쳐 죄송합니다. 소중한 의견 감사합니다. 더 나은 서비스를 위해 노력하겠습니다.`, score: 7.0 },
    ],
    neutral: [
      { text: `${customerName}님, 리뷰 감사합니다! 더 나은 맛과 서비스로 찾아뵙겠습니다. 다음에도 찾아주세요!`, score: 7.2 },
    ]
  }

  const options = templates[sentiment] || templates.neutral
  return options[Math.floor(Math.random() * options.length)]
}
