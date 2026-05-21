name: 🍱 우미위키 점심 메뉴 알림

on:
  schedule:
    - cron: '0,5,10,15,20,25,30,35,40,45,50,55 2,3 * * 1-5'
    - cron: '0,5,10,15,20,25,30,35,40,45,50,55 4 * * 1-5'
  workflow_dispatch:

jobs:
  check-and-notify:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: 📥 코드 체크아웃
        uses: actions/checkout@v4

      - name: 🟢 Node.js 설정
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: 📦 의존성 설치
        run: npm install

      - name: 🎭 Playwright 브라우저 설치
        run: npx playwright install chromium --with-deps

      - name: 🤖 봇 실행
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          KAKAO_ACCESS_TOKEN: ${{ secrets.KAKAO_ACCESS_TOKEN }}
          KAKAO_REFRESH_TOKEN: ${{ secrets.KAKAO_REFRESH_TOKEN }}
          KAKAO_CLIENT_ID: ${{ secrets.KAKAO_CLIENT_ID }}
          KAKAO_CLIENT_SECRET: ${{ secrets.KAKAO_CLIENT_SECRET }}
        run: node src/bot.js
