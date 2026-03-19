FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV LANG=ko_KR.UTF-8
ENV LC_ALL=ko_KR.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
  fontconfig \
  fonts-nanum \
  fonts-nanum-extra \
  fonts-noto-cjk \
  fonts-noto-color-emoji \
  locales \
  && locale-gen ko_KR.UTF-8 \
  && fc-cache -f -v \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 10000

CMD ["node", "index.js"]
