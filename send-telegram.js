import axios from "axios";

const TELEGRAM_TOKEN = "8072640433:AAEEobZMFTpPOx01qGpPwq_b26xsEzXh8-o";
const TELEGRAM_CHAT_ID = "-4213483866";

async function sendToTelegram(message) {
  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    await axios.post(telegramUrl, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown"
    });
    console.log("✅ Sent to Telegram group successfully.");
  } catch (err) {
    console.error("Telegram send error:", err.response?.data || err.message);
  }
}

async function main() {
  const message = "✅ *Testing cronjob send Telegram message successfully.*";
  await sendToTelegram(message);
}

main();
