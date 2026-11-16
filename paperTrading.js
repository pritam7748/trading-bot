/**
 * Paper Trading & PnL Tracking Module
 * Simulates real trading with custom position sizes (e.g. $1.00) and tracks exact PnL.
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'paper_trades.json');

function loadState() {
  if (fs.existsSync(DB_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (_) {}
  }
  return {
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
}

function saveState(state) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[PaperTrading] Error saving state:', err.message);
  }
}

function openTrade(entryPrice, candleTime, config) {
  const state = loadState();
  if (state.activeTrade) {
    console.log('[PaperTrading] An active trade is already open. Skipping new entry.');
    return null;
  }

  const tradeAmountUSD = config.paperTrading?.tradeAmountUSD || 1.0;
  const stopLossPct = config.paperTrading?.stopLossPct || 1.0;
  const takeProfitPct = config.paperTrading?.takeProfitPct || 30.0;

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
  return state.activeTrade;
}

function closeTrade(exitPrice, reason, state) {
  const trade = state.activeTrade;
  if (!trade) return null;

  const pnlPct = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
  const pnlUSD = trade.tradeAmountUSD * (pnlPct / 100);
  const isWin = pnlUSD > 0;

  const closedTrade = {
    ...trade,
    exitTime: Date.now(),
    exitPrice,
    reason,
    pnlPct,
    pnlUSD,
    isWin,
    status: 'CLOSED'
  };

  // Update statistics
  state.history.push(closedTrade);
  state.stats.totalTrades += 1;
  if (isWin) state.stats.wins += 1;
  else state.stats.losses += 1;

  state.stats.totalPnLUSD += pnlUSD;
  state.stats.winRatePct = (state.stats.wins / state.stats.totalTrades) * 100;

  state.activeTrade = null;
  saveState(state);

  console.log(`[PaperTrading] Closed Trade #${trade.id} (${reason}) at $${exitPrice.toFixed(2)} | PnL: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% (${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(4)})`);
  return { closedTrade, stats: state.stats };
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
  if (sellSignalTriggered) {
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
  loadState
};
