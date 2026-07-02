#!/bin/sh

# Xcode Cloud post-clone hook.
#
# Xcode Cloud checks out a clean copy of the repo with NO node_modules, but this
# is a Capacitor app: the iOS plugins (@capacitor/app, haptics, share, push,
# core) are LOCAL Swift packages that live under node_modules/@capacitor/*.
# Without them the archive fails at "Could not resolve package dependencies".
# So: install Node, install JS deps, build the web assets, and run `cap sync`
# to regenerate the iOS project's package references before Xcode builds.

set -e
echo "=== ci_post_clone: preparing Capacitor iOS build ==="

# Xcode Cloud's macOS image ships Homebrew but not Node.
if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node via Homebrew..."
  brew install node
fi
echo "node $(node -v), npm $(npm -v)"

# Xcode Cloud exposes the repo root here.
cd "$CI_PRIMARY_REPOSITORY_PATH"

npm ci
npm run build --workspace web   # produces web/dist for `cap sync` to copy
npx cap sync ios

echo "=== ci_post_clone: done ==="
