require('dotenv').config();

module.exports = {
  // Discord Bot Configuration
  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID || '', // Optional: for instant guild slash command deployment
    logChannelId: process.env.LOG_CHANNEL_ID || '', // Optional: text channel to post study session summaries
  },

  // Tracking Settings
  tracking: {
    // Minimum session length in seconds to count as valid study (filters accidental misclicks)
    minSessionDurationSeconds: parseInt(process.env.MIN_SESSION_SECONDS || '10', 10),
    
    // Pause or ignore timer if user is self-deafened
    pauseOnDeafen: process.env.PAUSE_ON_DEAFEN === 'true',
    
    // Exclude voice channels with "afk" in name or guild AFK channel
    ignoreAfkChannels: true,

    // Specific voice channels to track (empty array = track ALL voice channels)
    // Example: ['123456789012345678', '987654321098765432'] or channel name keywords: ['study', 'work', 'focus']
    trackedChannelIds: process.env.TRACKED_CHANNEL_IDS ? process.env.TRACKED_CHANNEL_IDS.split(',').map(s => s.trim()) : [],
    channelNameKeywords: process.env.TRACKED_KEYWORDS ? process.env.TRACKED_KEYWORDS.split(',').map(s => s.trim().toLowerCase()) : [],
  },

  // Web Server Configuration
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  },

  // Database
  database: {
    path: process.env.DATABASE_PATH || './data/studybot.db',
  }
};
