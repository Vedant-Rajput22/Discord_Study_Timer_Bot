const db = require('../src/database/db');
const queries = require('../src/database/queries');
const tracker = require('../src/bot/voiceTracker');

console.log('[Seed] 🌱 Populating database with realistic study records...');

// Clear existing sample tables
db.exec(`
  DELETE FROM study_sessions;
  DELETE FROM user_profiles;
`);

const SAMPLE_USERS = [
  { userId: '1001', username: 'alex_chen', displayName: 'Alex Chen', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face' },
  { userId: '1002', username: 'sarah_m', displayName: 'Sarah Miller', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face' },
  { userId: '1003', username: 'david_k', displayName: 'David Kim', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face' },
  { userId: '1004', username: 'elena_r', displayName: 'Elena Rostova', avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&h=150&fit=crop&crop=face' },
  { userId: '1005', username: 'marcus_v', displayName: 'Marcus Vance', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face' },
  { userId: '1006', username: 'aisha_p', displayName: 'Aisha Patel', avatarUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&h=150&fit=crop&crop=face' },
  { userId: '1007', username: 'leo_t', displayName: 'Leo Tanaka', avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&h=150&fit=crop&crop=face' },
  { userId: '1008', username: 'chloe_b', displayName: 'Chloe Bennett', avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face' }
];

const CHANNELS = [
  { id: 'ch_1', name: '📚 Silent Library' },
  { id: 'ch_2', name: '🧠 Deep Work & Flow' },
  { id: 'ch_3', name: '🍅 Pomodoro 25/5' },
  { id: 'ch_4', name: '📐 Math & Code' },
  { id: 'ch_5', name: '☕ Study Cafe & Chill' }
];

// 1. Insert user profiles
SAMPLE_USERS.forEach(u => {
  queries.upsertUserProfile(u);
});

// 2. Generate 14 days of realistic sessions
const now = new Date();
let totalSessionsCount = 0;

for (let d = 13; d >= 0; d--) {
  const day = new Date();
  day.setDate(now.getDate() - d);
  const dateStr = day.toISOString().slice(0, 10);

  // Each day, 4 to 8 students study
  const participantsToday = SAMPLE_USERS.slice(0, Math.floor(Math.random() * 4) + 4);

  for (const user of participantsToday) {
    // 1 to 3 study sessions per student per day
    const sessionCount = Math.floor(Math.random() * 2) + 1;

    for (let s = 0; s < sessionCount; s++) {
      const channel = CHANNELS[Math.floor(Math.random() * CHANNELS.length)];
      // Session duration: 25 to 150 minutes
      const durationMins = Math.floor(Math.random() * 125) + 25;
      const durationSeconds = durationMins * 60;

      // Realistic study hours (between 8 AM and 11 PM)
      const startHour = Math.floor(Math.random() * 14) + 9;
      const startMinute = Math.floor(Math.random() * 60);

      const sessionStart = new Date(day);
      sessionStart.setHours(startHour, startMinute, 0, 0);

      const sessionEnd = new Date(sessionStart.getTime() + durationSeconds * 1000);

      queries.saveSession({
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        guildId: 'guild_sample_123',
        guildName: 'Focus Academy Discord',
        channelId: channel.id,
        channelName: channel.name,
        joinedAt: sessionStart.toISOString(),
        leftAt: sessionEnd.toISOString(),
        durationSeconds
      });

      totalSessionsCount++;
    }
  }
}

// 3. Set a couple of ongoing active study sessions in tracker for instant live demo!
const activeUser1 = SAMPLE_USERS[0]; // Alex Chen
const activeUser2 = SAMPLE_USERS[1]; // Sarah Miller
const activeUser3 = SAMPLE_USERS[2]; // David Kim

tracker.activeSessions.set(activeUser1.userId, {
  userId: activeUser1.userId,
  username: activeUser1.username,
  displayName: activeUser1.displayName,
  avatarUrl: activeUser1.avatarUrl,
  guildId: 'guild_sample_123',
  guildName: 'Focus Academy Discord',
  channelId: CHANNELS[1].id,
  channelName: CHANNELS[1].name,
  joinedAt: Date.now() - (48 * 60 + 15) * 1000, // 48m 15s ago
  totalPausedMs: 0,
  isPaused: false
});

tracker.activeSessions.set(activeUser2.userId, {
  userId: activeUser2.userId,
  username: activeUser2.username,
  displayName: activeUser2.displayName,
  avatarUrl: activeUser2.avatarUrl,
  guildId: 'guild_sample_123',
  guildName: 'Focus Academy Discord',
  channelId: CHANNELS[0].id,
  channelName: CHANNELS[0].name,
  joinedAt: Date.now() - (112 * 60 + 40) * 1000, // 1h 52m ago
  totalPausedMs: 0,
  isPaused: false
});

tracker.activeSessions.set(activeUser3.userId, {
  userId: activeUser3.userId,
  username: activeUser3.username,
  displayName: activeUser3.displayName,
  avatarUrl: activeUser3.avatarUrl,
  guildId: 'guild_sample_123',
  guildName: 'Focus Academy Discord',
  channelId: CHANNELS[2].id,
  channelName: CHANNELS[2].name,
  joinedAt: Date.now() - (22 * 60 + 5) * 1000, // 22m ago
  totalPausedMs: 0,
  isPaused: false
});

console.log(`[Seed] ✅ Done! Injected ${SAMPLE_USERS.length} students, ${totalSessionsCount} study sessions over 14 days, and 3 active voice sessions.`);
