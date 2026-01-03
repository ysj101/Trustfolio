module.exports = {
  content: ['./src/ui/**/*.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        panel: '0 12px 32px rgba(0, 0, 0, 0.35)',
        glow: '0 0 32px rgba(99, 102, 241, 0.45)',
      },
    },
  },
};
