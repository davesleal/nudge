# nudge

> Your AI assistant, acting like a friend who actually remembers what you said you'd do.

**nudge** is an open-source [MCP](https://modelcontextprotocol.io) server that connects Claude (or any MCP-compatible AI) to your todo app — so instead of a cold productivity dashboard, you get a friend checking in.

```
"hey, you've had 'call the accountant' on your list for 4 days 👀"
"nothing due today, you're all clear"
"added 'dentist appointment' for Friday"
```

Not first-person. Not preachy. Just a nudge.

---

## Install

### Claude Desktop (no server needed)

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

Restart Claude. Done. Claude now has access to your tasks and will bring them up naturally.

> **No server to run.** Claude Desktop launches nudge as a subprocess automatically.

### Global install

```bash
npm install -g nudge-mcp
nudge-mcp
```

### No install

```bash
npx nudge-mcp
```

---

## Supported backends

| App | Type | Notes |
|---|---|---|
| Local JSON file | `local` | Default — zero config |
| Markdown checklist | `local` | Any `- [ ] task` format |
| Todoist | `todoist` | Full read + write |
| Notion | `notion` | Read + write via database |
| Anything else | `local` | Export/sync to a JSON or `.md` file |

---

## Configuration

Create `~/.nudge/config.json` — or skip it entirely to use the local JSON default.

### Local JSON (default)

No config file needed. Tasks live at `~/.nudge/todos.json`:

```json
[
  { "id": "1", "title": "Call the accountant", "done": false, "due": "2026-03-03", "priority": "high" },
  { "id": "2", "title": "Buy birthday gift", "done": true },
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

Or: `TODOIST_API_KEY=your_token npx nudge-mcp`

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

Your database needs: `Name` (title), `Done` (checkbox), and optionally `Due` (date), `Priority` (select), `Tags` (multi-select).

---

## What your AI can do

| Tool | What it does |
|---|---|
| `check_tasks` | "Did I ever call the dentist?" — fuzzy matched |
| `get_pending_today` | What's still open and due today |
| `list_todos` | Full list with filters (overdue, tag, priority, etc.) |
| `get_stats` | Honest summary — done, pending, overdue |
| `search_todos` | Find tasks by keyword |
| `create_todo` | "Remind me to call Dave on Friday" → adds it |

nudge also ships a **suggested system prompt** (as an MCP prompt resource) that gives Claude the right personality: warm, honest, not preachy.

---

## Connecting other apps

No native adapter for your app? Use the local file as a bridge:

**Apple Shortcuts** — build a shortcut that exports tasks as JSON to `~/.nudge/todos.json` and schedule it to run hourly.

**Zapier / Make** — add a step that writes task updates to the file whenever something changes.

**Obsidian / Logseq** — point `filePath` at your daily note and use `format: "markdown"`.

**Any CLI app** — add a cron: `0 * * * * myapp export > ~/.nudge/todos.json`

---

## Writing a new adapter

Implement two methods, everything else is handled:

```typescript
import { Todo, NewTodo, TodoAdapter } from "nudge-mcp/types";

export class MyAppAdapter implements TodoAdapter {
  name = "myapp";

  async listTodos(): Promise<Todo[]> {
    // fetch from your app
    return [];
  }

  async getTodo(id: string): Promise<Todo | null> {
    return null;
  }

  // optional but recommended
  async createTodo(input: NewTodo): Promise<Todo> { ... }
  async markComplete(id: string): Promise<void>   { ... }
}
```

PRs for new adapters are very welcome.

---

## Roadmap

- [ ] `nudge init` — interactive setup wizard
- [ ] Apple Reminders adapter (via AppleScript / Shortcuts)
- [ ] Linear adapter
- [ ] GitHub Issues adapter
- [ ] Asana adapter
- [ ] Webhook listener for real-time push (reverse feed)
- [ ] Scheduled nudge mode (daily check-in without opening Claude)
- [ ] `mark_complete` tool (close the loop from the AI)

---

## Contributing

MIT licensed. Open an issue or PR — especially for new adapters.

Each adapter is a single self-contained file in `src/adapters/`.
