import './styles/index.css';
import './styles/background.css';
import './styles/matches.css';
import { themeController } from './core/theme';
import { backgroundSystem } from './core/background';
import { MatchTicker } from './ui/matches';
import { AppConfig } from './core/config';

async function bootstrap() {
  console.log('Bootstrapping Leaf-TV...');

  themeController.init();
  backgroundSystem.init('https://i.imgur.com/lHvqpbZ.jpeg');

  // Inject UI Structure
  document.querySelector('#app').innerHTML = `
    <header class="glass-navbar">
      <div class="navbar-brand" style="flex: 1;">
        <button class="mobile-menu-btn" id="mobile-menu-toggle">☰</button>
        <img src="https://github.com/hasan-psl/Leaf-TV/blob/main/resources/logo/logo.png?raw=true" alt="Leaf-TV logo" style="height: 28px; width: auto; display: block;" />
        Leaf-TV
      </div>
      
      <div id="nav-clock" style="display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace; text-align: center; line-height: 1.2;">
        <div id="nav-clock-time" style="font-size: 0.95rem; font-weight: 700; letter-spacing: 0.05em; color: var(--theme-accent);"></div>
        <div id="nav-clock-date" style="font-size: 0.7rem; font-weight: 500; opacity: 0.7; text-transform: uppercase;"></div>
      </div>
      
      <div class="navbar-controls" style="flex: 1; justify-content: flex-end;">
        <input type="text" class="search-input" placeholder="Search channels..." />
        <button class="glass-button" id="theme-toggle">Toggle Theme</button>
      </div>
    </header>
    
    <main class="main-layout">
      <!-- Left Sidebar: Channels -->
      <aside class="sidebar-left glass-panel" id="sidebar-left">
        <div id="channel-list-container"></div>
      </aside>
      
      <!-- Center: Match Ticker + Video Player -->
      <div class="player-column">
        <!-- FIFA World Cup match ticker -->
        <div class="match-ticker-strip" id="match-ticker" style="display:none;"></div>

        <!-- Video Player -->
        <div class="player-container" id="player-container">
          <video id="video" controls autoplay></video>
          <div id="player-error-overlay" class="player-error-overlay" style="display: none;"></div>
        </div>
      </div>
      
      <!-- Right Sidebar: Info & Stream Settings -->
      <aside class="sidebar-right glass-panel">
        <h2 class="now-playing-header">Now Playing</h2>
        <div class="now-playing-info">
          <div id="info-title" style="font-weight: 600; font-size: 1.1rem;">Select a channel</div>
          <div id="info-category" style="opacity: 0.8; font-size: 0.9rem;"></div>
        </div>
        
        <div class="playback-info-section" id="playback-info-section" style="margin-top: 24px; display: none;">
          <h3 class="section-heading">Playback Information</h3>
          <div class="playback-info-grid" id="playback-info-grid"></div>
        </div>

        <div class="stream-settings" style="margin-top: 20px; display: none;" id="stream-settings">
          <h3 class="section-heading">Stream Settings</h3>
          
          <div class="setting-group" id="audio-setting-group" style="margin-bottom: 16px;">
            <label style="display: block; font-size: 0.85rem; margin-bottom: 4px;">Audio Track</label>
            <select id="audio-select" class="glass-select"></select>
          </div>
          
          <div class="setting-group" id="quality-setting-group">
            <label style="display: block; font-size: 0.85rem; margin-bottom: 4px;">Video Quality</label>
            <select id="quality-select" class="glass-select"></select>
          </div>
        </div>

        <!-- Appearance Settings (always visible) -->
        <div class="appearance-settings" style="margin-top: 20px;">
          <h3 class="section-heading">Appearance</h3>
          <div class="setting-group">
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; cursor: pointer;" for="bg-animation-toggle">
              <span>Ambient Animation</span>
              <span id="bg-animation-status" style="font-size: 0.75rem; opacity: 0.7;"></span>
            </label>
            <button id="bg-animation-toggle" class="glass-button" style="width: 100%; margin-top: 6px;"></button>
          </div>
          <div class="setting-group" style="margin-top: 12px;">
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; cursor: pointer;" for="eco-mode-toggle">
              <span>Eco Mode (Low Perf.)</span>
              <span id="eco-mode-status" style="font-size: 0.75rem; opacity: 0.7;"></span>
            </label>
            <button id="eco-mode-toggle" class="glass-button" style="width: 100%; margin-top: 6px;"></button>
          </div>
        </div>
      </aside>
    </main>
    <footer style="position: absolute; bottom: 8px; width: 100%; text-align: center; font-size: 0.75rem; color: var(--theme-text); opacity: 0.7; z-index: 100; pointer-events: none;">
      Made by: <a href="https://github.com/hasan-psl" target="_blank" style="color: var(--theme-accent); text-decoration: none; font-weight: 600; pointer-events: auto;">Hasan Imroz</a>
    </footer>
  `;

  // Base UI Wiring
  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.addEventListener('click', () => themeController.toggleTheme());

  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const sidebarLeft = document.getElementById('sidebar-left');
  mobileMenuToggle.addEventListener('click', () => sidebarLeft.classList.toggle('open'));

  // Background animation toggle
  const bgAnimToggle = document.getElementById('bg-animation-toggle');
  const bgAnimStatus = document.getElementById('bg-animation-status');
  function syncBgAnimUI() {
    const enabled = backgroundSystem.isAnimationEnabled;
    bgAnimToggle.textContent = enabled ? '🍃 Disable Leaves' : '🍃 Enable Leaves';
    bgAnimStatus.textContent = enabled ? 'ON' : 'OFF';
    bgAnimStatus.style.color = enabled ? 'var(--theme-accent)' : 'inherit';
  }
  syncBgAnimUI();
  bgAnimToggle.addEventListener('click', () => {
    backgroundSystem.setAnimation();
    syncBgAnimUI();
  });

  // Eco Mode toggle
  const ecoModeToggle = document.getElementById('eco-mode-toggle');
  const ecoModeStatus = document.getElementById('eco-mode-status');
  function syncEcoModeUI() {
    const isEco = themeController.ecoMode;
    ecoModeToggle.textContent = isEco ? 'Disable Eco Mode' : 'Enable Eco Mode';
    ecoModeStatus.textContent = isEco ? 'ON' : 'OFF';
    ecoModeStatus.style.color = isEco ? 'var(--theme-accent)' : 'inherit';
  }
  syncEcoModeUI();
  ecoModeToggle.addEventListener('click', () => {
    themeController.setEcoMode(!themeController.ecoMode);
    syncEcoModeUI();
  });

  // Live Clock Logic
  const clockTimeEl = document.getElementById('nav-clock-time');
  const clockDateEl = document.getElementById('nav-clock-date');
  
  function updateClock() {
    const now = new Date();
    
    // hh : mm : ss P
    let timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    // Format to "hh : mm : ss AM/PM"
    timeStr = timeStr.replace(/:/g, ' : ');
    clockTimeEl.textContent = timeStr;
    
    // dd-mm-yyyy - weekday
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
    
    clockDateEl.textContent = `${day}-${month}-${year} - ${weekday}`;
  }
  
  updateClock();
  setInterval(updateClock, 1000);

  // Initialise FIFA World Cup match ticker (non-blocking)
  const matchTicker = new MatchTicker('match-ticker');
  matchTicker.init();

  // Load heavy components asynchronously to avoid blocking initial paint
  await initHeavyComponents();
}

async function initHeavyComponents() {
  // Player container reference for other potential uses
  const playerContainer = document.getElementById('player-container');

  // Dynamically import heavy modules
  const [{ PlayerSystem }, { PlaylistLoaderSystem }] = await Promise.all([
    import('./player/player'),
    import('./core/playlist')
  ]);

  // Initialize Player
  const playerSystem = new PlayerSystem('video', 'player-error-overlay');
  
  // Wire up track UI updates
  const streamSettings    = document.getElementById('stream-settings');
  const audioGroup        = document.getElementById('audio-setting-group');
  const audioSelect       = document.getElementById('audio-select');
  const qualityGroup      = document.getElementById('quality-setting-group');
  const qualitySelect     = document.getElementById('quality-select');
  const pbInfoSection     = document.getElementById('playback-info-section');
  const pbInfoGrid        = document.getElementById('playback-info-grid');

  // Playback info field definitions (key → label)
  const PB_FIELDS = [
    ['resolution',     'Resolution'],
    ['fps',            'Frame Rate'],
    ['videoCodec',     'Video Codec'],
    ['videoBitrate',   'Video Bitrate'],
    ['audioCodec',     'Audio Codec'],
    ['audioChannels',  'Audio Channels'],
    ['audioSampleRate','Sample Rate'],
    ['audioBitrate',   'Audio Bitrate'],
    ['audioLanguage',  'Audio Lang'],
    ['downloadSpeed',  'Download Speed'],
  ];

  function renderPlaybackInfo(info) {
    pbInfoGrid.innerHTML = '';
    const hasAny = PB_FIELDS.some(([key]) => info && info[key]);
    if (!hasAny) {
      pbInfoSection.style.display = 'none';
      return;
    }
    pbInfoSection.style.display = 'block';
    PB_FIELDS.forEach(([key, label]) => {
      if (!info[key]) return;
      const row = document.createElement('div');
      row.className = 'pb-info-row';
      row.innerHTML = `<span class="pb-info-label">${label}</span><span class="pb-info-value">${info[key]}</span>`;
      pbInfoGrid.appendChild(row);
    });
  }
  
  playerSystem.onTracksChangedCallback = ({ audioTracks, qualities, currentLang, currentQuality, activeAudioId, activeQualityId, playbackInfo }) => {
    streamSettings.style.display = 'block';
    renderPlaybackInfo(playbackInfo);
    
    // Setup Audio Dropdown
    audioGroup.style.display = 'block';
    audioSelect.innerHTML = '';
    
    if (audioTracks && audioTracks.length > 0) {
      audioTracks.forEach(track => {
        const option = document.createElement('option');
        option.value = track.id; // index in hls.audioTracks
        const lang = track.language || 'und';
        const displayMap = { 'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 'und': 'Default' };
        const langLabel = displayMap[lang] || lang;
        option.textContent = track.name && track.name !== langLabel ? `${langLabel} (${track.name})` : langLabel;
        
        if (track.id === activeAudioId) {
          option.selected = true;
        }
        audioSelect.appendChild(option);
      });
    } else {
      const option = document.createElement('option');
      option.value = 'default';
      option.textContent = 'Default / Main';
      audioSelect.appendChild(option);
    }
    
    // Setup Quality Dropdown
    qualityGroup.style.display = 'block';
    qualitySelect.innerHTML = '';
    
    if (qualities && qualities.length > 0) {
      const autoOption = document.createElement('option');
      autoOption.value = 'auto';
      autoOption.textContent = 'Auto (Adaptive)';
      if (currentQuality === 'auto' || activeQualityId === -1) {
        autoOption.selected = true;
      }
      qualitySelect.appendChild(autoOption);

      qualities.forEach(level => {
        const option = document.createElement('option');
        option.value = level.id; // index in hls.levels
        option.textContent = level.name;
        if (level.id === activeQualityId && currentQuality !== 'auto') {
          option.selected = true;
        }
        qualitySelect.appendChild(option);
      });
    } else {
      const option = document.createElement('option');
      option.value = 'source';
      option.textContent = 'Source Quality';
      qualitySelect.appendChild(option);
    }
  };

  // Wire up select event listeners
  audioSelect.addEventListener('change', (e) => {
    playerSystem.setAudioLanguage(e.target.value);
  });
  
  qualitySelect.addEventListener('change', (e) => {
    playerSystem.setVideoQuality(e.target.value);
  });

  const isPlayerReady = await playerSystem.init();

  if (isPlayerReady) {
    const playlistLoader = new PlaylistLoaderSystem(AppConfig.PLAYLIST_URL);
    const { channels, grouped } = await playlistLoader.fetchPlaylist();

    const channelListContainer = document.getElementById('channel-list-container');
    const infoTitle = document.getElementById('info-title');
    const infoCategory = document.getElementById('info-category');
    
    for (const [category, categoryChannels] of Object.entries(grouped)) {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'channel-list-group';
      
      const groupHeader = document.createElement('h3');
      groupHeader.textContent = category;
      groupDiv.appendChild(groupHeader);
      
      const ul = document.createElement('ul');
      ul.className = 'channel-list';
      
      categoryChannels.forEach(channel => {
        const li = document.createElement('li');
        li.className = 'channel-item';
        
        if (channel.logo) {
          const img = document.createElement('img');
          img.src = channel.logo;
          img.style.width = '24px';
          img.style.height = '24px';
          img.style.objectFit = 'contain';
          img.style.borderRadius = '4px';
          li.appendChild(img);
        }
        
        const titleSpan = document.createElement('span');
        titleSpan.textContent = channel.title;
        li.appendChild(titleSpan);

        li.addEventListener('click', () => {
          document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
          li.classList.add('active');
          
          infoTitle.textContent = channel.title;
          infoCategory.textContent = channel.category;
          
          document.getElementById('sidebar-left')?.classList.remove('open');
          
          // Reset UI state before new stream loads
          streamSettings.style.display = 'none';
          
          playerSystem.loadStream(channel.streamUrl);
        });
        
        ul.appendChild(li);
      });
      
      groupDiv.appendChild(ul);
      channelListContainer.appendChild(groupDiv);
    }
    
    if (channels.length > 0) {
      const firstChannel = channels[0];
      infoTitle.textContent = firstChannel.title;
      infoCategory.textContent = firstChannel.category;
      
      const firstLi = channelListContainer.querySelector('.channel-item');
      if (firstLi) firstLi.classList.add('active');
      
      playerSystem.loadStream(firstChannel.streamUrl);
    }
    
    // --- Keyboard Shortcuts ---
    document.addEventListener('keydown', (e) => {
      // Ignore if user is typing in a search input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }

      const video = document.getElementById('video');
      const channelItems = Array.from(document.querySelectorAll('.channel-item'));
      const currentIndex = channelItems.findIndex(el => el.classList.contains('active'));

      switch(e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (currentIndex > 0) {
            channelItems[currentIndex - 1].click();
            channelItems[currentIndex - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (currentIndex < channelItems.length - 1 && currentIndex !== -1) {
            channelItems[currentIndex + 1].click();
            channelItems[currentIndex + 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (video && video.currentTime > 5) {
            video.currentTime -= 5;
          } else if (video) {
            video.currentTime = 0;
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (video && video.duration) {
            video.currentTime = Math.min(video.currentTime + 5, video.duration);
          }
          break;
        case ' ': // Space
          e.preventDefault();
          if (video) {
            if (video.paused) {
              video.play();
            } else {
              video.pause();
            }
          }
          break;
        case 'f':
        case 'F':
        case 'Enter':
          e.preventDefault();
          if (!document.fullscreenElement) {
            if (video && video.requestFullscreen) {
              video.requestFullscreen();
            } else if (video && video.webkitRequestFullscreen) { // Safari fallback
              video.webkitRequestFullscreen();
            }
          } else {
            if (document.exitFullscreen) {
              document.exitFullscreen();
            }
          }
          break;
      }
    });
  }
}

bootstrap();
