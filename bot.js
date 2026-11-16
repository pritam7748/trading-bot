/**
 * BTC 15m Scalping Alert Bot with Auto-Subscriber Support
 * Monitors BTC 15m candles, executes simulated $1 trades with 1% Stop Loss,
 * and automatically broadcasts alerts to anyone who sends /start to the bot.
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
  getActiveTrade
} = require('./paperTrading');

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
  return formatStartupMessage(latestMarketSnapshot, config.symbol, config.interval, config);
}

async function checkMarket(isStartup = false) {
  const config = loadConfig();
  const { symbol, interval, telegram, paperTrading } = config;

  try {
    const rawCandles = await fetchCandles(symbol, interval);
    if (!rawCandles || rawCandles.length < 52) {
      console.log(`[${new Date().toLocaleTimeString()}] Waiting for candle history...`);
      return;
    }

    const closedCandles = rawCandles.slice(0, rawCandles.length - 1);
    const lastClosedCandle = closedCandles[closedCandles.length - 1];
    const liveCandle = rawCandles[rawCandles.length - 1];

    // --- 1. Real-time Paper Trade SL/TP Check ---
    if (paperTrading?.enabled) {
      const liveCloseEvent = checkLiveTrade(liveCandle.close, false);
      if (liveCloseEvent) {
        console.log(`\n🛑 >>> PAPER TRADE HIT TARGET/SL (${liveCloseEvent.closedTrade.reason})! BROADCASTING TELEGRAM ALERT <<<`);
        const msg = formatTradeClosedMessage(liveCloseEvent.closedTrade, liveCloseEvent.stats, symbol);
        await broadcastTelegramAlert(telegram.botToken, msg);
      }
    }

    // Evaluate strategy on the completed candle
    const result = evaluateStrategy(closedCandles, config);
    if (result.error) return;

    latestMarketSnapshot = { ...result, price: liveCandle.close };
    const { indicators, buyConditions, sellConditions, price } = result;

    // Send startup welcome message if this is the initial run
    if (isStartup) {
      console.log('[Startup] Broadcasting initial market snapshot to all subscribers...');
      const startupMsg = formatStartupMessage(latestMarketSnapshot, symbol, interval, config);
      await broadcastTelegramAlert(telegram.botToken, startupMsg);
    }

    // Display Active Trade info in Console
    const activeTrade = getActiveTrade();
    let tradeStatusText = 'No Active Trade';
    if (activeTrade) {
      const currentPnlPct = ((liveCandle.close - activeTrade.entryPrice) / activeTrade.entryPrice) * 100;
      tradeStatusText = `Trade: $${activeTrade.tradeAmountUSD} @ $${activeTrade.entryPrice.toFixed(1)} (PnL: ${currentPnlPct >= 0 ? '+' : ''}${currentPnlPct.toFixed(2)}%)`;
    }

    const statusLine = `[${new Date().toLocaleTimeString()}] Live: $${liveCandle.close.toFixed(1)} | Last Closed: $${price.toFixed(1)} | EMA20: ${indicators.ema20?.toFixed(1)} | RSI: ${indicators.rsi?.toFixed(1)} | ${tradeStatusText}`;
    process.stdout.write(`\r${statusLine}`);

    // If this candle was already evaluated, wait for next candle close
    if (lastEvaluatedCandleTime === lastClosedCandle.openTime) {
      return;
    }

    console.log(`\n\n🔔 [New ${interval} Candle Closed at ${new Date(lastClosedCandle.closeTime).toLocaleTimeString()}] Evaluating Strategy...`);

    // --- 2. Check SELL / EXIT Signals ---
    if (sellConditions.anyMatched) {
      console.log('🚨 >>> SELL / EXIT SIGNAL DETECTED! BROADCASTING TELEGRAM ALERT <<<');
      const msg = formatSellMessage(result, symbol, interval);
      await broadcastTelegramAlert(telegram.botToken, msg);

      // If active paper trade exists, close position on exit signal
      if (paperTrading?.enabled && paperTrading?.exitOnSellSignal && activeTrade) {
        const exitEvent = checkLiveTrade(price, true);
        if (exitEvent) {
          console.log('🔔 >>> CLOSING PAPER TRADE DUE TO SELL SIGNAL <<<');
          const exitMsg = formatTradeClosedMessage(exitEvent.closedTrade, exitEvent.stats, symbol);
          await broadcastTelegramAlert(telegram.botToken, exitMsg);
        }
      }
    }

    // --- 3. Check BUY Signals ---
    if (buyConditions.allMatched) {
      console.log('🚀 >>> ALL 5 BUY CONDITIONS MET! BROADCASTING TELEGRAM ALERT <<<');
      const msg = formatBuyMessage(result, symbol, interval, config);
      await broadcastTelegramAlert(telegram.botToken, msg);

      // If paper trading enabled, simulate entering a $1 trade
      if (paperTrading?.enabled) {
        const newTrade = openTrade(price, lastClosedCandle.closeTime, config);
        if (newTrade) {
          console.log('📥 >>> OPENING $1 PAPER TRADE! BROADCASTING TELEGRAM ALERT <<<');
          const tradeMsg = formatTradeOpenedMessage(newTrade, symbol);
          await broadcastTelegramAlert(telegram.botToken, tradeMsg);
        }
      }
    } else {
      console.log(`- BUY Checklist: Trend(${buyConditions.trendAligned ? '✅' : '❌'}) RSI(${buyConditions.rsiInOptimalZone ? '✅' : '❌'}) MACD(${buyConditions.macdBullishExpanding ? '✅' : '❌'}) Vol(${buyConditions.volumeConfirmed ? '✅' : '❌'}) Support(${buyConditions.supportBounce ? '✅' : '❌'})`);
    }

    lastEvaluatedCandleTime = lastClosedCandle.openTime;

  } catch (err) {
    console.error(`\n[${new Date().toLocaleTimeString()}] Error in checkMarket:`, err.message);
  }
}

async function start() {
  const config = loadConfig();
  console.log('====================================================');
  console.log(`  BTC 15m Scalping & Auto-Subscriber Bot Started`);
  console.log(`  Symbol: ${config.symbol} | Interval: ${config.interval}`);
  console.log(`  Checking every ${config.pollIntervalSeconds || 30} seconds`);
  console.log('====================================================');

  // Start Render Web Service HTTP Port Listener (Fixes "No open ports detected")
  const PORT = process.env.PORT || 10000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const activeTrade = getActiveTrade();
    const tradeText = activeTrade
      ? `Active Paper Trade: $${activeTrade.tradeAmountUSD} @ $${activeTrade.entryPrice.toFixed(2)}`
      : 'No Active Trade';
    res.end(`
      <html>
        <head><title>BTC 15m Trading Bot</title></head>
        <body style="font-family: sans-serif; background: #0f172a; color: white; padding: 2rem; text-align: center;">
          <h1 style="color: #22c55e;">🚀 BTC 15m Scalping Alert Bot</h1>
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

  // Start Telegram Command Listener (Handles /start, /stop, /status)
  startTelegramListener(config.telegram.botToken, getLatestStatusMessage);

  // Initial check & broadcast startup notification
  await checkMarket(true);

  // Polling loop
  const intervalMs = (config.pollIntervalSeconds || 30) * 1000;
  setInterval(() => checkMarket(false), intervalMs);
}

start();
