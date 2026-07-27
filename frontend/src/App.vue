<template>
  <MainLayout />
  <MessageProvider />
  <Modal

    :visible="modalState.visible"
    :title="modalState.title"
    :content="modalState.content"
    :confirm-text="modalState.confirmText"
    :cancel-text="modalState.cancelText"
    :show-cancel="modalState.showCancel"
    :confirm-disabled="modalState.confirmDisabled"
    @confirm="resolveModal(true)"
    @cancel="resolveModal(false)"
  />
  <!-- 定制：关闭自动更新弹窗（后端也不再 Start 更新器） -->
  <InputModal
    :visible="inputModalState.visible"
    :title="inputModalState.title"
    :content="inputModalState.content"
    :placeholder="inputModalState.placeholder"
    :confirm-text="inputModalState.confirmText"
    :model-value="inputModalState.value"
    @update:model-value="inputModalState.value = $event"
    @confirm="resolveInputModal(true)"
    @cancel="resolveInputModal(false)"
  />
</template>
<script setup>
import MainLayout from "@/layouts/MainLayout.vue";
import Modal from "@/components/ui/Modal.vue";
import MessageProvider from "@/components/ui/MessageProvider.vue";
import { modalState, resolveModal } from "@/composables/useModal";

import InputModal from "@/components/ui/InputModal.vue";
import { inputModalState, resolveInputModal } from "@/composables/useInputModal";
import { ensureBuiltinProviderLogin } from "@/custom/builtinProvider";
import { bootstrapAppState } from "@/state/appState";
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const isMainWindow = computed(() => route.path === "/");

onMounted(() => {
  // 所有窗口都要拉配置；仅主窗口弹 Key 登录
  void bootstrapAppState()
    .catch(() => {})
    .then(() => {
      if (!isMainWindow.value) {
        return;
      }
      return ensureBuiltinProviderLogin();
    })
    .catch(() => {});
});
</script>
