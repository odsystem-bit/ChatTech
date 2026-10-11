#!/usr/bin/env bash
# Usage: ./publish_update.sh "Notes de la version"
# Publie l'APK release sur le serveur ; les telephones proposent alors la mise a jour automatiquement.
set -euo pipefail
cd "$(dirname "$0")"

NOTES="${1:-}"
APK="app/build/outputs/apk/release/app-release.apk"
REMOTE="u795734321@82.29.191.42"
DIR="domains/fibretrack.mantota.com/public_html/api/app"

VERSION_CODE=$(grep -oP 'versionCode\s+\K[0-9]+' app/build.gradle)
VERSION_NAME=$(grep -oP 'versionName\s+"\K[^"]+' app/build.gradle)

[ -f "$APK" ] || { echo "APK introuvable : lancez d'abord ./gradlew assembleRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease"; exit 1; }

TMP=$(mktemp)
printf '{"versionCode":%s,"versionName":"%s","notes":%s}\n' \
  "$VERSION_CODE" "$VERSION_NAME" "$(printf '%s' "$NOTES" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" > "$TMP"

ssh -p 65002 "$REMOTE" "mkdir -p $DIR"
scp -P 65002 "$APK" "$REMOTE:$DIR/fibretrack.apk"
scp -P 65002 "$TMP" "$REMOTE:$DIR/version.json"
rm -f "$TMP"
echo "Publie : version $VERSION_NAME (code $VERSION_CODE)"
