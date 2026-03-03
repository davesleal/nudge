export interface Todo {
  id: string;
  title: string;
  done: boolean;
  due?: string;        // ISO date string e.g. "2026-03-03"
  priority?: "low" | "medium" | "high";
  tags?: string[];
  notes?: string;
  completedAt?: string;
  createdAt?: string;
}

export interface NewTodo {
  title: string;
  due?: string;
  priority?: "low" | "medium" | "high";
  tags?: string[];
  notes?: string;
}

export interface TodoAdapter {
  name: string;
  listTodos(): Promise<Todo[]>;
  getTodo(id: string): Promise<Todo | null>;
  createTodo?(todo: NewTodo): Promise<Todo>;
  markComplete?(id: string): Promise<void>;
  markIncomplete?(id: string): Promise<void>;
}

export interface AdapterConfig {
  type: "local" | "todoist" | "notion" | "linear" | "github";
  [key: string]: unknown;
}

export interface Config {
  adapter: AdapterConfig;
}
