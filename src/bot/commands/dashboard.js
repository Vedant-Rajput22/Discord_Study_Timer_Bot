const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Get link to the study stats and analytics website'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle('🌐 Study Analytics & Insights Website')
      .setDescription(
        `Track your daily study progress, explore peak hours, view active participants, and climb the server leaderboard!\n\n` +
        `**Dashboard URL:** [${config.server.baseUrl}](${config.server.baseUrl})`
      )
      .addFields(
        { name: '📊 Analytics Included', value: '• Daily & Weekly Trends\n• Peak Study Hours Heatmap\n• Channel Distribution\n• Interactive Leaderboard\n• Live Voice Presence', inline: false }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Open Web Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(config.server.baseUrl)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }
};
