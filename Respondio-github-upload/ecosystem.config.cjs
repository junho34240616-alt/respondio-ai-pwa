module.exports = {
  apps: [
    {
      name: 'respondio',
      script: 'npx',
      args: 'wrangler pages dev dist --d1=respondio-production --local --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        HOME: '/tmp/respondio-wrangler-home'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
