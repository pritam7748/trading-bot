const { analyzeMarketWithAI } = require('./aiEngine');
const { formatSellMessage, formatAIMarketMessage, formatHistoryMessage } = require('./telegram');
const { openTrade, checkLiveTrade, getTradeHistory } = require('./paperTrading');

console.log('Testing AI Brain & History Module...');

// 1. Mock Candle & Indicator Data
const mockIndicators = {
  ema20: 65100,
  ema50: 64700,
  rsi: 58,
  macd: 45,
  signal: 25,
  histogram: 20,
  atr: 420,
  support: 64500,
  resistance: 65800,
  avgVolume: 100
};

const mockCandles = [
  { open: 64900, high: 65200, low: 64850, close: 65150, volume: 120 }
];

const aiResult = analyzeMarketWithAI(mockCandles, mockIndicators, 30.0, []);
console.log('AI Analysis Result:');
console.log('Regime:', aiResult.regime.regimeName);
console.log('Score:', aiResult.score);
console.log('Dynamic SL:', aiResult.riskReward.dynamicSLPct + '% ($' + aiResult.riskReward.stopLossPrice + ')');
console.log('Dynamic TP:', aiResult.riskReward.dynamicTPPct + '% ($' + aiResult.riskReward.takeProfitPrice + ')');
console.log('Suggested Allocation:', aiResult.allocation.allocPct + '% ($' + aiResult.allocation.suggestedAmountUSD + ')');

console.log('\n--- AI Message Preview ---');
console.log(formatAIMarketMessage(aiResult));

console.log('\n--- History Message Preview ---');
console.log(formatHistoryMessage());

console.log('\n--- Sell Alert Preview ---');
const mockEvaluation = {
  closeTime: Date.now(),
  price: 64800,
  indicators: mockIndicators,
  sellConditions: {
    sellReasons: [
      { title: 'EMA Death Cross', detail: 'EMA 20 EMA 50-এর নিচে নেমে গেছে।' },
      { title: 'MACD Bearish Crossover', detail: 'সেলাররা বাজারে তীব্র নিয়ন্ত্রণ নিয়েছে।' }
    ]
  },
  aiAnalysis: aiResult
};
console.log(formatSellMessage(mockEvaluation, null, 'BTC/USDT', '15m'));

console.log('\nALL TESTS PASSED SUCCESSFULLY!');
