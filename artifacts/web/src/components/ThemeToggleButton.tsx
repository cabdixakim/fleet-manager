import * as React from "react";
import { useTheme } from "@/contexts/ThemeContext";

export function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-full p-1 transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
      style={{ lineHeight: 0 }}
    >
      {theme === "dark" ? (
        // Sun SVG (orange)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="orange" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2m0 18v2m11-11h-2M3 12H1m16.95 6.95-1.41-1.41M6.46 6.46 5.05 5.05m12.02 0-1.41 1.41M6.46 17.54l-1.41 1.41" />
        </svg>
      ) : (
        // Moon SVG (gray)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      )}
    </button>
  );
}
