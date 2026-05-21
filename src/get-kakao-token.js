/**
 * 카카오 토큰 최초 발급 스크립트
 * 사용법: node src/get-kakao-token.js
 *
 * 실행 전 준비:
 *   1. https://developers.kakao.com 에서 앱 생성
 *   2. 앱 설정 > 카카오 로그인 > 활성화
 *   3. 동의항목 > 카카오톡 메시지 전송 (필수 동의)
 *   4. 플랫폼 > Web > 사이트 도메인: https://localhost
 *   5. 카카오 로그인 > Redirect URI: https://localhost
 */

const readline = require('readline');
const https = require('https');

const CLIENT_ID = process.env.KAKAO_CLIENT_ID || '';
const CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || ''; // 없어도 됨

if (!CLIENT_ID) {
  console.error('❌ KAKAO_CLIENT_ID 환경변수를 설정하세요.');
  console.error('   예: KAKAO_CLIENT_ID=your_app_key node src/get-kakao-token.js');
  process.exit(1);
}

const REDIRECT_URI = 'https://localhost';
const AUTH_URL = `https://kauth.kakao.com/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=talk_message`;

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('   카카오 토큰 발급 도우미');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📌 STEP 1: 아래 URL을 브라우저에서 열어 카카오 로그인하세요\n');
console.log(AUTH_URL);
console.log('\n📌 STEP 2: 로그인 후 "https://localhost/?code=XXXX" 형식의 URL로');
console.log('   리디렉션됩니다 (페이지 오류가 떠도 괜찮아요).');
console.log('   주소창 전체를 Ctrl+A → Ctrl+C 로 복사하세요.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('🔑 주소창 URL을 통째로 붙여넣으세요: ', async (input) => {
  rl.close();
  input = input.trim();

  // URL 전체 또는 code만 붙여넣어도 동작
  let code = input;
  if (input.includes('code=')) {
    const match = input.match(/[?&]code=([^&]+)/);
    code = match ? match[1] : input;
  }

  console.log('\n⏳ 토큰 요청 중...');

  const params = new URLSearchParams({
    grant_type:   'authorization_code',
    client_id:    CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code,
    ...(CLIENT_SECRET ? { client_secret: CLIENT_SECRET } : {}),
  });

  try {
    const res = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await res.json();

    if (!data.access_token) {
      console.error('❌ 토큰 발급 실패:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('\n✅ 토큰 발급 성공!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('GitHub Secrets에 아래 값들을 등록하세요:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`KAKAO_ACCESS_TOKEN\n  ${data.access_token}\n`);
    console.log(`KAKAO_REFRESH_TOKEN\n  ${data.refresh_token}\n`);
    console.log(`KAKAO_CLIENT_ID\n  ${CLIENT_ID}\n`);
    if (CLIENT_SECRET) console.log(`KAKAO_CLIENT_SECRET\n  ${CLIENT_SECRET}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📌 Secrets 등록 위치:');
    console.log('   GitHub 레포 > Settings > Secrets and variables > Actions > New repository secret');
  } catch (err) {
    console.error('❌ 오류:', err.message);
    process.exit(1);
  }
});
