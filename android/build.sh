#!/bin/sh
# Builds the signed release AAB (for Play) + APK (for sideload testing):
#
#   CROFT_KEYSTORE_PASS='your-strong-password' ./build.sh
#
# Output: app-release-bundle.aab  <- upload this to Play Console
set -e
[ -n "$CROFT_KEYSTORE_PASS" ] || { echo "Set CROFT_KEYSTORE_PASS first"; exit 1; }
[ -f android.keystore ] || { echo "No android.keystore - run ./create-keystore.sh first"; exit 1; }
BUBBLEWRAP_KEYSTORE_PASSWORD="$CROFT_KEYSTORE_PASS" \
BUBBLEWRAP_KEY_PASSWORD="$CROFT_KEYSTORE_PASS" \
  node "$HOME/.bubblewrap/cli/node_modules/@bubblewrap/cli/bin/bubblewrap.js" build --skipPwaValidation
echo
echo "Done: app-release-bundle.aab is ready for the Play Console."
