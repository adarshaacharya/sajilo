# Sajilo announcements

This Worker serves Sajilo's notices at `/v1/announcement`: short messages on
the Today screen that go out without an app release. They are stored in
Cloudflare KV as one list under the key `announcements`.

## Publish a notice

```bash
bun install
bun run notices publish my-notice.json   # add, or replace one with the same id
bun run notices                          # what is stored, and what is live
bun run notices withdraw my-notice-id    # take one down now
```

A file holds one notice or a list of them; see `notices.example.json`. Each is
checked with the Worker's own rules before anything is saved, and a preview in
both languages is printed. Add `--dry-run` to see the result without saving,
and `--local` to work on the store `bun run dev` serves. Expired notices are
cleared out whenever the list is saved.

| Field | |
|---|---|
| `id` | Lowercase letters, digits and dashes. Closing a notice is remembered by id, so a new message needs a new id. |
| `level` | `info` and `important` can be closed by the user. `urgent` cannot, and is also sent once as a system notification. |
| `title`, `body` | `en` and `ne`, both required; 180 and 320 characters at most. |
| `startsAt`, `expiresAt` | Optional ISO 8601 UTC times. Hidden before the start and after the expiry. |
| `platforms` | Optional: any of `windows`, `macos`, `linux`. Omitted means everyone. Matched on the device; the app never says which platform it runs on. |
| `action` | Optional link (`https://` only) and its label; the whole card opens it. |

At most five notices are live at once, urgent first. A malformed record is
skipped rather than hiding the others.

## Older versions

Versions of Sajilo from before the list read a single `announcement` field
instead. The Worker always fills it with a standing "Update Sajilo" notice
(`UPDATE_NOTICE` in `src/schema.ts`), so anyone on an old version is pointed
at the latest one.

## Checks

```bash
bun run check   # types
bun test        # notice rules and ordering
```

## Deploy

```bash
bun run deploy
```

After deployment, the Worker URL must match `ANNOUNCEMENT_ENDPOINT` in the
desktop command. Keep this endpoint read-only; no dashboard credential or
write token belongs in Sajilo.
