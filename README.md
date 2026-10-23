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
