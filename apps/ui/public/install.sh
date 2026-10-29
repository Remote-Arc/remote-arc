#!/bin/sh
# Remote Arc native installer. No Node.js, npm, Go compiler or sudo required.
# Inspect first: curl -fsSL https://remotearc.app/install.sh
# Install:       curl -fsSL https://remotearc.app/install.sh | sh
# Installs only; run remotelink afterwards to pair and approve permissions.
# The complete function is parsed before invocation, so truncated pipes cannot install.
remote_arc_install() (
  set -eu
  umask 077
  version='0.6.5'
  fail() { printf 'Remote Arc: %s\n' "$*" >&2; exit 1; }
  for tool in curl uname mktemp mkdir awk cat chmod mv rm rmdir; do
    command -v "$tool" >/dev/null 2>&1 || fail "Required tool missing: $tool"
  done
  version=${REMOTEARC_INSTALL_VERSION:-$version}
  printf '%s\n' "$version" | awk -F. 'NF == 3 && $1 ~ /^(0|[1-9][0-9]*)$/ && $2 ~ /^(0|[1-9][0-9]*)$/ && $3 ~ /^(0|[1-9][0-9]*)$/ { valid=1 } END { exit !valid }' || fail "REMOTEARC_INSTALL_VERSION must be a stable x.y.z version."
  case "$(uname -s)" in
    Darwin) platform=darwin ;;
    Linux) platform=linux ;;
    *) fail "Supported: macOS and Linux (including WSL). Windows: https://remotearc.app/downloads" ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) fail "Supported processors: x64 and ARM64." ;;
  esac
  if command -v sha256sum >/dev/null 2>&1; then
    hash_tool=sha256sum
  elif command -v shasum >/dev/null 2>&1; then
    hash_tool=shasum
  else
    fail "Install sha256sum or shasum before continuing."
  fi
  if [ -n "${REMOTEARC_INSTALL_DIR:-}" ]; then
    install_dir=$REMOTEARC_INSTALL_DIR
  else
    [ -n "${HOME:-}" ] || fail "Set HOME or an absolute REMOTEARC_INSTALL_DIR."
    install_dir=$HOME/.local/bin
  fi
  case "$install_dir" in /*) ;; *) fail "REMOTEARC_INSTALL_DIR must be an absolute path." ;; esac
  [ "$install_dir" != / ] || fail "Choose an installation directory other than /."
  work_dir=''
  staged=''
  cleanup() {
    [ -z "$staged" ] || rm -f "$staged"
    if [ -n "$work_dir" ]; then
      rm -f "$work_dir/agent" "$work_dir/SHA256SUMS"
      rmdir "$work_dir" 2>/dev/null || :
    fi
  }
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM HUP
  work_dir=$(mktemp -d "${TMPDIR:-/tmp}/remotearc-install.XXXXXXXX")
  asset="remotelink-v$version-$platform-$arch"
  release="https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v$version"
  printf 'Downloading Remote Arc %s for %s/%s…\n' "$version" "$platform" "$arch"
  curl --proto '=https' --tlsv1.2 -fsSL "$release/$asset" -o "$work_dir/agent"
  curl --proto '=https' --tlsv1.2 -fsSL "$release/SHA256SUMS" -o "$work_dir/SHA256SUMS"
  expected=$(awk -v asset="$asset" '$2 == asset || $2 == "*" asset { count++; hash=$1 } END { if (count != 1 || length(hash) != 64 || hash ~ /[^0-9a-fA-F]/) exit 1; print tolower(hash) }' "$work_dir/SHA256SUMS") || fail "Release checksum missing or invalid."
  if [ "$hash_tool" = sha256sum ]; then
    actual=$(sha256sum "$work_dir/agent")
  else
    actual=$(shasum -a 256 "$work_dir/agent")
  fi
  actual=${actual%% *}
  [ "$actual" = "$expected" ] || fail "SHA256 mismatch. Existing installation was left untouched."
  chmod 755 "$work_dir/agent"
  [ "$("$work_dir/agent" --version)" = "$version" ] || fail "The verified Agent cannot run on this computer."
  mkdir -p "$install_dir"
  [ ! -d "$install_dir/remotelink" ] || fail "Install destination is a directory."
  [ ! -L "$install_dir/remotelink" ] || fail "Install destination is a symlink. Choose another REMOTEARC_INSTALL_DIR or upgrade through its original package manager."
  staged=$(mktemp "$install_dir/.remotelink.XXXXXXXX")
  # Stage on the destination filesystem; replacement is atomic.
  cat "$work_dir/agent" > "$staged"
  chmod 755 "$staged"
  mv -f "$staged" "$install_dir/remotelink"
  staged=''
  printf '\nInstalled: %s/remotelink\n' "$install_dir"
  case ":${PATH:-}:" in
    *:"$install_dir":*) printf 'Next: remotelink\n' ;;
    *) printf 'Next: "%s/remotelink"\nAdd "%s" to PATH to use the remotelink command.\n' "$install_dir" "$install_dir" ;;
  esac
  printf 'Start the Agent to pair your computer and choose its permissions.\n'
)
remote_arc_install
