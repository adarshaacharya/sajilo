#!/usr/bin/env bash
# Fails when a Linux binary needs a newer glibc than the oldest distro Sajilo
# supports.
#
# A binary built on a newer Ubuntu can quietly demand that Ubuntu's glibc. apt
# still installs the .deb on older releases, and the app then dies at launch
# with "GLIBC_2.xx not found" where nobody sees it, which is how 0.1.28 reached
# Ubuntu 22.04, Pop!_OS 22.04 and Mint 21 users as an app that "does nothing".
#
# Only requirements the loader enforces count: a version whose symbols are all
# weak references is marked WEAK and is optional at load time.
#
# Usage: check-linux-glibc.sh <max-glibc, e.g. 2.35> <binary>
set -euo pipefail

max="${1:?usage: check-linux-glibc.sh <max-glibc> <binary>}"
binary="${2:?usage: check-linux-glibc.sh <max-glibc> <binary>}"

required=$(
  readelf -V --wide "$binary" |
    awk '/Name: GLIBC_[0-9.]+/ && !/Flags: WEAK/ { sub(/.*Name: GLIBC_/, ""); print $1 }' |
    sort -uV | tail -n 1
)

if [ -z "$required" ]; then
  echo "::error::No glibc version requirements found in $binary"
  exit 1
fi

if [ "$(printf '%s\n%s\n' "$required" "$max" | sort -V | tail -n 1)" != "$max" ]; then
  echo "::error::$binary needs glibc $required, newer than the supported floor of $max. Build on an older runner."
  exit 1
fi

echo "$binary needs glibc $required (floor $max): ok"
