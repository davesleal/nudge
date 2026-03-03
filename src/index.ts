#!/usr/bin/env node
/**
 * nudge-mcp — A friendly AI accountability layer for your todo app.
 *
 * Instead of a cold productivity dashboard, nudge gives your AI assistant
 * the context to check in like a friend: "Hey, did you ever call that dentist?"
 *
 * Uses the Model Context Protocol (MCP) open standard — works with
 * Claude, and any other MCP-compatible AI assistant.
 *
 * Install:  npm install -g nudge-mcp
 * Config:   ~/.nudge/config.json
 *
 * Add to Claude Desktop:
 *   {
 *     "mcpServers": {
 *       "nudge": { "command": "npx", "args": ["nudge-mcp"] }
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

import { Todo, NewTodo, TodoAdapter, Config } from "./types.js";
import { LocalAdapter } from "./adapters/local.js";
import { TodoistAdapter } from "./adapters/todoist.js";
import { NotionAdapter } from "./adapters/notion.js";

// ─── Config ──────────────────────────────────────────────────────────────────

async function loadConfig(): Promise<Config> {
  const configPath = process.env.NUDGE_CONFIG
    ?? path.join(os.homedir(), ".nudge", "config.json");

  try {
    const raw = await fs.readFile(configPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { adapter: { type: "local" } };
  }
}

function buildAdapter(config: Config): TodoAdapter {
  const { type, ...rest } = config.adapter;
  switch (type) {
    case "todoist": return new TodoistAdapter(rest as any);
    case "notion":  return new NotionAdapter(rest as any);
    case "local":
    default:        return new LocalAdapter(rest as any);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function fuzzyMatch(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function formatTodo(t: Todo): string {
  const status = t.done ? "✅" : "⬜";
  const due    = t.due ? ` (due: ${t.due})` : "";
  const tags   = t.tags?.length ? ` [${t.tags.join(", ")}]` : "";
  return `${status} ${t.title}${due}${tags}`;
}

// ─── Suggested system prompt (exposed as an MCP prompt resource) ──────────────

const NUDGE_SYSTEM_PROMPT = `You have access to the user's task list via nudge-mcp tools.

Bring up relevant tasks naturally — the way a good friend would, not a productivity app.
A friend notices when something has been sitting undone for days and mentions it without being preachy.
One mention is enough. Don't lecture. Don't list everything at once unless asked.

If the user asks "what do I have to do?" or "how am I doing?", give a warm, honest summary.
If something is overdue, you can say so lightly: "hey, that report's been on your list for a while."
If everything is done, celebrate it briefly — don't just report the empty state.

Never refer to tasks in first person ("I added a task for you").
Always frame things around the user: "you've got X left today" not "I see X tasks pending".`;

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "check_tasks",
    description:
      "Check whether specific things have been done. Fuzzy-matches task names so you don't need exact wording. " +
      "Great for friendly check-ins: 'did you ever call the dentist?' Use this when the user mentions something " +
      "they said they'd do and you want to see if it's on the list and whether it's ticked off.",
    inputSchema: {
      type: "object",
      properties: {
        names: {
          type: "array",
          items: { type: "string" },
          description: "Things to check on. Fuzzy matched — 'dentist' will find 'Call the dentist'.",
        },
      },
      required: ["names"],
    },
  },
  {
    name: "get_pending_today",
    description:
      "See what's still on the user's plate for today — useful for a natural mid-day or end-of-day check-in. " +
      "If it's getting late and there are still open tasks, that's worth a gentle mention.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_todos",
    description:
      "List the user's tasks with optional filters. Use this when asked directly, or when you need context " +
      "to give a useful, honest answer about where things stand.",
    inputSchema: {
      type: "object",
      properties: {
        done: {
          type: "boolean",
          description: "true = completed only, false = pending only. Omit for all.",
        },
        due_today: {
          type: "boolean",
          description: "Only tasks due today.",
        },
        overdue: {
          type: "boolean",
          description: "Only tasks past their due date and still open.",
        },
        tag: {
          type: "string",
          description: "Filter by a specific tag or label.",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
      },
    },
  },
  {
    name: "get_stats",
    description:
      "Get an honest summary of where things stand: total tasks, done today, pending, overdue. " +
      "Use this for an end-of-day check-in or when the user wants the big picture.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "search_todos",
    description: "Search across task titles and notes by keyword.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword to search for." },
      },
      required: ["query"],
    },
  },
  {
    name: "create_todo",
    description:
      "Add a new task to the user's list. Use this when the user says something like " +
      "'remind me to...' or 'add X to my list' or 'I need to do Y by Friday'. " +
      "Confirm what you added so they know it landed.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The task title. Keep it clear and action-oriented.",
        },
        due: {
          type: "string",
          description: "Due date in YYYY-MM-DD format. Infer from natural language if possible.",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "How urgent is this?",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional labels or categories.",
        },
        notes: {
          type: "string",
          description: "Any extra context or details for the task.",
        },
      },
      required: ["title"],
    },
  },
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleCheckTasks(adapter: TodoAdapter, args: any): Promise<string> {
  const todos = await adapter.listTodos();
  const names: string[] = args.names ?? [];

  const results = names.map((name) => {
    const matches = todos.filter((t) => fuzzyMatch(t.title, name));
    if (!matches.length) return `❓ "${name}" — not on the list`;
    const best = matches[0];
    return best.done
      ? `✅ "${best.title}" — done`
      : `⬜ "${best.title}" — still open`;
  });

  return results.join("\n");
}

async function handleGetPendingToday(adapter: TodoAdapter): Promise<string> {
  const todos = await adapter.listTodos();
  const t = today();
  const pending = todos.filter((x) => x.due === t && !x.done);

  if (!pending.length) return "🎉 Nothing due today — all clear.";

  return [`📋 Still due today (${pending.length}):`, ...pending.map((t) => `  ⬜ ${t.title}`)].join("\n");
}

async function handleListTodos(adapter: TodoAdapter, args: any): Promise<string> {
  let todos = await adapter.listTodos();
  const t = today();

  if (args.done       !== undefined) todos = todos.filter((x) => x.done === args.done);
  if (args.due_today)                todos = todos.filter((x) => x.due === t);
  if (args.overdue)                  todos = todos.filter((x) => x.due && x.due < t && !x.done);
  if (args.tag)                      todos = todos.filter((x) => x.tags?.includes(args.tag));
  if (args.priority)                 todos = todos.filter((x) => x.priority === args.priority);

  if (!todos.length) return "Nothing found.";
  return todos.map(formatTodo).join("\n");
}

async function handleGetStats(adapter: TodoAdapter): Promise<string> {
  const todos = await adapter.listTodos();
  const t = today();

  const total     = todos.length;
  const done      = todos.filter((x) => x.done).length;
  const pending   = total - done;
  const doneToday = todos.filter((x) => x.done && x.completedAt?.startsWith(t)).length;
  const dueToday  = todos.filter((x) => x.due === t && !x.done).length;
  const overdue   = todos.filter((x) => x.due && x.due < t && !x.done).length;

  return [
    `📊 ${t}`,
    `  Total:          ${total}`,
    `  Done:           ${done} (${total ? Math.round((done / total) * 100) : 0}%)`,
    `  Pending:        ${pending}`,
    `  Done today:     ${doneToday}`,
    `  Due today:      ${dueToday}`,
    `  Overdue:        ${overdue}`,
  ].join("\n");
}

async function handleSearchTodos(adapter: TodoAdapter, args: any): Promise<string> {
  const todos = await adapter.listTodos();
  const matches = todos.filter(
    (t) => fuzzyMatch(t.title, args.query) || (t.notes && fuzzyMatch(t.notes, args.query))
  );
  if (!matches.length) return `Nothing found for "${args.query}".`;
  return matches.map(formatTodo).join("\n");
}

async function handleCreateTodo(adapter: TodoAdapter, args: any): Promise<string> {
  if (!adapter.createTodo) {
    return "This adapter doesn't support creating tasks yet. Check the adapter docs or use the local adapter.";
  }

  const newTodo: NewTodo = {
    title:    args.title,
    due:      args.due,
    priority: args.priority,
    tags:     args.tags,
    notes:    args.notes,
  };

  const created = await adapter.createTodo(newTodo);

  const due      = created.due ? ` due ${created.due}` : "";
  const priority = created.priority && created.priority !== "low" ? ` · ${created.priority} priority` : "";
  return `✅ Added: "${created.title}"${due}${priority}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const config  = await loadConfig();
  const adapter = buildAdapter(config);

  const server = new Server(
    { name: "nudge-mcp", version: "1.0.0" },
    { capabilities: { tools: {}, prompts: {} } }
  );

  // Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    let text = "";

    try {
      switch (name) {
        case "check_tasks":       text = await handleCheckTasks(adapter, args ?? {}); break;
        case "get_pending_today": text = await handleGetPendingToday(adapter); break;
        case "list_todos":        text = await handleListTodos(adapter, args ?? {}); break;
        case "get_stats":         text = await handleGetStats(adapter); break;
        case "search_todos":      text = await handleSearchTodos(adapter, args ?? {}); break;
        case "create_todo":       text = await handleCreateTodo(adapter, args ?? {}); break;
        default:                  text = `Unknown tool: ${name}`;
      }
    } catch (e: any) {
      text = `Error: ${e.message}`;
    }

    return { content: [{ type: "text", text }] };
  });

  // Expose the suggested system prompt so Claude Desktop can pick it up
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [{
      name: "nudge-persona",
      description: "Suggested system prompt — gives the AI the 'friend nudge' personality",
    }],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    if (req.params.name === "nudge-persona") {
      return {
        description: "nudge persona",
        messages: [{ role: "user", content: { type: "text", text: NUDGE_SYSTEM_PROMPT } }],
      };
    }
    throw new Error("Unknown prompt");
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("nudge-mcp running\n");
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e.message}\n`);
  process.exit(1);
});
