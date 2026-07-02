import "dotenv/config";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} from "discord.js";
import crypto from "node:crypto";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID || "";
const sharedSecret = process.env.BRIDGE_SHARED_SECRET;
const port = Number(process.env.PORT || 8787);
const adminIds = new Set((process.env.ADMIN_DISCORD_USER_IDS || "").split(",").map((id) => id.trim()).filter(Boolean));

if (!token || !clientId || !sharedSecret) {
  throw new Error("Missing DISCORD_TOKEN, DISCORD_CLIENT_ID, or BRIDGE_SHARED_SECRET in .env");
}

const queue = [];
const completed = new Map();
const COMMAND_LEASE_MS = 15000;
const BROADCAST_TTL_MS = 60000;

function isAdmin(interaction) {
  return adminIds.has(interaction.user.id) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function enqueue(type, interaction, payload) {
  const command = {
    id: crypto.randomUUID(),
    type,
    actor: `${interaction.user.username} (${interaction.user.id})`,
    createdAt: Date.now(),
    broadcast: type === "global",
    ackedJobs: [],
    ...payload
  };
  queue.push(command);
  return command;
}

function takeString(interaction, name) {
  return interaction.options.getString(name, true).trim();
}

function takeInteger(interaction, name) {
  return interaction.options.getInteger(name, true);
}

function adminCommand(builder) {
  return builder.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
}

const commands = [
  adminCommand(
    new SlashCommandBuilder()
      .setName("say")
      .setDescription("Make the bot say a message in this channel.")
      .addStringOption((option) => option.setName("message").setDescription("Message content").setRequired(true))
  ),
  adminCommand(
    new SlashCommandBuilder()
      .setName("global")
      .setDescription("Send an in-game global announcement.")
      .addStringOption((option) => option.setName("message").setDescription("Announcement content").setRequired(true))
  ),
  adminCommand(
    new SlashCommandBuilder()
      .setName("give-dinero")
      .setDescription("Give a Roblox player Dinero.")
      .addStringOption((option) => option.setName("username").setDescription("Roblox username").setRequired(true))
      .addIntegerOption((option) => option.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))
  ),
  adminCommand(
    new SlashCommandBuilder()
      .setName("give-wheel-spins")
      .setDescription("Give a Roblox player wheel spins.")
      .addStringOption((option) => option.setName("username").setDescription("Roblox username").setRequired(true))
      .addIntegerOption((option) => option.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))
  ),
  adminCommand(
    new SlashCommandBuilder()
      .setName("give-season-tokens")
      .setDescription("Give a Roblox player season pass tokens.")
      .addStringOption((option) => option.setName("username").setDescription("Roblox username").setRequired(true))
      .addIntegerOption((option) => option.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))
  ),
  adminCommand(
    new SlashCommandBuilder()
      .setName("give-skin")
      .setDescription("Give a Roblox player a skin.")
      .addStringOption((option) => option.setName("username").setDescription("Roblox username").setRequired(true))
      .addStringOption((option) => option.setName("category").setDescription("Skin category, for example Loveboard or FightingStyle").setRequired(true))
      .addStringOption((option) => option.setName("skin").setDescription("Exact skin name").setRequired(true))
  ),
  adminCommand(
    new SlashCommandBuilder()
      .setName("give-weapon")
      .setDescription("Give a Roblox player a weapon.")
      .addStringOption((option) => option.setName("username").setDescription("Roblox username").setRequired(true))
      .addStringOption((option) => option.setName("weapon").setDescription("Exact weapon name").setRequired(true))
  ),
  adminCommand(
    new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Kick an online Roblox player.")
      .addStringOption((option) => option.setName("username").setDescription("Roblox username").setRequired(true))
      .addStringOption((option) => option.setName("reason").setDescription("Reason").setRequired(false))
  ),
  adminCommand(
    new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a Roblox player.")
      .addStringOption((option) => option.setName("username").setDescription("Roblox username").setRequired(true))
      .addStringOption((option) => option.setName("reason").setDescription("Reason").setRequired(false))
  ),
  adminCommand(
    new SlashCommandBuilder()
      .setName("tempban")
      .setDescription("Temporarily ban a Roblox player.")
      .addStringOption((option) => option.setName("username").setDescription("Roblox username").setRequired(true))
      .addIntegerOption((option) => option.setName("duration_minutes").setDescription("Duration in minutes").setRequired(true).setMinValue(1))
      .addStringOption((option) => option.setName("reason").setDescription("Reason").setRequired(false))
  )
].map((command) => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(token);
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`Registered ${commands.length} guild commands.`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`Registered ${commands.length} global commands.`);
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`Discord bot online as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!isAdmin(interaction)) {
    await interaction.reply({ content: "You do not have permission to use this bot.", ephemeral: true });
    return;
  }

  const name = interaction.commandName;
  if (name === "say") {
    const message = takeString(interaction, "message");
    await interaction.reply({ content: "Sent.", ephemeral: true });
    await interaction.channel?.send(message);
    return;
  }

  let command;
  if (name === "global") {
    command = enqueue("global", interaction, { message: takeString(interaction, "message") });
  } else if (name === "give-dinero") {
    command = enqueue("give_currency", interaction, { targetUsername: takeString(interaction, "username"), currency: "dinero", amount: takeInteger(interaction, "amount") });
  } else if (name === "give-wheel-spins") {
    command = enqueue("give_currency", interaction, { targetUsername: takeString(interaction, "username"), currency: "wheel_spins", amount: takeInteger(interaction, "amount") });
  } else if (name === "give-season-tokens") {
    command = enqueue("give_currency", interaction, { targetUsername: takeString(interaction, "username"), currency: "season_tokens", amount: takeInteger(interaction, "amount") });
  } else if (name === "give-skin") {
    command = enqueue("give_skin", interaction, { targetUsername: takeString(interaction, "username"), category: takeString(interaction, "category"), skin: takeString(interaction, "skin") });
  } else if (name === "give-weapon") {
    command = enqueue("give_weapon", interaction, { targetUsername: takeString(interaction, "username"), weapon: takeString(interaction, "weapon") });
  } else if (name === "kick") {
    command = enqueue("kick", interaction, { targetUsername: takeString(interaction, "username"), reason: interaction.options.getString("reason") || "Kicked from Discord bot" });
  } else if (name === "ban") {
    command = enqueue("ban", interaction, { targetUsername: takeString(interaction, "username"), reason: interaction.options.getString("reason") || "Banned from Discord bot" });
  } else if (name === "tempban") {
    command = enqueue("tempban", interaction, {
      targetUsername: takeString(interaction, "username"),
      durationSeconds: takeInteger(interaction, "duration_minutes") * 60,
      reason: interaction.options.getString("reason") || "Temp-banned from Discord bot"
    });
  }

  if (command) {
    await interaction.reply({ content: `Queued Roblox command \`${command.id}\`.`, ephemeral: true });
  }
});

const app = express();
app.use(express.json());

function requireBridgeAuth(req, res, next) {
  const expected = `Bearer ${sharedSecret}`;
  if (req.headers.authorization !== expected) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, queued: queue.length, completed: completed.size });
});

app.get("/roblox/poll", requireBridgeAuth, (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit || 10), 25));
  const jobId = String(req.query.jobId || "unknown");
  const now = Date.now();
  const commandsForServer = [];

  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const command = queue[index];
    if (command.broadcast && now - command.createdAt > BROADCAST_TTL_MS) {
      queue.splice(index, 1);
    }
  }

  for (const command of queue) {
    if (commandsForServer.length >= limit) break;

    if (command.broadcast) {
      if (!command.ackedJobs.includes(jobId)) {
        commandsForServer.push(command);
      }
      continue;
    }

    if (command.leasedBy && command.leaseExpiresAt > now && command.leasedBy !== jobId) {
      continue;
    }

    command.leasedBy = jobId;
    command.leaseExpiresAt = now + COMMAND_LEASE_MS;
    commandsForServer.push(command);
  }

  res.json({ commands: commandsForServer });
});

app.post("/roblox/ack", requireBridgeAuth, (req, res) => {
  const { id, ok, message, placeId, jobId } = req.body || {};
  if (id) {
    completed.set(id, { ok: Boolean(ok), message: String(message || ""), placeId, jobId, at: Date.now() });
    const index = queue.findIndex((command) => command.id === id);
    if (index >= 0) {
      const command = queue[index];
      if (command.broadcast) {
        if (jobId && !command.ackedJobs.includes(jobId)) {
          command.ackedJobs.push(jobId);
        }
      } else if (ok) {
        queue.splice(index, 1);
      } else {
        command.leasedBy = null;
        command.leaseExpiresAt = 0;
      }
    }
  }
  res.json({ ok: true });
});

await registerCommands();
await client.login(token);

app.listen(port, () => {
  console.log(`Roblox bridge listening on port ${port}`);
});
