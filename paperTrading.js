/**
 * Paper Trading & Dynamic Wallet Settings Module
 * Manages virtual wallet balance, dynamic position sizes, SL/TP settings,
 * and tracks real-time PnL with balance deduction/addition.
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'paper_trades.json');

function loadState() {
  const defaultState = {
    wallet: {
      balance: 30.0,
      initialBalance: 30.0
    },
    settings: {
      tradeAmountUSD: 10.0,
      stopLossPct: 1.0,
      takeProfitPct: 30.0,
      exitOnSellSignal: true
    },
    activeTrade: null,
    history: [],
    stats: {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalPnLUSD: 0.0,
      winRatePct: 0.0
    }
  };

  if (fs.existsSync(DB_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      return {
        wallet: { ...defaultState.wallet, ...(parsed.wallet || {}) },
        settings: { ...defaultState.settings, ...(parsed.settings || {}) },
        activeTrade: parsed.activeTrade ?? null,
        history: parsed.history || [],
        stats: { ...defaultState.stats, ...(parsed.stats || {}) }
      };
    } catch (_) {}
  }

  return defaultState;
}

function saveState(state) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[PaperTrading] Error saving state:', err.message);
  }
}

function getSettingsAndWallet() {
  const state = loadState();
  return {
    wallet: state.wallet,
    settings: state.settings,
    activeTrade: state.activeTrade,
    stats: state.stats
  };
}

function updateWalletBalance(amount) {
  const state = loadState();
  state.wallet.balance = Math.max(0, parseFloat(amount));
  saveState(state);
  return state.wallet.balance;
}

function updateTradeAmount(amount) {
  const state = loadState();
  state.settings.tradeAmountUSD = Math.max(0.1, parseFloat(amount));
  saveState(state);
  return state.settings.tradeAmountUSD;
}

function updateStopLossPct(pct) {
  const state = loadState();
  state.settings.stopLossPct = Math.max(0.1, parseFloat(pct));
  saveState(state);
  return state.settings.stopLossPct;
}

function updateTakeProfitPct(pct) {
  const state = loadState();
  state.settings.takeProfitPct = Math.max(0.1, parseFloat(pct));
  saveState(state);
  return state.settings.takeProfitPct;
}

function openTrade(entryPrice, candleTime) {
  const state = loadState();
  if (state.activeTrade) {
    console.log('[PaperTrading] An active trade is already open.');
    return { error: 'ALREADY_OPEN', trade: state.activeTrade };
  }

  const tradeAmountUSD = state.settings.tradeAmountUSD;
  const stopLossPct = state.settings.stopLossPct;
  const takeProfitPct = state.settings.takeProfitPct;

  // Check if wallet balance is sufficient
  if (state.wallet.balance < tradeAmountUSD) {
    console.log(`[PaperTrading] Insufficient balance! Wallet: $${state.wallet.balance}, Needed: $${tradeAmountUSD}`);
    return { error: 'INSUFFICIENT_BALANCE', balance: state.wallet.balance, needed: tradeAmountUSD };
  }

  const stopLossPrice = entryPrice * (1 - stopLossPct / 100);
  const takeProfitPrice = entryPrice * (1 + takeProfitPct / 100);

  state.activeTrade = {
    id: (state.stats.totalTrades || 0) + 1,
    entryTime: candleTime || Date.now(),
    entryPrice,
    tradeAmountUSD,
    stopLossPct,
    takeProfitPct,
    stopLossPrice,
    takeProfitPrice,
    status: 'OPEN'
  };

  saveState(state);
  console.log(`[PaperTrading] Opened $${tradeAmountUSD} Trade at $${entryPrice.toFixed(2)} | SL: $${stopLossPrice.toFixed(2)} (-${stopLossPct}%) | TP: $${takeProfitPrice.toFixed(2)} (+${takeProfitPct}%)`);
  return { trade: state.activeTrade, wallet: state.wallet };
}

function closeTrade(exitPrice, reason, state) {
  const trade = state.activeTrade;
  if (!trade) return null;

  const pnlPct = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
  const pnlUSD = trade.tradeAmountUSD * (pnlPct / 100);
  const isWin = pnlUSD > 0;

  // Update wallet balance with profit/loss
  state.wallet.balance = Math.max(0, state.wallet.balance + pnlUSD);

  const closedTrade = {
    ...trade,
    exitTime: Date.now(),
    exitPrice,
    reason,
    pnlPct,
    pnlUSD,
    isWin,
    newBalance: state.wallet.balance,
    status: 'CLOSED'
  };

  state.history.push(closedTrade);
  state.stats.totalTrades += 1;
  if (isWin) state.stats.wins += 1;
  else state.stats.losses += 1;

  state.stats.totalPnLUSD += pnlUSD;
  state.stats.winRatePct = (state.stats.wins / state.stats.totalTrades) * 100;

  state.activeTrade = null;
  saveState(state);

  console.log(`[PaperTrading] Closed Trade #${trade.id} (${reason}) at $${exitPrice.toFixed(2)} | PnL: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% (${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(4)}) | New Wallet: $${state.wallet.balance.toFixed(2)}`);
  return { closedTrade, stats: state.stats, wallet: state.wallet };
}

function checkLiveTrade(livePrice, sellSignalTriggered = false) {
  const state = loadState();
  const trade = state.activeTrade;
  if (!trade) return null;

  // 1. Check Stop Loss Hit
  if (livePrice <= trade.stopLossPrice) {
    return closeTrade(trade.stopLossPrice, 'STOP_LOSS_HIT', state);
  }

  // 2. Check Take Profit Hit
  if (livePrice >= trade.takeProfitPrice) {
    return closeTrade(trade.takeProfitPrice, 'TAKE_PROFIT_HIT', state);
  }

  // 3. Check Exit on Sell Signal
  if (sellSignalTriggered && state.settings.exitOnSellSignal) {
    return closeTrade(livePrice, 'EXIT_SIGNAL', state);
  }

  return null;
}

function getActiveTrade() {
  const state = loadState();
  return state.activeTrade;
}

module.exports = {
  openTrade,
  checkLiveTrade,
  getActiveTrade,
  getSettingsAndWallet,
  updateWalletBalance,
  updateTradeAmount,
  updateStopLossPct,
  updateTakeProfitPct,
  loadState
};
