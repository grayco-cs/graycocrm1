#!/usr/bin/env bash
# tools/printpack/rebuild.sh ["<company address>"]   (patch ADDRALL)
# Rebuilds every print-pack PDF (print/*.pdf) from its HTML print version (print/<slug>.html) with the company address,
# in one command. With no address it reads the live setting (⚙ Admin → 🏢 Company address) from the CRM's public door.
#   needs: node + Playwright (npm i playwright && npx playwright install chromium), python3 + pypdf; pdftoppm for thumbnails
#   env:   GC_SITE (default https://crm.grayco-cs.com), PLAYWRIGHT_MJS (path to playwright/index.mjs if not installed globally)
# Then commit print/*.pdf, print/thumbs/ and print/manifest.json — the CRM's Print pack page goes back to the PDFs by itself
# once manifest.json carries the current address.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PRINT="$ROOT/print"
ADDR="${1:-}"
if [ -z "$ADDR" ]; then
  ADDR="$(curl -fsS "${GC_SITE:-https://crm.grayco-cs.com}/.netlify/functions/mkt-public?company=1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!j.ok||!j.address)process.exit(1);process.stdout.write(j.address)})')"
fi
[ -n "$ADDR" ] || { echo "No company address." >&2; exit 2; }
echo "Company address: $ADDR"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
node "$ROOT/tools/printpack/rebuild.mjs" "$PRINT" "$TMP/pdf" "$ADDR"
python3 "$ROOT/tools/printpack/boxes.py" "$TMP/pdf"
cp "$TMP"/pdf/*.pdf "$PRINT/"
# front / back thumbnails of the OFFICE PDFs (520 px on the long side, as before)
if command -v pdftoppm >/dev/null 2>&1; then
  for f in "$TMP"/pdf/*.pdf; do
    b="$(basename "$f" .pdf)"; case "$b" in *-printshop) continue;; esac
    pdftoppm -jpeg -jpegopt quality=82 -scale-to 520 "$f" "$TMP/th-$b"
    for t in "$TMP"/th-"$b"-*.jpg; do n="${t##*-}"; n="${n%.jpg}"; cp "$t" "$PRINT/thumbs/$b-$((10#$n)).jpg"; done
  done
else echo "pdftoppm not found: thumbnails not updated" >&2; fi
# the manifest records the address now baked into the PDFs
node -e 'const fs=require("fs"),p=process.argv[1],m=JSON.parse(fs.readFileSync(p,"utf8"));m.address=process.argv[2];m.builtAt=new Date().toISOString();fs.writeFileSync(p,JSON.stringify(m,null,1)+"\n")' "$PRINT/manifest.json" "$ADDR"
echo "Done: print/*.pdf rebuilt with \"$ADDR\". Commit print/ and deploy."
