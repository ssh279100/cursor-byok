/**
 * 定制层：内置 OpenAI 兼容上游。
 * 上游 rebase 时尽量只冲突这一文件 + 少量挂载点。
 */
import { showInputModal } from "@/composables/useInputModal";
import { showModal } from "@/composables/useModal";
import {
  OPENAI_ENDPOINT_CHAT_COMPLETIONS,
  appState,
  normalizeModelAdapter,
  saveModelAdapterAt,
} from "@/state/appState";

/** 固定上游（用户只需填 Key） */
export const BUILTIN_PROVIDER = Object.freeze({
  displayName: "Grok 4.5",
  type: "openai",
  baseURL: "https://api.clousiaow.xyz/",
  modelID: "grok-4.5",
  tooltipData: "内置上游",
  reasoningEffort: "high",
  openAIEndpoint: OPENAI_ENDPOINT_CHAT_COMPLETIONS,
});

function normalizeBaseURL(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

function findBuiltinAdapterIndex(adapters = appState.modelAdapters) {
  const target = normalizeBaseURL(BUILTIN_PROVIDER.baseURL);
  return adapters.findIndex(
    (item) => normalizeBaseURL(item?.baseURL) === target,
  );
}

function buildBuiltinAdapter(apiKey) {
  return normalizeModelAdapter({
    ...BUILTIN_PROVIDER,
    apiKey: String(apiKey || "").trim(),
  });
}

/**
 * 启动时：无 Key 则弹窗；有 Key 则确保模型适配器已写入配置。
 * @returns {Promise<{ok: boolean, skipped?: boolean, error?: string}>}
 */
export async function ensureBuiltinProviderLogin() {
  const existingIndex = findBuiltinAdapterIndex();
  const existing =
    existingIndex >= 0 ? appState.modelAdapters[existingIndex] : null;
  let apiKey = String(existing?.apiKey || "").trim();

  while (!apiKey) {
    const input = await showInputModal({
      title: "登录",
      content: "请输入 API Key 以连接内置模型服务",
      placeholder: "sk-...",
      defaultValue: "",
    });

    if (input === null) {
      const again = await showModal({
        title: "需要 API Key",
        content: "未输入 Key 将无法调用模型。是否重新输入？",
        confirmText: "重新输入",
        cancelText: "稍后再说",
        showCancel: true,
      });
      if (!again) {
        return { ok: false, skipped: true };
      }
      continue;
    }

    apiKey = String(input || "").trim();
    if (!apiKey) {
      await showModal({
        title: "Key 不能为空",
        content: "请输入有效的 API Key。",
        confirmText: "确定",
        showCancel: false,
      });
    }
  }

  const adapter = buildBuiltinAdapter(apiKey);
  // 已存在且字段一致则跳过写盘
  if (
    existing &&
    existing.apiKey === adapter.apiKey &&
    existing.modelID === adapter.modelID &&
    normalizeBaseURL(existing.baseURL) === normalizeBaseURL(adapter.baseURL) &&
    existing.openAIEndpoint === adapter.openAIEndpoint &&
    existing.reasoningEffort === adapter.reasoningEffort
  ) {
    return { ok: true, skipped: true };
  }

  const result = await saveModelAdapterAt(existingIndex, adapter);
  if (!result.ok) {
    return { ok: false, error: result.error || "保存模型配置失败" };
  }
  return { ok: true };
}