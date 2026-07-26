<script setup>
import { Window } from "@wailsio/runtime";
import LocaleSelect from "@/components/LocaleSelect.vue";
import { useMessage } from "@/composables/useMessage";
import { appState, syncServiceState } from "@/state/appState";
import { isWindows } from "@/utils/isWindows";
import { computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import copyTextToClipboard from "copy-text-to-clipboard";
import Logo from "@/assets/logo.png";

// 底部联系方式：点击复制冒号后的微信号
const CONTACT_WECHAT = "nicebbc06";

const route = useRoute();
const message = useMessage();
const showIcon = computed(() => route.meta.showIcon !== false);
const title = computed(() => route.meta.title ?? "宝马API cursor助手");
const directlyClose = computed(() => route.meta.directlyClose === true);
const showFooter = computed(() => route.path === "/");

let proxyStateTimer = null;
const proxyStatePollIntervalMs = 10000;
const netProxyEndpoint = computed(
  () => appState.netProxyHttps || appState.netProxyHttp || "",
);
const proxyBadgeText = computed(() => {
  if (appState.netProxyUsingSystem) {
    return "已识别系统代理";
  }
  return "";
});
const proxyBadgeTitle = computed(() => {
  if (appState.netProxyUsingSystem) {
    return netProxyEndpoint.value
      ? `当前出站请求使用系统代理：${netProxyEndpoint.value}`
      : "当前出站请求使用系统代理";
  }
  if (appState.netProxyUsingEnv) {
    return netProxyEndpoint.value
      ? `当前出站请求使用环境变量代理：${netProxyEndpoint.value}`
      : "当前出站请求使用环境变量代理";
  }
  if (appState.netProxyPacIgnored) {
    return "检测到系统 PAC/自动代理，当前版本按直连处理";
  }
  return "当前出站请求未使用系统代理";
});

async function minimizeWindow() {
  await Window.Minimise();
}

async function closeWindow() {
  if (directlyClose.value) {
    await Window.Close();
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  await Window.Hide();
}

function handleCopyWechat() {
  const ok = copyTextToClipboard(CONTACT_WECHAT);
  if (ok) {
    message.success(`已复制微信：${CONTACT_WECHAT}`);
  } else {
    message.error("复制失败，请手动复制");
  }
}

onMounted(() => {
  proxyStateTimer = window.setInterval(() => {
    if (showFooter.value) {
      void syncServiceState().catch(() => {});
    }
  }, proxyStatePollIntervalMs);
});

onUnmounted(() => {
  if (proxyStateTimer) {
    window.clearInterval(proxyStateTimer);
    proxyStateTimer = null;
  }
});
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden flex-col">
    <div
      class="fixed top-0 w-screen h-[40px] z-9999 w-full"
      style="--wails-draggable: drag"
    ></div>

    <header
      class="flex h-[40px] center-row px-[20px] w-full min-h-0 shrink-0 justify-between relative"
      style="--wails-draggable: drag"
      :class="{ '!justify-center': !isWindows }"
    >
      <div class="center-row gap-2" style="font-family: var(--font-num);">
        <img v-if="showIcon" :src="Logo" class="w-[18px] h-[18px]" />
        <div>{{ title }}</div>
      </div>
      <div
        v-if="isWindows"
        class="absolute right-[10px] top-[8px] z-99999 center-row gap-[1px]"
      >
        <button
          class="text-[20px] center-row justify-center w-[30px] h-[23px] rounded-[4px] text-[#777] hover:bg-[#333] hover:text-[#ddd] cursor-pointer"
          @click="minimizeWindow"
        >
          <span class="icon-[ic--round-minus]"></span>
        </button>
        <button
          class="text-[20px] center-row justify-center w-[30px] h-[23px] rounded-[4px] text-[#777] hover:bg-[#333] hover:text-[#ddd] cursor-pointer"
          @click="closeWindow"
        >
          <span class="icon-[ic--round-close]"></span>
        </button>
      </div>
    </header>

    <main class="flex-1 min-h-0 overflow-hidden flex flex-col w-full">
      <router-view />
    </main>

    <footer
      v-if="showFooter"
      class="flex !pr-1 h-[30px] shrink-0 items-center gap-[8px] border-t border-[#242424] px-[14px] text-[12px] text-[#8f8f8f]"
    >
      <div
        v-if="proxyBadgeText"
        class="center-row border-none gap-[2px] px-[0px] py-[3px] leading-none"
        :title="proxyBadgeTitle"
        aria-live="polite"
      >
        <span class="icon-[mdi--wifi] text-[15px]"></span>
        <span class="truncate">{{ proxyBadgeText }}</span>
      </div>
      <button
        type="button"
        class="center-row shrink-0 gap-[6px] cursor-pointer rounded-[6px] px-[6px] py-[3px] transition-colors duration-150 hover:bg-[#1f1f1f] hover:text-[#e5e5e5]"
        title="点击复制微信号"
        @click="handleCopyWechat"
      >
        <span class="icon-[mdi--wechat] text-[15px]"></span>
        <span>点击复制微信:{{ CONTACT_WECHAT }}</span>
      </button>
      <div class="ml-auto flex shrink-0 items-center gap-[8px]">
        <LocaleSelect
          :border="false"
          aria-label="界面语言"
          wrapper-class="w-auto"
          button-class="h-[24px] bg-transparent px-1.5 text-[12px] !text-[#8f8f8f] !hover:text-[#e5e5e5]"
          menu-class="text-[12px]"
        />
      </div>
    </footer>
  </div>
</template>