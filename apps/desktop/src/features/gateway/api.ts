export interface GatewayStatus {
  connected: boolean;
  api_key: string;
  base_url: string;
  model: string;
  reasoning_effort: string | null;
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
  syncModels: () => request<{ models: string[]; count: number }>("/models/sync", { method: "POST" }),
  connect: (api_key: string, reasoning_effort: string) => request<GatewayStatus>("", {
    method: "PUT", body: JSON.stringify({ api_key, reasoning_effort: reasoning_effort || null }),
  }),
  disconnect: () => request<GatewayStatus>("", { method: "DELETE" }),
};
