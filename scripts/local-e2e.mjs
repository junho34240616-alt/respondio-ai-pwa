import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const cwd = process.cwd()
const baseUrl = 'http://127.0.0.1:8789'
const crawlerUrl = 'http://127.0.0.1:4010'
const crawlerSecret = 'respondio-e2e-secret'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createLogger(name) {
  const chunks = []

  return {
    push(chunk) {
      const text = String(chunk || '')
      if (!text) return
      chunks.push(text)
      if (chunks.length > 200) chunks.shift()
      process.stdout.write(`[${name}] ${text}`)
    },
    tail() {
      return chunks.join('').trim()
    }
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(new Error(`${command} ${args.join(' ')} failed with code ${code}\n${stdout}\n${stderr}`))
    })
  })
}

function startProcess(name, command, args, env = {}) {
  const logger = createLogger(name)
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  child.stdout.on('data', (chunk) => logger.push(chunk))
  child.stderr.on('data', (chunk) => logger.push(chunk))

  return { child, logger }
}

async function waitForUrl(url, label, timeoutMs = 30_000) {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`${label} returned ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await sleep(500)
  }

  throw new Error(`${label} did not become ready: ${lastError?.message || 'unknown error'}`)
}

async function stopProcess(handle) {
  if (!handle?.child || handle.child.exitCode !== null) return

  handle.child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => handle.child.once('close', resolve)),
    sleep(3_000)
  ])

  if (handle.child.exitCode === null) {
    handle.child.kill('SIGKILL')
    await Promise.race([
      new Promise((resolve) => handle.child.once('close', resolve)),
      sleep(1_000)
    ])
  }
}

async function captureDialog(page, action) {
  const dialogPromise = page.waitForEvent('dialog', { timeout: 20_000 })
  await action()
  const dialog = await dialogPromise
  const message = dialog.message()
  await dialog.accept()
  return message
}

async function connectPlatform(page, platform, email, password, platformStoreId) {
  const labels = {
    baemin: '배달의민족',
    coupang_eats: '쿠팡이츠',
    yogiyo: '요기요'
  }
  await page.locator(`#${platform}-email`).waitFor({ timeout: 20_000 })
  await page.fill(`#${platform}-email`, email)
  await page.fill(`#${platform}-password`, password)
  await page.fill(`#${platform}-store-id`, platformStoreId)

  await page.evaluate(async (platformName) => {
    await window.connectPlatform(platformName)
  }, platform)
  await page.locator('#settings-alert').filter({ hasText: `${labels[platform]} 계정이 연결되었습니다.` }).waitFor({ timeout: 15_000 })
}

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'respondio-e2e-'))
  const wranglerHome = join(tempRoot, 'wrangler-home')
  const persistDir = join(tempRoot, 'wrangler-state')
  await mkdir(wranglerHome, { recursive: true })
  await mkdir(persistDir, { recursive: true })

  const env = {
    HOME: wranglerHome
  }

  const results = {
    build: false,
    apiTests: false,
    billingPage: false,
    platformConnect: false,
    liveSync: false,
    manualPost: false
  }

  let crawlerHandle = null
  let webHandle = null
  let browser = null

  try {
    console.log('Running unit/API smoke tests...')
    await runCommand('npm', ['test'], { env })
    results.apiTests = true

    console.log('Building production bundle...')
    await runCommand('npm', ['run', 'build'], { env })
    results.build = true

    console.log('Applying local D1 migrations...')
    await runCommand('npx', ['wrangler', 'd1', 'migrations', 'apply', 'respondio-production', '--local', '--persist-to', persistDir], { env })
    console.log('Seeding local D1...')
    await runCommand('npx', ['wrangler', 'd1', 'execute', 'respondio-production', '--local', '--persist-to', persistDir, '--file=./seed.sql'], { env })

    console.log('Starting crawler in operational test mode...')
    crawlerHandle = startProcess('crawler', 'node', ['crawler/index.js'], {
      CRAWLER_PORT: '4010',
      CRAWLER_SHARED_SECRET: crawlerSecret,
      CRAWLER_TEST_MODE: '1',
      WEBAPP_API: `${baseUrl}/api/v1`
    })
    await waitForUrl(`${crawlerUrl}/health`, 'crawler', 20_000)

    console.log('Starting local Cloudflare Pages runtime...')
    webHandle = startProcess('pages', 'npx', [
      'wrangler',
      'pages',
      'dev',
      'dist',
      '--d1=respondio-production',
      '--local',
      '--persist-to',
      persistDir,
      '--ip',
      '127.0.0.1',
      '--port',
      '8789',
      '--binding',
      `JWT_SECRET=respondio-e2e-jwt-secret`,
      '--binding',
      `CRAWLER_API_BASE=${crawlerUrl}`,
      '--binding',
      `CRAWLER_SHARED_SECRET=${crawlerSecret}`,
      '--binding',
      `CREDENTIALS_ENCRYPTION_KEY=respondio-e2e-credentials-key`,
      '--binding',
      `APP_BASE_URL=${baseUrl}`,
      '--show-interactive-dev-session=false'
    ], env)
    await waitForUrl(`${baseUrl}/login`, 'webapp', 30_000)

    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    page.setDefaultTimeout(20_000)

    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    console.log('Executing browser E2E flow...')

    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('#login-email', 'owner@test.com')
    await page.fill('#login-pw', 'password')
    await page.locator('#form-login button[type="submit"]').click()
    await page.waitForURL(`${baseUrl}/dashboard`, { timeout: 20_000 })
    await page.getByRole('heading', { name: /안녕하세요/ }).waitFor()

    await page.goto(`${baseUrl}/billing`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: '무료 베타 운영 안내' }).waitFor()
    await page.locator('#billing-alert').filter({ hasText: '현재는 무료 베타 운영 중입니다.' }).waitFor()
    results.billingPage = true

    await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded' })
    await page.locator('#store-name').waitFor()
    await connectPlatform(page, 'baemin', 'baemin@test.local', 'pw-test-1', 'BM-LIVE-001')
    await connectPlatform(page, 'coupang_eats', 'coupang@test.local', 'pw-test-2', 'CP-LIVE-001')
    await connectPlatform(page, 'yogiyo', 'yogiyo@test.local', 'pw-test-3', 'YG-LIVE-001')
    results.platformConnect = true

    await page.goto(`${baseUrl}/reviews`, { waitUntil: 'domcontentloaded' })
    await page.locator('#review-list').waitFor()
    await page.selectOption('#sync-mode', 'live')
    const syncMessage = await captureDialog(page, async () => {
      await page.locator('#btn-sync').click()
    })

    if (!syncMessage.includes('새 리뷰')) {
      throw new Error(`Unexpected sync dialog: ${syncMessage}`)
    }

    await page.waitForLoadState('domcontentloaded')
    await page.locator('#review-list > div', { hasText: '실전 운영 테스트 리뷰입니다.' }).waitFor({ timeout: 20_000 })
    results.liveSync = true

    await page.locator('#review-list > div', { hasText: '피자가 조금 식어서 왔어요. 그래도 맛은 괜찮았습니다.' }).click()
    const approveButton = page.locator('#ai-response-content button', { hasText: '승인' })
    await approveButton.waitFor()
    const approveResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/v1/reviews/approve') && response.request().method() === 'POST'
    )
    await approveButton.click()
    const approveResponse = await approveResponsePromise
    if (!approveResponse.ok()) {
      throw new Error(`Reply approval request failed with status ${approveResponse.status()}`)
    }
    await page.waitForTimeout(500)
    const postedReview = await page.evaluate(async () => {
      const response = await window.apiFetch('/api/v1/reviews?limit=50')
      const data = await response.json()
      return (data.reviews || []).find((review) =>
        String(review.review_text || '').includes('피자가 조금 식어서 왔어요. 그래도 맛은 괜찮았습니다.')
      ) || null
    })
    if (!postedReview || postedReview.status !== 'posted') {
      throw new Error(`Reply post status mismatch: ${JSON.stringify(postedReview)}`)
    }
    results.manualPost = true

    console.log('E2E completed successfully.')
    if (pageErrors.length) {
      console.log('Ignored browser page errors:')
      console.log(pageErrors.join('\n'))
    }
    console.log(JSON.stringify(results, null, 2))
  } finally {
    if (browser) await browser.close().catch(() => {})
    await stopProcess(webHandle)
    await stopProcess(crawlerHandle)

    if (webHandle?.logger?.tail()) {
      console.log('\n[pages tail]')
      console.log(webHandle.logger.tail())
    }
    if (crawlerHandle?.logger?.tail()) {
      console.log('\n[crawler tail]')
      console.log(crawlerHandle.logger.tail())
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
