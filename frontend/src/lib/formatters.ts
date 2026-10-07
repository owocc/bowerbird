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

export function getFileCategory(ext: string): "image" | "video" | "audio" | "document" | "archive" | "other" {
  const e = ext.toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "tiff", "ico"].includes(e)) {
    return "image";
  }
  if (["mp4", "mov", "mkv", "avi", "webm"].includes(e)) {
    return "video";
  }
  if (["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(e)) {
    return "audio";
  }
  if (["pdf", "txt", "md", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "json", "js", "ts", "go", "py"].includes(e)) {
    return "document";
  }
  if (["zip", "tar", "gz", "rar", "7z"].includes(e)) {
    return "archive";
  }
  return "other";
}

export function escapePathForShell(path: string): string {
  if (!path) return "";
  return path.replace(/([ \t\u00a0\u202f()\[\]{}'"\\$`!#&*?;<>~])/g, "\\$1");
}
