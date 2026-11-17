/**
 * Telegram Notification & Interactive Command Listener Module (AI Integrated with Multi-Position & Auto-Evolution)
 * Supports dynamic commands:
 * /history, /positions, /strategy, /ai, /settings, /setbalance, /settrade, /setsl, /settp, /mode, /status, /help, /start, /stop
 */

const { getSubscribers, addSubscriber, removeSubscriber } = require('./subscriberManager');
const {
  getSettingsAndWallet,
  updateWalletBalance,
  updateTradeAmount,
  updateStopLossPct,
  updateTakeProfitPct,
  updateMode,
  getTradeHistory,
  getActiveTrades
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
  const { wallet, settings, evolvedStrategy, activeTrades, stats } = data;

  const activeTradesCount = activeTrades ? activeTrades.length : 0;
  const maxPos = evolvedStrategy?.maxPositions || settings.maxPositions || 3;

  return `⚙️ *আপনার ট্রেডিং ও ওয়ালেট সেটিংস*
━━━━━━━━━━━━━━━━━━━━
🤖 *Strategy Mode:* *${settings.mode === 'AI' ? '🧠 AI Smart Dynamic Mode' : '🛠️ Manual Mode'}*
💰 *Wallet Balance:* $${wallet.balance.toFixed(2)} USD
💵 *Trade Value:* $${settings.tradeAmountUSD.toFixed(2)} USD (Manual)
🛡️ *Stop Loss:* ${settings.stopLossPct.toFixed(2)}% | 🎯 *Take Profit:* ${settings.takeProfitPct.toFixed(2)}%
📊 *Active Positions:* ${activeTradesCount} / ${maxPos} ${settings.mode === 'AI' ? '(Pyramiding Active 🚀)' : ''}

📊 *পারফরম্যান্স সামারি:*
• মোট ট্রেড: ${stats.totalTrades} | জয়: ${stats.wins} | পরাজয়: ${stats.losses}
• উইন রেট: ${stats.winRatePct.toFixed(1)}%
• মোট লাভ/ক্ষতি: ${stats.totalPnLUSD >= 0 ? '+' : ''}$${stats.totalPnLUSD.toFixed(4)} USD

━━━━━━━━━━━━━━━━━━━━
💡 *কন্ট্রোল কমান্ডসমূহ:*
• \`/positions\` ➡️ রানিং পজিশন ও লাইভ লাভ/ক্ষতি দেখুন
• \`/strategy\` ➡️ AI এর স্বয়ংক্রিয় স্ট্র্যাটেজি ও রুলস দেখুন
• \`/mode ai\` ➡️ AI মোড চালু করুন (স্মার্ট SL/TP ও সাইজিং)
• \`/mode manual\` ➡️ ম্যানুয়াল মোড চালু করুন
• \`/setbalance 50\` ➡️ ব্যালেন্স পরিবর্তন
• \`/settrade 10\` ➡️ ট্রেড সাইজ পরিবর্তন
• \`/history\` ➡️ বিস্তারিত ট্রেড হিস্ট্রি`;
}

function formatPositionsMessage(currentPrice = null) {
  const activeTrades = getActiveTrades();
  if (!activeTrades || activeTrades.length === 0) {
    return `⚪ *বর্তমানে কোনো অ্যাক্টিভ ট্রেড নেই।*
মার্কেট পর্যবেক্ষণ করা হচ্ছে। উপযুক্ত সিগন্যাল পেলে AI স্বয়ংক্রিয়ভাবে পজিশন ওপেন করবে।`;
  }

  let totalInvested = 0;
  let totalUnrealizedUSD = 0;

  const list = activeTrades.map((t, idx) => {
    totalInvested += t.tradeAmountUSD;
    const priceNow = currentPrice || t.entryPrice;
    const pnlPct = ((priceNow - t.entryPrice) / t.entryPrice) * 100;
    const pnlUSD = t.tradeAmountUSD * (pnlPct / 100);
    totalUnrealizedUSD += pnlUSD;

    const emoji = pnlUSD >= 0 ? '🎉' : '🛑';
    const tag = t.isScaleIn ? `(Scale-in #${t.positionNumber})` : '(Primary Entry)';

    return `${emoji} *Position #${t.positionNumber || (idx + 1)}* ${tag}
• Size: $${t.tradeAmountUSD.toFixed(2)} USD @ $${t.entryPrice.toFixed(2)}
• Live PnL: *${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%* (${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(3)} USD)
• SL: $${t.stopLossPrice.toFixed(2)} (-${t.stopLossPct}%) | TP: $${t.takeProfitPrice.toFixed(2)} (+${t.takeProfitPct}%)`;
  }).join('\n\n');

  return `📊 *বর্তমানে রানিং পজিশনসমূহ (Active: ${activeTrades.length}/3)*
━━━━━━━━━━━━━━━━━━━━
${list}

━━━━━━━━━━━━━━━━━━━━
💼 *মোট অ্যাক্টিভ ইনভেস্টমেন্ট:* $${totalInvested.toFixed(2)} USD
💰 *মোট আনরিয়ালাইজড PnL:* *${totalUnrealizedUSD >= 0 ? '+' : ''}$${totalUnrealizedUSD.toFixed(3)} USD*
━━━━━━━━━━━━━━━━━━━━`;
}

function formatStrategyProfileMessage(evolvedStrategy = null) {
  const data = getSettingsAndWallet();
  const evolved = evolvedStrategy || data.evolvedStrategy || {};

  return `🧠 *AI স্বয়ংক্রিয় স্ট্র্যাটেজি ও ইভোলিউশন প্রোফাইল*
━━━━━━━━━━━━━━━━━━━━
🧬 *AI Evolution Generation:* *Gen #${evolved.generation || 1}*
🎯 *Active Strategy Style:* *${evolved.activeStyle || 'AI_ADAPTIVE_TREND'}*
⚖️ *Max Concurrent Positions:* *${evolved.maxPositions || 3}টি* (Pyramiding Allowed)

📋 *AI Dynamic Parameters:*
• Confidence Bar: *${evolved.confidenceThreshold || 68} / 100*
• Dynamic RSI Window: *${evolved.rsiBuyMin || 48} - ${evolved.rsiBuyMax || 68}*
• Dynamic Risk-Reward: *1 : ${evolved.riskRewardTarget || 2.5}*
• SL Multiplier: *${evolved.atrMultiplierSL || 1.4}x ATR*
• Volume Requirement: *${evolved.volumeMultiplier || 0.95}x SMA20*

📝 *সর্বশেষ AI ইভোলিউশন লগ:*
${evolved.adaptationLog || 'মার্কেট ডাটা অনুযায়ী স্ট্র্যাটেজি অপ্টিমাইজ করা হয়েছে।'}
━━━━━━━━━━━━━━━━━━━━
💡 AI প্রতি ট্রেডের ফলাফল ও মার্কেটের রূপ বুঝে নিজে থেকেই স্ট্র্যাটেজি আপডেট করে।`;
}

function formatHistoryMessage() {
  const { recent, stats, wallet, activeTrades } = getTradeHistory(8);

  let historyText = '';
  if (!recent || recent.length === 0) {
    historyText = 'এখনও কোনো ট্রেড সম্পন্ন হয়নি। প্রথম ট্রেড ক্লোজ হওয়ার পর এখানে হিস্ট্রি দেখতে পাবেন।';
  } else {
    historyText = recent.map((t, idx) => {
      const emoji = t.isWin ? '🎉' : '🛑';
      const timeStr = new Date(t.exitTime || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const reasonLabel =
        t.reason === 'STOP_LOSS_HIT' ? 'SL Hit 🛡️' :
        t.reason === 'TAKE_PROFIT_HIT' ? 'TP Hit 🎯' : 'Exit Signal 🔔';
      const scaleLabel = t.isScaleIn ? ` [Scale #${t.positionNumber}]` : '';

      return `${emoji} *#${t.id || (recent.length - idx)}* ($${t.tradeAmountUSD.toFixed(1)})${scaleLabel} ${timeStr}\n• Entry: $${t.entryPrice.toFixed(1)} ➡️ Exit: $${t.exitPrice.toFixed(1)}\n• PnL: *${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct.toFixed(2)}%* (${t.pnlUSD >= 0 ? '+' : ''}$${t.pnlUSD.toFixed(3)}) | ${reasonLabel}`;
    }).join('\n\n');
  }

  const activeCount = activeTrades ? activeTrades.length : 0;
  const activeText = activeCount > 0 ? `\n🟢 *বর্তমানে রানিং পজিশন:* ${activeCount}টি (দেখতে \`/positions\` পাঠান)` : '';

  return `📜 *ট্রেডিং হিস্ট্রি ও পারফরম্যান্স রেকর্ড*
━━━━━━━━━━━━━━━━━━━━
💼 *Current Wallet Balance:* *$${wallet.balance.toFixed(2)} USD*
📊 *Total Trades:* ${stats.totalTrades} | 🏆 Wins: ${stats.wins} | 💔 Losses: ${stats.losses}
🎯 *Overall Win Rate:* *${stats.winRatePct.toFixed(1)}%*
💰 *Net Realized PnL:* *${stats.totalPnLUSD >= 0 ? '+' : ''}$${stats.totalPnLUSD.toFixed(4)} USD*${activeText}

━━━━━━━━━━━━━━━━━━━━
📋 *সর্বশেষ ট্রেডসমূহ:*
${historyText}
━━━━━━━━━━━━━━━━━━━━`;
}

function formatAIMarketMessage(aiAnalysis) {
  if (!aiAnalysis) return 'মার্কেট ডাটা প্রসেস হচ্ছে, কিছুক্ষণ পর আবার চেষ্টা করুন।';
  const { price, regime, score, aiStance, stanceEmoji, riskReward, allocation, analysisReasons, evolvedStrategy } = aiAnalysis;
  const reasonsList = analysisReasons.map(r => `• ${r}`).join('\n');

  return `🧠 *AI মার্কেট অ্যানালাইসিস ও স্ট্র্যাটেজি রিপোর্ট*
━━━━━━━━━━━━━━━━━━━━
💰 *BTC Live Price:* $${price.toFixed(2)}
🧭 *Market Regime:* ${regime.regimeName}
🎯 *AI Confidence Score:* *${score} / 100*
⚡ *AI Stance:* ${stanceEmoji} *${aiStance}*
🧬 *Strategy Style:* ${evolvedStrategy?.activeStyle || 'Adaptive Trend'}

*📊 AI Dynamic Risk Management:*
🛡️ *AI Optimal Stop-Loss:* ${riskReward.dynamicSLPct}% ($${riskReward.stopLossPrice.toFixed(2)})
🎯 *AI Optimal Take-Profit:* ${riskReward.dynamicTPPct}% ($${riskReward.takeProfitPrice.toFixed(2)})
⚖️ *Risk-to-Reward Ratio:* 1 : ${riskReward.riskRewardRatio}

*💼 AI Money Management (Wallet Allocation):*
• প্রস্তাবিত সাইজ: *${allocation.allocPct}% of Wallet*
• ট্রেড সাইজ: *$${allocation.suggestedAmountUSD.toFixed(2)} USD*

*🔍 AI Decision Analysis:*
${reasonsList}
━━━━━━━━━━━━━━━━━━━━
💡 AI মোডে থাকলে বট নিজেই এই ডাইনামিক স্টপ লস ও পজিশন সাইজ ব্যবহার করে স্বয়ংক্রিয়ভাবে ট্রেড এক্সিকিউট করবে।`;
}

function formatHelpMessage() {
  return `🤖 *বটের সমস্ত কমান্ডসমূহ:*
━━━━━━━━━━━━━━━━━━━━
📊 *ট্রেডিং মনিটরিং:*
• \`/positions\` - বর্তমানে রানিং সমস্ত পজিশন ও লাইভ লাভ/ক্ষতি
• \`/history\` - পূর্বের সমস্ত ট্রেডের লাভ-ক্ষতি ও পারফরম্যান্স রিপোর্ট
• \`/strategy\` - AI এর স্বয়ংক্রিয় অ্যাডাপ্টিভ স্ট্র্যাটেজি ও জেনারেশন
• \`/ai\` - AI মার্কেট অ্যানালাইসিস, ডাইনামিক SL/TP ও স্কোর
• \`/status\` - বর্তমান লাইভ মার্কেট ডাটা ও ইন্ডিকেটর অবস্থা

⚙️ *সেটিংস ও কন্ট্রোল:*
• \`/settings\` - বর্তমান ওয়ালেট ব্যালেন্স ও ট্রেড সেটিংস দেখুন
• \`/mode ai\` - AI মোড চালু করুন (স্মার্ট SL/TP, সাইজিং ও স্কেলিং)
• \`/mode manual\` - ম্যানুয়াল মোড চালু করুন
• \`/setbalance <টাকা>\` - ওয়ালেট ব্যালেন্স সেট করুন (যেমন: \`/setbalance 50\`)
• \`/settrade <টাকা>\` - প্রতি ট্রেডের সাইজ সেট করুন (যেমন: \`/settrade 10\`)
• \`/setsl <শতাংশ>\` - স্টপ লস সেট করুন (যেমন: \`/setsl 1.5\`)
• \`/settp <শতাংশ>\` - টেক প্রফিট সেট করুন (যেমন: \`/settp 25\`)
• \`/stop\` - অ্যালার্ট বন্ধ করুন | \`/start\` - পুনরায় চালু করুন
━━━━━━━━━━━━━━━━━━━━`;
}

// Polling listener to automatically handle commands from ANY user
let lastUpdateId = 0;
let isPolling = false;

function startTelegramListener(botToken, getMarketSnapshot) {
  if (isPolling || !botToken || botToken.includes('YOUR_')) return;
  isPolling = true;
  console.log('🤖 [Telegram Listener] Interactive command listener started. Listening for /positions, /strategy, /history, etc...');

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
✅ *আপনি সফলভাবে BTC 15m AI ট্রেডিং অ্যালার্ট বটে যুক্ত হয়েছেন!*

এখন থেকে বিটকয়েনের নিশ্চিত BUY বা SELL সিগন্যাল তৈরি হলেই সরাসরি আপনার কাছে অ্যালার্ট পৌঁছে যাবে।

${formatSettingsMessage()}

📌 সমস্ত কমান্ড দেখতে পাঠান: \`/help\``;
              await sendTelegramAlert(botToken, chatId, welcomeMsg);
            }

            // 2. /positions or /trades
            else if (cmd === '/positions' || cmd === '/trades') {
              const snapshot = getMarketSnapshot ? getMarketSnapshot() : null;
              const livePrice = snapshot?.rawResult?.price || null;
              await sendTelegramAlert(botToken, chatId, formatPositionsMessage(livePrice));
            }

            // 3. /strategy or /evolve
            else if (cmd === '/strategy' || cmd === '/evolve') {
              const snapshot = getMarketSnapshot ? getMarketSnapshot() : null;
              await sendTelegramAlert(botToken, chatId, formatStrategyProfileMessage(snapshot?.rawResult?.aiAnalysis?.evolvedStrategy));
            }

            // 4. /history
            else if (cmd === '/history') {
              await sendTelegramAlert(botToken, chatId, formatHistoryMessage());
            }

            // 5. /ai or /analysis
            else if (cmd === '/ai' || cmd === '/analysis') {
              const snapshot = getMarketSnapshot ? getMarketSnapshot() : null;
              if (snapshot && snapshot.rawResult && snapshot.rawResult.aiAnalysis) {
                await sendTelegramAlert(botToken, chatId, formatAIMarketMessage(snapshot.rawResult.aiAnalysis));
              } else {
                await sendTelegramAlert(botToken, chatId, 'মার্কেট ডাটা লোড হচ্ছে, অনুগ্রহ করে ৫ সেকেন্ড পর আবার চেষ্টা করুন।');
              }
            }

            // 6. /mode <ai|manual>
            else if (cmd === '/mode') {
              if (arg && (arg.toLowerCase() === 'ai' || arg.toLowerCase() === 'manual')) {
                const newMode = updateMode(arg);
                await sendTelegramAlert(botToken, chatId, `✅ *ট্রেডিং মোড পরিবর্তন করা হয়েছে:* *${newMode === 'AI' ? '🧠 AI Smart Dynamic Mode' : '🛠️ Manual Mode'}*`);
              } else {
                await sendTelegramAlert(botToken, chatId, '⚠️ অনুগ্রহ করে মোড উল্লেখ করুন। যেমন: `/mode ai` অথবা `/mode manual`');
              }
            }

            // 7. /settings or /config or /wallet
            else if (cmd === '/settings' || cmd === '/config' || cmd === '/wallet') {
              await sendTelegramAlert(botToken, chatId, formatSettingsMessage());
            }

            // 8. /setbalance <amount>
            else if (cmd === '/setbalance' || cmd === '/balance') {
              const val = parseFloat(arg);
              if (isNaN(val) || val < 0) {
                await sendTelegramAlert(botToken, chatId, '⚠️ অনুগ্রহ করে সঠিক সংখ্যা লিখুন। যেমন: `/setbalance 50`');
              } else {
                const newBal = updateWalletBalance(val);
                await sendTelegramAlert(botToken, chatId, `✅ *ওয়ালেট ব্যালেন্স সফলভাবে আপডেট করা হয়েছে!* \n💰 বর্তমান ব্যালেন্স: *$${newBal.toFixed(2)} USD*`);
              }
            }

            // 9. /settrade <amount>
            else if (cmd === '/settrade' || cmd === '/trade') {
              const val = parseFloat(arg);
              if (isNaN(val) || val <= 0) {
                await sendTelegramAlert(botToken, chatId, '⚠️ অনুগ্রহ করে সঠিক সংখ্যা লিখুন। যেমন: `/settrade 10`');
              } else {
                const newTrade = updateTradeAmount(val);
                await sendTelegramAlert(botToken, chatId, `✅ *প্রতি ট্রেডের সাইজ সেট করা হয়েছে!* \n💵 Per Trade Size: *$${newTrade.toFixed(2)} USD*`);
              }
            }

            // 10. /setsl <percentage>
            else if (cmd === '/setsl' || cmd === '/sl') {
              const val = parseFloat(arg);
              if (isNaN(val) || val <= 0 || val >= 50) {
                await sendTelegramAlert(botToken, chatId, '⚠️ অনুগ্রহ করে সঠিক পারসেন্টেজ লিখুন (0.1 থেকে 50)। যেমন: `/setsl 1.5`');
              } else {
                const newSL = updateStopLossPct(val);
                await sendTelegramAlert(botToken, chatId, `✅ *স্টপ লস (Stop Loss) সেট করা হয়েছে:* *${newSL.toFixed(2)}%* 🛡️`);
              }
            }

            // 11. /settp <percentage>
            else if (cmd === '/settp' || cmd === '/tp') {
              const val = parseFloat(arg);
              if (isNaN(val) || val <= 0) {
                await sendTelegramAlert(botToken, chatId, '⚠️ অনুগ্রহ করে সঠিক পারসেন্টেজ লিখুন। যেমন: `/settp 20`');
              } else {
                const newTP = updateTakeProfitPct(val);
                await sendTelegramAlert(botToken, chatId, `✅ *টেক প্রফিট (Profit Target) সেট করা হয়েছে:* *${newTP.toFixed(2)}%* 🎯`);
              }
            }

            // 12. /help
            else if (cmd === '/help') {
              await sendTelegramAlert(botToken, chatId, formatHelpMessage());
            }

            // 13. /stop
            else if (cmd === '/stop') {
              removeSubscriber(chatId);
              await sendTelegramAlert(botToken, chatId, '🛑 *অ্যালার্ট সার্ভিস বন্ধ করা হয়েছে।*\n\nপুনরায় চালু করতে যেকোনো সময় আবার `/start` পাঠান।');
            }

            // 14. /status
            else if (cmd === '/status') {
              if (getMarketSnapshot) {
                const snapshotMsg = getMarketSnapshot();
                await sendTelegramAlert(botToken, chatId, snapshotMsg?.message || 'মার্কেট ডাটা লোড হচ্ছে, কিছুক্ষণ পর চেষ্টা করুন।');
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
  const { price, indicators, buyConditions, aiAnalysis } = result;
  const timeStr = new Date().toLocaleTimeString();
  const { wallet, settings, evolvedStrategy } = getSettingsAndWallet();

  const aiDetails = aiAnalysis ? `\n🧠 *AI Strategy:* ${evolvedStrategy?.activeStyle || aiAnalysis.regime.regimeName}\n🎯 *AI Confidence Score:* ${aiAnalysis.score}/100\n⚡ *AI Stance:* ${aiAnalysis.stanceEmoji} ${aiAnalysis.aiStance}` : '';

  return `🟢 *[BOT STARTED & MONITORING]*
━━━━━━━━━━━━━━━━━━━━
🤖 *Bot Status:* Live & Watching 15m Candles
⏰ *Start Time:* ${timeStr}
📊 *Symbol:* ${symbol} (${interval})
⚙️ *Active Mode:* *${settings.mode === 'AI' ? '🧠 AI Smart Dynamic' : '🛠️ Manual'}*

💼 *Wallet & Multi-Trade Settings:*
💰 *Wallet Balance:* $${wallet.balance.toFixed(2)} USD
💵 *Trade Value:* $${settings.tradeAmountUSD.toFixed(2)} USD (Manual)
⚖️ *Max Concurrent Positions:* ${evolvedStrategy?.maxPositions || 3}টি (Scaling Allowed)${aiDetails}

📈 *Current Market Snapshot:*
💰 *Live BTC Price:* $${price.toFixed(2)}
📉 *EMA 20:* $${indicators.ema20 ? indicators.ema20.toFixed(2) : 'N/A'}
📈 *EMA 50:* $${indicators.ema50 ? indicators.ema50.toFixed(2) : 'N/A'}
📊 *RSI (14):* ${indicators.rsi ? indicators.rsi.toFixed(2) : 'N/A'}
⚡ *MACD:* Line (${indicators.macd ? indicators.macd.toFixed(2) : 'N/A'}) | Signal (${indicators.signal ? indicators.signal.toFixed(2) : 'N/A'})

📋 *Buy Checklist:*
• Trend: ${buyConditions.trendAligned ? '✅' : '❌'} | RSI: ${buyConditions.rsiInOptimalZone ? '✅' : '❌'} | MACD: ${buyConditions.macdBullishExpanding ? '✅' : '❌'}
• Volume: ${buyConditions.volumeConfirmed ? '✅' : '❌'} | Support: ${buyConditions.supportBounce ? '✅' : '❌'} | AI: ${buyConditions.aiConfidenceHigh ? '✅' : '❌'}
━━━━━━━━━━━━━━━━━━━━
💡 বিস্তারিত কমান্ড দেখতে \`/help\` পাঠান। হিস্ট্রি দেখতে \`/history\`। রানিং ট্রেড দেখতে \`/positions\`।`;
}

function formatBuyMessage(evaluation, openResult, symbol = 'BTC/USDT', interval = '15m') {
  const { price, indicators, aiAnalysis } = evaluation;
  const timeStr = new Date(evaluation.closeTime || Date.now()).toLocaleTimeString();
  const trade = openResult.trade;
  const wallet = openResult.wallet;

  const isScale = trade.isScaleIn;
  const title = isScale
    ? `🚀 *[AI MULTI-POSITION SCALED] Position #${trade.positionNumber}*`
    : `🚀 *[BUY SIGNAL CONFIRMED] ${symbol} (${interval})*`;

  return `${title}
━━━━━━━━━━━━━━━━━━━━
💰 *Entry Price:* $${price.toFixed(2)}
⏰ *Candle Close:* ${timeStr}
💼 *Remaining Wallet Balance:* $${wallet.balance.toFixed(2)} USD
💵 *Trade Value:* *$${trade.tradeAmountUSD.toFixed(2)} USD* (${trade.mode === 'AI_DYNAMIC' ? '🧠 AI Dynamic' : 'Manual'})

*📋 Confirmations Met:*
✅ *Trend Aligned:* EMA 20 ($${indicators.ema20.toFixed(2)}) > EMA 50 ($${indicators.ema50.toFixed(2)})
✅ *RSI Momentum:* ${indicators.rsi.toFixed(2)}
✅ *MACD Expansion:* Bullish Crossover & Rising
✅ *Volume:* Institutional Participation Confirmed
${isScale ? '⚡ *Pyramiding:* পূর্বের ট্রেডে লাভ থাকায় অতিরিক্ত পজিশন স্কেল করা হয়েছে!' : '✅ *Price Action:* Clean Support / EMA 20 Bounce'}

*🎯 Dynamic Risk Management:*
🛡️ *Stop-Loss (${trade.stopLossPct}%):* $${trade.stopLossPrice.toFixed(2)}
🎯 *Take-Profit (${trade.takeProfitPct}%):* $${trade.takeProfitPrice.toFixed(2)}
⚖️ *Risk/Reward:* 1 : ${(trade.takeProfitPct / trade.stopLossPct).toFixed(2)}
━━━━━━━━━━━━━━━━━━━━
⚠️ *Status:* Position #${trade.positionNumber} সফলভাবে ওপেন করা হয়েছে। দেখতে \`/positions\` পাঠান।`;
}

// 🔴 Highly Detailed & Actionable SELL / EXIT Alert
function formatSellMessage(evaluation, activeTrades = [], symbol = 'BTC/USDT', interval = '15m') {
  const { price, indicators, sellConditions, aiAnalysis } = evaluation;
  const timeStr = new Date(evaluation.closeTime || Date.now()).toLocaleTimeString();

  const reasons = (sellConditions.sellReasons || []).map(r => `• *${r.title}:* ${r.detail}`).join('\n\n');

  let activeTradeDetails = '⚪ *কোনো অ্যাক্টিভ পজিশন নেই:* নতুন BUY এন্ট্রি নেওয়া থেকে বিরত থাকুন।';
  if (activeTrades && activeTrades.length > 0) {
    activeTradeDetails = `⚠️ *রানিং পজিশনসমূহ (${activeTrades.length}টি ট্রেড):*
${activeTrades.map(t => {
  const pnlPct = ((price - t.entryPrice) / t.entryPrice) * 100;
  return `• Pos #${t.positionNumber} ($${t.tradeAmountUSD.toFixed(1)}): Entry $${t.entryPrice.toFixed(1)} ➡️ PnL: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`;
}).join('\n')}
👉 *বট স্বয়ংক্রিয়ভাবে সমস্ত পজিশন এক্সিট করে প্রফিট/লস লক করেছে!*`;
  }

  return `🚨 *[CRITICAL SELL & EXIT SIGNAL] ${symbol} (${interval})*
━━━━━━━━━━━━━━━━━━━━
💰 *Current BTC Price:* $${price.toFixed(2)}
⏰ *Detection Time:* ${timeStr}
⚠️ *Market Severity:* 🛑 HIGH RISK (বিয়ারিশ রিভার্সাল সংকেত)

*📋 বিক্রি করার স্পষ্ট কারণসমূহ (Why Sell Now?):*
${reasons || '• ট্রেন্ড দুর্বল হয়ে বিয়ারিশ রিভার্সাল সংকেত পাওয়া গেছে।'}

*📊 বর্তমান ইন্ডিকেটর রিডিং:*
• EMA 20: $${indicators.ema20?.toFixed(1)} vs EMA 50: $${indicators.ema50?.toFixed(1)}
• RSI: ${indicators.rsi?.toFixed(1)} (বিক্রির চাপ বাড়ছে)
• MACD: Line (${indicators.macd?.toFixed(2)}) < Signal (${indicators.signal?.toFixed(2)})
• AI Regime: ${aiAnalysis?.regime?.regimeName || 'বিয়ারিশ চাপ'}

━━━━━━━━━━━━━━━━━━━━
${activeTradeDetails}

*💡 আপনার জন্য পরামর্শ (Next Action):*
1️⃣ যদি কোনো লাইভ লং ট্রেডে থাকেন ➡️ **তাৎক্ষণিক প্রফিট বুক করুন বা এক্সিট নিন।**
2️⃣ মার্কেট সাপোর্ট কনফার্ম না করা পর্যন্ত নতুন করে BUY এন্ট্রি নেওয়া সম্পূর্ণ বন্ধ রাখুন।
━━━━━━━━━━━━━━━━━━━━`;
}

function formatTradeClosedMessage(closedTrades = [], stats, wallet, symbol = 'BTC/USDT') {
  const timeStr = new Date().toLocaleTimeString();
  const trades = Array.isArray(closedTrades) ? closedTrades : [closedTrades];

  const tradeDetails = trades.map(t => {
    const isProfit = t.pnlUSD >= 0;
    const emoji = isProfit ? '🎉' : '🛑';
    const reasonText =
      t.reason === 'STOP_LOSS_HIT' ? `${t.stopLossPct}% SL Hit 🛡️` :
      t.reason === 'TAKE_PROFIT_HIT' ? `${t.takeProfitPct}% TP Hit 🎯` : 'Exit Signal 🔔';

    return `${emoji} *Position #${t.positionNumber}* ($${t.tradeAmountUSD.toFixed(1)})
• Entry: $${t.entryPrice.toFixed(1)} ➡️ Exit: $${t.exitPrice.toFixed(1)}
• Result: *${isProfit ? 'PROFIT' : 'LOSS'} (${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct.toFixed(2)}%)* | *${t.pnlUSD >= 0 ? '+' : ''}$${t.pnlUSD.toFixed(3)} USD*
• Trigger: ${reasonText}`;
  }).join('\n\n');

  return `🔔 *[PAPER TRADES CLOSED] ${symbol}*
━━━━━━━━━━━━━━━━━━━━
${tradeDetails}

━━━━━━━━━━━━━━━━━━━━
💼 *Updated Wallet Balance:* *$${wallet.balance.toFixed(2)} USD*
📊 *Total Trades:* ${stats.totalTrades} | 🏆 Wins: ${stats.wins} | 💔 Losses: ${stats.losses}
🎯 *Overall Win Rate:* *${stats.winRatePct.toFixed(1)}%*
💰 *Net Realized PnL:* *${stats.totalPnLUSD >= 0 ? '+' : ''}$${stats.totalPnLUSD.toFixed(4)} USD*
━━━━━━━━━━━━━━━━━━━━
💡 বিস্তারিত হিস্ট্রি দেখতে পাঠান: \`/history\``;
}

module.exports = {
  sendTelegramAlert,
  broadcastTelegramAlert,
  startTelegramListener,
  formatSettingsMessage,
  formatPositionsMessage,
  formatStrategyProfileMessage,
  formatHistoryMessage,
  formatAIMarketMessage,
  formatHelpMessage,
  formatStartupMessage,
  formatBuyMessage,
  formatSellMessage,
  formatTradeClosedMessage
};
