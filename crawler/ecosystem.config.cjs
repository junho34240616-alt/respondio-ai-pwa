module.exports = {
  apps: [
    {
      name: 'respondio-crawler',
      script: 'index.js',
      cwd: '/home/user/webapp/crawler',
      env: {
        NODE_ENV: 'development',
        CRAWLER_PORT: 4000,
        WEBAPP_API: 'http://localhost:3000/api/v1'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
