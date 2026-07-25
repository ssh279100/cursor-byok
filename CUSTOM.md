# 定制改动说明（与上游同步）

本分支相对上游 `leookun/cursor-byok` 的定制点：

| 目标 | 实现位置 |
|------|----------|
| 去掉顶部三个推广 | `internal/ads/types.go` 清空 `Slots`；前端去掉 `AdModelProvider` / Home 广告逻辑 |
| 内置 API | `frontend/src/custom/builtinProvider.js` |
| 启动弹 Key 登录 | `frontend/src/App.vue` 主窗口调用 `ensureBuiltinProviderLogin()` |

内置上游参数（改这里即可）：

- URL: `https://api.clousiaow.xyz/`
- 模型: `grok-4.5`
- 端点: `/v1/chat/completions`（OpenAI 兼容）
- Key: 启动时输入并写入本地模型配置

---

## 推荐 Git 工作流（保留定制、吃上游更新）

```bash
# 1. 只做一次：加上游远程
git remote add upstream https://github.com/leookun/cursor-byok.git

# 2. 定制放在独立分支（不要直接改 main 当发布分支混用）
git checkout -b custom/clousiaow

# 3. 上游有更新时
git fetch upstream
git rebase upstream/main
# 若冲突：优先保留 custom/ 与 ads Slots 空列表相关改动，再继续
# git add ... && git rebase --continue

# 4. 冲突太乱时的备选：把定制打成补丁
git format-patch upstream/main..custom/clousiaow -o ../my-patches
# 干净上游上重放：
git checkout -b custom/clousiaow-new upstream/main
git am ../my-patches/*.patch
```

原则：

1. **定制尽量集中**在 `frontend/src/custom/`，减少和上游大文件冲突。
2. **不要用官方应用内“检查更新”**覆盖你的二进制——那会装回未定制的上游包。自己从本分支重新 `build`。
3. 每次上游更新后：`fetch → rebase → 解决冲突 → 重新编译`。

---

## 本地编译（Windows）

依赖：Go、Node/Yarn、[Wails v3](https://wails.io)、Task（见仓库 `build.ps1` / `Taskfile.yml`）。

```powershell
cd C:\Users\Administrator\Desktop\cursor-byok
.\build.ps1
# 或按仓库文档使用 task / wails build
```

---

## 使用方式

1. 启动程序 → 主界面弹出「登录 / API Key」
2. 输入 Key 确定 → 自动写入模型适配器（URL/模型已内置）
3. 点「启动服务」→ Cursor 走本地代理 → 请求转到内置上游