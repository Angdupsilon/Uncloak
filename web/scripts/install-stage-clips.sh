#!/usr/bin/env bash
# Install Time Machine stage clips downloaded from Grok Imagine.
#
# Usage:
#   ./scripts/install-stage-clips.sh filed.mp4 certified.mp4 construction.mp4 complete.mp4 energized.mp4
#
# or, to place them one at a time as you generate them:
#   ./scripts/install-stage-clips.sh --stage construction ~/Downloads/whatever-grok-called-it.mp4
#
# The app reads these by exact filename, so this exists purely to stop a typo
# silently turning into a missing clip.

set -euo pipefail

DEST="$(cd "$(dirname "$0")/.." && pwd)/public/stages"
STAGES=(filed certified construction complete energized)

die() { echo "error: $*" >&2; exit 1; }

install_one() {
  local stage="$1" src="$2"
  [[ " ${STAGES[*]} " == *" $stage "* ]] || die "unknown stage '$stage' (expected: ${STAGES[*]})"
  [[ -f "$src" ]] || die "no such file: $src"

  local ext="${src##*.}"
  ext="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"
  case "$ext" in
    mp4|webm|mov) ;;
    *) die "'$src' is .$ext - the app expects a video (.mp4 preferred)" ;;
  esac

  # The component requests .mp4; anything else needs the extension recorded so
  # you know to update lib/stages.ts rather than wonder why it 404s.
  local out="$DEST/$stage.mp4"
  if [[ "$ext" != "mp4" ]]; then
    out="$DEST/$stage.$ext"
    echo "  note: kept .$ext - update clip path for '$stage' in web/lib/stages.ts"
  fi

  mkdir -p "$DEST"
  cp "$src" "$out"

  local bytes; bytes=$(wc -c < "$out" | tr -d ' ')
  local mb; mb=$(awk -v b="$bytes" 'BEGIN{printf "%.1f", b/1048576}')
  printf "  %-13s -> %s (%s MB)\n" "$stage" "${out#"$DEST"/}" "$mb"
  awk -v b="$bytes" 'BEGIN{ if (b > 3145728) print "  warning: over 3 MB - consider a shorter or smaller clip" }'
}

if [[ "${1:-}" == "--stage" ]]; then
  [[ $# -eq 3 ]] || die "usage: $0 --stage <${STAGES[*]// /|}> <file>"
  echo "Installing stage clip:"
  install_one "$2" "$3"
else
  [[ $# -eq 5 ]] || die "expected 5 files in order (${STAGES[*]}), got $#. Use --stage for one at a time."
  echo "Installing stage clips:"
  for i in "${!STAGES[@]}"; do
    install_one "${STAGES[$i]}" "${@:$((i+1)):1}"
  done
fi

echo
echo "Installed in $DEST"
ls -1 "$DEST"/*.mp4 "$DEST"/*.webm "$DEST"/*.mov 2>/dev/null | sed 's|.*/|  |' || echo "  (none yet)"
echo
echo "Reload the site page or dashboard - no rebuild needed."
