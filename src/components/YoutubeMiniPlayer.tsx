import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Music2,
  Pause,
  Play,
  Search,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { JarvisYoutubeCandidate, JarvisYoutubeTrack } from '../types/jarvis';

interface YTPlayerLike {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  muteVideo: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  getPlayerState: () => number;
  getCurrentTime: () => number;
  destroy: () => void;
}

interface YTPlayerEventHandlers {
  onReady?: (event: { target: YTPlayerLike }) => void;
  onStateChange?: (event: { data: number; target: YTPlayerLike }) => void;
  onError?: (event: { data: number }) => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options?: {
          events?: YTPlayerEventHandlers;
          width?: number | string;
          height?: number | string;
        }
      ) => YTPlayerLike;
      PlayerState?: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
  }
}

/**
 * Loads the official YouTube IFrame API once per session.
 * The official API is what exposes onReady / onStateChange / onError, which the
 * raw postMessage bridge cannot do — and error 150 (embedding disabled by the
 * uploader) is invisible without it.
 */
let ytApiPromise: Promise<void> | null = null;

function loadYoutubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.jarvisYtApi = 'true';

    const poll = window.setInterval(() => {
      if (window.YT?.Player) {
        window.clearInterval(poll);
        resolve();
      }
    }, 120);

    const fail = () => {
      window.clearInterval(poll);
      reject(new Error('API do YouTube indisponível'));
    };

    script.onload = () => {
      if (window.YT?.Player) {
        window.clearInterval(poll);
        resolve();
      }
    };
    script.onerror = fail;

    document.head.appendChild(script);
    window.setTimeout(() => {
      if (!window.YT?.Player) fail();
    }, 12000);
  }).catch((err) => {
    ytApiPromise = null;
    throw err;
  });

  return ytApiPromise;
}

interface YoutubeMiniPlayerProps {
  track: JarvisYoutubeTrack | null;
  loading?: boolean;
  onClose: () => void;
  onSearchTrack: (query: string) => Promise<void>;
}

export const YoutubeMiniPlayer: React.FC<YoutubeMiniPlayerProps> = ({
  track,
  loading = false,
  onClose,
  onSearchTrack,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YTPlayerLike | null>(null);
  const volumeRef = useRef<number>(85);
  const candidatesRef = useRef<JarvisYoutubeCandidate[]>([]);
  const attemptedRef = useRef<Set<string>>(new Set());

  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(85);
  const [showVideo, setShowVideo] = useState<boolean>(true);
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [searchInput, setSearchInput] = useState<string>('');
  const [needsGesture, setNeedsGesture] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [legacyMode, setLegacyMode] = useState<boolean>(false);
  const [attemptedCount, setAttemptedCount] = useState<number>(0);

  const candidates = useMemo<JarvisYoutubeCandidate[]>(
    () => track?.candidates ?? [],
    [track?.candidates]
  );

  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);

  const sendYoutubeCommand = useCallback((func: string, args: unknown[] = []) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({
          event: 'command',
          func,
          args,
        }),
        '*'
      );
    } catch {
      // Ignore postMessage errors if iframe is still initializing
    }
  }, []);

  // 1. Sync the incoming track with the player state.
  useEffect(() => {
    if (!track) {
      setActiveVideoId(null);
      setActiveTitle('');
      setPlaybackError(null);
      setNeedsGesture(false);
      return;
    }

    attemptedRef.current = new Set();
    setAttemptedCount(0);
    setActiveVideoId(track.videoId);
    setActiveTitle(track.title);
    setPlaybackError(null);
    setNeedsGesture(false);
    setIsPlaying(true);
    setIsMuted(false);
  }, [track?.videoId, track?.startedAt]);

  // 2. Bind the official YouTube player to the iframe.
  useEffect(() => {
    if (!activeVideoId) return;

    let cancelled = false;
    let watchdogTimer: number | null = null;
    let player: YTPlayerLike | null = null;

    const clearWatchdog = () => {
      if (watchdogTimer !== null) {
        window.clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
    };

    /**
     * Walks the candidate ladder whenever YouTube refuses to play the current
     * video. Error 101/150 means the uploader blocked embedded playback, which
     * is the default for most label releases.
     */
    const handlePlaybackFailure = (code: number) => {
      if (cancelled) return;

      attemptedRef.current.add(activeVideoId);
      setAttemptedCount(attemptedRef.current.size);

      const ladder = candidatesRef.current;
      const next = ladder.find(
        (candidate) => !attemptedRef.current.has(candidate.videoId)
      );

      if (next) {
        setActiveTitle(next.title);
        setActiveVideoId(next.videoId);
        setIsPlaying(true);
        setNeedsGesture(false);
        setPlaybackError(null);
        return;
      }

      setIsPlaying(false);
      setNeedsGesture(false);
      setPlaybackError(
        code === 150 || code === 101
          ? 'O YouTube bloqueou a reprodução embutida de todas as versões desta faixa, senhor.'
          : 'Não consegui reproduzir esta faixa, senhor.'
      );
    };

    loadYoutubeIframeApi()
      .then(() => {
        if (cancelled) return;

        const frame = iframeRef.current;
        const YTApi = window.YT;
        if (!frame || !YTApi?.Player) {
          setLegacyMode(true);
          return;
        }
        setLegacyMode(false);

        player = new YTApi.Player(frame, {
          events: {
            onReady: (event) => {
              if (cancelled) return;
              const target = event.target;

              try {
                target.setVolume(volumeRef.current);
                target.unMute();
                target.playVideo();
              } catch {
                // Player not fully bound yet — onStateChange recovers the flow.
              }

              clearWatchdog();
              watchdogTimer = window.setTimeout(() => {
                let state = -1;
                try {
                  state = target.getPlayerState();
                } catch {
                  // ignore
                }
                if (state === 1 || state === 3) return;

                // Chrome blocks unmuted autoplay without a fresh user gesture:
                // start muted (always allowed) and surface the one-click unlock.
                try {
                  target.muteVideo();
                  target.playVideo();
                } catch {
                  // ignore
                }
                setIsMuted(true);
                setNeedsGesture(true);
              }, 2200);
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const state = event.data;
              if (state === 1) {
                setIsPlaying(true);
                setNeedsGesture(false);
              } else if (state === 2 || state === 0) {
                setIsPlaying(false);
              }
            },
            onError: (event) => {
              if (cancelled) return;
              clearWatchdog();
              handlePlaybackFailure(event.data);
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) setLegacyMode(true);
      });

    return () => {
      cancelled = true;
      clearWatchdog();
      playerRef.current = null;
      try {
        player?.stopVideo();
      } catch {
        // ignore
      }
      try {
        player?.destroy();
      } catch {
        // ignore
      }
    };
  }, [activeVideoId]);

  const handleManualPlay = useCallback(() => {
    const player = playerRef.current;
    if (player) {
      try {
        player.unMute();
        player.setVolume(volumeRef.current);
        player.playVideo();
      } catch {
        // ignore
      }
    } else {
      sendYoutubeCommand('unMute');
      sendYoutubeCommand('setVolume', [volumeRef.current]);
      sendYoutubeCommand('playVideo');
    }
    setIsMuted(false);
    setNeedsGesture(false);
    setIsPlaying(true);
  }, [sendYoutubeCommand]);

  const handleTogglePlay = useCallback(() => {
    const player = playerRef.current;
    if (isPlaying) {
      if (player) {
        try {
          player.pauseVideo();
        } catch {
          // ignore
        }
      } else {
        sendYoutubeCommand('pauseVideo');
      }
      setIsPlaying(false);
    } else {
      if (player) {
        try {
          player.playVideo();
        } catch {
          // ignore
        }
      } else {
        sendYoutubeCommand('playVideo');
      }
      setNeedsGesture(false);
      setIsPlaying(true);
    }
  }, [isPlaying, sendYoutubeCommand]);

  const handleToggleMute = useCallback(() => {
    const player = playerRef.current;
    if (isMuted) {
      if (player) {
        try {
          player.unMute();
          player.setVolume(volumeRef.current);
        } catch {
          // ignore
        }
      } else {
        sendYoutubeCommand('unMute');
        sendYoutubeCommand('setVolume', [volumeRef.current]);
      }
      setIsMuted(false);
    } else {
      if (player) {
        try {
          player.muteVideo();
        } catch {
          // ignore
        }
      } else {
        sendYoutubeCommand('mute');
      }
      setIsMuted(true);
    }
  }, [isMuted, sendYoutubeCommand]);

  const handleVolumeChange = useCallback(
    (nextVol: number) => {
      setVolume(nextVol);
      volumeRef.current = nextVol;

      const player = playerRef.current;
      if (nextVol === 0) {
        if (player) {
          try {
            player.muteVideo();
          } catch {
            // ignore
          }
        } else {
          sendYoutubeCommand('mute');
        }
        setIsMuted(true);
        return;
      }

      if (isMuted) {
        if (player) {
          try {
            player.unMute();
          } catch {
            // ignore
          }
        } else {
          sendYoutubeCommand('unMute');
        }
        setIsMuted(false);
      }

      if (player) {
        try {
          player.setVolume(nextVol);
        } catch {
          // ignore
        }
      } else {
        sendYoutubeCommand('setVolume', [nextVol]);
      }
    },
    [isMuted, sendYoutubeCommand]
  );

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;
    await onSearchTrack(q);
    setSearchInput('');
    setShowSearch(false);
  };

  if (!track && !loading) return null;

  const embedUrl = activeVideoId
    ? `https://www.youtube.com/embed/${encodeURIComponent(
        activeVideoId
      )}?enablejsapi=1&autoplay=1&playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(
        window.location.origin
      )}`
    : '';

  return (
    <aside
      aria-label="Mini-Player do YouTube J.A.R.V.I.S."
      className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-30 w-[min(320px,92vw)] rounded-2xl bg-[#050B18]/95 backdrop-blur-xl border border-sky-400/35 shadow-[0_16px_44px_rgba(2,6,23,0.92),0_0_24px_rgba(14,165,233,0.2)] overflow-hidden transition-all duration-300"
    >
      {/* Top HUD Filament */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-5 right-5 h-px bg-gradient-to-r from-transparent via-sky-300/75 to-transparent"
      />

      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-sky-400/20 bg-[#071022]/90">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-sky-500/20 border border-sky-400/35 text-sky-300 shrink-0">
            <Music2 className={`w-3.5 h-3.5 ${isPlaying ? 'animate-pulse' : ''}`} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-100 truncate">
              {loading
                ? 'Buscando no YouTube...'
                : activeTitle || track?.title || 'YouTube Audio'}
            </div>
            <div className="text-[10px] text-sky-300/80 truncate">
              {track?.query ? `YouTube · ${track.query}` : 'Player Stark HUD'}
              {attemptedCount > 0
                ? ` · versão ${attemptedCount + 1}`
                : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowSearch((prev) => !prev)}
            title="Buscar outra música no YouTube"
            className="p-1.5 rounded-lg text-slate-400 hover:text-sky-200 hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowVideo((prev) => !prev)}
            title={showVideo ? 'Ocultar vídeo (modo compacto)' : 'Mostrar vídeo'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-sky-200 hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            {showVideo ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Fechar player do YouTube"
            aria-label="Fechar player do YouTube"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Optional Quick Search Input */}
      {showSearch && (
        <form
          onSubmit={handleSearchSubmit}
          className="px-3 py-2 border-b border-sky-400/15 bg-[#040914] flex items-center gap-1.5"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Digite a música ou artista..."
            className="flex-1 px-2.5 py-1 rounded-lg bg-[#081224] border border-sky-400/25 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-[11px] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            Tocar
          </button>
        </form>
      )}

      {/* Embedded YouTube IFrame (kept mounted when minimized so audio continues seamlessly) */}
      <div
        className={`relative w-full bg-black overflow-hidden transition-all duration-300 ${
          showVideo ? 'h-40 border-b border-sky-400/20' : 'h-0'
        }`}
      >
        {activeVideoId && (
          <iframe
            ref={iframeRef}
            key={activeVideoId}
            src={embedUrl}
            title={activeTitle || track?.title || 'YouTube Audio'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            onLoad={() => {
              if (!legacyMode) return;
              window.setTimeout(() => {
                sendYoutubeCommand('unMute');
                sendYoutubeCommand('setVolume', [volumeRef.current]);
                sendYoutubeCommand('playVideo');
              }, 650);
            }}
            className="w-full h-40 border-0"
          />
        )}

        {needsGesture && (
          <button
            type="button"
            onClick={handleManualPlay}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[#020617]/78 backdrop-blur-[2px] text-sky-200 hover:bg-[#020617]/60 transition-colors cursor-pointer"
          >
            <span className="flex items-center justify-center w-11 h-11 rounded-full bg-sky-500/25 border border-sky-300/60 shadow-[0_0_22px_rgba(14,165,233,0.45)]">
              <Play className="w-5 h-5 fill-current translate-x-[1px]" />
            </span>
            <span className="text-[11px] font-semibold tracking-wide uppercase">
              Ativar som e reproduzir
            </span>
          </button>
        )}
      </div>

      {playbackError && (
        <div className="px-3 py-2 bg-rose-950/40 border-b border-rose-400/25 text-[10px] text-rose-200">
          {playbackError}
        </div>
      )}

      {/* Playback & Volume Controls Bar */}
      <div className="px-3 py-2 flex items-center justify-between gap-2.5 bg-[#060C1A]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleTogglePlay}
            disabled={!track || loading}
            title={isPlaying ? 'Pausar música' : 'Continuar música'}
            className="p-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 transition-colors cursor-pointer disabled:opacity-40"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            disabled={!track || loading}
            title={isMuted ? 'Ativar som' : 'Silenciar'}
            className="p-1.5 rounded-lg text-slate-300 hover:text-sky-200 hover:bg-white/[0.04] transition-colors cursor-pointer disabled:opacity-40"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-amber-300" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-sky-300" />
            )}
          </button>

          <input
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            aria-label="Volume da música"
            className="w-20 accent-sky-400 cursor-pointer h-1"
          />
        </div>

        {track && (
          <a
            href={`https://www.youtube.com/watch?v=${encodeURIComponent(
              activeVideoId || track.videoId
            )}`}
            target="_blank"
            rel="noreferrer"
            title="Abrir no YouTube"
            className="flex items-center gap-1 text-[10px] font-medium text-sky-300 hover:text-sky-100 transition-colors whitespace-nowrap shrink-0"
          >
            <span>YouTube</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </aside>
  );
};
