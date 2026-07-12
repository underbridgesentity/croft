#!/bin/sh
# Generates web/public/.well-known/assetlinks.json from the upload keystore's
# SHA-256 fingerprint (the fingerprint is PUBLIC - safe to commit). Digital
# Asset Links are what let the app run full-screen without a browser bar.
#
#   CROFT_KEYSTORE_PASS='your-strong-password' ./gen-assetlinks.sh
#
# AFTER first Play upload: Play App Signing re-signs with Google's key - add
# its SHA-256 (Play Console -> Test and release -> Setup -> App signing) as a
# second entry in the file, then commit + deploy.
set -e
[ -n "$CROFT_KEYSTORE_PASS" ] || { echo "Set CROFT_KEYSTORE_PASS first"; exit 1; }
KT="$HOME/.bubblewrap/jdk-17.0.19+10/Contents/Home/bin/keytool"
FP=$("$KT" -list -v -keystore ./android.keystore -alias android -storepass "$CROFT_KEYSTORE_PASS" | grep 'SHA256:' | head -1 | sed 's/.*SHA256: //')
[ -n "$FP" ] || { echo "Could not read fingerprint"; exit 1; }
mkdir -p ../web/public/.well-known
cat > ../web/public/.well-known/assetlinks.json <<JSON
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "za.co.underbridges.croft",
    "sha256_cert_fingerprints": ["$FP"]
  }
}]
JSON
echo "Wrote web/public/.well-known/assetlinks.json with fingerprint:"
echo "  $FP"
echo "Commit + deploy it (git add/commit/push), then build."
