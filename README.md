# Discord Roblox Bot

This bot queues Discord slash-command actions for Roblox servers to poll.
Roblox cannot receive inbound Discord requests directly, so the game server calls this bot's HTTP bridge.

## Setup

1. Run `npm install`.
2. Copy `.env.example` to `.env`.
3. Fill `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `ADMIN_DISCORD_USER_IDS`, and `BRIDGE_SHARED_SECRET`.
4. Put the same bridge secret and public HTTPS bot URL into `ServerScriptService.CodexServices.DiscordBridgeService`.
5. Run `npm start`.

Use a public HTTPS host for live Roblox servers. `http://127.0.0.1:8787` is only useful while testing locally.

## Commands

- `/say message`
- `/global message`
- `/give-dinero username amount`
- `/give-wheel-spins username amount`
- `/give-season-tokens username amount`
- `/give-skin username category skin`
- `/give-weapon username weapon`
- `/kick username reason`
- `/ban username reason`
- `/tempban username duration_minutes reason`
