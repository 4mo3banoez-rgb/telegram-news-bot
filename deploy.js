const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

async function checkDependencies() {
  console.log('🔍 Проверяем установленные зависимости...');
  
  try {
    execSync('node --version', { stdio: 'inherit' });
    console.log('✅ Node.js установлен');
  } catch (error) {
    console.log('❌ Node.js не установлен. Установите с https://nodejs.org');
    process.exit(1);
  }
  
  try {
    execSync('npm --version', { stdio: 'inherit' });
    console.log('✅ NPM установлен');
  } catch (error) {
    console.log('❌ NPM не установлен');
    process.exit(1);
  }
  
  try {
    execSync('git --version', { stdio: 'inherit' });
    console.log('✅ Git установлен');
  } catch (error) {
    console.log('❌ Git не установлен. Установите с https://git-scm.com');
    process.exit(1);
  }
}

async function setupProject() {
  console.log('\n📁 Настраиваем проект...');
  
  // Создаем необходимые файлы если их нет
  const files = {
    'package.json': `{
  "name": "telegram-discord-news-bot",
  "version": "1.0.0",
  "description": "Autonomous bot for forwarding Telegram news to Discord",
  "main": "bot.js",
  "scripts": {
    "start": "node bot.js",
    "deploy": "node deploy.js"
  },
  "dependencies": {
    "discord.js": "^14.14.1",
    "telegram": "^2.19.5",
    "node-cron": "^3.0.3",
    "dotenv": "^16.3.1"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}`,
    
    '.gitignore': `node_modules/
.env
data/
.DS_Store
*.log
`,
    
    'README.md': `# Telegram to Discord News Bot

Автономный бот для пересылки новостей из Telegram в Discord.

## Развертывание

Запустите:
\`\`\`bash
npm run deploy
\`\`\`
`
  };
  
  for (const [filename, content] of Object.entries(files)) {
    if (!fs.existsSync(filename)) {
      fs.writeFileSync(filename, content);
      console.log(`✅ Создан ${filename}`);
    }
  }
}

async function installDependencies() {
  console.log('\n📦 Устанавливаем зависимости...');
  
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Зависимости установлены');
  } catch (error) {
    console.log('❌ Ошибка установки зависимостей');
    process.exit(1);
  }
}

async function setupGit() {
  console.log('\n🔧 Настраиваем Git...');
  
  try {
    if (!fs.existsSync('.git')) {
      execSync('git init', { stdio: 'inherit' });
      console.log('✅ Git репозиторий инициализирован');
    }
    
    execSync('git add .', { stdio: 'inherit' });
    execSync('git commit -m "Initial deploy"', { stdio: 'inherit' });
    console.log('✅ Файлы добавлены в Git');
    
  } catch (error) {
    console.log('❌ Ошибка настройки Git');
    process.exit(1);
  }
}

async function installRailwayCLI() {
  console.log('\n🚇 Устанавливаем Railway CLI...');
  
  try {
    execSync('npm install -g @railway/cli', { stdio: 'inherit' });
    console.log('✅ Railway CLI установлен');
  } catch (error) {
    console.log('❌ Ошибка установки Railway CLI. Попробуйте установить вручную: npm install -g @railway/cli');
    process.exit(1);
  }
}

async function deployToRailway() {
  console.log('\n🚀 Запускаем деплой на Railway...');
  
  try {
    console.log('🔑 Войдите в Railway...');
    execSync('railway login', { stdio: 'inherit' });
    
    console.log('📦 Создаем проект...');
    execSync('railway init', { stdio: 'inherit' });
    
    console.log('⚙️ Настраиваем переменные окружения...');
    
    // Запрашиваем данные у пользователя
    const discordToken = await askQuestion('Введите DISCORD_TOKEN: ');
    const telegramApiId = await askQuestion('Введите TELEGRAM_API_ID: ');
    const telegramApiHash = await askQuestion('Введите TELEGRAM_API_HASH: ');
    const telegramPhone = await askQuestion('Введите TELEGRAM_PHONE_NUMBER: ');
    
    // Устанавливаем переменные окружения
    execSync(`railway variables set DISCORD_TOKEN=${discordToken}`, { stdio: 'inherit' });
    execSync(`railway variables set TELEGRAM_API_ID=${telegramApiId}`, { stdio: 'inherit' });
    execSync(`railway variables set TELEGRAM_API_HASH=${telegramApiHash}`, { stdio: 'inherit' });
    execSync(`railway variables set TELEGRAM_PHONE_NUMBER=${telegramPhone}`, { stdio: 'inherit' });
    
    console.log('🚀 Запускаем деплой...');
    execSync('railway up', { stdio: 'inherit' });
    
    console.log('🎉 Деплой завершен!');
    console.log('📊 Статус приложения: railway status');
    console.log('📝 Логи: railway logs');
    
  } catch (error) {
    console.log('❌ Ошибка деплоя:', error.message);
    console.log('💡 Попробуйте выполнить шаги вручную:');
    console.log('1. railway login');
    console.log('2. railway init');
    console.log('3. railway variables set NAME=VALUE');
    console.log('4. railway up');
  }
}

async function main() {
  console.log('🚀 Автоматический деплой бота на Railway\n');
  
  try {
    await checkDependencies();
    await setupProject();
    await installDependencies();
    await setupGit();
    await installRailwayCLI();
    await deployToRailway();
    
    console.log('\n✅ Все готово! Ваш бот запущен в облаке.');
    console.log('🔗 Dashboard: https://railway.app');
    console.log('📚 Документация: https://docs.railway.app');
    
  } catch (error) {
    console.log('❌ Критическая ошибка:', error);
  } finally {
    rl.close();
  }
}

main();