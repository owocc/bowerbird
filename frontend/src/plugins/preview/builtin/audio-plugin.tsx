import { FileAudio } from "lucide-react";
import { formatBytes } from "@/lib/formatters";
import type {
  PreviewPlugin,
  PreviewViewportProps,
  PreviewInspectorProps,
} from "../types";

const AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "aac", "ogg", "m4a", "opus"];

function AudioViewport({ item }: PreviewViewportProps) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-6">
      <div className="size-28 rounded-3xl bg-pink-500/10 flex items-center justify-center text-pink-500">
        <FileAudio className="size-14 stroke-[1.5]" />
      </div>
      <div className="text-center space-y-1">
        <h3 className="text-sm font-semibold text-foreground break-all max-w-md">
          {item.filename || item.name}
        </h3>
        <p className="text-xs text-muted-foreground font-mono">
          {formatBytes(item.size)}
        </p>
      </div>
      <audio
        key={item.id}
        src={item.originalUrl}
        controls
        autoPlay
        className="w-full max-w-md outline-none"
      />
    </div>
  );
}

function AudioInspectorPreview({ item }: PreviewInspectorProps) {
  return (
    <div className="w-full flex flex-col items-center justify-center py-2 gap-3 select-none">
      <div className="size-16 rounded-2xl bg-pink-500/10 flex items-center justify-center text-pink-500">
        <FileAudio className="size-8 stroke-[1.5]" />
      </div>
      <audio
        key={item.id}
        src={item.originalUrl}
        controls
        preload="metadata"
        className="w-full h-8 outline-none"
      />
    </div>
  );
}

export const AudioPreviewPlugin: PreviewPlugin = {
  id: "builtin.audio",
  name: "Audio Player",
  priority: 85,
  extensions: AUDIO_EXTENSIONS,
  mimePrefixes: ["audio/"],
  supportsZoom: false,
  Viewport: AudioViewport,
  InspectorPreview: AudioInspectorPreview,
};
