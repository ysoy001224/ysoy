const { chromium } = require('playwright');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

// ─── 환경변수 설정 ───────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const CHANNEL_ID = 'gm_PqPbX'; // 채널 ID

const STATE_FILE = path.join(__dirname, '..', 'sent_today.json');

const RESTAURANTS = [
  { id: 'tori',    name: '🍗 토리송 (B1)',  url: 'https://woomi.wiki/tori' },
  { id: 'sangrok', name: '🥗 상록 (2층)',    url: 'https://woomi.wiki/sangrok' },
];

// ─── 요일별 템플릿 ───────────────────────────────────────────────
function getTemplateByDay(today, menus) {
  const day = new Date(today).getDay();
  const dateStr = new Date(today).toLocaleDateString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short',
  });

  const menuText = menus.map(m => `${m.name}\n${m.menu}`).join('\n\n');

  // 월(1) 화(2) 수(3) 목(4) 금(5)
  switch(day) {
    case 1: // 월요일 - 일기장 스타일
      return `🌙 월요일의 점심 일기
━━━━━━━━━━━━━━━
📝 오늘의 맛있는 발견

${menuText}

✨ 새로운 한 주, 맛있게 시작합니다
━━━━━━━━━━━━━━━
📍 C동 | 평일 11am–2pm`;

    case 2: // 화요일 - 매거진 스타일
      return `📖 [우미위키] 화요일 미식 매거진
━━━━━━━━━━━━━━━
✍️ 오늘의 점심 추천

${menuText}

🍽️ 점심 시간이 가장 행복한 시간
━━━━━━━━━━━━━━━
📍 C동 | 평일 11am–2pm`;

    case 3: // 수요일 - 스크랩북 스타일
      return `🎀 수요일 점심 메뉴북
┏━━━━━━━━━━━━━┓
┃ 오늘도 맛있는 하루
┃
┃ ${menuText.split('\n').slice(0, 4).join('\n┃ ')}
┃
┗━━━━━━━━━━━━━┛
♡ 중반의 피로, 맛으로 날려요!
━━━━━━━━━━━━━━━
📍 C동 | 평일 11am–2pm`;

    case 4: // 목요일 - 감성 다이어리
      return `🌸 목요일, 점심의 순간
━━━━━━━━━━━━━━━
💭 오늘 하루를 맛으로 기록합니다

${menuText}

🌟 거의 다 왔어, 화이팅!
━━━━━━━━━━━━━━━
📍 C동 | 평일 11am–2pm`;

    case 5: // 금요일 - 축제 스타일
      return `🎉 금요일의 축제, 점심 메뉴!
━━━━━━━━━━━━━━━
🌈 주말을 앞두고 신나는 점심시간

${menuText}

✨ 오늘 하루, 맛있게 마무리해요!
🎊 즐거운 주말 되세요!
━━━━━━━━━━━━━━━
📍 C동 | 평일 11am–2pm`;

    default:
      return `🍽️ [우미위키] 오늘의 점심 메뉴\n\n${menuText}`;
  }
}

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

// ─── 카카오 채널에 메시지 전송 ────────────────────────────────
async function sendKakaoChannelMessage(text) {
  const res = await fetch('https://kapi.kakao.com/v2/api/talk/channel/post', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KAKAO_REST_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      channel_public_id: CHANNEL_ID,
      text: text,
    }),
  });

  const data = await res.json();
  if (data.success || data.request_id) {
    console.log('✅ 채널 메시지 전송 성공');
    return true;
  }

  throw new Error(`채널 전송 실패: ${JSON.stringify(data)}`);
}

// ─── Playwright로 스크린샷 ────────────────────────────────────
async function captureMenuImage(browser, url) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('img[src*="cloudinary"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

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

// ─── Gemini로 메뉴 분석 ────────────────────────────────────
async function analyzeMenuImage(imageBuffer, restaurantName) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  try {
    const base64 = imageBuffer.toString('base64');

    const imagePart = {
      inlineData: {
        data: base64,
        mimeType: "image/jpeg"
      }
    };

    const prompt = `이것은 "${restaurantName}" 식당의 오늘 점심 메뉴판 이미지입니다.
이미지에서 메뉴 항목들을 모두 추출해주세요.

규칙:
1. 메뉴 항목만 리스트로 출력 (번호나 불릿 없이, 줄바꿈으로 구분)
2. 메뉴가 없거나 이미지가 불명확하면 "메뉴 준비중"이라고만 답변
3. 가격이 있으면 포함, 없으면 생략
4. 다른 설명 없이 메뉴 목록만 출력`;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("Gemini 분석 중 오류:", error.message);
    throw error;
  }
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
      return;
    }

    // 월화수목금 템플릿 적용
    const today = new Date().toISOString().slice(0, 10);
    const message = getTemplateByDay(today, results.filter(r => r.ready));

    console.log('\n📨 카카오 채널 메시지 전송 중...');
    await sendKakaoChannelMessage(message);
    markSentToday();

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('❌ 오류:', err.message);
  process.exit(1);
});
