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
  const [error, setError] = useState("");
  const model = models.find(item => item.group_name === "宝马ai" && item.base_url === "http://154.201.79.53:8080");
  const ready = cursorHarness?.ca === "ready";
  const automatic = cursorHarness?.platform === "windows";
  const enabled = cursorHarness?.integration === "enabled" && cursorHarness.settings_applied;

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
  const content = <div className={styles.page}>
    {!model && <Card className={styles.card}>
      <Link to="/">请先填写 Key →</Link>
    </Card>}
    {!automatic && <Card className={styles.card}>
      <h2>2. 初始化本地证书</h2>
      <p>{ready ? "本地证书已就绪。" : "首次使用需要初始化并信任本地证书，以便代理 Cursor 请求。"}</p>
      <div className={styles.actions}>
        {!ready && <Button disabled={cursorBusy} onClick={() => void initialize()}>初始化 / 安装证书</Button>}
        <Button disabled={cursorBusy} onClick={() => void appStore.refresh()}>刷新证书状态</Button>
      </div>
    </Card>}
    <Card className={`${styles.card} ${styles.serviceCard}`}>
      <button type="button" className={`${styles.serviceButton} ${enabled ? styles.serviceRunning : ""}`}
        aria-pressed={enabled} aria-busy={cursorBusy}
        disabled={cursorBusy || !cursorHarness || (!enabled && ((!automatic && !ready) || !model))}
        onClick={() => enabled ? setConfirmDisable(true) : void appStore.setCursorEnabled(true)}>
        <span className={styles.serviceDot} aria-hidden="true" />
        {cursorBusy ? "处理中…" : enabled ? "服务运行中 · 点击停止" : "点击启动服务"}
      </button>
      <p>点击启动服务，再打开 Cursor 选择宝马ai里的模型即可使用。</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </Card>
  </div>;
  return <>
    <PageContent title="Cursor 配置" fixed sections={[{ key: "setup", estimatedHeight: 350, content }]} />
    <ConfirmDialog open={command !== null} title="安装本地证书" cancelLabel="取消" confirmLabel="复制命令并打开终端" onCancel={() => setCommand(null)} onConfirm={() => void openTerminal()}>
      <p>在终端中粘贴以下命令，按系统提示完成授权后刷新证书状态。</p><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{command}</pre>
    </ConfirmDialog>
    <ConfirmDialog open={confirmDisable} title="停止服务？" cancelLabel="取消" confirmLabel="停止服务" onCancel={() => setConfirmDisable(false)} onConfirm={() => { setConfirmDisable(false); void appStore.setCursorEnabled(false); }}>
      <p>停止后 Cursor 将不再通过宝马ai代理。</p>
    </ConfirmDialog>
  </>;
}
