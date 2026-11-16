/**
 * Subscriber Manager Module
 * Manages the list of Telegram users who have subscribed by sending /start to the bot.
 */

const fs = require('fs');
const path = require('path');

const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');

function loadSubscribers() {
  if (fs.existsSync(SUBSCRIBERS_FILE)) {
    try {
      const data = fs.readFileSync(SUBSCRIBERS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (_) {}
  }
  return [];
}

function saveSubscribers(subscribers) {
  try {
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2), 'utf8');
  } catch (err) {
    console.error('[SubscriberManager] Error saving subscribers:', err.message);
  }
}

function addSubscriber(chatId, userInfo = {}) {
  const subscribers = loadSubscribers();
  const idStr = String(chatId);
  const exists = subscribers.find(s => String(s.id) === idStr);

  if (exists) {
    // Update metadata if needed
    exists.name = userInfo.first_name || exists.name || 'User';
    exists.username = userInfo.username || exists.username || '';
    saveSubscribers(subscribers);
    return false; // Already existed
  }

  subscribers.push({
    id: chatId,
    name: userInfo.first_name || 'Trader',
    username: userInfo.username || '',
    subscribedAt: Date.now()
  });

  saveSubscribers(subscribers);
  console.log(`[SubscriberManager] New subscriber added: ${userInfo.first_name || 'User'} (ID: ${chatId})`);
  return true; // Newly added
}

function removeSubscriber(chatId) {
  let subscribers = loadSubscribers();
  const idStr = String(chatId);
  const initialCount = subscribers.length;
  subscribers = subscribers.filter(s => String(s.id) !== idStr);

  if (subscribers.length < initialCount) {
    saveSubscribers(subscribers);
    console.log(`[SubscriberManager] Subscriber removed: ID ${chatId}`);
    return true;
  }
  return false;
}

function getSubscribers() {
  return loadSubscribers();
}

module.exports = {
  getSubscribers,
  addSubscriber,
  removeSubscriber
};
