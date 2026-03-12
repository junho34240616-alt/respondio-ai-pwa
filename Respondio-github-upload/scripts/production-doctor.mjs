import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import process from 'node:process'

const workerSecrets = [
  'OPENAI_API_KEY',
  'JWT_SECRET',
  'CRAWLER_SHARED_SECRET',
  'CREDENTIALS_ENCRYPTION_KEY',
  'PORTONE_API_SECRET',
  'PORTONE_WEBHOOK_SECRET'
]

const workerVars = [
  'OPENAI_BASE_URL',
  'CRAWLER_API_BASE',
  'APP_BASE_URL',
  'PORTONE_STORE_ID',
  'PORTONE_CHANNEL_KEY'
]

const crawlerVars = [
  'WEBAPP_API',
  'CRAWLER_SHARED_SECRET',
  'CRAWLER_PORT'
]

function run(command, args, envOverrides = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...envOverrides },
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

    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
  })
}

async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function formatStatus(label, ok, detail) {
  const icon = ok ? 'OK ' : 'NO '
  return `${icon} ${label}: ${detail}`
}

function checkEnvGroup(name, keys) {
  const missing = keys.filter((key) => !process.env[key])
  return {
    name,
    ok: missing.length === 0,
    missing
  }
}

async function main() {
  const buildReady = await fileExists('dist/_worker.js')
  const wranglerConfigReady = await fileExists('wrangler.jsonc')
  const crawlerDepsReady = await fileExists('crawler/node_modules/express/index.js')

  const authCheck = await run('npx', ['wrangler', 'whoami'], {
    HOME: process.env.HOME || '/tmp/respondio-wrangler-home'
  })
  const wranglerAuthed = authCheck.code === 0 && !authCheck.stdout.includes('You are not authenticated')

  const groups = [
    checkEnvGroup('Cloudflare secrets', workerSecrets),
    checkEnvGroup('Cloudflare vars', workerVars),
    checkEnvGroup('Crawler vars', crawlerVars)
  ]

  console.log('Respondio Production Doctor')
  console.log('')
  console.log(formatStatus('wrangler.jsonc', wranglerConfigReady, wranglerConfigReady ? 'found' : 'missing'))
  console.log(formatStatus('dist/_worker.js', buildReady, buildReady ? 'build artifact ready' : 'run npm run build'))
  console.log(formatStatus('crawler dependencies', crawlerDepsReady, crawlerDepsReady ? 'installed' : 'run npm install in crawler/'))
  console.log(formatStatus('Cloudflare auth', wranglerAuthed, wranglerAuthed ? 'authenticated' : 'wrangler login required'))
  console.log('')

  for (const group of groups) {
    const detail = group.ok
      ? 'all required values are present in the current shell'
      : `missing ${group.missing.join(', ')}`
    console.log(formatStatus(group.name, group.ok, detail))
  }

  const blockers = []
  if (!wranglerConfigReady) blockers.push('wrangler config missing')
  if (!buildReady) blockers.push('build artifact missing')
  if (!crawlerDepsReady) blockers.push('crawler dependencies missing')
  if (!wranglerAuthed) blockers.push('wrangler login required')
  for (const group of groups) {
    if (!group.ok) blockers.push(`${group.name} incomplete`)
  }

  console.log('')
  if (blockers.length === 0) {
    console.log('Ready for production deployment.')
    return
  }

  console.log('Current blockers:')
  for (const blocker of blockers) {
    console.log(`- ${blocker}`)
  }

  console.log('')
  console.log('Guide: docs/PRODUCTION_SETUP_GUIDE.md')
  process.exitCode = 1
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
