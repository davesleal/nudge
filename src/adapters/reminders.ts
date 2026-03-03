/**
 * Apple Reminders adapter — via AppleScript (macOS only)
 *
 * No API key needed. Reads directly from the Reminders app on your Mac.
 * Requires: macOS, Reminders app, and Node.js running with Automation permissions.
 *
 * First run: macOS will prompt you to grant Terminal (or your shell) access
 * to Reminders. Grant it once and it works forever.
 *
 * Config:
 *   {
 *     "adapter": {
 *       "type": "reminders",
 *       "list": "Reminders"    // optional: name of the list to read (default: all)
 *     }
 *   }
 */

import { execSync } from "child_process";
import { Todo, NewTodo, TodoAdapter } from "../types.js";

interface RemindersConfig {
  list?: string;
}

export class RemindersAdapter implements TodoAdapter {
  name = "reminders";
  private list?: string;

  constructor(config: RemindersConfig = {}) {
    this.list = config.list;

    if (process.platform !== "darwin") {
      throw new Error("Apple Reminders adapter is macOS only.");
    }
  }

  private runScript(script: string): string {
    try {
      return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
        encoding: "utf-8",
        timeout: 10000,
      }).trim();
    } catch (e: any) {
      throw new Error(`AppleScript error: ${e.message}`);
    }
  }

  async listTodos(): Promise<Todo[]> {
    const listFilter = this.list
      ? `list "${this.list}" of`
      : "";

    const script = `
      set output to ""
      tell application "Reminders"
        set theReminders to reminders of ${listFilter} default account
        repeat with r in theReminders
          set rName to name of r
          set rDone to completed of r
          set rDue to ""
          try
            set rDue to (due date of r) as string
          end try
          set rID to id of r
          set output to output & rID & "|" & rName & "|" & rDone & "|" & rDue & "\\n"
        end repeat
      end tell
      return output
    `;

    const raw = this.runScript(script);
    if (!raw) return [];

    return raw
      .split("\n")
      .filter(Boolean)
      .map((line, idx) => {
        const [id, title, done, due] = line.split("|");
        return {
          id: id ?? String(idx),
          title: title ?? "",
          done: done === "true",
          due: due ? this.parseAppleDate(due) : undefined,
        };
      });
  }

  async getTodo(id: string): Promise<Todo | null> {
    const todos = await this.listTodos();
    return todos.find((t) => t.id === id) ?? null;
  }

  async createTodo(input: NewTodo): Promise<Todo> {
    const listTarget = this.list
      ? `list "${this.list}" of default account`
      : `default list of default account`;

    const dueLine = input.due
      ? `set due date of newReminder to date "${input.due}"`
      : "";

    const script = `
      tell application "Reminders"
        set newReminder to make new reminder at end of ${listTarget}
        set name of newReminder to "${input.title.replace(/"/g, '\\"')}"
        ${dueLine}
        return id of newReminder
      end tell
    `;

    const id = this.runScript(script);
    return {
      id,
      title: input.title,
      done: false,
      due: input.due,
      priority: input.priority ?? "low",
      tags: input.tags ?? [],
      notes: input.notes,
      createdAt: new Date().toISOString(),
    };
  }

  async markComplete(id: string): Promise<void> {
    this.runScript(`
      tell application "Reminders"
        set completed of reminder id "${id}" to true
      end tell
    `);
  }

  async markIncomplete(id: string): Promise<void> {
    this.runScript(`
      tell application "Reminders"
        set completed of reminder id "${id}" to false
      end tell
    `);
  }

  /** Convert AppleScript date string to YYYY-MM-DD */
  private parseAppleDate(appleDate: string): string | undefined {
    try {
      const d = new Date(appleDate);
      if (isNaN(d.getTime())) return undefined;
      return d.toISOString().split("T")[0];
    } catch {
      return undefined;
    }
  }
}
