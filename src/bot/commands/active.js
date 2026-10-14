const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const tracker = require('../voiceTracker');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('active')
    .setDescription('See who is actively studying in voice channels right now'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const active = tracker.getActiveSessions(guildId);

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('🟢 Active Study Sessions')
      .setTimestamp();

    if (active.length === 0) {
      embed.setDescription('Nobody is currently studying in voice channels.\nBe the first to hop in and get focused!');
      return interaction.reply({ embeds: [embed] });
    }

    let description = `Currently **${active.length}** member${active.length > 1 ? 's are' : ' is'} studying:\n\n`;
    active.forEach(s => {
      const pausedTag = s.isPaused ? ' ⏸️ *(paused)*' : '';
      description += `• **${s.displayName}** in **#${s.channelName}** — elapsed: \`${s.formattedElapsed}\`${pausedTag}\n`;
    });

    description += `\n🔗 [Watch Live on Web Dashboard](${config.server.baseUrl})`;
    embed.setDescription(description);

    await interaction.reply({ embeds: [embed] });
  }
};
