/**
 * StudyPulse — Discord Study Tracker Frontend Application
 */

// State
let currentTimeframe = 'today';
let activeSessions = [];
let chartTrend = null;
let chartHourly = null;
let chartChannel = null;
let chartModalUser = null;
let timerInterval = null;

// Helper: Format seconds to '2h 15m' or '45m'
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (m > 0) {
    return `${m}m`;
  }
  return `${s}s`;
}

// Helper: Format seconds to '01:24:32' for live digital timer
function formatDigitalTimer(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = n => String(n).padStart(2, '0');
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

// Helper: Format ISO date string to readable time
function formatTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Show Toast notification
function showToast(message, icon = '🔔') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span style="font-size: 1.2rem;">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// 1. Fetch & Render Overview Metrics
async function fetchOverview() {
  try {
    const res = await fetch('/api/stats/overview');
    const json = await res.json();
    if (!json.success) return;

    const data = json.data;

    // Today's Focus Hours
    const todaySec = data.today.totalSeconds || 0;
    document.getElementById('kpi-today-hours').textContent = formatDuration(todaySec);
    document.getElementById('kpi-today-sessions-count').textContent = 
      `${data.today.sessionsCount} session${data.today.sessionsCount === 1 ? '' : 's'} recorded today`;

    // Active Now
    document.getElementById('kpi-active-count').textContent = data.activeNowCount;
    document.getElementById('active-badge-pill').textContent = `${data.activeNowCount} Active`;

    // Top Hero of the day
    if (data.today.topUser) {
      document.getElementById('kpi-top-hero-name').textContent = data.today.topUser.display_name || data.today.topUser.username;
      document.getElementById('kpi-top-hero-time').textContent = `${formatDuration(data.today.topUser.seconds)} studied today`;
    } else {
      document.getElementById('kpi-top-hero-name').textContent = '—';
      document.getElementById('kpi-top-hero-time').textContent = 'No sessions yet today';
    }

    // All-time
    const allTimeHours = Math.round((data.allTimeSeconds || 0) / 3600);
    document.getElementById('kpi-alltime-hours').textContent = `${allTimeHours}h`;
    document.getElementById('kpi-total-members-count').textContent = `${data.totalStudents} total members tracked`;

  } catch (err) {
    console.error('Error fetching overview stats:', err);
  }
}

// 2. Fetch & Render Live Voice Participants
async function fetchActiveUsers() {
  try {
    const res = await fetch('/api/active');
    const json = await res.json();
    if (!json.success) return;

    activeSessions = json.data;
    renderLiveCards();
  } catch (err) {
    console.error('Error fetching active voice users:', err);
  }
}

function renderLiveCards() {
  const container = document.getElementById('live-cards-grid');

  if (activeSessions.length === 0) {
    container.innerHTML = `
      <div class="empty-state" id="empty-live-state">
        <div class="empty-state-icon">🎧</div>
        <div class="empty-state-title">No one is in study channels right now</div>
        <div class="empty-state-text">Join any voice channel on Discord to start your focus session and appear here!</div>
      </div>
    `;
    return;
  }

  container.innerHTML = activeSessions.map(user => `
    <div class="live-user-card" data-user-id="${user.userId}">
      <div class="user-avatar-wrap">
        <img class="user-avatar" src="${user.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="${user.displayName}">
        <span class="avatar-badge-active"></span>
      </div>
      <div class="live-user-info">
        <div class="live-user-name">${escapeHtml(user.displayName)}</div>
        <div class="live-user-channel">
          <span>🔊</span> #${escapeHtml(user.channelName)}
        </div>
      </div>
      <div class="live-timer-badge">
        <div class="live-timer-val" id="timer-${user.userId}">${formatDigitalTimer(user.elapsedSeconds)}</div>
        <div class="live-timer-label">In Session</div>
      </div>
    </div>
  `).join('');

  // Attach click listener to open profile
  container.querySelectorAll('.live-user-card').forEach(card => {
    card.addEventListener('click', () => {
      openUserModal(card.dataset.userId);
    });
  });
}

// 3. Ticking Timer for Live Cards
function startLiveTicker() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (activeSessions.length === 0) return;
    const now = Date.now();
    activeSessions.forEach(session => {
      let elapsedMs = now - session.joinedAt - (session.totalPausedMs || 0);
      if (session.isPaused && session.pausedAt) {
        elapsedMs -= (now - session.pausedAt);
      }
      const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
      session.elapsedSeconds = elapsedSec;

      const el = document.getElementById(`timer-${session.userId}`);
      if (el) {
        el.textContent = formatDigitalTimer(elapsedSec);
      }
    });
  }, 1000);
}

// 4. Fetch & Render Leaderboard
async function fetchLeaderboard(timeframe = 'today') {
  const container = document.getElementById('leaderboard-container');
  try {
    const res = await fetch(`/api/leaderboard?timeframe=${timeframe}`);
    const json = await res.json();
    if (!json.success) return;

    window._leaderboardData = json.data;
    renderLeaderboardList(json.data);
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    container.innerHTML = `<div class="empty-state">Failed to load leaderboard data</div>`;
  }
}

function renderLeaderboardList(users) {
  const container = document.getElementById('leaderboard-container');
  const searchVal = (document.getElementById('leaderboard-search-input').value || '').toLowerCase().trim();

  const filtered = users.filter(u => 
    (u.display_name && u.display_name.toLowerCase().includes(searchVal)) ||
    (u.username && u.username.toLowerCase().includes(searchVal))
  );

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 1.5rem;">
        <div style="font-size: 1.5rem; margin-bottom: 0.35rem;">🔍</div>
        <div class="empty-state-title">No participants found</div>
        <div class="empty-state-text">Try another search or timeframe.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(u => {
    let rankBadgeClass = 'rank-regular';
    let rankContent = `#${u.rank}`;
    if (u.rank === 1) {
      rankBadgeClass = 'rank-gold';
      rankContent = '🥇';
    } else if (u.rank === 2) {
      rankBadgeClass = 'rank-silver';
      rankContent = '🥈';
    } else if (u.rank === 3) {
      rankBadgeClass = 'rank-bronze';
      rankContent = '🥉';
    }

    const streakTag = u.streak > 0 ? `<span class="streak-pill">🔥 ${u.streak}d streak</span>` : '';
    const avatar = u.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';

    return `
      <div class="leader-item" data-user-id="${u.user_id}">
        <div class="rank-badge ${rankBadgeClass}">${rankContent}</div>
        <img class="leader-avatar" src="${avatar}" alt="${escapeHtml(u.display_name)}">
        <div class="leader-info">
          <div class="leader-name">${escapeHtml(u.display_name)}</div>
          <div class="leader-meta">
            <span>@${escapeHtml(u.username)}</span>
            ${streakTag ? '<span>•</span> ' + streakTag : ''}
          </div>
        </div>
        <div class="leader-time">
          <div class="leader-hours">${formatDuration(u.total_seconds)}</div>
          <div class="leader-sessions-count">${u.session_count} session${u.session_count === 1 ? '' : 's'}</div>
        </div>
      </div>
    `;
  }).join('');

  // Attach click listener for modal
  container.querySelectorAll('.leader-item').forEach(item => {
    item.addEventListener('click', () => {
      openUserModal(item.dataset.userId);
    });
  });
}

// 5. Fetch & Render Trend & Distribution Charts
async function fetchTrendsChart() {
  try {
    const res = await fetch('/api/trends?days=14');
    const json = await res.json();
    if (!json.success) return;

    const data = json.data;
    const labels = data.map(d => d.label);
    const hours = data.map(d => d.totalHours);

    const ctx = document.getElementById('trendChart').getContext('2d');
    if (chartTrend) chartTrend.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.45)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

    chartTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Hours Studied',
          data: hours,
          borderColor: '#6366f1',
          borderWidth: 2.5,
          pointBackgroundColor: '#818cf8',
          pointBorderColor: '#0a0e17',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          backgroundColor: gradient,
          tension: 0.35
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111827',
            titleColor: '#f8fafc',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(99, 102, 241, 0.3)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: context => ` ${context.parsed.y} hours total`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#64748b',
              font: { size: 10 },
              callback: val => `${val}h`
            },
            beginAtZero: true
          }
        }
      }
    });

  } catch (err) {
    console.error('Error fetching trends chart:', err);
  }
}

async function fetchHourlyAndChannelCharts() {
  try {
    // 1. Hourly Chart
    const resH = await fetch('/api/distribution/hourly');
    const jsonH = await resH.json();
    if (jsonH.success) {
      const hData = jsonH.data;
      const ctxH = document.getElementById('hourlyChart').getContext('2d');
      if (chartHourly) chartHourly.destroy();

      chartHourly = new Chart(ctxH, {
        type: 'bar',
        data: {
          labels: hData.map(d => d.label),
          datasets: [{
            data: hData.map(d => d.totalHours),
            backgroundColor: 'rgba(139, 92, 246, 0.65)',
            hoverBackgroundColor: '#8b5cf6',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#111827',
              borderColor: 'rgba(139, 92, 246, 0.3)',
              borderWidth: 1,
              callbacks: {
                label: c => ` ${c.parsed.y} hrs studied`
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                color: '#64748b',
                font: { size: 8 },
                maxTicksLimit: 8
              }
            },
            y: {
              display: false,
              beginAtZero: true
            }
          }
        }
      });
    }

    // 2. Channel Distribution Doughnut Chart
    const resC = await fetch('/api/distribution/channels');
    const jsonC = await resC.json();
    if (jsonC.success) {
      const cData = jsonC.data;
      const ctxC = document.getElementById('channelChart').getContext('2d');
      if (chartChannel) chartChannel.destroy();

      const colors = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6'];

      chartChannel = new Chart(ctxC, {
        type: 'doughnut',
        data: {
          labels: cData.map(c => c.channelName),
          datasets: [{
            data: cData.map(c => c.totalHours),
            backgroundColor: colors.slice(0, cData.length),
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: '#94a3b8',
                font: { size: 9 },
                boxWidth: 8,
                padding: 6
              }
            },
            tooltip: {
              backgroundColor: '#111827',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              callbacks: {
                label: c => ` ${c.label}: ${c.parsed} hrs`
              }
            }
          },
          cutout: '65%'
        }
      });
    }

  } catch (err) {
    console.error('Error fetching distribution charts:', err);
  }
}

// 6. Fetch & Render Recent Sessions Table
async function fetchRecentSessions() {
  try {
    const res = await fetch('/api/sessions?limit=15');
    const json = await res.json();
    if (!json.success) return;

    const tbody = document.getElementById('sessions-table-body');
    const sessions = json.data;

    if (sessions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No study sessions recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = sessions.map(s => `
      <tr>
        <td>
          <div class="user-cell">
            <img class="user-cell-avatar" src="${s.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="">
            <div>
              <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(s.display_name || s.username)}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">@${escapeHtml(s.username)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="channel-tag">🔊 #${escapeHtml(s.channel_name || 'Study Room')}</span>
        </td>
        <td>${formatDate(s.joined_at)} ${formatTime(s.joined_at)}</td>
        <td>${formatDate(s.left_at)} ${formatTime(s.left_at)}</td>
        <td>
          <span class="duration-pill">${formatDuration(s.duration_seconds)}</span>
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openUserModal('${s.user_id}')">Stats</button>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Error fetching recent sessions:', err);
  }
}

// 7. Member Profile Modal
async function openUserModal(userId) {
  const modal = document.getElementById('user-modal');
  const header = document.getElementById('modal-profile-header');
  const body = document.getElementById('modal-profile-body');

  header.innerHTML = `<div class="loading-spinner-wrap"><div class="spinner"></div></div>`;
  body.innerHTML = '';
  modal.classList.add('active');

  try {
    const res = await fetch(`/api/users/${userId}`);
    const json = await res.json();
    if (!json.success) {
      header.innerHTML = `<div class="empty-state">User profile not found.</div>`;
      return;
    }

    const { stats, history, activeSession } = json.data;
    const avatar = stats.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';

    header.innerHTML = `
      <div class="modal-profile-top">
        <img class="modal-profile-avatar" src="${avatar}" alt="${escapeHtml(stats.displayName)}">
        <div>
          <h2 class="modal-profile-title">${escapeHtml(stats.displayName)}</h2>
          <div class="modal-profile-handle">@${escapeHtml(stats.username)}</div>
          <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
            ${stats.rank ? `<span class="badge-count" style="background: rgba(99,102,241,0.2); color: #818cf8; border-color: rgba(99,102,241,0.4);">Rank #${stats.rank}</span>` : ''}
            ${stats.currentStreak > 0 ? `<span class="badge-count" style="background: rgba(245,158,11,0.2); color: #f59e0b; border-color: rgba(245,158,11,0.4);">🔥 ${stats.currentStreak} Day Streak</span>` : ''}
            ${activeSession ? `<span class="badge-count" style="background: rgba(16,185,129,0.2); color: #10b981; border-color: rgba(16,185,129,0.4);">🟢 In #${escapeHtml(activeSession.channelName)}</span>` : ''}
          </div>
        </div>
      </div>
    `;

    body.innerHTML = `
      <div class="modal-kpi-grid">
        <div class="modal-kpi-item">
          <div class="modal-kpi-label">Today</div>
          <div class="modal-kpi-val">${formatDuration(stats.todaySeconds)}</div>
        </div>
        <div class="modal-kpi-item">
          <div class="modal-kpi-label">This Week</div>
          <div class="modal-kpi-val">${formatDuration(stats.weekSeconds)}</div>
        </div>
        <div class="modal-kpi-item">
          <div class="modal-kpi-label">All-Time</div>
          <div class="modal-kpi-val">${formatDuration(stats.totalSeconds)}</div>
        </div>
      </div>

      <div style="font-size: 0.825rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
        <span>🎧 <strong>Favorite Study Room:</strong> ${escapeHtml(stats.favoriteChannel || 'None')}</span><br>
        <span>📝 <strong>Completed Sessions:</strong> ${stats.sessionCount || 0}</span>
      </div>

      <div class="modal-chart-section">
        <div class="modal-chart-title">14-Day Focus History</div>
        <div class="modal-chart-wrap">
          <canvas id="userHistoryChart"></canvas>
        </div>
      </div>
    `;

    // Render User Personal Chart
    const ctxModal = document.getElementById('userHistoryChart').getContext('2d');
    if (chartModalUser) chartModalUser.destroy();

    chartModalUser = new Chart(ctxModal, {
      type: 'bar',
      data: {
        labels: history.map(h => h.label),
        datasets: [{
          label: 'Hours',
          data: history.map(h => h.totalHours),
          backgroundColor: '#6366f1',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: c => ` ${c.parsed.y} hrs`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 7 }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#64748b', font: { size: 9 } },
            beginAtZero: true
          }
        }
      }
    });

  } catch (err) {
    console.error('Error loading user profile:', err);
    header.innerHTML = `<div class="empty-state">Failed to load user statistics.</div>`;
  }
}

// 8. Server-Sent Events (SSE) for Real-Time Live Sync
function connectSSE() {
  const eventSource = new EventSource('/api/events');

  eventSource.addEventListener('session_started', e => {
    try {
      const data = JSON.parse(e.data);
      showToast(`${data.user.displayName} joined #${data.user.channelName} 🎧`, '🟢');
      fetchActiveUsers();
      fetchOverview();
    } catch (err) {
      console.error(err);
    }
  });

  eventSource.addEventListener('session_ended', e => {
    try {
      const data = JSON.parse(e.data);
      showToast(`${data.user.displayName} finished studying (${data.formattedDuration}) 🎉`, '🔴');
      fetchActiveUsers();
      fetchOverview();
      fetchLeaderboard(currentTimeframe);
      fetchRecentSessions();
      fetchTrendsChart();
      fetchHourlyAndChannelCharts();
    } catch (err) {
      console.error(err);
    }
  });

  eventSource.onerror = () => {
    document.getElementById('voice-connection-status').textContent = 'Reconnecting...';
  };

  eventSource.onopen = () => {
    document.getElementById('voice-connection-status').textContent = 'Live Tracking Active';
  };
}

// Helper: Escape HTML strings to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  // Update live date text
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
  document.getElementById('live-datetime-text').textContent = new Date().toLocaleDateString('en-US', dateOptions);

  // Initial Data Fetches
  fetchOverview();
  fetchActiveUsers();
  fetchLeaderboard('today');
  fetchTrendsChart();
  fetchHourlyAndChannelCharts();
  fetchRecentSessions();
  startLiveTicker();
  connectSSE();

  // Tab switching (Today / Week / Month / All-Time)
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTimeframe = btn.dataset.timeframe;
      fetchLeaderboard(currentTimeframe);
    });
  });

  // Search input filter
  const searchInput = document.getElementById('leaderboard-search-input');
  searchInput.addEventListener('input', () => {
    if (window._leaderboardData) {
      renderLeaderboardList(window._leaderboardData);
    }
  });

  // Refresh Sync Button
  const refreshBtn = document.getElementById('btn-refresh');
  refreshBtn.addEventListener('click', () => {
    const icon = refreshBtn.querySelector('.spin-on-click');
    if (icon) icon.classList.add('active');

    Promise.all([
      fetchOverview(),
      fetchActiveUsers(),
      fetchLeaderboard(currentTimeframe),
      fetchTrendsChart(),
      fetchHourlyAndChannelCharts(),
      fetchRecentSessions()
    ]).finally(() => {
      setTimeout(() => {
        if (icon) icon.classList.remove('active');
        showToast('Analytics synced with server', '⚡');
      }, 500);
    });
  });

  // Modal Closures
  const userModal = document.getElementById('user-modal');
  const guideModal = document.getElementById('guide-modal');

  document.getElementById('btn-close-modal').addEventListener('click', () => {
    userModal.classList.remove('active');
  });

  document.getElementById('btn-close-guide').addEventListener('click', () => {
    guideModal.classList.remove('active');
  });

  document.getElementById('btn-bot-guide').addEventListener('click', () => {
    guideModal.classList.add('active');
  });

  window.addEventListener('click', e => {
    if (e.target === userModal) userModal.classList.remove('active');
    if (e.target === guideModal) guideModal.classList.remove('active');
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      userModal.classList.remove('active');
      guideModal.classList.remove('active');
    }
  });
});
