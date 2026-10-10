import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page) {
  const state = { connected: false, key: "", effort: "", missingRecords: false, emptyRecords: false, requests: [] as string[] };
  await page.addInitScript(() => {
    localStorage.setItem("cursor-byok.locale", "zh-CN");
    if (!localStorage.getItem("cursor-byok.theme")) localStorage.setItem("cursor-byok.theme", "default-dark");
  });
  await page.route("**/__byok-api__/api/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/__byok-api__/api", "");
    state.requests.push(path);
    const reply = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (path === "/gateway") {
      if (route.request().method() === "PUT") {
        const input = route.request().postDataJSON();
        if (input.api_key === "bad-key") return reply({ message: "Key 无效、已停用或无访问权限" }, 502);
        state.connected = true; state.key = input.api_key; state.effort = input.reasoning_effort;
      }
      if (route.request().method() === "DELETE") state.connected = false;
      return reply({ connected: state.connected, base_url: "https://ai.bmapi.me", model: "gpt-6-sol", reasoning_effort: state.effort });
    }
    if (path === "/gateway/usage") return reply({ quota: { limit: 100, used: 0.0012288, remaining: 99.9987712 }, status: "active", usage: { today: { requests: 1, actual_cost: 0.0012288 } } });
    if (path === "/gateway/records") {
      if (state.missingRecords) return reply({ message: "服务端尚未提供账单接口，请联系管理员更新服务" }, 502);
      return reply({ page: Number(url.searchParams.get("page")), pages: 2, total: state.emptyRecords ? 0 : 21, items: state.emptyRecords ? [] : [{
        id: 1, created_at: "2026-10-10T02:30:00Z", model: state.key === "second-test-key" ? "gpt-6-sol（新 Key）" : "gpt-6-sol",
        reasoning_effort: "high", input_tokens: 167, output_tokens: 5, cache_read_tokens: 4224, cache_creation_tokens: 0, actual_cost: 0.0012288, duration_ms: 3330,
      }] });
    }
    if (path === "/models") return reply(state.connected ? [{ model_hash: "test-model", group_name: "宝马ai", base_url: "https://ai.bmapi.me", model_id: "gpt-6-sol", api_key: "" }] : []);
    if (path === "/llm-calls" || path === "/plugins") return reply([]);
    if (path === "/overview") return reply({ metrics: {}, token_usage_series: [] });
    if (path === "/harness/cursor/status") return reply({ ca: "ready", settings_applied: false });
    if (path === "/settings/ports") return reply({ proxy_port: 0, service_port: 0 });
    if (path === "/settings/observability") return reply({ detailed: false });
    if (path === "/plugins/runtime") return reply({ state: "uninitialized" });
    return reply({});
  });
  await page.goto("/__byok-api__/");
  return state;
}

async function connect(page: Page, key = "first-test-key") {
  await page.getByLabel("API Key", { exact: true }).fill(key);
  await page.getByRole("button", { name: /验证并/ }).click();
}

test("填写 Key、查看账单、翻页、换 Key、重启页面和移除", async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole("heading", { name: "连接你的 Key" })).toBeVisible();
  await page.getByLabel("推理等级", { exact: true }).selectOption("high");
  await connect(page);
  await expect(page.getByRole("heading", { name: "调用账单" })).toBeVisible();
  expect(state.effort).toBe("high");
  await expect(page.getByRole("cell", { name: "高", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "3.33 秒" })).toBeVisible();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText("共 21 条 · 第 2 / 2 页")).toBeVisible();
  await page.getByRole("button", { name: "上一页" }).click();
  await page.getByRole("heading", { name: "我的服务" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/gateway-dark.png", fullPage: true });
  await connect(page, "second-test-key");
  await expect(page.getByRole("cell", { name: "gpt-6-sol（新 Key）" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: "gpt-6-sol（新 Key）" })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("test-key");
  await page.getByRole("button", { name: "移除 Key" }).click();
  await expect(page.getByRole("heading", { name: "调用账单" })).toHaveCount(0);
  expect(state.requests.some(path => /promotions|update/.test(path))).toBe(false);
  await expect(page.getByText("检查更新", { exact: true })).toHaveCount(0);
});

test("错误 Key 与未部署接口可恢复，不伪造记录", async ({ page }) => {
  const state = await setup(page);
  await connect(page, "bad-key");
  await expect(page.getByRole("alert")).toContainText("Key 无效");
  expect(state.connected).toBe(false);
  state.missingRecords = true;
  await connect(page);
  await expect(page.getByRole("alert")).toContainText("服务端尚未提供账单接口");
  await expect(page.getByText("$99.9987712")).toBeVisible();
  state.missingRecords = false; state.emptyRecords = true;
  await page.getByRole("button", { name: "刷新账单" }).click();
  await expect(page.getByText("所选时间暂无已入账记录")).toBeVisible();
  await page.getByLabel("开始日期", { exact: true }).fill("2026-10-10");
  await page.getByLabel("结束日期", { exact: true }).fill("2026-10-01");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("正确的日期范围");
  await page.getByLabel("结束日期", { exact: true }).fill("2026-10-10");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("小窗口和浅色主题，Cursor 配置保留引导", async ({ page }) => {
  await setup(page);
  await connect(page);
  await page.evaluate(() => localStorage.setItem("cursor-byok.theme", "default-light"));
  await page.setViewportSize({ width: 900, height: 720 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "我的服务" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/gateway-light-small.png", fullPage: true });
  await page.getByRole("button", { name: "下一页" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/gateway-light-table.png", fullPage: true });
  await page.getByRole("link", { name: "Cursor 配置", exact: true }).click();
  await expect(page.getByRole("heading", { name: "3. 开启 Cursor 接管" })).toBeVisible();
  await expect(page.getByRole("button", { name: "开启接管", exact: true })).toBeEnabled();
  await expect(page.getByText("添加模型", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/cursor-setup.png", fullPage: true });
});
