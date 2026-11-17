/**
 * BTC 15m Scalping Alert Bot with Autonomous AI Market Intelligence
 * Monitors BTC 15m candles, detects market regimes, executes smart simulated trades,
 * and broadcasts alerts & rich analytics to Telegram subscribers.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { evaluateStrategy } = require('./strategy');
const {
  broadcastTelegramAlert,
  startTelegramListener,
  formatStartupMessage,
  formatBuyMessage,
  formatSellMessage,
  formatTradeOpenedMessage,
  formatTradeClosedMessage
} = require('./telegram');
const {
  openTrade,
  checkLiveTrade,
  getActiveTrades,
  getActiveTrade,
  getSettingsAndWallet,
  saveEvolvedStrategy,
  loadState
} = require('./paperTrading');
const { shouldScaleIntoPosition } = require('./aiEngine');

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

// Fetch candles with fallback support
async function fetchCandles(symbol = 'BTCUSDT', interval = '15m') {
  const binanceHosts = [
    'https://api.binance.com',
    'https://data-api.binance.vision',
    'https://api1.binance.com'
  ];

  for (const host of binanceHosts) {
    try {
      const url = `${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
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
    const bybitUrl = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitInterval}&limit=100`;
    const res = await fetch(bybitUrl, { signal: AbortSignal.timeout(6000) });
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

  throw new Error('All exchange candle endpoints failed. Please check network connection.');
}

let lastEvaluatedCandleTime = null;
let latestMarketSnapshot = null;

function getLatestStatusMessage() {
  if (!latestMarketSnapshot) return null;
  const config = loadConfig();
  return {
    message: formatStartupMessage(latestMarketSnapshot, config.symbol, config.interval),
    rawResult: latestMarketSnapshot
  };
}

async function checkMarket(isStartup = false) {
  const config = loadConfig();
  const { symbol, interval, telegram, paperTrading } = config;
  const { wallet, settings } = getSettingsAndWallet();
  const fullState = loadState();

  try {
    const rawCandles = await fetchCandles(symbol, interval);
    if (!rawCandles || rawCandles.length < 52) {
      console.log(`[${new Date().toLocaleTimeString()}] Waiting for candle history...`);
      return;
    }

    const closedCandles = rawCandles.slice(0, rawCandles.length - 1);
    const lastClosedCandle = closedCandles[closedCandles.length - 1];
    const liveCandle = rawCandles[rawCandles.length - 1];

    // --- 1. Real-time Multi-Position Paper Trade SL/TP Check ---
    if (paperTrading?.enabled) {
      const liveCloseEvent = checkLiveTrade(liveCandle.close, false);
      if (liveCloseEvent && liveCloseEvent.closedTrades.length > 0) {
        console.log(`\n🛑 >>> PAPER TRADE HIT TARGET/SL (${liveCloseEvent.closedTrades.map(t => t.reason).join(', ')})! BROADCASTING TELEGRAM ALERT <<<`);
        const msg = formatTradeClosedMessage(liveCloseEvent.closedTrades, liveCloseEvent.stats, liveCloseEvent.wallet, symbol);
        await broadcastTelegramAlert(telegram.botToken, msg);
      }
    }

    // Evaluate strategy with AI Engine & Self-Evolution
    const result = evaluateStrategy(closedCandles, config, wallet.balance, fullState.history, fullState.evolvedStrategy);
    if (result.error) return;

    // Persist newly evolved strategy rules
    if (result.aiAnalysis?.evolvedStrategy) {
      saveEvolvedStrategy(result.aiAnalysis.evolvedStrategy);
    }

    latestMarketSnapshot = { ...result, price: liveCandle.close };
    const { indicators, buyConditions, sellConditions, price, aiAnalysis } = result;

    // Send startup welcome message if this is the initial run
    if (isStartup) {
      console.log('[Startup] Broadcasting initial AI market snapshot to all subscribers...');
      const startupMsg = formatStartupMessage(latestMarketSnapshot, symbol, interval);
      await broadcastTelegramAlert(telegram.botToken, startupMsg);
    }

    // Display Active Trades info in Console
    const activeTrades = getActiveTrades();
    let tradeStatusText = 'No Active Trades';
    if (activeTrades.length > 0) {
      tradeStatusText = `Positions: ${activeTrades.length}/3 (${activeTrades.map(t => {
        const pnl = ((liveCandle.close - t.entryPrice) / t.entryPrice) * 100;
        return `#${t.positionNumber}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%`;
      }).join(' | ')})`;
    }

    const statusLine = `[${new Date().toLocaleTimeString()}] Live: $${liveCandle.close.toFixed(1)} | AI Score: ${aiAnalysis?.score}/100 | Stance: ${aiAnalysis?.aiStance} | ${tradeStatusText}`;
    process.stdout.write(`\r${statusLine}`);

    // If this candle was already evaluated, wait for next candle close
    if (lastEvaluatedCandleTime === lastClosedCandle.openTime) {
      return;
    }

    console.log(`\n\n🔔 [New ${interval} Candle Closed at ${new Date(lastClosedCandle.closeTime).toLocaleTimeString()}] Evaluating Strategy & AI...`);

    // --- 2. Check SELL / EXIT Signals ---
    if (sellConditions.anyMatched) {
      console.log('🚨 >>> SELL / EXIT SIGNAL DETECTED! BROADCASTING TELEGRAM ALERT <<<');
      const msg = formatSellMessage(result, activeTrades, symbol, interval);
      await broadcastTelegramAlert(telegram.botToken, msg);

      // If active paper trades exist, close all positions on exit signal
      if (paperTrading?.enabled && paperTrading?.exitOnSellSignal && activeTrades.length > 0) {
        const exitEvent = checkLiveTrade(price, true);
        if (exitEvent && exitEvent.closedTrades.length > 0) {
          console.log(`🔔 >>> CLOSING ${exitEvent.closedTrades.length} PAPER TRADES DUE TO SELL SIGNAL <<<`);
          const exitMsg = formatTradeClosedMessage(exitEvent.closedTrades, exitEvent.stats, exitEvent.wallet, symbol);
          await broadcastTelegramAlert(telegram.botToken, exitMsg);
        }
      }
    }

    // --- 3. Check BUY / Scaling-In Signals ---
    let shouldTrade = false;
    let isScaleIn = false;

    if (activeTrades.length === 0) {
      if (buyConditions.allMatched) {
        shouldTrade = true;
        isScaleIn = false;
      }
    } else {
      // Dynamic Multi-Position / Pyramiding Check
      const scaleCheck = shouldScaleIntoPosition(activeTrades, price, aiAnalysis, wallet.balance, result.aiAnalysis?.evolvedStrategy);
      if (scaleCheck.canScale) {
        console.log(`⚡ AI Pyramiding Triggered: ${scaleCheck.reason}`);
        shouldTrade = true;
        isScaleIn = true;
      }
    }

    if (shouldTrade) {
      console.log(`🚀 >>> ${isScaleIn ? 'AI MULTI-POSITION SCALE-IN' : 'INITIAL BUY'} SIGNAL TRIGGERED! BROADCASTING TELEGRAM ALERT <<<`);
      if (paperTrading?.enabled) {
        const openResult = openTrade(price, lastClosedCandle.closeTime, aiAnalysis, isScaleIn);
        if (openResult.error === 'INSUFFICIENT_BALANCE') {
          console.log('⚠️ Insufficient balance to open trade.');
          await broadcastTelegramAlert(telegram.botToken, `⚠️ *[ট্রেড স্কিপ] অপর্যাপ্ত ওয়ালেট ব্যালেন্স!*\nট্রেড নেওয়ার জন্য $${openResult.needed.toFixed(2)} USD প্রয়োজন, কিন্তু বর্তমান ব্যালেন্স $${openResult.balance.toFixed(2)} USD। ব্যালেন্স বাড়াতে \`/setbalance\` ব্যবহার করুন।`);
        } else if (openResult.trade) {
          console.log(`📥 >>> OPENED POSITION #${openResult.trade.positionNumber} (${openResult.trade.mode})! BROADCASTING TELEGRAM ALERT <<<`);
          const tradeMsg = formatBuyMessage(result, openResult, symbol, interval);
          await broadcastTelegramAlert(telegram.botToken, tradeMsg);
        }
      }
    } else if (activeTrades.length === 0) {
      console.log(`- BUY Checklist: Trend(${buyConditions.trendAligned ? '✅' : '❌'}) RSI(${buyConditions.rsiInOptimalZone ? '✅' : '❌'}) MACD(${buyConditions.macdBullishExpanding ? '✅' : '❌'}) Vol(${buyConditions.volumeConfirmed ? '✅' : '❌'}) Support(${buyConditions.supportBounce ? '✅' : '❌'}) AI(${buyConditions.aiConfidenceHigh ? '✅' : '❌'})`);
    }

    lastEvaluatedCandleTime = lastClosedCandle.openTime;

  } catch (err) {
    console.error(`\n[${new Date().toLocaleTimeString()}] Error in checkMarket:`, err.message);
  }
}

async function start() {
  const config = loadConfig();
  const { wallet, settings } = getSettingsAndWallet();

  console.log('====================================================');
  console.log(`  BTC 15m Scalping & AI Trading Bot Started`);
  console.log(`  Symbol: ${config.symbol} | Interval: ${config.interval}`);
  console.log(`  Mode: ${settings.mode} | Wallet: $${wallet.balance.toFixed(2)} USD`);
  console.log(`  Checking every ${config.pollIntervalSeconds || 30} seconds`);
  console.log('====================================================');

  // Start Render Web Service HTTP Port Listener (Port Binding)
  const PORT = process.env.PORT || 10000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const activeTrade = getActiveTrade();
    const tradeText = activeTrade
      ? `Active Paper Trade: $${activeTrade.tradeAmountUSD} @ $${activeTrade.entryPrice.toFixed(2)}`
      : 'No Active Trade';
    res.end(`
      <html>
        <head><title>BTC 15m AI Trading Bot</title></head>
        <body style="font-family: sans-serif; background: #0f172a; color: white; padding: 2rem; text-align: center;">
          <h1 style="color: #22c55e;">🚀 BTC 15m AI Scalping Bot</h1>
          <p style="font-size: 1.2rem;">Status: <b style="color: #38bdf8;">Healthy & Monitoring 24/7</b></p>
          <p style="color: #94a3b8;">${tradeText}</p>
          <p style="color: #64748b; font-size: 0.9rem;">Server Time: ${new Date().toLocaleTimeString()}</p>
        </body>
      </html>
    `);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ [Render] Web service HTTP port ${PORT} is open and listening. Health check active!`);
  });

  // Start Telegram Command Listener (Handles /history, /ai, /settings, /settrade, etc.)
  startTelegramListener(config.telegram.botToken, getLatestStatusMessage);

  // Initial check & broadcast startup notification
  await checkMarket(true);

  // Polling loop
  const intervalMs = (config.pollIntervalSeconds || 30) * 1000;
  setInterval(() => checkMarket(false), intervalMs);
}

start();
