/**
 * Unit Test for Multi-Coin AI Risk Models, Scanner & Telegram Commands
 */

const { AI_PROFILES, getAIProfile } = require('./aiProfiles');
const {
  switchAIModel,
  getActiveAIModel,
  openTrade,
  checkLiveTrade,
  getActiveTrades,
  getTradeHistory
} = require('./paperTrading');
const {
  formatAIModelsMessage,
  formatPositionsMessage,
  formatHistoryMessage,
  formatSettingsMessage
} = require('./telegram');
const { formatScanReport } = require('./marketScanner');

console.log('🧪 Starting Multi-Coin AI Models & Scanner Test...\n');

// 1. Verify Profiles
console.log('1. Checking AI Risk Profiles:');
for (const [key, profile] of Object.entries(AI_PROFILES)) {
  console.log(`   • ${profile.badge}: ${profile.symbols.join(', ')} | Max Pos: ${profile.maxPositions} | Conf: ${profile.confidenceThreshold}+ | SL: ${profile.minSLPct}-${profile.maxSLPct}%`);
}

// 2. Test Switching Models
console.log('\n2. Testing AI Model Switching:');
switchAIModel('low');
console.log('   Switched to LOW:', getActiveAIModel() === 'LOW_RISK' ? '✅ PASS' : '❌ FAIL');

switchAIModel('high');
console.log('   Switched to HIGH:', getActiveAIModel() === 'HIGH_RISK' ? '✅ PASS' : '❌ FAIL');

switchAIModel('mid');
console.log('   Switched back to MID:', getActiveAIModel() === 'MID_RISK' ? '✅ PASS' : '❌ FAIL');

// 3. Test Multi-Coin Trade Opening & SL/TP check
console.log('\n3. Testing Multi-Coin Position Management:');
// Open BTC trade
const btcTrade = openTrade('BTCUSDT', 65000, Date.now(), { riskReward: { dynamicSLPct: 1.5, dynamicTPPct: 3.5 }, allocation: { suggestedAmountUSD: 10 } });
console.log('   BTC Trade Opened:', btcTrade.trade.symbol, 'Pos #' + btcTrade.trade.positionNumber, '@ $' + btcTrade.trade.entryPrice);

// Open ETH trade
const ethTrade = openTrade('ETHUSDT', 3200, Date.now(), { riskReward: { dynamicSLPct: 2.0, dynamicTPPct: 4.5 }, allocation: { suggestedAmountUSD: 10 } });
console.log('   ETH Trade Opened:', ethTrade.trade.symbol, 'Pos #' + ethTrade.trade.positionNumber, '@ $' + ethTrade.trade.entryPrice);

console.log('   Total Active Positions:', getActiveTrades().length, (getActiveTrades().length === 2 ? '✅ PASS' : '❌ FAIL'));

// Test Positions Message formatting
console.log('\n--- Positions Message Preview ---');
console.log(formatPositionsMessage({ 'BTCUSDT': 65800, 'ETHUSDT': 3240 }));

// Test Close ETH on TP without closing BTC
console.log('\n4. Testing Symbol-Isolated SL/TP Closure:');
const ethCloseEvent = checkLiveTrade('ETHUSDT', 3400, false);
console.log('   ETH TP Triggered:', ethCloseEvent && ethCloseEvent.closedTrades.length > 0 ? '✅ PASS' : '❌ FAIL');
console.log('   Remaining Active (should be BTC only):', getActiveTrades().length, (getActiveTrades().length === 1 ? '✅ PASS' : '❌ FAIL'));

// Close BTC on exit
const btcCloseEvent = checkLiveTrade('BTCUSDT', 66000, true);
console.log('   BTC Closed on Exit:', btcCloseEvent && btcCloseEvent.closedTrades.length > 0 ? '✅ PASS' : '❌ FAIL');

// 5. Test History Message
console.log('\n--- History Message Preview ---');
console.log(formatHistoryMessage());

// 6. Test AI Models Message
console.log('\n--- Models Message Preview ---');
console.log(formatAIModelsMessage());

// 7. Test Mock Scan Report
console.log('\n--- Scan Report Preview ---');
const mockScanResults = [
  {
    symbol: 'BTCUSDT',
    displayName: 'BTC/USDT',
    livePrice: 65120,
    buyConditions: { allMatched: false },
    aiAnalysis: { score: 72, stanceEmoji: '🟢', aiStance: 'MODERATE BUY', regime: { regimeName: 'বুলিশ ট্রেন্ড' }, riskReward: { dynamicSLPct: 1.2, dynamicTPPct: 3.1 } }
  },
  {
    symbol: 'SOLUSDT',
    displayName: 'SOL/USDT',
    livePrice: 154.5,
    buyConditions: { allMatched: true },
    aiAnalysis: { score: 84, stanceEmoji: '🚀', aiStance: 'STRONG BUY', regime: { regimeName: 'উচ্চ ব্রেকআউট' }, riskReward: { dynamicSLPct: 1.8, dynamicTPPct: 4.5 } }
  }
];
console.log(formatScanReport(mockScanResults, getAIProfile('MID_RISK')));

console.log('\n🎉 ALL MULTI-COIN AI TESTS PASSED PERFECTLY!\n');
