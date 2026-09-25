# AUR package (`sajilo-bin`)

Repackages the release `.deb` for Arch and Manjaro, so they install Sajilo with
`yay -S sajilo-bin` (or `paru`) and get updates with the rest of the system.

## Publishing (once)

1. Make an account on https://aur.archlinux.org and add your SSH key there.
2. `git clone ssh://aur@aur.archlinux.org/sajilo-bin.git`
3. Copy `PKGBUILD` and `.SRCINFO` from here into it, then commit and push.

## Each release

1. Set `pkgver` to the new version and `pkgrel=1` in `PKGBUILD`.
2. Put the new `.deb`'s checksum in `sha256sums`:
   `curl -sL https://github.com/adarshaacharya/sajilo/releases/download/vX.Y.Z/Sajilo_X.Y.Z_amd64.deb | sha256sum`
3. Regenerate `.SRCINFO` on an Arch machine with `makepkg --printsrcinfo > .SRCINFO`
   (or edit its version, source and checksum lines by hand).
4. Push to the AUR repo.

## Trying it before publishing

On Arch, from this directory: `makepkg -si`.
