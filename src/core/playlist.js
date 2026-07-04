import { rewritePlaylist } from './proxy.js';

export class PlaylistLoaderSystem {
  constructor(playlistUrl) {
    this.playlistUrl = playlistUrl;
    this.cache = null; // In-memory cache for the parsed playlist
  }

  async fetchPlaylist() {
    if (this.cache) {
      console.log('Returning playlist from cache');
      return this.cache;
    }

    try {
      const response = await fetch(this.playlistUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const text = await response.text();

      // Rewrite all HTTP stream URLs through the HTTPS proxy before parsing
      const proxiedText = rewritePlaylist(text, this.playlistUrl);

      this.cache = this.parseM3U(proxiedText);
      console.log(`Parsed ${this.cache.channels.length} channels from playlist`);
      
      return this.cache;
    } catch (error) {
      console.error('Failed to load playlist:', error);
      return { channels: [], grouped: {} };
    }
  }

  parseM3U(content) {
    const lines = content.split('\n');
    const channels = [];
    const grouped = {};
    let currentChannel = null;

    // Regex to extract standard M3U attributes
    const groupRegex = /(?:group-title|tvg-group)="([^"]+)"/i;
    const logoRegex = /tvg-logo="([^"]+)"/i;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('#EXTINF:')) {
        // Extract title (everything after the last comma)
        const commaSplit = trimmed.split(',');
        const title = commaSplit.pop().trim() || 'Unknown Channel';
        
        // Extract attributes
        const groupMatch = trimmed.match(groupRegex);
        const logoMatch = trimmed.match(logoRegex);
        
        const category = groupMatch ? groupMatch[1].trim() : 'Uncategorized';
        const logo = logoMatch ? logoMatch[1].trim() : null;

        currentChannel = {
          title,
          category,
          logo,
          streamUrl: ''
        };
      } else if (trimmed && !trimmed.startsWith('#')) {
        // If it's a valid URL line and we have a pending channel object
        if (currentChannel) {
          currentChannel.streamUrl = trimmed;
          channels.push(currentChannel);
          
          // Add to grouped object
          if (!grouped[currentChannel.category]) {
            grouped[currentChannel.category] = [];
          }
          grouped[currentChannel.category].push(currentChannel);
          
          currentChannel = null; // Reset for next channel
        }
      }
    }
    
    return { channels, grouped };
  }
}
