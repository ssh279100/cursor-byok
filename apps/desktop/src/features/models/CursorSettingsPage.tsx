import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../shared/api";
import { appStore, useAppStore } from "../../shared/store/appStore";
import { PageContent } from "../../shell/layout/PageContent";
import { Card } from "../../shared/ui/Card";
import { Button } from "../../shared/ui/Button";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import styles from "../gateway/GatewayPage.module.scss";

export function CursorSettingsPage() {
  const { models, cursorHarness, cursorBusy } = useAppStore();
  const [command, setCommand] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const model = models.find(item => item.group_name === "宝马ai" && item.base_url === "https://ai.bmapi.me");
  const ready = cursorHarness?.ca === "ready";
  const enabled = cursorHarness?.settings_applied ?? false;

  async function initialize() {
    setError("");
    const status = await appStore.initializeCursorCa();
    if (status?.ca_install_command && status.ca !== "ready") setCommand(status.ca_install_command);
  }
  async function openTerminal() {
    if (!command) return;
    try { await api.copyCursorText(command); await api.openCursorCaInstallTerminal(command); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    setCommand(null);
  }
  async function test() {
    if (!model) return;
    setTesting(true); setError(""); setResult("");
    try {
      const next = await api.testModel(model.model_hash, crypto.randomUUID());
      setResult(`模型连接成功，耗时 ${(next.duration_ms / 1000).toFixed(2)} 秒。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setTesting(false); }
  }
  const content = <div className={styles.page}>
    <Card className={styles.card}>
      <h2>1. 连接服务</h2>
      <p>{model ? "已配置：宝马ai · gpt-6-sol" : "请先到“我的服务”填写管理员提供的 Key。"}</p>
      <Link to="/">前往我的服务 →</Link>
    </Card>
    <Card className={styles.card}>
      <h2>2. 初始化本地证书</h2>
      <p>{ready ? "本地证书已就绪。" : "首次使用需要初始化并信任本地证书，以便代理 Cursor 请求。"}</p>
      <div className={styles.actions}>
        {!ready && <Button disabled={cursorBusy} onClick={() => void initialize()}>初始化 / 安装证书</Button>}
        <Button disabled={cursorBusy} onClick={() => void appStore.refresh()}>刷新证书状态</Button>
      </div>
    </Card>
    <Card className={styles.card}>
      <h2>3. 开启 Cursor 接管</h2>
      <p>当前状态：{enabled ? "已开启" : "未开启"}。首次开启后，请完全退出并重启 Cursor，新开对话并选择“宝马ai · gpt-6-sol”，不要选择 Auto。</p>
      <div className={styles.actions}>
        <Button variant="primary" disabled={cursorBusy || (!enabled && (!ready || !model))} onClick={() => enabled ? setConfirmDisable(true) : void appStore.setCursorEnabled(true)}>{enabled ? "关闭接管" : "开启接管"}</Button>
        <Button disabled={!model || testing} onClick={() => void test()}>{testing ? "测试中…" : "测试模型连接"}</Button>
      </div>
      <p>模型连接测试会产生少量用量，以服务端实际扣费为准。</p>
      {result && <p role="status">{result}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </Card>
  </div>;
  return <>
    <PageContent title="Cursor 配置" fixed sections={[{ key: "setup", estimatedHeight: 650, content }]} />
    <ConfirmDialog open={command !== null} title="安装本地证书" cancelLabel="取消" confirmLabel="复制命令并打开终端" onCancel={() => setCommand(null)} onConfirm={() => void openTerminal()}>
      <p>在终端中粘贴以下命令，按系统提示完成授权后刷新证书状态。</p><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{command}</pre>
    </ConfirmDialog>
    <ConfirmDialog open={confirmDisable} title="关闭 Cursor 接管？" cancelLabel="取消" confirmLabel="关闭接管" onCancel={() => setConfirmDisable(false)} onConfirm={() => { setConfirmDisable(false); void appStore.setCursorEnabled(false); }}>
      <p>关闭后会移除 Cursor 本地代理配置。</p>
    </ConfirmDialog>
  </>;
}
