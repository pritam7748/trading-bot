/**
 * Strategy Evaluation Module (Integrated with AI Market Intelligence Engine)
 * Combines 5 technical indicators with AI regime detection and dynamic SL/TP calculation.
 */

const {
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateSMA,
  calculateSupportResistance
} = require('./indicators');

const { analyzeMarketWithAI } = require('./aiEngine');

function evaluateStrategy(candles, config, walletBalance = 30, tradeHistory = [], currentEvolved = null, aiProfile = null) {
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
  const atr = calculateATR(candles, 14);
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

  const currentATR = atr[targetIndex];
  const currentVol = currentCandle.volume;
  const avgVol = volSMA[targetIndex] || currentVol;

  const { support, resistance } = calculateSupportResistance(candles, lookback, targetIndex);

  const indicators = {
    ema20: currentEMA20,
    ema50: currentEMA50,
    rsi: currentRSI,
    prevRSI: prevRSI,
    macd: currentMACD.macd,
    signal: currentMACD.signal,
    histogram: currentMACD.histogram,
    atr: currentATR,
    support,
    resistance,
    avgVolume: avgVol
  };

  // Run AI Engine Analysis with Strategy Evolution and AI Risk Profile
  const aiAnalysis = analyzeMarketWithAI(candles, indicators, walletBalance, tradeHistory, currentEvolved, aiProfile);
  const evolved = aiAnalysis.evolvedStrategy;

  // Dynamic Support Bounce Check
  const touchedSupport = support !== null && currentCandle.low <= support * (1 + tolerancePct);
  const touchedEMA20 = currentEMA20 !== null && currentCandle.low <= currentEMA20 * (1 + tolerancePct) && currentCandle.close >= currentEMA20;
  const closedAboveSupport = (support !== null && currentCandle.close > support) || (currentEMA20 !== null && currentCandle.close >= currentEMA20);
  const isBullishCandle = currentCandle.close >= currentCandle.open;
  const isSupportBounce = (touchedSupport || touchedEMA20) && closedAboveSupport && isBullishCandle;

  // Dynamic Resistance Rejection Check
  const touchedResistance = resistance !== null && currentCandle.high >= resistance * (1 - tolerancePct);
  const closedBelowResistance = resistance !== null && currentCandle.close < resistance;
  const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
  const body = Math.abs(currentCandle.close - currentCandle.open);
  const isBearishRejection = currentCandle.close <= currentCandle.open || upperWick > body;
  const isResistanceRejection = touchedResistance && closedBelowResistance && isBearishRejection;

  // ==========================================
  // 🟢 OPTIMIZED BUY CONDITIONS (AI RISK PROFILE & EVOLVED THRESHOLDS)
  // ==========================================
  const rsiMin = aiProfile?.rsiBuyMin || evolved?.rsiBuyMin || config.strategy?.rsiBuyMin || 48;
  const rsiMax = aiProfile?.rsiBuyMax || evolved?.rsiBuyMax || config.strategy?.rsiBuyMax || 68;
  const volMult = aiProfile?.volumeMultiplier || evolved?.volumeMultiplier || config.strategy?.volumeMultiplier || 0.95;
  const confidenceBar = aiProfile?.confidenceThreshold || evolved?.confidenceThreshold || 65;

  const buyCond1_Trend = currentEMA20 !== null && currentEMA50 !== null && currentEMA20 > currentEMA50 && currentCandle.close >= currentEMA20;
  const buyCond2_RSI = currentRSI !== null && currentRSI >= rsiMin && currentRSI <= rsiMax && currentRSI >= (prevRSI || 0);
  const isMacdBullish = currentMACD.macd !== null && currentMACD.signal !== null && currentMACD.macd > currentMACD.signal;
  const isMacdGrowing = currentMACD.histogram !== null && prevMACD.histogram !== null && currentMACD.histogram >= prevMACD.histogram;
  const buyCond3_MACD = isMacdBullish && isMacdGrowing;
  const buyCond4_Volume = currentVol >= avgVol * volMult;
  const buyCond5_Support = isSupportBounce;
  const buyCond6_AIScore = aiAnalysis.score >= confidenceBar;

  const isBuySignal = buyCond1_Trend && buyCond2_RSI && buyCond3_MACD && buyCond4_Volume && buyCond5_Support && buyCond6_AIScore;

  // ==========================================
  // 🔴 DETAILED SELL / EXIT SIGNALS
  // ==========================================
  const sellCond1_EMACross = prevEMA20 !== null && prevEMA50 !== null && currentEMA20 !== null && currentEMA50 !== null && prevEMA20 >= prevEMA50 && currentEMA20 < currentEMA50;
  const sellCond2_RSICollapse = prevRSI !== null && currentRSI !== null && prevRSI >= (config.strategy.rsiSellOverbought || 70) && currentRSI < 68;
  const sellCond3_MACDCross = prevMACD.macd !== null && prevMACD.signal !== null && currentMACD.macd !== null && currentMACD.signal !== null && prevMACD.macd >= prevMACD.signal && currentMACD.macd < currentMACD.signal;
  const sellCond4_Resistance = isResistanceRejection;
  const sellCond5_AIBearish = aiAnalysis.score <= 35 && prevMACD.macd < prevMACD.signal;

  const isSellSignal = sellCond1_EMACross || sellCond2_RSICollapse || sellCond3_MACDCross || sellCond4_Resistance || sellCond5_AIBearish;

  // Compile Detailed Sell Reasons for clear Telegram alert
  const sellReasons = [];
  if (sellCond1_EMACross) {
    sellReasons.push({
      title: 'EMA Death Cross (ট্রেন্ড পরিবর্তন)',
      detail: `EMA 20 ($${currentEMA20.toFixed(1)}) EMA 50 ($${currentEMA50.toFixed(1)})-এর নিচে নেমে গেছে। আপট্রেন্ড শেষ হওয়ার নিশ্চিত সংকেত।`
    });
  }
  if (sellCond2_RSICollapse) {
    sellReasons.push({
      title: 'RSI মোমেন্টাম ক্র্যাশ',
      detail: `RSI ওভারবট জোন (${prevRSI.toFixed(1)}) থেকে নিচে নেমে ${currentRSI.toFixed(1)}-এ এসেছে। বায়ারদের দম শেষ।`
    });
  }
  if (sellCond3_MACDCross) {
    sellReasons.push({
      title: 'MACD বিয়ারিশ ক্রসওভার',
      detail: `MACD লাইন সিগন্যাল লাইনের নিচে চলে গেছে। সেলাররা বাজারে তীব্র নিয়ন্ত্রণ নিয়েছে।`
    });
  }
  if (sellCond4_Resistance) {
    sellReasons.push({
      title: 'রেজিস্ট্যান্স থেকে শক্তিশালী রিজেকশন',
      detail: `$${resistance ? resistance.toFixed(1) : 'N/A'} রেজিস্ট্যান্সে ধাক্কা খেয়ে রিজেকশন ক্যান্ডেল তৈরি হয়েছে।`
    });
  }
  if (sellCond5_AIBearish) {
    sellReasons.push({
      title: 'AI মার্কেট স্কোর নেতিবাচক (Score: ' + aiAnalysis.score + '/100)',
      detail: 'AI অ্যালগরিদম বাজারে উচ্চ ঝুঁকির বিয়ারিশ প্রেসার শনাক্ত করেছে।'
    });
  }

  return {
    candleTime: currentCandle.openTime,
    closeTime: currentCandle.closeTime,
    price: currentCandle.close,
    open: currentCandle.open,
    high: currentCandle.high,
    low: currentCandle.low,
    volume: currentVol,
    avgVolume: avgVol,
    indicators,
    aiAnalysis,
    buyConditions: {
      trendAligned: buyCond1_Trend,
      rsiInOptimalZone: buyCond2_RSI,
      macdBullishExpanding: buyCond3_MACD,
      volumeConfirmed: buyCond4_Volume,
      supportBounce: buyCond5_Support,
      aiConfidenceHigh: buyCond6_AIScore,
      allMatched: isBuySignal
    },
    sellConditions: {
      emaDeathCross: sellCond1_EMACross,
      rsiOverboughtCollapse: sellCond2_RSICollapse,
      macdBearishCross: sellCond3_MACDCross,
      resistanceRejection: sellCond4_Resistance,
      aiBearish: sellCond5_AIBearish,
      anyMatched: isSellSignal,
      sellReasons
    }
  };
}

module.exports = {
  evaluateStrategy
};
