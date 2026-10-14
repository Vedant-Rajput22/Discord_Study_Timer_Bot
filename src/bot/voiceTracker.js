const EventEmitter = require('events');
const config = require('../config');
const queries = require('../database/queries');

class VoiceTracker extends EventEmitter {
  constructor() {
    super();
    // In-memory map of ongoing study sessions: userId -> session object
    this.activeSessions = new Map();
  }

  /**
   * Helper: formats seconds into human readable e.g. "2h 15m 30s" or "45m"
   */
  formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  /**
   * Check if a voice channel qualifies for study tracking
   */
  isEligibleChannel(channel, guild) {
    if (!channel) return false;

    // Check AFK channel
    if (config.tracking.ignoreAfkChannels) {
      if (guild && guild.afkChannelId === channel.id) return false;
      const lowerName = channel.name.toLowerCase();
      if (lowerName.includes('afk') || lowerName.includes('away')) return false;
    }

    // Check explicit channel ID filter if configured
    if (config.tracking.trackedChannelIds.length > 0) {
      if (!config.tracking.trackedChannelIds.includes(channel.id)) return false;
    }

    // Check channel keyword filter if configured
    if (config.tracking.channelNameKeywords.length > 0) {
      const lowerName = channel.name.toLowerCase();
      const matchesKeyword = config.tracking.channelNameKeywords.some(k => lowerName.includes(k));
      if (!matchesKeyword) return false;
    }

    return true;
  }

  /**
   * Handle Discord voiceStateUpdate event
   */
  async handleVoiceStateUpdate(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const userId = member.id;
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const guild = newState.guild || oldState.guild;

    // 1. User Joined a voice channel
    if (!oldChannel && newChannel) {
      if (this.isEligibleChannel(newChannel, guild)) {
        this.startSession(member, newChannel, guild);
      }
    }
    // 2. User Left voice channel completely
    else if (oldChannel && !newChannel) {
      if (this.activeSessions.has(userId)) {
        await this.endSession(userId, 'left');
      }
    }
    // 3. User Switched voice channels
    else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      const wasEligible = this.isEligibleChannel(oldChannel, guild);
      const isNowEligible = this.isEligibleChannel(newChannel, guild);

      if (wasEligible && this.activeSessions.has(userId)) {
        await this.endSession(userId, 'switched');
      }

      if (isNowEligible) {
        this.startSession(member, newChannel, guild);
      }
    }
    // 4. Deafen / Undeafen state change
    else if (config.tracking.pauseOnDeafen && oldChannel && newChannel) {
      const isDeaf = newState.selfDeaf || newState.serverDeaf;
      const wasDeaf = oldState.selfDeaf || oldState.serverDeaf;

      if (!wasDeaf && isDeaf && this.activeSessions.has(userId)) {
        // Paused session due to deafen
        const session = this.activeSessions.get(userId);
        session.isPaused = true;
        session.pausedAt = Date.now();
        this.emit('session_paused', { user: session, reason: 'deafened' });
      } else if (wasDeaf && !isDeaf && this.activeSessions.has(userId)) {
        // Resume session
        const session = this.activeSessions.get(userId);
        if (session.isPaused && session.pausedAt) {
          const pausedDuration = Date.now() - session.pausedAt;
          session.totalPausedMs = (session.totalPausedMs || 0) + pausedDuration;
          session.isPaused = false;
          session.pausedAt = null;
          this.emit('session_resumed', { user: session });
        }
      }
    }
  }

  /**
   * Start tracking an active study session
   */
  startSession(member, channel, guild) {
    const userId = member.id;
    const now = Date.now();

    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 128 });

    const session = {
      userId,
      username: member.user.username,
      displayName: member.displayName || member.user.username,
      avatarUrl,
      guildId: guild.id,
      guildName: guild.name,
      channelId: channel.id,
      channelName: channel.name,
      joinedAt: now,
      totalPausedMs: 0,
      isPaused: (member.voice.selfDeaf || member.voice.serverDeaf) && config.tracking.pauseOnDeafen
    };

    if (session.isPaused) {
      session.pausedAt = now;
    }

    this.activeSessions.set(userId, session);

    // Keep profile fresh in database
    queries.upsertUserProfile({
      userId,
      username: session.username,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl
    });

    this.emit('session_started', {
      type: 'user_joined',
      user: session,
      activeCount: this.activeSessions.size
    });

    console.log(`[StudyTracker] 🟢 ${session.displayName} joined "${channel.name}" in "${guild.name}"`);
  }

  /**
   * End and record a study session
   */
  async endSession(userId, reason = 'left') {
    const session = this.activeSessions.get(userId);
    if (!session) return null;

    this.activeSessions.delete(userId);

    const leftAt = Date.now();
    let durationMs = leftAt - session.joinedAt - (session.totalPausedMs || 0);
    if (session.isPaused && session.pausedAt) {
      durationMs -= (leftAt - session.pausedAt);
    }

    const durationSeconds = Math.max(0, Math.floor(durationMs / 1000));

    // Filter short misclicks
    if (durationSeconds < config.tracking.minSessionDurationSeconds) {
      console.log(`[StudyTracker] ⚠️ Session for ${session.displayName} was only ${durationSeconds}s (< min ${config.tracking.minSessionDurationSeconds}s). Discarded.`);
      this.emit('session_discarded', { user: session, durationSeconds });
      return null;
    }

    // Save into database
    const sessionRecord = {
      ...session,
      leftAt,
      durationSeconds
    };

    const result = queries.saveSession(sessionRecord);
    const formattedDuration = this.formatDuration(durationSeconds);

    console.log(`[StudyTracker] 🔴 ${session.displayName} finished studying: ${formattedDuration} in "${session.channelName}" (Streak: ${result.streak}d)`);

    this.emit('session_ended', {
      type: 'user_left',
      user: session,
      durationSeconds,
      formattedDuration,
      streak: result.streak,
      reason,
      activeCount: this.activeSessions.size
    });

    return { ...sessionRecord, streak: result.streak, formattedDuration };
  }

  /**
   * Synchronize voice states on bot start (catches users already in voice channels)
   */
  async syncGuildVoiceStates(client) {
    let count = 0;
    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (channel.isVoiceBased && channel.isVoiceBased()) {
          if (!this.isEligibleChannel(channel, guild)) continue;

          for (const member of channel.members.values()) {
            if (member.user.bot) continue;
            if (!this.activeSessions.has(member.id)) {
              this.startSession(member, channel, guild);
              count++;
            }
          }
        }
      }
    }
    if (count > 0) {
      console.log(`[StudyTracker] 🔄 Synced ${count} currently connected study participant(s).`);
    }
  }

  /**
   * Get all currently active study sessions with elapsed seconds calculated
   */
  getActiveSessions(guildId = null) {
    const now = Date.now();
    const list = [];

    for (const session of this.activeSessions.values()) {
      if (guildId && session.guildId !== guildId) continue;

      let elapsedMs = now - session.joinedAt - (session.totalPausedMs || 0);
      if (session.isPaused && session.pausedAt) {
        elapsedMs -= (now - session.pausedAt);
      }
      const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

      list.push({
        ...session,
        elapsedSeconds,
        formattedElapsed: this.formatDuration(elapsedSeconds)
      });
    }

    return list.sort((a, b) => b.elapsedSeconds - a.elapsedSeconds);
  }
}

// Singleton tracker instance
const tracker = new VoiceTracker();
module.exports = tracker;
