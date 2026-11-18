/**
 * Multi-Coin Scalping & Research Bot with Autonomous AI Risk Profiles
 * Supports:
 * - 3 AI Risk Models (Low Risk, Mid Risk, High Risk)
 * - Deep Multi-Coin Scanning & Research across BTC, ETH, SOL, BNB, XRP, DOGE, PEPE, SUI, etc.
 * - Dynamic Telegram Model Switching (/aimodel low|mid|high, /models)
 * - Live Multi-Coin Research Reports (/scan)
 * - Autonomous Strategy Self-Evolution, ATR SL/TP, and Multi-Position Pyramiding
 * - Render.com Web Service Port Binding (Port 10000)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const {
  broadcastTelegramAlert,
  startTelegramListener,
  formatStartupMessage,
  formatBuyMessage,
  formatSellMessage,
  formatTradeClosedMessage
} = require('./telegram');
const {
  openTrade,
  checkLiveTrade,
  getActiveTrades,
  getActiveTrade,
  getSettingsAndWallet,
  getActiveAIModel,
  saveEvolvedStrategy,
  loadState
} = require('./paperTrading');
const { shouldScaleIntoPosition } = require('./aiEngine');
const { getAIProfile } = require('./aiProfiles');
const { scanMarketCoins, formatScanReport, fetchCandles } = require('./marketScanner');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading config.json:', e.message);
    process.exit(1);
  }
}

let latestMarketSnapshot = null;
let isScanInProgress = false;

function getLatestStatusMessage() {
  if (!latestMarketSnapshot) return null;
  const config = loadConfig();
  return {
    message: formatStartupMessage(latestMarketSnapshot, config.symbol || 'BTCUSDT', config.interval || '15m'),
    rawResult: latestMarketSnapshot
  };
}

async function runScanResearch() {
  const config = loadConfig();
  const { wallet } = getSettingsAndWallet();
  const fullState = loadState();
  const aiModelKey = getActiveAIModel();
  const aiProfile = getAIProfile(aiModelKey);

  console.log(`\n🔍 [Manual /scan Triggered] Researching ${aiProfile.symbols.length} coins with ${aiProfile.name}...`);
  const scanResults = await scanMarketCoins(
    aiProfile,
    config,
    wallet.balance,
    fullState.history,
    fullState.evolvedStrategy
  );

  return formatScanReport(scanResults, aiProfile);
}

async function checkMarket(isStartup = false) {
  if (isScanInProgress) return;
  isScanInProgress = true;

  const config = loadConfig();
  const { interval = '15m', telegram, paperTrading } = config;
  const { wallet } = getSettingsAndWallet();
  const fullState = loadState();
  const aiModelKey = getActiveAIModel();
  const aiProfile = getAIProfile(aiModelKey);

  try {
    // 1. Deep Multi-Coin Research across all coins defined in active AI Profile
    const scanResults = await scanMarketCoins(
      aiProfile,
      config,
      wallet.balance,
      fullState.history,
      fullState.evolvedStrategy
    );

    if (!scanResults || scanResults.length === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] [${aiProfile.name}] Waiting for market candle data...`);
      isScanInProgress = false;
      return;
    }

    // Identify BTC or top opportunity for status snapshot
    const btcResult = scanResults.find(r => r.symbol === 'BTCUSDT') || scanResults[0];
    latestMarketSnapshot = { ...btcResult.evalResult, price: btcResult.livePrice };

    // Persist newly evolved strategy rules if any
    if (btcResult.evalResult?.aiAnalysis?.evolvedStrategy) {
      saveEvolvedStrategy(btcResult.evalResult.aiAnalysis.evolvedStrategy);
    }

    // 2. Broadcast startup notification on initial run
    if (isStartup) {
      console.log(`[Startup] Broadcasting initial ${aiProfile.name} multi-coin market snapshot to subscribers...`);
      const startupMsg = formatStartupMessage(latestMarketSnapshot, btcResult.displayName, interval);
      await broadcastTelegramAlert(telegram.botToken, startupMsg);
    }

    // 3. Evaluate each researched cryptocurrency
    const maxPositionsAllowed = aiProfile.maxPositions;

    for (const coinData of scanResults) {
      const { symbol, displayName, livePrice, evalResult, buyConditions, sellConditions, aiAnalysis } = coinData;

      // 3A. Real-time Paper Trade SL/TP Check for this coin
      if (paperTrading?.enabled) {
        const liveCloseEvent = checkLiveTrade(symbol, livePrice, false);
        if (liveCloseEvent && liveCloseEvent.closedTrades.length > 0) {
          console.log(`\n🛑 >>> [${symbol}] PAPER TRADE HIT TARGET/SL (${liveCloseEvent.closedTrades.map(t => t.reason).join(', ')})! BROADCASTING TELEGRAM ALERT <<<`);
          const msg = formatTradeClosedMessage(liveCloseEvent.closedTrades, liveCloseEvent.stats, liveCloseEvent.wallet, displayName);
          await broadcastTelegramAlert(telegram.botToken, msg);
        }
      }

      // Check current open trades for this specific coin
      const currentActiveTrades = getActiveTrades();
      const tradesForCoin = currentActiveTrades.filter(t => (t.symbol || 'BTCUSDT').replace('/', '') === symbol.replace('/', ''));

      // 3B. Check SELL / EXIT Signals if we have an open trade on this coin
      if (sellConditions.anyMatched && tradesForCoin.length > 0) {
        console.log(`🚨 >>> [${symbol}] SELL / EXIT SIGNAL DETECTED! BROADCASTING TELEGRAM ALERT <<<`);
        const msg = formatSellMessage(evalResult, tradesForCoin, displayName, interval);
        await broadcastTelegramAlert(telegram.botToken, msg);

        if (paperTrading?.enabled && paperTrading?.exitOnSellSignal) {
          const exitEvent = checkLiveTrade(symbol, livePrice, true);
          if (exitEvent && exitEvent.closedTrades.length > 0) {
            console.log(`🔔 >>> CLOSING [${symbol}] ${exitEvent.closedTrades.length} TRADES DUE TO SELL SIGNAL <<<`);
            const exitMsg = formatTradeClosedMessage(exitEvent.closedTrades, exitEvent.stats, exitEvent.wallet, displayName);
            await broadcastTelegramAlert(telegram.botToken, exitMsg);
          }
        }
      }

      // 3C. Check BUY / Scaling-In Signals
      if (currentActiveTrades.length < maxPositionsAllowed) {
        let shouldTrade = false;
        let isScaleIn = false;

        if (tradesForCoin.length === 0) {
          // Initial Buy Entry for this coin
          if (buyConditions.allMatched) {
            shouldTrade = true;
            isScaleIn = false;
          }
        } else if (aiProfile.allowScalingIn) {
          // Dynamic Scaling-in / Pyramiding for this coin
          const scaleCheck = shouldScaleIntoPosition(tradesForCoin, livePrice, aiAnalysis, wallet.balance, evalResult.aiAnalysis?.evolvedStrategy);
          if (scaleCheck.canScale) {
            console.log(`⚡ [${symbol}] AI Pyramiding Triggered: ${scaleCheck.reason}`);
            shouldTrade = true;
            isScaleIn = true;
          }
        }

        if (shouldTrade) {
          console.log(`🚀 >>> [${symbol}] ${isScaleIn ? 'AI MULTI-POSITION SCALE-IN' : 'INITIAL BUY'} SIGNAL TRIGGERED! BROADCASTING TELEGRAM ALERT <<<`);
          if (paperTrading?.enabled) {
            const openResult = openTrade(symbol, livePrice, coinData.lastCandleTime, aiAnalysis, isScaleIn);
            if (openResult.error === 'INSUFFICIENT_BALANCE') {
              console.log(`⚠️ Insufficient balance to trade ${symbol}.`);
              await broadcastTelegramAlert(telegram.botToken, `⚠️ *[ট্রেড স্কিপ - ${displayName}] অপর্যাপ্ত ওয়ালেট ব্যালেন্স!*\nপ্রয়োজন $${openResult.needed.toFixed(2)} USD, বর্তমান ব্যালেন্স $${openResult.balance.toFixed(2)} USD। ব্যালেন্স বাড়াতে \`/setbalance\` ব্যবহার করুন।`);
            } else if (openResult.trade) {
              console.log(`📥 >>> OPENED [${symbol}] POSITION #${openResult.trade.positionNumber}! BROADCASTING TELEGRAM ALERT <<<`);
              const tradeMsg = formatBuyMessage(evalResult, openResult, displayName, interval);
              await broadcastTelegramAlert(telegram.botToken, tradeMsg);
            }
          }
        }
      }
    }

    // 4. Console Research Summary
    const updatedTrades = getActiveTrades();
    let tradeStatusText = 'No Active Trades';
    if (updatedTrades.length > 0) {
      tradeStatusText = `Positions (${updatedTrades.length}/${maxPositionsAllowed}): ${updatedTrades.map(t => {
        const sym = (t.symbol || 'BTC').replace('/USDT', '').replace('USDT', '');
        return `${sym}#${t.positionNumber}`;
      }).join(', ')}`;
    }

    const btcPriceFormatted = btcResult.livePrice < 1 ? btcResult.livePrice.toFixed(4) : btcResult.livePrice.toFixed(1);
    const topScorer = scanResults[0];
    const topPriceFormatted = topScorer.livePrice < 1 ? topScorer.livePrice.toFixed(4) : topScorer.livePrice.toFixed(2);
    const statusLine = `[${new Date().toLocaleTimeString()}] [${aiProfile.badge}] BTC: $${btcPriceFormatted} | Top Pick: ${topScorer.displayName} ($${topPriceFormatted}, Score: ${topScorer.aiAnalysis?.score}/100) | ${tradeStatusText}`;
    process.stdout.write(`\r${statusLine}`);

  } catch (err) {
    console.error(`\n[${new Date().toLocaleTimeString()}] Error in checkMarket:`, err.message);
  } finally {
    isScanInProgress = false;
  }
}

async function start() {
  const config = loadConfig();
  const { wallet, settings } = getSettingsAndWallet();
  const activeAI = getActiveAIModel();
  const aiProfile = getAIProfile(activeAI);

  console.log('====================================================');
  console.log(`  AI Multi-Coin Scalping & Research Bot Started`);
  console.log(`  Active AI Model: ${aiProfile.name}`);
  console.log(`  Monitored Coins: ${aiProfile.symbols.join(', ')}`);
  console.log(`  Interval: ${config.interval || '15m'} | Max Positions: ${aiProfile.maxPositions}`);
  console.log(`  Mode: ${settings.mode} | Wallet: $${wallet.balance.toFixed(2)} USD`);
  console.log(`  Scan Cycle: Every ${config.pollIntervalSeconds || 30} seconds`);
  console.log('====================================================');

  // Start Render Web Service HTTP Port Listener (Port Binding)
  const PORT = process.env.PORT || 10000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const allActive = getActiveTrades();
    const tradeText = allActive.length > 0
      ? `Active Positions (${allActive.length}): ` + allActive.map(t => `${t.symbol || 'BTC'} $${t.tradeAmountUSD} @ $${t.entryPrice.toFixed(2)}`).join(' | ')
      : 'No Active Trade';
    res.end(`
      <html>
        <head><title>AI Multi-Coin Scalping Bot</title></head>
        <body style="font-family: sans-serif; background: #0f172a; color: white; padding: 2rem; text-align: center;">
          <h1 style="color: #22c55e;">🚀 AI Multi-Coin Trading Bot</h1>
          <p style="font-size: 1.2rem;">Status: <b style="color: #38bdf8;">Healthy & Monitoring 24/7</b></p>
          <p style="color: #a855f7; font-weight: bold;">Active AI Model: ${aiProfile.name}</p>
          <p style="color: #94a3b8;">${tradeText}</p>
          <p style="color: #64748b; font-size: 0.9rem;">Server Time: ${new Date().toLocaleTimeString()}</p>
        </body>
      </html>
    `);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ [Render] Web service HTTP port ${PORT} is open and listening. Health check active!`);
  });

  // Start Telegram Command Listener (Handles /aimodel, /models, /scan, /positions, /history, etc.)
  startTelegramListener(config.telegram.botToken, getLatestStatusMessage, runScanResearch);

  // Initial check & broadcast startup notification
  await checkMarket(true);

  // Polling loop
  const intervalMs = (config.pollIntervalSeconds || 30) * 1000;
  setInterval(() => checkMarket(false), intervalMs);
}

start();
