# 宝马ai

基于 cursor-byok 定制的 Windows 客户端，当前版本 1.0.3，内置 `https://cs.bmapi.me/` 与 `gpt-6-sol`，左下角显示 `Q群:25963527`。

用户填写普通 API Key，点击“验证连接”，首次连接后默认开启代理，顶部单按钮控制开关。Key 明文、可用模型常驻显示；下方使用步骤说明如何关闭 Cursor 的 Auto 并手动选择 API 模型。左侧只保留我的服务、使用明细、系统设置。使用明细高亮显示当前 Key 的可用额度、已用额度、到期时间、总 Token 和缓存命中率；调用表格支持按模型和日期筛选，显示推理等级、输入/输出与缓存 Token、实际扣费、首字延迟、总耗时、输出 TPS 及时间。

已移除原前端广告及原项目更新通道。使用明细由二开的 sub2api 直接按当前普通 Key 提供，客户端无需管理员密钥。

## 打包 Windows 安装程序

1. 打开本仓库的 **Actions**。
2. 选择 **宝马ai Windows 打包**，点击 **Run workflow**，分支选择 `main`。
3. 成功后进入该次运行，在 **Artifacts** 下载 `bmapi-windows`。
4. 解压并运行其中的 NSIS 安装程序，测试模型调用及账单后再分发。

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
