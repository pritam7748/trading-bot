const { openTrade, checkLiveTrade, loadState } = require('./paperTrading');
const { formatTradeOpenedMessage, formatTradeClosedMessage } = require('./telegram');

const mockConfig = {
  paperTrading: {
    enabled: true,
    tradeAmountUSD: 1.0,
    stopLossPct: 1.0,
    takeProfitPct: 2.0,
    exitOnSellSignal: true
  }
};

console.log('Testing Paper Trading Logic...');

// 1. Simulate opening $1 trade at $64,000
const trade = openTrade(64000, Date.now(), mockConfig);
console.log('Trade opened:', trade);
console.log('Opened Msg:\n', formatTradeOpenedMessage(trade));

// 2. Simulate price dropping to $63,300 (which is below SL of $63,360)
const closeResult = checkLiveTrade(63350);
console.log('Close Result on SL:');
console.log(closeResult);
console.log('Closed Msg:\n', formatTradeClosedMessage(closeResult.closedTrade, closeResult.stats));
