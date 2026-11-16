/**
 * Optimized Strategy Evaluation Module (15m BTC Scalping & Trend Following)
 * Designed for high win-rate with volume confirmation and fresh signal triggers.
 */

const {
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateSupportResistance
} = require('./indicators');

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

function evaluateStrategy(candles, config) {
  const lookback = config.strategy.lookbackSupportResistance || 20;
  const tolerancePct = (config.strategy.tolerancePct || 0.4) / 100;

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);

  const ema20 = calculateEMA(closes, config.strategy.emaFast || 20);
  const ema50 = calculateEMA(closes, config.strategy.emaSlow || 50);
  const rsi = calculateRSI(closes, config.strategy.rsiPeriod || 14);
  const macd = calculateMACD(
    closes,
    config.strategy.macdFast || 12,
    config.strategy.macdSlow || 26,
    config.strategy.macdSignal || 9
  );
  const volSMA = calculateSMA(volumes, 20);

  const targetIndex = candles.length - 1;
  const prevIndex = targetIndex - 1;

  if (targetIndex < 50) {
    return { error: 'Not enough candle data (need at least 50+)' };
  }

  const currentCandle = candles[targetIndex];
  const prevCandle = candles[prevIndex];

  const currentEMA20 = ema20[targetIndex];
  const currentEMA50 = ema50[targetIndex];
  const prevEMA20 = ema20[prevIndex];
  const prevEMA50 = ema50[prevIndex];

  const currentRSI = rsi[targetIndex];
  const prevRSI = rsi[prevIndex];

  const currentMACD = macd[targetIndex];
  const prevMACD = macd[prevIndex];

  const currentVol = currentCandle.volume;
  const avgVol = volSMA[targetIndex] || currentVol;

  const { support, resistance } = calculateSupportResistance(candles, lookback, targetIndex);

  // --- Dynamic Support Bounce Check ---
  // Bounce from either static Support or dynamic EMA20
  const touchedSupport = support !== null && currentCandle.low <= support * (1 + tolerancePct);
  const touchedEMA20 = currentEMA20 !== null && currentCandle.low <= currentEMA20 * (1 + tolerancePct) && currentCandle.close >= currentEMA20;
  const closedAboveSupport = (support !== null && currentCandle.close > support) || (currentEMA20 !== null && currentCandle.close >= currentEMA20);
  const isBullishCandle = currentCandle.close >= currentCandle.open;
  const isSupportBounce = (touchedSupport || touchedEMA20) && closedAboveSupport && isBullishCandle;

  // --- Dynamic Resistance Rejection Check ---
  const touchedResistance = resistance !== null && currentCandle.high >= resistance * (1 - tolerancePct);
  const closedBelowResistance = resistance !== null && currentCandle.close < resistance;
  const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
  const body = Math.abs(currentCandle.close - currentCandle.open);
  const isBearishRejection = currentCandle.close <= currentCandle.open || upperWick > body;
  const isResistanceRejection = touchedResistance && closedBelowResistance && isBearishRejection;

  // ==========================================
  // 🟢 OPTIMIZED BUY CONDITIONS (ALL 5 REQUIRED)
  // ==========================================
  // 1. Trend: EMA 20 > EMA 50 AND price is above EMA 20
  const buyCond1_Trend = currentEMA20 !== null && currentEMA50 !== null && currentEMA20 > currentEMA50 && currentCandle.close >= currentEMA20;
  
  // 2. Momentum: RSI between 48 and 68, expanding upward
  const buyCond2_RSI = currentRSI !== null && currentRSI >= (config.strategy.rsiBuyMin || 48) && currentRSI <= (config.strategy.rsiBuyMax || 68) && currentRSI >= (prevRSI || 0);

  // 3. MACD: MACD Line > Signal Line AND (just crossed OR histogram is expanding positive)
  const isMacdBullish = currentMACD.macd !== null && currentMACD.signal !== null && currentMACD.macd > currentMACD.signal;
  const isMacdGrowing = currentMACD.histogram !== null && prevMACD.histogram !== null && currentMACD.histogram >= prevMACD.histogram;
  const buyCond3_MACD = isMacdBullish && isMacdGrowing;

  // 4. Volume Confirmation: healthy participation (prevents fakeouts during low volume)
  const buyCond4_Volume = currentVol >= avgVol * (config.strategy.volumeMultiplier || 0.95);

  // 5. Support / Price Action: Support or EMA20 bounce confirmation
  const buyCond5_Support = isSupportBounce;

  const isBuySignal = buyCond1_Trend && buyCond2_RSI && buyCond3_MACD && buyCond4_Volume && buyCond5_Support;

  // ==========================================
  // 🔴 OPTIMIZED SELL / EXIT SIGNALS (FRESH TRIGGERS ONLY)
  // ==========================================
  // 1. Fresh Trend Breakdown: EMA 20 crosses below EMA 50
  const sellCond1_EMACross = prevEMA20 !== null && prevEMA50 !== null && currentEMA20 !== null && currentEMA50 !== null && prevEMA20 >= prevEMA50 && currentEMA20 < currentEMA50;

  // 2. Fresh RSI Overbought Collapse: RSI peaked above 70 and just dropped back down
  const sellCond2_RSICollapse = prevRSI !== null && currentRSI !== null && prevRSI >= (config.strategy.rsiSellOverbought || 70) && currentRSI < 68;

  // 3. Fresh MACD Bearish Crossover: MACD line was above signal and just crossed below
  const sellCond3_MACDCross = prevMACD.macd !== null && prevMACD.signal !== null && currentMACD.macd !== null && currentMACD.signal !== null && prevMACD.macd >= prevMACD.signal && currentMACD.macd < currentMACD.signal;

  // 4. Resistance Rejection Breakdown
  const sellCond4_Resistance = isResistanceRejection;

  const isSellSignal = sellCond1_EMACross || sellCond2_RSICollapse || sellCond3_MACDCross || sellCond4_Resistance;

  return {
    candleTime: currentCandle.openTime,
    closeTime: currentCandle.closeTime,
    price: currentCandle.close,
    open: currentCandle.open,
    high: currentCandle.high,
    low: currentCandle.low,
    volume: currentVol,
    avgVolume: avgVol,
    indicators: {
      ema20: currentEMA20,
      ema50: currentEMA50,
      rsi: currentRSI,
      prevRSI: prevRSI,
      macd: currentMACD.macd,
      signal: currentMACD.signal,
      histogram: currentMACD.histogram,
      support,
      resistance
    },
    buyConditions: {
      trendAligned: buyCond1_Trend,
      rsiInOptimalZone: buyCond2_RSI,
      macdBullishExpanding: buyCond3_MACD,
      volumeConfirmed: buyCond4_Volume,
      supportBounce: buyCond5_Support,
      allMatched: isBuySignal
    },
    sellConditions: {
      emaDeathCross: sellCond1_EMACross,
      rsiOverboughtCollapse: sellCond2_RSICollapse,
      macdBearishCross: sellCond3_MACDCross,
      resistanceRejection: sellCond4_Resistance,
      anyMatched: isSellSignal
    }
  };
}

module.exports = {
  evaluateStrategy
};
