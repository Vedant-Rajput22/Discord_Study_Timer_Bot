const db = require('./db');

/**
 * Upsert or refresh a user's profile info
 */
function upsertUserProfile({ userId, username, displayName, avatarUrl }) {
  const stmt = db.prepare(`
    INSERT INTO user_profiles (user_id, username, display_name, avatar_url, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      display_name = COALESCE(excluded.display_name, user_profiles.display_name),
      avatar_url = COALESCE(excluded.avatar_url, user_profiles.avatar_url),
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(userId, username, displayName || username, avatarUrl || null);
}

/**
 * Calculate user's consecutive day study streak
 */
function updateStreak(userId, studyDate) {
  // Fetch distinct recent study dates for this user ordered descending
  const dates = db.prepare(`
    SELECT DISTINCT date
    FROM study_sessions
    WHERE user_id = ?
    ORDER BY date DESC
    LIMIT 60
  `).all(userId).map(r => r.date);

  if (dates.length === 0) return 0;

  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  
  // Calculate yesterday's date string
  const yDate = new Date();
  yDate.setDate(yDate.getDate() - 1);
  const yesterday = yDate.toISOString().slice(0, 10);

  // If the user's latest study date is today or yesterday, streak is active
  const latestDate = dates[0];
  if (latestDate !== today && latestDate !== yesterday) {
    db.prepare(`UPDATE user_profiles SET current_streak = 0 WHERE user_id = ?`).run(userId);
    return 0;
  }

  // Count consecutive days backward
  let checkDate = new Date(latestDate);
  for (const dStr of dates) {
    const curExpected = checkDate.toISOString().slice(0, 10);
    if (dStr === curExpected) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  db.prepare(`
    UPDATE user_profiles
    SET current_streak = ?, last_active_date = ?
    WHERE user_id = ?
  `).run(streak, studyDate, userId);

  return streak;
}

/**
 * Save completed study session and update user totals
 */
function saveSession(session) {
  const {
    userId,
    username,
    displayName,
    avatarUrl,
    guildId,
    guildName,
    channelId,
    channelName,
    joinedAt,
    leftAt,
    durationSeconds
  } = session;

  const joinDate = new Date(joinedAt);
  const dateStr = joinDate.toISOString().slice(0, 10);
  const hourOfDay = joinDate.getHours();

  // First ensure profile exists
  upsertUserProfile({ userId, username, displayName, avatarUrl });

  // Insert session record
  const insertStmt = db.prepare(`
    INSERT INTO study_sessions (
      user_id, username, display_name, avatar_url,
      guild_id, guild_name, channel_id, channel_name,
      joined_at, left_at, duration_seconds, date, hour_of_day
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = insertStmt.run(
    userId,
    username,
    displayName || username,
    avatarUrl || null,
    guildId,
    guildName || 'Unknown Guild',
    channelId,
    channelName || 'Voice Channel',
    new Date(joinedAt).toISOString(),
    new Date(leftAt).toISOString(),
    durationSeconds,
    dateStr,
    hourOfDay
  );

  // Update cumulative user total
  db.prepare(`
    UPDATE user_profiles
    SET total_seconds = total_seconds + ?
    WHERE user_id = ?
  `).run(durationSeconds, userId);

  // Update streak
  const streak = updateStreak(userId, dateStr);

  return { id: info.lastInsertRowid, streak };
}

/**
 * Get Today's overview stats for a guild or overall
 */
function getTodayStats(guildId = null) {
  const today = new Date().toISOString().slice(0, 10);
  let query = `
    SELECT
      COALESCE(SUM(duration_seconds), 0) AS total_seconds_today,
      COUNT(DISTINCT user_id) AS active_users_today,
      COUNT(id) AS sessions_today
    FROM study_sessions
    WHERE date = ?
  `;
  const params = [today];
  if (guildId) {
    query += ` AND guild_id = ?`;
    params.push(guildId);
  }

  const row = db.prepare(query).get(...params);

  // Get today's top student
  let topQuery = `
    SELECT user_id, username, display_name, avatar_url, SUM(duration_seconds) as seconds
    FROM study_sessions
    WHERE date = ?
  `;
  const topParams = [today];
  if (guildId) {
    topQuery += ` AND guild_id = ?`;
    topParams.push(guildId);
  }
  topQuery += ` GROUP BY user_id ORDER BY seconds DESC LIMIT 1`;

  const topUser = db.prepare(topQuery).get(...topParams) || null;

  return {
    date: today,
    totalSeconds: row.total_seconds_today,
    activeUsersCount: row.active_users_today,
    sessionsCount: row.sessions_today,
    topUser
  };
}

/**
 * Get overall dashboard KPI metrics
 */
function getOverviewStats(guildId = null) {
  const today = getTodayStats(guildId);

  let allTimeQuery = `
    SELECT
      COALESCE(SUM(duration_seconds), 0) AS all_time_seconds,
      COUNT(DISTINCT user_id) AS total_students,
      COUNT(id) AS all_time_sessions
    FROM study_sessions
  `;
  const params = [];
  if (guildId) {
    allTimeQuery += ` WHERE guild_id = ?`;
    params.push(guildId);
  }

  const allTime = db.prepare(allTimeQuery).get(...params);

  return {
    today,
    allTimeSeconds: allTime.all_time_seconds,
    totalStudents: allTime.total_students,
    allTimeSessions: allTime.all_time_sessions
  };
}

/**
 * Get Leaderboard for specified timeframe
 * @param {'today' | 'week' | 'month' | 'all'} timeframe
 */
function getLeaderboard(guildId = null, timeframe = 'today', limit = 50) {
  let dateFilter = '';
  const params = [];

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  if (timeframe === 'today') {
    dateFilter = 's.date = ?';
    params.push(todayStr);
  } else if (timeframe === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(now.getDate() - 7);
    dateFilter = 's.date >= ?';
    params.push(weekAgo.toISOString().slice(0, 10));
  } else if (timeframe === 'month') {
    const monthAgo = new Date();
    monthAgo.setDate(now.getDate() - 30);
    dateFilter = 's.date >= ?';
    params.push(monthAgo.toISOString().slice(0, 10));
  }

  let sql = `
    SELECT
      s.user_id,
      COALESCE(u.display_name, s.display_name, s.username) AS display_name,
      COALESCE(u.username, s.username) AS username,
      COALESCE(u.avatar_url, s.avatar_url) AS avatar_url,
      COALESCE(u.current_streak, 0) AS streak,
      SUM(s.duration_seconds) AS total_seconds,
      COUNT(s.id) AS session_count,
      MAX(s.left_at) AS last_session_at
    FROM study_sessions s
    LEFT JOIN user_profiles u ON s.user_id = u.user_id
  `;

  const whereConditions = [];
  if (dateFilter) {
    whereConditions.push(dateFilter);
  }
  if (guildId) {
    whereConditions.push('s.guild_id = ?');
    params.push(guildId);
  }

  if (whereConditions.length > 0) {
    sql += ` WHERE ` + whereConditions.join(' AND ');
  }

  sql += `
    GROUP BY s.user_id
    ORDER BY total_seconds DESC
    LIMIT ?
  `;
  params.push(limit);

  const rows = db.prepare(sql).all(...params);

  // Add rank numbers
  return rows.map((row, index) => ({
    rank: index + 1,
    ...row
  }));
}

/**
 * Get detailed stats for an individual user
 */
function getUserStats(userId, guildId = null) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekDate = new Date();
  weekDate.setDate(weekDate.getDate() - 7);
  const weekStr = weekDate.toISOString().slice(0, 10);

  const profile = db.prepare(`SELECT * FROM user_profiles WHERE user_id = ?`).get(userId);
  if (!profile) return null;

  // Today's seconds
  let todaySql = `SELECT COALESCE(SUM(duration_seconds), 0) AS seconds FROM study_sessions WHERE user_id = ? AND date = ?`;
  const todayParams = [userId, todayStr];
  if (guildId) {
    todaySql += ` AND guild_id = ?`;
    todayParams.push(guildId);
  }
  const todaySeconds = db.prepare(todaySql).get(...todayParams).seconds;

  // This week's seconds
  let weekSql = `SELECT COALESCE(SUM(duration_seconds), 0) AS seconds FROM study_sessions WHERE user_id = ? AND date >= ?`;
  const weekParams = [userId, weekStr];
  if (guildId) {
    weekSql += ` AND guild_id = ?`;
    weekParams.push(guildId);
  }
  const weekSeconds = db.prepare(weekSql).get(...weekParams).seconds;

  // This month's seconds (last 30 days)
  const monthDate = new Date();
  monthDate.setDate(monthDate.getDate() - 30);
  const monthStr = monthDate.toISOString().slice(0, 10);
  let monthSql = `SELECT COALESCE(SUM(duration_seconds), 0) AS seconds FROM study_sessions WHERE user_id = ? AND date >= ?`;
  const monthParams = [userId, monthStr];
  if (guildId) {
    monthSql += ` AND guild_id = ?`;
    monthParams.push(guildId);
  }
  const monthSeconds = db.prepare(monthSql).get(...monthParams).seconds;

  // Total seconds for this guild / overall
  let totalSql = `SELECT COALESCE(SUM(duration_seconds), 0) AS seconds, COUNT(id) AS session_count FROM study_sessions WHERE user_id = ?`;
  const totalParams = [userId];
  if (guildId) {
    totalSql += ` AND guild_id = ?`;
    totalParams.push(guildId);
  }
  const totalRow = db.prepare(totalSql).get(...totalParams);

  // Favorite study channel
  let favChannelSql = `
    SELECT channel_name, COUNT(id) as count, SUM(duration_seconds) as total_seconds
    FROM study_sessions
    WHERE user_id = ?
  `;
  const favParams = [userId];
  if (guildId) {
    favChannelSql += ` AND guild_id = ?`;
    favParams.push(guildId);
  }
  favChannelSql += ` GROUP BY channel_id ORDER BY total_seconds DESC LIMIT 1`;
  const favChannel = db.prepare(favChannelSql).get(...favParams) || null;

  // Server Rank (All-Time)
  let rankSql = `
    SELECT rank FROM (
      SELECT user_id, RANK() OVER (ORDER BY SUM(duration_seconds) DESC) as rank
      FROM study_sessions
  `;
  const rankParams = [];
  if (guildId) {
    rankSql += ` WHERE guild_id = ?`;
    rankParams.push(guildId);
  }
  rankSql += ` GROUP BY user_id) WHERE user_id = ?`;
  rankParams.push(userId);
  const rankResult = db.prepare(rankSql).get(...rankParams);

  return {
    userId: profile.user_id,
    username: profile.username,
    displayName: profile.display_name || profile.username,
    avatarUrl: profile.avatar_url,
    currentStreak: profile.current_streak,
    todaySeconds,
    weekSeconds,
    monthSeconds,
    totalSeconds: totalRow.seconds,
    sessionCount: totalRow.session_count,
    rank: rankResult ? rankResult.rank : null,
    favoriteChannel: favChannel ? favChannel.channel_name : 'None',
    lastActive: profile.last_active_date
  };
}

/**
 * Get daily study breakdown for the last N days (for charts)
 */
function getTrends(guildId = null, days = 14) {
  const result = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    let sql = `
      SELECT
        COALESCE(SUM(duration_seconds), 0) AS total_seconds,
        COUNT(DISTINCT user_id) AS student_count
      FROM study_sessions
      WHERE date = ?
    `;
    const params = [dateStr];
    if (guildId) {
      sql += ` AND guild_id = ?`;
      params.push(guildId);
    }

    const row = db.prepare(sql).get(...params);
    result.push({
      date: dateStr,
      label: dayLabel,
      totalSeconds: row.total_seconds,
      totalHours: Number((row.total_seconds / 3600).toFixed(1)),
      studentCount: row.student_count
    });
  }

  return result;
}

/**
 * Get hourly distribution of study sessions (0 - 23 hours)
 */
function getHourlyDistribution(guildId = null) {
  let sql = `
    SELECT
      hour_of_day,
      COALESCE(SUM(duration_seconds), 0) as total_seconds,
      COUNT(id) as session_count
    FROM study_sessions
  `;
  const params = [];
  if (guildId) {
    sql += ` WHERE guild_id = ?`;
    params.push(guildId);
  }
  sql += ` GROUP BY hour_of_day ORDER BY hour_of_day ASC`;

  const rows = db.prepare(sql).all(...params);
  const hourMap = {};
  rows.forEach(r => { hourMap[r.hour_of_day] = r; });

  const result = [];
  for (let h = 0; h < 24; h++) {
    const r = hourMap[h];
    const totalSec = r ? r.total_seconds : 0;
    const hourLabel = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
    result.push({
      hour: h,
      label: hourLabel,
      totalSeconds: totalSec,
      totalHours: Number((totalSec / 3600).toFixed(1)),
      sessionCount: r ? r.session_count : 0
    });
  }

  return result;
}

/**
 * Channel distribution by study time
 */
function getChannelDistribution(guildId = null) {
  let sql = `
    SELECT
      channel_id,
      channel_name,
      COALESCE(SUM(duration_seconds), 0) as total_seconds,
      COUNT(id) as session_count
    FROM study_sessions
  `;
  const params = [];
  if (guildId) {
    sql += ` WHERE guild_id = ?`;
    params.push(guildId);
  }
  sql += ` GROUP BY channel_id ORDER BY total_seconds DESC LIMIT 6`;

  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({
    channelId: r.channel_id,
    channelName: r.channel_name,
    totalSeconds: r.total_seconds,
    totalHours: Number((r.total_seconds / 3600).toFixed(1)),
    sessionCount: r.session_count
  }));
}

/**
 * Get recent study sessions log
 */
function getRecentSessions(guildId = null, limit = 20) {
  let sql = `
    SELECT
      id,
      user_id,
      username,
      display_name,
      avatar_url,
      guild_id,
      guild_name,
      channel_id,
      channel_name,
      joined_at,
      left_at,
      duration_seconds,
      date
    FROM study_sessions
  `;
  const params = [];
  if (guildId) {
    sql += ` WHERE guild_id = ?`;
    params.push(guildId);
  }
  sql += ` ORDER BY joined_at DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params);
}

/**
 * Get a user's daily study history for their profile chart
 */
function getUserDailyHistory(userId, days = 14) {
  const result = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });

    const row = db.prepare(`
      SELECT COALESCE(SUM(duration_seconds), 0) AS total_seconds
      FROM study_sessions
      WHERE user_id = ? AND date = ?
    `).get(userId, dateStr);

    result.push({
      date: dateStr,
      label: dayLabel,
      totalSeconds: row.total_seconds,
      totalHours: Number((row.total_seconds / 3600).toFixed(2))
    });
  }

  return result;
}

/**
 * Get all members who have tracked voice sessions at least once
 */
function getAllTrackedUsers(guildId = null) {
  let sql = `
    SELECT
      u.user_id,
      COALESCE(u.display_name, u.username) AS display_name,
      u.username,
      u.avatar_url,
      u.total_seconds,
      u.current_streak,
      u.last_active_date,
      COUNT(s.id) AS session_count
    FROM user_profiles u
    INNER JOIN study_sessions s ON u.user_id = s.user_id
  `;
  const params = [];
  if (guildId) {
    sql += ` WHERE s.guild_id = ?`;
    params.push(guildId);
  }
  sql += `
    GROUP BY u.user_id
    ORDER BY u.total_seconds DESC
  `;
  return db.prepare(sql).all(...params);
}

/**
 * Channel distribution for a specific individual user
 */
function getUserChannelDistribution(userId, guildId = null) {
  let sql = `
    SELECT
      channel_id,
      channel_name,
      COALESCE(SUM(duration_seconds), 0) AS total_seconds,
      COUNT(id) AS session_count
    FROM study_sessions
    WHERE user_id = ?
  `;
  const params = [userId];
  if (guildId) {
    sql += ` AND guild_id = ?`;
    params.push(guildId);
  }
  sql += ` GROUP BY channel_id ORDER BY total_seconds DESC`;

  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({
    channelId: r.channel_id,
    channelName: r.channel_name,
    totalSeconds: r.total_seconds,
    totalHours: Number((r.total_seconds / 3600).toFixed(2)),
    sessionCount: r.session_count
  }));
}

/**
 * Peak study hours (0-23) for a specific individual user
 */
function getUserHourlyDistribution(userId, guildId = null) {
  let sql = `
    SELECT
      hour_of_day,
      COALESCE(SUM(duration_seconds), 0) AS total_seconds,
      COUNT(id) AS session_count
    FROM study_sessions
    WHERE user_id = ?
  `;
  const params = [userId];
  if (guildId) {
    sql += ` AND guild_id = ?`;
    params.push(guildId);
  }
  sql += ` GROUP BY hour_of_day ORDER BY hour_of_day ASC`;

  const rows = db.prepare(sql).all(...params);
  const hourMap = {};
  rows.forEach(r => { hourMap[r.hour_of_day] = r; });

  const result = [];
  for (let h = 0; h < 24; h++) {
    const r = hourMap[h];
    const totalSec = r ? r.total_seconds : 0;
    const hourLabel = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
    result.push({
      hour: h,
      label: hourLabel,
      totalSeconds: totalSec,
      totalHours: Number((totalSec / 3600).toFixed(2)),
      sessionCount: r ? r.session_count : 0
    });
  }
  return result;
}

/**
 * Get recent study sessions log for a specific individual user
 */
function getUserRecentSessions(userId, guildId = null, limit = 25) {
  let sql = `
    SELECT
      id,
      user_id,
      username,
      display_name,
      avatar_url,
      channel_id,
      channel_name,
      joined_at,
      left_at,
      duration_seconds,
      date
    FROM study_sessions
    WHERE user_id = ?
  `;
  const params = [userId];
  if (guildId) {
    sql += ` AND guild_id = ?`;
    params.push(guildId);
  }
  sql += ` ORDER BY joined_at DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params);
}

module.exports = {
  upsertUserProfile,
  saveSession,
  getTodayStats,
  getOverviewStats,
  getLeaderboard,
  getUserStats,
  getTrends,
  getHourlyDistribution,
  getChannelDistribution,
  getRecentSessions,
  getUserDailyHistory,
  getAllTrackedUsers,
  getUserChannelDistribution,
  getUserHourlyDistribution,
  getUserRecentSessions
};
