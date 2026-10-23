import * as React from "react";
import {
  FileText,
  Music,
  Table,
  Camera,
  Box,
  Sparkles,
  Code2,
  Database,
  Palette,
  FileCode,
  FileImage,
  FileVideo,
} from "lucide-react";

export function getPluginIcon(iconName?: string) {
  switch (iconName) {
    case "file-text":
      return FileText;
    case "music":
      return Music;
    case "table":
      return Table;
    case "camera":
      return Camera;
    case "sparkles":
      return Sparkles;
    case "code":
      return Code2;
    case "database":
      return Database;
    case "palette":
      return Palette;
    case "box":
      return Box;
    case "image":
      return FileImage;
    case "video":
      return FileVideo;
    default:
      return FileCode;
  }
}
