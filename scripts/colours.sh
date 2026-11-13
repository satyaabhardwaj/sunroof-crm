#!/bin/bash
# Colours only (26 Oct 2026). "classic" puts back the old colours, "zen" the zen ones. Nothing else changes.
# Reload the page after running it.
cd "$(dirname "$0")/.." || exit 1
case "$1" in
  classic) echo "/* Classic colours: tokens.css alone. Zen again: bash scripts/colours.sh zen */" > shared/colours.css; echo "Classic colours are back." ;;
  zen) cp shared/colours-zen.css shared/colours.css; echo "Zen colours are on." ;;
  *) echo "Use: bash scripts/colours.sh classic   or   bash scripts/colours.sh zen"; exit 1 ;;
esac
