#!/usr/bin/env node
/**
 * nudge init — interactive setup wizard
 *
 * Run: npx nudge-mcp init
 *
 * Walks you through picking a backend, entering credentials,
 * and writes ~/.nudge/config.json + shows the Claude Desktop snippet.
 */

import readline from "readline";
import fs from "fs/promises";
import path from "path";
import os from "os";

const CONFIG_DIR  = path.join(os.homedir(), ".nudge");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const TODOS_PATH  = path.join(CONFIG_DIR, "todos.json");

const CLAUDE_CONFIG_PATH = path.join(
  os.homedir(),
  "Library", "Application Support", "Claude", "claude_desktop_config.json"
);

// ─── Readline helpers ─────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

function askWithDefault(question: string, defaultVal: string): Promise<string> {
  return new Promise((resolve) =>
    rl.question(`${question} [${defaultVal}]: `, (a) => resolve(a.trim() || defaultVal))
  );
}

async function choose(question: string, options: string[]): Promise<string> {
  console.log(`\n${question}`);
  options.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
  while (true) {
    const ans = await ask("\nChoose a number: ");
    const idx = parseInt(ans) - 1;
    if (idx >= 0 && idx < options.length) return options[idx];
    console.log("  Please enter a valid number.");
  }
}

// ─── Adapter setup flows ──────────────────────────────────────────────────────

async function setupLocal(): Promise<object> {
  console.log("\n📁 Local file adapter");
  const format = await choose("File format?", ["JSON (todos.json)", "Markdown checklist (todos.md)"]);
  const isMarkdown = format.startsWith("Markdown");
  const defaultPath = isMarkdown ? TODOS_PATH.replace(".json", ".md") : TODOS_PATH;
  const filePath = await askWithDefault("File path", defaultPath);

  if (!isMarkdown) {
    // Bootstrap an empty JSON file if it doesn't exist
    try {
      await fs.access(filePath);
    } catch {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify([
        { id: "1", title: "Try out nudge", done: false, due: new Date().toISOString().split("T")[0] }
      ], null, 2));
      console.log(`  ✅ Created starter file at ${filePath}`);
    }
  }

  return { type: "local", filePath, ...(isMarkdown && { format: "markdown" }) };
}

async function setupTodoist(): Promise<object> {
  console.log("\n✅ Todoist adapter");
  console.log("  Get your token: Todoist → Settings → Integrations → Developer\n");
  const apiKey = await ask("API token: ");
  const projectId = await ask("Project ID to filter (leave blank for all tasks): ");
  return { type: "todoist", apiKey, ...(projectId && { projectId }) };
}

async function setupNotion(): Promise<object> {
  console.log("\n📝 Notion adapter");
  console.log("  1. Create an integration: https://www.notion.so/my-integrations");
  console.log("  2. Share your task database with the integration");
  console.log("  3. Copy the database ID from the URL\n");
  const apiKey     = await ask("Integration token (secret_xxx): ");
  const databaseId = await ask("Database ID: ");
  return { type: "notion", apiKey, databaseId };
}

async function setupLinear(): Promise<object> {
  console.log("\n📐 Linear adapter");
  console.log("  Get your key: Linear → Settings → API → Personal API keys\n");
  const apiKey   = await ask("API key: ");
  const teamId   = await ask("Team ID to filter (leave blank for all teams): ");
  const myIssues = (await askWithDefault("Only show issues assigned to me?", "yes")).toLowerCase();
  return {
    type: "linear",
    apiKey,
    ...(teamId && { teamId }),
    myIssues: !["no", "n", "false"].includes(myIssues),
  };
}

async function setupGitHub(): Promise<object> {
  console.log("\n🐙 GitHub Issues adapter");
  console.log("  Get a token: GitHub → Settings → Developer settings → Personal access tokens");
  console.log("  Needs: repo scope\n");
  const token = await ask("Personal access token: ");
  const owner = await ask("Repo owner (e.g. davesleal, or leave blank for all assigned issues): ");
  const repo  = owner ? await ask("Repo name (leave blank for all repos under owner): ") : "";
  return { type: "github", token, ...(owner && { owner }), ...(repo && { repo }) };
}

async function setupReminders(): Promise<object> {
  console.log("\n🍎 Apple Reminders adapter (macOS only)");
  console.log("  No API key needed — reads directly from your Reminders app.");
  console.log("  macOS will ask for Automation permission on first run.\n");
  const list = await ask("List name to read (leave blank for all lists): ");
  return { type: "reminders", ...(list && { list }) };
}

// ─── Claude Desktop config ────────────────────────────────────────────────────

async function updateClaudeDesktop(): Promise<void> {
  const snippet = {
    mcpServers: {
      nudge: { command: "npx", args: ["nudge-mcp"] },
    },
  };

  try {
    const raw  = await fs.readFile(CLAUDE_CONFIG_PATH, "utf-8");
    const existing = JSON.parse(raw);
    existing.mcpServers = { ...(existing.mcpServers ?? {}), nudge: snippet.mcpServers.nudge };
    await fs.writeFile(CLAUDE_CONFIG_PATH, JSON.stringify(existing, null, 2));
    console.log("  ✅ Added nudge to Claude Desktop config automatically.");
  } catch {
    console.log("\n  Couldn't update Claude Desktop config automatically.");
    console.log("  Add this to ~/Library/Application Support/Claude/claude_desktop_config.json:\n");
    console.log(JSON.stringify(snippet, null, 2));
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n👋 Welcome to nudge setup\n");
  console.log("This wizard connects your AI assistant to your todo app.");
  console.log("Takes about 60 seconds.\n");

  const backend = await choose("Which todo app do you use?", [
    "Local JSON file (no account needed)",
    "Markdown checklist",
    "Todoist",
    "Notion",
    "Linear",
    "GitHub Issues",
    "Apple Reminders (macOS only)",
  ]);

  let adapterConfig: object;

  if (backend.startsWith("Local JSON"))         adapterConfig = await setupLocal();
  else if (backend.startsWith("Markdown"))       adapterConfig = await setupLocal();
  else if (backend === "Todoist")                adapterConfig = await setupTodoist();
  else if (backend === "Notion")                 adapterConfig = await setupNotion();
  else if (backend === "Linear")                 adapterConfig = await setupLinear();
  else if (backend === "GitHub Issues")          adapterConfig = await setupGitHub();
  else                                           adapterConfig = await setupReminders();

  // Write config
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify({ adapter: adapterConfig }, null, 2));
  console.log(`\n✅ Config saved to ${CONFIG_PATH}`);

  // Claude Desktop
  const addToClaude = await askWithDefault("\nAdd nudge to Claude Desktop automatically?", "yes");
  if (!["no", "n", "false"].includes(addToClaude.toLowerCase())) {
    await updateClaudeDesktop();
    console.log("\n🎉 All done! Restart Claude Desktop and nudge will be active.");
  } else {
    console.log("\n🎉 Config saved. Add nudge to Claude Desktop manually when ready.");
  }

  rl.close();
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  rl.close();
  process.exit(1);
});
