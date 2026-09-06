import { useEffect, useRef, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "./shared/ui/Tooltip";
import { MessageProvider } from "./shared/ui/MessageProvider";
import { useMessage } from "./shared/ui/message";
import { AppFrame } from "./shell/AppFrame";
import { AppLayout } from "./shell/AppLayout";
import { CallsPage } from "./features/calls/CallsPage";
import { CallDetailsPage } from "./features/calls/CallDetailsPage";
import { CursorSettingsPage } from "./features/models/CursorSettingsPage";
import { HomePage } from "./features/home/HomePage";
import { PluginManagementPage } from "./features/plugins/PluginManagementPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { appStore, useAppStore } from "./shared/store/appStore";
import { BuiltinLoginModal, builtinModelInput, findBuiltinModel } from "./custom/builtinProvider";

export function App() {
  const { cursorBusy } = useAppStore();
  const [builtinLoginOpen, setBuiltinLoginOpen] = useState(false);

  useEffect(() => {
    let disposed = false;
    const prepareBuiltinModel = async () => {
      await appStore.refresh();
      if (disposed) return;
      const existing = findBuiltinModel(appStore.getSnapshot().models);
      if (!existing || !existing.api_key.trim()) setBuiltinLoginOpen(true);
    };
    void prepareBuiltinModel();
    return () => { disposed = true; };
  }, []);

  const saveBuiltinModel = async (apiKey: string) => {
    const existing = findBuiltinModel(appStore.getSnapshot().models);
    const input = builtinModelInput(apiKey, existing?.sort_order ?? 0);
    const saved = existing
      ? await appStore.updateCursorModel(existing.model_hash, input)
      : (await appStore.createModels([input]))?.[0] ?? null;
    if (saved) setBuiltinLoginOpen(false);
  };

  return (
    <TooltipProvider>
      <HashRouter>
        <Routes>
          <Route path="calls/:callId" element={<CallDetailsPage />} />
          <Route element={<AppFrame />}>
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="calls" element={<CallsPage />} />
              <Route path="harness/cursor" element={<CursorSettingsPage />} />
              <Route path="plugins" element={<PluginManagementPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      <BuiltinLoginModal
        open={builtinLoginOpen}
        busy={cursorBusy}
        onClose={() => setBuiltinLoginOpen(false)}
        onSubmit={saveBuiltinModel}
      />
      <AppMessages />
    </TooltipProvider>
  );
}

function AppMessages() {
  const { error } = useAppStore();
  const previousError = useRef<string | null>(null);
  const showMessage = useMessage();

  useEffect(() => {
    if (error && error !== previousError.current) showMessage(error);
    previousError.current = error;
  }, [error, showMessage]);



  return <MessageProvider />;
}
