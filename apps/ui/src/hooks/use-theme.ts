import { useContext } from "react";
import { ThemeContext } from "../app/theme-context.js";

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
