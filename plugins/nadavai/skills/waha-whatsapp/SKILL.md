---
name: waha-whatsapp
description: Connect an app's WhatsApp number to Nadav's self-hosted WAHA server (waha.nadavc.ai), which replaced WaSender in November 2026. Covers a new app joining WAHA, a new client number, moving a number off WaSender without downtime, the client's one-time link (code or QR), shadow checks, the switch, and checking or repairing a WAHA session. Use for "לחבר וואטסאפ", "מספר חדש לבוט", "להעביר מ-WaSender", "WAHA", "דף חיבור", a bot that stopped answering on a WAHA number, or a new app that needs to send or receive WhatsApp. Not for reading or sending from Nadav's own WhatsApp (wacli).
---

# WhatsApp through WAHA

WAHA (devlikeapro, GOWS engine, free Core edition, unlimited sessions) runs on `nadavai-svc` and links each
number as a WhatsApp linked device, the way WhatsApp Web does. Every app sends and receives through it. A
message from it reaches real people, so every send and every client message stays behind the message gate
(`working-style.md`, Approval gates; `client-messages.md`).

## Where things are
- API: `https://waha.nadavc.ai` (Caddy on `nadavai-vm` → `nadavai-svc:3000`; the link pages and the media
  proxy → `nadavai-svc:3001`). Caddy answers 404 to the admin paths, the session list, and any non-GET under
  `/api/sessions/*`, so an app key can send and read its own session but not manage the server.
- Admin key: only in the vault (`~/.claude/secrets/waha.env`) and in `/opt/waha/.env` on the server. Never in
  an app, a repo, a link page or a message.
- Each session has its own scoped key (`POST /api/keys`, `session` + read/send) and its own webhook HMAC key.
  `scripts/new-session.py` makes both and writes them to `/opt/waha/keys/<session>.env` (root only). Move
  them into the app's secrets without printing them: pipe the file straight into the secret store, for
  example `ssh nadavai-svc 'sudo cat /opt/waha/keys/<s>.env' | supabase secrets set --env-file /dev/stdin
  --project-ref <ref>`, or per value into `vercel env add <NAME> production` on stdin. That fits an app with
  one number (cash, snooker). An app with a number per client keeps them per record, never in the function
  env (therapy-flow-v2: the clinic's `whatsapp_sessions` row, set as its DEPLOY.md §6.4 shows), or one
  number's key overwrites another's. Never `cat` the file to the terminal, and never paste a key into a
  command line.
- Data: `/opt/waha/{sessions,media,keys}`. The session store holds the link keys: losing it means every
  number links again. Daily backup on the server, pulled to `nadavai-vm` (`/var/backups/waha-offsite`,
  age-encrypted; the private key is `~/.claude/secrets/waha-backup-age.key`). Restore was tried once.
- Watchdog on `nadavai-vm` every 2 min (`nadavai-alert`): a session not WORKING, or linked to a number other
  than its `metadata.expectedPhone`. `metadata.live` set to the string `"1"` marks a session whose STOPPED
  state is an outage; `metadata.linking=<epoch>` quiets link states until that time (so a repair link on a
  live session also quiets its outage alarm until the link expires). The stale-backup alert is separate: the
  daily backup pull on `nadavai-vm` (03:00) raises it.
- Container upgrades: `scripts/waha-run` (backup first, keeps the old container until the new one answers).
- The install scripts in `scripts/` are a partial record, not a rebuild. These live only on the servers: the
  `waha-link` container's run (mounts, env: `docker inspect waha-link`), the `waha-backup` service and timer
  that `install-svc-backup-v2.sh` starts, the cleanup service and timer
  (`/etc/systemd/system/waha-*` on `nadavai-svc`), the Caddy block (`/opt/woodpecker/Caddyfile` on
  `nadavai-vm`), the `/opt/waha/.env` options, the firewall rules and the backup pull key. Read them there
  before changing the server, and add what you change to this folder.

## An app that sends or receives through WAHA
Reference implementations, already reviewed and live or landed: cash-next-app
(`src/lib/sendi/wa-provider.ts`), snooker-smart (`src/lib/green-api.ts`, `src/lib/whatsapp/waha-inbound.ts`),
therapy-flow-v2 (`supabase/functions/_shared/waha.ts`, `_shared/wahaEvents.ts`, `whatsapp-webhook-waha/`).
Copy their rules, not just their calls:
- Send: `POST /api/sendText {session, chatId: "<digits>@c.us", text}` with `X-Api-Key: <session key>`
  (`sendImage`, `sendFile`, `sendVoice` the same way). A send counts only on a 2xx whose body has a non-empty
  string `id` (`"true_<chat>@c.us_<KEYID>"`); the bare message id is the part after the last `_`. Any other
  answer is not a confirmed send. Never retry an uncertain send automatically: it can message a person twice.
- Receive: the webhook carries `X-Webhook-Hmac` = hex HMAC-SHA512 of the raw body with that session's key;
  verify it in constant time before parsing, and route only by session name to that session's own record.
  An unknown session or a bad HMAC is 401, never a fallback.
- Drop and log every event of a session whose `me` is not its `metadata.expectedPhone`; a missing
  `expectedPhone` fails closed.
- A sender shown as `@lid`: take the phone from `_data.Info.SenderAlt`, then `GET /api/{session}/lids/{lid}`;
  never drop the message silently.
- Media: `payload.media.url` is fetched with the session's own key (the proxy refuses another session's key).
- Saved contacts: `GET /api/contacts/all` gives `{id, name, pushname}`; `name` (address-book name) fills in
  over the hours after linking. Do not decide "saved contact" from it until two reads an hour apart agree.

## A number: link it (new or moving off WaSender)
1. Create the session, STOPPED: `sudo python3 /opt/waha/new-session.py <session> <app> <webhook url> 972…`
   (sets the webhook with its HMAC, `expectedPhone`, the device name "Bot server", and the scoped key).
   Move the keys into the app's secrets as "Where things are" says.
2. A number with no WaSender history goes live the moment the client links (the webhook is set and the
   link starts the session). So before its link goes out, the app must do nothing for that number yet: its
   bot or sending switch for that number off, or the number in the app's shadow mode. Switching it on is
   `action-safety.md`: replay on the client's last 7 days of real messages with every effect off, show Nadav
   the counts and examples, and only after his yes.
3. For a number moving off WaSender, the app's WAHA code must be live and ready to switch at once before the
   link goes out (the client may remove WaSender's device to make room, see Traps).
4. Make the one-time link; `hours` is a bare number (48 is a good default). The admin key goes in through
   the environment, never on the command line:
   `sudo sh -c 'ADMIN_KEY=$(sed -n "s/^WAHA_API_KEY=//p" /opt/waha/.env) docker exec -e ADMIN_KEY waha-link node server.mjs new <session> <label> <972…> 48'`.
   The page (`link-service/`) offers «קישור עם קוד» (8-character code, works on the same phone) and a QR,
   accepts only the expected number (another phone is logged out at once) and never relinks a WORKING session.
5. The message to the client goes through `client-messages` and waits for Nadav's yes. The shape Nadav
   approved on 2026-11-14 (scheduled for 15.11; check the client logs for how it went): one action under a minute; the bot keeps working and the current connection stays
   until the move is done; open the link on the phone of the number ending in XXXX, press «קבלת קוד» and type
   it in WhatsApp; if WhatsApp says there is no room for another device, remove the device named "Mac OS"
   (Nadav's recollection of WaSender's label, Baileys' default; not verified) or send a screenshot of the
   list; the link's expiry; "I will tell you when it is done".
6. Moving off WaSender: run both in shadow at least 48 h (72 h for a clinic bot), with at least three `@lid`
   senders in the window; the inactive route only logs hashed records. Compare by message id, then switch.
   Exception: if WaSender's link is gone (the client removed it, or it dropped), the bot is down, so switch
   that number at once without the shadow period and tell Nadav. Before a planned switch, the plan's test
   sends (a text, a file and a voice note to Nadav's own number) are gated sends: ask.
7. Switch: flip the app's provider for that number first, then turn WaSender's webhook off; dedupe by bare
   message id; set `metadata.live` to `"1"`. Keep WaSender linked with its webhook off for 7 days, then delete that
   WaSender session. Per app: cash and snooker by env (`WHATSAPP_PROVIDER=waha` plus the `WAHA_*` secrets);
   therapy-flow-v2 per row by `planning/waha-migration-2026-11-14/switch-forward.sql` and its DEPLOY.md,
   which first takes the number out of shadow (or a message can be handled by neither route).
8. Tell the client it is done (same gate), and record the number in the app's notes.

## A bot stopped answering on a WAHA number
Read its status without printing the key or the number:
`ssh nadavai-svc 'sudo sh -c "K=\$(sed -n s/^WAHA_API_KEY=//p /opt/waha/.env); curl -s -H \"X-Api-Key: \$K\" 127.0.0.1:3000/api/sessions/<s>"' | jq '{status, me: (.me.id[-9:])}'`.
WORKING with the right `me` is healthy, so look at the app's webhook log; SCAN_QR_CODE or
FAILED means the link is gone: make a repair link (step 4) and a client message (step 5, gated). A restored
backup may still need a relink.

## Traps (each one happened)
- WhatsApp allows four linked devices. Removing a device to make room can remove WaSender's link and stop
  the bot until the switch: be ready to switch that number at once.
- A `PUT /api/sessions/{s}` on a running session restarts it (about 20 s, no relink). Change config at a
  quiet hour, and keep the webhook HMAC key in the body you send back.
- `WHATSAPP_RESTART_ALL_SESSIONS=True` starts every session after a container restart, a STOPPED one too.
- A secret scanner reads base64-looking test fixtures as keys, also in a PR's earlier commits: use plain
  fixture values.
- therapy-flow-v2 has a unique index on `whatsapp_sessions.provider_session_id`: a WAHA session name must
  not equal any row's WaSender session id.

## Files here
- `scripts/new-session.py`: create a STOPPED session with its webhook, HMAC, metadata and scoped key.
- `scripts/waha-run`: replace the WAHA container safely. `scripts/waha-watchdog` and its
  `scripts/waha-watchdog.test.sh` (run it after any change): the 2-minute check on `nadavai-vm`.
- `scripts/waha-link-cleanup`: daily removal of the keys of spent or expired links.
- `scripts/install-svc-backup-v2.sh` (encrypted backups on `nadavai-svc`; paths under the server's own
  user), `scripts/install-vm.sh`, `scripts/install-vm-backup-pull.sh` (on `nadavai-vm`): how those pieces
  were installed.
- `link-service/`: the link page service (`server.mjs`, `page.html`); tests: `node --test flow.test.mjs
  server.test.mjs`. It runs as the `waha-link` container on `nadavai-svc:3001`.

## Before the last WaSender number is switched
The in-app "connect WhatsApp" of therapy-flow-v2 (also used by the salon) still opens WaSender sessions
until its own WAHA path is built (a provisioning endpoint beside WAHA, no admin key in the app). Cancelling
the WaSender subscription is a money action: ask Nadav at that moment.
