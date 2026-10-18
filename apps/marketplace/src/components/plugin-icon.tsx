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
  Layers,
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
    default:
      return FileCode;
  }
}
