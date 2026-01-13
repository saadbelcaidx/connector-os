/**
 * VSL Watch Page — Multi-provider video embed with watch tracking
 *
 * Supports: Loom + YouTube (unlisted)
 *
 * Flow:
 * 1. Receives params from vsl-redirect (uid, cid, email, tid, provider, video_id)
 * 2. Embeds video via provider-specific player
 * 3. Tracks watch progress
 * 4. Fires POST to vsl-watch-confirm when >=80% watched, ended, or 45s fallback
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dqqchgvwqrqnthnbrfkp.supabase.co';

// ============================================================================
// Player Abstraction Interface
// ============================================================================

interface VslPlayer {
  mount(container: HTMLElement): void | Promise<void>;
  onProgress(cb: (percent: number) => void): void;
  onEnded(cb: () => void): void;
  destroy(): void;
}

// ============================================================================
// Loom Player Implementation
// ============================================================================

class LoomPlayer implements VslPlayer {
  private videoId: string;
  private iframe: HTMLIFrameElement | null = null;
  private progressCallback?: (percent: number) => void;
  private endedCallback?: () => void;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor(videoId: string) {
    this.videoId = videoId;
  }

  mount(container: HTMLElement): void {
    // Create wrapper for aspect ratio
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;padding-bottom:56.25%;height:0;background:#111;border-radius:12px;overflow:hidden;';

    this.iframe = document.createElement('iframe');
    this.iframe.src = `https://www.loom.com/embed/${this.videoId}`;
    this.iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    this.iframe.allowFullscreen = true;
    this.iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';

    wrapper.appendChild(this.iframe);
    container.appendChild(wrapper);

    // Listen for Loom postMessage events
    this.messageHandler = (event: MessageEvent) => {
      if (!event.origin.includes('loom.com')) return;

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        // Progress updates
        if (data.type === 'progress' || data.event === 'progress') {
          const percent = data.percent || data.progress || 0;
          if (this.progressCallback) {
            this.progressCallback(percent * 100);
          }
        }

        // Video ended
        if (data.type === 'ended' || data.event === 'ended' ||
            data.type === 'finish' || data.type === 'end' ||
            data.event === 'end' || data.type === 'complete') {
          if (this.endedCallback) {
            this.endedCallback();
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    window.addEventListener('message', this.messageHandler);
  }

  onProgress(cb: (percent: number) => void): void {
    this.progressCallback = cb;
  }

  onEnded(cb: () => void): void {
    this.endedCallback = cb;
  }

  destroy(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    if (this.iframe?.parentElement) {
      this.iframe.parentElement.remove();
    }
    this.iframe = null;
  }
}

// ============================================================================
// YouTube Player Implementation
// ============================================================================

// Extend Window to include YouTube IFrame API types
declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

class YouTubePlayer implements VslPlayer {
  private videoId: string;
  private player: YT.Player | null = null;
  private progressCallback?: (percent: number) => void;
  private endedCallback?: () => void;
  private progressInterval: number | null = null;
  private container: HTMLElement | null = null;

  constructor(videoId: string) {
    this.videoId = videoId;
  }

  async mount(container: HTMLElement): Promise<void> {
    this.container = container;

    // Load YouTube IFrame API if not present
    if (!window.YT || !window.YT.Player) {
      await this.loadYouTubeApi();
    }

    // Create player container div
    const playerDiv = document.createElement('div');
    playerDiv.id = `yt-player-${this.videoId}`;

    // Create wrapper for aspect ratio
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;padding-bottom:56.25%;height:0;background:#111;border-radius:12px;overflow:hidden;';
    wrapper.appendChild(playerDiv);
    container.appendChild(wrapper);

    // Initialize YouTube player
    this.player = new window.YT.Player(playerDiv.id, {
      videoId: this.videoId,
      playerVars: {
        autoplay: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onStateChange: this.handleStateChange.bind(this),
        onReady: this.handleReady.bind(this),
      },
    });
  }

  private loadYouTubeApi(): Promise<void> {
    return new Promise((resolve) => {
      // Check if already loaded
      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }

      // Check if script is already in DOM
      const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (existingScript) {
        // Wait for API to be ready
        const checkReady = setInterval(() => {
          if (window.YT && window.YT.Player) {
            clearInterval(checkReady);
            resolve();
          }
        }, 100);
        return;
      }

      // Load the script
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;

      window.onYouTubeIframeAPIReady = () => {
        resolve();
      };

      document.head.appendChild(script);
    });
  }

  private handleReady(): void {
    // Start progress tracking every second
    this.progressInterval = window.setInterval(() => {
      if (!this.player) return;

      try {
        const duration = this.player.getDuration();
        const currentTime = this.player.getCurrentTime();

        if (duration > 0 && this.progressCallback) {
          const percent = (currentTime / duration) * 100;
          this.progressCallback(percent);
        }
      } catch {
        // Player might not be ready
      }
    }, 1000);
  }

  private handleStateChange(event: YT.OnStateChangeEvent): void {
    // YT.PlayerState.ENDED = 0
    if (event.data === 0 && this.endedCallback) {
      this.endedCallback();
    }
  }

  onProgress(cb: (percent: number) => void): void {
    this.progressCallback = cb;
  }

  onEnded(cb: () => void): void {
    this.endedCallback = cb;
  }

  destroy(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    if (this.player) {
      try {
        this.player.destroy();
      } catch {
        // Player might already be destroyed
      }
      this.player = null;
    }
  }
}

// ============================================================================
// Main Component
// ============================================================================

export default function VslWatch() {
  const [searchParams] = useSearchParams();
  const firedRef = useRef(false);
  const playerRef = useRef<VslPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extract params (new format from vsl-redirect)
  const userId = searchParams.get('uid') || '';
  const campaignId = searchParams.get('cid') || '';
  const leadEmail = searchParams.get('email') || '';
  const threadId = searchParams.get('tid') || '';
  const provider = searchParams.get('provider') as 'loom' | 'youtube' | null;
  const videoId = searchParams.get('video_id') || '';

  // Legacy support: handle old 'video' param format
  const legacyVideoParam = searchParams.get('video') || '';
  let resolvedProvider = provider;
  let resolvedVideoId = videoId;

  if (!provider && !videoId && legacyVideoParam) {
    // Extract from legacy full URL
    if (legacyVideoParam.includes('loom.com')) {
      resolvedProvider = 'loom';
      const match = legacyVideoParam.match(/(?:share\/|embed\/)([a-zA-Z0-9]+)/);
      resolvedVideoId = match ? match[1] : legacyVideoParam;
    } else if (legacyVideoParam.includes('youtube.com') || legacyVideoParam.includes('youtu.be')) {
      resolvedProvider = 'youtube';
      const longMatch = legacyVideoParam.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
      const shortMatch = legacyVideoParam.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      resolvedVideoId = longMatch?.[1] || shortMatch?.[1] || legacyVideoParam;
    }
  }

  // Reconstruct original VSL URL for confirm payload
  const getVslUrl = useCallback(() => {
    if (resolvedProvider === 'loom') {
      return `https://www.loom.com/share/${resolvedVideoId}`;
    }
    if (resolvedProvider === 'youtube') {
      return `https://www.youtube.com/watch?v=${resolvedVideoId}`;
    }
    return '';
  }, [resolvedProvider, resolvedVideoId]);

  // Fire watched event
  const fireWatchedEvent = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    console.log('[VslWatch] Firing watched event');

    fetch(`${SUPABASE_URL}/functions/v1/vsl-watch-confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        campaign_id: campaignId,
        lead_email: leadEmail,
        thread_id: threadId,
        vsl_url: getVslUrl(),
      }),
    }).catch((err) => {
      console.log('[VslWatch] Confirm error:', err);
    });
  }, [userId, campaignId, leadEmail, threadId, getVslUrl]);

  useEffect(() => {
    if (!containerRef.current || !resolvedProvider || !resolvedVideoId) return;

    console.log(`[VslWatch] Mounting ${resolvedProvider} player with video ID: ${resolvedVideoId}`);

    // Create provider-specific player
    const player: VslPlayer = resolvedProvider === 'youtube'
      ? new YouTubePlayer(resolvedVideoId)
      : new LoomPlayer(resolvedVideoId);

    playerRef.current = player;

    // Mount player
    const mountPromise = player.mount(containerRef.current);

    // Setup event handlers
    const setupHandlers = () => {
      // Fire at >=80%
      player.onProgress((percent) => {
        console.log(`[VslWatch] Progress: ${percent.toFixed(1)}%`);
        if (percent >= 80) {
          fireWatchedEvent();
        }
      });

      // Fire on ended
      player.onEnded(() => {
        console.log('[VslWatch] Video ended');
        fireWatchedEvent();
      });
    };

    if (mountPromise instanceof Promise) {
      mountPromise.then(setupHandlers);
    } else {
      setupHandlers();
    }

    // Fallback: 45 seconds
    const fallbackTimer = setTimeout(() => {
      console.log('[VslWatch] Fallback timer fired');
      fireWatchedEvent();
    }, 45000);

    return () => {
      clearTimeout(fallbackTimer);
      player.destroy();
      playerRef.current = null;
    };
  }, [resolvedProvider, resolvedVideoId, fireWatchedEvent]);

  // Error state: missing video
  if (!resolvedVideoId || !resolvedProvider) {
    return (
      <div style={{
        background: '#000',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <p style={{ opacity: 0.6 }}>Missing video</p>
      </div>
    );
  }

  return (
    <div style={{
      background: '#000',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{ width: '100%', maxWidth: '1200px', padding: '20px' }}>
        <div ref={containerRef} />
      </div>
    </div>
  );
}
