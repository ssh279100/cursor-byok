# 宝马ai

基于 cursor-byok 定制的 Windows 客户端，当前版本 1.0.3，内置 `https://cs.bmapi.me/` 与 `gpt-6-sol`，左下角显示 `Q群:25963527`。

用户填写普通 API Key，点击“验证连接”，首次连接后默认开启代理；Windows 提示证书授权时选择“是”。顶部单按钮控制代理开关，手动关闭后会记住选择。打开 Cursor，在模型选择里关闭 Auto，手动选择 API 的模型即可使用。支持高亮查看当前 Key 的可用额度、到期时间及调用账单：时间、模型、推理等级、Token、实际扣费、耗时、缓存率。

已移除原前端广告及原项目更新通道。使用明细由二开的 sub2api 直接按当前普通 Key 提供，客户端无需管理员密钥。

点击“获取可用模型”会查询当前 Key 的模型权限并保存到本机配置。重新打开 Cursor 后，在宝马ai分组选择模型。更换 Key 会清除旧模型配置，再获取新 Key 的模型；查询失败不会覆盖已有配置。

从旧地址版本升级时，软件会清理已废弃的内置模型配置；请重新填写 Key，并点击“获取可用模型”。

默认窗口最大 1480×920 逻辑像素，并随屏幕工作区和缩放适配。Key 明文显示，Key 设置及可用模型常驻展示；Key 卡片在大窗口中为半宽，小窗口自动铺满。左侧只保留我的服务、使用明细、系统设置。到期时间按北京时间显示，服务端明确未设到期时间时显示“长期有效”。

## 获取 Windows 免安装版

1. 打开本仓库的 **Actions**。
2. 选择 **宝马ai Windows 打包**，点击 **Run workflow**，分支选择 `main`。
3. 成功后进入该次运行，在 **Artifacts** 下载 `bmapi-windows`。
4. 解压后直接双击 `cursor-byok-desktop.exe`，无需安装客户端。`bundle/nsis` 中另有可选安装包。
5. 输入购买的 Key 并点击“验证连接”，确认顶部代理服务已开启，再打开 Cursor，关闭 Auto 并选择宝马ai模型。

当前 Windows 安装包需以上述实际构建结果为准。网关需部署本项目二开的 sub2api，直接提供 `/bmapi/v1/summary`、`/bmapi/v1/models` 和 `/bmapi/v1/records`；无需独立账单服务。管理员可批量创建 Key，并设置从首次成功调用起计算的有效天数。

[详细定制说明](./定制版说明.md)

## 源码结构

```text
apps/desktop/    # React 界面和 Tauri 桌面程序
server/          # Rust 本机代理与固定网关接入
crates/          # 代理使用的公共组件
.github/         # 自动检查与 Windows 打包流程
```

## 来源与许可

本项目基于 [leookun/cursor-byok](https://github.com/leookun/cursor-byok)，保留原 [LICENSE](./LICENSE) 和版权说明。当前仓库维护宝马ai定制版，不使用原版自动更新。
