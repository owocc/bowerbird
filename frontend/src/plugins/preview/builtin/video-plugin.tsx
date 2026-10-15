import type {
  PreviewPlugin,
  PreviewViewportProps,
  PreviewInspectorProps,
} from "../types";

const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "mkv", "avi", "m4v"];

function VideoViewport({ item }: PreviewViewportProps) {
  return (
    <div className="w-full h-full flex items-center justify-center p-6">
      <video
        key={item.id}
        src={item.originalUrl}
        controls
        autoPlay
        playsInline
        className="max-w-full max-h-full rounded-lg outline-none shadow-2xl"
      />
    </div>
  );
}

function VideoInspectorPreview({ item, onOpenPreview }: PreviewInspectorProps) {
  return (
    <div
      onDoubleClick={onOpenPreview}
      className="w-full flex items-center justify-center py-1 select-none"
    >
      <video
        key={item.id}
        src={item.originalUrl}
        controls
        preload="metadata"
        className="max-h-52 w-auto max-w-full rounded-sm outline-none"
      />
    </div>
  );
}

export const VideoPreviewPlugin: PreviewPlugin = {
  id: "builtin.video",
  name: "Video Player",
  priority: 90,
  extensions: VIDEO_EXTENSIONS,
  mimePrefixes: ["video/"],
  supportsZoom: false,
  Viewport: VideoViewport,
  InspectorPreview: VideoInspectorPreview,
};
