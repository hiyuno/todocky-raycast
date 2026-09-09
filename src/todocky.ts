import { getPreferenceValues } from "@raycast/api";

/**
 * Todocky's macOS app embeds an MCP server (Settings → MCP Server) that speaks
 * JSON-RPC over a plain HTTP POST — one request, one response, no session. That
 * is the whole integration surface this extension needs, so instead of pulling in
 * an MCP client library we talk to it directly.
 */

const PROTOCOL_VERSION = "2025-11-25";

/** Todocky blocks each call until the user answers its permission prompt, so the
 * ceiling here is "how long is a human willing to be asked", not a network RTT. */
const REQUEST_TIMEOUT_MS = 120_000;

/** After this long without an answer, the call is almost certainly sitting behind
 * Todocky's confirmation dialog rather than being slow. */
export const LIKELY_AWAITING_APPROVAL_MS = 1_500;

export interface Project {
  id: string;
  name: string;
  is_inbox: boolean;
  is_archived: boolean;
}

export interface TaskSummary {
  id: string;
  name: string;
  is_completed?: boolean;
}

export type TodockyErrorKind =
  /** Nothing answered on the port: app closed, or MCP Server toggled off. */
  | "unreachable"
  /** The user pressed Deny in Todocky, or a previous Deny is still in effect. */
  | "denied"
  /** Todocky answered, but refused the call (bad id, archived project, …). */
  | "tool"
  /** Something answered, but not the way Todocky's MCP server does. */
  | "protocol";

export class TodockyError extends Error {
  readonly kind: TodockyErrorKind;

  constructor(kind: TodockyErrorKind, message: string) {
    super(message);
    this.name = "TodockyError";
    this.kind = kind;
  }
}

interface Preferences {
  serverUrl?: string;
  token?: string;
  defaultProject?: string;
}

export function preferences(): Preferences {
  return getPreferenceValues<Preferences>();
}

function serverUrl(): string {
  const raw = preferences().serverUrl?.trim();
  return raw && raw.length > 0 ? raw : "http://127.0.0.1:47823/";
}

interface JsonRpcResponse {
  result?: {
    content?: { type?: string; text?: string }[];
    isError?: boolean;
  };
  error?: { message?: string };
}

/**
 * Calls one MCP tool and returns its decoded JSON payload. `onSlow` fires once if
 * the call is still pending after {@link LIKELY_AWAITING_APPROVAL_MS}, so callers
 * can tell the user to go approve it in Todocky.
 */
async function callTool<T>(name: string, args: Record<string, unknown>, onSlow?: () => void): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const slowTimer = onSlow ? setTimeout(onSlow, LIKELY_AWAITING_APPROVAL_MS) : undefined;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "MCP-Protocol-Version": PROTOCOL_VERSION,
  };
  const token = preferences().token?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(serverUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
      signal: controller.signal,
    });
  } catch {
    throw new TodockyError("unreachable", "Todocky isn’t answering. Open the app and turn on Settings → MCP Server.");
  } finally {
    clearTimeout(timeout);
    if (slowTimer) clearTimeout(slowTimer);
  }

  if (response.status === 401) {
    throw new TodockyError("denied", "Todocky rejected the access token. Generate a new one in Settings → MCP Server.");
  }
  if (!response.ok) {
    throw new TodockyError("protocol", `Todocky answered with HTTP ${response.status}.`);
  }

  let payload: JsonRpcResponse;
  try {
    payload = (await response.json()) as JsonRpcResponse;
  } catch {
    throw new TodockyError("protocol", "Todocky sent a response this extension could not read.");
  }

  if (payload.error) {
    throw new TodockyError("protocol", payload.error.message ?? "Todocky reported an unknown error.");
  }

  const text = payload.result?.content?.find((item) => typeof item.text === "string")?.text;
  if (text === undefined) {
    throw new TodockyError("protocol", "Todocky sent an empty response.");
  }

  if (payload.result?.isError) {
    // Todocky words every denial as "Access was denied in ToDoPro."; matching on
    // "denied" keeps working if that sentence is ever reworded.
    const kind: TodockyErrorKind = /denied/i.test(text) ? "denied" : "tool";
    throw new TodockyError(
      kind,
      kind === "denied" ? "Todocky denied access. Quit and reopen Todocky to be asked again." : text,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new TodockyError("protocol", text);
  }
}

export async function listProjects(onSlow?: () => void): Promise<Project[]> {
  const projects = await callTool<Project[]>("list_projects", { include_archived: false }, onSlow);
  // Inbox first, then alphabetically — the same order that reads naturally in a picker.
  return projects.sort((a, b) => {
    if (a.is_inbox !== b.is_inbox) return a.is_inbox ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function listTasks(projectId: string, onSlow?: () => void): Promise<TaskSummary[]> {
  return callTool<TaskSummary[]>("list_tasks", { project_id: projectId, include_completed: true }, onSlow);
}

export async function createTask(
  projectId: string,
  name: string,
  description: string,
  onSlow?: () => void,
): Promise<TaskSummary> {
  return callTool<TaskSummary>("create_task", { project_id: projectId, name, description }, onSlow);
}

/**
 * Picks the project a quick capture should land in: the one named in preferences,
 * then the last one used, then Inbox, then whatever comes first.
 */
export function resolveDefaultProject(
  projects: Project[],
  preferredName?: string,
  lastUsedId?: string,
): Project | undefined {
  const wanted = preferredName?.trim().toLowerCase();
  if (wanted) {
    const match = projects.find((project) => project.name.trim().toLowerCase() === wanted);
    if (match) return match;
  }
  return (
    projects.find((project) => project.id === lastUsedId) ?? projects.find((project) => project.is_inbox) ?? projects[0]
  );
}

/** Where {@link Project.id} of the last project a task was added to is remembered. */
export const LAST_PROJECT_KEY = "todocky.lastProjectId";
