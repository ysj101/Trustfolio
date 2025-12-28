# Trustfolio GAS Dark Theme Tokens

Use these tokens in src/ui/styles.html. Override existing light tokens instead of adding ad-hoc colors.

Example token set:

:root {
  color-scheme: dark;
  --bg: #0e1116;
  --bg-accent: #131a24;
  --ink: #eef3f9;
  --muted: #a7b0bb;
  --panel: #151b23;
  --panel-border: #263140;
  --primary: #4aa3ff;
  --primary-soft: #1f2f44;
  --accent: #ffb84d;
  --accent-strong: #f79b2e;
  --error: #ff6b6b;
  --success: #33d17a;
  --shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
}

Guidelines:
- Use --bg for page background and subtle gradients.
- Use --panel for cards and sections; border with --panel-border.
- Use --ink for main text, --muted for helper text.
- Keep buttons high-contrast; use --primary for main actions.
