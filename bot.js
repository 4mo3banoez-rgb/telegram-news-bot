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

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Проверка обязательных переменных
console.log("🚀 Проверка переменных окружения...");
const requiredEnvVars = ['DISCORD_TOKEN', 'TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_PHONE_NUMBER'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Ошибка: Отсутствует переменная окружения ${envVar}`);
    process.exit(1);
  }
}
console.log('✅ Все переменные окружения загружены');

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
const processedMessages = new Set();

const telegramClient = new TelegramClient(
  new StringSession(process.env.TELEGRAM_SESSION || ""),
  parseInt(process.env.TELEGRAM_API_ID),
  process.env.TELEGRAM_API_HASH,
  { connectionRetries: 5 }
);

// HTTP-сервер для Render
function startHealthServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🤖 Telegram-Discord Bot is running!\n\nСтатус: Активен\nПроверка каналов: каждые 5 минут');
  });

  const port = process.env.PORT || 10000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`✅ Health check server running on port ${port}`);
  });
  
  return server;
}

async function connectTelegram() {
  console.log("🔑 Подключаемся к Telegram...");
  
  // Если сессия есть, пробуем подключиться по ней
  if (process.env.TELEGRAM_SESSION) {
    try {
      await telegramClient.connect();
      console.log("✅ Telegram подключен по сохраненной сессии");
      return;
    } catch (error) {
      console.log("❌ Не удалось подключиться по сессии, требуется новая авторизация");
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
      onError: (err) => console.log("❌ Ошибка Telegram:", err)
    });
    
    console.log("✅ Telegram подключен");
    
    // Сохраняем сессию для будущего использования
    const sessionString = telegramClient.session.save();
    console.log("💾 СЕССИЯ ДЛЯ ОБЛАКА:");
    console.log("TELEGRAM_SESSION=" + sessionString);
    console.log("💡 Скопируйте эту строку и добавьте в переменные окружения Render!");
    
  } catch (error) {
    console.error("❌ Ошибка подключения Telegram:", error.message);
    process.exit(1);
  }
}

async function sendNewsToDiscord(mapping, message) {
  try {
    const channel = await discordClient.channels.fetch(mapping.discordChannelId);
    const messageText = message.message || "";
    
    if (!messageText) return;

    // Создаем уникальный ID сообщения
    const messageId = `${mapping.telegramChannel}_${message.id}_${Math.floor(message.date / 3600)}`;
    
    // Проверяем, не обрабатывали ли уже это сообщение
    if (processedMessages.has(messageId)) {
      console.log(`⏭️ Пропускаем уже обработанное сообщение: ${mapping.name}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`📢 ${mapping.name}`)
      .setDescription(messageText.length > 4096 ? messageText.substring(0, 4093) + "..." : messageText)
      .setTimestamp(new Date(message.date * 1000))
      .setFooter({ text: `Источник: ${mapping.telegramChannel}` });

    // Обрабатываем медиафайлы
    let mediaBuffer = null;
    let mediaFilename = 'media';

    if (message.media) {
      try {
        console.log(`📎 Обнаружено медиа в сообщении из ${mapping.telegramChannel}`);
        mediaBuffer = await telegramClient.downloadMedia(message, {});
        
        if (message.photo) {
          mediaFilename = `photo_${message.id}.jpg`;
        } else if (message.video) {
          mediaFilename = `video_${message.id}.mp4`;
        }
      } catch (mediaError) {
        console.error(`❌ Ошибка загрузки медиа:`, mediaError.message);
      }
    }

    const payload = { embeds: [embed] };
    if (mediaBuffer) {
      payload.files = [{ attachment: mediaBuffer, name: mediaFilename }];
    }

    await channel.send(payload);
    
    // Добавляем в обработанные
    processedMessages.add(messageId);
    console.log(`✅ Отправлено в ${mapping.name}`);
    
  } catch (error) {
    console.error(`❌ Ошибка отправки в ${mapping.name}:`, error.message);
  }
}

async function checkTelegramChannels() {
  console.log("🔍 Проверка каналов...");
  
  let newMessages = 0;
  let skippedMessages = 0;
  
  for (const mapping of channelMappings) {
    try {
      console.log(`📡 Проверяем: ${mapping.telegramChannel}`);
      const entity = await telegramClient.getEntity(mapping.telegramChannel);
      const messages = await telegramClient.getMessages(entity, { limit: 5 });
      
      console.log(`📥 Найдено ${messages.length} сообщений в ${mapping.telegramChannel}`);
      
      for (const message of messages.reverse()) {
        const messageId = `${mapping.telegramChannel}_${message.id}_${Math.floor(message.date / 3600)}`;
        
        if (processedMessages.has(messageId)) {
          skippedMessages++;
          continue;
        }
        
        await sendNewsToDiscord(mapping, message);
        newMessages++;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`❌ Ошибка канала ${mapping.telegramChannel}:`, error.message);
    }
  }
  
  console.log(`📊 Итог: новых - ${newMessages}, пропущено - ${skippedMessages}`);
}

// Обработчики ошибок
process.on('unhandledRejection', (error) => {
  console.error('❌ Необработанная ошибка:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Непойманное исключение:', error);
});

process.on('SIGINT', () => {
  console.log('🛑 Получен сигнал завершения...');
  rl.close();
  process.exit(0);
});

// Запуск бота
async function startBot() {
  try {
    console.log("🤖 Запуск бота...");
    
    // Запускаем HTTP-сервер ДО подключения ботов
    startHealthServer();
    
    await discordClient.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Discord подключен: ${discordClient.user.tag}`);
    
    await connectTelegram();
    
    // Закрываем интерфейс ввода после успешной авторизации
    rl.close();
    
    // Первая проверка
    await checkTelegramChannels();
    
    // Планировщик
    cron.schedule('*/5 * * * *', () => {
      console.log("🕒 Плановая проверка...");
      checkTelegramChannels();
    });
    
    console.log("🔄 Бот запущен! Проверка каждые 5 минут.");
    
  } catch (error) {
    console.error('❌ Ошибка запуска:', error);
    rl.close();
    process.exit(1);
  }
}

startBot();