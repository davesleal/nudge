/**
 * Notion adapter — reads a Notion Database as a todo list
 * Docs: https://developers.notion.com/reference/post-database-query
 *
 * Setup:
 *   1. Create an internal integration: https://www.notion.so/my-integrations
 *   2. Share your database with the integration
 *   3. Copy the Database ID from the URL:
 *      notion.so/username/<DATABASE_ID>?v=...
 *
 * Your Notion database should have these properties:
 *   - Name (title)           — task title
 *   - Done (checkbox)        — completion status
 *   - Due (date)             — optional due date
 *   - Priority (select)      — Low / Medium / High
 *   - Tags (multi_select)    — optional labels
 */

import { Todo, TodoAdapter } from "../types.js";

interface NotionConfig {
  apiKey: string;
  databaseId: string;
}

export class NotionAdapter implements TodoAdapter {
  name = "notion";
  private apiKey: string;
  private databaseId: string;
  private baseUrl = "https://api.notion.com/v1";
  private headers: Record<string, string>;

  constructor(config: NotionConfig) {
    this.apiKey = config.apiKey ?? process.env.NOTION_API_KEY ?? "";
    this.databaseId = config.databaseId ?? process.env.NOTION_DATABASE_ID ?? "";
    if (!this.apiKey) throw new Error("Notion API key required");
    if (!this.databaseId) throw new Error("Notion database ID required");

    this.headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    };
  }

  async listTodos(): Promise<Todo[]> {
    const results: any[] = [];
    let cursor: string | null = null;

    do {
      const body: any = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;

      const res = await fetch(`${this.baseUrl}/databases/${this.databaseId}/query`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      results.push(...(data.results ?? []));
      cursor = data.has_more ? data.next_cursor : null;
    } while (cursor);

    return results.map(this.mapPage);
  }

  async getTodo(id: string): Promise<Todo | null> {
    const res = await fetch(`${this.baseUrl}/pages/${id}`, { headers: this.headers });
    if (!res.ok) return null;
    return this.mapPage(await res.json());
  }

  async markComplete(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/pages/${id}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({ properties: { Done: { checkbox: true } } }),
    });
  }

  private mapPage(page: any): Todo {
    const props = page.properties ?? {};
    const title = props.Name?.title?.[0]?.plain_text
      ?? props.Task?.title?.[0]?.plain_text
      ?? "Untitled";

    const priority = props.Priority?.select?.name?.toLowerCase() as Todo["priority"]
      ?? "low";

    return {
      id: page.id,
      title,
      done: props.Done?.checkbox ?? false,
      due: props.Due?.date?.start ?? undefined,
      priority,
      tags: (props.Tags?.multi_select ?? []).map((t: any) => t.name),
      createdAt: page.created_time,
    };
  }
}
