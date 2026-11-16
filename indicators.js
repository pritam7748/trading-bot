/**
 * Technical Indicators Calculation Module
 * Pure JavaScript, no external dependencies required.
 */

// Exponential Moving Average (EMA)
function calculateEMA(prices, period) {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const emaArray = new Array(prices.length).fill(null);

  // Initial SMA for first period elements
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  let prevEma = sum / period;
  emaArray[period - 1] = prevEma;

  // Calculate subsequent EMAs
  for (let i = period; i < prices.length; i++) {
    const currentEma = (prices[i] - prevEma) * k + prevEma;
    emaArray[i] = currentEma;
    prevEma = currentEma;
  }

  return emaArray;
}

// Relative Strength Index (RSI - Wilder's Smoothing)
function calculateRSI(closes, period = 14) {
  if (closes.length <= period) return [];
  const rsiArray = new Array(closes.length).fill(null);

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsiArray[period] = 100 - (100 / (1 + rs));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const currentGain = diff > 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiArray[i] = 100 - (100 / (1 + rs));
  }

  return rsiArray;
}

// Moving Average Convergence Divergence (MACD)
function calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);
  const macdLine = new Array(closes.length).fill(null);

  for (let i = 0; i < closes.length; i++) {
    if (fastEMA[i] !== null && slowEMA[i] !== null) {
      macdLine[i] = fastEMA[i] - slowEMA[i];
    }
  }

  // Find first index where MACD line has valid values
  const validMacdStartIndex = macdLine.findIndex(val => val !== null);
  if (validMacdStartIndex === -1 || macdLine.length - validMacdStartIndex < signalPeriod) {
    return closes.map(() => ({ macd: null, signal: null, histogram: null }));
  }

  const validMacdValues = macdLine.slice(validMacdStartIndex);
  const signalEMA = calculateEMA(validMacdValues, signalPeriod);

  const result = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < validMacdStartIndex) {
      result.push({ macd: null, signal: null, histogram: null });
    } else {
      const offset = i - validMacdStartIndex;
      const macd = macdLine[i];
      const signal = signalEMA[offset] ?? null;
      const histogram = macd !== null && signal !== null ? macd - signal : null;
      result.push({ macd, signal, histogram });
    }
  }

  return result;
}

// Dynamic Support and Resistance from past N candles
function calculateSupportResistance(candles, lookback = 20, currentIndex) {
  const startIndex = Math.max(0, currentIndex - lookback);
  let minLow = Infinity;
  let maxHigh = -Infinity;

  for (let i = startIndex; i < currentIndex; i++) {
    if (candles[i].low < minLow) minLow = candles[i].low;
    if (candles[i].high > maxHigh) maxHigh = candles[i].high;
  }

  return {
    support: minLow === Infinity ? null : minLow,
    resistance: maxHigh === -Infinity ? null : maxHigh
  };
}

module.exports = {
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateSupportResistance
};
