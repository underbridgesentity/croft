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
# Node install is belt-and-braces because the runners' egress has been flaky:
# build 23 couldn't reach formulae.brew.sh (brew), build 26 couldn't reach
# nodejs.org. GitHub hosts stay reachable (source fetch / SPM), so we fall
# back to the actions/node-versions mirror on github.com.

set -e
echo "=== ci_post_clone: preparing Capacitor iOS build ==="

# --- connectivity report: which hosts can this runner actually reach? ---
probe() {
  if curl -sS -o /dev/null -m 8 "https://$1" 2>/dev/null; then echo "  reachable:   $1"; else echo "  UNREACHABLE: $1"; fi
}
echo "--- network probe ---"
probe nodejs.org
probe registry.npmjs.org
probe github.com
probe raw.githubusercontent.com
probe objects.githubusercontent.com
probe formulae.brew.sh
echo "---------------------"

find_node() { command -v node >/dev/null 2>&1; }

if ! find_node; then
  # Some images ship node outside the default PATH - check the usual spots.
  for d in /usr/local/bin /opt/homebrew/bin "$HOME/.local/bin"; do
    if [ -x "$d/node" ]; then export PATH="$d:$PATH"; break; fi
  done
fi

if ! find_node; then
  NODE_VERSION="22.14.0"
  case "$(uname -m)" in
    arm64) NODE_ARCH="darwin-arm64" ;;
    *)     NODE_ARCH="darwin-x64" ;;
  esac
  TARBALL="/tmp/node.tar.gz"

  echo "Installing Node ${NODE_VERSION} (${NODE_ARCH})..."
  if curl -fsSL --retry 2 --retry-delay 2 -m 60 \
      "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_ARCH}.tar.gz" -o "$TARBALL"; then
    echo "  fetched from nodejs.org"
  else
    # nodejs.org unreachable - resolve a Node 22 build from the GitHub-hosted
    # mirror (github.com/actions/node-versions), which the runners CAN reach.
    echo "  nodejs.org unreachable, trying the GitHub mirror..."
    MANIFEST="https://raw.githubusercontent.com/actions/node-versions/main/versions-manifest.json"
    URL=$(curl -fsSL --retry 2 -m 60 "$MANIFEST" \
      | grep -o "https://[^\"]*node-22\.[0-9.]*-${NODE_ARCH}\.tar\.gz" | head -1)
    echo "  mirror url: ${URL:-<none found>}"
    [ -n "$URL" ] || { echo "ERROR: no Node source reachable"; exit 1; }
    curl -fsSL --retry 2 --retry-delay 2 -m 120 "$URL" -o "$TARBALL"
  fi

  mkdir -p /tmp/nodedist
  tar -xzf "$TARBALL" -C /tmp/nodedist
  NODE_BIN=$(dirname "$(find /tmp/nodedist -type f -name node -path '*/bin/*' | head -1)")
  [ -n "$NODE_BIN" ] || { echo "ERROR: node binary not found in tarball"; exit 1; }
  export PATH="$NODE_BIN:$PATH"
fi
echo "node $(node -v), npm $(npm -v)"

# Xcode Cloud exposes the repo root here.
cd "$CI_PRIMARY_REPOSITORY_PATH"

npm ci
npm run build --workspace web   # produces web/dist for `cap sync` to copy
npx cap sync ios

echo "=== ci_post_clone: done ==="
