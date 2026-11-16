const { sendTelegramAlert } = require('./telegram');
const config = require('./config.json');

async function test() {
  console.log('Sending test message to Telegram...');
  const msg = `🤖 *BTC Trading Bot - Connection Test*
━━━━━━━━━━━━━━━━━━━━
✅ *Status:* Connection Successful!
⏰ *Time:* ${new Date().toLocaleTimeString()}
📊 *Monitored Pair:* ${config.symbol} (${config.interval})

আপনার টেলিগ্রাম বটের সাথে ট্রেডিং স্ক্রিপ্ট সফলভাবে কানেক্ট হয়েছে! 🚀
এখন থেকে ১৫ মিনিটের ক্যান্ডেলে আপনার নির্ধারিত ৪টি BUY শর্ত বা ৪টি SELL সিগন্যাল মিললেই সরাসরি এখানে লাইভ অ্যালার্ট আসবে।
━━━━━━━━━━━━━━━━━━━━`;

  const success = await sendTelegramAlert(config.telegram.botToken, config.telegram.chatId, msg);
  console.log('Test result:', success ? 'SUCCESS' : 'FAILED');
}

test();
