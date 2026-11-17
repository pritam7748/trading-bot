/**
 * Paper Trading, Multi-Position Management & Dynamic Wallet Module (AI Powered)
 * Supports:
 * - Multi-trade Pyramiding (up to 3 simultaneous positions)
 * - Self-evolved AI strategy profiles
 * - Complete trade history & real-time PnL tracking
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'paper_trades.json');

function loadState() {
  const defaultState = {
    wallet: {
      balance: 40.0,
      initialBalance: 30.0
    },
    settings: {
      mode: 'AI', // 'AI' (Smart Dynamic) or 'MANUAL'
      tradeAmountUSD: 10.0,
      stopLossPct: 1.0,
      takeProfitPct: 30.0,
      maxPositions: 3,
      allowScalingIn: true,
      exitOnSellSignal: true
    },
    evolvedStrategy: {
      generation: 1,
      activeStyle: 'AI_ADAPTIVE_TREND 🚀',
      confidenceThreshold: 68,
      rsiBuyMin: 48,
      rsiBuyMax: 68,
      atrMultiplierSL: 1.4,
      riskRewardTarget: 2.5,
      volumeMultiplier: 0.95,
      maxPositions: 3,
      allowScalingIn: true,
      lastAdaptedAt: Date.now(),
      adaptationLog: 'প্রাথমিক AI মডেল সক্রিয়।'
    },
    activeTrades: [],
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
      // Migrate old single activeTrade to activeTrades array if present
      let activeTrades = parsed.activeTrades || [];
      if (parsed.activeTrade && activeTrades.length === 0) {
        activeTrades = [parsed.activeTrade];
      }

      return {
        wallet: { ...defaultState.wallet, ...(parsed.wallet || {}) },
        settings: { ...defaultState.settings, ...(parsed.settings || {}) },
        evolvedStrategy: { ...defaultState.evolvedStrategy, ...(parsed.evolvedStrategy || {}) },
        activeTrades,
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
    evolvedStrategy: state.evolvedStrategy,
    activeTrades: state.activeTrades,
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

function updateMode(mode) {
  const state = loadState();
  state.settings.mode = mode.toUpperCase() === 'MANUAL' ? 'MANUAL' : 'AI';
  saveState(state);
  return state.settings.mode;
}

function saveEvolvedStrategy(evolved) {
  const state = loadState();
  state.evolvedStrategy = { ...state.evolvedStrategy, ...evolved };
  saveState(state);
}

function openTrade(entryPrice, candleTime, aiAnalysis = null, isScaleIn = false) {
  const state = loadState();
  const maxPositions = state.evolvedStrategy?.maxPositions || state.settings?.maxPositions || 3;

  if (state.activeTrades.length >= maxPositions) {
    console.log(`[PaperTrading] Maximum positions (${maxPositions}) already reached.`);
    return { error: 'MAX_POSITIONS_REACHED', count: state.activeTrades.length };
  }

  let tradeAmountUSD = state.settings.tradeAmountUSD;
  let stopLossPct = state.settings.stopLossPct;
  let takeProfitPct = state.settings.takeProfitPct;
  let isAIMode = state.settings.mode === 'AI';

  if (isAIMode && aiAnalysis) {
    stopLossPct = aiAnalysis.riskReward?.dynamicSLPct || stopLossPct;
    takeProfitPct = aiAnalysis.riskReward?.dynamicTPPct || takeProfitPct;
    tradeAmountUSD = aiAnalysis.allocation?.suggestedAmountUSD || tradeAmountUSD;
  }

  // Check wallet balance
  if (state.wallet.balance < tradeAmountUSD) {
    if (state.wallet.balance >= 1.0) {
      tradeAmountUSD = parseFloat(state.wallet.balance.toFixed(2));
    } else {
      console.log(`[PaperTrading] Insufficient balance! Wallet: $${state.wallet.balance}, Needed: $${tradeAmountUSD}`);
      return { error: 'INSUFFICIENT_BALANCE', balance: state.wallet.balance, needed: tradeAmountUSD };
    }
  }

  const stopLossPrice = entryPrice * (1 - stopLossPct / 100);
  const takeProfitPrice = entryPrice * (1 + takeProfitPct / 100);

  const newTrade = {
    id: (state.stats.totalTrades || 0) + state.activeTrades.length + 1,
    positionNumber: state.activeTrades.length + 1,
    isScaleIn,
    entryTime: candleTime || Date.now(),
    entryPrice,
    tradeAmountUSD,
    stopLossPct,
    takeProfitPct,
    stopLossPrice,
    takeProfitPrice,
    mode: isAIMode ? 'AI_DYNAMIC' : 'MANUAL',
    status: 'OPEN'
  };

  state.activeTrades.push(newTrade);
  saveState(state);

  console.log(`[PaperTrading] Opened Position #${newTrade.positionNumber} ($${tradeAmountUSD} ${isAIMode ? 'AI' : 'MANUAL'}) at $${entryPrice.toFixed(2)} | SL: $${stopLossPrice.toFixed(2)} (-${stopLossPct}%) | TP: $${takeProfitPrice.toFixed(2)} (+${takeProfitPct}%)`);
  return { trade: newTrade, wallet: state.wallet, totalActive: state.activeTrades.length };
}

function checkLiveTrade(livePrice, sellSignalTriggered = false) {
  const state = loadState();
  if (!state.activeTrades || state.activeTrades.length === 0) return null;

  const closedTrades = [];
  const remainingTrades = [];

  for (const trade of state.activeTrades) {
    let closeReason = null;
    let exitPrice = livePrice;

    // 1. Check Stop Loss
    if (livePrice <= trade.stopLossPrice) {
      closeReason = 'STOP_LOSS_HIT';
      exitPrice = trade.stopLossPrice;
    }
    // 2. Check Take Profit
    else if (livePrice >= trade.takeProfitPrice) {
      closeReason = 'TAKE_PROFIT_HIT';
      exitPrice = trade.takeProfitPrice;
    }
    // 3. Check Global Exit Signal
    else if (sellSignalTriggered && state.settings.exitOnSellSignal) {
      closeReason = 'EXIT_SIGNAL';
      exitPrice = livePrice;
    }

    if (closeReason) {
      const pnlPct = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
      const pnlUSD = trade.tradeAmountUSD * (pnlPct / 100);
      const isWin = pnlUSD > 0;

      state.wallet.balance = Math.max(0, state.wallet.balance + pnlUSD);

      const closed = {
        ...trade,
        exitTime: Date.now(),
        exitPrice,
        reason: closeReason,
        pnlPct,
        pnlUSD,
        isWin,
        newBalance: state.wallet.balance,
        status: 'CLOSED'
      };

      state.history.push(closed);
      state.stats.totalTrades += 1;
      if (isWin) state.stats.wins += 1;
      else state.stats.losses += 1;
      state.stats.totalPnLUSD += pnlUSD;
      state.stats.winRatePct = (state.stats.wins / state.stats.totalTrades) * 100;

      closedTrades.push(closed);
      console.log(`[PaperTrading] Closed Position #${trade.positionNumber} (${closeReason}) at $${exitPrice.toFixed(2)} | PnL: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% (${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(3)}) | Wallet: $${state.wallet.balance.toFixed(2)}`);
    } else {
      remainingTrades.push(trade);
    }
  }

  if (closedTrades.length > 0) {
    state.activeTrades = remainingTrades;
    saveState(state);
    return {
      closedTrades,
      stats: state.stats,
      wallet: state.wallet,
      remainingCount: remainingTrades.length
    };
  }

  return null;
}

function getActiveTrades() {
  const state = loadState();
  return state.activeTrades || [];
}

function getActiveTrade() {
  const state = loadState();
  return state.activeTrades && state.activeTrades.length > 0 ? state.activeTrades[0] : null;
}

function getTradeHistory(limit = 10) {
  const state = loadState();
  const history = state.history || [];
  const recent = history.slice(-limit).reverse();
  return {
    recent,
    stats: state.stats,
    wallet: state.wallet,
    activeTrades: state.activeTrades || [],
    evolvedStrategy: state.evolvedStrategy
  };
}

module.exports = {
  openTrade,
  checkLiveTrade,
  getActiveTrades,
  getActiveTrade,
  getSettingsAndWallet,
  updateWalletBalance,
  updateTradeAmount,
  updateStopLossPct,
  updateTakeProfitPct,
  updateMode,
  saveEvolvedStrategy,
  getTradeHistory,
  loadState
};
