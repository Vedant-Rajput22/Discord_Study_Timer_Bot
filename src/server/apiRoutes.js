const express = require('express');
const queries = require('../database/queries');
const tracker = require('../bot/voiceTracker');

const router = express.Router();

// SSE Connected Clients set
const sseClients = new Set();

// Wire tracker events to SSE clients
tracker.on('session_started', data => {
  broadcastSSE('session_started', data);
});

tracker.on('session_ended', data => {
  broadcastSSE('session_ended', data);
});

tracker.on('session_paused', data => {
  broadcastSSE('session_paused', data);
});

tracker.on('session_resumed', data => {
  broadcastSSE('session_resumed', data);
});

function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// 1. Overview metrics
router.get('/stats/overview', (req, res) => {
  try {
    const guildId = req.query.guildId || null;
    const overview = queries.getOverviewStats(guildId);
    const active = tracker.getActiveSessions(guildId);

    res.json({
      success: true,
      data: {
        ...overview,
        activeNowCount: active.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Leaderboard
router.get('/leaderboard', (req, res) => {
  try {
    const guildId = req.query.guildId || null;
    const timeframe = req.query.timeframe || 'today';
    const limit = parseInt(req.query.limit || '50', 10);

    const leaderboard = queries.getLeaderboard(guildId, timeframe, limit);
    res.json({ success: true, data: leaderboard });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Active Voice Participants
router.get('/active', (req, res) => {
  try {
    const guildId = req.query.guildId || null;
    const active = tracker.getActiveSessions(guildId);
    res.json({ success: true, data: active });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Trends (14-day or custom days)
router.get('/trends', (req, res) => {
  try {
    const guildId = req.query.guildId || null;
    const days = parseInt(req.query.days || '14', 10);
    const trends = queries.getTrends(guildId, days);
    res.json({ success: true, data: trends });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Hourly Distribution
router.get('/distribution/hourly', (req, res) => {
  try {
    const guildId = req.query.guildId || null;
    const distribution = queries.getHourlyDistribution(guildId);
    res.json({ success: true, data: distribution });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Voice Channel Distribution
router.get('/distribution/channels', (req, res) => {
  try {
    const guildId = req.query.guildId || null;
    const channels = queries.getChannelDistribution(guildId);
    res.json({ success: true, data: channels });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Recent Sessions
router.get('/sessions', (req, res) => {
  try {
    const guildId = req.query.guildId || null;
    const limit = parseInt(req.query.limit || '20', 10);
    const sessions = queries.getRecentSessions(guildId, limit);
    res.json({ success: true, data: sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. List all tracked users
router.get('/users', (req, res) => {
  try {
    const guildId = req.query.guildId || null;
    const users = queries.getAllTrackedUsers(guildId);
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Full personalized analytics for a selected user
router.get('/users/:userId/analytics', (req, res) => {
  try {
    const guildId = req.query.guildId || null;
    const days = parseInt(req.query.days || '14', 10);
    const userId = req.params.userId;

    const stats = queries.getUserStats(userId, guildId);
    if (!stats) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const channels = queries.getUserChannelDistribution(userId, guildId);
    const hourly = queries.getUserHourlyDistribution(userId, guildId);
    const trends = queries.getUserDailyHistory(userId, days);
    const sessions = queries.getUserRecentSessions(userId, guildId, 30);
    const activeSession = tracker.activeSessions.get(userId) || null;

    res.json({
      success: true,
      data: {
        stats,
        channels,
        hourly,
        trends,
        sessions,
        activeSession: activeSession ? {
          ...activeSession,
          elapsedSeconds: Math.floor((Date.now() - activeSession.joinedAt) / 1000)
        } : null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// User Profile & stats modal (legacy support)
router.get('/users/:userId', (req, res) => {
  try {
    const guildId = req.query.guildId || null;
    const stats = queries.getUserStats(req.params.userId, guildId);
    if (!stats) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const history = queries.getUserDailyHistory(req.params.userId, 14);
    const activeSession = tracker.activeSessions.get(req.params.userId) || null;

    res.json({
      success: true,
      data: {
        stats,
        history,
        activeSession: activeSession ? {
          ...activeSession,
          elapsedSeconds: Math.floor((Date.now() - activeSession.joinedAt) / 1000)
        } : null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Server-Sent Events (SSE) endpoint for real-time reactivity
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now() })}\n\n`);
  sseClients.add(res);

  // Keep connection open with heartbeat comment every 30s
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

module.exports = router;
