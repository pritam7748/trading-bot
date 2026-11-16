/**
 * Telegram Notification & Auto-Subscriber Listener Module
 * Broadcasts initial market snapshot and confirmed BUY/SELL signals to all subscribers.
 */

const { getSubscribers, addSubscriber, removeSubscriber } = require('./subscriberManager');

async function sendTelegramAlert(botToken, chatId, message) {
  if (!botToken || !chatId || botToken.includes('YOUR_')) return false;

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    const data = await response.json();
    if (!data.ok) {
      if (data.error_code === 403) {
        removeSubscriber(chatId);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Telegram] Error sending to ${chatId}:`, err.message);
    return false;
  }
}

// Broadcasts an alert to ALL registered subscribers
async function broadcastTelegramAlert(botToken, message) {
  const subscribers = getSubscribers();
  if (!subscribers || subscribers.length === 0) {
    console.log('[Telegram Broadcast] No subscribers registered.');
    return;
  }

  console.log(`[Telegram Broadcast] Sending alert to ${subscribers.length} subscriber(s)...`);
  const promises = subscribers.map(sub => sendTelegramAlert(botToken, sub.id, message));
  await Promise.allSettled(promises);
}

// Polling listener to automatically handle /start, /stop, /status from ANY user
let lastUpdateId = 0;
let isPolling = false;

function startTelegramListener(botToken, getMarketSnapshot) {
  if (isPolling || !botToken || botToken.includes('YOUR_')) return;
  isPolling = true;
  console.log('🤖 [Telegram Listener] Auto-subscriber listener started. Listening for /start...');

  async function poll() {
    try {
      const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=15`;
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            lastUpdateId = update.update_id;
            const message = update.message;
            if (!message || !message.text) continue;

            const text = message.text.trim();
            const chatId = message.chat.id;
            const user = message.from || {};
            const userName = user.first_name || 'Trader';

            if (text.startsWith('/start')) {
              addSubscriber(chatId, user);
              const welcomeMsg = `🎉 *স্বাগতম, ${userName}!*
━━━━━━━━━━━━━━━━━━━━
✅ *আপনি সফলভাবে BTC 15m ট্রেডিং অ্যালার্টে সাবস্ক্রাইব করেছেন!*

এখন থেকে বিটকয়েনের নিশ্চিত BUY বা SELL সিগন্যাল তৈরি হলেই সরাসরি আপনার কাছে অ্যালার্ট পৌঁছে যাবে।

🎯 *ট্রেডিং সেটিংস:*
• ট্রেড সাইজ: $1.00 USD
• স্টপ লস (SL): 1.00%
• প্রফিট বুক (TP): 30.00%

📋 *কমান্ডসমূহ:*
• /status - বর্তমান লাইভ মার্কেট ও ইন্ডিকেটর অবস্থা দেখুন
• /stop - অ্যালার্ট বন্ধ করুন
━━━━━━━━━━━━━━━━━━━━`;
              await sendTelegramAlert(botToken, chatId, welcomeMsg);

              if (getMarketSnapshot) {
                const snapshotMsg = getMarketSnapshot();
                if (snapshotMsg) await sendTelegramAlert(botToken, chatId, snapshotMsg);
              }
            } else if (text.startsWith('/stop')) {
              removeSubscriber(chatId);
              const byeMsg = `🛑 *অ্যালার্ট সার্ভিস বন্ধ করা হয়েছে।*\n\nপুনরায় অ্যালার্ট চালু করতে যেকোনো সময় আবার */start* পাঠান।`;
              await sendTelegramAlert(botToken, chatId, byeMsg);
            } else if (text.startsWith('/status')) {
              if (getMarketSnapshot) {
                const snapshotMsg = getMarketSnapshot();
                await sendTelegramAlert(botToken, chatId, snapshotMsg || 'মার্কেট ডাটা লোড হচ্ছে, কিছুক্ষণ পর চেষ্টা করুন।');
              }
            }
          }
        }
      }
    } catch (_) {}

    setTimeout(poll, 1500);
  }

  poll();
}

function formatStartupMessage(result, symbol = 'BTC/USDT', interval = '15m', config = {}) {
  const { price, indicators, buyConditions } = result;
  const timeStr = new Date().toLocaleTimeString();
  const tradeAmount = config.paperTrading?.tradeAmountUSD || 1.0;
  const slPct = config.paperTrading?.stopLossPct || 1.0;
  const tpPct = config.paperTrading?.takeProfitPct || 30.0;

  return `🟢 *[BOT STARTED & MONITORING]*
━━━━━━━━━━━━━━━━━━━━
🤖 *Bot Status:* Live & Watching 15m Candles
⏰ *Start Time:* ${timeStr}
📊 *Symbol:* ${symbol} (${interval})
💵 *Settings:* $${tradeAmount.toFixed(2)} / Trade | SL: ${slPct}% | TP: ${tpPct}%

📈 *Current Market Snapshot:*
💰 *Live BTC Price:* $${price.toFixed(2)}
📉 *EMA 20:* $${indicators.ema20 ? indicators.ema20.toFixed(2) : 'N/A'}
📈 *EMA 50:* $${indicators.ema50 ? indicators.ema50.toFixed(2) : 'N/A'}
📊 *RSI (14):* ${indicators.rsi ? indicators.rsi.toFixed(2) : 'N/A'}
⚡ *MACD:* Line (${indicators.macd ? indicators.macd.toFixed(2) : 'N/A'}) | Signal (${indicators.signal ? indicators.signal.toFixed(2) : 'N/A'})
🛡️ *Support:* $${indicators.support ? indicators.support.toFixed(2) : 'N/A'}
🎯 *Resistance:* $${indicators.resistance ? indicators.resistance.toFixed(2) : 'N/A'}

📋 *Strategy Checklist (Need all 5 for BUY):*
• Trend (EMA 20 > EMA 50 & Price > EMA 20): ${buyConditions.trendAligned ? '✅' : '❌'}
• RSI in Optimal Range (48–68 & Rising): ${buyConditions.rsiInOptimalZone ? '✅' : '❌'}
• MACD Bullish & Expanding: ${buyConditions.macdBullishExpanding ? '✅' : '❌'}
• Volume Confirmed (Healthy Buying): ${buyConditions.volumeConfirmed ? '✅' : '❌'}
• Support / EMA20 Bounce: ${buyConditions.supportBounce ? '✅' : '❌'}
━━━━━━━━━━━━━━━━━━━━
🔔 স্ক্রিপ্ট চলছে। শুধুমাত্র কনফার্মড BUY বা SELL সিগন্যাল তৈরি হলেই পরবর্তী নোটিফিকেশন পাবেন।`;
}

function formatBuyMessage(evaluation, symbol = 'BTC/USDT', interval = '15m', config = {}) {
  const { price, indicators } = evaluation;
  const timeStr = new Date(evaluation.closeTime || Date.now()).toLocaleTimeString();
  const slPct = config.paperTrading?.stopLossPct || 1.0;
  const tpPct = config.paperTrading?.takeProfitPct || 30.0;
  const slPrice = price * (1 - slPct / 100);
  const tpPrice = price * (1 + tpPct / 100);

  return `🚀 *[BUY SIGNAL CONFIRMED] ${symbol} (${interval})*
━━━━━━━━━━━━━━━━━━━━
💰 *Entry Price:* $${price.toFixed(2)}
⏰ *Candle Close:* ${timeStr}
💵 *Trade Size:* $${(config.paperTrading?.tradeAmountUSD || 1.0).toFixed(2)} USD

*📋 All 5 Conditions Confirmed:*
✅ *Trend Alignment:* EMA 20 ($${indicators.ema20.toFixed(2)}) > EMA 50 ($${indicators.ema50.toFixed(2)})
✅ *RSI Momentum:* ${indicators.rsi.toFixed(2)} (Strong Bullish Zone)
✅ *MACD:* Bullish (${indicators.macd.toFixed(2)}) > Signal (${indicators.signal.toFixed(2)})
✅ *Volume:* Confirmed Institutional Participation
✅ *Price Action:* Clean Support / EMA 20 Bounce

*🎯 Targets & Risk Management:*
🛡️ *Stop-Loss (1%):* $${slPrice.toFixed(2)}
🎯 *Take-Profit (30%):* $${tpPrice.toFixed(2)}
━━━━━━━━━━━━━━━━━━━━
⚠️ *Action:* $1 এর ভার্চুয়াল লং ট্রেড শুরু হয়েছে এবং লাইভ ট্র্যাক করা হচ্ছে।`;
}

function formatSellMessage(evaluation, symbol = 'BTC/USDT', interval = '15m') {
  const { price, indicators, sellConditions } = evaluation;
  const timeStr = new Date(evaluation.closeTime || Date.now()).toLocaleTimeString();

  const signals = [];
  if (sellConditions.emaDeathCross) {
    signals.push(`⚠️ *EMA Death Cross:* EMA 20 crossed below EMA 50`);
  }
  if (sellConditions.rsiOverboughtCollapse) {
    signals.push(`⚠️ *RSI Overbought Drop:* Dropped below 68 from 70+`);
  }
  if (sellConditions.macdBearishCross) {
    signals.push(`⚠️ *MACD Bearish Cross:* MACD crossed below Signal line`);
  }
  if (sellConditions.resistanceRejection) {
    signals.push(`⚠️ *Resistance Rejection:* Strong rejection from resistance`);
  }

  return `🚨 *[SELL / EXIT SIGNAL] ${symbol} (${interval})*
━━━━━━━━━━━━━━━━━━━━
💰 *Current Price:* $${price.toFixed(2)}
⏰ *Time:* ${timeStr}

*⚠️ Triggered Reversal Reason:*
${signals.join('\n')}

*💡 Recommendation:*
• পজিশন এক্সিট করুন অথবা প্রফিট বুক করুন।
• যদি লং ট্রেডে থাকেন, তবে রানিং ট্রেড ক্লোজ করা হয়েছে।
━━━━━━━━━━━━━━━━━━━━`;
}

function formatTradeOpenedMessage(trade, symbol = 'BTC/USDT') {
  const timeStr = new Date(trade.entryTime || Date.now()).toLocaleTimeString();
  return `📥 *[PAPER TRADE OPENED] ${symbol}*
━━━━━━━━━━━━━━━━━━━━
💵 *Position Size:* $${trade.tradeAmountUSD.toFixed(2)} USD
📈 *Entry Price:* $${trade.entryPrice.toFixed(2)}
🛡️ *Stop Loss (${trade.stopLossPct}%):* $${trade.stopLossPrice.toFixed(2)}
🎯 *Take Profit (${trade.takeProfitPct}%):* $${trade.takeProfitPrice.toFixed(2)}
⏰ *Entry Time:* ${timeStr}
━━━━━━━━━━━━━━━━━━━━
📌 পজিশনটি লাইভ ট্র্যাক করা হচ্ছে। স্টপ লস বা ৩০% টার্গেটে স্বয়ংক্রিয়ভাবে লাভ/ক্ষতির হিসাব আসবে।`;
}

function formatTradeClosedMessage(closedTrade, stats, symbol = 'BTC/USDT') {
  const timeStr = new Date(closedTrade.exitTime || Date.now()).toLocaleTimeString();
  const isProfit = closedTrade.pnlUSD >= 0;
  const emoji = isProfit ? '🎉' : '🛑';
  const reasonText =
    closedTrade.reason === 'STOP_LOSS_HIT' ? '1% Stop Loss Hit 🛡️' :
    closedTrade.reason === 'TAKE_PROFIT_HIT' ? '30% Profit Target Hit 🎯' :
    'Sell / Exit Signal Triggered 🔔';

  return `${emoji} *[PAPER TRADE CLOSED] ${symbol}*
━━━━━━━━━━━━━━━━━━━━
📋 *Exit Reason:* ${reasonText}
💵 *Trade Size:* $${closedTrade.tradeAmountUSD.toFixed(2)} USD
📈 *Entry Price:* $${closedTrade.entryPrice.toFixed(2)}
📉 *Exit Price:* $${closedTrade.exitPrice.toFixed(2)}
⏰ *Close Time:* ${timeStr}

📊 *Result:* ${isProfit ? '✅ PROFIT' : '❌ LOSS'}
💰 *PnL (%):* ${isProfit ? '+' : ''}${closedTrade.pnlPct.toFixed(2)}%
💵 *PnL ($):* ${isProfit ? '+' : ''}$${closedTrade.pnlUSD.toFixed(4)} USD

━━━━━━━━━━━━━━━━━━━━
📊 *Overall Paper Trading Scorecard:*
• Total Trades: ${stats.totalTrades}
• Wins: ${stats.wins} | Losses: ${stats.losses}
• Win Rate: ${stats.winRatePct.toFixed(1)}%
• Net PnL: ${stats.totalPnLUSD >= 0 ? '+' : ''}$${stats.totalPnLUSD.toFixed(4)} USD
━━━━━━━━━━━━━━━━━━━━`;
}

module.exports = {
  sendTelegramAlert,
  broadcastTelegramAlert,
  startTelegramListener,
  formatStartupMessage,
  formatBuyMessage,
  formatSellMessage,
  formatTradeOpenedMessage,
  formatTradeClosedMessage
};
