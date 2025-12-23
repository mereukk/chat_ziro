const fetch = require('node-fetch');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramMessage(chatId, message) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[Telegram] 봇 토큰이 설정되지 않음');
    return false;
  }
  
  if (!chatId) {
    console.log('[Telegram] 채팅 ID가 없음');
    return false;
  }
  
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      console.error('[Telegram] 전송 실패:', result.description);
      return false;
    }
    
    console.log('[Telegram] 메시지 전송 성공');
    return true;
  } catch (error) {
    console.error('[Telegram] 에러:', error.message);
    return false;
  }
}

// 새 메시지 알림 보내기
async function notifyNewMessage(chatId, senderNickname, roomName, messageContent) {
  const message = `💬 <b>새 메시지</b>\n\n` +
    `👤 <b>${senderNickname}</b>\n` +
    `📁 ${roomName}\n\n` +
    `${messageContent}`;
  
  return sendTelegramMessage(chatId, message);
}

module.exports = {
  sendTelegramMessage,
  notifyNewMessage
};



