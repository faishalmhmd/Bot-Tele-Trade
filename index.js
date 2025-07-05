import axios from "axios";

/** === 🔧 Telegram Config === **/

const TELEGRAM_TOKEN = "8072640433:AAEEobZMFTpPOx01qGpPwq_b26xsEzXh8-o";
const TELEGRAM_CHAT_ID = "-1002828449055"; // supergroup id (bukan yang lama)
const TELEGRAM_THREAD_ID = 2; // ✅ thread id untuk Info Saham

const headers = {
  "Content-Type": "application/json",
  "Origin": "https://id.tradingview.com",
  "Referer": "https://id.tradingview.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.70 Safari/537.36"
};

/** === 🧠 Utils: Perhitungan Indikator === **/

function calculateMA(closes, period = 20) {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const ma = slice.reduce((a, b) => a + b, 0) / period;
  return ma;
}

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 0;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  return rsi;
}

function calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (closes.length < slowPeriod + signalPeriod) {
    return { macd: "0.00", signal: "0.00", histogram: "0.00" };
  }

  const ema = (data, period) => {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  };

  const emaFast = ema(closes.slice(-fastPeriod), fastPeriod);
  const emaSlow = ema(closes.slice(-slowPeriod), slowPeriod);
  const macd = emaFast - emaSlow;

  const macdArray = [];
  for (let i = slowPeriod; i < closes.length; i++) {
    const fast = ema(closes.slice(i - fastPeriod, i), fastPeriod);
    const slow = ema(closes.slice(i - slowPeriod, i), slowPeriod);
    macdArray.push(fast - slow);
  }

  const signalVal = ema(macdArray.slice(-signalPeriod), signalPeriod);
  const signal = Number.isFinite(signalVal) ? signalVal : 0;
  const histogram = macd - signal;

  return {
    macd: macd.toFixed(2),
    signal: signal.toFixed(2),
    histogram: histogram.toFixed(2)
  };
}

function calculateBB(closes, period = 20) {
  if (closes.length < period) return { sma: "0.00", upper: "0.00", lower: "0.00" };

  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
  const stddev = Math.sqrt(variance);
  const upper = sma + 2 * stddev;
  const lower = sma - 2 * stddev;

  return {
    sma: sma.toFixed(2),
    upper: upper.toFixed(2),
    lower: lower.toFixed(2)
  };
}

/** === 🚀 Fetch Stocks Function === **/

async function fetchStocks(sortBy, sortOrder) {
  const url = "https://scanner.tradingview.com/indonesia/scan";
  const payload = {
    filter: [],
    options: { lang: "en" },
    symbols: { query: { types: [] }, tickers: [] },
    columns: ["name", "close", "change", "volume", "high", "low"],
    sort: { sortBy, sortOrder },
    range: [0, 20]
  };

  const res = await axios.post(url, payload, { headers });
  return res.data.data;
}

/** === 📈 Main Report Function === **/

async function getTopStocks() {
  try {
    const [volumeData, volatileData] = await Promise.all([
      fetchStocks("volume", "desc"),
      fetchStocks("change", "desc")
    ]);

    let message = "📈 *Market Scalping Report with Indicators + NetVol + MA*\n\n";

    const formatItem = (item) => {
      const [name, close, change, volume, high, low] = item.d;

      const value = (close * volume).toFixed(0);
      const changeStr = (change > 0 ? "+" : "") + change.toFixed(2) + "%";
      const range = (high - low).toFixed(2);
      const rangePct = ((high - low) / low * 100).toFixed(2);
      const avgPrice = ((high + low) / 2).toFixed(2);
      const recommend = change > 0 ? "BUY ✅" : "HOLD ❌";

      // 🧪 Dummy closes data with trend
      const closes = [];
      for (let i = 0; i < 30; i++) {
        closes.push(close * (0.95 + i * 0.003)); // trend naik perlahan
      }

      const rsiVal = calculateRSI(closes, 14);
      const rsi = Number.isFinite(rsiVal) ? rsiVal.toFixed(2) : "0.00";

      const ma20Val = calculateMA(closes, 20);
      const ma20 = Number.isFinite(ma20Val) ? ma20Val.toFixed(2) : "0.00";

      const macd = calculateMACD(closes);
      const bb = calculateBB(closes, 20);

      /** 🧮 Net Volume Calculation (Real if available) **/
      let netVol;
      if (item.d[7] !== undefined && item.d[8] !== undefined) {
        const buyVolume = item.d[7];
        const sellVolume = item.d[8];
        const netLot = buyVolume - sellVolume;
        netVol = (netLot * close).toFixed(0); // convert to rupiah value
      } else {
        // Fallback proxy calculation
        const netLot = volume * (change / 100);
        netVol = (netLot * close).toFixed(0);
      }

      /** ⚠️ Price Warning if below 55 **/
      const priceWarn = close < 55 ? " ⚠️<55" : "";

      return (
        `*${name}*${priceWarn}\n` +
        `- Close: ${close}\n` +
        `- Change: ${changeStr}\n` +
        `- Volume: ${volume}, Value: ${value}, NetVol: ${netVol}\n` +
        `- High: ${high}, Low: ${low}\n` +
        `- Range: ${range} (${rangePct}%), Avg: ${avgPrice}\n` +
        `- RSI: ${rsi}\n` +
        `- MA20: ${ma20}\n` +
        `- MACD: ${macd.macd}, Signal: ${macd.signal}, Hist: ${macd.histogram}\n` +
        `- BB: Upper ${bb.upper}, Lower ${bb.lower}, SMA ${bb.sma}\n` +
        `- Recommend: ${recommend}\n`
      );
    };

    // 🔥 Volatile tertinggi
    const sortedVolatile = [...volatileData].sort(
      (a, b) => Math.abs(b.d[2]) - Math.abs(a.d[2])
    );
    message += `🔥 *Volatile Tertinggi*\n`;
    message += formatItem(sortedVolatile[0]) + "\n";

    // 💧 Volume tertinggi
    message += `💧 *Volume Tertinggi*\n`;
    message += formatItem(volumeData[0]) + "\n";

    // ⚡️ Top 5 by volume
    message += `⚡️ *Top 5 Scalping (Volume)*\n`;
    volumeData.slice(0, 5).forEach((item, index) => {
      message += `${index + 1}. ${formatItem(item)}\n`;
    });

    // ⚡️ Top 5 by volatile
    message += `⚡️ *Top 5 Scalping (Volatile)*\n`;
    sortedVolatile.slice(0, 5).forEach((item, index) => {
      message += `${index + 1}. ${formatItem(item)}\n`;
    });

    return message;
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    return "Error fetching data.";
  }
}

/** === 📤 Send to Telegram === **/

async function sendToTelegram(message) {
  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    await axios.post(telegramUrl, {
      chat_id: TELEGRAM_CHAT_ID,
      message_thread_id: TELEGRAM_THREAD_ID, // target thread "Info Saham"
      text: message,
      parse_mode: "Markdown"
    });
    console.log("✅ Sent to Telegram thread Info Saham successfully.");
  } catch (err) {
    console.error("Telegram send error:", err.response?.data || err.message);
  }
}
/** === 🚀 Main Runner === **/

async function main() {
  const day = new Date().getUTCDay();

  let report;
  report = await getTopStocks();
  // if (day === 0 || day === 6) {
  //   report = "🛌 Market Tutup ... healing hela atuh boy";
  // } else {
  //   report = await getTopStocks();
  // }

  // console.log(report);
  await sendToTelegram(report);
}

main();
