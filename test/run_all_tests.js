/**
 * run_all_tests.js
 * 
 * 測試總入口：執行 test/ 目錄下所有自動化測試並產生標準化儀表板
 */

const { runGeminiStreamTest } = require('./test_gemini_stream');
const { runStaticPlaybackTest } = require('./test_static_playback');
const { runZfcHwBKcNzYTest } = require('./test_video_ZfcHwBKcNzY');
const { runE2EPipelineTest } = require('./test_e2e_pipeline');
const { runEdgeCasesTest } = require('./test_edge_cases');
const { runShortSentenceMergeTest } = require('./test_short_sentence_merge');
const { runMode2RealworldDefenseTest } = require('./test_mode2_realworld_defense');
const { runRealworldMatrixTest } = require('./test_realworld_matrix');
const { runLifecycleHandshakeTest } = require('./test_lifecycle_handshake');
const { runMainWorldInnerTubeChannelTest } = require('./test_mainworld_innertube_channel');
const { execSync } = require('child_process');

async function main() {
  console.log('========================================================');
  console.log('  YOUTUBE DUAL SUBTITLES: UNIFIED AUTOMATED TEST RUNNER');
  console.log('========================================================\n');

  const res1 = runGeminiStreamTest();
  console.log('\n--------------------------------------------------------\n');
  const res2 = runStaticPlaybackTest();
  console.log('\n--------------------------------------------------------\n');
  const res3 = runZfcHwBKcNzYTest();
  console.log('\n--------------------------------------------------------\n');
  const resE2E = await runE2EPipelineTest();
  console.log('\n--------------------------------------------------------\n');
  const resEdge = runEdgeCasesTest();
  console.log('\n--------------------------------------------------------\n');
  const resMerge = runShortSentenceMergeTest();
  console.log('\n--------------------------------------------------------\n');

  let resMode2Success = false;
  try {
    await runMode2RealworldDefenseTest();
    resMode2Success = true;
  } catch (e) {
    resMode2Success = false;
  }
  console.log('\n--------------------------------------------------------\n');

  let resMatrixSuccess = false;
  try {
    const matrixRes = await runRealworldMatrixTest();
    resMatrixSuccess = matrixRes.success;
  } catch (e) {
    resMatrixSuccess = false;
  }
  console.log('\n--------------------------------------------------------\n');

  let resFastSuccess = false;
  try {
    execSync('node test/test_fast_playback_prefetch.js', { stdio: 'inherit' });
    resFastSuccess = true;
  } catch (e) {
    resFastSuccess = false;
  }

  let resHandshakeSuccess = false;
  try {
    await runLifecycleHandshakeTest();
    resHandshakeSuccess = true;
  } catch (e) {
    resHandshakeSuccess = false;
  }
  console.log('\n--------------------------------------------------------\n');

  let resInnerTubeSuccess = false;
  try {
    await runMainWorldInnerTubeChannelTest();
    resInnerTubeSuccess = true;
  } catch (e) {
    resInnerTubeSuccess = false;
  }
  console.log('\n--------------------------------------------------------\n');

  console.log('\n========================================================');
  console.log('  FINAL VERIFICATION DASHBOARD');
  console.log('========================================================');
  console.log(`  1. Gemini Stream Test:        ${res1.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  2. Static Playback Test:       ${res2.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  3. Video ZfcHwBKcNzY Test:     ${res3.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  4. E2E Pipeline Real Test:     ${resE2E.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  5. 5大極端邊界測試 (Edge):     ${resEdge.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  6. 短句 (<5字) 智慧合流測試:   ${resMerge.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  7. Mode 2 真實極端防禦測試:   ${resMode2Success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  8. 7大真實世界極限矩陣測試:   ${resMatrixSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  9. Fast Playback Prefetch:     ${resFastSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 10. 時差握手機制 (Handshake):  ${resHandshakeSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 11. 主環境同源 InnerTube 通道: ${resInnerTubeSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log('========================================================\n');

  const isAllPassed = res1.success && res2.success && res3.success && resE2E.success && resEdge.success && resMerge.success && resMode2Success && resMatrixSuccess && resFastSuccess && resHandshakeSuccess && resInnerTubeSuccess;
  process.exit(isAllPassed ? 0 : 1);
}

main();
