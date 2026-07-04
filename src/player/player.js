import Hls from 'hls.js';
import mpegts from 'mpegts.js';

/**
 * PlayerSystem — dual-engine video player
 *
 *  • .m3u8 / HLS  → HLS.js
 *  • .ts  (raw MPEG-TS live stream) → mpegts.js
 *  • Safari / iOS → native HLS (no library needed)
 */
export class PlayerSystem {
  constructor(videoElementId, errorOverlayId) {
    this.videoElementId = videoElementId;
    this.errorOverlayId = errorOverlayId;

    this.hls    = null; // HLS.js instance
    this.mts    = null; // mpegts.js instance
    this.videoElement = null;
    this.onTracksChangedCallback = null;

    this.prefLanguage = localStorage.getItem('player-pref-lang')    || 'und';
    this.prefQuality  = localStorage.getItem('player-pref-quality') || 'auto';
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  async init() {
    this.videoElement = document.getElementById(this.videoElementId);
    if (!this.videoElement) {
      console.error('[Player] Video element not found');
      return false;
    }

    const hlsOk  = Hls.isSupported();
    const mtsOk  = mpegts.isSupported();
    const nativeHls = !!this.videoElement.canPlayType('application/vnd.apple.mpegurl');

    if (!hlsOk && !nativeHls) {
      this.showErrorOverlay('Your browser does not support HLS streaming.');
      return false;
    }
    if (!mtsOk) {
      console.warn('[Player] mpegts.js not supported — .ts streams may not play');
    }

    console.log(`[Player] Ready  HLS.js=${hlsOk}  mpegts.js=${mtsOk}  native-HLS=${nativeHls}`);
    return true;
  }

  // ─── Load ─────────────────────────────────────────────────────────────────

  async loadStream(url) {
    if (!this.videoElement) return;

    this.hideErrorOverlay();
    this._destroyAll();

    const streamUrl = url.trim();
    console.log('[Player] Loading:', streamUrl);

    // Route by URL type
    if (this._isTsUrl(streamUrl)) {
      this._loadMpegTs(streamUrl);
    } else {
      this._loadHls(streamUrl);
    }
  }

  /** True for bare .ts streams (raw MPEG-TS, NOT HLS segments) */
  _isTsUrl(url) {
    // Match a path ending in .ts (with optional query string)
    return /\.ts(\?.*)?$/i.test(url);
  }

  // ─── HLS.js engine ────────────────────────────────────────────────────────

  _loadHls(url) {
    // Safari / iOS: native HLS — no library needed
    if (!Hls.isSupported()) {
      this.videoElement.src = url;
      this.videoElement.play().catch(e => console.warn('[Player] Autoplay blocked:', e));
      return;
    }

    this.hls = new Hls({
      manifestLoadingMaxRetry:       6,
      manifestLoadingRetryDelay:     500,
      manifestLoadingMaxRetryTimeout: 8000,
      levelLoadingMaxRetry:          6,
      levelLoadingRetryDelay:        500,
      fragLoadingMaxRetry:           6,
      fragLoadingRetryDelay:         500,
      maxBufferLength:               60,          // Increased for smoother high-res playback
      maxMaxBufferLength:            120,         // Allow larger buffer overall
      maxBufferSize:                 120 * 1000 * 1000, // 120MB buffer limit (prevents early dumping)
      liveSyncDurationCount:         5,           // Stay further from the live edge to prevent stuttering
      enableWorker:                  true,
      startLevel:                    -1,          // Automatic initial quality
      abrEwmaDefaultEstimate:        1500000,     // Start at 1.5 Mbps to avoid initial high-res freezing
    });

    this.hls.loadSource(url);
    this.hls.attachMedia(this.videoElement);

    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('[Player] HLS manifest parsed — playing');
      this.videoElement.play().catch(e => console.warn('[Player] Autoplay blocked:', e));
      this._applyPersistedQuality();
      this._applyPersistedAudio();
      this._notifyTracksChanged();
    });

    this.hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => this._notifyTracksChanged());
    this.hls.on(Hls.Events.LEVEL_SWITCHED,        () => this._notifyTracksChanged());
    this.hls.on(Hls.Events.FRAG_CHANGED,          () => this._notifyTracksChanged());

    this.hls.on(Hls.Events.ERROR, (_evt, data) => {
      console.warn('[HLS Error]', data.type, data.details, data.fatal ? '(FATAL)' : '');
      if (!data.fatal) return;

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        console.warn('[Player] Fatal network error — retrying...');
        this.hls.startLoad();
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        console.warn('[Player] Fatal media error — recovering...');
        this.hls.recoverMediaError();
      } else {
        this.hls.destroy();
        this.hls = null;
        this.showErrorOverlay(this._hlsErrorMessage(data));
      }
    });
  }

  // ─── mpegts.js engine ─────────────────────────────────────────────────────

  _loadMpegTs(url) {
    if (!mpegts.isSupported()) {
      this.showErrorOverlay('Raw .ts streams require MSE support (not available in this browser).');
      return;
    }

    this.mts = mpegts.createPlayer(
      {
        type:          'mpegts',
        url,
        isLive:        true,   // treat as live — don't buffer the whole file
        hasVideo:      true,
        hasAudio:      true,
        cors:          true,
      },
      {
        enableWorker:           true,
        liveBufferLatencyChasing: false,  // Disable aggressive latency chasing to stop frame drops & choppiness
        fixAudioTimestampGap:   true,

        // Aggressive recovery
        autoCleanupSourceBuffer:  true,
        autoCleanupMaxBackwardDuration: 30,
        autoCleanupMinBackwardDuration: 10,

        // Retry on network errors
        ioConfig: {
          fetchTimeout:           10000,
        },
      }
    );

    this.mts.attachMediaElement(this.videoElement);
    this.mts.load();

    this.mts.on(mpegts.Events.MEDIA_INFO, () => {
      console.log('[Player] mpegts MEDIA_INFO — playing');
      this.videoElement.play().catch(e => console.warn('[Player] Autoplay blocked:', e));
      this._notifyTracksChanged();
    });

    this.mts.on(mpegts.Events.STATISTICS_INFO, () => {
      this._notifyTracksChanged();
    });

    this.mts.on(mpegts.Events.ERROR, (errType, errDetail, errInfo) => {
      console.warn('[mpegts Error]', errType, errDetail, errInfo);

      if (errType === mpegts.ErrorTypes.NETWORK_ERROR) {
        this.showErrorOverlay('Stream unreachable — network error.');
        return;
      }

      if (errType === mpegts.ErrorTypes.MEDIA_ERROR) {
        // errInfo.mimeType tells us exactly which codec failed
        const failedMime = errInfo && errInfo.mimeType ? errInfo.mimeType : '';

        if (failedMime.startsWith('audio/')) {
          // Audio codec unsupported (e.g. Dolby Digital Plus / E-AC-3).
          // Video is still playing — show a soft, non-blocking banner.
          const codec = failedMime.replace('audio/mp4;codecs=', '');
          const label = codec === 'ec-3' ? 'Dolby Digital Plus (EC-3)'
                      : codec === 'ac-3' ? 'Dolby Digital (AC-3)'
                      : codec;
          this.showWarningBanner(
            `⚠ Audio unavailable — ${label} is not supported by this browser. Video only.`
          );
        } else {
          // Video codec or unknown — genuinely unplayable
          this.showErrorOverlay('Codec unsupported — browser cannot decode this stream.');
        }
        return;
      }
    });
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  _destroyAll() {
    this._hideWarningBanner();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.mts) {
      this.mts.unload();
      this.mts.detachMediaElement();
      this.mts.destroy();
      this.mts = null;
    }
    // Reset the video element so the old blob URL is fully released
    this.videoElement.removeAttribute('src');
    this.videoElement.load();
  }

  // ─── Track / Quality Helpers ──────────────────────────────────────────────

  _notifyTracksChanged() {
    if (!this.onTracksChangedCallback) return;

    this.onTracksChangedCallback({
      audioTracks: this._getAudioTracks(),
      qualities: this._getVideoQualities(),
      currentLang: this.prefLanguage,
      currentQuality: this.prefQuality,
      activeAudioId: this.hls ? this.hls.audioTrack : -1,
      activeQualityId: this.hls ? this.hls.currentLevel : -1,
      playbackInfo: this._getPlaybackInfo(),
    });
  }

  _getPlaybackInfo() {
    const info = {};

    // ── HLS.js source ──────────────────────────────────────────────────────
    if (this.hls) {
      const levelIdx = this.hls.currentLevel !== -1
        ? this.hls.currentLevel
        : this.hls.startLevel;
      const level = (this.hls.levels || [])[levelIdx];

      if (level) {
        if (level.width && level.height)
          info.resolution = `${level.width}×${level.height}`;
        if (level.frameRate)
          info.fps = `${parseFloat(level.frameRate).toFixed(2)} fps`;
        if (level.bitrate)
          info.videoBitrate = `${Math.round(level.bitrate / 1000)} kbps`;
        if (level.videoCodec)
          info.videoCodec = level.videoCodec;
        if (level.audioCodec)
          info.audioCodec = level.audioCodec;
      }

      // Active audio track details
      const audioTrackIdx = this.hls.audioTrack;
      const audioTrack = (this.hls.audioTracks || [])[audioTrackIdx];
      if (audioTrack) {
        if (audioTrack.samplerate)
          info.audioSampleRate = `${audioTrack.samplerate} Hz`;
        if (audioTrack.lang)
          info.audioLanguage = audioTrack.lang.toUpperCase();
      }
    }

    // ── mpegts.js source ───────────────────────────────────────────────────
    if (this.mts) {
      try {
        const mi = this.mts.mediaInfo;
        if (mi) {
          if (mi.width && mi.height)
            info.resolution = `${mi.width}×${mi.height}`;
          if (mi.fps)
            info.fps = `${parseFloat(mi.fps).toFixed(2)} fps`;
          if (mi.videoDataRate || mi.videoDatarate)
            info.videoBitrate = `${Math.round((mi.videoDataRate || mi.videoDatarate))} kbps`;
          if (mi.videoCodec)
            info.videoCodec = mi.videoCodec;
          if (mi.audioCodec)
            info.audioCodec = mi.audioCodec;
          if (mi.audioSampleRate)
            info.audioSampleRate = `${mi.audioSampleRate} Hz`;
          if (mi.audioChannelCount)
            info.audioChannels = `${mi.audioChannelCount} ch`;
          if (mi.audioDataRate || mi.audioDatarate)
            info.audioBitrate = `${Math.round((mi.audioDataRate || mi.audioDatarate))} kbps`;
        }

        // Supplement with statistics
        const si = this.mts.statisticsInfo;
        if (si && si.speed)
          info.downloadSpeed = `${si.speed.toFixed(0)} KB/s`;
      } catch (_) {}
    }

    // ── Native video element fallback ──────────────────────────────────────
    if (this.videoElement) {
      if (!info.resolution && this.videoElement.videoWidth && this.videoElement.videoHeight)
        info.resolution = `${this.videoElement.videoWidth}×${this.videoElement.videoHeight}`;
    }

    return info;
  }

  _getAudioTracks() {
    if (!this.hls) return [];
    try {
      const list = this.hls.audioTracks || [];
      return list.map((t, index) => ({
        id: index,
        language: t.lang || 'und',
        name: t.name || `Track ${index + 1}`
      }));
    } catch (err) {
      return [];
    }
  }

  _getVideoQualities() {
    if (!this.hls) return [];
    try {
      const list = this.hls.levels || [];
      return list
        .map((l, index) => ({
          id: index,
          height: l.height,
          name: l.height ? `${l.height}p` : `Quality ${index + 1}`
        }))
        .sort((a, b) => {
          if (a.height && b.height) {
            return b.height - a.height;
          }
          return b.id - a.id;
        });
    } catch (err) {
      return [];
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  setAudioLanguage(languageOrId) {
    if (!this.hls) return;
    const trackIndex = parseInt(languageOrId, 10);
    if (!isNaN(trackIndex) && trackIndex >= 0 && trackIndex < this.hls.audioTracks.length) {
      this.hls.audioTrack = trackIndex;
      const target = this.hls.audioTracks[trackIndex];
      if (target && target.lang) {
        this.prefLanguage = target.lang;
        localStorage.setItem('player-pref-lang', this.prefLanguage);
      }
    } else {
      this.prefLanguage = languageOrId;
      localStorage.setItem('player-pref-lang', languageOrId);
      const foundIdx = (this.hls.audioTracks || []).findIndex(t => (t.lang || 'und') === languageOrId);
      if (foundIdx !== -1) {
        this.hls.audioTrack = foundIdx;
      }
    }
  }

  setVideoQuality(qualityIdOrHeight) {
    if (!this.hls) return;
    if (qualityIdOrHeight === 'auto') {
      this.prefQuality = 'auto';
      localStorage.setItem('player-pref-quality', 'auto');
      this.hls.currentLevel = -1;
      return;
    }

    const levelIndex = parseInt(qualityIdOrHeight, 10);
    if (!isNaN(levelIndex) && levelIndex >= 0 && levelIndex < this.hls.levels.length) {
      this.hls.currentLevel = levelIndex;
      const target = this.hls.levels[levelIndex];
      if (target && target.height) {
        this.prefQuality = target.height.toString();
        localStorage.setItem('player-pref-quality', this.prefQuality);
      }
    } else {
      const hStr = qualityIdOrHeight.toString();
      this.prefQuality = hStr;
      localStorage.setItem('player-pref-quality', hStr);
      const targetHeight = parseInt(hStr, 10);
      const foundIdx = (this.hls.levels || []).findIndex(l => l.height === targetHeight);
      this.hls.currentLevel = foundIdx !== -1 ? foundIdx : -1;
    }
  }

  _applyPersistedQuality() {
    if (!this.hls) return;
    if (this.prefQuality === 'auto') {
      this.hls.currentLevel = -1;
    } else {
      const targetHeight = parseInt(this.prefQuality, 10);
      const idx = (this.hls.levels || []).findIndex(l => l.height === targetHeight);
      this.hls.currentLevel = idx !== -1 ? idx : -1;
    }
  }

  _applyPersistedAudio() {
    if (!this.hls) return;
    const pref = this.prefLanguage;
    if (pref && pref !== 'und') {
      const idx = (this.hls.audioTracks || []).findIndex(t => (t.lang || 'und') === pref);
      if (idx !== -1) {
        this.hls.audioTrack = idx;
      }
    }
  }

  // ─── Error Messages ───────────────────────────────────────────────────────

  _hlsErrorMessage(data) {
    const map = {
      [Hls.ErrorDetails.MANIFEST_LOAD_ERROR]:              'Stream unreachable — manifest failed to load.',
      [Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT]:            'Stream timed out — server not responding.',
      [Hls.ErrorDetails.MANIFEST_PARSING_ERROR]:           'Invalid stream — manifest could not be parsed.',
      [Hls.ErrorDetails.LEVEL_LOAD_ERROR]:                 'Stream error — quality level unavailable.',
      [Hls.ErrorDetails.FRAG_LOAD_ERROR]:                  'Stream error — segment failed to load.',
      [Hls.ErrorDetails.BUFFER_INCOMPATIBLE_CODECS_ERROR]: 'Codec unsupported — browser cannot decode this stream.',
    };
    return map[data.details] || `Stream error: ${data.details}`;
  }

  // ─── Overlay ──────────────────────────────────────────────────────────────

  showErrorOverlay(message) {
    console.error('[Player Error]:', message);
  }

  hideErrorOverlay() {
    console.log('[Player] Hiding error overlay (suppressed)');
  }

  showWarningBanner(message) {
    console.warn('[Player Warning]:', message);
  }

  _hideWarningBanner() {
    // No-op since banner UI is disabled
  }
}
