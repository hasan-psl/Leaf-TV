export class ThemeController {
  constructor() {
    // Modes: 'light', 'dark', 'system'
    this.currentMode = localStorage.getItem('theme-mode') || 'system';
    this.ecoMode = localStorage.getItem('eco-mode') === 'true';
    
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaQuery.addEventListener('change', () => {
      if (this.currentMode === 'system') {
        this.applyTheme(this.getSystemTheme());
      }
    });
  }

  init() {
    this.setMode(this.currentMode);
    this.setEcoMode(this.ecoMode);
  }

  getSystemTheme() {
    return this.mediaQuery.matches ? 'dark' : 'light';
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  setMode(mode) {
    this.currentMode = mode;
    localStorage.setItem('theme-mode', mode);
    
    if (mode === 'system') {
      this.applyTheme(this.getSystemTheme());
    } else {
      this.applyTheme(mode);
    }
  }

  setEcoMode(isEco) {
    this.ecoMode = isEco;
    localStorage.setItem('eco-mode', isEco);
    document.documentElement.setAttribute('data-eco-mode', isEco ? 'true' : 'false');
  }

  toggleTheme() {
    // Cycle: system -> dark -> light -> system
    if (this.currentMode === 'system') this.setMode('dark');
    else if (this.currentMode === 'dark') this.setMode('light');
    else this.setMode('system');
  }
}

// Global instance for bootstrapping
export const themeController = new ThemeController();

// Maintain backward compatibility with previous main.js initialization
export function initThemeSystem() {
  themeController.init();
}
