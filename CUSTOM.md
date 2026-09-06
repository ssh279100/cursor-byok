# 定制版说明

当前分支基于上游 `leookun/cursor-byok` 的 Tauri/Rust 新架构，保留以下定制：

- 启动后自动弹窗输入内置 API Key。
- 固定内置 API：`https://api.clousiaow.xyz/`
- 固定模型：`grok-4.5`
- 默认使用 OpenAI Chat Completions 端点。
- 内置模型隐藏服务器地址配置。
- 关闭推广入口、使用教程入口和应用内更新检查。

Windows 构建流程：

1. 推送到 `custom/clousiaow` 后，GitHub Actions 自动构建。
2. 构建产物会发布为 GitHub Release。
3. 下载资产 `Cursor助手-windows-64.exe` 直接运行。
