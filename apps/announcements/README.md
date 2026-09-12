# Sajilo announcements

This Worker serves one public, read-only announcement to Sajilo at
`/v1/announcement`. The active record lives in Cloudflare KV under the key
`active-announcement`.

## Publish a notice

1. In the Cloudflare dashboard, open **Workers & Pages → KV →
   SAJILO_ANNOUNCEMENTS**.
2. Create or edit `active-announcement`.
3. Paste a record based on `announcement.example.json` and save it.

The Worker validates the record before it is shown. `startsAt` and `expiresAt`
must be ISO 8601 UTC timestamps. The notice is hidden before its start time and
immediately after its expiry. Delete the key to withdraw it immediately.

`action.url` must be an HTTPS URL. If it is omitted, Sajilo renders the notice
as information only.

## Local verification

```bash
bun install
bun run check
bun run dev
curl http://127.0.0.1:8787/v1/announcement
```

For a local visible notice, use Wrangler's local KV store to put the example
value under `active-announcement`, then restart `bun run dev`.

## Deploy

```bash
bun run deploy
```

After deployment, the Worker URL must match `ANNOUNCEMENT_ENDPOINT` in the
desktop command. Keep this endpoint read-only; no dashboard credential or
write token belongs in Sajilo.
