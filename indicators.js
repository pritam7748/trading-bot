/**
 * Technical Indicators Calculation Module
 * Pure JavaScript, no external dependencies required.
 * Includes EMA, RSI, MACD, Support/Resistance, and ATR (Average True Range).
 */

// Exponential Moving Average (EMA)
function calculateEMA(prices, period) {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const emaArray = new Array(prices.length).fill(null);

  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  let prevEma = sum / period;
  emaArray[period - 1] = prevEma;

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

// Average True Range (ATR) - Measures Market Volatility for Dynamic SL/TP
function calculateATR(candles, period = 14) {
  if (candles.length <= period) return new Array(candles.length).fill(null);
  const tr = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }

  const atr = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  atr[period - 1] = sum / period;

  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

// Simple Moving Average
function calculateSMA(data, period) {
  if (data.length < period) return new Array(data.length).fill(null);
  const result = new Array(data.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  result[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    sum += data[i] - data[i - period];
    result[i] = sum / period;
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
  calculateATR,
  calculateSMA,
  calculateSupportResistance
};
