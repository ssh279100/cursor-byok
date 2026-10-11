import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function setup(page: Page) {
  const state = {
    expiresAt: null as string | null, activatedAt: null as string | null, validityDays: 30 as number | null, quota: true,
    syncError: false, modelIDs: ["gpt-6-sol"], recordCount: 1,
    tokens: { input_tokens: 167, output_tokens: 125, cache_read_tokens: 4224, cache_creation_tokens: 0 },
    firstTokenMs: 7140 as number | null, durationMs: 10380 as number | null, outputTps: 125 / 10.38 as number | null,
    ca: "missing", enabled: false, cancelInstall: false, connected: false, key: "", effort: "",
    missingRecords: false, emptyRecords: false, requests: [] as string[], recordQueries: [] as URLSearchParams[],
  };
  await page.addInitScript(() => {
    localStorage.setItem("cursor-byok.locale", "zh-CN");
    if (!localStorage.getItem("cursor-byok.theme")) localStorage.setItem("cursor-byok.theme", "default-dark");
  });
  await page.route("**/__byok-api__/api/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/__byok-api__/api", "");
    state.requests.push(path);
    const reply = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    const promptTokens = state.tokens.input_tokens + state.tokens.cache_read_tokens + state.tokens.cache_creation_tokens;
    const cacheHitRate = promptTokens > 0 ? state.tokens.cache_read_tokens / promptTokens * 100 : 0;
    if (path === "/gateway") {
      if (route.request().method() === "PUT") {
        const input = route.request().postDataJSON();
        if (input.api_key === "bad-key") return reply({ message: "Key 无效、已停用或无访问权限" }, 502);
        state.connected = true; state.modelIDs = ["gpt-6-sol"]; state.key = input.api_key; state.effort = input.reasoning_effort;
      }
      if (route.request().method() === "DELETE") state.connected = false;
      return reply({ connected: state.connected, base_url: "http://154.201.79.53:8080", model: "gpt-6-sol", reasoning_effort: state.effort });
    }
    if (path === "/gateway/usage") return reply({
      quota: state.quota ? { limit: 100, used: 0.0012288, remaining: 99.9987712 } : null,
      status: "active", expires_at: state.expiresAt, activated_at: state.activatedAt, validity_days: state.validityDays,
      usage: { total: { requests: 31, ...state.tokens, total_tokens: Object.values(state.tokens).reduce((a, b) => a + b, 0), actual_cost: 0.0012288, cache_hit_rate: cacheHitRate } },
    });
    if (path === "/gateway/models") return reply({ models: ["gpt-6-sol", "gpt-6-astra", "retired-model"] });
    if (path === "/gateway/records") {
      state.recordQueries.push(url.searchParams);
      if (state.missingRecords) return reply({ message: "服务端尚未提供账单接口，请联系管理员更新服务" }, 502);
      return reply({ page: Number(url.searchParams.get("page")), page_size: 20, pages: 2, total: state.emptyRecords ? 0 : 21,
        items: state.emptyRecords ? [] : Array.from({ length: state.recordCount }, (_, index) => ({
          id: index + 1, created_at: "2026-10-10T02:30:00Z", model: url.searchParams.get("model") || (state.key === "second-test-key" ? "gpt-6-sol（新 Key）" : "gpt-6-sol"),
          reasoning_effort: "high", ...state.tokens, total_tokens: Object.values(state.tokens).reduce((a, b) => a + b, 0), actual_cost: 0.0012288,
          cache_hit_rate: cacheHitRate, first_token_ms: state.firstTokenMs, duration_ms: state.durationMs, output_tps: state.outputTps,
        })),
      });
    }
    if (path === "/gateway/models/sync") {
      if (state.syncError) return reply({ message: "获取模型失败，原配置已保留" }, 502);
      state.modelIDs = ["gpt-6-sol", "gpt-6.1-sol", "gpt-6-astra"];
      return reply({ models: state.modelIDs, count: state.modelIDs.length });
    }
    if (path === "/models") return reply(state.connected ? state.modelIDs.map(id => ({ model_hash: id, group_name: "宝马ai", base_url: "http://154.201.79.53:8080", model_id: id, api_key: "" })) : []);
    if (path === "/llm-calls" || path === "/plugins") return reply([]);
    if (path === "/overview") return reply({ metrics: {}, token_usage_series: [] });
    if (path === "/harness/cursor/status") return reply({ platform: "windows", ca: state.ca, integration: state.enabled ? "enabled" : "disabled", settings_applied: state.enabled });
    if (path === "/harness/cursor/enabled") {
      if (state.cancelInstall) return reply({ message: "证书授权被取消，请重试" }, 400);
      state.enabled = route.request().postDataJSON().enabled; state.ca = "ready";
      return reply({ platform: "windows", ca: state.ca, integration: state.enabled ? "enabled" : "disabled", settings_applied: state.enabled });
    }
    if (path === "/settings/ports") return reply({ proxy_port: 0, service_port: 0 });
    if (path === "/settings/observability") return reply({ detailed: false });
    if (path === "/plugins/runtime") return reply({ state: "uninitialized" });
    return reply({});
  });
  await page.goto("/__byok-api__/");
  return state;
}

async function connect(page: Page, key = "first-test-key") {
  await page.getByRole("link", { name: "我的服务", exact: true }).click();
  if (!await page.getByLabel("API Key", { exact: true }).isVisible()) await page.getByRole("button", { name: "Key 设置", exact: true }).click();
  await page.getByLabel("API Key", { exact: true }).fill(key);
  await page.getByRole("button", { name: /验证并/ }).click();
}

async function usage(page: Page) {
  await page.getByRole("link", { name: "使用明细", exact: true }).click();
  await expect(page.getByRole("heading", { name: "使用明细", exact: true })).toBeVisible();
}

async function screenshot(page: Page, filename: string) {
  await mkdir("output/playwright", { recursive: true });
  await page.screenshot({ path: `output/playwright/${filename}.png`, fullPage: true });
}

test("独立菜单、按 Key 查看五项汇总、翻页、换 Key 和移除", async ({ page }) => {
  const state = await setup(page);
  await usage(page);
  await expect(page.getByRole("heading", { name: "连接 Key 后查看使用明细" })).toBeVisible();
  await page.getByRole("link", { name: "前往我的服务 →" }).click();
  await page.getByLabel("推理等级", { exact: true }).selectOption("high");
  await connect(page);
  expect(state.effort).toBe("high");
  await expect(page.getByRole("heading", { name: "模型调用详情" })).toHaveCount(0);
  await usage(page);
  const summary = page.getByRole("region", { name: "当前 Key 累计使用情况" });
  await expect(summary.getByText("待激活", { exact: true })).toBeVisible();
  await expect(summary.getByText("首次成功调用后有效 30 天")).toBeVisible();
  await expect(summary.getByText("4,516", { exact: true })).toBeVisible();
  await expect(summary.getByText("96.2%", { exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader")).toHaveCount(6);
  await expect(page.getByRole("cell", { name: "高", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: /合计.*4,516.*缓存命中.*96.2%.*输入.*167.*输出.*125.*缓存读取.*4,224.*缓存写入.*0/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /首字.*7.14s.*总耗时.*10.38s.*输出 TPS.*12.0 tok\/s/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2026/10/10 10:30:00", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText("共 21 条 · 第 2 / 2 页")).toBeVisible();
  await connect(page, "second-test-key");
  await usage(page);
  await expect(page.getByRole("cell", { name: "gpt-6-sol（新 Key）" })).toBeVisible();
  await expect(page.getByText("共 21 条 · 第 1 / 2 页")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: "gpt-6-sol（新 Key）" })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("test-key");
  await page.getByRole("link", { name: "我的服务", exact: true }).click();
  await page.getByRole("button", { name: "Key 设置", exact: true }).click();
  await page.getByRole("button", { name: "移除 Key" }).click();
  await expect(page.getByRole("heading", { name: "连接你的 Key" })).toBeVisible();
  await usage(page);
  await expect(page.getByRole("heading", { name: "连接 Key 后查看使用明细" })).toBeVisible();
  await expect(summary).toHaveCount(0);
  expect(state.requests.some(path => /promotions|update/.test(path))).toBe(false);
});

test("模型与日期筛选、分页保留筛选、累计卡片保持不变", async ({ page }) => {
  const state = await setup(page);
  await connect(page); await usage(page);
  await expect(page.getByRole("cell", { name: "gpt-6-sol", exact: true })).toBeVisible();
  const summaryCount = state.requests.filter(path => path === "/gateway/usage").length;
  await page.getByLabel("模型", { exact: true }).selectOption("retired-model");
  await page.getByLabel("开始日期", { exact: true }).fill("2026-09-01");
  await page.getByLabel("结束日期", { exact: true }).fill("2026-09-30");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.getByRole("cell", { name: "retired-model", exact: true })).toBeVisible();
  expect(state.recordQueries.at(-1)?.get("model")).toBe("retired-model");
  expect(state.recordQueries.at(-1)?.get("start_date")).toBe("2026-09-01");
  expect(state.recordQueries.at(-1)?.get("end_date")).toBe("2026-09-30");
  await screenshot(page, "usage-filtered-dark");
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText("共 21 条 · 第 2 / 2 页")).toBeVisible();
  expect(state.recordQueries.at(-1)?.get("model")).toBe("retired-model");
  await screenshot(page, "usage-page2-dark");
  expect(state.requests.filter(path => path === "/gateway/usage")).toHaveLength(summaryCount);
  await expect(page.getByTitle("$99.9987712")).toBeVisible();
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await expect(page.getByRole("cell", { name: "gpt-6-sol", exact: true })).toBeVisible();
  await expect(page.getByLabel("模型", { exact: true })).toHaveValue("");
  expect(state.recordQueries.at(-1)?.get("page")).toBe("1");
});

test("错误 Key、明细接口失败与空记录有清晰反馈，日期校验可恢复", async ({ page }) => {
  const state = await setup(page);
  await connect(page, "bad-key");
  await expect(page.getByRole("alert")).toContainText("Key 无效");
  state.missingRecords = true;
  await connect(page); await usage(page);
  await expect(page.getByRole("alert")).toContainText("服务端尚未提供账单接口");
  await expect(page.getByTitle("$99.9987712")).toBeVisible();
  state.missingRecords = false; state.emptyRecords = true;
  await page.getByRole("button", { name: "刷新明细" }).click();
  await expect(page.getByText("当前筛选条件暂无已入账记录")).toBeVisible();
  await page.getByLabel("开始日期", { exact: true }).fill("2026-10-10");
  await page.getByLabel("结束日期", { exact: true }).fill("2026-10-01");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("正确的日期范围");
  await page.getByLabel("结束日期", { exact: true }).fill("2026-10-10");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("五卡和明细在深浅主题与小窗口中展示完整", async ({ page }) => {
  await page.setViewportSize({ width: 1480, height: 920 });
  const state = await setup(page); state.recordCount = 5;
  await connect(page); await usage(page);
  await expect(page.getByRole("cell", { name: "gpt-6-sol", exact: true }).first()).toBeVisible();
  await screenshot(page, "usage-pending-dark");
  const region = page.getByRole("region", { name: "模型调用明细" });
  const metrics = await region.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.width);
  state.expiresAt = "2027-03-15T06:30:00Z"; state.activatedAt = "2026-10-11T03:00:00Z";
  await page.getByRole("button", { name: "刷新明细" }).click();
  await expect(page.getByText("2027/03/15", { exact: true })).toBeVisible();
  await screenshot(page, "usage-active-dark");
  await page.evaluate(() => localStorage.setItem("cursor-byok.theme", "default-light"));
  await page.setViewportSize({ width: 900, height: 720 }); await page.reload();
  await expect(page.getByRole("heading", { name: "使用明细", exact: true })).toBeVisible();
  await expect(page.getByText("2027/03/15", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, "usage-light-small");
  await page.getByRole("button", { name: "下一页" }).scrollIntoViewIfNeeded();
  await screenshot(page, "usage-light-table");
});

test("未设限的 Key 展示累计消费，已到期 Key 保留账单", async ({ page }) => {
  const state = await setup(page); state.quota = false; state.validityDays = null;
  await connect(page); await usage(page);
  const summary = page.getByRole("region", { name: "当前 Key 累计使用情况" });
  await expect(summary.getByText("未设限", { exact: true })).toBeVisible();
  await expect(summary.getByText("$0.0012288", { exact: true })).toBeVisible();
  await expect(summary.getByText("长期有效", { exact: true })).toBeVisible();
  state.expiresAt = "2020-01-01T00:00:00Z"; state.activatedAt = "2019-12-01T00:00:00Z";
  await page.getByRole("button", { name: "刷新明细" }).click();
  await expect(page.getByText("已到期 · 历史账单仍可查询")).toBeVisible();
  await expect(page.getByRole("cell", { name: "gpt-6-sol", exact: true })).toBeVisible();
  state.tokens = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 };
  state.firstTokenMs = null; state.durationMs = null; state.outputTps = null;
  await page.getByRole("button", { name: "刷新明细" }).click();
  await expect(summary.getByText("0.0%", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: /首字.*—.*总耗时.*—.*输出 TPS.*—/ })).toBeVisible();
});

test("我的服务保留模型同步与错误反馈", async ({ page }) => {
  const state = await setup(page); await connect(page);
  await expect(page.getByLabel("API Key", { exact: true })).toHaveCount(0);
  await screenshot(page, "gateway-new-api-dark");
  await page.getByRole("button", { name: "获取可用模型" }).click();
  await expect(page.getByRole("status")).toContainText("已保存 3 个模型");
  await page.getByText("查看已配置模型 · 3", { exact: true }).click();
  await expect(page.getByText("gpt-6.1-sol", { exact: true })).toBeVisible();
  state.syncError = true;
  await page.getByRole("button", { name: "获取可用模型" }).click();
  await expect(page.getByRole("alert")).toContainText("原配置已保留");
  expect(state.modelIDs).toHaveLength(3);
});

test("Cursor 配置保留启动、取消授权后重试和停止服务", async ({ page }) => {
  const state = await setup(page); await connect(page);
  await page.getByRole("link", { name: "Cursor 配置", exact: true }).click();
  await expect(page.getByRole("button", { name: "初始化 / 安装证书" })).toHaveCount(0);
  state.cancelInstall = true;
  await page.getByRole("button", { name: "点击启动服务", exact: true }).click();
  await expect(page.getByText("证书授权被取消，请重试", { exact: true })).toBeVisible();
  state.cancelInstall = false;
  await page.getByRole("button", { name: "点击启动服务", exact: true }).click();
  await expect(page.getByRole("button", { name: "服务运行中 · 点击停止" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "服务运行中 · 点击停止", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "停止服务", exact: true }).click();
  await expect(page.getByRole("button", { name: "点击启动服务", exact: true })).toBeEnabled();
  expect(state.enabled).toBe(false);
});
