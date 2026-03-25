module.exports = {
  apps: [
    {
      name: 'respondio-crawler',
      script: 'index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'development',
        CRAWLER_PORT: 4000,
        WEBAPP_API: 'http://localhost:3000/api/v1',
        CRAWLER_SHARED_SECRET: process.env.CRAWLER_SHARED_SECRET || ''
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
