const config = require('./config');
const { createWebServer } = require('./server/server');
const { createDiscordBot } = require('./bot/client');
const deployCommands = require('./bot/deployCommands');
const tracker = require('./bot/voiceTracker');

async function main() {
  console.log('====================================================');
  console.log('       📚 DISCORD STUDY BOT & ANALYTICS DASHBOARD    ');
  console.log('====================================================');

  // 1. Start Express Web Server
  const app = createWebServer();
  const server = app.listen(config.server.port, () => {
    console.log(`[WebServer] 🌐 Analytics Website running at: ${config.server.baseUrl}`);
    console.log(`[WebServer] 📊 API endpoints available at:   ${config.server.baseUrl}/api`);
  });

  // 2. Start Discord Bot (if token configured)
  let botClient = null;
  if (config.discord.token) {
    try {
      botClient = createDiscordBot();
      if (botClient) {
        await botClient.login(config.discord.token);
        // Optionally deploy slash commands
        if (config.discord.clientId) {
          await deployCommands();
        }
      }
    } catch (err) {
      console.error('[DiscordBot] ❌ Failed to login Discord bot:', err.message);
      console.log('[DiscordBot] ℹ️ Web dashboard will continue running in standalone mode.');
    }
  } else {
    console.log('[DiscordBot] 💡 Note: DISCORD_TOKEN is not configured yet in .env.');
    console.log('[DiscordBot] 👉 Create a bot at https://discord.com/developers/applications and paste token in .env');
    console.log('[DiscordBot] 🌟 The Web Analytics Dashboard is fully operational now!');
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[System] 🛑 Shutting down gracefully...');
    // Flush active sessions
    for (const userId of tracker.activeSessions.keys()) {
      await tracker.endSession(userId, 'bot_shutdown');
    }
    if (botClient) {
      botClient.destroy();
    }
    server.close(() => {
      console.log('[System] 👋 Server and bot stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('[Fatal Error]:', err);
});
