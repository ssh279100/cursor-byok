import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { gateway } from "../gateway/api";
import { usageApi, type UsageFilters, type UsageRecord, type UsageRecords, type UsageSummary } from "./api";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import styles from "./UsagePage.module.scss";

const number = (value: number | undefined) => value == null ? "—" : value.toLocaleString("zh-CN");
const money = (value: number | undefined) => value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(value);
const percent = (value: number | undefined) => value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
const failure = (error: unknown) => error instanceof Error ? error.message : "请求失败，请重试";
const efforts: Record<string, string> = { none: "无", minimal: "最低", low: "低", medium: "中", high: "高", xhigh: "超高" };
const statuses: Record<string, string> = { active: "可用", expired: "已到期", quota_exhausted: "额度已用完", quota_exceeded: "额度已用完", disabled: "已停用" };

function recentDates(): UsageFilters {
  const end = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
  const start = new Date(new Date(`${end}T00:00:00Z`).getTime() - 29 * 86400000).toISOString().slice(0, 10);
  return { model: "", start, end };
}

function time(value: string, dateOnly = false): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    ...(!dateOnly && { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
  });
}

function duration(value: number | null) {
  if (value == null || !Number.isFinite(value) || value < 0) return "—";
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(2)}s`;
}

function latencyColor(value: number | null, thresholds: number[]) {
  if (value == null || !Number.isFinite(value) || value < 0) return "var(--usage-muted)";
  if (value >= thresholds[2]) return "var(--vscode-errorForeground)";
  if (value >= thresholds[1]) return "var(--usage-orange)";
  if (value >= thresholds[0]) return "var(--usage-amber)";
  return "var(--usage-green)";
}

function TokenDetails({ row }: { row: UsageRecord }) {
  return <div className={styles.tokenStack}>
    <span className={styles.tokenSummary}>合计 <strong className={styles.tokenTotal}>{number(row.total_tokens)}</strong></span>
    <span className={styles.tokenSummary}>缓存命中 <strong className={styles.cacheRate}>{percent(row.cache_hit_rate)}</strong></span>
    <dl className={styles.detailStack}>
      <dt>输入</dt><dd>{number(row.input_tokens)}</dd>
      <dt>输出</dt><dd>{number(row.output_tokens)}</dd>
    </dl>
    <dl className={styles.detailStack}>
      <dt>缓存读取</dt><dd>{number(row.cache_read_tokens)}</dd>
      <dt>缓存写入</dt><dd>{number(row.cache_creation_tokens)}</dd>
    </dl>
  </div>;
}

function LatencyDetails({ row }: { row: UsageRecord }) {
  // 与 sub 的延迟分档一致：首字 10/30/60 秒，总耗时 60/180/300 秒。
  const firstColor = latencyColor(row.first_token_ms, [10000, 30000, 60000]);
  const durationColor = latencyColor(row.duration_ms, [60000, 180000, 300000]);
  const rate = row.output_tps != null && Number.isFinite(row.output_tps) && row.output_tps >= 0 ? `${row.output_tps.toFixed(1)} tok/s` : "—";
  return <div className={styles.latency} style={{ "--latency-first": firstColor, "--latency-duration": durationColor } as CSSProperties}>
    <dl className={styles.detailStack}>
      <dt>首字</dt><dd style={{ color: firstColor }}>{duration(row.first_token_ms)}</dd>
      <dt>总耗时</dt><dd style={{ color: durationColor }}>{duration(row.duration_ms)}</dd>
      <dt title="输出 Token ÷ 完整调用耗时，包含首字等待时间">输出 TPS</dt><dd>{rate}</dd>
    </dl>
  </div>;
}

export function UsagePage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState("");
  const [records, setRecords] = useState<UsageRecords | null>(null);
  const [recordsError, setRecordsError] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<UsageFilters>(recentDates);
  const [filters, setFilters] = useState(draft);
  const [filterError, setFilterError] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let disposed = false;
    setConnectionError("");
    gateway.status().then(status => { if (!disposed) setConnected(status.connected); })
      .catch(cause => { if (!disposed) setConnectionError(failure(cause)); });
    return () => { disposed = true; };
  }, [revision]);

  // 累计汇总不受表格筛选影响；请求结束后只更新仍在使用的页面。
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    setSummaryLoading(true); setSummary(null); setSummaryError(""); setModelsError("");
    void Promise.allSettled([
      usageApi.summary(controller.signal).then(data => { if (!controller.signal.aborted) setSummary(data); })
        .catch(cause => { if (!controller.signal.aborted) setSummaryError(failure(cause)); }),
      usageApi.models(controller.signal).then(data => { if (!controller.signal.aborted) setModels(data.models); })
        .catch(cause => { if (!controller.signal.aborted) { setModels([]); setModelsError(failure(cause)); } }),
    ]).finally(() => { if (!controller.signal.aborted) setSummaryLoading(false); });
    return () => controller.abort();
  }, [connected, revision]);

  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    setLoading(true); setRecords(null); setRecordsError("");
    void usageApi.records(page, filters, controller.signal)
      .then(data => { if (!controller.signal.aborted) setRecords(data); })
      .catch(cause => { if (!controller.signal.aborted) setRecordsError(failure(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [connected, page, filters, revision]);

  function query(event: FormEvent) {
    event.preventDefault();
    if (!draft.start || !draft.end || draft.start > draft.end) {
      setFilterError("请选择完整且正确的日期范围。");
      return;
    }
    setFilterError(""); setPage(1); setFilters({ ...draft });
  }

  function reset() {
    const next = recentDates();
    setDraft(next); setFilters(next); setPage(1); setFilterError("");
  }

  const total = summary?.usage.total;
  const expiry = summary?.expires_at ? new Date(summary.expires_at) : null;
  const validExpiry = expiry != null && Number.isFinite(expiry.getTime());
  const pending = !!summary && (summary.validity_days ?? 0) > 0 && !summary.activated_at && !summary.expires_at;
  const expired = summary?.status === "expired" || (validExpiry && expiry.getTime() <= Date.now());
  const expiryLabel = !summary ? "—" : pending ? "待激活" : validExpiry ? time(summary.expires_at!, true) : "长期有效";
  const expiryNote = pending ? `首次成功调用后有效 ${summary!.validity_days} 天` : expired ? "已到期 · 历史账单仍可查询"
    : validExpiry ? `剩余 ${Math.max(1, Math.ceil((expiry.getTime() - Date.now()) / 86400000))} 天 · ${time(summary!.expires_at!).split(" ")[1]} 到期`
    : summary ? "此 Key 未设置到期时间" : "正在读取有效期";
  const remaining = summary?.quota?.remaining;
  const used = summary?.quota?.used ?? total?.actual_cost;
  const quotaPercent = summary?.quota && summary.quota.limit > 0 ? Math.max(0, Math.min(100, summary.quota.remaining / summary.quota.limit * 100)) : 0;
  const busy = loading || summaryLoading;

  return <div className={styles.page}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>宝马ai / 使用记录</p><h1>使用明细</h1><p>当前 Key 的额度与调用账单</p></div>
      <Button disabled={busy} onClick={() => setRevision(value => value + 1)}>{busy ? "刷新中…" : "刷新明细"}</Button>
    </header>
    {connectionError && <p role="alert" className={styles.error}>{connectionError}</p>}
    {connected === null && !connectionError && <p role="status">正在读取连接状态…</p>}
    {connected === false && <Card className={styles.disconnected}>
      <h2>连接 Key 后查看使用明细</h2><p>请先在“我的服务”中保存管理员提供的 Key。</p>
      <Link className={styles.link} to="/">前往我的服务 →</Link>
    </Card>}
    {connected && <>
      <div className={styles.scopeBar}>
        <span><i aria-hidden="true" /> 按当前 Key 统计</span>
        <span>{pending ? "待激活" : expired ? "已到期" : summary ? statuses[summary.status] ?? summary.status : "正在读取"} · 累计汇总</span>
      </div>
      <section className={styles.metrics} aria-label="当前 Key 累计使用情况" aria-busy={summaryLoading}>
        <Card className={`${styles.metric} ${styles.available}`}>
          <span className={styles.metricLabel}>可用额度 <small>USD</small></span>
          <strong title={money(remaining)}>{!summary ? "—" : summary.quota ? money(remaining) : "未设限"}</strong>
          {summary?.quota ? <><div className={styles.quotaTrack} role="progressbar" aria-label="额度剩余比例" aria-valuenow={Math.round(quotaPercent)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${quotaPercent}%` }} /></div><small>总额度 {money(summary.quota.limit)}</small></> : <small>{summary ? "未设置 Key 独立限额" : "正在读取额度"}</small>}
        </Card>
        <Card className={`${styles.metric} ${styles.used}`}>
          <span className={styles.metricLabel}>已用额度 <small>USD</small></span>
          <strong title={money(used)}>{money(used)}</strong>
          <small>累计实际扣费 · {number(total?.requests)} 次调用</small>
        </Card>
        <Card className={`${styles.metric} ${styles.expiry} ${expired ? styles.expired : ""}`}>
          <span className={styles.metricLabel}>到期时间 <small>北京时间</small></span>
          <strong>{expiryLabel}</strong><small>{expiryNote}</small>
        </Card>
        <Card className={`${styles.metric} ${styles.tokens}`}>
          <span className={styles.metricLabel}>总 Token</span><strong>{number(total?.total_tokens)}</strong>
          <small>输入、输出与缓存合计</small>
        </Card>
        <Card className={`${styles.metric} ${styles.cache}`}>
          <span className={styles.metricLabel}>缓存命中率</span><strong>{percent(total?.cache_hit_rate)}</strong>
          <small>读取 {number(total?.cache_read_tokens)} · 写入 {number(total?.cache_creation_tokens)}</small>
        </Card>
      </section>
      {summaryError && <p role="alert" className={styles.error}>{summaryError}</p>}
      <Card className={styles.ledger}>
        <div className={styles.sectionHeading}><div><h2>模型调用详情 <span className={styles.count}>{records?.total ?? "—"}</span></h2><p>北京时间 · 费用 USD · 日期含首尾两天</p></div></div>
        <form className={styles.filters} onSubmit={query}>
          <div className={styles.filterField}><label htmlFor="usage-model">模型</label>
            <select id="usage-model" value={draft.model} onChange={event => setDraft(value => ({ ...value, model: event.target.value }))}>
              <option value="">全部模型</option>
              {Array.from(new Set([...models, ...(draft.model ? [draft.model] : [])])).map(model => <option key={model} value={model}>{model}</option>)}
            </select>
          </div>
          <label htmlFor="usage-start">开始日期<input id="usage-start" type="date" value={draft.start} onChange={event => setDraft(value => ({ ...value, start: event.target.value }))} aria-invalid={!!filterError} aria-describedby={filterError ? "usage-filter-error" : undefined} /></label>
          <label htmlFor="usage-end">结束日期<input id="usage-end" type="date" value={draft.end} onChange={event => setDraft(value => ({ ...value, end: event.target.value }))} aria-invalid={!!filterError} aria-describedby={filterError ? "usage-filter-error" : undefined} /></label>
          <div className={styles.filterActions}><Button type="submit" variant="primary" disabled={loading}>{loading ? "查询中…" : "查询"}</Button><Button type="button" disabled={loading} onClick={reset}>重置</Button></div>
        </form>
        {filterError && <p id="usage-filter-error" role="alert" className={styles.error}>{filterError}</p>}
        {modelsError && <p role="alert" className={styles.error}>模型筛选列表读取失败：{modelsError}</p>}
        {recordsError ? <p role="alert" className={styles.error}>{recordsError}</p> : <div className={styles.tableWrap} aria-busy={loading} tabIndex={0} role="region" aria-label="模型调用明细">
          <table><thead><tr><th scope="col">模型名</th><th scope="col">推理等级</th><th scope="col">Token 计数</th><th scope="col">扣费</th><th scope="col">延迟</th><th scope="col">时间</th></tr></thead><tbody>
            {records?.items.map(row => <tr key={row.id}>
              <td><span className={styles.modelName}>{row.model}</span></td>
              <td><span className={styles.effort}>{row.reasoning_effort ? efforts[row.reasoning_effort] ?? row.reasoning_effort : "未记录"}</span></td>
              <td><TokenDetails row={row} /></td>
              <td className={styles.moneyCell}>{money(row.actual_cost)}</td>
              <td><LatencyDetails row={row} /></td><td className={styles.timeCell}>{time(row.created_at)}</td>
            </tr>)}
            {!records?.items.length && <tr><td colSpan={6} className={styles.empty}>{loading ? "正在读取使用明细…" : "当前筛选条件暂无已入账记录"}</td></tr>}
          </tbody></table>
        </div>}
        <div className={styles.pagination}>
          <span role="status">{records ? `共 ${records.total} 条 · 第 ${records.page} / ${Math.max(1, records.pages)} 页` : ""}</span>
          <Button disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>上一页</Button>
          <Button disabled={loading || !records || page >= records.pages} onClick={() => setPage(value => value + 1)}>下一页</Button>
        </div>
      </Card>
      <p className={styles.footnote}>缓存命中率 = 缓存读取 ÷（输入 + 缓存读取 + 缓存写入）。总 Token 已包含缓存；输出 TPS 按完整耗时计算。查询不会激活 Key，也不会扣费。</p>
    </>}
  </div>;
}
