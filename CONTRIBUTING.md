# Contributing to nudge

Thanks for wanting to help. Contributions of all kinds are welcome — new adapters, bug fixes, docs improvements, or ideas.

## The fastest way to contribute: a new adapter

Each backend is a single self-contained file in `src/adapters/`. To add support for a new app, implement the `TodoAdapter` interface:

```typescript
import { Todo, NewTodo, TodoAdapter } from "../types.js";

export class MyAppAdapter implements TodoAdapter {
  name = "myapp";

  async listTodos(): Promise<Todo[]> {
    // Return all tasks from your app
  }

  async getTodo(id: string): Promise<Todo | null> {
    // Return a single task, or null
  }

  // Optional but recommended:
  async createTodo(input: NewTodo): Promise<Todo> { ... }
  async markComplete(id: string): Promise<void>   { ... }
  async markIncomplete(id: string): Promise<void> { ... }
}
```

Then register it in `src/index.ts` inside `buildAdapter()`.

Adapters people would love to see: Apple Reminders, Linear, GitHub Issues, Asana, TickTick, Microsoft To Do.

## Running locally

```bash
git clone https://github.com/davesleal/nudge.git
cd nudge
npm install
npm run dev        # runs with tsx (no build needed)
npm run build      # compiles to dist/
```

## Pull requests

- Keep PRs focused — one adapter or one fix per PR
- Include a brief description of what the adapter connects to and how auth works
- If you're adding an adapter that needs an API key, document it in the README under "Supported backends"

## Issues

Bug reports, feature requests, and adapter requests are all welcome as GitHub issues.

## Code of conduct

Be kind. That's it.
