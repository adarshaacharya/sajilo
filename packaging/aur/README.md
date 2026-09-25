# AUR package (`sajilo-bin`)

Repackages the release `.deb` for Arch and Manjaro, so they install Sajilo with
`yay -S sajilo-bin` (or `paru`) and get updates with the rest of the system.

## How it updates

`.github/workflows/publish-aur.yml` runs whenever a release is **published** on
GitHub (not when it's tagged: release-desktop.yml leaves releases as drafts, and
the `.deb` can only be downloaded once the release is public). It sets `pkgver`,
takes the checksum of the release's own `.deb`, checks the download with
`makepkg --verifysource`, writes `.SRCINFO` with makepkg, and pushes both to the
AUR. The `PKGBUILD` here is the template it starts from; its version is filled in
on each run, so it doesn't need bumping by hand.

Pre-releases are skipped. To re-run it for a version, use **Run workflow** on the
Actions tab and enter the version (for example `0.1.29`).

## One-time setup

1. Make an account on https://aur.archlinux.org.
2. Make a key just for this: `ssh-keygen -t ed25519 -f aur -C "sajilo AUR"` (no passphrase).
3. In your AUR account (My Account → SSH Public Key), paste the contents of `aur.pub`.
4. In GitHub → Settings → Secrets and variables → Actions, add a secret named
   `AUR_SSH_PRIVATE_KEY` with the contents of `aur` (the private half).
5. Publish a release, or run the workflow by hand with the current version. The
   first push creates `sajilo-bin` on the AUR; every later one updates it.

Without the secret the workflow still builds and checks the package, then
leaves a notice that nothing was pushed.

## Trying it before publishing

On Arch, from this directory: `makepkg -si`.
