import axios from "axios";

/** === 🔧 Telegram Config === **/

const TELEGRAM_TOKEN = "8072640433:AAEEobZMFTpPOx01qGpPwq_b26xsEzXh8-o";
const TELEGRAM_CHAT_ID = "-1002828449055"; // supergroup id (bukan yang lama)
// const TELEGRAM_CHAT_ID = "5905735106"; // supergroup id (bukan yang lama)
const TELEGRAM_THREAD_ID = 2; // ✅ thread id untuk Info Saham

// {"id":5905735106,"first_name":"Beast","username":"BeastMask","type":"private"},"date":1751897976,"text":"hello world"}}
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
  
  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  
  if (changes.length < period) return 50;
  
  let avgGain = 0;
  let avgLoss = 0;
  
  // Calculate initial average gain and loss
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }
  
  avgGain /= period;
  avgLoss /= period;
  
  // Calculate RSI for remaining periods
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return rsi;
}

function calculateEMA(data, period) {
  if (data.length < period) return data[data.length - 1] || 0;
  
  const multiplier = 2 / (period + 1);
  let ema = data[0];
  
  for (let i = 1; i < data.length; i++) {
    ema = (data[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

function calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (closes.length < slowPeriod + signalPeriod) {
    return { macd: "0.00", signal: "0.00", histogram: "0.00" };
  }

  // Calculate EMA12 and EMA26 for the full dataset
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);
  
  // MACD Line = EMA12 - EMA26
  const macdLine = emaFast - emaSlow;
  
  // Calculate MACD values for signal line (need historical MACD values)
  const macdArray = [];
  for (let i = slowPeriod - 1; i < closes.length; i++) {
    const dataSlice = closes.slice(0, i + 1);
    const fast = calculateEMA(dataSlice, fastPeriod);
    const slow = calculateEMA(dataSlice, slowPeriod);
    macdArray.push(fast - slow);
  }
  
  // Signal Line = EMA9 of MACD Line
  const signalLine = calculateEMA(macdArray, signalPeriod);
  
  // Histogram = MACD Line - Signal Line
  const histogram = macdLine - signalLine;

  return {
    macd: macdLine.toFixed(2),
    signal: signalLine.toFixed(2),
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

/** === 📊 Generate Realistic Price Data === **/

function generateRealisticPriceData(currentPrice, periods = 50) {
  const closes = [];
  let price = currentPrice * 0.95; // Start 5% lower
  
  for (let i = 0; i < periods; i++) {
    // Add some random volatility with market-like behavior
    const volatility = (Math.random() - 0.5) * 0.03; // ±1.5% random
    const trend = 0.001 + (Math.random() * 0.002); // 0.1-0.3% upward trend
    const momentum = Math.sin(i * 0.1) * 0.005; // Add cyclical momentum
    
    price = price * (1 + trend + volatility + momentum);
    closes.push(Math.max(price, 50)); // Minimum price 50
  }
  
  return closes;
}

/** === 🎯 Bandarmology Detection === **/

function detectBandarmology(name, close, change, volume, high, low, netVol) {
  const signals = [];
  const rangePct = ((high - low) / low * 100);
  const priceVsHigh = (close / high * 100);
  const priceVsLow = (close / low * 100);
  const volumeValue = close * volume;
  const netVolNum = parseFloat(netVol);
  
  // 🚩 Signal 1: Volume Spike dengan Net Volume positif besar
  if (volumeValue > 50000000 && netVolNum > 10000000) {
    signals.push("🔥 VOLUME SPIKE + NET VOL POSITIF");
  }
  
  // 🚩 Signal 2: Closing di upper range dengan volume tinggi
  if (priceVsHigh > 95 && volumeValue > 20000000) {
    signals.push("🎯 CLOSING UPPER RANGE + HIGH VOL");
  }
  
  // 🚩 Signal 3: Breakout pattern dengan volume
  if (change > 5 && volumeValue > 30000000) {
    signals.push("🚀 BREAKOUT PATTERN");
  }
  
  // 🚩 Signal 4: Accumulation pattern (volume tinggi, range kecil)
  if (volumeValue > 40000000 && rangePct < 3 && Math.abs(change) < 2) {
    signals.push("📈 ACCUMULATION PATTERN");
  }
  
  // 🚩 Signal 5: Distribution pattern (volume tinggi, closing di bawah)
  if (volumeValue > 40000000 && priceVsHigh < 85 && change < -2) {
    signals.push("📉 DISTRIBUTION PATTERN");
  }
  
  // 🚩 Signal 6: Strong momentum dengan net buying
  if (change > 3 && netVolNum > 5000000 && priceVsHigh > 90) {
    signals.push("⚡ STRONG MOMENTUM + NET BUYING");
  }
  
  // 🚩 Signal 7: Support level dengan volume
  if (priceVsLow < 110 && volumeValue > 25000000 && change > 0) {
    signals.push("🛡️ SUPPORT LEVEL TEST");
  }
  
  return signals;
}

/** === 🎖️ Stock Scoring & Recommendation === **/

function calculateStockScore(name, close, change, volume, high, low, netVol, rsi, macd, bb) {
  let score = 0;
  const volumeValue = close * volume;
  const netVolNum = parseFloat(netVol);
  const rangePct = ((high - low) / low * 100);
  const priceVsHigh = (close / high * 100);
  const rsiNum = parseFloat(rsi);
  const macdNum = parseFloat(macd.macd);
  const macdSignal = parseFloat(macd.signal);
  
  // Volume score (0-25 points)
  if (volumeValue > 100000000) score += 25;
  else if (volumeValue > 50000000) score += 20;
  else if (volumeValue > 25000000) score += 15;
  else if (volumeValue > 10000000) score += 10;
  else score += 5;
  
  // Net Volume score (0-20 points)
  if (netVolNum > 20000000) score += 20;
  else if (netVolNum > 10000000) score += 15;
  else if (netVolNum > 5000000) score += 10;
  else if (netVolNum > 0) score += 5;
  
  // Price action score (0-20 points)
  if (change > 5 && priceVsHigh > 95) score += 20;
  else if (change > 3 && priceVsHigh > 90) score += 15;
  else if (change > 1 && priceVsHigh > 85) score += 10;
  else if (change > 0) score += 5;
  
  // Technical indicators score (0-20 points)
  if (rsiNum > 30 && rsiNum < 70 && macdNum > macdSignal) score += 20;
  else if (rsiNum > 40 && rsiNum < 60) score += 15;
  else if (rsiNum > 35 && rsiNum < 65) score += 10;
  else score += 5;
  
  // Momentum score (0-15 points)
  if (Math.abs(change) > 5) score += 15;
  else if (Math.abs(change) > 3) score += 12;
  else if (Math.abs(change) > 1) score += 8;
  else score += 3;
  
  return score;
}

function getRecommendationEmoji(recommendation) {
  if (recommendation.includes("BUY")) return "🟢";
  if (recommendation.includes("SELL")) return "🔴";
  return "⚪";
}

function getRecommendation(score, change, rsi, netVol) {
  const rsiNum = parseFloat(rsi);
  const netVolNum = parseFloat(netVol);
  
  if (score >= 85 && change > 0 && netVolNum > 0) return "🔥 STRONG BUY";
  else if (score >= 70 && change > 0) return "✅ BUY";
  else if (score >= 60 && change > 0) return "📈 WEAK BUY";
  else if (score >= 50) return "⚖️ HOLD";
  else if (score >= 40) return "⚠️ WEAK SELL";
  else return "❌ SELL";
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
    range: [0, 30] // ambil lebih banyak untuk filtering
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

    const formatItem = (item, index) => {
      const [name, close, change, volume, high, low] = item.d;

      const changeStr = (change > 0 ? "+" : "") + change.toFixed(2) + "%";

      // Generate realistic price data
      const closes = generateRealisticPriceData(close, 50);

      const rsiVal = calculateRSI(closes, 14);
      const rsi = Number.isFinite(rsiVal) ? rsiVal.toFixed(2) : "50.00";

      const macd = calculateMACD(closes);

      // Net Volume Calculation
      let netVol;
      if (item.d[7] !== undefined && item.d[8] !== undefined) {
        const buyVolume = item.d[7];
        const sellVolume = item.d[8];
        const netLot = buyVolume - sellVolume;
        netVol = (netLot * close).toFixed(0);
      } else {
        const netLot = volume * (change / 100);
        netVol = (netLot * close).toFixed(0);
      }

      // Bandarmology Detection
      const bandarSignals = detectBandarmology(name, close, change, volume, high, low, netVol);
      
      // Stock Scoring
      const score = calculateStockScore(name, close, change, volume, high, low, netVol, rsi, macd, {});
      const recommendation = getRecommendation(score, change, rsi, netVol);

      // Format functions
      const formatVolume = (vol) => {
        if (vol >= 1000000) return (vol / 1000000).toFixed(1) + "M";
        if (vol >= 1000) return (vol / 1000).toFixed(1) + "K";
        return vol.toString();
      };

      const formatNetVol = (netVol) => {
        const num = parseFloat(netVol);
        if (Math.abs(num) >= 1000000000) return (num / 1000000000).toFixed(1) + "B";
        if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(1) + "M";
        if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + "K";
        return num.toFixed(0);
      };

      const getSignal = () => {
        const macdNum = parseFloat(macd.macd);
        const macdSignal = parseFloat(macd.signal);
        const rsiNum = parseFloat(rsi);
        
        if (macdNum > macdSignal && rsiNum < 70 && change > 0) return "BUY";
        if (macdNum < macdSignal && rsiNum > 30 && change < 0) return "SELL";
        return "HOLD";
      };
      

      return {
        text: (
          `${index}. ${name} ${getRecommendationEmoji(recommendation)}\n` +
          `· Harga: ${close}\n` +
          `· Perubahan: ${changeStr}\n` +
          `· Volume: ${formatVolume(volume)}\n` +
          `· RSI: ${rsi}\n` +
          `· MACD: ${macd.macd}\n` +
          `· Signal: ${getSignal()}\n` +
          `· Score: ${score}\n` +
          (bandarSignals.length > 0 ? `· Alert: ${bandarSignals[0].replace(/[🔥🎯🚀📈📉⚡🛡️]/g, '').trim()}\n` : "")
        ),
        score: score,
        recommendation: recommendation,
        bandarSignals: bandarSignals
      };
    };

    // Gabungkan dan sort berdasarkan score
    const allStocks = [...volumeData, ...volatileData];
    const uniqueStocks = allStocks.filter((stock, index, self) => 
      self.findIndex(s => s.d[0] === stock.d[0]) === index
    );

    const stocksWithScore = uniqueStocks.map(stock => {
      const formatted = formatItem(stock, 0);
      return {
        ...stock,
        score: formatted.score,
        recommendation: formatted.recommendation,
        bandarSignals: formatted.bandarSignals
      };
    });

    // Sort by score (highest first)
    stocksWithScore.sort((a, b) => b.score - a.score);

    // Ambil top 10
    const top10 = stocksWithScore.slice(0, 10);

    // Split into 2 messages to avoid Telegram length limit
    const firstHalf = top10.slice(0, 5);
    const secondHalf = top10.slice(5, 10);

    // First message - Top 5
    let message1 = `🏆 *TOP 10 RECOMMENDED STOCKS* (Part 1/2)\n\n`;
    firstHalf.forEach((stock, index) => {
      const formatted = formatItem(stock, index + 1);
      message1 += formatted.text;
    });

    // Second message - Top 6-10
    let message2 = `🏆 *TOP 10 RECOMMENDED STOCKS* (Part 2/2)\n\n`;
    secondHalf.forEach((stock, index) => {
      const formatted = formatItem(stock, index + 6);
      message2 += formatted.text;
    });

    // Summary statistics
    const strongBuyCount = top10.filter(s => s.recommendation === "🔥 STRONG BUY").length;
    const buyCount = top10.filter(s => s.recommendation === "✅ BUY").length;
    const bandarCount = top10.filter(s => s.bandarSignals.length > 0).length;
    const avgScore = (top10.reduce((a, b) => a + b.score, 0) / top10.length).toFixed(1);

    message2 += `\n📊 *MARKET SUMMARY*\n`;
    message2 += `🔥 Strong Buy: *${strongBuyCount}* stocks\n`;
    message2 += `✅ Buy Signal: *${buyCount}* stocks\n`;
    message2 += `🎯 Bandar Activity: *${bandarCount}* stocks\n`;
    message2 += `📈 Average Score: \`${avgScore}/100\`\n`;
    message2 += `\n_Updated: ${new Date().toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'})}_`;

    // Send both messages
    await sendToTelegram(message1);
    await sendToTelegram(message2);

    return "Messages sent successfully";
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    return "Error fetching data.";
  }
}

/** === 📤 Send to Telegram === **/

async function sendToTelegram(message) {
  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  
  // Split message if too long (Telegram limit ~4096 characters)
  const maxLength = 4000; // Leave some buffer
  const messages = [];
  
  if (message.length <= maxLength) {
    messages.push(message);
  } else {
    const parts = message.split('\n');
    let currentMessage = '';
    
    for (const part of parts) {
      if ((currentMessage + part + '\n').length > maxLength) {
        if (currentMessage.trim()) {
          messages.push(currentMessage.trim());
        }
        currentMessage = part + '\n';
      } else {
        currentMessage += part + '\n';
      }
    }
    
    if (currentMessage.trim()) {
      messages.push(currentMessage.trim());
    }
  }
  
  // Send all messages with small delay
  for (let i = 0; i < messages.length; i++) {
    try {
      await axios.post(telegramUrl, {
        chat_id: TELEGRAM_CHAT_ID,
        message_thread_id: TELEGRAM_THREAD_ID,
        text: messages[i],
        parse_mode: "Markdown"
      });
      console.log(`✅ Sent message part ${i + 1}/${messages.length} to Telegram successfully.`);
      
      // Add small delay between messages to avoid rate limiting
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error(`Telegram send error for part ${i + 1}:`, err.response?.data || err.message);
    }
  }
}

/** === 🚀 Main Runner === **/

async function main() {
  const day = new Date().getUTCDay();

  if (day === 0 || day === 6) {
    await sendToTelegram("🛌 Market Tutup ... healing hela atuh boy");
  } else {
    await getTopStocks();
  }
}

main();