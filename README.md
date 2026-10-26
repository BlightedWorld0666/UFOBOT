# UFO Bot — Discord community assistant

A custom, self-hosted Discord bot for agent roles, Riot ID associations, manually claimed rank roles, profiles and explicit unlinking.

## Quick start
1. Install Node.js 20 or later.
2. Create an application + bot at https://discord.com/developers/applications and copy the bot token and application (client) ID.
3. Invite the bot using OAuth2 scopes `bot` and `applications.commands`, with **Manage Roles**, **Send Messages**, and **Use Application Commands**.
4. Place the bot's Discord role **above** the roles it should assign.
5. Copy `.env.example` to `.env`; fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `DISCORD_GUILD_ID`.
6. Run `npm install` and `npm start`.

**Never commit .env, bot tokens, API keys or player databases.**

## Commands
- `/setup-agents` (staff) — post 4 multi-select menus for agent mains.
- `/link riot_id:Player#NA1 region:americas` — save Riot ID; optionally look up ID when authorized Riot API key is configured. **Does not prove ownership**.
- `/claim-rank` — self-reported rank, always marked **Unverified Rank**.
- `/verify-rank` (staff) — human review of evidence followed by staff verification; not Riot OAuth verification.
- `/sync` — optional account identifier lookup; no rank API is implied.
- `/profile` — linked ID, rank claim, selected agent mains.
- `/unlink` — remove association, claim and roles.

## Trust model / limitations
Entering a Riot ID or appearing on Discord's Tracker activity is **not proof of ownership**; usernames can be impersonated. A Riot ID lookup proves only that an account exists, not that the Discord user controls it. Riot's official documented VALORANT API does not expose a general per-player competitive rank endpoint. Real automatic rank roles require an authorized provider that exposes that information and a compliant player-consent flow. Do not scrape Tracker.gg or ask users for Riot passwords. Riot Sign On (RSO) requires approved production access. This starter deliberately does **not** collect presence data or mislabel self-reported ranks as API-verified.

`/verify-rank` is a **staff attestation**. For stricter labeling, rename that role to `Staff Checked Rank`, not `Riot Verified`.

Data is stored in `data/members.json` and removed on `/unlink`. For a larger public bot, replace this file with a transactional database and add retention/security controls. The code is a starter and must be tested in a Discord test server before production.

## Added community tools
- `/lfg mode:Competitive spots:2 notes:...` posts a listing. Specify `LFG_CHANNEL_ID` to send all listings to a dedicated channel.
- `/lfg-close` removes your active listing. Listings are tracked in memory, so the active-listing index resets on bot restart.
- A staff-confirmed rank change sends a notification to `RANK_LOG_CHANNEL_ID` when configured. Rank claims are **not** announced as verified.
- A local, read-only hub health endpoint listens on `127.0.0.1:HUB_PORT/health` when `HUB_API_KEY` is set. Send `Authorization: Bearer <HUB_API_KEY>` to get status, uptime, Discord server count, linked-profile count and rank-provider capability. It does not expose Riot IDs. Do not expose this endpoint to the public internet.

## Riot rank reality
Existing Discord↔Riot connected accounts aren't generally readable as Riot authentication credentials by third-party Discord bots. The official Valorant API documents player match histories after authorized opt-in and top ladder leaderboards, **not a general current competitive-rank endpoint**. `/sync` only rechecks the account identifier; it never fabricates a rank. Planned verified OAuth login requires Riot production RSO approval. Rank notifications are manually staff-triggered until an authorized rank provider exists.

## UFO Bot community expansion
The bot is now named **UFO Bot**, source: https://github.com/BlightedWorld0666/UFOBOT. Public information: https://blighted.world/ufobot/ ; privacy: https://blighted.world/ufobot/privacy/ ; terms: https://blighted.world/ufobot/terms/ .

- `/xp [user]`: level and XP; awards 15 XP for at most one non-bot message per user per minute, and does not read message content.
- `/leaderboard`: top ten XP totals per server.
- `/setbio bio:...`, `/server-profile [user]`: customizable public bio and server profile.
- `/tempvoice [name] [limit]`: create a voice room; deletes when empty. Set `TEMPVOICE_CATEGORY_ID` if needed.
- `/tempvoice-close`: close an empty room you own.
- `/reset-profile`: delete XP and profile bio. Use `/unlink` separately for Riot ID / rank / agent role deletion.

Enable Discord **Manage Channels** permissions for temporary rooms. XP requires GuildMessages intent only and does not inspect message text. To disable XP, set `XP_ENABLED=false`. If a server Hub manages secrets, inject them as process environment variables (prefer an encrypted secret store); do not store real secrets in your public repo, website JavaScript, Discord messages, or bot health responses. Hub health authentication is an API token independent of the Riot API key. The bot does not currently integrate directly with the Hub vault.

The web pages are static policy and product documentation; they do not run an OAuth callback. The current /link command only associates a self-entered Riot ID, with an optional account-existence check—not ownership verification or official competitive rank synchronization. Public launch and Riot Sign On require Riot approval and updated consent/retention controls.


## UFO Bot admin control center
A private, authenticated dashboard is included in `dashboard/` with its own local server, encrypted credential storage, server settings, and a Hub integration placeholder.

1. Run `npm install`.
2. Run `npm run admin:setup` locally. Enter username **Admin** (the default), then enter your chosen password when prompted. The requested password can be entered during setup, but **it must never be saved to GitHub**. The helper generates an scrypt password hash and a random encryption key.
3. Copy the generated `DASHBOARD_PASSWORD_HASH` and `DASHBOARD_MASTER_KEY` values to your private `.env`. Retain a secure backup of the master key: it cannot be recovered if lost.
4. Run `npm run dashboard`. Open `http://127.0.0.1:8792/` on your Windows host. This is a separate process from `npm start`, so your Hub should start and supervise both.
5. Do **not** expose port 8792 directly to the public internet. For remote access use a hardened authenticated HTTPS reverse proxy or private VPN and set `DASHBOARD_SECURE_COOKIE=true` behind HTTPS.

Security: 8-hour HTTP-only SameSite Strict sessions, login throttling, server-side scrypt password verification, AES-256-GCM secret encryption, restricted secret names and no secret read-back. The default dashboard binds to localhost only. Configure a much stronger, unique password before any Internet-facing deployment; a short numeric password is unsafe for a public admin portal even when hashed.

**Current implementation boundary:** Dashboard settings and encrypted secrets are saved in `data/dashboard.json`. Supported community settings are read by the bot from the same file: XP enable/rate/cooldown, temporary voice category and default user limit, LFG channel/enable, agent selection toggle, rank claim toggle, and rank-log channel. Set the same **absolute** `BLIGHTED_BOT_DATA_DIR` path in both processes when the Hub supervises them from different working directories (for example `C:\\BlightedData\\UFOBOT`). Both processes now resolve the same setting/member/community files from this directory. Without the override, the legacy `./data` relative-to-working-directory behavior is preserved for compatibility. Existing files are **not** moved or migrated automatically: back up the entire data directory (including `dashboard.json` and the encrypted-vault master key held separately) before switching paths; use a tested controlled copy and rollback plan. Supported nonsecret bot settings reload on file change; a successful save does not confirm bot connectivity. Credential entries remain encrypted and are **not** automatically injected into the running bot. Restart and environment changes are managed separately. Hub control and automatic verified VALORANT rank sync are not connected.

## Blighted.World admin portal integration (October 2026)

The owner-facing dashboard matches the visual design of the UFO Bot public page. The public landing page at `https://blighted.world/ufobot/` currently **does not link** to `https://admin.blighted.world/`; the latter is only an intended private operator hostname, not a verified deployment. Do not add a public admin link until its authentication, Cloudflare Access, HTTPS and routing are confirmed. This is a private backend app: do not upload `dashboard/index.html` as a publicly accessible static login page.

1. On the **Windows host**, open the UFOBOT repository folder, install Node.js 20+ if needed, and run `npm install`.
2. Run `npm run admin:setup`. Enter **Admin** for the username and enter your chosen password when prompted. For the requested initial local-only setup, enter the password you provided in chat. The script computes a salted scrypt hash and fresh AES encryption master key. **Neither the password nor the resulting .env values should be committed to GitHub.**
3. Copy `.env.example` to a local `.env`, add the generated `DASHBOARD_PASSWORD_HASH` and `DASHBOARD_MASTER_KEY`, and set `DASHBOARD_USERNAME=Admin`. Retain existing Discord and Hub environment variables. Save a secure backup of the master key.
4. Run `npm run dashboard` alongside `npm start` (or let your Server Hub supervise both processes). The dashboard listens at `http://127.0.0.1:8792/` by default. It can be used locally without a public URL.
5. To make the linked admin hostname work, configure your existing **Cloudflare Tunnel** with a public hostname `admin.blighted.world` forwarding **HTTPS-terminated** traffic to `http://127.0.0.1:8792`. Set `DASHBOARD_SECURE_COOKIE=true` in the host's private `.env` and restart the dashboard.
6. **Before allowing access over the Internet**, protect `admin.blighted.world` with a Cloudflare Access policy permitting only your own verified identity, and switch from the six-digit initial password to a long unique password. Access policies should be the outer gate; the dashboard's own hashed-password login is the inner gate.
7. For real bot status, set a matching `HUB_API_KEY` in the bot's runtime environment and dashboard vault; the health check requests only `127.0.0.1:HUB_PORT/health` and does not proxy arbitrary stored URLs. The Hub endpoint field is configuration-only until an authenticated Hub API is implemented.

The public UFO Bot page should be safe to visit without authentication. The admin hostname must be HTTPS and protected before it is publicly deployed. The dashboard uses HTTP-only, SameSite Strict sessions, origin checks for state-changing requests, login lockout, CSP, a server-side encrypted vault, and a private bind address. **Do not expose port 8792 directly or commit short-password hashes into the public UFOBOT repository.**
