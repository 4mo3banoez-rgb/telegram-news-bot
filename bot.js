require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');

// Файлы для хранения данных
const PROCESSED_MESSAGES_FILE = path.join(__dirname, 'data', 'processed_messages.json');
const LAST_CHECK_TIME_FILE = path.join(__dirname, 'data', 'last_check_time.json');

// Создаем папку data если не существует
async function ensureDataDirectory() {
  try {
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    console.log("📁 Папка data создана/проверена");
  } catch (error) {
    console.log("⚠️ Не удалось создать папку data:", error.message);
  }
}

// Хранилище для обработанных сообщений
let processedMessages = new Set();
let lastCheckTime = Date.now() / 1000 - 3600; // 1 час назад по умолчанию

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

const telegramClient = new TelegramClient(
  new StringSession(process.env.TELEGRAM_SESSION || ""),
  parseInt(process.env.TELEGRAM_API_ID),
  process.env.TELEGRAM_API_HASH,
  { 
    connectionRetries: 3,
    useWSS: false,
    baseLogger: {
      log: () => {} // Полностью отключаем логи Telegram
    }
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
      uptime: `${Math.floor(process.uptime())}s`,
      last_check: new Date(lastCheckTime * 1000).toISOString()
    };
    
    res.end(JSON.stringify(status, null, 2));
  });

  const port = process.env.PORT || 10000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`✅ Health check server running on port ${port}`);
  });
  
  return server;
}

// Загружаем обработанные сообщения
async function loadProcessedMessages() {
  try {
    await ensureDataDirectory();
    const data = await fs.readFile(PROCESSED_MESSAGES_FILE, 'utf8');
    const messagesArray = JSON.parse(data);
    console.log(`📁 Загружено ${messagesArray.length} обработанных сообщений`);
    return new Set(messagesArray);
  } catch (error) {
    console.log('📁 Файл с обработанных сообщений не найден, создаем новый');
    return new Set();
  }
}

// Загружаем время последней проверки
async function loadLastCheckTime() {
  try {
    await ensureDataDirectory();
    const data = await fs.readFile(LAST_CHECK_TIME_FILE, 'utf8');
    const timeData = JSON.parse(data);
    console.log(`📁 Последняя проверка: ${new Date(timeData.lastCheckTime * 1000).toISOString()}`);
    return timeData.lastCheckTime;
  } catch (error) {
    console.log('📁 Файл времени проверки не найден, используем текущее время');
    return Date.now() / 1000 - 3600; // 1 час назад
  }
}

// Сохраняем обработанные сообщения
async function saveProcessedMessages() {
  try {
    await ensureDataDirectory();
    const data = JSON.stringify([...processedMessages]);
    await fs.writeFile(PROCESSED_MESSAGES_FILE, data, 'utf8');
  } catch (error) {
    console.error('❌ Ошибка сохранения сообщений:', error.message);
  }
}

// Сохраняем время последней проверки
async function saveLastCheckTime() {
  try {
    await ensureDataDirectory();
    const data = JSON.stringify({ lastCheckTime });
    await fs.writeFile(LAST_CHECK_TIME_FILE, data, 'utf8');
  } catch (error) {
    console.error('❌ Ошибка сохранения времени:', error.message);
  }
}

// Улучшенная загрузка медиа с таймаутом
async function downloadMediaSafe(message, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Таймаут загрузки медиа`));
    }, timeoutMs);

    telegramClient.downloadMedia(message, {
      limit: 3 * 1024 * 1024, // 3MB максимум
    })
    .then(mediaBuffer => {
      clearTimeout(timeout);
      resolve(mediaBuffer);
    })
    .catch(error => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function connectTelegram() {
  console.log("🔑 Подключаемся к Telegram...");
  
  if (!process.env.TELEGRAM_SESSION) {
    console.log("❌ TELEGRAM_SESSION не установлен!");
    return false;
  }
  
  try {
    await telegramClient.connect();
    console.log("✅ Telegram подключен");
    return true;
  } catch (error) {
    console.log("❌ Ошибка подключения Telegram:", error.message);
    return false;
  }
}

async function sendNewsToDiscord(mapping, message) {
  try {
    const channel = await discordClient.channels.fetch(mapping.discordChannelId);
    const messageText = message.message || "";
    
    if (!messageText && !message.media) {
      console.log(`⏭️ Пустое сообщение из ${mapping.name}`);
      return;
    }

    // Создаем уникальный ID сообщения
    const messageId = `${mapping.telegramChannel}_${message.id}`;
    
    // Проверяем, не обрабатывали ли уже это сообщение
    if (processedMessages.has(messageId)) {
      console.log(`⏭️ Пропускаем уже обработанное сообщение: ${mapping.name}`);
      return;
    }

    // Ограничиваем текст
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

    // Безопасная обработка медиафайлов
    let mediaBuffer = null;
    let hasMedia = false;

    if (message.media) {
      try {
        console.log(`📎 Пытаемся загрузить медиа из ${mapping.name}`);
        
        // Пробуем загрузить медиа с таймаутом
        mediaBuffer = await downloadMediaSafe(message, 5000);
        
        if (mediaBuffer && mediaBuffer.length > 0 && mediaBuffer.length < 8 * 1024 * 1024) {
          hasMedia = true;
          
          // Определяем тип медиа
          if (message.photo) {
            embed.setImage('attachment://photo.jpg');
          } else if (message.video) {
            embed.addFields({ name: '🎥 Видео', value: 'Прикреплено видео' });
          } else if (message.document) {
            const docName = message.document.attributes?.find(attr => attr.fileName)?.fileName || 'файл';
            embed.addFields({ name: '📎 Документ', value: docName });
          }
        }
      } catch (mediaError) {
        console.log(`⚠️ Не удалось загрузить медиа из ${mapping.name}`);
        // Продолжаем без медиа
      }
    }

    // Отправляем сообщение
    try {
      if (hasMedia && mediaBuffer) {
        let filename = 'media';
        if (message.photo) filename = 'photo.jpg';
        else if (message.video) filename = 'video.mp4';
        
        await channel.send({ 
          embeds: [embed],
          files: [{ attachment: mediaBuffer, name: filename }]
        });
        console.log(`✅ Отправлено в ${mapping.name} с медиа`);
      } else {
        await channel.send({ embeds: [embed] });
        console.log(`✅ Отправлено в ${mapping.name} (текст)`);
      }
      
      // Добавляем в обработанные
      processedMessages.add(messageId);
      
    } catch (error) {
      if (error.message.includes('Request entity too large')) {
        console.log(`⚠️ Файл слишком большой для Discord, отправляем без медиа в ${mapping.name}`);
        await channel.send({ embeds: [embed] });
      } else {
        console.log(`❌ Ошибка отправки в ${mapping.name}: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Ошибка в ${mapping.name}: ${error.message}`);
  }
}

async function checkTelegramChannels() {
  console.log("🔍 Начинаем проверку каналов...");
  
  let newMessages = 0;
  let skippedMessages = 0;
  let errorChannels = 0;
  
  // Сохраняем время начала проверки
  const currentCheckTime = Date.now() / 1000;
  
  for (const mapping of channelMappings) {
    try {
      console.log(`📡 Проверяем: ${mapping.telegramChannel}`);
      const entity = await telegramClient.getEntity(mapping.telegramChannel);
      
      // Получаем сообщения с момента последней проверки
      const messages = await telegramClient.getMessages(entity, {
        limit: 10,
        offsetDate: lastCheckTime
      });
      
      console.log(`📥 Найдено ${messages.length} новых сообщений в ${mapping.telegramChannel}`);
      
      // СОРТИРУЕМ по дате (старые первыми)
      const sortedMessages = messages.sort((a, b) => a.date - b.date);
      
      for (const message of sortedMessages) {
        const messageId = `${mapping.telegramChannel}_${message.id}`;
        
        if (processedMessages.has(messageId)) {
          skippedMessages++;
          continue;
        }
        
        await sendNewsToDiscord(mapping, message);
        newMessages++;
        
        // Задержка между сообщениями
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      errorChannels++;
      console.log(`❌ Ошибка канала ${mapping.telegramChannel}: ${error.message}`);
    }
  }
  
  // Обновляем время последней проверки
  lastCheckTime = currentCheckTime;
  await saveLastCheckTime();
  await saveProcessedMessages();
  
  console.log(`📊 Итог: новых - ${newMessages}, пропущено - ${skippedMessages}, ошибок - ${errorChannels}`);
  console.log(`⏰ Следующая проверка с: ${new Date(lastCheckTime * 1000).toISOString()}`);
}

// Обработчики ошибок
process.on('unhandledRejection', (error) => {
  console.log('❌ Необработанная ошибка:', error.message);
});

process.on('uncaughtException', (error) => {
  console.log('❌ Непойманное исключение:', error.message);
});

// Запуск бота
async function startBot() {
  try {
    console.log("🤖 Запуск бота...");
    
    // Загружаем историю
    processedMessages = await loadProcessedMessages();
    lastCheckTime = await loadLastCheckTime();
    
    // Запускаем HTTP-сервер
    startHealthServer();
    
    // Подключаем Discord
    await discordClient.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Discord подключен: ${discordClient.user.tag}`);
    
    // Подключаем Telegram
    const telegramConnected = await connectTelegram();
    
    if (!telegramConnected) {
      console.log("⏸️ Telegram не подключен, работаем только в режиме ожидания");
      return;
    }
    
    // Первая проверка через 5 секунд
    setTimeout(async () => {
      await checkTelegramChannels();
    }, 5000);
    
    // Планировщик - проверка каждые 2 минуты (чаще для тестирования)
    cron.schedule('*/2 * * * *', () => {
      console.log("🕒 Плановая проверка...");
      checkTelegramChannels();
    });

    // Автосохранение каждые 30 секунд
    setInterval(async () => {
      await saveProcessedMessages();
    }, 30000);
    
    console.log("🔄 Бот запущен! Проверка каждые 2 минуты.");
    console.log("🕒 Отслеживаем сообщения с:", new Date(lastCheckTime * 1000).toISOString());
    
  } catch (error) {
    console.log('❌ Ошибка запуска:', error.message);
  }
}

startBot();