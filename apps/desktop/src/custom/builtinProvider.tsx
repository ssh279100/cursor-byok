import { useEffect, useState } from "react";
import { Modal } from "../shared/ui/Modal";
import { FormField, SecretTextInput } from "../shared/ui/FormControls";
import type { Model, ModelInput } from "../shared/api";

/** 定制层：固定内置模型服务，用户只需要输入 API Key。 */
export const BUILTIN_PROVIDER = Object.freeze({
  displayName: "Grok 4.5",
  baseUrl: "https://api.clousiaow.xyz/",
  modelId: "grok-4.5",
  tooltipData: "内置上游",
  openaiEndpoint: "/v1/chat/completions",
  reasoningEffort: "high",
});

export function findBuiltinModel(models: Model[]): Model | undefined {
  const target = BUILTIN_PROVIDER.baseUrl.replace(/\/+$/, "").toLowerCase();
  return models.find((model) => model.base_url.replace(/\/+$/, "").toLowerCase() === target);
}

export function builtinModelInput(apiKey: string, sortOrder = 0): ModelInput {
  return {
    sort_order: sortOrder,
    display_name: BUILTIN_PROVIDER.displayName,
    group_name: null,
    type: "openai",
    base_url: BUILTIN_PROVIDER.baseUrl,
    use_full_url: false,
    api_key: apiKey.trim(),
    tooltip_data: BUILTIN_PROVIDER.tooltipData,
    model_id: BUILTIN_PROVIDER.modelId,
    reasoning_effort: BUILTIN_PROVIDER.reasoningEffort,
    openai_endpoint: BUILTIN_PROVIDER.openaiEndpoint,
    openai_extra_params_enabled: false,
    openai_extra_params: {},
    custom_headers_enabled: false,
    custom_headers: {},
    anthropic_extra_params_enabled: false,
    anthropic_extra_params: {},
    context_window_tokens: null,
    max_completion_tokens: null,
    anthropic_max_tokens: null,
    anthropic_thinking_effort: null,
    thinking_budget_tokens: null,
  };
}

export function BuiltinLoginModal({ open, busy, onClose, onSubmit }: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (apiKey: string) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (open) setApiKey("");
  }, [open]);

  const submit = async () => {
    await onSubmit(apiKey);
  };

  return (
    <Modal
      open={open}
      title="登录"
      busy={busy}
      onClose={onClose}
      onSubmit={() => void submit()}
      closeLabel="稍后再说"
      submitLabel="登录"
      submitDisabled={busy || !apiKey.trim()}
    >
      <p>请输入 API Key 以连接内置模型服务。</p>
      <FormField label="API Key">
        <SecretTextInput
          placeholder="sk-..."
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </FormField>
    </Modal>
  );
}

