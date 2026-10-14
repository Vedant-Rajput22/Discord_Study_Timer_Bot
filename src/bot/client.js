const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const tracker = require('./voiceTracker');

function createDiscordBot() {
  if (!config.discord.token) {
    console.log('[DiscordBot] ⚠️ No DISCORD_TOKEN provided in .env. Bot will remain in stand-by mode.');
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers
    ]
  });

  client.commands = new Collection();

  // Load slash commands
  const commandsPath = path.join(__dirname, 'commands');
  if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const command = require(`./commands/${file}`);
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
      }
    }
  }

  // Ready event
  client.once('ready', async () => {
    console.log(`[DiscordBot] 🤖 Bot logged in as ${client.user.tag}! Active in ${client.guilds.cache.size} servers.`);

    // Set bot presence
    client.user.setActivity('study sessions 📚 | /stats', { type: ActivityType.Watching });

    // Sync already active voice users across all servers
    await tracker.syncGuildVoiceStates(client);
  });

  // Handle slash command interactions
  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[DiscordBot] Error executing command ${interaction.commandName}:`, error.message);
      const replyObj = { content: 'There was an error while executing this command!', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyObj).catch(() => {});
      } else {
        await interaction.reply(replyObj).catch(() => {});
      }
    }
  });

  client.on('error', err => {
    console.error('[DiscordBot] Client error:', err.message);
  });

  // Handle voice state updates
  client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
      await tracker.handleVoiceStateUpdate(oldState, newState);
    } catch (err) {
      console.error('[DiscordBot] Voice state update error:', err);
    }
  });

  // Listen to tracker session ended to optionally post celebratory study logs in Discord channel
  tracker.on('session_ended', async data => {
    if (!config.discord.logChannelId) return;

    try {
      const channel = await client.channels.fetch(config.discord.logChannelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0x10b981)
          .setTitle('🎉 Study Session Completed!')
          .setDescription(`**${data.user.displayName}** just completed **${data.formattedDuration}** of focused study in **#${data.user.channelName}**!`)
          .setThumbnail(data.user.avatarUrl)
          .addFields(
            { name: '🔥 Current Streak', value: `${data.streak} day${data.streak > 1 ? 's' : ''}`, inline: true },
            { name: '🌐 Analytics', value: `[View Server Stats](${config.server.baseUrl})`, inline: true }
          )
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      }
    } catch (e) {
      console.error('[DiscordBot] Failed to send study recap log message:', e.message);
    }
  });

  return client;
}

module.exports = { createDiscordBot };
