# nudge

[![npm version](https://img.shields.io/npm/v/nudge-mcp)](https://www.npmjs.com/package/nudge-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

> Your AI assistant, acting like a friend who actually remembers what you said you'd do.

**nudge** is an open-source [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that connects Claude — or any MCP-compatible AI — to your todo app. Instead of a cold productivity dashboard, you get a friend checking in naturally.

```
"hey, you've had 'call the accountant' on your list for 4 days 👀"
"nothing due today, you're all clear"
"added 'dentist appointment' for Friday"
```

No server to run. No first-person AI narration. Just a nudge.

---

## Install

### Claude Desktop (recommended — no server needed)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nudge": {
      "command": "npx",
      "args": ["nudge-mcp"]
    }
  }
}
```

Restart Claude Desktop. That's it — Claude now has access to your tasks and will bring them up naturally.

> Claude Desktop launches nudge as a subprocess. Nothing runs in the background when you're not using Claude.

### Global install

```bash
npm install -g nudge-mcp
nudge-mcp
```

### No install (try it)

```bash
npx nudge-mcp
```

---

## Supported backends

| App | Config type | Notes |
|---|---|---|
| Local JSON file | `local` | Default — zero config needed |
| Markdown checklist | `local` | Any `- [ ] task` format |
| Todoist | `todoist` | Full read + write via REST API |
| Notion | `notion` | Read + write via database |
| Anything else | `local` | Sync/export to a JSON or `.md` file |

Want to add an adapter? See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Configuration

Create `~/.nudge/config.json` — or skip it entirely to use the zero-config local default.

### Local JSON (default — no config file needed)

Tasks live at `~/.nudge/todos.json`:

```json
[
  { "id": "1", "title": "Call the accountant", "done": false, "due": "2026-03-03", "priority": "high" },
  { "id": "2", "title": "Buy birthday gift",   "done": true },
  { "id": "3", "title": "Dentist appointment", "done": false, "tags": ["health"] }
]
```

### Markdown checklist

```json
{
  "adapter": { "type": "local", "filePath": "~/Documents/tasks.md", "format": "markdown" }
}
```

```markdown
- [ ] Call the accountant
- [x] Buy birthday gift
- [ ] Dentist appointment
```

### Todoist

```json
{
  "adapter": { "type": "todoist", "apiKey": "your_token_here" }
}
```

Or set the env var: `TODOIST_API_KEY=your_token npx nudge-mcp`

Get your token: Todoist → Settings → Integrations → Developer

### Notion

```json
{
  "adapter": {
    "type": "notion",
    "apiKey": "secret_xxx",
    "databaseId": "your_database_id"
  }
}
```

Your database needs: `Name` (title), `Done` (checkbox), and optionally `Due` (date), `Priority` (select: Low / Medium / High), `Tags` (multi-select).

Setup: create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations), then share your database with it.

---

## Tools

nudge exposes these tools to any connected AI:

| Tool | What it does |
|---|---|
| `check_tasks` | "Did I ever call the dentist?" — fuzzy matched |
| `get_pending_today` | What's still open and due today |
| `list_todos` | Full list, with filters (overdue, tag, priority, done) |
| `get_stats` | Honest summary — done, pending, overdue |
| `search_todos` | Find tasks by keyword |
| `create_todo` | "Remind me to call Dave on Friday" → adds it |

nudge also ships a **suggested system prompt** (as an MCP prompt resource named `nudge-persona`) that gives the AI the right tone: warm, honest, not preachy. Claude Desktop can pick this up automatically.

---

## Connecting apps without a native adapter

**Apple Shortcuts** — build a shortcut that exports tasks as JSON to `~/.nudge/todos.json` on a schedule.

**Zapier / Make** — add a step that writes task updates to the file whenever something changes in your app.

**Obsidian / Logseq** — point `filePath` at your daily note and use `format: "markdown"`.

**Any CLI app** — add a cron: `0 * * * * myapp export --format json > ~/.nudge/todos.json`

---

## Writing a new adapter

Each adapter is a single file in `src/adapters/`. Implement two required methods and you're done:

```typescript
import { Todo, NewTodo, TodoAdapter } from "../types.js";

export class MyAppAdapter implements TodoAdapter {
  name = "myapp";

  async listTodos(): Promise<Todo[]> {
    // fetch from your app's API
    return [];
  }

  async getTodo(id: string): Promise<Todo | null> {
    return null;
  }

  // Optional — enables create_todo tool
  async createTodo(input: NewTodo): Promise<Todo> { ... }

  // Optional — enables mark complete/incomplete
  async markComplete(id: string): Promise<void>   { ... }
  async markIncomplete(id: string): Promise<void> { ... }
}
```

Then register it in `src/index.ts` in `buildAdapter()`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

---

## Roadmap

- [ ] `nudge init` — interactive setup wizard
- [ ] Apple Reminders adapter (via AppleScript / Shortcuts)
- [ ] Linear adapter
- [ ] GitHub Issues adapter
- [ ] Asana / Microsoft To Do adapter
- [ ] Webhook listener for real-time push (tasks trigger the AI)
- [ ] Scheduled nudge mode (daily check-in without opening Claude)
- [ ] `mark_complete` tool — close the loop from inside the AI

---

## Contributing

PRs and issues are welcome — especially new adapters. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Dave Leal
