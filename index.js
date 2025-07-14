import axios from "axios";

// telegram config
const TELEGRAM_TOKEN = "8072640433:AAEEobZMFTpPOx01qGpPwq_b26xsEzXh8-o";
const TELEGRAM_CHAT_ID = "-1002828449055";
const TELEGRAM_THREAD_ID = 2;

const headers = {
  "Content-Type": "application/json",
  "Origin": "https://id.tradingview.com",
  "Referer": "https://id.tradingview.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.70 Safari/537.36"
};

// Fungsi untuk cek apakah saham suspend berdasarkan data TradingView
function isStockSuspended(stockData) {
  const [name, close, change, volume, high, low] = stockData.d;
  
  // Kriteria suspend yang lebih ketat:
  // 1. Harga close = 0 atau null/undefined
  // 2. Volume = 0 atau null/undefined  
  // 3. Change = null/undefined atau NaN
  // 4. High = Low = Close = 0 (tidak ada trading sama sekali)
  // 5. High dan Low sama dengan Close dan volume = 0 (frozen)
  // 6. Data tidak valid (NaN, undefined, null)
  
  // Cek data kosong atau invalid
  if (close === null || close === undefined || !Number.isFinite(close)) {
    return true;
  }
  
  if (volume === null || volume === undefined || !Number.isFinite(volume)) {
    return true;
  }
  
  if (change === null || change === undefined || !Number.isFinite(change)) {
    return true;
  }
  
  if (high === null || high === undefined || !Number.isFinite(high)) {
    return true;
  }
  
  if (low === null || low === undefined || !Number.isFinite(low)) {
    return true;
  }
  
  // Cek kondisi suspend
  const isSuspended = (
    close === 0 || 
    volume === 0 || 
    (high === 0 && low === 0 && close === 0) ||
    (high === low && close === high && volume === 0) ||
    (Math.abs(change) === 0 && volume === 0 && high === low)
  );
  
  return isSuspended;
}

// Fungsi untuk menentukan status suspend dengan level warning
function getSuspendStatus(stockData) {
  const [name, close, change, volume, high, low] = stockData.d;
  
  if (isStockSuspended(stockData)) {
    return {
      isSuspended: true,
      level: "SUSPEND",
      icon: "🚫",
      warning: "SAHAM SUSPEND - JANGAN BELI!"
    };
  }
  
  // Cek kondisi mencurigakan (hampir suspend)
  if (volume < 100000 && Math.abs(change) < 0.1) {
    return {
      isSuspended: false,
      level: "ILLIQUID",
      icon: "⚠️",
      warning: "LIKUIDITAS RENDAH - HATI-HATI!"
    };
  }
  
  if (high === low && volume > 0) {
    return {
      isSuspended: false,
      level: "FROZEN",
      icon: "❄️",
      warning: "HARGA FROZEN - MONITOR KETAT!"
    };
  }
  
  return {
    isSuspended: false,
    level: "NORMAL",
    icon: "✅",
    warning: ""
  };
}

async function fetchBeritaKontanDanKirim() {
  const today = new Date();
  const tanggal = String(today.getDate()).padStart(2, '0');
  const bulan = String(today.getMonth() + 1).padStart(2, '0');
  const tahun = today.getFullYear();

  const url = `https://www.kontan.co.id/search/indeks?kanal=investasi&tanggal=${tanggal}&bulan=${bulan}&tahun=${tahun}&pos=indeks`;
  
  try {
    const res = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://www.kontan.co.id",
        "Origin": "https://www.kontan.co.id"
      }
    });
    
    const html = res.data;
    
    const regex = /<h1[^>]*>(.*?)<\/h1>/g;
    const matches = [...html.matchAll(regex)];
    
    let message = `📰 *Berita Emiten Kontan Hari Ini*\n\n`;
    const addedEmiten = new Set();
    
    matches.forEach(match => {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      const emitenMatch = text.match(/\b[A-Z]{4}\b/);
      
      if (emitenMatch) {
        const emiten = emitenMatch[0];
        if (!addedEmiten.has(emiten)) {
          message += `• *${emiten}* - ${text}\n`;
          addedEmiten.add(emiten);
        }
      }
    });

    if (addedEmiten.size === 0) {
      message += "Tidak ada berita emiten ditemukan hari ini.";
    }

    await sendToTelegram(message);

  } catch (err) {
    console.error("Fetch Kontan Error:", err.message);
  }
}

function calculateMA(closes, period = 20) {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const ma = slice.reduce((a, b) => a + b, 0) / period;
  return ma;
}

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  
  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  
  if (changes.length < period) return 50;
  
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }
  
  avgGain /= period;
  avgLoss /= period;
  
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

  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);
  
  const macdLine = emaFast - emaSlow;
  
  const macdArray = [];
  for (let i = slowPeriod - 1; i < closes.length; i++) {
    const dataSlice = closes.slice(0, i + 1);
    const fast = calculateEMA(dataSlice, fastPeriod);
    const slow = calculateEMA(dataSlice, slowPeriod);
    macdArray.push(fast - slow);
  }
  
  const signalLine = calculateEMA(macdArray, signalPeriod);
  
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

function generateRealisticPriceData(currentPrice, periods = 50) {
  const closes = [];
  let price = currentPrice * 0.95;
  
  for (let i = 0; i < periods; i++) {
    const volatility = (Math.random() - 0.5) * 0.03;
    const trend = 0.001 + (Math.random() * 0.002);
    const momentum = Math.sin(i * 0.1) * 0.005;
    
    price = price * (1 + trend + volatility + momentum);
    closes.push(Math.max(price, 50));
  }
  
  return closes;
}

function detectBandarmology(name, close, change, volume, high, low, netVol) {
  const signals = [];
  const rangePct = ((high - low) / low * 100);
  const priceVsHigh = (close / high * 100);
  const priceVsLow = (close / low * 100);
  const volumeValue = close * volume;
  const netVolNum = parseFloat(netVol);
  
  if (volumeValue > 50000000 && netVolNum > 10000000) {
    signals.push("🔥 LONJAKAN VOLUME + NET BELI BESAR");
  }

  if (priceVsHigh > 95 && volumeValue > 20000000) {
    signals.push("🎯 PENUTUPAN DEKAT HIGH + VOLUME TINGGI");
  }

  if (change > 5 && volumeValue > 30000000) {
    signals.push("🚀 POLA BREAKOUT");
  }

  if (volumeValue > 40000000 && rangePct < 3 && Math.abs(change) < 2) {
    signals.push("📈 POLA AKUMULASI");
  }

  if (volumeValue > 40000000 && priceVsHigh < 85 && change < -2) {
    signals.push("📉 POLA DISTRIBUSI");
  }

  if (change > 3 && netVolNum > 5000000 && priceVsHigh > 90) {
    signals.push("⚡ MOMENTUM KUAT + NET BELI");
  }

  if (priceVsLow < 110 && volumeValue > 25000000 && change > 0) {
    signals.push("🛡️ UJI LEVEL SUPPORT");
  }
  return signals;
}

function calculateStockScore(name, close, change, volume, high, low, netVol, rsi, macd, bb, suspendStatus) {
  // Jika suspend, score otomatis 0
  if (suspendStatus.isSuspended) {
    return 0;
  }
  
  // Jika illiquid atau frozen, kurangi score drastis
  if (suspendStatus.level === "ILLIQUID") {
    return 10; // Score sangat rendah
  }
  
  if (suspendStatus.level === "FROZEN") {
    return 20; // Score rendah
  }
  
  let score = 0;
  const volumeValue = close * volume;
  const netVolNum = parseFloat(netVol);
  const rangePct = ((high - low) / low * 100);
  const priceVsHigh = (close / high * 100);
  const rsiNum = parseFloat(rsi);
  const macdNum = parseFloat(macd.macd);
  const macdSignal = parseFloat(macd.signal);
  
  if (volumeValue > 100000000) score += 25;
  else if (volumeValue > 50000000) score += 20;
  else if (volumeValue > 25000000) score += 15;
  else if (volumeValue > 10000000) score += 10;
  else score += 5;
  
  if (netVolNum > 20000000) score += 20;
  else if (netVolNum > 10000000) score += 15;
  else if (netVolNum > 5000000) score += 10;
  else if (netVolNum > 0) score += 5;
  
  if (change > 5 && priceVsHigh > 95) score += 20;
  else if (change > 3 && priceVsHigh > 90) score += 15;
  else if (change > 1 && priceVsHigh > 85) score += 10;
  else if (change > 0) score += 5;
  
  if (rsiNum > 30 && rsiNum < 70 && macdNum > macdSignal) score += 20;
  else if (rsiNum > 40 && rsiNum < 60) score += 15;
  else if (rsiNum > 35 && rsiNum < 65) score += 10;
  else score += 5;
  
  if (Math.abs(change) > 5) score += 15;
  else if (Math.abs(change) > 3) score += 12;
  else if (Math.abs(change) > 1) score += 8;
  else score += 3;
  
  return score;
}

function getRecommendationEmoji(recommendation) {
  if (recommendation.includes("BUY")) return "🟢";
  if (recommendation.includes("SELL")) return "🔴";
  if (recommendation.includes("SUSPEND")) return "🚫";
  if (recommendation.includes("AVOID")) return "⛔";
  return "⚪";
}

function getRecommendation(score, change, rsi, netVol, macd, suspendStatus) {
  // Jika suspend, langsung return avoid
  if (suspendStatus.isSuspended) {
    return "🚫 AVOID - SUSPEND";
  }
  
  // Jika illiquid atau frozen, avoid juga
  if (suspendStatus.level === "ILLIQUID") {
    return "⛔ AVOID - ILLIQUID";
  }
  
  if (suspendStatus.level === "FROZEN") {
    return "❄️ AVOID - FROZEN";
  }
  
  const rsiNum = parseFloat(rsi);
  const netVolNum = parseFloat(netVol);
  const macdNum = parseFloat(macd.macd);
  const macdSignal = parseFloat(macd.signal);
  
  if (score >= 80 && change > 2 && netVolNum > 5000000 && macdNum > macdSignal && rsiNum < 70) {
    return "🔥 STRONG BUY";
  }
  else if (score >= 65 && change > 0 && (netVolNum > 0 || macdNum > macdSignal) && rsiNum < 75) {
    return "✅ BUY";
  }
  else if (score >= 55 && change > 0 && rsiNum < 80) {
    return "📈 WEAK BUY";
  }
  else if (score >= 45 && Math.abs(change) < 3) {
    return "⚖️ HOLD";
  }
  else if (score >= 35 && change < 0) {
    return "⚠️ WEAK SELL";
  }
  else {
    return "❌ SELL";
  }
}

async function fetchStocks(sortBy, sortOrder) {
  const url = "https://scanner.tradingview.com/indonesia/scan";
  const payload = {
    filter: [],
    options: { lang: "en" },
    symbols: { query: { types: [] }, tickers: [] },
    columns: ["name", "close", "change", "volume", "high", "low"],
    sort: { sortBy, sortOrder },
    range: [0, 50]
  };

  const res = await axios.post(url, payload, { headers });
  return res.data.data;
}

async function getTopStocks() {
  try {
    const [volumeData, volatileData, gainersData] = await Promise.all([
      fetchStocks("volume", "desc"),
      fetchStocks("change", "desc"),
      fetchStocks("change", "desc")
    ]);

    const formatItem = (item, index) => {
      const [name, close, change, volume, high, low] = item.d;

      // Cek status suspend
      const suspendStatus = getSuspendStatus(item);

      const changeStr = (change > 0 ? "+" : "") + (Number.isFinite(change) ? change.toFixed(2) : "0.00") + "%";

      const closes = generateRealisticPriceData(close, 50);

      const rsiVal = calculateRSI(closes, 14);
      const rsi = Number.isFinite(rsiVal) ? rsiVal.toFixed(2) : "50.00";

      const macd = calculateMACD(closes);

      let netVol;
      if (item.d[7] !== undefined && item.d[8] !== undefined) {
        const buyVolume = item.d[7];
        const sellVolume = item.d[8];
        const netLot = buyVolume - sellVolume;
        netVol = (netLot * close).toFixed(0);
      } else {
        const netLot = volume * (change / 100) * (change > 0 ? 1 : -1);
        netVol = (netLot * close).toFixed(0);
      }

      const bandarSignals = detectBandarmology(name, close, change, volume, high, low, netVol);
      
      const score = calculateStockScore(name, close, change, volume, high, low, netVol, rsi, macd, {}, suspendStatus);
      const recommendation = getRecommendation(score, change, rsi, netVol, macd, suspendStatus);

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
        if (suspendStatus.isSuspended) return "SUSPEND";
        if (suspendStatus.level === "ILLIQUID") return "ILLIQUID";
        if (suspendStatus.level === "FROZEN") return "FROZEN";
        
        const macdNum = parseFloat(macd.macd);
        const macdSignal = parseFloat(macd.signal);
        const rsiNum = parseFloat(rsi);
        
        if (macdNum > macdSignal && rsiNum < 70 && change > 0) return "BUY";
        if (macdNum < macdSignal && rsiNum > 30 && change < 0) return "SELL";
        return "HOLD";
      };

      return {
        text: (
          `${index}. *${name}* ${suspendStatus.icon} ${getRecommendationEmoji(recommendation)}\n` +
          `· Harga: ${close}\n` +
          `· Perubahan: ${changeStr}\n` +
          `· Volume: ${formatVolume(volume)}\n` +
          `· Net Vol: ${formatNetVol(netVol)}\n` +
          `· RSI: ${rsi}\n` +
          `· MACD: ${macd.macd}\n` +
          `· Signal: ${getSignal()}\n` +
          `· Rekomendasi: ${recommendation}\n` +
          `· Score: ${score}\n` +
          (suspendStatus.warning ? `· ⚠️ *${suspendStatus.warning}*\n` : "") +
          (bandarSignals.length > 0 ? `· Alert: ${bandarSignals[0]}\n` : "") +
          '\n'
        ),
        score: score,
        recommendation: recommendation,
        bandarSignals: bandarSignals,
        name: name,
        change: change,
        suspendStatus: suspendStatus
      };
    };

    const allStocks = [...volumeData, ...volatileData, ...gainersData];
    const uniqueStocks = allStocks.filter((stock, index, self) => 
      self.findIndex(s => s.d[0] === stock.d[0]) === index
    );

    // Format semua stocks termasuk yang suspend (untuk tracking)
    const stocksWithScore = uniqueStocks.map(stock => {
      const formatted = formatItem(stock, 0);
      return {
        ...stock,
        score: formatted.score,
        recommendation: formatted.recommendation,
        bandarSignals: formatted.bandarSignals,
        name: formatted.name,
        change: formatted.change,
        suspendStatus: formatted.suspendStatus
      };
    });

    // Sort berdasarkan score (suspend akan otomatis di bawah karena score 0)
    stocksWithScore.sort((a, b) => b.score - a.score);

    const top10 = stocksWithScore.slice(0, 10);

    const firstHalf = top10.slice(0, 5);
    const secondHalf = top10.slice(5, 10);

    let message1 = `🏆 *TOP 10 RECOMMENDED STOCKS* (Part 1/2)\n\n`;
    firstHalf.forEach((stock, index) => {
      const formatted = formatItem(stock, index + 1);
      message1 += formatted.text;
    });

    let message2 = `🏆 *TOP 10 RECOMMENDED STOCKS* (Part 2/2)\n\n`;
    secondHalf.forEach((stock, index) => {
      const formatted = formatItem(stock, index + 6);
      message2 += formatted.text;
    });

    // Hitung statistik
    const strongBuyCount = top10.filter(s => s.recommendation === "🔥 STRONG BUY").length;
    const buyCount = top10.filter(s => s.recommendation === "✅ BUY").length;
    const weakBuyCount = top10.filter(s => s.recommendation === "📈 WEAK BUY").length;
    const totalBuySignals = strongBuyCount + buyCount + weakBuyCount;
    const bandarCount = top10.filter(s => s.bandarSignals.length > 0).length;
    const avgScore = (top10.reduce((a, b) => a + b.score, 0) / top10.length).toFixed(1);
    const gainersCount = top10.filter(s => s.change > 0).length;
    
    // Hitung jumlah saham suspend dan bermasalah
    const suspendedCount = uniqueStocks.filter(s => getSuspendStatus(s).isSuspended).length;
    const illiquidCount = uniqueStocks.filter(s => getSuspendStatus(s).level === "ILLIQUID").length;
    const frozenCount = uniqueStocks.filter(s => getSuspendStatus(s).level === "FROZEN").length;
    const avoidCount = top10.filter(s => s.recommendation.includes("AVOID")).length;

    message2 += `\n📊 *MARKET SUMMARY*\n`;
    message2 += `🔥 Strong Buy: *${strongBuyCount}* stocks\n`;
    message2 += `✅ Buy Signal: *${buyCount}* stocks\n`;
    message2 += `📈 Weak Buy: *${weakBuyCount}* stocks\n`;
    message2 += `🚀 Total Buy Signals: *${totalBuySignals}* stocks\n`;
    message2 += `📈 Gainers: *${gainersCount}* stocks\n`;
    message2 += `🎯 Bandar Activity: *${bandarCount}* stocks\n`;
    message2 += `📊 Average Score: \`${avgScore}/100\`\n`;
    message2 += `🚫 Suspended: *${suspendedCount}* stocks\n`;
    message2 += `⚠️ Illiquid: *${illiquidCount}* stocks\n`;
    message2 += `❄️ Frozen: *${frozenCount}* stocks\n`;
    message2 += `⛔ Avoid (Top10): *${avoidCount}* stocks\n`;
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

async function sendToTelegram(message) {
  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  
  const maxLength = 4000;
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
  
  for (let i = 0; i < messages.length; i++) {
    try {
      await axios.post(telegramUrl, {
        chat_id: TELEGRAM_CHAT_ID,
        message_thread_id: TELEGRAM_THREAD_ID,
        text: messages[i],
        parse_mode: "Markdown"
      });
      console.log(`✅ Sent message part ${i + 1}/${messages.length} to Telegram successfully.`);
      
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error(`Telegram send error for part ${i + 1}:`, err.response?.data || err.message);
    }
  }
}

async function main() {
  const day = new Date().getUTCDay();

  if (day === 0 || day === 6) {
    await sendToTelegram("🛌 Market Tutup ... healing hela atuh boy");
  } else {
    await fetchBeritaKontanDanKirim();
    await getTopStocks();
  }
}

main(); 