/**
 * Local JSON / Markdown adapter
 *
 * Default adapter — works with no config or API keys.
 * Store tasks in ~/.nudge/todos.json
 *
 * Many apps can sync to this file via:
 *   - Apple Shortcuts automation
 *   - Zapier / Make webhooks
 *   - A cron job calling your app's CLI
 *   - Obsidian / Logseq / any Markdown-based app
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { Todo, NewTodo, TodoAdapter } from "../types.js";

interface LocalConfig {
  filePath?: string;
  format?: "json" | "markdown";
}

export class LocalAdapter implements TodoAdapter {
  name = "local";
  private filePath: string;
  private format: "json" | "markdown";

  constructor(config: LocalConfig = {}) {
    this.filePath = config.filePath
      ?? path.join(os.homedir(), ".nudge", "todos.json");
    this.format = config.format ?? "json";
  }

  async listTodos(): Promise<Todo[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      return this.format === "markdown" ? this.parseMarkdown(raw) : JSON.parse(raw);
    } catch (e: any) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }

  async getTodo(id: string): Promise<Todo | null> {
    const todos = await this.listTodos();
    return todos.find((t) => t.id === id) ?? null;
  }

  async createTodo(input: NewTodo): Promise<Todo> {
    const todos = await this.listTodos();
    const todo: Todo = {
      id: crypto.randomUUID(),
      title: input.title,
      done: false,
      due: input.due,
      priority: input.priority ?? "low",
      tags: input.tags ?? [],
      notes: input.notes,
      createdAt: new Date().toISOString(),
    };
    todos.push(todo);
    await this.save(todos);
    return todo;
  }

  async markComplete(id: string): Promise<void> {
    const todos = await this.listTodos();
    const todo = todos.find((t) => t.id === id);
    if (todo) {
      todo.done = true;
      todo.completedAt = new Date().toISOString();
      await this.save(todos);
    }
  }

  async markIncomplete(id: string): Promise<void> {
    const todos = await this.listTodos();
    const todo = todos.find((t) => t.id === id);
    if (todo) {
      todo.done = false;
      todo.completedAt = undefined;
      await this.save(todos);
    }
  }

  private async save(todos: Todo[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(todos, null, 2));
  }

  private parseMarkdown(raw: string): Todo[] {
    const lines = raw.split("\n");
    const todos: Todo[] = [];
    let idx = 0;
    for (const line of lines) {
      const match = line.match(/^[-*]\s+\[( |x|X)\]\s+(.+)$/);
      if (match) {
        todos.push({
          id: String(idx++),
          title: match[2].trim(),
          done: match[1].toLowerCase() === "x",
        });
      }
    }
    return todos;
  }
}
