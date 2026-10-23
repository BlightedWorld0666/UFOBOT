# MossadBot — Valorant Discord community bot

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
