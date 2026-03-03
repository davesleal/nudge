/**
 * Linear adapter — GraphQL API
 * https://developers.linear.app/docs/graphql/working-with-the-graphql-api
 *
 * Setup:
 *   Linear → Settings → API → Personal API keys → Create key
 *   Set LINEAR_API_KEY env var, or add apiKey to config.json
 *
 * Maps Linear Issues to Todos:
 *   title       ← issue.title
 *   done        ← issue.state.type === "completed" || "cancelled"
 *   due         ← issue.dueDate
 *   priority    ← issue.priority (0=none,1=urgent,2=high,3=medium,4=low)
 *   tags        ← issue.labels
 */

import { Todo, NewTodo, TodoAdapter } from "../types.js";

interface LinearConfig {
  apiKey?: string;
  teamId?: string;   // optional: filter to one team
  myIssues?: boolean; // default true — only show issues assigned to me
}

export class LinearAdapter implements TodoAdapter {
  name = "linear";
  private apiKey: string;
  private teamId?: string;
  private myIssues: boolean;
  private endpoint = "https://api.linear.app/graphql";

  constructor(config: LinearConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.LINEAR_API_KEY ?? "";
    this.teamId = config.teamId;
    this.myIssues = config.myIssues ?? true;
    if (!this.apiKey) throw new Error("Linear API key required (LINEAR_API_KEY)");
  }

  private async query(q: string, variables?: Record<string, unknown>): Promise<any> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: q, variables }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;
  }

  async listTodos(): Promise<Todo[]> {
    const filter: Record<string, unknown> = {};
    if (this.myIssues) filter.assignee = { isMe: { eq: true } };
    if (this.teamId)   filter.team     = { id: { eq: this.teamId } };

    const data = await this.query(`
      query($filter: IssueFilter) {
        issues(filter: $filter, first: 100) {
          nodes {
            id title dueDate priority
            state { type }
            labels { nodes { name } }
            description createdAt completedAt
          }
        }
      }
    `, { filter });

    return (data.issues.nodes as any[]).map(this.mapIssue);
  }

  async getTodo(id: string): Promise<Todo | null> {
    const data = await this.query(`
      query($id: String!) {
        issue(id: $id) {
          id title dueDate priority
          state { type }
          labels { nodes { name } }
          description createdAt completedAt
        }
      }
    `, { id });
    return data.issue ? this.mapIssue(data.issue) : null;
  }

  async createTodo(input: NewTodo): Promise<Todo> {
    const priorityMap: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4 };

    const data = await this.query(`
      mutation($title: String!, $teamId: String, $dueDate: TimelessDate, $priority: Int) {
        issueCreate(input: {
          title: $title, teamId: $teamId, dueDate: $dueDate, priority: $priority
        }) {
          issue { id title dueDate priority state { type } labels { nodes { name } } createdAt }
        }
      }
    `, {
      title: input.title,
      teamId: this.teamId,
      dueDate: input.due,
      priority: input.priority ? priorityMap[input.priority] : undefined,
    });

    return this.mapIssue(data.issueCreate.issue);
  }

  async markComplete(id: string): Promise<void> {
    // Get the "Done" state for the team first
    const data = await this.query(`
      query { workflowStates(filter: { type: { eq: "completed" } }) { nodes { id } } }
    `);
    const stateId = data.workflowStates.nodes[0]?.id;
    if (!stateId) throw new Error("Could not find a completed state in Linear");

    await this.query(`
      mutation($id: String!, $stateId: String!) {
        issueUpdate(id: $id, input: { stateId: $stateId }) { success }
      }
    `, { id, stateId });
  }

  private mapIssue(issue: any): Todo {
    const priorityMap: Record<number, Todo["priority"]> = {
      0: "low", 1: "high", 2: "high", 3: "medium", 4: "low",
    };
    const done = ["completed", "cancelled"].includes(issue.state?.type);
    return {
      id:          issue.id,
      title:       issue.title,
      done,
      due:         issue.dueDate ?? undefined,
      priority:    priorityMap[issue.priority] ?? "low",
      tags:        (issue.labels?.nodes ?? []).map((l: any) => l.name),
      notes:       issue.description ?? undefined,
      createdAt:   issue.createdAt,
      completedAt: issue.completedAt ?? undefined,
    };
  }
}
