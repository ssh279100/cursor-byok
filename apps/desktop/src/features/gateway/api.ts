export interface GatewayStatus {
  connected: boolean;
  base_url: string;
  model: string;
  reasoning_effort: string | null;
}

export interface Usage {
  quota: { limit: number; used: number; remaining: number } | null;
  status: string | null;
  usage: { today: { requests: number; actual_cost: number } } | null;
}

export interface UsageRecord {
  id: number;
  created_at: string;
  model: string;
  reasoning_effort: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  actual_cost: number;
  duration_ms: number | null;
}

export interface Records {
  items: UsageRecord[];
  total: number;
  page: number;
  pages: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/__byok-api__/api/gateway${path}`, {
    ...init,
    headers: { "content-type": "application/json" },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || "无法连接服务，请稍后重试");
  return body as T;
}

export const gateway = {
  status: () => request<GatewayStatus>(""),
  connect: (api_key: string, reasoning_effort: string) => request<GatewayStatus>("", {
    method: "PUT", body: JSON.stringify({ api_key, reasoning_effort: reasoning_effort || null }),
  }),
  disconnect: () => request<GatewayStatus>("", { method: "DELETE" }),
  usage: (signal: AbortSignal) => request<Usage>("/usage", { signal }),
  records: (page: number, start: string, end: string, signal: AbortSignal) => {
    const query = new URLSearchParams({ page: String(page), start_date: start, end_date: end });
    return request<Records>(`/records?${query}`, { signal });
  },
};
