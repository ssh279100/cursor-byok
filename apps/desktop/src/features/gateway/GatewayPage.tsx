import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { gateway, type GatewayStatus, type Records, type Usage, type UsageRecord } from "./api";
import { appStore, useAppStore } from "../../shared/store/appStore";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { SecretTextInput } from "../../shared/ui/FormControls";
import styles from "./GatewayPage.module.scss";

const money = (value: number | undefined) => value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(value);
const failure = (error: unknown) => error instanceof Error ? error.message : "请求失败，请重试";
const effortLabels: Record<string, string> = { low: "低", medium: "中", high: "高", xhigh: "超高" };

// 与 sub2api 保持相同口径，输出 Token 不参与缓存命中率计算。
function cacheRate(row: UsageRecord): string {
  const tokens = [row.input_tokens, row.cache_read_tokens, row.cache_creation_tokens];
  if (tokens.some(value => !Number.isFinite(value) || value < 0)) return "—";
  const total = tokens.reduce((sum, value) => sum + value, 0);
  return total > 0 ? `${(row.cache_read_tokens / total * 100).toFixed(1)}%` : "—";
}

export function GatewayPage() {
  const { models } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [modelNotice, setModelNotice] = useState("");
  const [modelError, setModelError] = useState("");
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [key, setKey] = useState("");
  const [effort, setEffort] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [summary, setSummary] = useState<Usage | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [records, setRecords] = useState<Records | null>(null);
  const [recordsError, setRecordsError] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dates, setDates] = useState({ start: "", end: "" });
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    let disposed = false;
    gateway.status().then(next => {
      if (disposed) return;
      setStatus(next);
      setEffort(next.reasoning_effort ?? "");
    }).catch(cause => { if (!disposed) setError(failure(cause)); });
    return () => { disposed = true; active.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!status?.connected || busy) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setSummaryError("");
    setRecordsError("");
    // 汇总和明细独立处理，后端未部署明细接口时仍可查看已有用量。
    void Promise.allSettled([
      gateway.usage(controller.signal).then(next => { if (!controller.signal.aborted) setSummary(next); }).catch(cause => {
        if (!controller.signal.aborted) { setSummary(null); setSummaryError(failure(cause)); }
      }),
      gateway.records(page, dates.start, dates.end, controller.signal).then(next => {
        if (!controller.signal.aborted) setRecords(next);
      }).catch(cause => {
        if (!controller.signal.aborted) { setRecords(null); setRecordsError(failure(cause)); }
      }),
    ]).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, page, dates, revision, busy]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    active.current?.abort();
    setSummary(null); setRecords(null); setError(""); setNotice(""); setBusy(true);
    try {
      const next = await gateway.connect(key.trim(), effort);
      setStatus(next); setKey(""); setPage(1); setEditing(false); setModelNotice("");
      setNotice("Key 已保存。");
      await appStore.refresh();
    } catch (cause) { setError(failure(cause)); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    active.current?.abort();
    setBusy(true); setError(""); setNotice(""); setSummary(null); setRecords(null);
    try {
      setStatus(await gateway.disconnect()); setKey(""); setEffort(""); setEditing(false); setModelNotice("");
      setNotice("已移除本机保存的 Key。");
      await appStore.refresh();
    } catch (cause) { setError(failure(cause)); }
    finally { setBusy(false); }
  }

  function filter(event: FormEvent) {
    event.preventDefault();
    if ((start && !end) || (!start && end) || (start && end && start > end)) {
      setRecordsError("请选择完整且正确的日期范围。"); return;
    }
    setPage(1); setDates({ start, end });
  }

  async function syncModels() {
    setSyncing(true); setModelError(""); setModelNotice("");
    try {
      const result = await gateway.syncModels();
      await appStore.refresh();
      setModelNotice(`已保存 ${result.count} 个模型，重新打开 Cursor 后可在宝马ai分组选择。`);
    } catch (cause) { setModelError(failure(cause)); }
    finally { setSyncing(false); }
  }
  const managedModels = models.filter(model => model.group_name === "宝马ai" && model.base_url === "https://ai.bmapi.me");
  const expiry = summary?.expires_at ? new Date(summary.expires_at) : null;
  const validExpiry = expiry !== null && Number.isFinite(expiry.getTime());
  const expired = summary?.status === "expired" || (validExpiry && expiry.getTime() <= Date.now());
  const expiryLabel = !summary || !summary.expiry_known ? "—" : validExpiry
    ? expiry.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
    : summary.expires_at ? "—" : "长期有效";
  const remaining = summary?.quota?.remaining;
  const quotaPercent = summary?.quota && summary.quota.limit > 0 ? Math.max(0, Math.min(100, summary.quota.remaining / summary.quota.limit * 100)) : 0;

  return <div className={`${styles.page} ${styles.dashboard}`}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>宝马ai / 服务中心</p><h1>我的服务</h1></div>
      <Link className={styles.launchLink} to="/harness/cursor">启动 Cursor 服务 →</Link>
    </header>
    {status?.connected && <div className={styles.connectionBar}>
      <span className={styles.connectionInfo}><span className={styles.liveDot} /> Key 已连接 <small>ai.bmapi.me · {managedModels.length} 个模型</small></span>
      <div className={styles.actions}>
        <Button disabled={busy || syncing} onClick={() => void syncModels()}>{syncing ? "正在获取…" : "获取可用模型"}</Button>
        <Button disabled={busy || syncing} aria-expanded={editing} aria-controls="key-settings" onClick={() => setEditing(value => !value)}>{editing ? "收起设置" : "Key 设置"}</Button>
      </div>
    </div>}
    {modelNotice && <p role="status" className={styles.inlineNotice}>{modelNotice}</p>}
    {modelError && <p role="alert" className={styles.error}>{modelError}</p>}
    {status?.connected && managedModels.length > 1 && <details className={styles.modelList}><summary>查看已配置模型 · {managedModels.length}</summary><div>{managedModels.map(model => <span key={model.model_hash}>{model.model_id}</span>)}</div></details>}
    {(!status?.connected || editing) && <Card className={styles.card} id="key-settings">
      <h2>{status?.connected ? "Key 设置" : "连接你的 Key"}</h2>
      <form onSubmit={event => void connect(event)} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="gateway-key">API Key</label>
          <SecretTextInput id="gateway-key" value={key} onChange={event => setKey(event.target.value)}
            placeholder={status?.connected ? "输入 Key 以更换或调整推理等级" : "粘贴管理员提供的 Key"}
            autoComplete="off" spellCheck={false} disabled={busy || syncing} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="gateway-effort">推理等级</label>
          <select id="gateway-effort" value={effort} onChange={event => setEffort(event.target.value)} disabled={busy || syncing}>
            <option value="">模型默认</option>
            {Object.entries(effortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy || syncing || !key.trim()}>{busy ? "处理中…" : status?.connected ? "验证并更换" : "验证并连接"}</Button>
          {status?.connected && <Button type="button" disabled={busy || syncing} onClick={() => void disconnect()}>移除 Key</Button>}
        </div>
      </form>
    </Card>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && !status?.connected && <p role="status">{notice}</p>}
    {status?.connected && <>
      <div className={styles.metrics}>
        <Card className={`${styles.metric} ${styles.quotaMetric}`}>
          <span>可用额度 <small>USD</small></span>
          <strong title={money(remaining)}>{remaining == null ? "—" : `$${remaining.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}</strong>
          <div className={styles.quotaTrack} role="progressbar" aria-label="额度剩余比例" aria-valuenow={Math.round(quotaPercent)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${quotaPercent}%` }} /></div>
          <small>{summary?.quota ? `总额度 ${money(summary.quota.limit)} · 已用 ${money(summary.quota.used)}` : summary ? "未设置独立额度" : "正在读取额度"}</small>
        </Card>
        <Card className={`${styles.metric} ${styles.expiryMetric} ${expired ? styles.expired : ""}`}>
          <span>到期时间 {expired && <small>已到期</small>}</span><strong>{expiryLabel}</strong>
          <small>{validExpiry ? `${expiry.toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间）` : summary?.expiry_known && !summary.expires_at ? "此 Key 未设置到期时间" : "以服务端返回为准"}</small>
        </Card>
        <Card className={styles.metric}><span>今日调用</span><strong>{summary?.usage?.today?.requests?.toLocaleString() ?? "—"}</strong><small>次请求</small></Card>
        <Card className={styles.metric}><span>今日扣费</span><strong className={styles.costNumber}>{money(summary?.usage?.today?.actual_cost)}</strong><small>USD · 实际扣费</small></Card>
      </div>
      {summaryError && <p role="alert" className={styles.error}>{summaryError}</p>}
      <Card className={`${styles.card} ${styles.ledger}`}>
        <div className={styles.sectionHeading}><div><h2>调用账单 <span className={styles.countBadge}>{records?.total ?? "—"}</span></h2><p>最近 30 天 · 北京时间 · 费用 USD</p></div>
          <form className={styles.filters} onSubmit={filter}>
            <input aria-label="开始日期" type="date" value={start} onChange={event => setStart(event.target.value)} />
            <span aria-hidden="true">—</span>
            <input aria-label="结束日期" type="date" value={end} onChange={event => setEnd(event.target.value)} />
            <Button type="submit" disabled={busy || loading}>查询</Button>
            <Button type="button" disabled={loading || busy} onClick={() => setRevision(value => value + 1)}>{loading ? "刷新中…" : "刷新账单"}</Button>
          </form>
        </div>
        {recordsError ? <p role="alert" className={styles.error}>{recordsError}</p> : <div className={styles.tableWrap} aria-busy={loading} tabIndex={0} role="region" aria-label="调用明细">
          <table><thead><tr>
            <th scope="col">调用时间</th><th scope="col">模型</th><th scope="col">推理</th><th scope="col">输入 / 输出</th><th scope="col">缓存读 / 写</th><th scope="col" title="缓存读取 ÷ 全部输入 Token">缓存率</th><th scope="col">扣费</th><th scope="col">耗时</th>
          </tr></thead><tbody>
            {records?.items.map(row => <tr key={row.id}>
              <td>{new Date(row.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</td>
              <td><span className={styles.modelTag}>{row.model}</span></td><td>{row.reasoning_effort ? effortLabels[row.reasoning_effort] ?? row.reasoning_effort : "未记录"}</td>
              <td>{row.input_tokens.toLocaleString()} <span className={styles.divider}>/</span> {row.output_tokens.toLocaleString()}</td>
              <td>{row.cache_read_tokens.toLocaleString()} <span className={styles.divider}>/</span> {row.cache_creation_tokens.toLocaleString()}</td>
              <td><span className={styles.cachePill}>{cacheRate(row)}</span></td><td className={styles.moneyCell}>{money(row.actual_cost)}</td><td>{row.duration_ms == null ? "—" : `${(row.duration_ms / 1000).toFixed(2)} 秒`}</td>
            </tr>)}
            {!records?.items.length && <tr><td colSpan={8} className={styles.empty}>{loading ? "正在读取账单…" : "所选时间暂无已入账记录"}</td></tr>}
          </tbody></table>
        </div>}
        <div className={styles.pagination}>
          <span>{records ? `共 ${records.total} 条 · 第 ${page} / ${Math.max(1, records.pages)} 页` : ""}</span>
          <Button disabled={busy || loading || page <= 1} onClick={() => setPage(value => value - 1)}>上一页</Button>
          <Button disabled={busy || loading || !records || page >= records.pages} onClick={() => setPage(value => value + 1)}>下一页</Button>
        </div>
      </Card>
    </>}
  </div>;
}
