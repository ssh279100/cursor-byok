import { useEffect, useRef, useState, type FormEvent } from "react";
import { gateway, type GatewayStatus } from "./api";
import { appStore, useAppStore } from "../../shared/store/appStore";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { TextInput } from "../../shared/ui/FormControls";
import styles from "./GatewayPage.module.scss";

const failure = (error: unknown) => error instanceof Error ? error.message : "请求失败，请重试";
const effortLabels: Record<string, string> = { low: "低", medium: "中", high: "高", xhigh: "超高" };

export function GatewayPage() {
  const { models, cursorHarness, cursorBusy } = useAppStore();
  const autoStartAttempted = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [modelNotice, setModelNotice] = useState("");
  const [modelError, setModelError] = useState("");
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState("");
  const [effort, setEffort] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let disposed = false;
    gateway.status().then(next => {
      if (disposed) return;
      setStatus(next);
      setKey(next.api_key);
      setEffort(next.reasoning_effort ?? "");
    }).catch(cause => { if (!disposed) setError(failure(cause)); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, []);

  const enabled = cursorHarness?.integration === "enabled" && cursorHarness.settings_applied;

  // 首次连接后按默认设置开启；手动关闭后沿用本机保存的选择。
  useEffect(() => {
    if (!status?.connected || !cursorHarness || busy || cursorBusy || autoStartAttempted.current) return;
    autoStartAttempted.current = true;
    if (cursorHarness.takeover_enabled && !enabled) void appStore.setCursorEnabled(true);
  }, [status, cursorHarness, enabled, busy, cursorBusy]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      const next = await gateway.connect(key.trim(), effort);
      setStatus(next); setKey(next.api_key); setModelNotice("");
      autoStartAttempted.current = false;
      setNotice("Key 已保存。");
      await appStore.refresh();
    } catch (cause) { setError(failure(cause)); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setError(""); setNotice("");
    try {
      setStatus(await gateway.disconnect()); setKey(""); setEffort(""); setModelNotice("");
      setNotice("已移除本机保存的 Key。");
      await appStore.refresh();
    } catch (cause) { setError(failure(cause)); }
    finally { setBusy(false); }
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
  const managedModels = models.filter(model => model.group_name === "宝马ai" && model.base_url === "https://cs.bmapi.me");

  return <div className={`${styles.page} ${styles.dashboard}`}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>宝马ai / 服务中心</p><h1>我的服务</h1></div>
      <button type="button" className={`${styles.proxySwitch} ${enabled ? styles.proxyRunning : ""}`}
        aria-pressed={enabled} aria-busy={cursorBusy}
        disabled={loading || busy || cursorBusy || !cursorHarness || (!enabled && !status?.connected)}
        onClick={() => void appStore.setCursorEnabled(!enabled)}>
        <span className={styles.switchTrack} aria-hidden="true"><span /></span>
        {cursorBusy ? "代理服务处理中…" : enabled ? "代理服务已开启" : "开启代理服务"}
      </button>
    </header>
    {status?.connected && <div className={styles.connectionBar}>
      <span className={styles.connectionInfo}><span className={styles.liveDot} /> Key 已连接 <small>cs.bmapi.me · {managedModels.length} 个模型</small></span>
      <div className={styles.actions}>
        <Button disabled={busy || syncing} onClick={() => void syncModels()}>{syncing ? "正在获取…" : "获取可用模型"}</Button>
      </div>
    </div>}
    {modelNotice && <p role="status" className={styles.inlineNotice}>{modelNotice}</p>}
    {modelError && <p role="alert" className={styles.error}>{modelError}</p>}
    <section className={styles.modelList} aria-label="可用模型">
      <h2>可用模型 <small>· {managedModels.length}</small></h2>
      <div>{managedModels.length ? managedModels.map(model => <span key={model.model_hash}>{model.model_id}</span>) : <p>连接 Key 后获取可用模型。</p>}</div>
    </section>
    <Card className={`${styles.card} ${styles.keyCard}`} id="key-settings">
      <h2>{status?.connected ? "Key 设置" : "连接你的 Key"}</h2>
      <form onSubmit={event => void connect(event)} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="gateway-key">API Key</label>
          <TextInput id="gateway-key" type="text" value={key} onChange={event => setKey(event.target.value)}
            placeholder="输入你购买的 Key"
            autoComplete="off" spellCheck={false} disabled={loading || busy || syncing} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="gateway-effort">推理等级</label>
          <select id="gateway-effort" value={effort} onChange={event => setEffort(event.target.value)} disabled={loading || busy || syncing}>
            <option value="">模型默认</option>
            {Object.entries(effortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={loading || busy || syncing || cursorBusy || !key.trim()}>{loading ? "加载设置…" : busy ? "处理中…" : "验证连接"}</Button>
          {status?.connected && <Button type="button" disabled={busy || syncing} onClick={() => void disconnect()}>移除 Key</Button>}
        </div>
      </form>
    </Card>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && !status?.connected && <p role="status" className={styles.inlineNotice}>{notice}</p>}
    <section className={styles.guide} aria-label="使用步骤">
      <h2>使用步骤</h2>
      <ol>
        <li><span>01</span><div>输入你买的 Key，点击<strong>验证连接</strong>。</div></li>
        <li><span>02</span><div>开启<strong>代理服务</strong>，首次连接后默认开启。</div></li>
        <li><span>03</span><div>打开 Cursor，在模型选择里关闭 <strong>Auto</strong>。</div></li>
        <li><span>04</span><div>手动选择 API 的模型，即可使用。</div></li>
      </ol>
    </section>
  </div>;
}
