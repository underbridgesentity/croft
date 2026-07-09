#!/bin/sh

# Xcode Cloud post-clone hook - now fully OFFLINE.
#
# The runners lost outbound network in custom build phases (builds 23-27:
# nodejs.org, registry.npmjs.org, github.com, formulae.brew.sh all refused),
# so nothing here may touch the network. Everything the archive needs is
# committed instead:
#   - node_modules/@capacitor/{app,haptics,push-notifications,share}
#     (the local Swift packages CapApp-SPM references)
#   - ios/vendor/capacitor-swift-pm  (the Capacitor/Cordova xcframeworks that
#     the remote capacitor-swift-pm package would have downloaded from GitHub)
#   - ios/App/App/public + ios/App/App/capacitor.config.json  (cap sync output)
#
# After changing web code or capacitor.config.ts, run locally:
#   npm run build --workspace web && npx cap sync ios
# and commit whatever changed under ios/App/App and node_modules/@capacitor.
#
# This script only rewrites the SPM manifests to use the vendored package
# (the checkout keeps the normal remote URLs so local dev is unaffected).

set -e
echo "=== ci_post_clone: offline Capacitor build prep ==="
cd "$CI_PRIMARY_REPOSITORY_PATH"

for f in \
  ios/App/App/capacitor.config.json \
  ios/App/App/public/index.html \
  ios/vendor/capacitor-swift-pm/Package.swift \
  ios/vendor/capacitor-swift-pm/Capacitor.xcframework.zip \
  ios/vendor/capacitor-swift-pm/Cordova.xcframework.zip \
  node_modules/@capacitor/app/Package.swift \
  node_modules/@capacitor/haptics/Package.swift \
  node_modules/@capacitor/push-notifications/Package.swift \
  node_modules/@capacitor/share/Package.swift
do
  [ -e "$f" ] || { echo "ERROR: missing committed artifact $f"; exit 1; }
done

# Point every manifest at the vendored capacitor-swift-pm instead of GitHub.
sed -i '' 's|\.package(url: "https://github\.com/ionic-team/capacitor-swift-pm\.git"[^)]*)|.package(name: "capacitor-swift-pm", path: "../../vendor/capacitor-swift-pm")|' \
  ios/App/CapApp-SPM/Package.swift
for p in app haptics push-notifications share; do
  sed -i '' 's|\.package(url: "https://github\.com/ionic-team/capacitor-swift-pm\.git"[^)]*)|.package(name: "capacitor-swift-pm", path: "../../../ios/vendor/capacitor-swift-pm")|' \
    "node_modules/@capacitor/$p/Package.swift"
done

# The committed Package.resolved pins the REMOTE package - drop it so SPM
# re-resolves against the local paths (no network involved).
rm -f ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved

if grep -l 'capacitor-swift-pm\.git' ios/App/CapApp-SPM/Package.swift node_modules/@capacitor/*/Package.swift 2>/dev/null; then
  echo "ERROR: a manifest still references the remote package"; exit 1
fi
echo "Manifests rewritten to vendored capacitor-swift-pm:"
grep -h 'vendor/capacitor-swift-pm' ios/App/CapApp-SPM/Package.swift node_modules/@capacitor/app/Package.swift

echo "=== ci_post_clone: done (no network used) ==="
