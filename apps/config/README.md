# sajilo-config

The signed remote config, served as static files from
`https://config.sajilo.fyi/`. A static-assets-only Worker: no script, so
every request is free and unmetered on Cloudflare's free plan.

```
/v1/manifest.json                       signed envelope, 5 min cache, ETag
/v1/packs/<name>.<schema>.<sha12>.json  content-addressed, cached for a year
```

The source of truth is `data/config/*.json`. **Nothing here is edited by
hand**: a change merges to `main`, and `.github/workflows/publish-config.yml`
validates, signs and deploys it. See `docs/remote-config-plan.md`.

## Local test

```bash
# Sign with your own key (see the plan's "Keys" section), then serve:
SAJILO_CONFIG_SIGNING_KEY="$(cat path/to/sajilo-config.key)" \
SAJILO_CONFIG_SIGNING_KEY_PASSWORD=... bun run build
bun run dev
# A debug desktop build reads from it:
SAJILO_CONFIG_HOST=http://localhost:8788 bun run tauri dev
```
