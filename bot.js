require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');

// Файлы для хранения данных
const BOT_STATE_FILE = path.join(__dirname, 'data', 'bot_state.json');

// Создаем папку data если не существует
async function ensureDataDirectory() {
  try {
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    console.log("📁 Папка data создана/проверена");
  } catch (error) {
    console.log("⚠️ Не удалось создать папку data:", error.message);
  }
}

// Состояние бота
let botState = {
  processedMessages: {},
  lastMessageIds: {},
  lastCheckTime: Math.floor(Date.now() / 1000) - 300 // 5 минут назад
};

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
      log: () => {} // Отключаем логи Telegram
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
      processed_messages: Object.keys(botState.processedMessages).length,
      channels_monitored: channelMappings.length,
      memory_usage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      uptime: `${Math.floor(process.uptime())}s`,
      last_check: new Date(botState.lastCheckTime * 1000).toISOString()
    };
    
    res.end(JSON.stringify(status, null, 2));
  });

  const port = process.env.PORT || 10000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`✅ Health check server running on port ${port}`);
  });
  
  return server;
}

// Загружаем состояние бота
async function loadBotState() {
  try {
    await ensureDataDirectory();
    const data = await fs.readFile(BOT_STATE_FILE, 'utf8');
    const savedState = JSON.parse(data);
    console.log(`📁 Загружено состояние: ${Object.keys(savedState.processedMessages || {}).length} сообщений`);
    
    // Миграция старых данных
    if (Array.isArray(savedState.processedMessages)) {
      const newProcessed = {};
      savedState.processedMessages.forEach(msgId => {
        newProcessed[msgId] = true;
      });
      savedState.processedMessages = newProcessed;
    }
    
    return {
      processedMessages: savedState.processedMessages || {},
      lastMessageIds: savedState.lastMessageIds || {},
      lastCheckTime: savedState.lastCheckTime || Math.floor(Date.now() / 1000) - 300
    };
  } catch (error) {
    console.log('📁 Файл состояния не найден, создаем новый');
    return {
      processedMessages: {},
      lastMessageIds: {},
      lastCheckTime: Math.floor(Date.now() / 1000) - 300
    };
  }
}

// Сохраняем состояние бота
async function saveBotState() {
  try {
    await ensureDataDirectory();
    
    // Очищаем старые записи (храним только последние 1000 сообщений)
    const messageKeys = Object.keys(botState.processedMessages);
    if (messageKeys.length > 1000) {
      const toRemove = messageKeys.slice(0, messageKeys.length - 1000);
      toRemove.forEach(key => {
        delete botState.processedMessages[key];
      });
      console.log(`🧹 Очищено ${toRemove.length} старых сообщений`);
    }
    
    const data = JSON.stringify(botState, null, 2);
    await fs.writeFile(BOT_STATE_FILE, data, 'utf8');
  } catch (error) {
    console.error('❌ Ошибка сохранения состояния:', error.message);
  }
}

// Улучшенная загрузка медиа с таймаутом
async function downloadMediaSafe(message, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Таймаут загрузки медиа`));
    }, timeoutMs);

    telegramClient.downloadMedia(message, {
      limit: 3 * 1024 * 1024,
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
      return;
    }

    // Создаем уникальный ID сообщения
    const messageId = `${mapping.telegramChannel}_${message.id}`;
    
    // Проверяем, не обрабатывали ли уже это сообщение
    if (botState.processedMessages[messageId]) {
      return;
    }

    // Ограничиваем текст
    const limitedText = messageText.length > 2000 ? messageText.substring(0, 1997) + "..." : messageText;

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`📢 ${mapping.name}`)
      .setTimestamp(new Date(message.date * 1000))
      .setFooter({ text: `Источник: ${mapping.telegramChannel}` });

    if (limitedText) {
      embed.setDescription(limitedText);
    }

    // Обработка медиа
    let mediaBuffer = null;
    let hasMedia = false;

    if (message.media) {
      try {
        mediaBuffer = await downloadMediaSafe(message, 5000);
        
        if (mediaBuffer && mediaBuffer.length > 0 && mediaBuffer.length < 8 * 1024 * 1024) {
          hasMedia = true;
          
          if (message.photo) {
            embed.setImage('attachment://photo.jpg');
          } else if (message.video) {
            embed.addFields({ name: '🎥 Видео', value: 'Прикреплено видео' });
          }
        }
      } catch (mediaError) {
        // Продолжаем без медиа
      }
    }

    // Отправляем сообщение
    try {
      if (hasMedia && mediaBuffer) {
        let filename = message.photo ? 'photo.jpg' : 'video.mp4';
        await channel.send({ 
          embeds: [embed],
          files: [{ attachment: mediaBuffer, name: filename }]
        });
      } else {
        await channel.send({ embeds: [embed] });
      }
      
      // ОТМЕЧАЕМ КАК ОБРАБОТАННОЕ ПЕРЕД СОХРАНЕНИЕМ
      botState.processedMessages[messageId] = true;
      botState.lastMessageIds[mapping.telegramChannel] = message.id;
      
      console.log(`✅ Отправлено в ${mapping.name} (ID: ${message.id})`);
      
    } catch (error) {
      if (error.message.includes('Request entity too large')) {
        await channel.send({ embeds: [embed] });
      }
    }
    
  } catch (error) {
    console.log(`❌ Ошибка в ${mapping.name}: ${error.message}`);
  }
}

async function checkTelegramChannels() {
  console.log("🔍 Начинаем проверку каналов...");
  
  const currentCheckTime = Math.floor(Date.now() / 1000);
  let newMessages = 0;
  let totalMessages = 0;
  
  for (const mapping of channelMappings) {
    try {
      console.log(`📡 Проверяем: ${mapping.telegramChannel}`);
      const entity = await telegramClient.getEntity(mapping.telegramChannel);
      
      // Получаем только последние 5 сообщений
      const messages = await telegramClient.getMessages(entity, { limit: 5 });
      
      console.log(`📥 Найдено ${messages.length} сообщений в ${mapping.telegramChannel}`);
      
      // СОРТИРУЕМ по дате (старые первыми)
      const sortedMessages = messages.sort((a, b) => a.date - b.date);
      
      for (const message of sortedMessages) {
        totalMessages++;
        const messageId = `${mapping.telegramChannel}_${message.id}`;
        
        // Пропускаем если уже обработано
        if (botState.processedMessages[messageId]) {
          continue;
        }
        
        // Отправляем только если сообщение новее последней проверки
        if (message.date > botState.lastCheckTime - 600) { // 10 минут запас
          await sendNewsToDiscord(mapping, message);
          newMessages++;
          
          // Задержка между сообщениями
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }
    } catch (error) {
      console.log(`❌ Ошибка канала ${mapping.telegramChannel}: ${error.message}`);
    }
  }
  
  // ОБНОВЛЯЕМ ВРЕМЯ ПОСЛЕ УСПЕШНОЙ ПРОВЕРКИ
  botState.lastCheckTime = currentCheckTime;
  
  // СОХРАНЯЕМ СОСТОЯНИЕ
  await saveBotState();
  
  console.log(`📊 Итог: новых - ${newMessages}, всего - ${totalMessages}`);
  console.log(`⏰ Следующая проверка с: ${new Date(botState.lastCheckTime * 1000).toISOString()}`);
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
    
    // Загружаем состояние
    botState = await loadBotState();
    
    // Запускаем HTTP-сервер
    startHealthServer();
    
    // Подключаем Discord
    await discordClient.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Discord подключен: ${discordClient.user.tag}`);
    
    // Подключаем Telegram
    const telegramConnected = await connectTelegram();
    
    if (!telegramConnected) {
      console.log("⏸️ Telegram не подключен");
      return;
    }
    
    // Первая проверка
    setTimeout(async () => {
      await checkTelegramChannels();
    }, 3000);
    
    // Планировщик - проверка каждые 3 минуты
    cron.schedule('*/3 * * * *', async () => {
      console.log("🕒 Плановая проверка...");
      await checkTelegramChannels();
    });

    // Автосохранение каждую минуту
    setInterval(async () => {
      await saveBotState();
    }, 60000);
    
    console.log("🔄 Бот запущен! Проверка каждые 3 минуты.");
    console.log(`📊 Обработано сообщений: ${Object.keys(botState.processedMessages).length}`);
    console.log(`🕒 Отслеживаем с: ${new Date(botState.lastCheckTime * 1000).toISOString()}`);
    
  } catch (error) {
    console.log('❌ Ошибка запуска:', error.message);
  }
}

startBot();