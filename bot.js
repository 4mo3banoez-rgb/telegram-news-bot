require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const http = require('http');

// Создаем интерфейс для ввода
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Файлы для хранения данных
const PROCESSED_MESSAGES_FILE = path.join(__dirname, 'processed_messages.json');
const BOT_STATE_FILE = path.join(__dirname, 'bot_state.json');

// Настройки логирования
const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
const LOG_LEVELS = { 'DEBUG': 0, 'INFO': 1, 'WARN': 2, 'ERROR': 3 };

function log(level, message) {
  const currentLevel = LOG_LEVELS[LOG_LEVEL] || 1;
  if (LOG_LEVELS[level] >= currentLevel) {
    const timestamp = new Date().toISOString();
    console.log(`[${level}] ${timestamp} ${message}`);
  }
}

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Проверка обязательных переменных
log("INFO", "🚀 Проверка переменных окружения...");
const requiredEnvVars = ['DISCORD_TOKEN', 'TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_PHONE_NUMBER'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    log("ERROR", `❌ Отсутствует переменная окружения ${envVar}`);
    process.exit(1);
  }
}
log("INFO", '✅ Все переменные окружения загружены');

const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Конфигурация каналов
const channelMappings = [
  { telegramChannel: "@bezzzzdari", discordChannelId: "1177068610150223922", name: "Bezzzzdari" },
  { telegramChannel: "@raiznews", discordChannelId: "1437143901785030676", name: "Raiz News" },
  { telegramChannel: "@newcsgo", discordChannelId: "1437143901785030676", name: "New CSGO" },
  { telegramChannel: "@truedadEducation", discordChannelId: "1437143901785030676", name: "True Dad Education" },
  { telegramChannel: "@offclevermonkey", discordChannelId: "1437143901785030676", name: "Off Clever Monkey" },
  { telegramChannel: "@csgoppa", discordChannelId: "1437143901785030676", name: "CSGO PPA" },
  { telegramChannel: "@zicelaqo", discordChannelId: "1437137941641302156", name: "Zicelaqo" },
  { telegramChannel: "@splayer6dka0", discordChannelId: "1437137941641302156", name: "Splayer" },
  { telegramChannel: "@gentincrypto", discordChannelId: "1437137941641302156", name: "Gent in Crypto" },
  { telegramChannel: "@vtrendetrade", discordChannelId: "1437137941641302156", name: "V Trend eTrade" },
  { telegramChannel: "@probablyinsomnia", discordChannelId: "1437137941641302156", name: "Probably Insomnia" },
  { telegramChannel: "@cryptoforze", discordChannelId: "1437137941641302156", name: "Crypto Forze" },
  { telegramChannel: "@cryptouttopia", discordChannelId: "1437137941641302156", name: "Crypto Utopia" },
  { telegramChannel: "@shit101", discordChannelId: "1437137941641302156", name: "Shit 101" },
  { telegramChannel: "@Crypto_Wein", discordChannelId: "1437137941641302156", name: "Crypto Wein" },
  { telegramChannel: "@activitylauncher_offical", discordChannelId: "1437137941641302156", name: "Activity Launcher" },
  { telegramChannel: "@cryptoattack24", discordChannelId: "1437137941641302156", name: "Crypto Attack 24" },
  { telegramChannel: "@cryptoflower28", discordChannelId: "1437137941641302156", name: "Crypto Flower 28" },
  { telegramChannel: "@donqaboutcrypto", discordChannelId: "1437137941641302156", name: "Don Q About Crypto" },
  { telegramChannel: "@cryptover1", discordChannelId: "1437137941641302156", name: "Crypto Ver1" },
  { telegramChannel: "@cryptocurrencyfor_dumbs", discordChannelId: "1437137941641302156", name: "Crypto for Dumbs" },
  { telegramChannel: "@gift_newstg", discordChannelId: "1437137941641302156", name: "Gift News" }
];

// Хранилище для обработанных сообщений
let processedMessages = new Set();
let lastProcessedTimestamps = {};

const telegramClient = new TelegramClient(
  new StringSession(process.env.TELEGRAM_SESSION || ""),
  parseInt(process.env.TELEGRAM_API_ID),
  process.env.TELEGRAM_API_HASH,
  { 
    connectionRetries: 5,
    useWSS: false,
    baseLogger: console
  }
);

// HTTP-сервер для Render
function startHealthServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    });
    
    const status = {
      status: 'active',
      timestamp: new Date().toISOString(),
      processed_messages: processedMessages.size,
      channels_monitored: channelMappings.length,
      memory_usage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      last_check: Object.keys(lastProcessedTimestamps).length > 0 ? 
        Math.max(...Object.values(lastProcessedTimestamps)) : null
    };
    
    res.end(JSON.stringify(status, null, 2));
  });

  const port = process.env.PORT || 10000;
  server.listen(port, '0.0.0.0', () => {
    log("INFO", `✅ Health check server running on port ${port}`);
  });
  
  return server;
}

// Загружаем обработанные сообщения из файла
async function loadProcessedMessages() {
  try {
    const data = await fs.readFile(PROCESSED_MESSAGES_FILE, 'utf8');
    const messagesArray = JSON.parse(data);
    log("INFO", `📁 Загружено ${messagesArray.length} обработанных сообщений из файла`);
    return new Set(messagesArray);
  } catch (error) {
    log("INFO", '📁 Файл с обработанных сообщений не найден, создаем новый');
    return new Set();
  }
}

// Загружаем состояние бота
async function loadBotState() {
  try {
    const data = await fs.readFile(BOT_STATE_FILE, 'utf8');
    const state = JSON.parse(data);
    log("INFO", `📁 Загружено состояние бота: ${Object.keys(state.lastTimestamps || {}).length} каналов`);
    return state;
  } catch (error) {
    log("INFO", '📁 Файл состояния бота не найден, создаем новый');
    return { lastTimestamps: {} };
  }
}

// Сохраняем обработанные сообщения в файл
async function saveProcessedMessages() {
  try {
    const data = JSON.stringify([...processedMessages]);
    await fs.writeFile(PROCESSED_MESSAGES_FILE, data, 'utf8');
    log("DEBUG", `💾 Сохранено ${processedMessages.size} сообщений`);
  } catch (error) {
    log("ERROR", `❌ Ошибка сохранения обработанных сообщений: ${error.message}`);
  }
}

// Сохраняем состояние бота
async function saveBotState() {
  try {
    const state = {
      lastTimestamps: lastProcessedTimestamps,
      lastSave: Date.now()
    };
    const data = JSON.stringify(state, null, 2);
    await fs.writeFile(BOT_STATE_FILE, data, 'utf8');
    log("DEBUG", `💾 Сохранено состояние бота: ${Object.keys(lastProcessedTimestamps).length} каналов`);
  } catch (error) {
    log("ERROR", `❌ Ошибка сохранения состояния бота: ${error.message}`);
  }
}

// Ограничиваем размер хранимых сообщений
function addToProcessedMessages(messageId) {
  if (processedMessages.size >= 2000) {
    const first = processedMessages.values().next().value;
    processedMessages.delete(first);
    log("DEBUG", `🧹 Удалено старое сообщение из кэша: ${first}`);
  }
  processedMessages.add(messageId);
}

// Обновляем временные метки каналов
function updateChannelTimestamp(channelName, timestamp) {
  lastProcessedTimestamps[channelName] = timestamp;
}

// Проверка размера файла
async function isFileSizeValid(buffer, maxSizeMB = 8) {
  const maxSize = maxSizeMB * 1024 * 1024;
  const isValid = buffer.length <= maxSize;
  
  if (!isValid) {
    log("WARN", `📁 Файл слишком большой: ${(buffer.length / 1024 / 1024).toFixed(2)} MB > ${maxSizeMB} MB`);
  }
  
  return isValid;
}

async function connectTelegram() {
  log("INFO", "🔑 Подключаемся к Telegram...");
  
  // Если сессия есть, пробуем подключиться по ней
  if (process.env.TELEGRAM_SESSION) {
    try {
      await telegramClient.connect();
      log("INFO", "✅ Telegram подключен по сохраненной сессии");
      return;
    } catch (error) {
      log("WARN", "❌ Не удалось подключиться по сессии, требуется новая авторизация");
    }
  }
  
  // Если сессии нет или она не работает, запрашиваем авторизацию
  try {
    await telegramClient.start({
      phoneNumber: process.env.TELEGRAM_PHONE_NUMBER,
      phoneCode: async () => {
        const code = await askQuestion("📲 Введите код из Telegram: ");
        return code;
      },
      password: async () => {
        const password = await askQuestion("🔒 Введите пароль (если есть, иначе Enter): ");
        return password || undefined;
      },
      onError: (err) => log("ERROR", `❌ Ошибка Telegram: ${err.message}`)
    });
    
    log("INFO", "✅ Telegram подключен");
    
    // Сохраняем сессию для будущего использования
    const sessionString = telegramClient.session.save();
    console.log("\n💾 СЕССИЯ ДЛЯ ОБЛАКА:");
    console.log("TELEGRAM_SESSION=" + sessionString);
    console.log("💡 Скопируйте эту строку и добавьте в переменные окружения Render!\n");
    
  } catch (error) {
    log("ERROR", `❌ Ошибка подключения Telegram: ${error.message}`);
    process.exit(1);
  }
}

async function sendNewsToDiscord(mapping, message) {
  try {
    const channel = await discordClient.channels.fetch(mapping.discordChannelId);
    const messageText = message.message || "";
    
    if (!messageText && !message.media) {
      log("DEBUG", `⏭️ Пустое сообщение из ${mapping.name}`);
      return;
    }

    // Создаем уникальный ID сообщения (канал + ID + дата)
    const messageId = `${mapping.telegramChannel}_${message.id}_${Math.floor(message.date / 3600)}`;
    
    // Проверяем, не обрабатывали ли уже это сообщение
    if (processedMessages.has(messageId)) {
      log("DEBUG", `⏭️ Пропускаем уже обработанное сообщение: ${mapping.name} (ID: ${messageId})`);
      return;
    }

    // ОГРАНИЧИВАЕМ размер текста для Discord (2000 символов максимум)
    const limitedText = messageText.length > 2000 ? messageText.substring(0, 1997) + "..." : messageText;

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`📢 ${mapping.name}`)
      .setTimestamp(new Date(message.date * 1000))
      .setFooter({ text: `Источник: ${mapping.telegramChannel}` });

    // Добавляем текст если он есть
    if (limitedText) {
      embed.setDescription(limitedText);
    }

    // Обрабатываем медиафайлы с ограничениями
    let mediaBuffer = null;
    let mediaFilename = 'media';
    let hasMedia = false;

    if (message.media) {
      try {
        log("DEBUG", `📎 Обнаружено медиа в сообщении из ${mapping.telegramChannel}`);
        
        // Скачиваем медиафайл с прогрессивной проверкой размера
        mediaBuffer = await telegramClient.downloadMedia(message, {
          progress: (downloaded, total) => {
            // Прерываем если файл слишком большой
            if (downloaded > 8 * 1024 * 1024) {
              throw new Error('File too large during download');
            }
          }
        });
        
        // Проверяем размер файла после загрузки
        if (mediaBuffer && await isFileSizeValid(mediaBuffer)) {
          if (message.photo) {
            mediaFilename = `photo_${message.id}.jpg`;
            hasMedia = true;
            // Добавляем превью фото в embed
            embed.setImage(`attachment://${mediaFilename}`);
            log("DEBUG", `🖼️ Добавлено фото: ${mediaFilename}`);
          } else if (message.video) {
            mediaFilename = `video_${message.id}.mp4`;
            hasMedia = true;
            embed.addFields({ name: '🎥 Видео', value: 'Прикреплено видеофайл' });
            log("DEBUG", `🎥 Добавлено видео: ${mediaFilename}`);
          } else if (message.document) {
            const docName = message.document.attributes?.find(attr => attr.fileName)?.fileName || `file_${message.id}`;
            mediaFilename = docName;
            hasMedia = true;
            embed.addFields({ name: '📎 Файл', value: docName });
            log("DEBUG", `📎 Добавлен документ: ${mediaFilename}`);
          }
        } else {
          log("WARN", `📁 Файл слишком большой, отправляем без медиа: ${mapping.name}`);
          mediaBuffer = null;
        }

      } catch (mediaError) {
        if (mediaError.message.includes('too large')) {
          log("WARN", `⚠️ Файл слишком большой, пропускаем медиа в ${mapping.name}`);
        } else {
          log("ERROR", `❌ Ошибка загрузки медиа из ${mapping.telegramChannel}: ${mediaError.message}`);
        }
      }
    }

    // Отправляем сообщение
    if (hasMedia && mediaBuffer) {
      try {
        // Отправляем embed с медиафайлом
        const payload = { 
          embeds: [embed],
          files: [{ attachment: mediaBuffer, name: mediaFilename }]
        };
        await channel.send(payload);
        log("INFO", `✅ Отправлено в ${mapping.name} с медиафайлом`);
      } catch (mediaError) {
        if (mediaError.message.includes('Request entity too large')) {
          log("WARN", `⚠️ Медиафайл слишком большой, отправляем только текст в ${mapping.name}`);
          // Если файл слишком большой, отправляем только текст
          await channel.send({ embeds: [embed] });
        } else {
          throw mediaError;
        }
      }
    } else {
      // Отправляем только текст
      await channel.send({ embeds: [embed] });
      log("INFO", `✅ Отправлено в ${mapping.name}`);
    }
    
    // Добавляем в обработанные и сохраняем
    addToProcessedMessages(messageId);
    updateChannelTimestamp(mapping.telegramChannel, message.date);
    
    // Сохраняем данные на диск
    await saveProcessedMessages();
    await saveBotState();
    
    log("INFO", `✅ Успешно обработано: ${mapping.name} (ID: ${messageId})`);
    
  } catch (error) {
    if (error.message.includes('Request entity too large')) {
      log("WARN", `⚠️ Пропускаем большое сообщение в ${mapping.name}`);
    } else if (error.message.includes('Missing Access')) {
      log("ERROR", `❌ Нет доступа к Discord каналу: ${mapping.name}`);
    } else {
      log("ERROR", `❌ Ошибка отправки в ${mapping.name}: ${error.message}`);
    }
  }
}

async function checkTelegramChannels() {
  log("INFO", "🔍 Проверка каналов...");
  
  let newMessages = 0;
  let skippedMessages = 0;
  let errorChannels = 0;
  
  for (const mapping of channelMappings) {
    try {
      log("DEBUG", `📡 Проверяем: ${mapping.telegramChannel}`);
      const entity = await telegramClient.getEntity(mapping.telegramChannel);
      
      // Определяем лимит сообщений для проверки
      let limit = 5; // По умолчанию проверяем 5 последних
      const lastTimestamp = lastProcessedTimestamps[mapping.telegramChannel];
      
      // Если это первая проверка после запуска, проверяем больше сообщений
      if (!lastTimestamp) {
        limit = 10;
        log("DEBUG", `🆕 Первая проверка канала ${mapping.name}, проверяем ${limit} сообщений`);
      }
      
      const messages = await telegramClient.getMessages(entity, { limit });
      
      log("DEBUG", `📥 Найдено ${messages.length} сообщений в ${mapping.telegramChannel}`);
      
      // Фильтруем только новые сообщения
      const newMessagesList = messages.filter(message => {
        const messageId = `${mapping.telegramChannel}_${message.id}_${Math.floor(message.date / 3600)}`;
        return !processedMessages.has(messageId);
      });
      
      log("DEBUG", `🆕 Новых сообщений в ${mapping.name}: ${newMessagesList.length}`);
      
      for (const message of newMessagesList.reverse()) {
        const messageId = `${mapping.telegramChannel}_${message.id}_${Math.floor(message.date / 3600)}`;
        
        if (processedMessages.has(messageId)) {
          skippedMessages++;
          continue;
        }
        
        await sendNewsToDiscord(mapping, message);
        newMessages++;
        
        // Задержка между сообщениями чтобы не спамить
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      errorChannels++;
      log("ERROR", `❌ Ошибка канала ${mapping.telegramChannel}: ${error.message}`);
    }
  }
  
  log("INFO", `📊 Итог: новых - ${newMessages}, пропущено - ${skippedMessages}, ошибок - ${errorChannels}`);
}

// Обработчики ошибок
process.on('unhandledRejection', (error) => {
  log("ERROR", `❌ Необработанная ошибка: ${error.message}`);
  log("DEBUG", error.stack);
});

process.on('uncaughtException', (error) => {
  log("ERROR", `❌ Непойманное исключение: ${error.message}`);
  log("DEBUG", error.stack);
  process.exit(1);
});

process.on('SIGINT', async () => {
  log("INFO", '🛑 Получен сигнал завершения...');
  await saveProcessedMessages();
  await saveBotState();
  if (!rl.closed) {
    rl.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log("INFO", '🛑 Получен SIGTERM...');
  await saveProcessedMessages();
  await saveBotState();
  if (!rl.closed) {
    rl.close();
  }
  process.exit(0);
});

// Запуск бота
async function startBot() {
  try {
    log("INFO", "🤖 Запуск бота...");
    
    // Загружаем историю обработанных сообщений и состояние
    processedMessages = await loadProcessedMessages();
    const botState = await loadBotState();
    lastProcessedTimestamps = botState.lastTimestamps || {};
    
    log("INFO", `📊 Состояние загружено: ${processedMessages.size} сообщений, ${Object.keys(lastProcessedTimestamps).length} каналов`);
    
    // Запускаем HTTP-сервер ДО подключения ботов
    startHealthServer();
    
    await discordClient.login(process.env.DISCORD_TOKEN);
    log("INFO", `✅ Discord подключен: ${discordClient.user.tag}`);
    
    await connectTelegram();
    
    // Закрываем интерфейс ввода после успешной авторизации
    if (!rl.closed) {
      rl.close();
    }
    
    // Первая проверка
    await checkTelegramChannels();
    
    // Планировщик - проверка каждые 5 минут
    cron.schedule('*/5 * * * *', () => {
      log("INFO", "🕒 Плановая проверка...");
      checkTelegramChannels();
    });

    // Автосохранение каждые 30 секунд
    setInterval(async () => {
      await saveProcessedMessages();
      await saveBotState();
      log("DEBUG", `💾 Автосохранение: ${processedMessages.size} сообщений, ${Object.keys(lastProcessedTimestamps).length} каналов`);
    }, 30000);
    
    // Очистка старых сообщений каждый час (сохраняем только последние 2000)
    setInterval(async () => {
      if (processedMessages.size > 2000) {
        const toRemove = processedMessages.size - 1500;
        const array = [...processedMessages];
        for (let i = 0; i < toRemove; i++) {
          processedMessages.delete(array[i]);
        }
        log("INFO", `🧹 Очищено ${toRemove} старых сообщений из кэша`);
        await saveProcessedMessages();
      }
    }, 3600000);
    
    log("INFO", "🔄 Бот запущен! Проверка каждые 5 минут.");
    log("INFO", "💾 Состояние сохраняется между перезапусками");
    
  } catch (error) {
    log("ERROR", `❌ Ошибка запуска: ${error.message}`);
    if (!rl.closed) {
      rl.close();
    }
    process.exit(1);
  }
}

startBot();