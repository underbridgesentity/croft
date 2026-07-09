#!/bin/sh

# Xcode Cloud post-clone hook.
#
# Xcode Cloud checks out a clean copy of the repo with NO node_modules, but this
# is a Capacitor app: the iOS plugins (@capacitor/app, haptics, share, push,
# core) are LOCAL Swift packages that live under node_modules/@capacitor/*.
# Without them the archive fails at "Could not resolve package dependencies".
# So: install Node, install JS deps, build the web assets, and run `cap sync`
# to regenerate the iOS project's package references before Xcode builds.
#
# Node comes from the official nodejs.org tarball, NOT Homebrew: brew has to
# phone formulae.brew.sh on every run and that host is unreachable from the
# runners (build 23: `curl: (7) Failed to connect to formulae.brew.sh`).

set -e
echo "=== ci_post_clone: preparing Capacitor iOS build ==="

if ! command -v node >/dev/null 2>&1; then
  NODE_VERSION="22.14.0"
  case "$(uname -m)" in
    arm64) NODE_PKG="node-v${NODE_VERSION}-darwin-arm64" ;;
    *)     NODE_PKG="node-v${NODE_VERSION}-darwin-x64" ;;
  esac
  echo "Installing Node ${NODE_VERSION} from nodejs.org..."
  curl -fsSL --retry 3 --retry-delay 2 \
    "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_PKG}.tar.gz" -o /tmp/node.tar.gz
  tar -xzf /tmp/node.tar.gz -C /tmp
  export PATH="/tmp/${NODE_PKG}/bin:$PATH"
  # Best effort: put node where later xcodebuild phases could also find it.
  sudo ln -sf "/tmp/${NODE_PKG}/bin/node" /usr/local/bin/node 2>/dev/null || true
  sudo ln -sf "/tmp/${NODE_PKG}/bin/npm" /usr/local/bin/npm 2>/dev/null || true
fi
echo "node $(node -v), npm $(npm -v)"

# Xcode Cloud exposes the repo root here.
cd "$CI_PRIMARY_REPOSITORY_PATH"

npm ci
npm run build --workspace web   # produces web/dist for `cap sync` to copy
npx cap sync ios

echo "=== ci_post_clone: done ==="
