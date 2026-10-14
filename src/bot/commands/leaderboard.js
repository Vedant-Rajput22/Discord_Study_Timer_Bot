const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const queries = require('../../database/queries');
const config = require('../../config');

function formatSeconds(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${m}m`;
}

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View top study participants on the server')
    .addStringOption(option =>
      option
        .setName('timeframe')
        .setDescription('Select time window')
        .setRequired(false)
        .addChoices(
          { name: 'Today', value: 'today' },
          { name: 'This Week', value: 'week' },
          { name: 'This Month', value: 'month' },
          { name: 'All-Time', value: 'all' }
        )
    ),

  async execute(interaction) {
    const timeframe = interaction.options.getString('timeframe') || 'today';
    const guildId = interaction.guildId;

    const leaders = queries.getLeaderboard(guildId, timeframe, 10);

    const titleMap = {
      today: "📅 Today's Study Leaderboard",
      week: "📊 This Week's Study Leaderboard",
      month: "🗓️ This Month's Study Leaderboard",
      all: "🏆 All-Time Study Leaderboard"
    };

    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle(titleMap[timeframe] || "🏆 Study Leaderboard")
      .setDescription(`*Live rankings & full charts on the [Web Dashboard](${config.server.baseUrl})*\n`)
      .setTimestamp();

    if (leaders.length === 0) {
      embed.setDescription(`No study sessions logged for this timeframe yet!\nJoin a study channel to take the #1 spot.`);
      return interaction.reply({ embeds: [embed] });
    }

    let description = '';
    leaders.forEach((u, i) => {
      const medal = i < 3 ? MEDALS[i] : `\`#${i + 1}\``;
      const streak = u.streak > 0 ? ` · 🔥 ${u.streak}d streak` : '';
      description += `${medal} **${u.display_name}** — \`${formatSeconds(u.total_seconds)}\`${streak}\n`;
    });

    embed.setDescription(description + `\n🔗 [Open Web Analytics Dashboard](${config.server.baseUrl})`);

    await interaction.reply({ embeds: [embed] });
  }
};
