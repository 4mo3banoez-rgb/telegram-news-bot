require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');

// Файл для хранения состояния
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
  lastGlobalTime: Math.floor(Date.now() / 1000) - 3600, // 1 час назад
  processedMessages: {} // messageId -> true
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
      channels_monitored: channelMappings.length,
      memory_usage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      uptime: `${Math.floor(process.uptime())}s`,
      last_global_time: new Date(botState.lastGlobalTime * 1000).toISOString()
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
    const state = JSON.parse(data);
    console.log(`📁 Загружено состояние, последнее время: ${new Date(state.lastGlobalTime * 1000).toISOString()}`);
    return state;
  } catch (error) {
    console.log('📁 Файл состояния не найден, создаем новый');
    return {
      lastGlobalTime: Math.floor(Date.now() / 1000) - 3600,
      processedMessages: {}
    };
  }
}

// Сохраняем состояние бота
async function saveBotState() {
  try {
    await ensureDataDirectory();
    const data = JSON.stringify(botState, null, 2);
    await fs.writeFile(BOT_STATE_FILE, data, 'utf8');
    console.log(`💾 Сохранено состояние, обработано сообщений: ${Object.keys(botState.processedMessages).length}`);
  } catch (error) {
    console.error('❌ Ошибка сохранения состояния:', error.message);
  }
}

// Загрузка медиа с таймаутом
async function downloadMediaSafe(message, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Таймаут'));
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

async function sendMessageToDiscord(mapping, message) {
  try {
    const channel = await discordClient.channels.fetch(mapping.discordChannelId);
    const messageText = message.message || "";
    
    if (!messageText && !message.media) {
      return false;
    }

    // Ограничиваем текст
    const limitedText = messageText.length > 2000 ? messageText.substring(0, 1997) + "..." : messageText;

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`📢 ${mapping.name}`)
      .setDescription(limitedText)
      .setTimestamp(new Date(message.date * 1000))
      .setFooter({ text: `Источник: ${mapping.telegramChannel}` });

    // Обработка медиа
    let mediaBuffer = null;
    let hasMedia = false;

    if (message.media && message.photo) {
      try {
        mediaBuffer = await downloadMediaSafe(message, 5000);
        
        if (mediaBuffer && mediaBuffer.length > 0 && mediaBuffer.length < 8 * 1024 * 1024) {
          hasMedia = true;
          embed.setImage('attachment://photo.jpg');
        }
      } catch (mediaError) {
        // Продолжаем без медиа
      }
    }

    // Отправляем сообщение
    try {
      if (hasMedia && mediaBuffer) {
        await channel.send({ 
          embeds: [embed],
          files: [{ attachment: mediaBuffer, name: 'photo.jpg' }]
        });
      } else {
        await channel.send({ embeds: [embed] });
      }
      
      const messageTime = new Date(message.date * 1000).toLocaleTimeString();
      console.log(`✅ ${mapping.name} - ${messageTime}`);
      return true;
      
    } catch (error) {
      console.log(`❌ Ошибка отправки: ${mapping.name} - ${error.message}`);
      return false;
    }
    
  } catch (error) {
    console.log(`❌ Ошибка: ${mapping.name} - ${error.message}`);
    return false;
  }
}

async function checkTelegramChannels() {
  console.log("🔍 Начинаем проверку каналов...");
  console.log(`⏰ Ищем сообщения после: ${new Date(botState.lastGlobalTime * 1000).toISOString()}`);
  
  const allMessages = [];
  let maxMessageTime = botState.lastGlobalTime;

  // 1. Собираем ВСЕ сообщения после последнего глобального времени
  for (const mapping of channelMappings) {
    try {
      const entity = await telegramClient.getEntity(mapping.telegramChannel);
      
      // Получаем сообщения после последнего глобального времени
      const messages = await telegramClient.getMessages(entity, {
        limit: 20, // Больше сообщений для лучшего перемешивания
        offsetDate: botState.lastGlobalTime
      });
      
      console.log(`📥 ${mapping.name}: ${messages.length} новых сообщений`);
      
      for (const message of messages) {
        // Проверяем что сообщение новое и не пустое
        const messageId = `${mapping.telegramChannel}_${message.id}`;
        
        if (!botState.processedMessages[messageId] && (message.message || message.media)) {
          allMessages.push({
            mapping: mapping,
            message: message,
            timestamp: message.date
          });
          
          // Обновляем максимальное время
          if (message.date > maxMessageTime) {
            maxMessageTime = message.date;
          }
        }
      }
    } catch (error) {
      console.log(`❌ Ошибка канала ${mapping.telegramChannel}: ${error.message}`);
    }
  }
  
  if (allMessages.length === 0) {
    console.log("⏭️ Новых сообщений нет");
    return;
  }
  
  // 2. СОРТИРУЕМ по времени (от старых к новым) - ВАЖНО!
  allMessages.sort((a, b) => a.timestamp - b.timestamp);
  
  console.log(`🔄 Найдено ${allMessages.length} новых сообщений, отправляем в хронологическом порядке:`);
  
  // 3. Отправляем в правильном порядке
  let sentCount = 0;
  for (const item of allMessages) {
    const messageId = `${item.mapping.telegramChannel}_${item.message.id}`;
    const messageTime = new Date(item.timestamp * 1000).toLocaleTimeString();
    
    console.log(`   📨 ${item.mapping.name} - ${messageTime}`);
    
    const success = await sendMessageToDiscord(item.mapping, item.message);
    
    if (success) {
      sentCount++;
      // Помечаем как обработанное
      botState.processedMessages[messageId] = true;
      
      // Задержка между сообщениями
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // 4. Обновляем глобальное время только если нашли новые сообщения
  if (maxMessageTime > botState.lastGlobalTime) {
    botState.lastGlobalTime = maxMessageTime;
  }
  
  // 5. Сохраняем состояние
  await saveBotState();
  
  console.log(`🎉 Успешно отправлено ${sentCount} сообщений`);
  console.log(`⏰ Теперь отслеживаем с: ${new Date(botState.lastGlobalTime * 1000).toISOString()}`);
}

// Очистка старых processedMessages (чтобы файл не рос бесконечно)
function cleanupProcessedMessages() {
  const messageIds = Object.keys(botState.processedMessages);
  if (messageIds.length > 5000) {
    // Оставляем только последние 3000 сообщений
    const toDelete = messageIds.slice(0, messageIds.length - 3000);
    toDelete.forEach(id => {
      delete botState.processedMessages[id];
    });
    console.log(`🧹 Очищено ${toDelete.length} старых записей`);
  }
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
    
    // Первая проверка через 5 секунд
    setTimeout(async () => {
      await checkTelegramChannels();
    }, 5000);
    
    // Планировщик - проверка каждые 2 минуты
    cron.schedule('*/2 * * * *', async () => {
      console.log("🕒 Плановая проверка...");
      cleanupProcessedMessages();
      await checkTelegramChannels();
    });

    // Автосохранение каждую минуту
    setInterval(async () => {
      await saveBotState();
    }, 60000);
    
    console.log("🔄 Бот запущен! Проверка каждые 2 минуты.");
    console.log(`📊 Отслеживаем ${channelMappings.length} каналов`);
    
  } catch (error) {
    console.log('❌ Ошибка запуска:', error.message);
    process.exit(1);
  }
}

startBot();