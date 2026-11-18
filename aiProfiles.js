/**
 * AI Risk Models & Coin Universe Definition (aiProfiles.js)
 * Defines 3 distinct AI models:
 * 1. LOW_RISK: Conservative Guardian AI (BTC, ETH, SOL - High capital preservation)
 * 2. MID_RISK: Balanced Growth AI (Default - Top liquid large/mid caps)
 * 3. HIGH_RISK: Alpha Momentum Hunter AI (High volatility & breakout momentum coins)
 */

const AI_PROFILES = {
  LOW_RISK: {
    id: 'LOW_RISK',
    key: 'low',
    name: '🛡️ Conservative Guardian AI (Low Risk)',
    badge: 'LOW RISK 🛡️',
    description: 'সর্বোচ্চ ক্যাপিটাল নিরাপত্তা। শুধুমাত্র শীর্ষ ৩টি নিরাপদ ক্রিপ্টো এবং অত্যন্ত শক্তিশালী কনফার্মেশনে ট্রেড।',
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    confidenceThreshold: 78,
    maxPositions: 1,
    allowScalingIn: false,
    allocationPct: 15.0, // Max 15% of wallet per trade
    slMultiplierATR: 1.2,
    minSLPct: 0.8,
    maxSLPct: 1.5,
    rrTarget: 2.2, // 1:2.2 RR
    rsiBuyMin: 50,
    rsiBuyMax: 65,
    volumeMultiplier: 1.15,
    researchSpeedSeconds: 20
  },
  MID_RISK: {
    id: 'MID_RISK',
    key: 'mid',
    name: '⚖️ Balanced Growth AI (Medium Risk)',
    badge: 'MID RISK ⚖️',
    description: 'ভারসাম্যপূর্ণ রিস্ক ও গ্রোথ। টপ লিকুইড কয়েনগুলোতে ট্রেন্ড ফলোয়িং ও নিয়ন্ত্রিত মাল্টি-ট্রেড স্কেলিং।',
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'],
    confidenceThreshold: 68,
    maxPositions: 2,
    allowScalingIn: true,
    allocationPct: 22.0, // 20-25% of wallet
    slMultiplierATR: 1.4,
    minSLPct: 1.0,
    maxSLPct: 2.2,
    rrTarget: 2.6, // 1:2.6 RR
    rsiBuyMin: 48,
    rsiBuyMax: 68,
    volumeMultiplier: 0.95,
    researchSpeedSeconds: 15
  },
  HIGH_RISK: {
    id: 'HIGH_RISK',
    key: 'high',
    name: '🚀 Alpha Momentum Hunter AI (High Risk)',
    badge: 'HIGH RISK 🚀',
    description: 'সর্বোচ্চ প্রফিট ও দ্রুত স্ক্যাল্পিং। উচ্চ ভোলাটিলিটি কয়েনে আগ্রাসী ব্রেকআউট ও মাল্টি-পজিশন ট্রেডিং।',
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'PEPEUSDT', 'SUIUSDT', 'NEARUSDT', 'AVAXUSDT'],
    confidenceThreshold: 60,
    maxPositions: 3,
    allowScalingIn: true,
    allocationPct: 30.0, // Up to 30% of wallet
    slMultiplierATR: 1.8,
    minSLPct: 1.5,
    maxSLPct: 3.5,
    rrTarget: 3.2, // 1:3.2 RR (large profit targets)
    rsiBuyMin: 44,
    rsiBuyMax: 74,
    volumeMultiplier: 0.85,
    researchSpeedSeconds: 10
  }
};

function getAIProfile(modelKey = 'MID_RISK') {
  const normalized = String(modelKey).toUpperCase();
  if (normalized.includes('LOW')) return AI_PROFILES.LOW_RISK;
  if (normalized.includes('HIGH')) return AI_PROFILES.HIGH_RISK;
  return AI_PROFILES.MID_RISK;
}

module.exports = {
  AI_PROFILES,
  getAIProfile
};
