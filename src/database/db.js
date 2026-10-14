const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

// Ensure database directory exists
const dbPath = path.resolve(process.cwd(), config.database.path);
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrency and write speed
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Initialize schema
function initDatabase() {
  db.exec(`
    -- Registered or tracked user profiles
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      total_seconds INTEGER DEFAULT 0,
      current_streak INTEGER DEFAULT 0,
      last_active_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Completed study sessions
    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      guild_id TEXT NOT NULL,
      guild_name TEXT,
      channel_id TEXT NOT NULL,
      channel_name TEXT,
      joined_at TEXT NOT NULL,
      left_at TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      date TEXT NOT NULL, -- YYYY-MM-DD in local/server date
      hour_of_day INTEGER, -- 0-23
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user_profiles (user_id)
    );

    -- Indexes for fast dashboard and bot queries
    CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON study_sessions (user_id, date);
    CREATE INDEX IF NOT EXISTS idx_sessions_guild_date ON study_sessions (guild_id, date);
    CREATE INDEX IF NOT EXISTS idx_sessions_joined_at ON study_sessions (joined_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_duration ON study_sessions (duration_seconds);
  `);
}

initDatabase();

module.exports = db;
