import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { gateway, type GatewayStatus, type Records, type Usage, type UsageRecord } from "./api";
import { appStore } from "../../shared/store/appStore";
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
      setStatus(next); setKey(""); setPage(1);
      setNotice("Key 已保存。首次使用请完成 Cursor 配置，随后重启 Cursor 并选择宝马ai模型。");
      await appStore.refresh();
    } catch (cause) { setError(failure(cause)); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    active.current?.abort();
    setBusy(true); setError(""); setNotice(""); setSummary(null); setRecords(null);
    try {
      setStatus(await gateway.disconnect()); setKey(""); setEffort("");
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

  return <div className={styles.page}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>宝马ai</p><h1>我的服务</h1><p>填写 Key 即可使用，无需注册账号。</p></div>
      <span className={styles.badge}>{status?.connected ? "已配置" : "等待连接"}</span>
    </header>
    <Card className={styles.card}>
      <h2>{status?.connected ? "服务已配置" : "连接你的 Key"}</h2>
      <p>内置服务：ai.bmapi.me · gpt-6-sol</p>
      <form onSubmit={event => void connect(event)} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="gateway-key">API Key</label>
          <SecretTextInput id="gateway-key" value={key} onChange={event => setKey(event.target.value)}
            placeholder={status?.connected ? "输入新 Key 以更换，或重新输入以调整推理等级" : "粘贴管理员提供的 Key"}
            autoComplete="off" spellCheck={false} disabled={busy} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="gateway-effort">推理等级</label>
          <select id="gateway-effort" value={effort} onChange={event => setEffort(event.target.value)} disabled={busy}>
            <option value="">模型默认</option>
            {Object.entries(effortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy || !key.trim()}>{busy ? "处理中…" : status?.connected ? "验证并更换" : "验证并连接"}</Button>
          {status?.connected && <Button type="button" disabled={busy} onClick={() => void disconnect()}>移除 Key</Button>}
          <Link to="/harness/cursor">配置 Cursor →</Link>
        </div>
      </form>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </Card>
    {status?.connected && <>
      <div className={styles.metrics}>
        <Card className={styles.metric}><span>本 Key 剩余额度</span><strong>{money(summary?.quota?.remaining)}</strong><small>未设独立额度时不展示账户余额</small></Card>
        <Card className={styles.metric}><span>今日调用</span><strong>{summary?.usage?.today.requests?.toLocaleString() ?? "—"}</strong><small>当前 Key 的服务端统计</small></Card>
        <Card className={styles.metric}><span>今日扣费</span><strong>{money(summary?.usage?.today.actual_cost)}</strong><small>USD · 以服务端实际扣费为准</small></Card>
      </div>
      {summaryError && <p role="alert" className={styles.error}>{summaryError}</p>}
      <Card className={styles.card}>
        <div className={styles.sectionHeading}><div><h2>调用账单</h2><p>默认最近 30 天，仅显示当前 Key 的已入账记录。时间为北京时间。</p></div>
          <Button disabled={loading || busy} onClick={() => setRevision(value => value + 1)}>{loading ? "刷新中…" : "刷新账单"}</Button>
        </div>
        <form className={styles.filters} onSubmit={filter}>
          <label>开始日期<input aria-label="开始日期" type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
          <label>结束日期<input aria-label="结束日期" type="date" value={end} onChange={event => setEnd(event.target.value)} /></label>
          <Button type="submit" disabled={busy || loading}>查询</Button>
        </form>
        {recordsError ? <p role="alert" className={styles.error}>{recordsError}</p> : <div className={styles.tableWrap} aria-busy={loading}>
          <table><caption className={styles.caption}>调用明细，费用单位 USD</caption><thead><tr>
            <th scope="col">时间</th><th scope="col">模型</th><th scope="col">推理等级</th><th scope="col">Token</th><th scope="col" title="缓存读取 ÷（普通输入 + 缓存读取 + 缓存写入）">缓存率</th><th scope="col">扣费</th><th scope="col">耗时</th>
          </tr></thead><tbody>
            {records?.items.map(row => <tr key={row.id}>
              <td>{new Date(row.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</td>
              <td>{row.model}</td><td>{row.reasoning_effort ? effortLabels[row.reasoning_effort] ?? row.reasoning_effort : "未记录"}</td>
              <td><div>输入 {row.input_tokens.toLocaleString()} / 输出 {row.output_tokens.toLocaleString()}</div><small>缓存读取 {row.cache_read_tokens.toLocaleString()} / 写入 {row.cache_creation_tokens.toLocaleString()}</small></td>
              <td>{cacheRate(row)}</td><td>{money(row.actual_cost)}</td><td>{row.duration_ms == null ? "—" : `${(row.duration_ms / 1000).toFixed(2)} 秒`}</td>
            </tr>)}
            {!records?.items.length && <tr><td colSpan={7} className={styles.empty}>{loading ? "正在读取账单…" : "所选时间暂无已入账记录"}</td></tr>}
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
