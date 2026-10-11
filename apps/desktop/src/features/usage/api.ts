export interface TokenCounts {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
}

export interface UsageSummary {
  quota: { limit: number; used: number; remaining: number } | null;
  status: string;
  activated_at: string | null;
  expires_at: string | null;
  validity_days: number | null;
  usage: { total: TokenCounts & { requests: number; actual_cost: number; cache_hit_rate: number } };
}

export interface UsageRecord extends TokenCounts {
  id: number;
  created_at: string;
  model: string;
  reasoning_effort: string | null;
  actual_cost: number;
  cache_hit_rate: number;
  first_token_ms: number | null;
  duration_ms: number | null;
  output_tps: number | null;
}

export interface UsageRecords {
  items: UsageRecord[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface UsageFilters {
  model: string;
  start: string;
  end: string;
}

async function request<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/__byok-api__/api/gateway${path}`, { signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || "使用明细读取失败，请稍后重试");
  return body as T;
}

export const usageApi = {
  summary: (signal: AbortSignal) => request<UsageSummary>("/usage", signal),
  models: (signal: AbortSignal) => request<{ models: string[] }>("/models", signal),
  records: (page: number, filters: UsageFilters, signal: AbortSignal) => {
    const query = new URLSearchParams({ page: String(page), start_date: filters.start, end_date: filters.end, model: filters.model });
    return request<UsageRecords>(`/records?${query}`, signal);
  },
};
