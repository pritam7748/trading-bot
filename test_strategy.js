const { evaluateStrategy } = require('./strategy');

// Generate 60 mock candles
const candles = [];
let basePrice = 64000;
const now = Date.now();

for (let i = 0; i < 60; i++) {
  const open = basePrice + (Math.random() - 0.48) * 100;
  const close = open + (Math.random() - 0.45) * 80;
  const high = Math.max(open, close) + Math.random() * 50;
  const low = Math.min(open, close) - Math.random() * 50;
  candles.push({
    openTime: now - (60 - i) * 15 * 60 * 1000,
    open,
    high,
    low,
    close,
    volume: 100 + Math.random() * 50,
    closeTime: now - (59 - i) * 15 * 60 * 1000
  });
  basePrice = close;
}

const config = {
  strategy: {
    emaFast: 20,
    emaSlow: 50,
    rsiPeriod: 14,
    rsiBuyMin: 50,
    rsiBuyMax: 65,
    rsiSellOverbought: 70,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    lookbackSupportResistance: 20,
    tolerancePct: 0.3
  }
};

const result = evaluateStrategy(candles, config);
console.log('Test evaluation completed successfully:');
console.log('Close Price:', result.price.toFixed(2));
console.log('EMA20:', result.indicators.ema20.toFixed(2));
console.log('EMA50:', result.indicators.ema50.toFixed(2));
console.log('RSI:', result.indicators.rsi.toFixed(2));
console.log('MACD Line:', result.indicators.macd.toFixed(2));
console.log('MACD Signal:', result.indicators.signal.toFixed(2));
console.log('Support:', result.indicators.support?.toFixed(2));
console.log('Resistance:', result.indicators.resistance?.toFixed(2));
console.log('Buy Conditions:', result.buyConditions);
console.log('Sell Conditions:', result.sellConditions);
