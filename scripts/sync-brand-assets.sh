#!/usr/bin/env bash
# Copia logos desde brand-upload/ a public/brand/ sin modificar contenido.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/brand-upload"
DEST="$ROOT/apps/web/public/brand"

if [[ ! -d "$SRC" ]]; then
  echo "No existe $SRC"
  exit 1
fi

mapfile -t FILES < <(find "$SRC" -maxdepth 1 -type f \( -name '*.svg' -o -name '*.png' \) -printf '%f\n')

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "Coloca tus archivos en brand-upload/ (svg o png) y vuelve a ejecutar."
  exit 1
fi

mkdir -p "$DEST"
for f in "$FILES"; do
  cp -f "$SRC/$f" "$DEST/$f"
  echo "copiado: $f"
done

echo "Listo. Revisa apps/web/public/brand/ y haz commit."
