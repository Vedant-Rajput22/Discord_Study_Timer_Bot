const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

async function deployCommands() {
  if (!config.discord.token || !config.discord.clientId) {
    console.log('[DeployCommands] ⚠️ Discord token or clientId missing in .env. Skipping slash command registration.');
    return;
  }

  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    }
  }

  const rest = new REST().setToken(config.discord.token);

  try {
    console.log(`[DeployCommands] 🚀 Refreshing ${commands.length} application (/) commands...`);

    if (config.discord.guildId) {
      // Fast guild-specific deployment for instant development testing
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commands }
      );
      console.log(`[DeployCommands] ✅ Successfully registered commands to guild: ${config.discord.guildId}`);
    } else {
      // Global deployment
      await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commands }
      );
      console.log(`[DeployCommands] ✅ Successfully registered global application commands.`);
    }
  } catch (error) {
    console.error('[DeployCommands] ❌ Error deploying slash commands:', error);
  }
}

if (require.main === module) {
  deployCommands();
}

module.exports = deployCommands;
