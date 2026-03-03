/**
 * GitHub Issues adapter
 * https://docs.github.com/en/rest/issues/issues
 *
 * Setup:
 *   GitHub → Settings → Developer settings → Personal access tokens
 *   Needs: repo scope (or public_repo for public repos)
 *   Set GITHUB_TOKEN env var, or add token to config.json
 *
 * Config:
 *   {
 *     "adapter": {
 *       "type": "github",
 *       "token": "ghp_xxx",
 *       "owner": "davesleal",
 *       "repo": "my-project",      // optional: filter to one repo
 *       "assignedToMe": true        // default: true
 *     }
 *   }
 */

import { Todo, NewTodo, TodoAdapter } from "../types.js";

interface GitHubConfig {
  token?: string;
  owner?: string;
  repo?: string;
  assignedToMe?: boolean;
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  body?: string;
  labels: { name: string }[];
  created_at: string;
  closed_at?: string;
  due_on?: string;    // not native to GH issues, but some use milestone.due_on
  milestone?: { due_on?: string };
  html_url: string;
}

export class GitHubAdapter implements TodoAdapter {
  name = "github";
  private token: string;
  private owner?: string;
  private repo?: string;
  private assignedToMe: boolean;
  private baseUrl = "https://api.github.com";

  constructor(config: GitHubConfig = {}) {
    this.token = config.token ?? process.env.GITHUB_TOKEN ?? "";
    this.owner = config.owner;
    this.repo  = config.repo;
    this.assignedToMe = config.assignedToMe ?? true;
    if (!this.token) throw new Error("GitHub token required (GITHUB_TOKEN)");
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private async apiFetch<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${path}`);
    return res.json();
  }

  async listTodos(): Promise<Todo[]> {
    let issues: GitHubIssue[] = [];

    if (this.repo && this.owner) {
      // Single repo
      const params = new URLSearchParams({ state: "open", per_page: "100" });
      if (this.assignedToMe) params.set("assignee", "@me");
      issues = await this.apiFetch<GitHubIssue[]>(
        `/repos/${this.owner}/${this.repo}/issues?${params}`
      );
    } else {
      // All repos assigned to me
      issues = await this.apiFetch<GitHubIssue[]>(
        `/issues?state=open&filter=assigned&per_page=100`
      );
    }

    // Filter out pull requests (GitHub returns PRs in issues endpoint)
    return issues
      .filter((i: any) => !i.pull_request)
      .map(this.mapIssue.bind(this));
  }

  async getTodo(id: string): Promise<Todo | null> {
    if (!this.owner || !this.repo) return null;
    try {
      const issue = await this.apiFetch<GitHubIssue>(
        `/repos/${this.owner}/${this.repo}/issues/${id}`
      );
      return this.mapIssue(issue);
    } catch {
      return null;
    }
  }

  async createTodo(input: NewTodo): Promise<Todo> {
    if (!this.owner || !this.repo) {
      throw new Error("owner and repo required to create GitHub issues");
    }

    const body: any = { title: input.title };
    if (input.notes)  body.body   = input.notes;
    if (input.tags)   body.labels = input.tags;

    const issue = await fetch(
      `${this.baseUrl}/repos/${this.owner}/${this.repo}/issues`,
      { method: "POST", headers: { ...this.headers, "Content-Type": "application/json" },
        body: JSON.stringify(body) }
    ).then((r) => r.json()) as GitHubIssue;

    return this.mapIssue(issue);
  }

  async markComplete(id: string): Promise<void> {
    if (!this.owner || !this.repo) return;
    await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/issues/${id}`, {
      method: "PATCH",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ state: "closed" }),
    });
  }

  async markIncomplete(id: string): Promise<void> {
    if (!this.owner || !this.repo) return;
    await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/issues/${id}`, {
      method: "PATCH",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ state: "open" }),
    });
  }

  private mapIssue(issue: GitHubIssue): Todo {
    return {
      id:          String(issue.number),
      title:       issue.title,
      done:        issue.state === "closed",
      due:         issue.milestone?.due_on?.split("T")[0],
      priority:    "low",
      tags:        issue.labels.map((l) => l.name),
      notes:       issue.body ?? undefined,
      createdAt:   issue.created_at,
      completedAt: issue.closed_at ?? undefined,
    };
  }
}
