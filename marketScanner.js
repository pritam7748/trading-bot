/**
 * Multi-Coin Market Scanner & Research Engine (marketScanner.js)
 * Scans multiple cryptocurrency pairs, evaluates each with the active AI Model,
 * and identifies the highest-conviction trading opportunities.
 */

const { evaluateStrategy } = require('./strategy');

async function fetchCandles(symbol = 'BTCUSDT', interval = '15m') {
  const binanceHosts = [
    'https://api.binance.com',
    'https://data-api.binance.vision',
    'https://api1.binance.com'
  ];

  for (const host of binanceHosts) {
    try {
      const url = `${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=70`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        return data.map(item => ({
          openTime: item[0],
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
          volume: parseFloat(item[5]),
          closeTime: item[6]
        }));
      }
    } catch (_) {}
  }

  // Fallback to Bybit
  try {
    const bybitInterval = interval === '15m' ? '15' : interval === '1h' ? '60' : '15';
    const bybitUrl = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitInterval}&limit=70`;
    const res = await fetch(bybitUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = await res.json();
      if (json.result && json.result.list) {
        const list = json.result.list.slice().reverse();
        return list.map(item => ({
          openTime: parseInt(item[0]),
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
          volume: parseFloat(item[5]),
          closeTime: parseInt(item[0]) + (15 * 60 * 1000 - 1)
        }));
      }
    }
  } catch (_) {}

  return null;
}

/**
 * Deep Research across all symbols in the AI profile
 */
async function scanMarketCoins(aiProfile, config, walletBalance, tradeHistory, currentEvolved = null) {
  const symbols = aiProfile.symbols || ['BTCUSDT'];
  const results = [];

  for (const symbol of symbols) {
    try {
      const rawCandles = await fetchCandles(symbol, config.interval || '15m');
      if (!rawCandles || rawCandles.length < 52) continue;

      const closedCandles = rawCandles.slice(0, rawCandles.length - 1);
      const liveCandle = rawCandles[rawCandles.length - 1];

      // Evaluate strategy using active AI Profile parameters
      const evalResult = evaluateStrategy(closedCandles, config, walletBalance, tradeHistory, currentEvolved, aiProfile);
      if (evalResult.error) continue;

      results.push({
        symbol,
        displayName: symbol.replace('USDT', '/USDT'),
        livePrice: liveCandle.close,
        lastClosedPrice: evalResult.price,
        aiAnalysis: evalResult.aiAnalysis,
        buyConditions: evalResult.buyConditions,
        sellConditions: evalResult.sellConditions,
        indicators: evalResult.indicators,
        evalResult,
        lastCandleTime: evalResult.candleTime,
        closeTime: evalResult.closeTime
      });

      // Small research delay between coins to respect network limits
      await new Promise(r => setTimeout(r, 350));
    } catch (_) {}
  }

  // Sort opportunities by AI Confidence Score descending
  results.sort((a, b) => (b.aiAnalysis?.score || 0) - (a.aiAnalysis?.score || 0));

  return results;
}

/**
 * Format Telegram Research Report Card
 */
function formatScanReport(scanResults, aiProfile) {
  if (!scanResults || scanResults.length === 0) {
    return '⚠️ মার্কেট স্ক্যানিং সম্পন্ন হয়েছে, কিন্তু কোনো কয়েনের ডাটা পাওয়া যায়নি। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।';
  }

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const rows = scanResults.map((item, idx) => {
    const score = item.aiAnalysis?.score || 50;
    const stanceEmoji = item.aiAnalysis?.stanceEmoji || '⏸️';
    const regime = item.aiAnalysis?.regime?.regimeName || 'Normal';
    const priceFormatted = item.livePrice < 1 ? item.livePrice.toFixed(4) : item.livePrice.toFixed(2);
    const isBuyReady = item.buyConditions?.allMatched;

    const buyTag = isBuyReady ? ' 🔥 [BUY READY]' : '';
    return `${idx + 1}. ${stanceEmoji} *${item.displayName}* ($${priceFormatted})${buyTag}\n   • Score: *${score}/100* | Stance: *${item.aiAnalysis?.aiStance || 'HOLD'}*\n   • Trend: ${regime}`;
  }).join('\n\n');

  const topPick = scanResults.find(r => r.buyConditions?.allMatched) || scanResults[0];

  return `🔍 *AI মাল্টি-কয়েন মার্কেট রিসার্চ রিপোর্ট*
━━━━━━━━━━━━━━━━━━━━
🤖 *Active AI Model:* *${aiProfile.name}*
⏰ *Scan Time:* ${timeStr}
📊 *Scanned Coins:* ${scanResults.length}টি ক্রিপ্টোকারেন্সি

${rows}

━━━━━━━━━━━━━━━━━━━━
💡 *AI Top Recommendation:* 
⭐ *${topPick.displayName}* (Score: ${topPick.aiAnalysis?.score}/100)
• প্রস্তাবিত SL: ${topPick.aiAnalysis?.riskReward?.dynamicSLPct}% | TP: ${topPick.aiAnalysis?.riskReward?.dynamicTPPct}%
━━━━━━━━━━━━━━━━━━━━`;
}

module.exports = {
  fetchCandles,
  scanMarketCoins,
  formatScanReport
};
