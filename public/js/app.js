/**
 * StudyPulse — Personalized Discord Study Analytics & Channel Tracker
 */

// Application State
let selectedUserId = null;
let currentTrendDays = 7;
let currentTimeframe = 'today';
let trackedUsers = [];
let activeVoiceUsers = [];
let chartUserTrend = null;
let chartUserChannel = null;
let chartUserHourly = null;
let timerInterval = null;
let currentActiveSession = null;

// Helper: Format seconds to '2h 15m' or '45m' or '38s'
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (m > 0) {
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
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

// Helper: Format ISO date string
function formatTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
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

// Escape HTML strings
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 1. Fetch all members who have studied at least once
async function fetchTrackedUsers() {
  try {
    const res = await fetch('/api/users');
    const json = await res.json();
    if (!json.success || !json.data) return;

    trackedUsers = json.data;

    if (trackedUsers.length === 0) {
      document.getElementById('user-display-name').textContent = 'No members recorded yet';
      document.getElementById('user-handle').textContent = 'Join any voice channel in Discord to start tracking!';
      document.getElementById('member-chips-list').innerHTML = `
        <span style="font-size: 0.8rem; color: var(--text-muted);">Hop into any Discord voice channel to be detected automatically!</span>
      `;
      return;
    }

    renderMemberSelectors();

    // Determine initial user to select
    const urlParams = new URLSearchParams(window.location.search);
    const paramUser = urlParams.get('user') || urlParams.get('u') || urlParams.get('id');

    let initialId = null;
    if (paramUser) {
      const match = trackedUsers.find(u => 
        u.user_id === paramUser || 
        u.username.toLowerCase() === paramUser.toLowerCase() ||
        u.display_name.toLowerCase() === paramUser.toLowerCase()
      );
      if (match) initialId = match.user_id;
    }

    if (!initialId) {
      const saved = localStorage.getItem('studyPulseSelectedUser');
      if (saved && trackedUsers.some(u => u.user_id === saved)) {
        initialId = saved;
      }
    }

    if (!initialId) {
      initialId = trackedUsers[0].user_id;
    }

    selectUser(initialId);

  } catch (err) {
    console.error('Error fetching tracked users:', err);
  }
}

// Render dropdown and quick-switch pills
function renderMemberSelectors() {
  const dropdown = document.getElementById('nav-user-select');
  const chipsList = document.getElementById('member-chips-list');

  // Populate Navbar Dropdown
  dropdown.innerHTML = trackedUsers.map(u => `
    <option value="${u.user_id}">${escapeHtml(u.display_name)} (@${escapeHtml(u.username)})</option>
  `).join('');

  // Populate Quick-switch chips
  chipsList.innerHTML = trackedUsers.map(u => `
    <button class="member-chip ${u.user_id === selectedUserId ? 'active' : ''}" data-user-id="${u.user_id}">
      <img class="chip-avatar" src="${u.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="">
      <span class="chip-name">${escapeHtml(u.display_name)}</span>
      ${u.current_streak > 0 ? `<span style="font-size: 0.75rem;">🔥${u.current_streak}d</span>` : ''}
    </button>
  `).join('');

  // Attach chip click listeners
  chipsList.querySelectorAll('.member-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      selectUser(btn.dataset.userId);
    });
  });
}

// Select a specific member
function selectUser(userId) {
  if (!userId) return;
  selectedUserId = userId;
  localStorage.setItem('studyPulseSelectedUser', userId);

  // Update URL without page refresh
  const url = new URL(window.location);
  url.searchParams.set('user', userId);
  window.history.replaceState({}, '', url);

  // Update dropdown value
  const dropdown = document.getElementById('nav-user-select');
  if (dropdown) dropdown.value = userId;

  // Update active chip
  document.querySelectorAll('.member-chip').forEach(chip => {
    if (chip.dataset.userId === userId) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  loadPersonalDashboard(userId);
}

// 2. Load Personalized Analytics for Selected Member
async function loadPersonalDashboard(userId) {
  try {
    const res = await fetch(`/api/users/${userId}/analytics?days=${currentTrendDays}`);
    const json = await res.json();
    if (!json.success || !json.data) return;

    const { stats, channels, hourly, trends, sessions, activeSession } = json.data;

    // 1. Profile Hero Section
    const avatar = stats.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
    document.getElementById('user-avatar').src = avatar;
    document.getElementById('user-display-name').textContent = stats.displayName;
    document.getElementById('user-handle').textContent = `@${stats.username}`;
    document.getElementById('channel-breakdown-user-name').textContent = stats.displayName;

    // Rank & Streak
    document.getElementById('profile-rank-tag').textContent = stats.rank ? `🏆 Rank #${stats.rank}` : 'Unranked';
    document.getElementById('profile-streak-tag').textContent = stats.currentStreak > 0 ? `🔥 ${stats.currentStreak} Day Streak` : '🔥 0 Days';
    document.getElementById('profile-fav-channel').textContent = stats.favoriteChannel || 'None';
    document.getElementById('profile-session-count').textContent = stats.sessionCount || '0';
    document.getElementById('profile-last-active').textContent = stats.lastActive ? formatDate(stats.lastActive) : 'Today';

    // Live Voice Status
    const presenceDot = document.getElementById('user-presence-dot');
    const statusBadge = document.getElementById('profile-status-badge');
    const liveTimerWrap = document.getElementById('user-live-timer-wrap');

    if (activeSession) {
      currentActiveSession = activeSession;
      presenceDot.className = 'presence-dot online';
      statusBadge.className = 'badge-status active-voice';
      statusBadge.textContent = '🟢 In Voice Channel';
      liveTimerWrap.style.display = 'flex';
      document.getElementById('user-live-channel-name').textContent = `Studying in #${activeSession.channelName}`;
      document.getElementById('user-live-timer-val').textContent = formatDigitalTimer(activeSession.elapsedSeconds);
    } else {
      currentActiveSession = null;
      presenceDot.className = 'presence-dot offline';
      statusBadge.className = 'badge-status';
      statusBadge.textContent = '⚪ Offline';
      liveTimerWrap.style.display = 'none';
    }

    // 2. Personalized KPI Cards
    document.getElementById('user-today-time').textContent = formatDuration(stats.todaySeconds);
    document.getElementById('user-week-time').textContent = formatDuration(stats.weekSeconds);
    document.getElementById('user-month-time').textContent = formatDuration(stats.monthSeconds);
    document.getElementById('user-total-time').textContent = formatDuration(stats.totalSeconds);

    // 3. Channel Breakdown Render
    renderChannelBreakdown(channels, stats.totalSeconds);

    // 4. Personal Trends Chart
    renderPersonalTrendsChart(trends);

    // 5. Personal Hourly Chart
    renderPersonalHourlyChart(hourly);

    // 6. Personal Recent Sessions Table
    renderPersonalSessionsTable(sessions);

  } catch (err) {
    console.error('Error loading personal dashboard:', err);
  }
}

// 3. Render Channel Time Breakdown (Donut + Progress list)
function renderChannelBreakdown(channels, totalUserSeconds) {
  const container = document.getElementById('user-channels-list');

  if (!channels || channels.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 1.5rem;">
        <div class="empty-state-title">No channel records yet</div>
        <div class="empty-state-text">Join any voice channel to log your focus time here!</div>
      </div>
    `;
    if (chartUserChannel) chartUserChannel.destroy();
    return;
  }

  const safeTotal = totalUserSeconds > 0 ? totalUserSeconds : channels.reduce((sum, c) => sum + c.totalSeconds, 0);

  // Render list of channels with progress bars
  container.innerHTML = channels.map(c => {
    const percentage = safeTotal > 0 ? Math.min(100, Math.round((c.totalSeconds / safeTotal) * 100)) : 0;
    return `
      <div class="channel-row">
        <div class="channel-row-header">
          <span class="channel-name-title">
            <span>🔊</span> #${escapeHtml(c.channelName)}
          </span>
          <span class="channel-time-val">${formatDuration(c.totalSeconds)}</span>
        </div>
        <div class="channel-progress-track">
          <div class="channel-progress-fill" style="width: ${percentage}%;"></div>
        </div>
        <div class="channel-row-footer">
          <span>${percentage}% of study time</span>
          <span>${c.sessionCount} session${c.sessionCount === 1 ? '' : 's'}</span>
        </div>
      </div>
    `;
  }).join('');

  // Render Donut Chart
  const ctx = document.getElementById('userChannelChart').getContext('2d');
  if (chartUserChannel) chartUserChannel.destroy();

  const colors = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#3b82f6'];

  chartUserChannel = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: channels.map(c => `#${c.channelName}`),
      datasets: [{
        data: channels.map(c => Number((c.totalSeconds / 3600).toFixed(2)) || c.totalSeconds),
        backgroundColor: colors.slice(0, channels.length),
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#111827',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          callbacks: {
            label: context => {
              const item = channels[context.dataIndex];
              return ` ${item.channelName}: ${formatDuration(item.totalSeconds)}`;
            }
          }
        }
      },
      cutout: '70%'
    }
  });
}

// 4. Render Personal Daily Focus Trends Chart
function renderPersonalTrendsChart(trends) {
  const ctx = document.getElementById('userTrendChart').getContext('2d');
  if (chartUserTrend) chartUserTrend.destroy();

  const labels = trends.map(t => t.label);
  const hours = trends.map(t => t.totalHours);

  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)');
  gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

  chartUserTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Focus Hours',
        data: hours,
        borderColor: '#6366f1',
        borderWidth: 3,
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
          borderColor: 'rgba(99, 102, 241, 0.3)',
          borderWidth: 1,
          callbacks: {
            label: c => ` ${c.parsed.y} hours focused`
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
            callback: v => `${v}h`
          },
          beginAtZero: true
        }
      }
    }
  });
}

// 5. Render Peak Hours (24h) Chart
function renderPersonalHourlyChart(hourly) {
  const ctx = document.getElementById('userHourlyChart').getContext('2d');
  if (chartUserHourly) chartUserHourly.destroy();

  chartUserHourly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: hourly.map(h => h.label),
      datasets: [{
        label: 'Focus Time',
        data: hourly.map(h => h.totalHours),
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
            label: c => ` ${c.parsed.y} hrs`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { size: 8 }, maxTicksLimit: 8 }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { size: 8 } },
          beginAtZero: true
        }
      }
    }
  });
}

// 6. Render Personal Session History Table
function renderPersonalSessionsTable(sessions) {
  const tbody = document.getElementById('user-sessions-table-body');

  if (!sessions || sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No study sessions logged yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = sessions.map(s => `
    <tr>
      <td>
        <span class="channel-tag">🔊 #${escapeHtml(s.channel_name || 'Voice Room')}</span>
      </td>
      <td>${formatDate(s.joined_at)}</td>
      <td>${formatTime(s.joined_at)}</td>
      <td>${formatTime(s.left_at)}</td>
      <td>
        <span class="duration-pill">${formatDuration(s.duration_seconds)}</span>
      </td>
    </tr>
  `).join('');
}

// 7. Community Leaderboard
async function fetchLeaderboard(timeframe = 'today') {
  try {
    const res = await fetch(`/api/leaderboard?timeframe=${timeframe}`);
    const json = await res.json();
    if (!json.success || !json.data) return;

    const container = document.getElementById('leaderboard-container');
    const leaders = json.data;

    if (leaders.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 1.5rem;">
          <div class="empty-state-title">No sessions logged for this timeframe</div>
        </div>
      `;
      return;
    }

    container.innerHTML = leaders.map(u => {
      let rankBadgeClass = 'rank-regular';
      let rankContent = `#${u.rank}`;
      if (u.rank === 1) { rankBadgeClass = 'rank-gold'; rankContent = '🥇'; }
      else if (u.rank === 2) { rankBadgeClass = 'rank-silver'; rankContent = '🥈'; }
      else if (u.rank === 3) { rankBadgeClass = 'rank-bronze'; rankContent = '🥉'; }

      const streakTag = u.streak > 0 ? `<span class="streak-pill">🔥 ${u.streak}d streak</span>` : '';
      const isSelected = u.user_id === selectedUserId ? 'style="border-color: var(--primary); background: var(--bg-surface-elevated);"' : '';

      return `
        <div class="leader-item" data-user-id="${u.user_id}" ${isSelected} title="Click to view ${escapeHtml(u.display_name)}'s analytics">
          <div class="rank-badge ${rankBadgeClass}">${rankContent}</div>
          <img class="leader-avatar" src="${u.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="">
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

    // Attach click listeners to switch selected member
    container.querySelectorAll('.leader-item').forEach(item => {
      item.addEventListener('click', () => {
        selectUser(item.dataset.userId);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

  } catch (err) {
    console.error('Error fetching leaderboard:', err);
  }
}

// 8. Ticking Digital Timer for active user
function startLiveTicker() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!currentActiveSession) return;
    const now = Date.now();
    let elapsedMs = now - currentActiveSession.joinedAt - (currentActiveSession.totalPausedMs || 0);
    if (currentActiveSession.isPaused && currentActiveSession.pausedAt) {
      elapsedMs -= (now - currentActiveSession.pausedAt);
    }
    const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
    currentActiveSession.elapsedSeconds = elapsedSec;

    const el = document.getElementById('user-live-timer-val');
    if (el) {
      el.textContent = formatDigitalTimer(elapsedSec);
    }
  }, 1000);
}

// 9. Server-Sent Events (SSE) for Real-Time Sync
function connectSSE() {
  const eventSource = new EventSource('/api/events');

  eventSource.addEventListener('session_started', e => {
    try {
      const data = JSON.parse(e.data);
      showToast(`${data.user.displayName} joined #${data.user.channelName} 🎧`, '🟢');
      fetchTrackedUsers();
      if (data.user.userId === selectedUserId) {
        loadPersonalDashboard(selectedUserId);
      }
    } catch (err) {
      console.error(err);
    }
  });

  eventSource.addEventListener('session_ended', e => {
    try {
      const data = JSON.parse(e.data);
      showToast(`${data.user.displayName} finished studying (${data.formattedDuration}) 🎉`, '🔴');
      fetchTrackedUsers();
      fetchLeaderboard(currentTimeframe);
      if (data.user.userId === selectedUserId) {
        loadPersonalDashboard(selectedUserId);
      }
    } catch (err) {
      console.error(err);
    }
  });
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  // Initial fetch of detected users
  fetchTrackedUsers();
  fetchLeaderboard('today');
  startLiveTicker();
  connectSSE();

  // Navbar dropdown change
  document.getElementById('nav-user-select').addEventListener('change', e => {
    selectUser(e.target.value);
  });

  // Trend Days tab toggle (7, 14, 30 days)
  document.querySelectorAll('#trend-days-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#trend-days-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTrendDays = parseInt(btn.dataset.days, 10);
      if (selectedUserId) {
        loadPersonalDashboard(selectedUserId);
      }
    });
  });

  // Leaderboard timeframe tabs
  document.querySelectorAll('#timeframe-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#timeframe-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTimeframe = btn.dataset.timeframe;
      fetchLeaderboard(currentTimeframe);
    });
  });

  // Share Profile Link Button
  document.getElementById('btn-copy-link').addEventListener('click', () => {
    const url = new URL(window.location);
    if (selectedUserId) {
      url.searchParams.set('user', selectedUserId);
    }
    navigator.clipboard.writeText(url.toString()).then(() => {
      showToast('Profile link copied to clipboard!', '🔗');
    }).catch(() => {
      prompt('Copy your profile URL:', url.toString());
    });
  });

  // Refresh Sync Button
  document.getElementById('btn-refresh').addEventListener('click', () => {
    const icon = document.querySelector('#btn-refresh .spin-on-click');
    if (icon) icon.classList.add('active');

    Promise.all([
      fetchTrackedUsers(),
      fetchLeaderboard(currentTimeframe),
      selectedUserId ? loadPersonalDashboard(selectedUserId) : Promise.resolve()
    ]).finally(() => {
      setTimeout(() => {
        if (icon) icon.classList.remove('active');
        showToast('Personal analytics synced!', '⚡');
      }, 500);
    });
  });

  // Guide Modal
  const guideModal = document.getElementById('guide-modal');
  document.getElementById('btn-bot-guide').addEventListener('click', () => {
    guideModal.classList.add('active');
  });
  document.getElementById('btn-close-guide').addEventListener('click', () => {
    guideModal.classList.remove('active');
  });
  window.addEventListener('click', e => {
    if (e.target === guideModal) guideModal.classList.remove('active');
  });
});
