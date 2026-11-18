/**
 * Autonomous AI Trading Intelligence & Strategy Evolution Engine (aiEngine.js)
 * Supports:
 * 1. Multi-Coin Market Regime Detection
 * 2. Risk Profiles (Low, Mid, High)
 * 3. Self-Evolving Dynamic Strategy Adaptation
 * 4. Multi-Position Scaling-In (Pyramiding)
 * 5. Dynamic Risk & Bankroll Allocation
 */

function detectMarketRegime(price, indicators, volume, avgVolume) {
  const { ema20, ema50, rsi, macd, signal, atr } = indicators;
  if (!ema20 || !ema50 || !rsi) {
    return { regime: 'UNKNOWN', confidence: 0, reason: 'ডাটা অপর্যাপ্ত' };
  }

  const emaDiffPct = ((ema20 - ema50) / ema50) * 100;
  const isVolSpike = volume > avgVolume * 1.5;
  const atrPct = atr ? (atr / price) * 100 : 0.8;

  // 1. Strong Bull Trend
  if (ema20 > ema50 && price > ema20 && emaDiffPct > 0.25 && rsi > 52) {
    return {
      regime: 'STRONG_BULL_TREND',
      regimeName: 'বুলিশ ট্রেন্ড (আপট্রেন্ড) 🚀',
      bias: 'BULLISH',
      trendScore: 85,
      volatility: atrPct > 1.2 ? 'HIGH' : 'NORMAL',
      reason: 'EMA 20 শক্তভাবে EMA 50-এর উপরে রয়েছে এবং বায়ারদের আধিপত্য সুস্পষ্ট।'
    };
  }

  // 2. Strong Bear Trend
  if (ema20 < ema50 && price < ema20 && emaDiffPct < -0.25 && rsi < 48) {
    return {
      regime: 'STRONG_BEAR_TREND',
      regimeName: 'বিয়ারিশ ট্রেন্ড (ডাউনট্রেন্ড) 📉',
      bias: 'BEARISH',
      trendScore: -85,
      volatility: atrPct > 1.2 ? 'HIGH' : 'NORMAL',
      reason: 'মার্কেট ডাউনট্রেন্ডে রয়েছে। বিক্রেতাদের চাপ বেশি।'
    };
  }

  // 3. Volatile Breakout
  if (isVolSpike && atrPct > 1.0) {
    return {
      regime: 'VOLATILE_BREAKOUT',
      regimeName: 'উচ্চ ভোলাটিলিটি ব্রেকআউট ⚡',
      bias: ema20 > ema50 ? 'BULLISH' : 'BEARISH',
      trendScore: ema20 > ema50 ? 65 : -65,
      volatility: 'HIGH',
      reason: 'হঠাৎ অস্বাভাবিক ভলিউম ও প্রাইস মুভমেন্ট দেখা যাচ্ছে।'
    };
  }

  // 4. Ranging / Consolidation (Chop)
  return {
    regime: 'RANGING_CHOP',
    regimeName: 'কনসলিডেশন / সাইডওয়েজ (Chop Zone) ↔️',
    bias: 'NEUTRAL',
    trendScore: 0,
    volatility: 'LOW',
    reason: 'মার্কেট নির্দিষ্ট রেঞ্জের ভেতর ওঠানামা করছে। বড় ট্রেন্ড অনুপস্থিত।'
  };
}

/**
 * Self-Evolving Strategy Engine with AI Risk Profile Alignment
 */
function evolveStrategyEngine(currentEvolved, regime, tradeHistory = [], aiProfile = null) {
  const baseThreshold = aiProfile?.confidenceThreshold || currentEvolved?.confidenceThreshold || 68;
  const baseRsiMin = aiProfile?.rsiBuyMin || currentEvolved?.rsiBuyMin || 48;
  const baseRsiMax = aiProfile?.rsiBuyMax || currentEvolved?.rsiBuyMax || 68;
  const baseVol = aiProfile?.volumeMultiplier || currentEvolved?.volumeMultiplier || 0.95;
  const baseMaxPos = aiProfile?.maxPositions || currentEvolved?.maxPositions || 2;
  const baseScaling = aiProfile?.allowScalingIn ?? currentEvolved?.allowScalingIn ?? true;
  const baseAtrSL = aiProfile?.slMultiplierATR || currentEvolved?.atrMultiplierSL || 1.4;
  const baseRR = aiProfile?.rrTarget || currentEvolved?.riskRewardTarget || 2.5;

  const evolved = {
    generation: currentEvolved?.generation || 1,
    activeStyle: aiProfile?.name || currentEvolved?.activeStyle || 'AI_ADAPTIVE_TREND',
    confidenceThreshold: baseThreshold,
    rsiBuyMin: baseRsiMin,
    rsiBuyMax: baseRsiMax,
    atrMultiplierSL: baseAtrSL,
    minSLPct: aiProfile?.minSLPct || 0.8,
    maxSLPct: aiProfile?.maxSLPct || 2.5,
    riskRewardTarget: baseRR,
    volumeMultiplier: baseVol,
    maxPositions: baseMaxPos,
    allowScalingIn: baseScaling,
    lastAdaptedAt: Date.now(),
    adaptationLog: ''
  };

  const logs = [];

  // 1. Adapt Based on Market Regime
  if (regime.regime === 'STRONG_BULL_TREND') {
    evolved.activeStyle = `${aiProfile?.badge || 'AI'} • TREND_FOLLOWING 🚀`;
    evolved.allowScalingIn = baseScaling;
    evolved.maxPositions = baseMaxPos;
    evolved.riskRewardTarget = Math.max(baseRR, 2.6);
    evolved.rsiBuyMax = Math.min(76, baseRsiMax + 4);
    logs.push('মার্কেট আপট্রেন্ডে থাকায় AI বড় টার্গেট ও ট্রেন্ড স্কেলিং সক্রিয় রেখেছে।');
  } else if (regime.regime === 'RANGING_CHOP') {
    evolved.activeStyle = `${aiProfile?.badge || 'AI'} • DEFENSIVE_SCALPING 🛡️`;
    evolved.allowScalingIn = false;
    evolved.maxPositions = 1;
    evolved.riskRewardTarget = Math.min(baseRR, 2.0);
    logs.push('মার্কেট সাইডওয়েজে থাকায় AI রক্ষণাত্মক মোডে গেছে: স্কেলিং বন্ধ ও দ্রুত প্রফিট লক।');
  } else if (regime.regime === 'STRONG_BEAR_TREND') {
    evolved.activeStyle = `${aiProfile?.badge || 'AI'} • CAPITAL_PRESERVATION 🔒`;
    evolved.allowScalingIn = false;
    evolved.maxPositions = 1;
    evolved.confidenceThreshold = Math.min(85, baseThreshold + 6);
    logs.push('ডাউনট্রেন্ডের কারণে AI এন্ট্রি ফিল্টার কঠোর করেছে।');
  }

  // 2. Adapt Based on Performance History
  if (tradeHistory.length >= 3) {
    const recent = tradeHistory.slice(-5);
    const wins = recent.filter(t => t.isWin).length;
    const winRate = (wins / recent.length) * 100;

    if (winRate < 40) {
      evolved.confidenceThreshold = Math.min(82, evolved.confidenceThreshold + 3);
      logs.push(`সাম্প্রতিক উইন রেট (${winRate.toFixed(0)}%) কম হওয়ায় AI আরও সতর্ক হয়েছে।`);
    } else if (winRate >= 75) {
      evolved.generation = (currentEvolved?.generation || 1) + 1;
      logs.push(`চমৎকার উইন রেটের (${winRate.toFixed(0)}%) কারণে AI স্ট্র্যাটেজি Gen #${evolved.generation}-এ উন্নীত হয়েছে! 🎉`);
    }
  }

  evolved.adaptationLog = logs.join(' ');
  return evolved;
}

/**
 * Check if the AI should scale-in / take an ADDITIONAL trade
 */
function shouldScaleIntoPosition(activeTrades = [], currentPrice, aiAnalysis, walletBalance, evolvedStrategy) {
  const maxAllowed = evolvedStrategy?.maxPositions || 2;
  if (!evolvedStrategy?.allowScalingIn || activeTrades.length >= maxAllowed) {
    return { canScale: false, reason: 'সর্বোচ্চ পজিশন লিমিট বা স্কেলিং অফ' };
  }

  if (activeTrades.length === 0) {
    return { canScale: false, reason: 'কোনো মূল পজিশন খোলা নেই' };
  }

  const tradeSize = aiAnalysis.allocation?.suggestedAmountUSD || 5.0;
  if (walletBalance < tradeSize) {
    return { canScale: false, reason: 'অপর্যাপ্ত ব্যালেন্স' };
  }

  const latestTrade = activeTrades[activeTrades.length - 1];
  const pnlPct = ((currentPrice - latestTrade.entryPrice) / latestTrade.entryPrice) * 100;

  const isHealthyProfit = pnlPct >= 0.35;
  const isBullishContinuation = aiAnalysis.score >= 72 && aiAnalysis.regime.regime === 'STRONG_BULL_TREND';

  if (isHealthyProfit && isBullishContinuation) {
    return {
      canScale: true,
      positionIndex: activeTrades.length + 1,
      reason: `পূর্বের ট্রেডে লাভ (+${pnlPct.toFixed(2)}%) এবং স্ট্রং বুলিশ কন্টিনিউয়েশন সিগন্যাল রয়েছে।`,
      suggestedAmountUSD: tradeSize
    };
  }

  return { canScale: false, reason: 'স্কেলিংয়ের উপযুক্ত শর্ত পূরণ হয়নি' };
}

function calculateDynamicRiskReward(price, indicators, regime, evolvedStrategy = {}, aiProfile = null) {
  const { atr, support, resistance } = indicators;
  const atrVal = atr || price * 0.008;
  const slMultiplier = evolvedStrategy.atrMultiplierSL || aiProfile?.slMultiplierATR || 1.4;
  const rrTarget = evolvedStrategy.riskRewardTarget || aiProfile?.rrTarget || 2.5;

  const minSL = aiProfile?.minSLPct || evolvedStrategy.minSLPct || 0.8;
  const maxSL = aiProfile?.maxSLPct || evolvedStrategy.maxSLPct || 2.5;

  // 1. Dynamic Stop Loss
  let dynamicSLPct = (slMultiplier * atrVal / price) * 100;
  dynamicSLPct = Math.max(minSL, Math.min(maxSL, dynamicSLPct));

  if (support && price > support) {
    const supportDistancePct = ((price - support) / price) * 100;
    if (supportDistancePct >= 0.5 && supportDistancePct <= maxSL) {
      dynamicSLPct = Math.max(minSL, supportDistancePct + 0.25);
    }
  }

  // 2. Dynamic Take Profit
  let dynamicTPPct = dynamicSLPct * rrTarget;
  dynamicTPPct = Math.max(1.8, Math.min(25.0, dynamicTPPct));

  const stopLossPrice = price * (1 - dynamicSLPct / 100);
  const takeProfitPrice = price * (1 + dynamicTPPct / 100);

  return {
    dynamicSLPct: parseFloat(dynamicSLPct.toFixed(2)),
    dynamicTPPct: parseFloat(dynamicTPPct.toFixed(2)),
    stopLossPrice: parseFloat(stopLossPrice.toFixed(2)),
    takeProfitPrice: parseFloat(takeProfitPrice.toFixed(2)),
    riskRewardRatio: parseFloat((dynamicTPPct / dynamicSLPct).toFixed(2))
  };
}

function calculateDynamicAllocation(walletBalance, regime, confidenceScore, tradeHistory = [], aiProfile = null) {
  let allocPct = aiProfile?.allocationPct || 20.0;

  if (confidenceScore >= 80) {
    allocPct = Math.min(35.0, allocPct * 1.15);
  } else if (confidenceScore < 65) {
    allocPct = Math.max(8.0, allocPct * 0.7);
  }

  if (tradeHistory.length >= 3) {
    const recent = tradeHistory.slice(-4);
    const recentWins = recent.filter(t => t.isWin).length;
    const recentWinRate = (recentWins / recent.length) * 100;

    if (recentWinRate < 35) {
      allocPct = Math.max(6.0, allocPct * 0.6);
    } else if (recentWinRate >= 75 && allocPct > 0) {
      allocPct = Math.min(35.0, allocPct * 1.1);
    }
  }

  allocPct = parseFloat(allocPct.toFixed(1));
  const suggestedAmountUSD = parseFloat(((walletBalance * allocPct) / 100).toFixed(2));

  return {
    allocPct,
    suggestedAmountUSD: Math.max(1.0, suggestedAmountUSD)
  };
}

function analyzeMarketWithAI(candles, indicators, walletBalance, tradeHistory = [], currentEvolved = null, aiProfile = null) {
  const targetIndex = candles.length - 1;
  const currentCandle = candles[targetIndex];
  const price = currentCandle.close;

  // 1. Detect Regime
  const regime = detectMarketRegime(price, indicators, currentCandle.volume, indicators.avgVolume || currentCandle.volume);

  // 2. Self-Evolve Strategy Rules
  const evolvedStrategy = evolveStrategyEngine(currentEvolved, regime, tradeHistory, aiProfile);

  // 3. Compute AI Confidence Score
  let score = 50;
  const reasons = [];

  if (indicators.ema20 > indicators.ema50 && price > indicators.ema20) {
    score += 15;
    reasons.push('EMA 20/50 বুলিশ ট্রেন্ড অ্যালাইনমেন্ট (+15%)');
  } else if (indicators.ema20 < indicators.ema50 && price < indicators.ema20) {
    score -= 20;
    reasons.push('EMA ডেথ ক্রস ডাউনট্রেন্ড (-20%)');
  }

  if (indicators.rsi >= evolvedStrategy.rsiBuyMin && indicators.rsi <= evolvedStrategy.rsiBuyMax) {
    score += 15;
    reasons.push(`RSI অপ্টিমাল রেঞ্জে (${evolvedStrategy.rsiBuyMin}-${evolvedStrategy.rsiBuyMax}) রয়েছে (+15%)`);
  } else if (indicators.rsi > 74) {
    score -= 15;
    reasons.push('RSI অতিরিক্ত ওভারবট (74+), রিভার্সালের ঝুঁকি (-15%)');
  } else if (indicators.rsi < 38) {
    score -= 15;
    reasons.push('RSI দুর্বল বিয়ারিশ মোমেন্টামে (-15%)');
  }

  if (indicators.macd > indicators.signal && indicators.histogram > 0) {
    score += 10;
    reasons.push('MACD বুলিশ হিস্টোগ্রাম ঊর্ধ্বমুখী (+10%)');
  } else if (indicators.macd < indicators.signal) {
    score -= 15;
    reasons.push('MACD বিয়ারিশ ক্রসওভার সক্রিয় (-15%)');
  }

  if (indicators.support && currentCandle.low <= indicators.support * 1.004 && currentCandle.close >= indicators.support) {
    score += 10;
    reasons.push('সাপোর্ট জোন থেকে সফল রিজেকশন বাউন্স (+10%)');
  }

  score = Math.max(5, Math.min(95, score));

  // 4. Dynamic SL/TP based on evolved parameters and AI Risk Profile
  const riskReward = calculateDynamicRiskReward(price, indicators, regime, evolvedStrategy, aiProfile);

  // 5. Dynamic Allocation
  const allocation = calculateDynamicAllocation(walletBalance, regime, score, tradeHistory, aiProfile);

  // 6. Action Stance
  let aiStance = 'HOLD / WAIT';
  let stanceEmoji = '⏸️';

  const threshold = evolvedStrategy.confidenceThreshold || 68;
  if (score >= threshold && regime.bias === 'BULLISH') {
    aiStance = 'STRONG BUY';
    stanceEmoji = '🟢';
  } else if (score <= 35 || regime.bias === 'BEARISH') {
    aiStance = 'SELL / EXIT';
    stanceEmoji = '🔴';
  }

  return {
    price,
    regime,
    score,
    aiStance,
    stanceEmoji,
    evolvedStrategy,
    riskReward,
    allocation,
    analysisReasons: reasons
  };
}

module.exports = {
  detectMarketRegime,
  evolveStrategyEngine,
  shouldScaleIntoPosition,
  calculateDynamicRiskReward,
  calculateDynamicAllocation,
  analyzeMarketWithAI
};
