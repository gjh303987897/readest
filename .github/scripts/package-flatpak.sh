#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: package-flatpak.sh <appimage> <flatpak-arch> <output>" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
appimage="$(realpath "$1")"
flatpak_arch="$2"
output="$(realpath -m "$3")"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

chmod +x "$appimage"
cd "$work_dir"
"$appimage" --appimage-extract >/dev/null

build_dir="$work_dir/build"
flatpak_repo="$work_dir/repo"
mkdir -p "$build_dir/files/bin" "$flatpak_repo" "$(dirname "$output")"
cp -a "$work_dir/squashfs-root/." "$build_dir/files/"

printf '%s\n' '#!/bin/sh' 'exec /app/AppRun "$@"' > "$build_dir/files/bin/readest-flatpak"
chmod +x "$build_dir/files/bin/readest-flatpak"

install -Dm644 \
  "$repo_root/.github/flatpak/com.bilingify.readest.desktop" \
  "$build_dir/files/share/applications/com.bilingify.readest.desktop"
install -Dm644 \
  "$repo_root/.github/flatpak/com.bilingify.readest.metainfo.xml" \
  "$build_dir/files/share/metainfo/com.bilingify.readest.metainfo.xml"
install -Dm644 \
  "$repo_root/apps/readest-app/src-tauri/icons/128x128@2x.png" \
  "$build_dir/files/share/icons/hicolor/256x256/apps/com.bilingify.readest.png"

printf '%s\n' \
  '[Application]' \
  'name=com.bilingify.readest' \
  "runtime=org.gnome.Platform/${flatpak_arch}/49" \
  "sdk=org.gnome.Sdk/${flatpak_arch}/49" \
  'command=readest-flatpak' \
  '' \
  '[Context]' \
  'shared=network;ipc;' \
  'sockets=x11;wayland;fallback-x11;' \
  'devices=dri;' \
  'filesystems=home;' \
  > "$build_dir/metadata"

flatpak build-finish "$build_dir"
flatpak build-export --arch="$flatpak_arch" "$flatpak_repo" "$build_dir" stable
flatpak build-bundle \
  --arch="$flatpak_arch" \
  --runtime-repo=https://flathub.org/repo/flathub.flatpakrepo \
  "$flatpak_repo" \
  "$output" \
  com.bilingify.readest \
  stable
