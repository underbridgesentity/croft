#!/bin/sh
# Creates the Play UPLOAD KEYSTORE for Croft. Run this yourself with a strong
# password of your choosing - the password should live only in your head and
# your password manager:
#
#   CROFT_KEYSTORE_PASS='your-strong-password' ./create-keystore.sh
#
# The keystore file (android.keystore) is gitignored. BACK IT UP (with the
# password) somewhere safe - with Play App Signing, Google can reset a lost
# upload key, but it's a support process you don't want.
set -e
[ -n "$CROFT_KEYSTORE_PASS" ] || { echo "Set CROFT_KEYSTORE_PASS first"; exit 1; }
[ ! -f android.keystore ] || { echo "android.keystore already exists - refusing to overwrite"; exit 1; }
KT="$HOME/.bubblewrap/jdk-17.0.19+10/Contents/Home/bin/keytool"
"$KT" -genkeypair -keystore ./android.keystore -alias android \
  -keyalg RSA -keysize 4096 -validity 9125 \
  -storepass "$CROFT_KEYSTORE_PASS" -keypass "$CROFT_KEYSTORE_PASS" \
  -dname "CN=Under Bridges Entity (Pty) Ltd, O=Under Bridges Entity (Pty) Ltd, L=Kempton Park, ST=Gauteng, C=ZA"
echo "Keystore created. Next: ./gen-assetlinks.sh then ./build.sh (same env var)."
