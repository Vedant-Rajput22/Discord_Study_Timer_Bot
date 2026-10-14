const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const queries = require('../../database/queries');
const tracker = require('../voiceTracker');
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View study statistics for yourself or another member')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to view stats for (leave blank for yourself)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const guildId = interaction.guildId;

    const stats = queries.getUserStats(targetUser.id, guildId);
    const activeSession = tracker.activeSessions.get(targetUser.id);

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle(`📚 Study Profile — ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 128 }))
      .setTimestamp();

    if (!stats && !activeSession) {
      embed.setDescription(`No study records found yet for **${targetUser.username}**.\nJoin any study voice channel to start tracking your focus time!`);
      return interaction.reply({ embeds: [embed] });
    }

    // Active status section
    let statusLine = '⚪ **Status:** Not currently studying in voice';
    if (activeSession) {
      const now = Date.now();
      const elapsedSec = Math.floor((now - activeSession.joinedAt) / 1000);
      statusLine = `🟢 **Status:** Currently studying in **#${activeSession.channelName}** (${formatSeconds(elapsedSec)})`;
    }

    embed.setDescription(`${statusLine}\n\n*View comprehensive analytics on the [Web Dashboard](${config.server.baseUrl})*`);

    const streakDisplay = stats && stats.currentStreak > 0 ? `🔥 **${stats.currentStreak} day${stats.currentStreak > 1 ? 's' : ''}**` : '0 days';
    const rankDisplay = stats && stats.rank ? `🏆 **#${stats.rank}** in server` : 'Unranked';

    embed.addFields(
      { name: '📅 Today', value: `\`${formatSeconds(stats ? stats.todaySeconds : 0)}\``, inline: true },
      { name: '📊 This Week', value: `\`${formatSeconds(stats ? stats.weekSeconds : 0)}\``, inline: true },
      { name: '⭐ All-Time', value: `\`${formatSeconds(stats ? stats.totalSeconds : 0)}\``, inline: true },
      { name: '🔥 Current Streak', value: streakDisplay, inline: true },
      { name: '🎖️ Server Rank', value: rankDisplay, inline: true },
      { name: '🎧 Favorite Room', value: stats ? stats.favoriteChannel : 'N/A', inline: true }
    );

    await interaction.reply({ embeds: [embed] });
  }
};
