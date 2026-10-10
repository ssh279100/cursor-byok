# 宝马ai

基于 cursor-byok 定制的 Windows 客户端，内置 `https://ai.bmapi.me` 与 `gpt-6-sol`。

用户填写普通 API Key，无需注册登录；首次在“Cursor 配置”点击“一键连接 Cursor”，软件自动准备证书和代理，Windows 提示授权时选择“是”。支持查看当前 Key 的额度及调用账单：时间、模型、推理等级、Token、实际扣费、耗时。

已移除原前端广告及原项目更新通道。管理员密钥只配置在独立云端账单服务，不能放入客户端。

## 获取 Windows 免安装版

1. 打开本仓库的 **Actions**。
2. 选择 **宝马ai Windows 打包**，点击 **Run workflow**，分支选择 `main`。
3. 成功后进入该次运行，在 **Artifacts** 下载 `bmapi-windows`。
4. 解压后直接双击 `cursor-byok-desktop.exe`，无需安装客户端。`bundle/nsis` 中另有可选安装包。
5. 填写 Key 后点击“一键连接 Cursor”。连接会关闭 Cursor 以应用配置，请先保存工作；完成后重新打开 Cursor，选择宝马ai模型。

当前 Windows 安装包需以上述实际构建结果为准。账单功能还需要部署独立小服务，并将 `https://ai.bmapi.me/bmapi/v1/records` 转发到它；原 sub2api 无需修改。

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
