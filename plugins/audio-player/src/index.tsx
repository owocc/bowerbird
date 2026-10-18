import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  definePlugin,
  type PreviewPlugin,
  type PreviewViewportProps,
  type PreviewInspectorProps,
} from "@bowerbird/plugin-sdk";

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;

  if (hours > 0) {
    return `${hours}:${remainingMins < 10 ? "0" : ""}${remainingMins}:${secs < 10 ? "0" : ""}${secs}`;
  }
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function AudioViewport({ item, api }: PreviewViewportProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const fileHandle = api.getOriginalFile();
  const audioUrl = fileHandle.url;

  // Sync audio state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      if (!isScrubbing) {
        setCurrentTime(audio.currentTime);
      }
    };
    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };
    const onEnded = () => {
      if (!isLooping) {
        setIsPlaying(false);
      }
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [isScrubbing, isLooping]);

  // Spacebar toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  const handleSeek = (newTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = progressBarRef.current?.getBoundingClientRect();
    if (!rect || duration === 0) return;
    setIsScrubbing(true);
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    handleSeek(pos * duration);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const movePos = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
      handleSeek(movePos * duration);
    };
    const onMouseUp = () => {
      setIsScrubbing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = progressBarRef.current?.getBoundingClientRect();
    if (!rect || duration === 0) return;
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(pos * duration);
  };

  const handleVolumeChange = (newVol: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = newVol;
    setVolume(newVol);
    if (newVol > 0 && isMuted) {
      audio.muted = false;
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const cyclePlaybackRate = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
    setPlaybackRate(nextRate);
  };

  const toggleLoop = () => {
    if (audioRef.current) {
      audioRef.current.loop = !isLooping;
    }
    setIsLooping(!isLooping);
  };

  const skipSeconds = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        background: "radial-gradient(ellipse at 50% 30%, #171b26 0%, #0b0c10 100%)",
        color: "#f1f5f9",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        userSelect: "none",
        padding: "2rem",
      }}
    >
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Center visual display */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: "540px",
          width: "100%",
          gap: "2rem",
        }}
      >
        {/* Equalizer animation box */}
        <div
          style={{
            position: "relative",
            width: "220px",
            height: "220px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(20, 24, 38, 0.8) 70%)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: isPlaying
              ? "0 0 50px rgba(99, 102, 241, 0.3), inset 0 0 30px rgba(99, 102, 241, 0.2)"
              : "0 0 20px rgba(0, 0, 0, 0.5)",
            transition: "all 0.5s ease",
          }}
        >
          {/* Animated equalizer bars */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              height: "70px",
            }}
          >
            {[18, 35, 52, 28, 45, 60, 38, 22, 48, 32, 58, 26, 40, 15].map((baseHeight, idx) => {
              const activeHeight = isPlaying ? `${Math.max(12, (baseHeight * (0.4 + (idx % 5) * 0.15)))}px` : "8px";
              return (
                <div
                  key={idx}
                  style={{
                    width: "4px",
                    height: activeHeight,
                    background: "linear-gradient(to top, #6366f1, #a855f7)",
                    borderRadius: "3px",
                    transition: "height 0.15s ease",
                    opacity: isPlaying ? 0.9 : 0.4,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Title and metadata */}
        <div style={{ textAlign: "center" }}>
          <h2
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              margin: 0,
              color: "#f8fafc",
              letterSpacing: "-0.01em",
              maxWidth: "460px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.name}
          </h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              marginTop: "0.5rem",
              fontSize: "0.75rem",
              color: "#94a3b8",
            }}
          >
            <span
              style={{
                textTransform: "uppercase",
                background: "rgba(255, 255, 255, 0.08)",
                padding: "2px 6px",
                borderRadius: "4px",
                fontFamily: "monospace",
                color: "#cbd5e1",
              }}
            >
              {item.extension}
            </span>
            <span>•</span>
            <span>{formatSize(item.size)}</span>
            <span>•</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Scrubber and progress bar */}
        <div style={{ width: "100%" }}>
          <div
            ref={progressBarRef}
            onMouseDown={handleProgressMouseDown}
            onMouseMove={handleProgressMouseMove}
            onMouseLeave={() => setHoverTime(null)}
            style={{
              position: "relative",
              width: "100%",
              height: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* Background track */}
            <div
              style={{
                width: "100%",
                height: "4px",
                background: "rgba(255, 255, 255, 0.15)",
                borderRadius: "2px",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {/* Filled progress */}
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #6366f1, #a855f7)",
                }}
              />
            </div>

            {/* Draggable handle knob */}
            <div
              style={{
                position: "absolute",
                left: `${progressPercent}%`,
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: "#ffffff",
                boxShadow: "0 0 8px rgba(99, 102, 241, 0.8)",
                transform: "translateX(-50%)",
                pointerEvents: "none",
              }}
            />

            {/* Hover timestamp tooltip */}
            {hoverTime !== null && (
              <div
                style={{
                  position: "absolute",
                  left: `${(hoverTime / duration) * 100}%`,
                  bottom: "20px",
                  transform: "translateX(-50%)",
                  background: "rgba(0, 0, 0, 0.8)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontSize: "0.7rem",
                  color: "#cbd5e1",
                  pointerEvents: "none",
                }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          {/* Time indicators */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.75rem",
              color: "#94a3b8",
              marginTop: "4px",
              fontFamily: "monospace",
            }}
          >
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            gap: "1rem",
          }}
        >
          {/* Secondary Left: Rate & Loop */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              onClick={cyclePlaybackRate}
              style={{
                background: playbackRate !== 1 ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: playbackRate !== 1 ? "#a5b4fc" : "#cbd5e1",
                padding: "4px 8px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.75rem",
                fontFamily: "monospace",
              }}
              title="Playback Speed"
            >
              {playbackRate}x
            </button>
            <button
              onClick={toggleLoop}
              style={{
                background: isLooping ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: isLooping ? "#a5b4fc" : "#cbd5e1",
                padding: "4px 8px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.75rem",
              }}
              title="Toggle Loop"
            >
              Loop
            </button>
          </div>

          {/* Center Play/Pause & Skip */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button
              onClick={() => skipSeconds(-10)}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
              title="Skip back 10s"
            >
              -10s
            </button>

            <button
              onClick={togglePlay}
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "#6366f1",
                color: "#ffffff",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.2rem",
                boxShadow: "0 4px 14px rgba(99, 102, 241, 0.4)",
              }}
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? "❚❚" : "▶"}
            </button>

            <button
              onClick={() => skipSeconds(10)}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
              title="Skip forward 10s"
            >
              +10s
            </button>
          </div>

          {/* Secondary Right: Volume Control */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <button
              onClick={toggleMute}
              style={{
                background: "transparent",
                border: "none",
                color: isMuted ? "#f87171" : "#cbd5e1",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? "🔇" : "🔊"}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              style={{
                width: "60px",
                height: "4px",
                accentColor: "#6366f1",
                cursor: "pointer",
              }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
          <button
            onClick={() => api.openWithDefaultApp()}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#cbd5e1",
              padding: "4px 10px",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            Open in Player
          </button>
          <button
            onClick={() => api.revealInFinder()}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#cbd5e1",
              padding: "4px 10px",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            Reveal
          </button>
        </div>
      </div>
    </div>
  );
}

function AudioInspectorPreview({ item, api }: PreviewInspectorProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const fileHandle = api.getOriginalFile();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      style={{
        padding: "0.85rem",
        background: "rgba(255, 255, 255, 0.02)",
        borderRadius: "8px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        fontSize: "0.8rem",
      }}
    >
      <audio ref={audioRef} src={fileHandle.url} preload="metadata" />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.6rem",
        }}
      >
        <span
          style={{
            fontWeight: 600,
            textTransform: "uppercase",
            fontSize: "0.7rem",
            color: "#a855f7",
            letterSpacing: "0.05em",
          }}
        >
          Audio Track
        </span>
        <span
          style={{
            textTransform: "uppercase",
            fontSize: "0.7rem",
            color: "#94a3b8",
            background: "rgba(255, 255, 255, 0.06)",
            padding: "1px 5px",
            borderRadius: "3px",
            fontFamily: "monospace",
          }}
        >
          {item.extension}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.5rem 0",
        }}
      >
        <button
          onClick={togglePlay}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "#6366f1",
            color: "#ffffff",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.9rem",
            flexShrink: 0,
          }}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 500,
              color: "#f8fafc",
              fontSize: "0.85rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.name}
          </div>
          <div
            style={{
              fontSize: "0.7rem",
              color: "#94a3b8",
              fontFamily: "monospace",
              marginTop: "2px",
            }}
          >
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
      </div>

      {/* Progress track */}
      <div
        style={{
          width: "100%",
          height: "4px",
          background: "rgba(255, 255, 255, 0.1)",
          borderRadius: "2px",
          overflow: "hidden",
          marginTop: "0.4rem",
        }}
      >
        <div
          style={{
            width: `${progressPercent}%`,
            height: "100%",
            background: "#6366f1",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button
          onClick={() => api.openWithDefaultApp()}
          style={{
            flex: 1,
            padding: "0.35rem 0.5rem",
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "5px",
            color: "#e2e8f0",
            fontSize: "0.75rem",
            cursor: "pointer",
          }}
        >
          Open
        </button>
        <button
          onClick={() => api.revealInFinder()}
          style={{
            flex: 1,
            padding: "0.35rem 0.5rem",
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "5px",
            color: "#e2e8f0",
            fontSize: "0.75rem",
            cursor: "pointer",
          }}
        >
          Reveal
        </button>
      </div>
    </div>
  );
}

const audioPlayerPlugin: PreviewPlugin = definePlugin({
  id: "official.audio-player",
  name: "Audio Player",
  version: "1.0.0",
  description: "Audio player with waveform/progress scrubber, volume control, loop, and playback rate",
  author: "Bowerbird Team",
  kind: "preview",
  priority: 60,
  extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "webm"],
  mimePrefixes: ["audio/"],
  supportsZoom: false,
  Viewport: AudioViewport,
  InspectorPreview: AudioInspectorPreview,
});

export default audioPlayerPlugin;
export { audioPlayerPlugin as plugin };
