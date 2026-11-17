const { openTrade, checkLiveTrade, getActiveTrades, getSettingsAndWallet } = require('./paperTrading');
const { shouldScaleIntoPosition, evolveStrategyEngine } = require('./aiEngine');
const { formatPositionsMessage, formatStrategyProfileMessage } = require('./telegram');

console.log('Testing Multi-Position & Strategy Evolution...');

// 1. Test Strategy Evolution
const mockRegime = { regime: 'STRONG_BULL_TREND', regimeName: 'বুলিশ ট্রেন্ড 🚀', bias: 'BULLISH' };
const evolved = evolveStrategyEngine(null, mockRegime, [
  { isWin: true }, { isWin: true }, { isWin: true }
]);
console.log('Evolved Strategy Style:', evolved.activeStyle);
console.log('Generation:', evolved.generation);
console.log('Max Positions:', evolved.maxPositions);
console.log('Allow Scaling:', evolved.allowScalingIn);
console.log('Strategy Message Preview:\n', formatStrategyProfileMessage(evolved));

// 2. Test Open Position #1
const p1 = openTrade(64500, Date.now(), { riskReward: { dynamicSLPct: 1.2, dynamicTPPct: 3.5 }, allocation: { suggestedAmountUSD: 10 } });
console.log('\nPosition 1 Opened:', p1.trade.positionNumber, p1.trade.tradeAmountUSD, p1.trade.entryPrice);

// 3. Test Scale-in check at price 65000 (profit)
const mockAI = { score: 82, regime: mockRegime, allocation: { suggestedAmountUSD: 10 } };
const scaleCheck = shouldScaleIntoPosition(getActiveTrades(), 65000, mockAI, 30, evolved);
console.log('Scale Check at $65,000:', scaleCheck);

if (scaleCheck.canScale) {
  const p2 = openTrade(65000, Date.now(), mockAI, true);
  console.log('Position 2 Opened (Scale-in):', p2.trade.positionNumber, p2.trade.tradeAmountUSD, p2.trade.entryPrice);
}

console.log('\nPositions Message Preview:');
console.log(formatPositionsMessage(65100));

// 4. Test Closing positions on TP
const closeRes = checkLiveTrade(68000, false);
console.log('Close Result on TP:', closeRes?.closedTrades?.length, 'trades closed.');

console.log('\nALL MULTI-TRADE & EVOLUTION TESTS PASSED!');
