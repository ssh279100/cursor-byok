# 宝马ai

基于 cursor-byok 定制的 Windows 客户端，内置 `http://154.201.79.53:8080/` 与 `gpt-6-sol`，左下角显示 `QQ:279100273`。

用户填写普通 API Key，无需注册登录；首次在“Cursor 配置”点击“点击启动服务”，软件自动准备证书和代理，Windows 提示授权时选择“是”。支持高亮查看当前 Key 的可用额度、到期时间及调用账单：时间、模型、推理等级、Token、实际扣费、耗时、缓存率。

已移除原前端广告及原项目更新通道。使用明细由二开的 sub2api 直接按当前普通 Key 提供，客户端无需管理员密钥。

点击“获取可用模型”会查询当前 Key 的模型权限并保存到本机配置。重新打开 Cursor 后，在宝马ai分组选择模型。更换 Key 会清除旧模型配置，再获取新 Key 的模型；查询失败不会覆盖已有配置。

从旧地址版本升级时，软件会清理已废弃的内置模型配置；请重新填写 Key，并点击“获取可用模型”。

默认窗口最大 1480×920 逻辑像素，并随屏幕工作区和缩放适配。已连接后 Key 设置折叠；账单列不换行，小屏幕可在表格内横向滚动。到期时间按北京时间显示，服务端明确未设到期时间时显示“长期有效”。

## 获取 Windows 免安装版

1. 打开本仓库的 **Actions**。
2. 选择 **宝马ai Windows 打包**，点击 **Run workflow**，分支选择 `main`。
3. 成功后进入该次运行，在 **Artifacts** 下载 `bmapi-windows`。
4. 解压后直接双击 `cursor-byok-desktop.exe`，无需安装客户端。`bundle/nsis` 中另有可选安装包。
5. 填写 Key 后点击“点击启动服务”。连接会关闭 Cursor 以应用配置，请先保存工作；完成后重新打开 Cursor，选择宝马ai模型。

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
