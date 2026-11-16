/**
 * Telegram Notification & Interactive Command Listener Module
 * Supports dynamic configuration directly from Telegram:
 * /settings, /setbalance, /settrade, /setsl, /settp, /status, /help, /start, /stop
 */

const { getSubscribers, addSubscriber, removeSubscriber } = require('./subscriberManager');
const {
  getSettingsAndWallet,
  updateWalletBalance,
  updateTradeAmount,
  updateStopLossPct,
  updateTakeProfitPct
} = require('./paperTrading');

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

function formatSettingsMessage() {
  const data = getSettingsAndWallet();
  const { wallet, settings, activeTrade, stats } = data;

  const activeTradeText = activeTrade
    ? `🟢 *Active Trade:* $${activeTrade.tradeAmountUSD.toFixed(2)} @ $${activeTrade.entryPrice.toFixed(2)} (SL: $${activeTrade.stopLossPrice.toFixed(2)} | TP: $${activeTrade.takeProfitPrice.toFixed(2)})`
    : '⚪ *Active Trade:* No position currently open';

  return `⚙️ *আপনার ট্রেডিং ও ওয়ালেট সেটিংস*
━━━━━━━━━━━━━━━━━━━━
💰 *Wallet Balance:* $${wallet.balance.toFixed(2)} USD
💵 *Trade Value:* $${settings.tradeAmountUSD.toFixed(2)} USD
🛡️ *Stop Loss:* ${settings.stopLossPct.toFixed(2)}%
🎯 *Take Profit:* ${settings.takeProfitPct.toFixed(2)}%

${activeTradeText}

📊 *ট্রেডিং হিস্ট্রি:*
• মোট ট্রেড: ${stats.totalTrades} | জয়: ${stats.wins} | পরাজয়: ${stats.losses}
• উইন রেট: ${stats.winRatePct.toFixed(1)}%
• মোট লাভ/ক্ষতি: ${stats.totalPnLUSD >= 0 ? '+' : ''}$${stats.totalPnLUSD.toFixed(4)} USD

━━━━━━━━━━━━━━━━━━━━
💡 *সেটিংস পরিবর্তন করার কমান্ডসমূহ:*
• \`/setbalance 50\` ➡️ ব্যালেন্স পরিবর্তন
• \`/settrade 10\` ➡️ ট্রেড ভ্যালু পরিবর্তন
• \`/setsl 1.5\` ➡️ স্টপ লস শতাংশ পরিবর্তন
• \`/settp 30\` ➡️ টেক প্রফিট শতাংশ পরিবর্তন`;
}

function formatHelpMessage() {
  return `🤖 *বটের সমস্ত কমান্ডসমূহ:*
━━━━━━━━━━━━━━━━━━━━
⚙️ *সেটিংস ও কন্ট্রোল:*
• \`/settings\` - বর্তমান ওয়ালেট ব্যালেন্স ও ট্রেড সেটিংস দেখুন
• \`/setbalance <টাকা>\` - ওয়ালেট ব্যালেন্স সেট করুন (উদা: \`/setbalance 30\`)
• \`/settrade <টাকা>\` - প্রতি ট্রেডের সাইজ সেট করুন (উদা: \`/settrade 10\`)
• \`/setsl <শতাংশ>\` - স্টপ লস পারসেন্টেজ সেট করুন (উদা: \`/setsl 1\`)
• \`/settp <শতাংশ>\` - প্রফিট বুক পারসেন্টেজ সেট করুন (উদা: \`/settp 30\`)

📊 *মার্কেট ও অ্যালার্ট:*
• \`/status\` - বর্তমান লাইভ মার্কেট ডাটা ও ইন্ডিকেটর অবস্থা
• \`/start\` - অ্যালার্ট চালু / সাবস্ক্রাইব করুন
• \`/stop\` - অ্যালার্ট সাময়িকভাবে বন্ধ করুন
━━━━━━━━━━━━━━━━━━━━`;
}

// Polling listener to automatically handle commands from ANY user
let lastUpdateId = 0;
let isPolling = false;

function startTelegramListener(botToken, getMarketSnapshot) {
  if (isPolling || !botToken || botToken.includes('YOUR_')) return;
  isPolling = true;
  console.log('🤖 [Telegram Listener] Interactive command listener started. Listening for /settings, /settrade, etc...');

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
            const parts = text.split(/\s+/);
            const cmd = parts[0].toLowerCase();
            const arg = parts[1];

            // 1. /start Command
            if (cmd === '/start' || cmd.startsWith('/start@')) {
              addSubscriber(chatId, user);
              const welcomeMsg = `🎉 *স্বাগতম, ${userName}!*
━━━━━━━━━━━━━━━━━━━━
✅ *আপনি সফলভাবে BTC 15m ট্রেডিং অ্যালার্টে যুক্ত হয়েছেন!*

এখন থেকে বিটকয়েনের নিশ্চিত BUY বা SELL সিগন্যাল তৈরি হলেই সরাসরি আপনার কাছে অ্যালার্ট পৌঁছে যাবে।

${formatSettingsMessage()}

📌 সমস্ত কমান্ড দেখতে পাঠান: \`/help\``;
              await sendTelegramAlert(botToken, chatId, welcomeMsg);
            }

            // 2. /settings or /config or /wallet
            else if (cmd === '/settings' || cmd === '/config' || cmd === '/wallet') {
              await sendTelegramAlert(botToken, chatId, formatSettingsMessage());
            }

            // 3. /setbalance <amount>
            else if (cmd === '/setbalance' || cmd === '/balance') {
              const val = parseFloat(arg);
              if (isNaN(val) || val < 0) {
                await sendTelegramAlert(botToken, chatId, '⚠️ অনুগ্রহ করে সঠিক সংখ্যা লিখুন। যেমন: `/setbalance 30`');
              } else {
                const newBal = updateWalletBalance(val);
                await sendTelegramAlert(botToken, chatId, `✅ *ওয়ালেট ব্যালেন্স সফলভাবে আপডেট করা হয়েছে!* \n💰 বর্তমান ব্যালেন্স: *$${newBal.toFixed(2)} USD*`);
              }
            }

            // 4. /settrade <amount>
            else if (cmd === '/settrade' || cmd === '/trade') {
              const val = parseFloat(arg);
              if (isNaN(val) || val <= 0) {
                await sendTelegramAlert(botToken, chatId, '⚠️ অনুগ্রহ করে সঠিক সংখ্যা লিখুন। যেমন: `/settrade 10`');
              } else {
                const newTrade = updateTradeAmount(val);
                await sendTelegramAlert(botToken, chatId, `✅ *প্রতি ট্রেডের ভ্যালু সফলভাবে সেট করা হয়েছে!* \n💵 Per Trade Size: *$${newTrade.toFixed(2)} USD*`);
              }
            }

            // 5. /setsl <percentage>
            else if (cmd === '/setsl' || cmd === '/sl') {
              const val = parseFloat(arg);
              if (isNaN(val) || val <= 0 || val >= 50) {
                await sendTelegramAlert(botToken, chatId, '⚠️ অনুগ্রহ করে সঠিক পারসেন্টেজ লিখুন (0.1 থেকে 50 এর মধ্যে)। যেমন: `/setsl 1` বা `/setsl 1.5`');
              } else {
                const newSL = updateStopLossPct(val);
                await sendTelegramAlert(botToken, chatId, `✅ *স্টপ লস (Stop Loss) সেট করা হয়েছে:* *${newSL.toFixed(2)}%* 🛡️`);
              }
            }

            // 6. /settp <percentage>
            else if (cmd === '/settp' || cmd === '/tp') {
              const val = parseFloat(arg);
              if (isNaN(val) || val <= 0) {
                await sendTelegramAlert(botToken, chatId, '⚠️ অনুগ্রহ করে সঠিক পারসেন্টেজ লিখুন। যেমন: `/settp 30` বা `/settp 15`');
              } else {
                const newTP = updateTakeProfitPct(val);
                await sendTelegramAlert(botToken, chatId, `✅ *টেক প্রফিট (Profit Target) সেট করা হয়েছে:* *${newTP.toFixed(2)}%* 🎯`);
              }
            }

            // 7. /help
            else if (cmd === '/help') {
              await sendTelegramAlert(botToken, chatId, formatHelpMessage());
            }

            // 8. /stop
            else if (cmd === '/stop') {
              removeSubscriber(chatId);
              await sendTelegramAlert(botToken, chatId, '🛑 *অ্যালার্ট সার্ভিস বন্ধ করা হয়েছে।*\n\nপুনরায় চালু করতে যেকোনো সময় আবার `/start` পাঠান।');
            }

            // 9. /status
            else if (cmd === '/status') {
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

function formatStartupMessage(result, symbol = 'BTC/USDT', interval = '15m') {
  const { price, indicators, buyConditions } = result;
  const timeStr = new Date().toLocaleTimeString();
  const { wallet, settings } = getSettingsAndWallet();

  return `🟢 *[BOT STARTED & MONITORING]*
━━━━━━━━━━━━━━━━━━━━
🤖 *Bot Status:* Live & Watching 15m Candles
⏰ *Start Time:* ${timeStr}
📊 *Symbol:* ${symbol} (${interval})

⚙️ *Active Wallet Settings:*
💰 *Wallet Balance:* $${wallet.balance.toFixed(2)} USD
💵 *Trade Value:* $${settings.tradeAmountUSD.toFixed(2)} USD
🛡️ *Stop Loss:* ${settings.stopLossPct.toFixed(2)}%
🎯 *Take Profit:* ${settings.takeProfitPct.toFixed(2)}%

📈 *Current Market Snapshot:*
💰 *Live BTC Price:* $${price.toFixed(2)}
📉 *EMA 20:* $${indicators.ema20 ? indicators.ema20.toFixed(2) : 'N/A'}
📈 *EMA 50:* $${indicators.ema50 ? indicators.ema50.toFixed(2) : 'N/A'}
📊 *RSI (14):* ${indicators.rsi ? indicators.rsi.toFixed(2) : 'N/A'}
⚡ *MACD:* Line (${indicators.macd ? indicators.macd.toFixed(2) : 'N/A'}) | Signal (${indicators.signal ? indicators.signal.toFixed(2) : 'N/A'})

📋 *Strategy Checklist (Need all 5 for BUY):*
• Trend Aligned: ${buyConditions.trendAligned ? '✅' : '❌'}
• RSI in Range (48-68 & Rising): ${buyConditions.rsiInOptimalZone ? '✅' : '❌'}
• MACD Bullish: ${buyConditions.macdBullishExpanding ? '✅' : '❌'}
• Volume Confirmed: ${buyConditions.volumeConfirmed ? '✅' : '❌'}
• Support Bounce: ${buyConditions.supportBounce ? '✅' : '❌'}
━━━━━━━━━━━━━━━━━━━━
💡 যেকোনো সময় সেটিংস পরিবর্তন করতে \`/settings\` অথবা \`/help\` পাঠান।`;
}

function formatBuyMessage(evaluation, symbol = 'BTC/USDT', interval = '15m') {
  const { price, indicators } = evaluation;
  const timeStr = new Date(evaluation.closeTime || Date.now()).toLocaleTimeString();
  const { wallet, settings } = getSettingsAndWallet();
  const slPrice = price * (1 - settings.stopLossPct / 100);
  const tpPrice = price * (1 + settings.takeProfitPct / 100);

  return `🚀 *[BUY SIGNAL CONFIRMED] ${symbol} (${interval})*
━━━━━━━━━━━━━━━━━━━━
💰 *Entry Price:* $${price.toFixed(2)}
⏰ *Candle Close:* ${timeStr}
💵 *Trade Value:* $${settings.tradeAmountUSD.toFixed(2)} USD
💼 *Wallet Balance:* $${wallet.balance.toFixed(2)} USD

*📋 All 5 Conditions Confirmed:*
✅ *Trend Alignment:* EMA 20 ($${indicators.ema20.toFixed(2)}) > EMA 50 ($${indicators.ema50.toFixed(2)})
✅ *RSI Momentum:* ${indicators.rsi.toFixed(2)} (Bullish Momentum)
✅ *MACD Expansion:* Bullish Cross & Growing
✅ *Volume Participation:* Institutional Buyers Confirmed
✅ *Price Action:* Support / EMA 20 Bounce

*🎯 Targets & Risk Management:*
🛡️ *Stop-Loss (${settings.stopLossPct}%):* $${slPrice.toFixed(2)}
🎯 *Take-Profit (${settings.takeProfitPct}%):* $${tpPrice.toFixed(2)}
━━━━━━━━━━━━━━━━━━━━
⚠️ *Action:* $${settings.tradeAmountUSD.toFixed(2)} এর ভার্চুয়াল লং পজিশন ওপেন করা হয়েছে।`;
}

function formatSellMessage(evaluation, symbol = 'BTC/USDT', interval = '15m') {
  const { price, indicators, sellConditions } = evaluation;
  const timeStr = new Date(evaluation.closeTime || Date.now()).toLocaleTimeString();

  const signals = [];
  if (sellConditions.emaDeathCross) signals.push(`⚠️ *EMA Death Cross:* EMA 20 crossed below EMA 50`);
  if (sellConditions.rsiOverboughtCollapse) signals.push(`⚠️ *RSI Overbought Drop:* Dropped below 68 from 70+`);
  if (sellConditions.macdBearishCross) signals.push(`⚠️ *MACD Bearish Cross:* MACD crossed below Signal`);
  if (sellConditions.resistanceRejection) signals.push(`⚠️ *Resistance Rejection:* Strong rejection from resistance`);

  return `🚨 *[SELL / EXIT SIGNAL] ${symbol} (${interval})*
━━━━━━━━━━━━━━━━━━━━
💰 *Current Price:* $${price.toFixed(2)}
⏰ *Time:* ${timeStr}

*⚠️ Triggered Reversal Reason:*
${signals.join('\n')}

*💡 Recommendation:*
• পজিশন এক্সিট করুন অথবা প্রফিট বুক করুন।
• যদি কোনো ওপেন ট্রেড থাকে, তবে সেটি ক্লোজ করা হয়েছে।
━━━━━━━━━━━━━━━━━━━━`;
}

function formatTradeOpenedMessage(trade, wallet, symbol = 'BTC/USDT') {
  const timeStr = new Date(trade.entryTime || Date.now()).toLocaleTimeString();
  return `📥 *[PAPER TRADE OPENED] ${symbol}*
━━━━━━━━━━━━━━━━━━━━
💵 *Trade Value:* $${trade.tradeAmountUSD.toFixed(2)} USD
💰 *Wallet Balance:* $${wallet.balance.toFixed(2)} USD
📈 *Entry Price:* $${trade.entryPrice.toFixed(2)}
🛡️ *Stop Loss (${trade.stopLossPct}%):* $${trade.stopLossPrice.toFixed(2)}
🎯 *Take Profit (${trade.takeProfitPct}%):* $${trade.takeProfitPrice.toFixed(2)}
⏰ *Entry Time:* ${timeStr}
━━━━━━━━━━━━━━━━━━━━
📌 পজিশনটি লাইভ ট্র্যাক করা হচ্ছে।`;
}

function formatTradeClosedMessage(closedTrade, stats, wallet, symbol = 'BTC/USDT') {
  const timeStr = new Date(closedTrade.exitTime || Date.now()).toLocaleTimeString();
  const isProfit = closedTrade.pnlUSD >= 0;
  const emoji = isProfit ? '🎉' : '🛑';
  const reasonText =
    closedTrade.reason === 'STOP_LOSS_HIT' ? `${closedTrade.stopLossPct}% Stop Loss Hit 🛡️` :
    closedTrade.reason === 'TAKE_PROFIT_HIT' ? `${closedTrade.takeProfitPct}% Profit Target Reached 🎯` :
    'Sell / Exit Signal Triggered 🔔';

  return `${emoji} *[PAPER TRADE CLOSED] ${symbol}*
━━━━━━━━━━━━━━━━━━━━
📋 *Exit Reason:* ${reasonText}
💵 *Trade Value:* $${closedTrade.tradeAmountUSD.toFixed(2)} USD
📈 *Entry Price:* $${closedTrade.entryPrice.toFixed(2)}
📉 *Exit Price:* $${closedTrade.exitPrice.toFixed(2)}
⏰ *Close Time:* ${timeStr}

📊 *Result:* ${isProfit ? '✅ PROFIT' : '❌ LOSS'}
💰 *PnL (%):* ${isProfit ? '+' : ''}${closedTrade.pnlPct.toFixed(2)}%
💵 *PnL ($):* ${isProfit ? '+' : ''}$${closedTrade.pnlUSD.toFixed(4)} USD

💼 *Updated Wallet Balance:* *$${wallet.balance.toFixed(2)} USD*
━━━━━━━━━━━━━━━━━━━━
📊 *Overall Performance Scorecard:*
• Total Trades: ${stats.totalTrades}
• Wins: ${stats.wins} | Losses: ${stats.losses}
• Win Rate: ${stats.winRatePct.toFixed(1)}%
• Net Realized PnL: ${stats.totalPnLUSD >= 0 ? '+' : ''}$${stats.totalPnLUSD.toFixed(4)} USD
━━━━━━━━━━━━━━━━━━━━`;
}

module.exports = {
  sendTelegramAlert,
  broadcastTelegramAlert,
  startTelegramListener,
  formatSettingsMessage,
  formatHelpMessage,
  formatStartupMessage,
  formatBuyMessage,
  formatSellMessage,
  formatTradeOpenedMessage,
  formatTradeClosedMessage
};
