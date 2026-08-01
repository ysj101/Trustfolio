#!/bin/bash
# Tailwind CSSをビルドして、styles.htmlにインライン展開
set -euo pipefail

# Tailwind CSS をビルド（issue #176 で v4 へ移行済み。設定は src/ui/input.css の
# CSS-first 形式。移行の詳細は docs/UPGRADE_STRATEGY.md の
# 「Tailwind CSS v4 移行の記録」を参照）
tailwindcss -i src/ui/input.css -o dist/styles.css --minify

# CSSの内容を読み込んでstyles.htmlを生成
if [ -f dist/styles.css ]; then
  css_contents="$(cat dist/styles.css)"
  cat > dist/styles.html <<'EOF'
<!-- DNS prefetch と preconnect -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

<!-- ビルド済みCSSの読み込み -->
<style>
EOF
  printf '%s\n' "${css_contents}" >> dist/styles.html
  cat >> dist/styles.html <<'EOF'
</style>
EOF
  echo "✓ CSS embedded into dist/styles.html"
else
  echo "✗ dist/styles.css not found"
  exit 1
fi
