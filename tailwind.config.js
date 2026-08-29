/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // ── DSSC LSC Santa Cruz — Reimagined palette ──────────────────────
        // Primary
        'royal-blue':   '#1B2E8C',
        'deep-navy':    '#0E1A4D',
        'metallic-blue': '#3A5FE0',
        'metallic-blue-highlight': '#6E8CFF',
        // Secondary
        'off-white':    '#F4F6FC',
        // Accent
        'lsc-gold':     '#C9A34E',
        'silver-gray':  '#B8C1D9',
        // Status (keep named tokens for badge/alert usage)
        'status-success': '#2E9E5B',
        'status-warning': '#D9A441',
        'status-danger':  '#C74B4B',
        'status-info':    '#3A5FE0',
        // Legacy aliases kept so existing inline Tailwind classes still compile
        red: {
          DEFAULT: '#C74B4B',
          50: '#FDEAEA',
          100: '#FAD5D5',
          200: '#F4ABAB',
          300: '#EE8181',
          400: '#D95F5F',
          500: '#C74B4B',
          600: '#A63A3A',
          700: '#7D2B2B',
          800: '#531C1C',
          900: '#2A0E0E',
        },
        orange: {
          DEFAULT: '#C9A34E',
          50: '#FDF7EC',
          100: '#FAEED9',
          200: '#F5DCB3',
          300: '#EFCB8D',
          400: '#DEBA6C',
          500: '#C9A34E',
          600: '#A6853F',
          700: '#7D6430',
          800: '#534320',
          900: '#2A2110',
        },
        dark: '#0E1A4D',
        'text-secondary': '#4A5580',
        // ─────────────────────────────────────────────────────────────────
      },
      fontFamily: {
        // Updated: Poppins for headings / display, Inter for body
        display: ['Poppins', 'Segoe UI', 'sans-serif'],
        body: ['Inter', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
        '2xl': '1rem',
        '3xl': '1.375rem',
        '4xl': '1.75rem',
      },
      backgroundImage: {
        'seal-metallic': 'linear-gradient(135deg, #6E8CFF 0%, #3A5FE0 35%, #1B2E8C 70%, #0E1A4D 100%)',
        'hero-overlay':  'linear-gradient(180deg, rgba(14,26,77,0) 0%, rgba(14,26,77,0.85) 100%)',
        'card-accent':   'linear-gradient(90deg, #1B2E8C 0%, #3A5FE0 100%)',
        'btn-primary-grad': 'linear-gradient(90deg, #1B2E8C 0%, #3A5FE0 100%)',
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        glass: '0 18px 50px rgba(14, 26, 77, 0.10)',
        'glass-hover': '0 24px 60px rgba(14, 26, 77, 0.18)',
        card: '0 4px 12px rgba(14, 26, 77, 0.08)',
        'card-hover': '0 8px 24px rgba(14, 26, 77, 0.14)',
      },
      backdropBlur: {
        glass: '16px',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(20px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "fade-in": "fade-in 0.5s ease-out",
        "slide-up": "slide-up 0.5s ease-out",
        "slide-in-right": "slide-in-right 0.5s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
