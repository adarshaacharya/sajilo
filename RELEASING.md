# Releasing Sajilo

GitHub Actions builds and publishes the Mac download for you.

## Before releasing

1. Open `scripts/AppBundleInfo.plist`.
2. Change `CFBundleShortVersionString` to the new version, for example `0.1.0`.
3. Change `CFBundleVersion` to a higher number each release.
4. Commit and push your changes to GitHub.

## Changing the app icon

The icon is generated, not a checked-in drawing. Edit `scripts/make-app-icon.swift`
and run:

```bash
swift scripts/make-app-icon.swift
```

That rewrites `scripts/AppIcon.icns`, which both bundle scripts copy into
`Contents/Resources`. Commit the `.icns`; the `AppIcon.iconset` folder beside it
is an intermediate and is ignored.

## Publish a beta

For the first beta of version `0.1.0`, create and push this tag:

```bash
git tag -a v0.1.0-beta.1 -m "Sajilo 0.1.0 beta 1"
git push origin v0.1.0-beta.1
```

GitHub Actions will test the app, create the DMG and ZIP, then publish a GitHub prerelease. For a stable release, use the matching tag without `-beta.1`, for example `v0.1.0`.

## After every release: update the appcast

Sparkle only offers an update if it appears in `appcast.xml`. Publishing a
release does not add it — run this once the GitHub release exists:

```bash
./scripts/update-appcast.sh
```

It rebuilds the whole file from the releases GitHub actually has, signing each
one with your private EdDSA key. Then commit and push it:

```bash
git add appcast.xml && git commit -m "Update the appcast" && git push
```

Sajilo reads the feed from `main`, so it takes effect as soon as that push
lands. Existing users get the update in place, which also skips the Gatekeeper
warning a fresh download shows.

**This step cannot run in CI.** The signing key lives in your login Keychain and
is the only thing proving an update came from you, since the app is not
notarized. Do not export it into GitHub secrets.

After you publish a stable release, this permanent link will download it:

`https://github.com/adarshaacharya/sajilo/releases/latest/download/Sajilo-macos-arm64.dmg`

The release is for Apple Silicon Macs. It is not Apple-notarized, so first-time users need to Control-click the app and choose **Open**.

## Do not commit build files

Do not add `.build/`, `.app`, `.dmg`, or `.zip` files to Git. They are generated automatically and are already ignored by `.gitignore`.
