const { chromium } = require('playwright');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fs = require('fs');
const path = require('path');

// ─── 환경변수 ───────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const KAKAO_ACCESS_TOKEN = process.env.KAKAO_ACCESS_TOKEN;
const KAKAO_REFRESH_TOKEN = process.env.KAKAO_REFRESH_TOKEN;
const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID;
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET;
// 한 번 보낸 날은 다시 보내지 않기 위한 상태 파일
const STATE_FILE = path.join(__dirname, '..', 'sent_today.json');

const RESTAURANTS = [
  { id: 'tori',    name: '🍗 토리송 (B1)',  url: 'https://woomi.wiki/tori' },
  { id: 'sangrok', name: '🥗 상록 (2층)',    url: 'https://woomi.wiki/sangrok' },
];

// ─── 오늘 이미 전송했는지 확인 ─────────────────────────────
function alreadySentToday() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    const today = new Date().toISOString().slice(0, 10);
    return state.date === today && state.sent === true;
  } catch {
    return false;
  }
}

function markSentToday() {
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(STATE_FILE, JSON.stringify({ date: today, sent: true }));
}

// ─── 카카오 토큰 갱신 ────────────────────────────────────────
async function refreshKakaoToken() {
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     KAKAO_CLIENT_ID,
    refresh_token: KAKAO_REFRESH_TOKEN,
    ...(KAKAO_CLIENT_SECRET ? { client_secret: KAKAO_CLIENT_SECRET } : {}),
  });

  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await res.json();
  if (data.access_token) {
    console.log('✅ 카카오 토큰 갱신 성공');
    // GitHub Actions output으로 새 토큰 출력 (Secrets 업데이트용)
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `new_access_token=${data.access_token}\n`);
      if (data.refresh_token) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `new_refresh_token=${data.refresh_token}\n`);
      }
    }
    return data.access_token;
  }
  throw new Error(`토큰 갱신 실패: ${JSON.stringify(data)}`);
}

// ─── 카카오 나에게 보내기 ────────────────────────────────────
async function sendKakaoMessage(text, accessToken) {
  const template = {
    object_type: 'text',
    text,
    link: { web_url: 'https://woomi.wiki', mobile_web_url: 'https://woomi.wiki' },
    button_title: '우미위키 바로가기',
  };

  const res = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ template_object: JSON.stringify(template) }),
  });

  const data = await res.json();
  if (data.result_code === 0) {
    console.log('✅ 카카오톡 전송 성공');
    return true;
  }

  // 토큰 만료 시 갱신 후 재시도
  if (data.code === -401 && KAKAO_REFRESH_TOKEN) {
    console.log('⚠️  액세스 토큰 만료, 갱신 시도...');
    const newToken = await refreshKakaoToken();
    return sendKakaoMessage(text, newToken);
  }

  throw new Error(`카카오 전송 실패: ${JSON.stringify(data)}`);
}

// ─── Playwright로 스크린샷 ────────────────────────────────────
async function captureMenuImage(browser, url) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // 메뉴 이미지가 로드될 때까지 대기 (img 태그 기준)
    await page.waitForSelector('img[src*="cloudinary"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000); // 추가 렌더링 대기

    // 메뉴 이미지 영역만 크롭
    const imgEl = await page.$('img[src*="cloudinary"]:not([src*="talk"])');
    if (!imgEl) {
      console.log(`⚠️  ${url} — 메뉴 이미지 없음`);
      return null;
    }

    const screenshot = await imgEl.screenshot({ type: 'jpeg', quality: 90 });
    return screenshot;
  } finally {
    await page.close();
  }
}

// ─── Google Generative AI로 메뉴 분석 ────────────────────────────
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Gemini 클라이언트 초기화 (환경변수 GEMINI_API_KEY가 필요합니다)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function analyzeMenuImage(imageBuffer, restaurantName) {
  // Gemini 1.5 Flash 모델 사용 (빠르고 저렴하며 효율적입니다)
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const base64 = imageBuffer.toString('base64');

  const prompt = `이것은 "${restaurantName}" 식당의 오늘 점심 메뉴판 이미지입니다.
이미지에서 메뉴 항목들을 모두 추출해주세요.

규칙:
1. 메뉴 항목만 리스트로 출력 (번호나 불릿 없이, 줄바꿈으로 구분)
2. 메뉴가 없거나 이미지가 불명확하면 "메뉴 준비중"이라고만 답변
3. 가격이 있으면 포함, 없으면 생략
4. 다른 설명 없이 메뉴 목록만 출력`;

  const result = await model.generateContent([
    {
      inlineData: {
        data: base64,
        mimeType: "image/png" // 필요에 따라 image/jpeg 등으로 변경
      }
    },
    prompt
  ]);

  const response = await result.response;
  return response.text().trim();
}

// ─── 메뉴 판단 로직 ───────────────────────────────
function hasValidMenu(menuText) {
  if (!menuText) return false;
  const lower = menuText.toLowerCase();
  return !lower.includes('준비중') && !lower.includes('준비 중') &&
         !lower.includes('없음') && menuText.length > 5;
}

// ─── 메인 ────────────────────────────────────────────────────
async function main() {
  console.log(`\n🍱 우미위키 점심 봇 시작 — ${new Date().toLocaleString('ko-KR')}`);

  if (alreadySentToday()) {
    console.log('✅ 오늘 이미 전송 완료. 종료.');
    return;
  }

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const results = [];

    for (const restaurant of RESTAURANTS) {
      console.log(`\n📸 ${restaurant.name} 스크린샷 중...`);
      const imageBuffer = await captureMenuImage(browser, restaurant.url);

      if (!imageBuffer) {
        console.log(`⏭  ${restaurant.name} — 이미지 없음, 건너뜀`);
        results.push({ ...restaurant, menu: null, ready: false });
        continue;
      }

      console.log(`🤖 ${restaurant.name} 메뉴 분석 중...`);
      const menu = await analyzeMenuImage(imageBuffer, restaurant.name);
      const ready = hasValidMenu(menu);
      console.log(`📋 ${restaurant.name}:\n${menu}`);
      results.push({ ...restaurant, menu, ready });
    }

    const allReady = results.every(r => r.ready);

    if (!allReady) {
      const notReady = results.filter(r => !r.ready).map(r => r.name).join(', ');
      console.log(`\n⏳ 아직 메뉴 미업로드: ${notReady} — 재시도 대기`);
      return; // GitHub Actions가 5분 후 다시 실행
    }

    // 모두 올라왔으면 카카오톡 전송
    const today = new Date().toLocaleDateString('ko-KR', {
      month: 'long', day: 'numeric', weekday: 'short',
    });

    let message = `🍽️ [우미위키] ${today} 점심 메뉴\n`;
    message += '─'.repeat(24) + '\n\n';

    for (const r of results) {
      message += `${r.name}\n`;
      message += r.menu + '\n\n';
    }

    message += '─'.repeat(24) + '\n';
    message += '📍 C동 | 평일 11am–2pm';

    console.log('\n📨 카카오톡 전송 중...');
    await sendKakaoMessage(message, KAKAO_ACCESS_TOKEN);
    markSentToday();

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('❌ 오류:', err.message);
  process.exit(1);
});
