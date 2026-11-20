/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ['./index.html', './client/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      screens: {
        // Laptop-height windows (1366x768, 1280x800). The portal's full-page
        // layouts are tuned for taller screens and tighten up under this.
        short: { raw: "(max-height: 820px)" },
      },
      fontFamily: {
        // Source Serif 4 stands in for Copernicus; Inter for Styrene. Both are
        // self-hosted (see client/main.tsx) so there is no CDN round trip.
        // Headings: short, so the Noto Serif SC webfont (sliced by unicode
        // range, only the glyphs used are fetched) keeps Chinese in serif too.
        display: ['"Source Serif 4 Variable"', '"Noto Serif SC"', '"Songti SC"', 'Georgia', 'serif'],
        // The AI's voice, as on claude.ai: serif for Latin text; CJK falls
        // to the system's Songti on macOS and to YaHei elsewhere rather than
        // pulling a large serif font for every reply.
        voice: ['"Source Serif 4 Variable"', 'Georgia', '"Songti SC"', '"PingFang SC"', '"Microsoft YaHei"', '"Noto Sans SC"', 'serif'],
        sans: ['"Inter Variable"', '-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Microsoft YaHei"', '"Noto Sans SC"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Consolas', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        elevated: "hsl(var(--elevated))",
        sunken: "hsl(var(--sunken))",
        overlay: "hsl(var(--overlay))",
        brand: {
          DEFAULT: "hsl(var(--brand))",
          hover: "hsl(var(--brand-hover))",
          foreground: "hsl(var(--brand-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          strong: "hsl(var(--primary-strong))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
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
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 10px)",
      },
      boxShadow: {
        // `shadow-xs` shipped in shadcn's Tailwind-v4 templates but was never
        // defined here, so seven call sites rendered no shadow at all.
        xs: "0 1px 2px hsl(var(--shadow-hue) / 0.05)",
      },
      /**
       * The assistant's every reply renders through `prose`, and the stock
       * plugin theme is its own grey ramp -- so the longest-lived text in the
       * product was the one surface still ignoring the tokens. Driving the
       * `--tw-prose-*` variables from them makes it follow the palette, and
       * makes `dark:prose-invert` unnecessary: the tokens already flip.
       */
      typography: {
        DEFAULT: {
          css: {
            "--tw-prose-body": "hsl(var(--foreground) / 0.88)",
            "--tw-prose-headings": "hsl(var(--foreground))",
            "--tw-prose-lead": "hsl(var(--muted-foreground))",
            "--tw-prose-links": "hsl(var(--foreground))",
            "--tw-prose-bold": "hsl(var(--foreground))",
            "--tw-prose-counters": "hsl(var(--muted-foreground))",
            "--tw-prose-bullets": "hsl(var(--muted-foreground) / 0.6)",
            "--tw-prose-hr": "hsl(var(--border))",
            "--tw-prose-quotes": "hsl(var(--foreground) / 0.9)",
            "--tw-prose-quote-borders": "hsl(var(--foreground) / 0.15)",
            "--tw-prose-captions": "hsl(var(--muted-foreground))",
            "--tw-prose-code": "hsl(var(--foreground))",
            "--tw-prose-pre-code": "hsl(var(--foreground))",
            "--tw-prose-pre-bg": "hsl(var(--sunken))",
            "--tw-prose-th-borders": "hsl(var(--border))",
            "--tw-prose-td-borders": "hsl(var(--border) / 0.6)",

            maxWidth: "none",
            lineHeight: "1.8",

            // Replies speak in the voice serif (set on the prose container),
            // and so do their headings, at Claude's medium weight.
            "h1, h2, h3, h4": {
              letterSpacing: "-0.01em",
              fontWeight: "500",
            },

            // The plugin wraps inline code in literal backticks; a tinted chip
            // says the same thing without the punctuation.
            "code::before": { content: '""' },
            "code::after": { content: '""' },
            ":not(pre) > code": {
              backgroundColor: "hsl(var(--foreground) / 0.05)",
              borderRadius: "4px",
              padding: "0.1em 0.3em",
              fontWeight: "400",
              fontSize: "0.86em",
            },

            // A rule, not a box, and upright rather than italic.
            blockquote: {
              fontStyle: "normal",
              fontWeight: "400",
              borderLeftWidth: "2px",
              paddingLeft: "1.1em",
            },
            "blockquote p:first-of-type::before": { content: '""' },
            "blockquote p:last-of-type::after": { content: '""' },

            a: {
              fontWeight: "400",
              textDecorationColor: "hsl(var(--foreground) / 0.35)",
              textDecorationThickness: "1px",
              textUnderlineOffset: "2px",
            },

            // Hairlines only; the plugin's default header rule is heavy.
            "thead th": { fontWeight: "500", borderBottomWidth: "1px" },
            hr: { borderTopWidth: "1px" },
          },
        },
      },
      transitionTimingFunction: {
        "out-soft": "var(--ease-out-soft)",
        "in-out-soft": "var(--ease-in-out-soft)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "240ms",
        slow: "380ms",
      },
      keyframes: {
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "none" },
        },
        // Travelling highlight for streaming/pending text.
        sheen: {
          from: { backgroundPosition: "200% center" },
          to: { backgroundPosition: "-200% center" },
        },
        // Soft attention pulse that does not change layout.
        breathe: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        // Both of these were already referenced from the chat components but
        // had never been defined anywhere, so the panels and their messages
        // arrived with no animation at all.
        "message-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(14px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      /**
       * `backwards`, not `both`, for anything that animates a transform.
       * `forwards` retains the final keyframe, which leaves an identity matrix
       * on the element -- and any transform, identity or not, makes it the
       * containing block for `position: fixed` descendants. With `both` on the
       * chat panel and its message rows, every full-screen overlay inside the
       * chat was clipped to the panel instead of covering the viewport.
       * These all end at the element's natural state, so reverting to its own
       * styles looks identical.
       */
      animation: {
        "rise-in": "rise-in var(--dur-base) var(--ease-out-soft) backwards",
        "fade-in": "fade-in var(--dur-base) var(--ease-out-soft) backwards",
        "scale-in": "scale-in var(--dur-base) var(--ease-out-soft) backwards",
        sheen: "sheen 2.2s linear infinite",
        breathe: "breathe 4s var(--ease-in-out-soft) infinite",
        "message-in": "message-in var(--dur-base) var(--ease-out-soft) backwards",
        "slide-in-right": "slide-in-right var(--dur-slow) var(--ease-out-soft) backwards",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require('@tailwindcss/typography'),
  ],
}
