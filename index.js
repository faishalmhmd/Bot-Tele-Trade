import axios from "axios";

const TELEGRAM_TOKEN = "8072640433:AAEEobZMFTpPOx01qGpPwq_b26xsEzXh8-o";
const TELEGRAM_CHAT_ID = "-4213483866"; 

async function getTopStocks() {
  const url = "https://scanner.tradingview.com/indonesia/scan";
  const payload = {
    filter: [],
    options: { lang: "en" },
    symbols: { query: { types: [] }, tickers: [] },
    columns: ["name", "close", "change", "volume"],
    sort: { sortBy: "volume", sortOrder: "desc" },
    range: [0, 10]
  };

  const headers = {
    "Content-Type": "application/json",
    "Origin": "https://id.tradingview.com",
    "Referer": "https://id.tradingview.com/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.70 Safari/537.36"
  };

  try {
    const res = await axios.post(url, payload, { headers });
    const data = res.data;

    if (data?.data) {
      let message = "📈 *Top 10 Market Movers Today*\n\n";

      data.data.forEach((item, index) => {
        const [name, , change, ] = item.d;
        const recommendBuy = change > 0 ? "BUY ✅" : "HOLD ❌";
        const trendIcon = change > 0 ? "📈" : "📉";
        const num = String(index + 1).padStart(2, " ");
        const namePadded = name.padEnd(6, " ");
        const changeStr = (change > 0 ? "+" : "") + change.toFixed(2) + "%";
        const changePadded = changeStr.padStart(7, " ");

        message += `${num}. ${trendIcon} *${namePadded}* (${changePadded}) ${recommendBuy}\n`;
      });

      return message;
    }

    else {
      return "No data found or API changed.";
    }
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    return "Error fetching data.";
  }
}

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
  const report = await getTopStocks();
  await sendToTelegram(report);
}

main();
