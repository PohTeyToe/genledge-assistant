import type { ChatMessage, ChatResponse, Ledger } from "./types";

const ENV_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
const DEMO_SECRET = (import.meta.env.VITE_DEMO_SECRET as string | undefined) ?? "";

function baseUrl(): string {
  if (ENV_URL) return ENV_URL.replace(/\/$/, "");
  return "http://localhost:8004";
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (DEMO_SECRET) headers["x-demo-secret"] = DEMO_SECRET;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export function fetchLedger(sessionId: string): Promise<{ ledger: Ledger; emails: unknown[] }> {
  return request(`/ledger/${encodeURIComponent(sessionId)}`);
}

export function resetSession(sessionId: string): Promise<{ ok: boolean; ledger: Ledger }> {
  return request(`/reset/${encodeURIComponent(sessionId)}`, { method: "POST" });
}

export function sendChat(
  sessionId: string,
  messages: ChatMessage[],
): Promise<ChatResponse> {
  return request<ChatResponse>(`/chat`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, messages }),
  });
}

export function apiBaseUrl(): string {
  return baseUrl();
}
