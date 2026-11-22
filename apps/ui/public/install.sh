#!/bin/sh
# Remote Arc native installer. No Node.js, npm, Go compiler or sudo required.
# Inspect first: curl -fsSL https://remotearc.app/install.sh
# Install:       curl -fsSL https://remotearc.app/install.sh | sh
# A first install run from a terminal then starts the Agent to pair this computer
# and approve permissions. Upgrades, and runs without a terminal, only install;
# set REMOTEARC_NO_START=1 to only install.
# The complete function is parsed before invocation, so truncated pipes cannot install.
remote_arc_install() (
  set -eu
  umask 077
  fail() { printf 'Remote Arc: %s\n' "$*" >&2; exit 1; }
  for tool in curl uname mktemp mkdir awk cat chmod mv rm rmdir; do
    command -v "$tool" >/dev/null 2>&1 || fail "Required tool missing: $tool"
  done
  stable_version() {
    printf '%s\n' "$1" | awk -F. 'NF == 3 && $1 ~ /^(0|[1-9][0-9]*)$/ && $2 ~ /^(0|[1-9][0-9]*)$/ && $3 ~ /^(0|[1-9][0-9]*)$/ { valid=1 } END { exit !valid }'
  }
  version=${REMOTEARC_INSTALL_VERSION:-}
  if [ -n "$version" ]; then
    stable_version "$version" || fail "REMOTEARC_INSTALL_VERSION must be a stable x.y.z version."
  fi
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
      rm -f "$work_dir/agent" "$work_dir/SHA256SUMS" "$work_dir/latest.json"
      rmdir "$work_dir" 2>/dev/null || :
    fi
  }
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM HUP
  work_dir=$(mktemp -d "${TMPDIR:-/tmp}/remotearc-install.XXXXXXXX")
  # Remote Arc's own release mirror first, then GitHub Releases. Every binary is
  # checked against SHA256SUMS below, whichever source answered.
  mirror="https://remotearc.app/api/downloads/release"
  github="https://github.com/Remote-Arc/remote-arc"
  download() {
    mirror_path=$1 github_path=$2 out=$3
    shift 3
    curl --proto '=https' --tlsv1.2 -fsSL "$mirror/$mirror_path" -o "$out" "$@" 2>/dev/null ||
      curl --proto '=https' --tlsv1.2 -fsSL "$github/$github_path" -o "$out" "$@"
  }
  if [ -z "$version" ]; then
    # Resolve the stable channel on every install, even if this website has not
    # been redeployed since the native release. Release assets already include
    # this manifest; prereleases are not promoted to GitHub's Latest channel.
    download latest/go-binaries.json releases/latest/download/go-binaries.json "$work_dir/latest.json" --header 'Cache-Control: no-cache'
    version=$(awk -F '"' '/"version"[[:space:]]*:/ { count++; value=$4 } END { if (count != 1) exit 1; print value }' "$work_dir/latest.json") || fail "Cannot determine the latest stable Agent version."
    stable_version "$version" || fail "Latest release did not contain a stable x.y.z version."
  fi
  asset="remotelink-v$version-$platform-$arch"
  tag="remotelink-v$version"
  printf 'Downloading Remote Arc %s for %s/%s…\n' "$version" "$platform" "$arch"
  download "$tag/$asset" "releases/download/$tag/$asset" "$work_dir/agent"
  download "$tag/SHA256SUMS" "releases/download/$tag/SHA256SUMS" "$work_dir/SHA256SUMS"
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
  first_install=1
  [ ! -e "$install_dir/remotelink" ] || first_install=0
  staged=$(mktemp "$install_dir/.remotelink.XXXXXXXX")
  # Stage on the destination filesystem; replacement is atomic.
  cat "$work_dir/agent" > "$staged"
  chmod 755 "$staged"
  mv -f "$staged" "$install_dir/remotelink"
  staged=''
  printf '\nInstalled: %s/remotelink\n' "$install_dir"
  # Start a first install straight away when someone is at a terminal. Under
  # `curl | sh` this script is standard input, so the Agent reads the terminal.
  # `true` is a regular built-in: a failed redirection does not end the script.
  if [ "$first_install" = 1 ] && [ -z "${REMOTEARC_NO_START:-}" ] && [ -t 1 ] &&
    (true </dev/tty) 2>/dev/null; then
    printf 'Starting the Agent to pair this computer and choose its permissions.\n\n'
    cleanup
    trap - EXIT INT TERM HUP
    exec "$install_dir/remotelink" </dev/tty
  fi
  case ":${PATH:-}:" in
    *:"$install_dir":*) printf 'Next: remotelink\n' ;;
    *) printf 'Next: "%s/remotelink"\nAdd "%s" to PATH to use the remotelink command.\n' "$install_dir" "$install_dir" ;;
  esac
  printf 'Start the Agent to pair your computer and choose its permissions.\n'
)
remote_arc_install
