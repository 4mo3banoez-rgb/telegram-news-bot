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
    // Фильтруем только важные логи
    baseLogger: {
      log: (level, message) => {
        // Игнорируем спам-логи загрузки файлов
        if (message.includes('upload.GetFile') || message.includes('MsgsAck') || message.includes('Waiting for messages')) {
          return;
        }
        if (level === 'error') {
          console.log(`[TG_ERROR] ${message}`);
        } else if (level === 'warn') {
          console.log(`[TG_WARN] ${message}`);
        }
      }
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
      uptime: `${Math.floor(process.uptime())}s`
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

// Сохраняем обработанные сообщения
async function saveProcessedMessages() {
  try {
    await ensureDataDirectory();
    const data = JSON.stringify([...processedMessages]);
    await fs.writeFile(PROCESSED_MESSAGES_FILE, data, 'utf8');
  } catch (error) {
    console.error('❌ Ошибка сохранения:', error.message);
  }
}

// Улучшенная загрузка медиа с таймаутом
async function downloadMediaSafe(message, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Таймаут загрузки медиа (${timeoutMs}ms)`));
    }, timeoutMs);

    telegramClient.downloadMedia(message, {
      limit: 5 * 1024 * 1024, // 5MB максимум
      progress: (downloaded, total) => {
        // Отменяем если файл слишком большой
        if (downloaded > 5 * 1024 * 1024) {
          clearTimeout(timeout);
          reject(new Error('Файл слишком большой (>5MB)'));
        }
      }
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
    const messageId = `${mapping.telegramChannel}_${message.id}_${Math.floor(message.date / 3600)}`;
    
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
    let mediaInfo = '';

    if (message.media) {
      try {
        console.log(`📎 Пытаемся загрузить медиа из ${mapping.name}`);
        
        // Пробуем загрузить медиа с таймаутом
        mediaBuffer = await downloadMediaSafe(message, 8000);
        
        if (mediaBuffer && mediaBuffer.length > 0 && mediaBuffer.length < 8 * 1024 * 1024) {
          hasMedia = true;
          
          // Определяем тип медиа
          if (message.photo) {
            embed.setImage('attachment://photo.jpg');
            mediaInfo = '🖼️ Фото';
          } else if (message.video) {
            embed.addFields({ name: '🎥 Видео', value: 'Прикреплено видео' });
            mediaInfo = '🎥 Видео';
          } else if (message.document) {
            const docName = message.document.attributes?.find(attr => attr.fileName)?.fileName || 'файл';
            embed.addFields({ name: '📎 Документ', value: docName });
            mediaInfo = `📎 ${docName}`;
          }
          
          console.log(`✅ Медиа загружено: ${mediaInfo} (${(mediaBuffer.length / 1024).toFixed(2)} KB)`);
        }
      } catch (mediaError) {
        console.log(`⚠️ Не удалось загрузить медиа из ${mapping.name}: ${mediaError.message}`);
        // Добавляем информацию о медиа в текст
        if (message.photo) {
          embed.addFields({ name: '🖼️', value: 'Фото (не удалось загрузить)' });
        } else if (message.video) {
          embed.addFields({ name: '🎥', value: 'Видео (не удалось загрузить)' });
        } else if (message.document) {
          embed.addFields({ name: '📎', value: 'Файл (не удалось загрузить)' });
        }
      }
    }

    // Отправляем сообщение
    try {
      if (hasMedia && mediaBuffer) {
        let filename = 'media';
        if (message.photo) filename = 'photo.jpg';
        else if (message.video) filename = 'video.mp4';
        else if (message.document) {
          const docName = message.document.attributes?.find(attr => attr.fileName)?.fileName || 'file';
          filename = docName;
        }
        
        await channel.send({ 
          embeds: [embed],
          files: [{ attachment: mediaBuffer, name: filename }]
        });
        console.log(`✅ Отправлено в ${mapping.name} с медиа (${mediaInfo})`);
      } else {
        await channel.send({ embeds: [embed] });
        console.log(`✅ Отправлено в ${mapping.name} (текст)`);
      }
      
      // Добавляем в обработанные
      processedMessages.add(messageId);
      await saveProcessedMessages();
      
    } catch (error) {
      if (error.message.includes('Request entity too large')) {
        console.log(`⚠️ Файл слишком большой для Discord, отправляем без медиа в ${mapping.name}`);
        // Пробуем отправить без медиа
        await channel.send({ embeds: [embed] });
      } else {
        throw error;
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
  
  for (const mapping of channelMappings) {
    try {
      console.log(`📡 Проверяем: ${mapping.telegramChannel}`);
      const entity = await telegramClient.getEntity(mapping.telegramChannel);
      
      // Проверяем только 2 последних сообщения
      const messages = await telegramClient.getMessages(entity, { limit: 2 });
      
      console.log(`📥 Найдено ${messages.length} сообщений в ${mapping.telegramChannel}`);
      
      for (const message of messages.reverse()) {
        const messageId = `${mapping.telegramChannel}_${message.id}_${Math.floor(message.date / 3600)}`;
        
        if (processedMessages.has(messageId)) {
          skippedMessages++;
          continue;
        }
        
        await sendNewsToDiscord(mapping, message);
        newMessages++;
        
        // Задержка между сообщениями
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (error) {
      errorChannels++;
      console.log(`❌ Ошибка канала ${mapping.telegramChannel}: ${error.message}`);
    }
  }
  
  console.log(`📊 Итог: новых - ${newMessages}, пропущено - ${skippedMessages}, ошибок - ${errorChannels}`);
}

// Обработчики ошибок
process.on('unhandledRejection', (error) => {
  console.log('❌ Необработанная ошибка:', error.message);
});

process.on('uncaughtException', (error) => {
  console.log('❌ Непойманное исключение:', error.message);
});

// Мониторинг памяти
setInterval(() => {
  const memoryUsage = process.memoryUsage();
  console.log(`🧠 Память: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
}, 60000);

// Запуск бота
async function startBot() {
  try {
    console.log("🤖 Запуск бота с поддержкой медиа...");
    
    // Загружаем историю
    processedMessages = await loadProcessedMessages();
    
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
    
    // Планировщик - проверка каждые 5 минут
    cron.schedule('*/5 * * * *', () => {
      console.log("🕒 Плановая проверка...");
      checkTelegramChannels();
    });

    // Автосохранение каждые 30 секунд
    setInterval(async () => {
      await saveProcessedMessages();
    }, 30000);
    
    console.log("🔄 Бот запущен! Проверка каждые 5 минут.");
    console.log("✅ Медиафайлы включены с защитой от таймаутов");
    
  } catch (error) {
    console.log('❌ Ошибка запуска:', error.message);
  }
}

startBot();