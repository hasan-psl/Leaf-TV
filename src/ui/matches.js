/**
 * Leaf-TV — FIFA World Cup 2026 Match Ticker
 *
 * Data source: unofficial ESPN scoreboard API (no key required, no auth)
 * Refreshes every 30 s. Countdowns tick every 1 s via a separate interval.
 */

const ESPN_URL =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

// How many cards to show
const MAX_CARDS = 3;

// Round-of-X labels pulled from ESPN season type name
function roundLabel(event) {
  return event?.season?.slug
    ? event.season.slug
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    : 'FIFA World Cup 2026';
}

function flag(abbr) {
  // ESPN country logos
  return `https://a.espncdn.com/i/teamlogos/countries/500/${abbr.toLowerCase()}.png`;
}

function formatCountdown(targetDate) {
  const diff = targetDate - Date.now();
  if (diff <= 0) return 'Kick-off soon';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (h >= 1) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function localTime(isoDate) {
  return new Date(isoDate).toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'Asia/Dhaka'
  }) + ' (BST)';
}

// ─────────────────────────────────────────────────────────
export class MatchTicker {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this._fetchTimer = null;
    this._tickTimer = null;
    this._cards = []; // { el, matchDate, state }
  }

  async init() {
    if (!this.container) return;
    await this._fetchAndRender();
    // Re-fetch every 30 s for fresh live data
    this._fetchTimer = setInterval(() => this._fetchAndRender(), 30_000);
  }

  destroy() {
    clearInterval(this._fetchTimer);
    clearInterval(this._tickTimer);
  }

  // ── Private ───────────────────────────────────────────

  async _fetchAndRender() {
    try {
      const res = await fetch(ESPN_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const events = data.events ?? [];

      const live     = events.filter(e => e.status.type.state === 'in');
      const upcoming = events
        .filter(e => e.status.type.state === 'pre')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const finished = events
        .filter(e => e.status.type.state === 'post')
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      // Priority: live → upcoming → recently finished
      const selected = [...live, ...upcoming, ...finished].slice(0, MAX_CARDS);

      this._render(selected);
    } catch (err) {
      console.warn('[MatchTicker] Fetch failed:', err);
      // Keep showing whatever was rendered before
    }
  }

  _render(events) {
    if (!this.container) return;

    // Hide strip if nothing to show
    if (events.length === 0) {
      this.container.style.display = 'none';
      return;
    }
    this.container.style.display = 'flex';

    // Stop old countdown tick
    clearInterval(this._tickTimer);
    this._cards = [];

    this.container.innerHTML = '';

    // Header label
    const header = document.createElement('div');
    header.className = 'match-ticker-header';
    header.innerHTML = `<span class="match-ticker-fifa-logo">⚽</span> FIFA World Cup 2026`;
    this.container.appendChild(header);

    // Cards row
    const row = document.createElement('div');
    row.className = 'match-ticker-row';
    this.container.appendChild(row);

    events.forEach(event => {
      const comp = event.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');
      const state = event.status.type.state; // 'in' | 'pre' | 'post'
      const matchDate = new Date(event.date);

      const card = document.createElement('div');
      card.className = `match-card ${state === 'in' ? 'match-card--live' : state === 'post' ? 'match-card--ft' : 'match-card--upcoming'}`;

      if (state === 'in') {
        // ── LIVE ──
        const clock = event.status.displayClock || '';
        const period = event.status.period ?? 1;
        const periodLabel = period === 1 ? '1st' : period === 2 ? '2nd' : `ET ${period - 2}`;
        card.innerHTML = `
          <div class="match-badge match-badge--live">
            <span class="live-dot"></span> LIVE
          </div>
          <div class="match-teams-row">
            <div class="match-team">
              <img class="match-flag" src="${flag(home.team.abbreviation)}" alt="${home.team.abbreviation}" loading="lazy" />
              <span class="match-abbr">${home.team.abbreviation}</span>
            </div>
            <div class="match-score-block">
              <span class="match-score">${home.score} – ${away.score}</span>
              <span class="match-clock">${clock} <span class="match-period">${periodLabel}</span></span>
            </div>
            <div class="match-team">
              <img class="match-flag" src="${flag(away.team.abbreviation)}" alt="${away.team.abbreviation}" loading="lazy" />
              <span class="match-abbr">${away.team.abbreviation}</span>
            </div>
          </div>
          <div class="match-round">${roundLabel(event)}</div>
        `;
      } else if (state === 'pre') {
        // ── UPCOMING ──
        const countdownEl = document.createElement('span');
        countdownEl.className = 'match-countdown';
        countdownEl.textContent = formatCountdown(matchDate);
        this._cards.push({ el: countdownEl, matchDate });

        card.innerHTML = `
          <div class="match-badge match-badge--upcoming">⏰ UPCOMING</div>
          <div class="match-teams-row">
            <div class="match-team">
              <img class="match-flag" src="${flag(home.team.abbreviation)}" alt="${home.team.abbreviation}" loading="lazy" />
              <span class="match-abbr">${home.team.abbreviation}</span>
            </div>
            <div class="match-score-block">
              <span class="match-vs">vs</span>
              <span class="match-kickoff">${localTime(event.date)}</span>
              <span class="match-kickoff-date" style="font-size: 0.6rem; opacity: 0.7;">${matchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Dhaka' })}</span>
            </div>
            <div class="match-team">
              <img class="match-flag" src="${flag(away.team.abbreviation)}" alt="${away.team.abbreviation}" loading="lazy" />
              <span class="match-abbr">${away.team.abbreviation}</span>
            </div>
          </div>
          <div class="match-round">${roundLabel(event)}</div>
        `;
        // Append countdown below the teams row
        const extra = document.createElement('div');
        extra.className = 'match-countdown-wrap';
        extra.appendChild(countdownEl);
        card.appendChild(extra);
      } else {
        // ── FULL TIME ──
        const winner = home.winner ? home.team.abbreviation
                      : away.winner ? away.team.abbreviation
                      : null;
        card.innerHTML = `
          <div class="match-badge match-badge--ft">FT</div>
          <div class="match-teams-row">
            <div class="match-team ${home.winner ? 'match-team--winner' : ''}">
              <img class="match-flag" src="${flag(home.team.abbreviation)}" alt="${home.team.abbreviation}" loading="lazy" />
              <span class="match-abbr">${home.team.abbreviation}</span>
            </div>
            <div class="match-score-block">
              <span class="match-score">${home.score} – ${away.score}</span>
              ${winner ? `<span class="match-winner-label">${winner} wins</span>` : '<span class="match-winner-label">Draw</span>'}
            </div>
            <div class="match-team ${away.winner ? 'match-team--winner' : ''}">
              <img class="match-flag" src="${flag(away.team.abbreviation)}" alt="${away.team.abbreviation}" loading="lazy" />
              <span class="match-abbr">${away.team.abbreviation}</span>
            </div>
          </div>
          <div class="match-round">${roundLabel(event)}</div>
        `;
      }

      row.appendChild(card);
    });

    // Tick countdowns every second
    if (this._cards.length > 0) {
      this._tickTimer = setInterval(() => {
        this._cards.forEach(({ el, matchDate }) => {
          el.textContent = formatCountdown(matchDate);
        });
      }, 1_000);
    }
  }
}
