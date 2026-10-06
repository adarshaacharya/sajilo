# Config fixtures

`test-key/` is a **test-only** minisign key pair; its password is
`sajilo-test`. It signs manifests in `crates/sajilo-config/tests` and the
desktop's remote-config tests, and is in no build's trusted key list, so a
manifest signed with it is refused by every real Sajilo.
