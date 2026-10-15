export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDate(timestampSeconds: number): string {
  if (!timestampSeconds) return "-";
  const date = new Date(timestampSeconds * 1000);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getFileCategory(
  ext: string,
  mimeType?: string
): "image" | "video" | "audio" | "document" | "archive" | "other" {
  const e = (ext || "").toLowerCase();
  const m = (mimeType || "").toLowerCase();
  if (e === "ts") {
    return m.startsWith("video/") ? "video" : "document";
  }
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "tiff", "tif", "avif", "ico"].includes(e)) {
    return "image";
  }
  if (
    [
      "mp4",
      "mov",
      "qt",
      "mkv",
      "avi",
      "webm",
      "m4v",
      "flv",
      "f4v",
      "ts",
      "mts",
      "m2ts",
      "m3u8",
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
    ].includes(e)
  ) {
    return "video";
  }
  if (["mp3", "wav", "flac", "aac", "ogg", "m4a", "opus"].includes(e)) {
    return "audio";
  }
  if (["pdf", "txt", "md", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "json", "js", "ts", "go", "py"].includes(e)) {
    return "document";
  }
  if (["zip", "tar", "gz", "rar", "7z"].includes(e)) {
    return "archive";
  }
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  return "other";
}

export function escapePathForShell(path: string): string {
  if (!path) return "";
  return path.replace(/([ \t\u00a0\u202f()\[\]{}'"\\$`!#&*?;<>~])/g, "\\$1");
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}
