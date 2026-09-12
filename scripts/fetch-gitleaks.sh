#!/usr/bin/env bash
# Downloads a pinned gitleaks release for the current platform/arch and
# places it at extension/bin/<platform>-<arch>/gitleaks[.exe], where
# extension/src/scanEngine/binaryResolver.ts expects to find it.
#
# This is a CI-time step (run once per platform in the build matrix — see
# .github/workflows/ci.yml), not something the extension does at runtime:
# per docs/gitleaks-compatibility.md, a security-sensitive extension should
# never fetch an executable over the network on the fly. Every download is
# checksum-verified against gitleaks' own published checksums file before
# it's trusted.
set -euo pipefail

GITLEAKS_VERSION="${GITLEAKS_VERSION:-8.21.2}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$(uname -s)" in
  Linux*)  PLATFORM=linux; GITLEAKS_OS=linux ;;
  Darwin*) PLATFORM=macos; GITLEAKS_OS=darwin ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM=windows; GITLEAKS_OS=windows ;;
  *) echo "error: unsupported platform $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  x86_64|amd64) ARCH=x64; GITLEAKS_ARCH=x64 ;;
  arm64|aarch64) ARCH=arm64; GITLEAKS_ARCH=arm64 ;;
  *) echo "error: unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

EXT="tar.gz"
BIN_NAME="gitleaks"
if [ "$PLATFORM" = "windows" ]; then
  EXT="zip"
  BIN_NAME="gitleaks.exe"
fi

ASSET="gitleaks_${GITLEAKS_VERSION}_${GITLEAKS_OS}_${GITLEAKS_ARCH}.${EXT}"
BASE_URL="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Downloading ${ASSET}..."
curl -fsSL -o "${WORK_DIR}/${ASSET}" "${BASE_URL}/${ASSET}"
curl -fsSL -o "${WORK_DIR}/checksums.txt" "${BASE_URL}/gitleaks_${GITLEAKS_VERSION}_checksums.txt"

echo "Verifying checksum..."
(
  cd "$WORK_DIR"
  grep " ${ASSET}\$" checksums.txt > expected_checksum.txt
  sha256sum -c expected_checksum.txt
)

echo "Extracting..."
if [ "$EXT" = "zip" ]; then
  unzip -o -q "${WORK_DIR}/${ASSET}" -d "$WORK_DIR"
else
  tar -xzf "${WORK_DIR}/${ASSET}" -C "$WORK_DIR"
fi

DEST_DIR="${ROOT_DIR}/extension/bin/${PLATFORM}-${ARCH}"
mkdir -p "$DEST_DIR"
cp "${WORK_DIR}/${BIN_NAME}" "${DEST_DIR}/${BIN_NAME}"
chmod +x "${DEST_DIR}/${BIN_NAME}" 2>/dev/null || true

echo "Bundled gitleaks ${GITLEAKS_VERSION} at ${DEST_DIR}/${BIN_NAME}"
