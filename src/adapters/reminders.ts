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
 *       "list": "To Do"    // optional: name of a specific list (default: all lists)
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
      return execSync(`osascript << 'APPLESCRIPT'\n${script}\nAPPLESCRIPT`, {
        encoding: "utf-8",
        timeout: 15000,
      }).trim();
    } catch (e: any) {
      const stderr: string = e.stderr ?? "";

      // Translate common AppleScript errors into actionable messages
      if (stderr.includes("not allowed assistive access") || stderr.includes("-1719")) {
        throw new Error(
          "Reminders access denied. Go to System Settings → Privacy & Security → Automation " +
          "and enable Reminders access for your terminal app."
        );
      }
      if (stderr.includes("-1728") || stderr.includes("Can't get")) {
        throw new Error(
          "Couldn't read Reminders — this usually means the app is still syncing from iCloud. " +
          "Open Reminders.app, wait for it to load, then try again. " +
          "If using a specific list, check the list name matches exactly (case-sensitive)."
        );
      }
      if (stderr.includes("Application isn't running") || stderr.includes("-600")) {
        throw new Error(
          "Reminders app isn't running. Open Reminders.app and try again."
        );
      }
      if (e.signal === "SIGTERM" || stderr.includes("timeout")) {
        throw new Error(
          "Reminders timed out — the app may be syncing a large number of tasks. " +
          "Try specifying a single list in your config: { \"list\": \"To Do\" }"
        );
      }

      throw new Error(`Reminders error: ${stderr || e.message}`);
    }
  }

  async listTodos(): Promise<Todo[]> {
    // Iterate by list name — works reliably with iCloud accounts
    const script = this.list
      ? `
        set output to ""
        tell application "Reminders"
          set theList to list "${this.list}"
          set theReminders to reminders of theList
          repeat with r in theReminders
            set rID to id of r
            set rName to name of r
            set rDone to completed of r
            set rDue to ""
            try
              set rDue to (due date of r) as string
            end try
            set output to output & rID & "|" & rName & "|" & rDone & "|" & rDue & linefeed
          end repeat
        end tell
        return output
      `
      : `
        set output to ""
        tell application "Reminders"
          set theLists to every list
          repeat with aList in theLists
            set theReminders to reminders of aList
            set listName to name of aList
            repeat with r in theReminders
              set rID to id of r
              set rName to name of r
              set rDone to completed of r
              set rDue to ""
              try
                set rDue to (due date of r) as string
              end try
              set output to output & rID & "|" & rName & "|" & rDone & "|" & rDue & "|" & listName & linefeed
            end repeat
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
        const parts = line.split("|");
        const [id, title, done, due, tag] = parts;
        return {
          id:   id   ?? String(idx),
          title: title ?? "",
          done:  done === "true",
          due:   due ? this.parseAppleDate(due) : undefined,
          tags:  tag ? [tag] : [],
        };
      });
  }

  async getTodo(id: string): Promise<Todo | null> {
    const todos = await this.listTodos();
    return todos.find((t) => t.id === id) ?? null;
  }

  async createTodo(input: NewTodo): Promise<Todo> {
    const targetList = this.list ?? "Reminders";
    const dueLine = input.due
      ? `set due date of newReminder to date "${input.due}"`
      : "";
    const notesLine = input.notes
      ? `set body of newReminder to "${input.notes.replace(/"/g, '\\"')}"`
      : "";

    const script = `
      tell application "Reminders"
        set theList to list "${targetList}"
        set newReminder to make new reminder at end of theList
        set name of newReminder to "${input.title.replace(/"/g, '\\"')}"
        ${dueLine}
        ${notesLine}
        return id of newReminder
      end tell
    `;

    const id = this.runScript(script);
    return {
      id,
      title:     input.title,
      done:      false,
      due:       input.due,
      priority:  input.priority ?? "low",
      tags:      input.tags ?? [],
      notes:     input.notes,
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
