# 📚 StudyPulse — Discord Study Tracker & Analytics Dashboard

A Discord Study Bot and interactive Web Analytics Dashboard that tracks voice channel focus time, records join/leave timestamps, calculates daily totals, streaks, and server leaderboards, and presents comprehensive analytics on a modern web application.

---

## 🌟 Key Features

### 🎙️ Discord Voice Channel Tracking
- **Automatic Session Tracking**: Automatically logs when any member joins and leaves a voice channel.
- **Daily Totals & Streaks**: Aggregates daily focus hours and calculates consecutive-day study streaks.
- **AFK Channel Protection**: Automatically ignores Discord's built-in AFK voice channel (or channels containing "AFK" in their name) so idle time is never counted as study time.
- **Misclick Filter**: Configurable minimum session length (default 10s) to prevent spamming from accidental voice joins.
- **Real-Time Synchronization**: On bot startup, automatically detects members already inside voice channels and begins tracking them immediately.

### 🌐 Modern Web Analytics Dashboard
- **Live Voice Presence**: Real-time cards displaying who is studying right now with ticking digital timers.
- **Server KPI Cards**: Today's total focus time, members studying now, today's top study champion, and all-time hours.
- **Interactive Leaderboard**: Filter by **Today**, **This Week**, **This Month**, or **All-Time**, with podium medals (🥇, 🥈, 🥉) and live search.
- **Interactive Visual Charts**:
  - **14-Day Community Focus Trend** (daily hours studied)
  - **Peak Study Hours Heatmap** (24-hour distribution showing when members study most)
  - **Top Study Rooms** (distribution of study time across voice channels)
- **Member Profile Modal**: Click any member to view their personal streak, rank, favorite study room, completed session count, and personal 14-day study chart.
- **Server-Sent Events (SSE)**: Dashboard updates automatically in real-time when members join or leave voice channels without needing a page refresh!

### ⚡ Discord Slash Commands
- `/stats [user]` — View study stats (today, this week, total, streak, rank, favorite channel) for yourself or another member.
- `/leaderboard [timeframe]` — Display top study participants for Today, This Week, This Month, or All-Time.
- `/active` — See who is currently in voice channels and how long they've been studying.
- `/dashboard` — Get a direct link and interactive button to open the web dashboard.

---

## 🚀 Quick Setup Guide

### 1. Prerequisites
- **Node.js** (v18 or newer installed)
- **Discord Account** with permission to create bot applications

### 2. Configure Discord Bot Application
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, give your bot a name (e.g. `StudyPulse`), and create it.
3. In the left menu, click **Bot**:
   - Click **Reset Token** and copy the **Bot Token**.
   - Under **Privileged Gateway Intents**, enable:
     - ✅ **Server Members Intent**
     - ✅ **Voice States Intent** (required for `GuildVoiceStates`)
4. In the left menu, click **OAuth2** ➡️ **URL Generator**:
   - Scopes: Select `bot` and `applications.commands`.
   - Bot Permissions: Select `View Channels`, `Send Messages`, `Embed Links`, `Connect`.
   - Copy the generated URL and open it in your browser to invite the bot to your Discord server!

### 3. Configure `.env`
Open the [`.env`](file:///c:/Users/vedan/discord_bot/.env) file in the project root and fill in your Discord credentials:

```ini
# Discord Bot Credentials
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_client_id_here

# Optional: Add your Discord server ID for instant slash command registration during development
DISCORD_GUILD_ID=

# Optional: Text channel ID to post study completion recaps
LOG_CHANNEL_ID=

# Web Server Port
PORT=3000
BASE_URL=http://localhost:3000

# Tracking Rules
MIN_SESSION_SECONDS=10
PAUSE_ON_DEAFEN=false
TRACKED_CHANNEL_IDS=
TRACKED_KEYWORDS=
```

### 4. Run the Bot & Web Server
```bash
# Run the combined Discord Bot and Web Dashboard
npm start

# Or run with auto-reload in development mode
npm run dev
```

Open your browser and navigate to:
**[http://localhost:3000](http://localhost:3000)**

---

## 📁 Project Structure

```
c:\Users\vedan\discord_bot\
├── src\
│   ├── index.js               # Application entry point (boots bot + web server)
│   ├── config.js              # Environment settings and defaults
│   ├── bot\
│   │   ├── client.js          # Discord client setup & interaction router
│   │   ├── voiceTracker.js    # Core voice tracking engine & AFK detection
│   │   ├── deployCommands.js  # Discord REST API slash command registration
│   │   └── commands\          # Slash commands (/stats, /leaderboard, /active, /dashboard)
│   ├── database\
│   │   ├── db.js              # SQLite connection & schema (WAL mode)
│   │   └── queries.js         # Queries for sessions, leaderboards, stats, streaks
│   └── server\
│       ├── server.js          # Express web server & static frontend host
│       └── apiRoutes.js       # REST API endpoints & SSE real-time stream
├── public\                    # Web Dashboard Frontend
│   ├── index.html             # Dashboard UI
│   ├── css\style.css          # Sleek modern dark theme styling
│   └── js\app.js              # Frontend logic, Chart.js integrations, SSE listeners
├── scripts\
│   └── seedData.js            # Sample data generator for instant visual demo
├── .env                       # Environment configuration
├── .env.example
└── package.json
```

---

## 🛠️ Testing & Mock Data

To test or demonstrate the website with 14 days of realistic mock study data, run:
```bash
npm run seed
```
This populates sample student sessions across multiple study rooms, allowing you to explore the charts, leaderboards, and user modals immediately!
