import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1200px" }
    },
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        danger: "hsl(var(--danger))"
      },
      borderRadius: {
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 6px)",
        "2xl": "calc(var(--radius) + 12px)"
      },
      boxShadow: {
        soft: "0 8px 24px rgba(15, 23, 42, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;


