# Releasing Sajilo

GitHub Actions builds and publishes the Mac download for you.

## Before releasing

1. Open `scripts/AppBundleInfo.plist`.
2. Change `CFBundleShortVersionString` to the new version, for example `0.1.0`.
3. Change `CFBundleVersion` to a higher number each release.
4. Commit and push your changes to GitHub.

## Publish a beta

For the first beta of version `0.1.0`, create and push this tag:

```bash
git tag -a v0.1.0-beta.1 -m "Sajilo 0.1.0 beta 1"
git push origin v0.1.0-beta.1
```

GitHub Actions will test the app, create the DMG and ZIP, then publish a GitHub prerelease. For a stable release, use the matching tag without `-beta.1`, for example `v0.1.0`.

After you publish a stable release, this permanent link will download it:

`https://github.com/adarshaacharya/sajilo/releases/latest/download/Sajilo-macos-arm64.dmg`

The release is for Apple Silicon Macs. It is not Apple-notarized, so first-time users need to Control-click the app and choose **Open**.

## Do not commit build files

Do not add `.build/`, `.app`, `.dmg`, or `.zip` files to Git. They are generated automatically and are already ignored by `.gitignore`.
