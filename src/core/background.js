/**
 * Leaf-TV Background System
 *
 * Manages:
 *  - Background image layer injection
 *  - Ambient leaf particle animation (pure CSS, JS only seeds initial DOM)
 *  - Animation enabled/disabled toggle persisted in localStorage
 */

// Number of leaf particles. Keep low for mobile safety.
const LEAF_COUNT = 18;

// Leaf colour palette — greens + warm ambers for variety
const LEAF_COLORS = [
  'rgba(152, 255, 152, 0.60)', // mint
  'rgba(120, 230, 120, 0.55)', // mid-green
  'rgba(80,  200,  80, 0.50)', // forest
  'rgba(200, 230, 100, 0.45)', // yellow-green
  'rgba(255, 200,  80, 0.40)', // amber
  'rgba(220, 160,  60, 0.35)', // warm amber
];

/**
 * Pseudo-random seeded float in [min, max].
 * Using Math.random is fine here — determinism is not required.
 */
function rand(min, max) {
  return min + Math.random() * (max - min);
}

export class BackgroundSystem {
  constructor() {
    this._bgLayer      = null;
    this._overlayLayer = null;
    this._ambientLayer = null;

    // Read persisted preference; default to enabled
    this.animationEnabled =
      localStorage.getItem('bg-animation') !== 'false';
  }

  /**
   * Call once during bootstrap — injects the three layers before #app content.
   * @param {string} imageUrl  - URL of the background image
   */
  init(imageUrl = './resources/bg/bg.jpg') {
    // Apply CSS custom property for the image URL
    document.documentElement.style.setProperty(
      '--bg-image-url',
      `url("${imageUrl}")`
    );

    // Inject layers as siblings before #app
    this._bgLayer      = this._createLayer('bg-image-layer');
    this._overlayLayer = this._createLayer('bg-overlay-layer');
    this._ambientLayer = this._createLayer('bg-ambient-layer');

    document.body.prepend(this._ambientLayer);
    document.body.prepend(this._overlayLayer);
    document.body.prepend(this._bgLayer);

    // Seed leaf particles
    this._seedLeaves();

    // Apply current animation state
    this._applyAnimationState();

    console.log('[BackgroundSystem] Initialised. Animation:', this.animationEnabled);
  }

  /**
   * Toggle the ambient animation layer on/off.
   * @param {boolean|undefined} force  - If provided, set explicitly; otherwise toggle.
   * @returns {boolean} new state
   */
  setAnimation(force) {
    this.animationEnabled = typeof force === 'boolean' ? force : !this.animationEnabled;
    localStorage.setItem('bg-animation', this.animationEnabled);
    this._applyAnimationState();
    return this.animationEnabled;
  }

  /** Current animation enabled state */
  get isAnimationEnabled() {
    return this.animationEnabled;
  }

  // ── Private helpers ──────────────────────────────────────

  _createLayer(className) {
    const el = document.createElement('div');
    el.className = className;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  _applyAnimationState() {
    document.documentElement.setAttribute(
      'data-bg-animation',
      this.animationEnabled ? 'true' : 'false'
    );
  }

  _seedLeaves() {
    const frag = document.createDocumentFragment();

    for (let i = 0; i < LEAF_COUNT; i++) {
      const leaf = document.createElement('div');
      leaf.className = 'leaf-particle' + (i % 3 === 0 ? ' round' : '');

      const w     = rand(10, 24);
      const h     = rand(10, 22);
      const dur   = rand(10, 20);        // fall duration in seconds
      const delay = rand(0, dur);        // stagger so they don't all start together
      const sway  = rand(3, 6);
      const drift = rand(-60, 80);       // horizontal drift px
      const spin  = rand(180, 540);      // rotation on fall
      const rot   = rand(-45, 45);       // initial leaf tilt
      const color = LEAF_COLORS[Math.floor(rand(0, LEAF_COLORS.length))];
      const left  = rand(0, 100);        // % across viewport

      leaf.style.cssText = [
        `left: ${left}%`,
        `--leaf-w: ${w}px`,
        `--leaf-h: ${h}px`,
        `--leaf-dur: ${dur}s`,
        `--leaf-delay: ${delay}s`,
        `--sway-dur: ${sway}s`,
        `--sway-amount: ${rand(-30, 30)}px`,
        `--leaf-drift: ${drift}px`,
        `--leaf-spin: ${spin}deg`,
        `--leaf-rot: ${rot}deg`,
        `--leaf-color: ${color}`,
        `--leaf-max-opacity: ${rand(0.35, 0.70)}`,
      ].join('; ');

      frag.appendChild(leaf);
    }

    this._ambientLayer.appendChild(frag);
  }
}

// Singleton export
export const backgroundSystem = new BackgroundSystem();
