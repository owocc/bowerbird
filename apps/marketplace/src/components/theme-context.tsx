import * as React from "react";

export type Theme = "system" | "light" | "dark";

export interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "dark",
  resolvedTheme: "dark",
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return React.useContext(ThemeContext);
}
