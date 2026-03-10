/**
 * Respondio AI Service
 * - OpenAI GPT 기반 리뷰 자동 답변 생성
 * - 감정 분석
 * - 사장님 말투 학습
 * - 품질 점수 자동 산정
 */

interface AIConfig {
  apiKey: string
  baseUrl: string
}

interface ReviewContext {
  review_text: string
  rating: number
  customer_name: string
  menu_items: string[]
  platform: string
  customer_type: 'new' | 'repeat' | 'loyal'
  sentiment?: string
  store_name?: string
  reply_style?: 'friendly' | 'polite' | 'casual' | 'custom'
  reply_tone_sample?: string
  banned_words?: string[]
}

interface GenerateReplyResult {
  reply_text: string
  quality_score: number
  sentiment: string
  style_used: string
}

interface SentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative'
  confidence: number
  keywords: string[]
  summary: string
}

// ============================================================
//  GPT API CALL
// ============================================================
async function callGPT(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.7,
  maxTokens = 1000
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature,
      max_completion_tokens: maxTokens
    })
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`GPT API error: ${response.status} - ${errText}`)
  }

  const data = await response.json() as any
  return data.choices?.[0]?.message?.content?.trim() || ''
}

// ============================================================
//  REPLY GENERATION
// ============================================================
export async function generateReply(
  config: AIConfig,
  context: ReviewContext
): Promise<GenerateReplyResult> {
  const styleInstructions = getStyleInstructions(context.reply_style || 'friendly')
  const customerContext = getCustomerContext(context.customer_type, context.customer_name)
  const sentimentGuide = getSentimentGuide(context.sentiment || 'neutral')
  const bannedWordsNote = context.banned_words?.length
    ? `\n절대 사용하지 말아야 할 단어: ${context.banned_words.join(', ')}`
    : ''

  const toneSample = context.reply_tone_sample
    ? `\n\n[사장님 말투 참고 예시]\n${context.reply_tone_sample}\n위 예시의 말투, 어조, 문체를 최대한 자연스럽게 따라해주세요.`
    : ''

  const systemPrompt = `당신은 배달 음식점 사장님을 대신하여 고객 리뷰에 답변을 작성하는 전문 AI입니다.

[기본 규칙]
- 답변은 반드시 한국어로 작성
- 3줄 이내로 간결하게 (최대 150자)
- AI가 작성한 것처럼 느껴지지 않는 자연스러운 답변
- 고객 이름이 있으면 자연스럽게 언급
- 주문한 메뉴를 자연스럽게 언급
- 이모지는 1-2개만 적절히 사용
- 과도한 존댓말이나 형식적 표현 지양
- 실제 사장님이 직접 쓴 것 같은 느낌${bannedWordsNote}

[답변 스타일]
${styleInstructions}

[고객 유형 대응]
${customerContext}

[감정별 대응 가이드]
${sentimentGuide}
${toneSample}

[매장 정보]
- 매장명: ${context.store_name || '우리 매장'}
- 플랫폼: ${getPlatformName(context.platform)}`

  const userPrompt = `다음 리뷰에 대한 답변을 작성해주세요.

고객명: ${context.customer_name}
별점: ${context.rating}/5
주문 메뉴: ${context.menu_items.join(', ')}
리뷰 내용: "${context.review_text}"
고객 유형: ${context.customer_type === 'loyal' ? '단골 고객 (5회 이상 주문)' : context.customer_type === 'repeat' ? '재방문 고객 (2-4회 주문)' : '신규 고객'}

답변만 작성해주세요. 다른 설명 없이 답변 텍스트만 출력하세요.`

  const replyText = await callGPT(config, systemPrompt, userPrompt, 0.75, 1000)

  // 품질 점수 산정
  const qualityScore = await evaluateQuality(config, context, replyText)

  // 감정 분석 (아직 안 되어 있으면)
  let sentiment = context.sentiment || 'neutral'
  if (!context.sentiment) {
    const sentimentResult = await analyzeSentiment(config, context.review_text)
    sentiment = sentimentResult.sentiment
  }

  return {
    reply_text: replyText,
    quality_score: qualityScore,
    sentiment,
    style_used: context.reply_style || 'friendly'
  }
}

// ============================================================
//  SENTIMENT ANALYSIS
// ============================================================
export async function analyzeSentiment(
  config: AIConfig,
  reviewText: string
): Promise<SentimentResult> {
  const systemPrompt = `당신은 배달 음식점 리뷰의 감정을 분석하는 전문가입니다.
리뷰 텍스트를 분석하여 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력합니다.

{
  "sentiment": "positive" | "neutral" | "negative",
  "confidence": 0.0~1.0,
  "keywords": ["핵심키워드1", "핵심키워드2"],
  "summary": "한줄 요약"
}`

  const userPrompt = `다음 리뷰의 감정을 분석해주세요:\n"${reviewText}"`

  const response = await callGPT(config, systemPrompt, userPrompt, 0.3, 200)

  try {
    // JSON 부분만 추출
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        sentiment: parsed.sentiment || 'neutral',
        confidence: parsed.confidence || 0.5,
        keywords: parsed.keywords || [],
        summary: parsed.summary || ''
      }
    }
  } catch (e) {
    // 파싱 실패 시 기본값
  }

  // 간단한 키워드 기반 fallback
  const positiveWords = ['맛있', '좋', '최고', '만족', '감동', '추천', '빠르', '친절', '항상']
  const negativeWords = ['별로', '실망', '늦', '차갑', '식어', '비싸', '적어', '짜증', '최악', '다시는']

  const posCount = positiveWords.filter(w => reviewText.includes(w)).length
  const negCount = negativeWords.filter(w => reviewText.includes(w)).length

  return {
    sentiment: posCount > negCount ? 'positive' : negCount > posCount ? 'negative' : 'neutral',
    confidence: 0.6,
    keywords: [],
    summary: ''
  }
}

// ============================================================
//  QUALITY SCORE
// ============================================================
async function evaluateQuality(
  config: AIConfig,
  context: ReviewContext,
  replyText: string
): Promise<number> {
  const systemPrompt = `당신은 배달 음식점 리뷰 답변의 품질을 평가하는 전문가입니다.
다음 기준으로 1.0~10.0 사이의 점수를 매겨주세요.

평가 기준:
1. 자연스러움 (AI 느낌이 나지 않는가)
2. 고객 맞춤 (이름, 메뉴 등 구체적으로 언급하는가)
3. 감정 대응 (리뷰 감정에 적절히 대응하는가)
4. 길이 적절성 (너무 길거나 짧지 않은가)
5. 진정성 (형식적이지 않고 진심이 느껴지는가)

반드시 숫자만 응답하세요. 예: 8.5`

  const userPrompt = `원본 리뷰: "${context.review_text}"
별점: ${context.rating}/5
답변: "${replyText}"`

  const response = await callGPT(config, systemPrompt, userPrompt, 0.2, 10)

  const score = parseFloat(response)
  if (isNaN(score) || score < 1 || score > 10) {
    // fallback: 기본 점수 계산
    let baseScore = 7.5
    if (replyText.includes(context.customer_name)) baseScore += 0.5
    if (context.menu_items.some(m => replyText.includes(m))) baseScore += 0.5
    if (replyText.length > 30 && replyText.length < 200) baseScore += 0.3
    return Math.min(10, Math.round(baseScore * 10) / 10)
  }

  return Math.round(score * 10) / 10
}

// ============================================================
//  BATCH OPERATIONS
// ============================================================
export async function batchAnalyzeSentiments(
  config: AIConfig,
  reviews: Array<{ id: number; review_text: string }>
): Promise<Array<{ id: number; sentiment: string; confidence: number }>> {
  // 병렬로 최대 5개씩 처리
  const results: Array<{ id: number; sentiment: string; confidence: number }> = []
  const batchSize = 5

  for (let i = 0; i < reviews.length; i += batchSize) {
    const batch = reviews.slice(i, i + batchSize)
    const promises = batch.map(async (r) => {
      const result = await analyzeSentiment(config, r.review_text)
      return { id: r.id, sentiment: result.sentiment, confidence: result.confidence }
    })
    const batchResults = await Promise.all(promises)
    results.push(...batchResults)
  }

  return results
}

// ============================================================
//  HELPER FUNCTIONS
// ============================================================
function getStyleInstructions(style: string): string {
  switch (style) {
    case 'friendly':
      return `친근하고 따뜻한 톤. 반말은 쓰지 않지만 딱딱하지 않게. "~해요", "~드릴게요" 체. 이모지 적극 활용. 예: "감사해요! 다음에도 맛있게 만들어 드릴게요 😊"`
    case 'polite':
      return `정중하고 격식 있는 톤. "~합니다", "~드리겠습니다" 체. 이모지 최소화. 예: "소중한 리뷰 감사드립니다. 더 나은 서비스를 위해 노력하겠습니다."`
    case 'casual':
      return `편안하고 자연스러운 톤. 약간의 입말 느낌. "~요", "~네요" 체. 예: "오 감사해요! 다음에 또 오세요~"`
    case 'custom':
      return `사장님이 제공한 말투 샘플을 최대한 따라해주세요.`
    default:
      return `자연스럽고 따뜻한 톤으로 작성해주세요.`
  }
}

function getCustomerContext(customerType: string, name: string): string {
  switch (customerType) {
    case 'loyal':
      return `이 고객(${name})은 단골 고객입니다(5회 이상 주문). 감사의 마음을 특별히 표현하고, "항상", "매번" 같은 표현을 자연스럽게 사용하세요. 단골임을 인지하고 있다는 느낌을 주세요.`
    case 'repeat':
      return `이 고객(${name})은 재방문 고객입니다(2-4회 주문). "또 찾아주셔서", "다시 와주셔서" 같은 표현으로 재방문에 감사를 표하세요.`
    default:
      return `이 고객(${name})은 신규 고객입니다. 첫 주문에 감사하며, 다음에도 찾아주시길 바라는 마음을 담으세요.`
  }
}

function getSentimentGuide(sentiment: string): string {
  switch (sentiment) {
    case 'positive':
      return `긍정 리뷰입니다. 감사를 표하고, 칭찬받은 부분을 자연스럽게 언급하며, 다음에도 좋은 경험을 드리겠다는 약속을 하세요.`
    case 'negative':
      return `부정 리뷰입니다. [중요] 먼저 진심으로 사과하세요. 변명하지 말고 문제를 인정하세요. 구체적인 개선 의지를 보여주세요. 다음 기회를 요청하되 강요하지 마세요. 절대로 고객 탓을 하지 마세요.`
    case 'neutral':
      return `중립적 리뷰입니다. 리뷰에 감사하며, 좋았던 점은 살리고 아쉬웠던 점은 개선하겠다는 의지를 보여주세요.`
    default:
      return `리뷰에 맞는 적절한 톤으로 답변하세요.`
  }
}

function getPlatformName(platform: string): string {
  const names: Record<string, string> = {
    baemin: '배달의민족',
    coupang_eats: '쿠팡이츠',
    yogiyo: '요기요'
  }
  return names[platform] || platform
}
