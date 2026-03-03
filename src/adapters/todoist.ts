/**
 * Todoist adapter — REST API v2
 * https://developer.todoist.com/rest/v2/
 *
 * Setup:
 *   Todoist → Settings → Integrations → Developer → API token
 *   Set TODOIST_API_KEY env var, or add apiKey to config.json
 */

import { Todo, NewTodo, TodoAdapter } from "../types.js";

interface TodoistConfig {
  apiKey?: string;
  projectId?: string;
}

interface TodoistTask {
  id: string;
  content: string;
  is_completed: boolean;
  due?: { date: string };
  priority: number;
  labels: string[];
  description?: string;
  created_at: string;
  completed_at?: string;
}

export class TodoistAdapter implements TodoAdapter {
  name = "todoist";
  private apiKey: string;
  private projectId?: string;
  private baseUrl = "https://api.todoist.com/rest/v2";

  constructor(config: TodoistConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.TODOIST_API_KEY ?? "";
    this.projectId = config.projectId;
    if (!this.apiKey) throw new Error("Todoist API key required (TODOIST_API_KEY)");
  }

  private get headers() {
    return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" };
  }

  private async apiFetch<T>(path: string): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (this.projectId) url.searchParams.set("project_id", this.projectId);
    const res = await fetch(url.toString(), { headers: this.headers });
    if (!res.ok) throw new Error(`Todoist API error: ${res.status}`);
    return res.json();
  }

  async listTodos(): Promise<Todo[]> {
    const tasks = await this.apiFetch<TodoistTask[]>("/tasks");
    return tasks.map(this.mapTask);
  }

  async getTodo(id: string): Promise<Todo | null> {
    try {
      const task = await this.apiFetch<TodoistTask>(`/tasks/${id}`);
      return this.mapTask(task);
    } catch {
      return null;
    }
  }

  async createTodo(input: NewTodo): Promise<Todo> {
    const body: any = { content: input.title };
    if (input.due)      body.due_string = input.due;
    if (input.priority) body.priority = { low: 1, medium: 3, high: 4 }[input.priority];
    if (input.tags)     body.labels = input.tags;
    if (input.notes)    body.description = input.notes;
    if (this.projectId) body.project_id = this.projectId;

    const res = await fetch(`${this.baseUrl}/tasks`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Todoist create error: ${res.status}`);
    const task = await res.json() as TodoistTask;
    return this.mapTask(task);
  }

  async markComplete(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/tasks/${id}/close`, {
      method: "POST",
      headers: this.headers,
    });
  }

  async markIncomplete(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/tasks/${id}/reopen`, {
      method: "POST",
      headers: this.headers,
    });
  }

  private mapTask(t: TodoistTask): Todo {
    const priorityMap: Record<number, Todo["priority"]> = { 1: "low", 2: "low", 3: "medium", 4: "high" };
    return {
      id:          t.id,
      title:       t.content,
      done:        t.is_completed,
      due:         t.due?.date,
      priority:    priorityMap[t.priority] ?? "low",
      tags:        t.labels,
      notes:       t.description,
      createdAt:   t.created_at,
      completedAt: t.completed_at,
    };
  }
}
