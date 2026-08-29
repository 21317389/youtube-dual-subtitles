/**
 * run_all_tests.js
 * 
 * 測試總入口：執行 test/ 目錄下所有自動化測試並產生標準化儀表板
 */

const { runGeminiStreamTest } = require('./test_gemini_stream');
const { runStaticPlaybackTest } = require('./test_static_playback');

console.log('========================================================');
console.log('  YOUTUBE DUAL SUBTITLES: UNIFIED AUTOMATED TEST RUNNER');
console.log('========================================================\n');

const res1 = runGeminiStreamTest();
console.log('\n--------------------------------------------------------\n');
const res2 = runStaticPlaybackTest();

console.log('\n========================================================');
console.log('  FINAL VERIFICATION DASHBOARD');
console.log('========================================================');
console.log(`  1. Gemini Stream Test:  ${res1.success ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  2. Static Playback Test: ${res2.success ? '✅ PASS' : '❌ FAIL'}`);
console.log('========================================================\n');

if (!res1.success || !res2.success) {
  process.exitCode = 1;
}
