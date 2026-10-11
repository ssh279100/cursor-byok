import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { gateway, type GatewayStatus } from "./api";
import { appStore, useAppStore } from "../../shared/store/appStore";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { SecretTextInput } from "../../shared/ui/FormControls";
import styles from "./GatewayPage.module.scss";

const failure = (error: unknown) => error instanceof Error ? error.message : "请求失败，请重试";
const effortLabels: Record<string, string> = { low: "低", medium: "中", high: "高", xhigh: "超高" };

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

  useEffect(() => {
    let disposed = false;
    gateway.status().then(next => {
      if (disposed) return;
      setStatus(next);
      setEffort(next.reasoning_effort ?? "");
    }).catch(cause => { if (!disposed) setError(failure(cause)); });
    return () => { disposed = true; };
  }, []);

  async function connect(event: FormEvent) {
    event.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      const next = await gateway.connect(key.trim(), effort);
      setStatus(next); setKey(""); setEditing(false); setModelNotice("");
      setNotice("Key 已保存。");
      await appStore.refresh();
    } catch (cause) { setError(failure(cause)); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setError(""); setNotice("");
    try {
      setStatus(await gateway.disconnect()); setKey(""); setEffort(""); setEditing(false); setModelNotice("");
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
  const managedModels = models.filter(model => model.group_name === "宝马ai" && model.base_url === "https://ai.bmapi.me");

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
    {status?.connected && <Card className={styles.card}>
      <div className={styles.sectionHeading}>
        <div><h2>查看当前 Key 的使用情况</h2><p>额度、有效期和模型调用账单已集中到使用明细页面。</p></div>
        <Link className={styles.launchLink} to="/usage">查看使用明细 →</Link>
      </div>
    </Card>}
  </div>;
}
