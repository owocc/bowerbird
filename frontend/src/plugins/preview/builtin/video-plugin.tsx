import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import * as dashjs from "dashjs";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  Gauge,
  Repeat,
  Maximize2,
  Minimize2,
  ExternalLink,
  FolderOpen,
  AlertTriangle,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { UniversalThumbnail } from "@/components/UniversalThumbnail";
import { formatDuration } from "@/lib/formatters";
import {
  createPreviewPluginHostAPI,
  type PreviewPlugin,
  type PreviewPluginHostAPI,
} from "../types";
import type { Item } from "../../../../bindings/bowerbird/core/models";

export const VIDEO_EXTENSIONS = [
  "mp4",
  "mov",
  "qt",
  "webm",
  "mkv",
  "avi",
  "m4v",
  "flv",
  "f4v",
  "mts",
  "m2ts",
  "m3u8",
  "m3u",
  "mpd",
  "ogv",
  "ogm",
  "3gp",
  "3g2",
  "wmv",
  "asf",
  "mpg",
  "mpeg",
  "m2v",
  "vob",
  "rmvb",
  "rm",
];

export type VideoEngineType = "native" | "hls" | "mpegts" | "dash";

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8];

/**
 * Determines the primary playback engine for a given video extension and MIME type.
 */
export function resolveVideoEngine(ext: string, mimeType?: string): VideoEngineType {
  const e = (ext || "").toLowerCase();
  const m = (mimeType || "").toLowerCase();

  // 1. HLS streams (.m3u8 / application/vnd.apple.mpegurl)
  if (e === "m3u8" || e === "m3u" || m.includes("mpegurl")) {
    if (Hls.isSupported()) {
      return "hls";
    }
    return "native";
  }

  // 2. MPEG-DASH streams (.mpd / application/dash+xml)
  if (e === "mpd" || m.includes("dash+xml")) {
    return "dash";
  }

  // 3. FLV / MPEG-TS / M2TS containers via mpegts.js MSE demuxer
  if (
    e === "flv" ||
    e === "ts" ||
    e === "mts" ||
    e === "m2ts" ||
    m === "video/x-flv" ||
    m === "video/mp2t"
  ) {
    if (typeof mpegts?.isSupported === "function" && mpegts.isSupported()) {
      return "mpegts";
    }
  }

  return "native";
}

/**
 * Captures the current decoded frame from a <video> element as a JPEG data URL
 * and persists it via `hostApi.saveCoverThumbnail` (which also extracts dominant color & palette).
 */
async function extractAndSaveVideoCover(
  videoEl: HTMLVideoElement,
  hostApi: PreviewPluginHostAPI
): Promise<Item | null> {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  if (vw <= 0 || vh <= 0) return null;

  const maxEdge = 640;
  let targetW = vw;
  let targetH = vh;
  if (vw > maxEdge || vh > maxEdge) {
    if (vw >= vh) {
      targetW = maxEdge;
      targetH = Math.max(1, Math.round((vh * maxEdge) / vw));
    } else {
      targetH = maxEdge;
      targetW = Math.max(1, Math.round((vw * maxEdge) / vh));
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  try {
    ctx.drawImage(videoEl, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    if (!dataUrl || dataUrl === "data:,") return null;
    return await hostApi.saveCoverThumbnail(dataUrl, {
      width: vw,
      height: vh,
      force: false,
    });
  } catch {
    return null;
  }
}

interface UnifiedVideoPlayerProps {
  item: Item;
  api?: PreviewPluginHostAPI;
  autoPlay?: boolean;
}

function UnifiedVideoPlayer({
  item,
  api,
  autoPlay = true,
}: UnifiedVideoPlayerProps) {
  const { t } = useTranslation();
  const hostApi = api ?? createPreviewPluginHostAPI(item);
  const originalFile = hostApi.getOriginalFile();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<mpegts.Player | null>(null);
  const dashRef = useRef<dashjs.MediaPlayerClass | null>(null);
  const coverExtractedRef = useRef<string | null>(null);

  const ext = originalFile.extension || (item.extension || "").toLowerCase();
  const [engine, setEngine] = useState<VideoEngineType>(() =>
    resolveVideoEngine(ext, originalFile.mimeType)
  );
  const [playing, setPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [muted, setMuted] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const [loop, setLoop] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [speedMenuOpen, setSpeedMenuOpen] = useState<boolean>(false);
  const [volumeHover, setVolumeHover] = useState<boolean>(false);
  const lastNonZeroVolumeRef = useRef<number>(1);

  useEffect(() => {
    setEngine(resolveVideoEngine(ext, originalFile.mimeType));
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSpeed(1);
    setPlaybackError(null);
  }, [item.id, ext, originalFile.mimeType]);

  const cleanupEngines = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        /* ignore */
      }
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      try {
        mpegtsRef.current.unload();
        mpegtsRef.current.detachMediaElement();
        mpegtsRef.current.destroy();
      } catch {
        /* ignore */
      }
      mpegtsRef.current = null;
    }
    if (dashRef.current) {
      try {
        dashRef.current.reset();
      } catch {
        /* ignore */
      }
      dashRef.current = null;
    }
  }, []);

  useEffect(() => {
    const videoEl = videoRef.current;
    const src = originalFile.url;
    if (!videoEl || !src) return;

    cleanupEngines();
    setPlaybackError(null);

    let isCancelled = false;

    const syncState = () => {
      if (isCancelled || !videoEl) return;
      setPlaying(!videoEl.paused && !videoEl.ended);
      setCurrentTime(Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0);
      if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        setDuration(videoEl.duration);
      }
      setVolume(videoEl.volume);
      setMuted(videoEl.muted);
      setSpeed(videoEl.playbackRate);
    };

    const tryCaptureFirstFrameCover = () => {
      if (isCancelled || !videoEl) return;
      if (
        (!item.hasThumbnail || !item.dominantColor) &&
        coverExtractedRef.current !== item.id &&
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0
      ) {
        coverExtractedRef.current = item.id;
        extractAndSaveVideoCover(videoEl, hostApi);
      }
    };

    const handleLoadedData = () => {
      syncState();
      tryCaptureFirstFrameCover();
    };

    const handleNativeError = () => {
      if (isCancelled || !videoEl) return;
      const mediaErr = videoEl.error;
      const codeMsg = mediaErr
        ? `MediaError (${mediaErr.code})`
        : t("preview.video.playbackError");
      setPlaybackError(codeMsg);
    };

    videoEl.addEventListener("loadedmetadata", syncState);
    videoEl.addEventListener("loadeddata", handleLoadedData);
    videoEl.addEventListener("durationchange", syncState);
    videoEl.addEventListener("timeupdate", syncState);
    videoEl.addEventListener("play", syncState);
    videoEl.addEventListener("playing", syncState);
    videoEl.addEventListener("pause", syncState);
    videoEl.addEventListener("ended", syncState);
    videoEl.addEventListener("volumechange", syncState);
    videoEl.addEventListener("ratechange", syncState);
    videoEl.addEventListener("error", handleNativeError);

    // Attempt play with automatic muted fallback if the browser's autoplay policy blocks unmuted playback
    const startPlaybackSafely = () => {
      if (!autoPlay || isCancelled) return;
      const playPromise = videoEl.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          if (isCancelled) return;
          videoEl.muted = true;
          setMuted(true);
          videoEl.play().catch(() => {});
        });
      }
    };

    if (engine === "hls" && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        startPlaybackSafely();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (isCancelled) return;
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setPlaybackError(`HLS: ${data.details}`);
              break;
          }
        }
      });
    } else if (
      engine === "mpegts" &&
      typeof mpegts?.isSupported === "function" &&
      mpegts.isSupported()
    ) {
      const mpegtsType =
        ext === "flv" || originalFile.mimeType === "video/x-flv" ? "flv" : "mse";
      const msePlayer = mpegts.createPlayer(
        {
          type: mpegtsType,
          isLive: false,
          url: src,
          cors: true,
        },
        {
          enableWorker: false,
          enableStashBuffer: true,
          autoCleanupSourceBuffer: true,
        }
      );
      mpegtsRef.current = msePlayer;
      msePlayer.attachMediaElement(videoEl);
      msePlayer.load();
      if (autoPlay) {
        Promise.resolve(msePlayer.play()).catch(() => {
          videoEl.muted = true;
          setMuted(true);
          Promise.resolve(msePlayer.play()).catch(() => {});
        });
      }
      msePlayer.on(mpegts.Events.MEDIA_INFO, (info: mpegts.MSEPlayerMediaInfo) => {
        if (isCancelled) return;
        if (info.duration && info.duration > 0) {
          setDuration(info.duration / 1000);
        }
      });
      msePlayer.on(mpegts.Events.ERROR, (errType: string, errDetail: string) => {
        if (isCancelled) return;
        setPlaybackError(`MSE (${errType}): ${errDetail}`);
      });
    } else if (engine === "dash") {
      const dashPlayer = dashjs.MediaPlayer().create();
      dashRef.current = dashPlayer;
      dashPlayer.initialize(videoEl, src, autoPlay);
      dashPlayer.on(dashjs.MediaPlayer.events.ERROR, (e: unknown) => {
        if (isCancelled) return;
        const errObj = e as { error?: { message?: string } };
        setPlaybackError(errObj?.error?.message || "DASH Error");
      });
    } else {
      videoEl.src = src;
      videoEl.load();
      startPlaybackSafely();
    }

    return () => {
      isCancelled = true;
      videoEl.removeEventListener("loadedmetadata", syncState);
      videoEl.removeEventListener("loadeddata", handleLoadedData);
      videoEl.removeEventListener("durationchange", syncState);
      videoEl.removeEventListener("timeupdate", syncState);
      videoEl.removeEventListener("play", syncState);
      videoEl.removeEventListener("playing", syncState);
      videoEl.removeEventListener("pause", syncState);
      videoEl.removeEventListener("ended", syncState);
      videoEl.removeEventListener("volumechange", syncState);
      videoEl.removeEventListener("ratechange", syncState);
      videoEl.removeEventListener("error", handleNativeError);
      cleanupEngines();
    };
  }, [
    item.id,
    item.hasThumbnail,
    item.dominantColor,
    originalFile.url,
    originalFile.mimeType,
    ext,
    engine,
    autoPlay,
    cleanupEngines,
    hostApi,
    t,
  ]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.loop = loop;
    }
  }, [loop]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const togglePlay = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (videoEl.paused || videoEl.ended) {
      videoEl.play().catch(() => {});
    } else {
      videoEl.pause();
    }
  }, []);

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const videoEl = videoRef.current;
      if (!videoEl) return;
      const maxTime =
        Number.isFinite(videoEl.duration) && videoEl.duration > 0
          ? videoEl.duration
          : duration || Infinity;
      const nextTime = Math.max(0, Math.min(maxTime, videoEl.currentTime + deltaSeconds));
      videoEl.currentTime = nextTime;
      setCurrentTime(nextTime);
    },
    [duration]
  );

  const handleSeekSlider = useCallback((val: number | number[]) => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const target = Array.isArray(val) ? val[0] : val;
    if (typeof target === "number" && Number.isFinite(target)) {
      videoEl.currentTime = target;
      setCurrentTime(target);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (videoEl.muted || videoEl.volume === 0) {
      const restore =
        lastNonZeroVolumeRef.current > 0 ? lastNonZeroVolumeRef.current : 1;
      videoEl.volume = restore;
      videoEl.muted = false;
      setVolume(restore);
      setMuted(false);
    } else {
      lastNonZeroVolumeRef.current = videoEl.volume;
      videoEl.muted = true;
      setMuted(true);
    }
  }, []);

  const handleVolumeSlider = useCallback((val: number | number[]) => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const raw = Array.isArray(val) ? val[0] : val;
    const nextVol = Math.max(
      0,
      Math.min(1, (typeof raw === "number" ? raw : 100) / 100)
    );
    if (nextVol > 0) {
      lastNonZeroVolumeRef.current = nextVol;
    }
    videoEl.volume = nextVol;
    videoEl.muted = nextVol === 0;
    setVolume(nextVol);
    setMuted(nextVol === 0);
  }, []);

  const handleSelectSpeed = useCallback((nextSpeed: number) => {
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.playbackRate = nextSpeed;
    }
    setSpeed(nextSpeed);
    setSpeedMenuOpen(false);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const hostEl = containerRef.current;
    const videoEl = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (!hostEl) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (typeof hostEl.requestFullscreen === "function") {
        await hostEl.requestFullscreen();
      } else if (videoEl && typeof videoEl.webkitEnterFullscreen === "function") {
        videoEl.webkitEnterFullscreen();
      }
    } catch {
      if (videoEl && typeof videoEl.webkitEnterFullscreen === "function") {
        try {
          videoEl.webkitEnterFullscreen();
        } catch {
          /* ignore */
        }
      }
    }
  }, []);

  // Keyboard shortcuts for full viewport player
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        seekBy(-5);
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        seekBy(5);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMute();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, seekBy, toggleMute, toggleFullscreen]);

  const effectiveVolumePercent = muted ? 0 : Math.round(volume * 100);
  const VolumeIcon =
    muted || effectiveVolumePercent === 0
      ? VolumeX
      : effectiveVolumePercent < 50
      ? Volume1
      : Volume2;

  const progressTooltip = t("preview.video.progress", {
    current: formatDuration(currentTime),
    duration: formatDuration(duration),
  });

  const coverUrl = hostApi.getCoverUrl();

  return (
    <TooltipProvider delay={120}>
      <div
        ref={containerRef}
        data-video-interactive="true"
        className="w-full h-full flex flex-col bg-background select-none overflow-hidden"
      >
        {/* 1. Video Display Stage (split from controller, zero padding) */}
        <div
          onClick={togglePlay}
          className="relative flex-1 w-full min-h-0 flex items-center justify-center cursor-pointer overflow-hidden"
        >
          <video
            ref={videoRef}
            key={`${item.id}-${engine}`}
            playsInline
            preload="auto"
            crossOrigin="anonymous"
            poster={coverUrl}
            className="w-full h-full max-h-full object-contain outline-none"
          />

          {/* Codec / Container Fallback Overlay when WebView cannot decode */}
          {playbackError && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center p-4 bg-background/90 backdrop-blur-md text-center gap-3 cursor-default"
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div className="size-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500" />
                  }
                >
                  <AlertTriangle className="size-5" />
                </TooltipTrigger>
                <TooltipContent>
                  {t("preview.video.playbackError")} ({playbackError})
                </TooltipContent>
              </Tooltip>

              <div className="flex items-center gap-2">
                {engine !== "native" && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            setPlaybackError(null);
                            setEngine("native");
                          }}
                        />
                      }
                    >
                      <RotateCcw />
                    </TooltipTrigger>
                    <TooltipContent>{t("preview.video.retryNative")}</TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => hostApi.openWithDefaultApp()}
                      />
                    }
                  >
                    <ExternalLink />
                  </TooltipTrigger>
                  <TooltipContent>{t("preview.video.openDefaultApp")}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => hostApi.revealInFinder()}
                      />
                    }
                  >
                    <FolderOpen />
                  </TooltipTrigger>
                  <TooltipContent>{t("preview.video.revealInFinder")}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}
        </div>

        {/* 2. Standalone Shadcn UI Controller Bar (naturally flows below video, never overlaps) */}
        <div
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-background text-foreground shrink-0 z-20"
        >
          {/* 1. Play / Pause */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={playing ? t("preview.video.pause") : t("preview.video.play")}
                  onClick={togglePlay}
                />
              }
            >
              {playing ? <Pause /> : <Play />}
            </TooltipTrigger>
            <TooltipContent>
              {playing ? t("preview.video.pause") : t("preview.video.play")}
            </TooltipContent>
          </Tooltip>

          {/* 2. Rewind 5s */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("preview.video.rewind5s")}
                  onClick={() => seekBy(-5)}
                />
              }
            >
              <RotateCcw />
            </TooltipTrigger>
            <TooltipContent>{t("preview.video.rewind5s")}</TooltipContent>
          </Tooltip>

          {/* 3. Forward 5s */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("preview.video.forward5s")}
                  onClick={() => seekBy(5)}
                />
              }
            >
              <RotateCw />
            </TooltipTrigger>
            <TooltipContent>{t("preview.video.forward5s")}</TooltipContent>
          </Tooltip>

          {/* 4. Volume Toggle (click to mute/unmute) + Hover-Reveal Volume Slider */}
          <div
            onMouseEnter={() => setVolumeHover(true)}
            onMouseLeave={() => setVolumeHover(false)}
            className="flex items-center shrink-0"
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={muted ? t("preview.video.unmute") : t("preview.video.mute")}
                    onClick={toggleMute}
                  />
                }
              >
                <VolumeIcon />
              </TooltipTrigger>
              <TooltipContent>
                {muted ? t("preview.video.unmute") : t("preview.video.mute")}
              </TooltipContent>
            </Tooltip>

            <div
              className={`overflow-hidden transition-all duration-150 ease-out flex items-center ${
                volumeHover ? "w-24 pl-1.5 pr-2.5 opacity-100" : "w-0 px-0 opacity-0 pointer-events-none"
              }`}
            >
              <Tooltip>
                <TooltipTrigger render={<div className="w-full py-1.5 flex items-center" />}>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={effectiveVolumePercent}
                    onValueChange={handleVolumeSlider}
                    aria-label={t("preview.video.volume", { volume: effectiveVolumePercent })}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {t("preview.video.volume", { volume: effectiveVolumePercent })}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* 5. Current Time / Total Duration + Progress Bar (occupies all remaining space) */}
          <span className="font-mono text-xs tabular-nums text-muted-foreground px-1.5 shrink-0 select-none">
            {formatDuration(currentTime)}{" "}
            <span className="text-muted-foreground/50">/</span>{" "}
            {formatDuration(duration)}
          </span>

          <Tooltip>
            <TooltipTrigger
              render={<div className="flex-1 min-w-16 px-2 py-1.5 flex items-center" />}
            >
              <Slider
                min={0}
                max={duration > 0 ? duration : 100}
                step={0.05}
                value={duration > 0 ? Math.min(currentTime, duration) : 0}
                onValueChange={handleSeekSlider}
                disabled={duration <= 0}
                aria-label={progressTooltip}
              />
            </TooltipTrigger>
            <TooltipContent>{progressTooltip}</TooltipContent>
          </Tooltip>

          {/* 6. Playback Speed Dropdown Menu (up to 8x) */}
          <Popover open={speedMenuOpen} onOpenChange={setSpeedMenuOpen}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("preview.video.speed", { speed })}
                        className={speed !== 1 ? "text-primary" : undefined}
                      />
                    }
                  />
                }
              >
                <Gauge />
              </TooltipTrigger>
              <TooltipContent>{t("preview.video.speed", { speed })}</TooltipContent>
            </Tooltip>

            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              className="w-28 p-1 rounded-xl gap-0.5"
            >
              {PLAYBACK_SPEEDS.map((s) => {
                const isSelected = speed === s;
                return (
                  <Button
                    key={s}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectSpeed(s)}
                    className="w-full justify-between font-mono text-xs"
                  >
                    <span>{s}x</span>
                    {isSelected && <Check className="size-3.5" />}
                  </Button>
                );
              })}
            </PopoverContent>
          </Popover>

          {/* 7. Loop On / Off (Icon-only, text in tooltip) */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={loop ? t("preview.video.loopOn") : t("preview.video.loopOff")}
                  onClick={() => setLoop((prev) => !prev)}
                  className={loop ? "text-primary" : undefined}
                />
              }
            >
              <Repeat />
            </TooltipTrigger>
            <TooltipContent>
              {loop ? t("preview.video.loopOn") : t("preview.video.loopOff")}
            </TooltipContent>
          </Tooltip>

          {/* 8. Fullscreen (Icon-only, text in tooltip) */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    isFullscreen
                      ? t("preview.video.exitFullscreen")
                      : t("preview.video.enterFullscreen")
                  }
                  onClick={toggleFullscreen}
                />
              }
            >
              {isFullscreen ? <Minimize2 /> : <Maximize2 />}
            </TooltipTrigger>
            <TooltipContent>
              {isFullscreen
                ? t("preview.video.exitFullscreen")
                : t("preview.video.enterFullscreen")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}

/**
 * Right Inspector Preview for videos:
 * Displays ONLY the cover image (existing video cover or automatically extracted first frame).
 * If a video does not yet have a cover thumbnail on disk (e.g. non-macOS or MSE-only container),
 * it decodes the first frame offscreen in the background, saves it via `api.saveCoverThumbnail`
 * (which also extracts the 6-color palette for color search), and renders the cover image.
 */
function VideoCoverInspectorPreview({
  item,
  onOpenPreview,
  onDragStart,
  api,
}: {
  item: Item;
  onOpenPreview?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  api?: PreviewPluginHostAPI;
}) {
  const hostApi = api ?? createPreviewPluginHostAPI(item);
  const originalFile = hostApi.getOriginalFile();
  const [localCoverItem, setLocalCoverItem] = useState<Item>(item);
  const extractedForIdRef = useRef<string | null>(null);

  useEffect(() => {
    setLocalCoverItem(item);
  }, [item]);

  // If the video has no thumbnail or dominant color yet, extract the first frame offscreen
  useEffect(() => {
    if (
      (item.hasThumbnail && item.dominantColor) ||
      extractedForIdRef.current === item.id ||
      !originalFile.url
    ) {
      return;
    }

    extractedForIdRef.current = item.id;
    let isCancelled = false;
    const videoEl = document.createElement("video");
    videoEl.crossOrigin = "anonymous";
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.preload = "auto";

    let hls: Hls | null = null;
    let msePlayer: mpegts.Player | null = null;

    const cleanup = () => {
      videoEl.removeEventListener("loadeddata", onLoadedData);
      videoEl.removeEventListener("seeked", onSeeked);
      if (hls) {
        try {
          hls.destroy();
        } catch {
          /* ignore */
        }
        hls = null;
      }
      if (msePlayer) {
        try {
          msePlayer.unload();
          msePlayer.detachMediaElement();
          msePlayer.destroy();
        } catch {
          /* ignore */
        }
        msePlayer = null;
      }
      videoEl.removeAttribute("src");
      videoEl.load();
    };

    const captureNow = async () => {
      if (isCancelled) return;
      const updated = await extractAndSaveVideoCover(videoEl, hostApi);
      if (!isCancelled && updated) {
        setLocalCoverItem({
          ...updated,
          thumbnailUrl: `${updated.thumbnailUrl}?t=${Date.now()}`,
        });
      }
      cleanup();
    };

    const onSeeked = () => {
      captureNow();
    };

    const onLoadedData = () => {
      if (isCancelled) return;
      // Seek slightly past 0 if possible to ensure a non-empty decoded frame
      if (videoEl.duration > 0.1 && videoEl.currentTime === 0) {
        videoEl.currentTime = 0.05;
      } else {
        captureNow();
      }
    };

    videoEl.addEventListener("loadeddata", onLoadedData);
    videoEl.addEventListener("seeked", onSeeked);

    const engine = resolveVideoEngine(originalFile.extension, originalFile.mimeType);
    if (engine === "hls" && Hls.isSupported()) {
      hls = new Hls({ autoStartLoad: true });
      hls.loadSource(originalFile.url);
      hls.attachMedia(videoEl);
    } else if (
      engine === "mpegts" &&
      typeof mpegts?.isSupported === "function" &&
      mpegts.isSupported()
    ) {
      const mpegtsType =
        originalFile.extension === "flv" || originalFile.mimeType === "video/x-flv"
          ? "flv"
          : "mse";
      msePlayer = mpegts.createPlayer(
        {
          type: mpegtsType,
          isLive: false,
          url: originalFile.url,
          cors: true,
        },
        { enableWorker: false, enableStashBuffer: true }
      );
      msePlayer.attachMediaElement(videoEl);
      msePlayer.load();
    } else {
      videoEl.src = originalFile.url;
      videoEl.load();
    }

    return () => {
      isCancelled = true;
      cleanup();
    };
  }, [
    item.id,
    item.hasThumbnail,
    item.dominantColor,
    originalFile.url,
    originalFile.extension,
    originalFile.mimeType,
    hostApi,
  ]);

  return (
    <div
      onDoubleClick={onOpenPreview}
      className="w-full flex items-center justify-center py-1 cursor-pointer select-none"
    >
      <UniversalThumbnail
        item={localCoverItem}
        draggable={true}
        onDragStart={onDragStart}
        objectFit="contain"
        borderless={true}
        className="max-h-56 w-auto max-w-full cursor-grab active:cursor-grabbing"
      />
    </div>
  );
}

/**
 * Matches video files while ensuring TypeScript source files (.ts with text/* MIME)
 * are not mistakenly treated as MPEG-TS video streams.
 */
function matchVideoItem(item: Item): boolean {
  const ext = (item.extension || "").toLowerCase();
  const mime = (item.mimeType || "").toLowerCase();

  if (ext === "ts") {
    return mime === "video/mp2t" || mime.startsWith("video/");
  }
  if (VIDEO_EXTENSIONS.includes(ext)) {
    return true;
  }
  if (
    mime.startsWith("video/") ||
    mime === "application/vnd.apple.mpegurl" ||
    mime === "application/x-mpegurl" ||
    mime === "application/dash+xml"
  ) {
    return true;
  }
  return false;
}

export const VideoPreviewPlugin: PreviewPlugin = {
  id: "builtin.video",
  name: "Video Player",
  nameKey: "settings.plugins.items.video.name",
  description:
    "Multi-engine video player (HLS, MPEG-TS/FLV, DASH & HTML5 Native) with frame-accurate controls and automatic cover color extraction.",
  descriptionKey: "settings.plugins.items.video.description",
  version: "1.0.0",
  author: "Bowerbird",
  builtin: true,
  canDisable: false,
  priority: 90,
  extensions: VIDEO_EXTENSIONS,
  mimePrefixes: [
    "video/",
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "application/dash+xml",
  ],
  match: matchVideoItem,
  supportsZoom: false,
  Viewport: ({ item, api }) => (
    <div className="w-full h-full flex items-center justify-center select-none overflow-hidden">
      <UnifiedVideoPlayer item={item} api={api} autoPlay={true} />
    </div>
  ),
  InspectorPreview: ({ item, onOpenPreview, onDragStart, api }) => (
    <VideoCoverInspectorPreview
      item={item}
      onOpenPreview={onOpenPreview}
      onDragStart={onDragStart}
      api={api}
    />
  ),
};
