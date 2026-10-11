import { useState } from "react";
import KeepAliveRouteOutlet from "keepalive-for-react-router";
import { NavLink, useLocation } from "react-router-dom";
import { PageLayout } from "./layout/PageLayout";
import { Card } from "../shared/ui/Card";
import controls from "../shared/ui/Controls.module.scss";
import { Icon } from "../shared/ui/Icon";
import { TooltipTrigger } from "../shared/ui/TooltipTrigger";
import { flatColorAreaChartIcon, flatColorBarChartIcon, flatColorSettingsIcon, refreshIcon } from "../shared/ui/icons";
import { appStore, useAppStore } from "../shared/store/appStore";
import styles from "./AppLayout.module.scss";
import { PageActionsTarget } from "./PageActions";

const keptAlivePages = ["/settings"];

export function AppLayout() {
  const { busy } = useAppStore();
  const location = useLocation();
  const [leftActionTarget, setLeftActionTarget] = useState<HTMLDivElement | null>(null);
  const [rightActionTarget, setRightActionTarget] = useState<HTMLDivElement | null>(null);
  const menuItems = [
    { path: "/", label: "我的服务", icon: flatColorAreaChartIcon },
    { path: "/usage", label: "使用明细", icon: flatColorBarChartIcon },
    { path: "/settings", label: "系统设置", icon: flatColorSettingsIcon },
  ];
  return <PageLayout className={styles.root}>
    <Card as="aside" className={styles.menuCard}>
      <nav className={styles.navigation} aria-label="主菜单">
        {menuItems.map(item => <div className={styles.navigationRow} key={item.path}>
          <NavLink to={item.path} end={item.path === "/"}>
            <Icon icon={item.icon} size="1.3em" /><span>{item.label}</span>
          </NavLink>
        </div>)}
        <div className={styles.contact}>Q群:25963527</div>
      </nav>
    </Card>
    <main className={styles.content}>
      {!["/", "/usage"].includes(location.pathname) && <div className={styles.actionRegion}>
        <Card className={styles.actions}>
          <div ref={setLeftActionTarget} className={styles.pageActions} />
          {location.pathname !== "/" && <TooltipTrigger label={t("刷新")}><button className={controls.iconButton} aria-label={t("刷新")} disabled={busy} onClick={() => void appStore.refresh()}>
            <Icon className={busy ? controls.spin : ""} icon={refreshIcon} size="1.1em" />
          </button></TooltipTrigger>}
          <div ref={setRightActionTarget} className={styles.pageActions} />
        </Card>
      </div>}
      <PageActionsTarget.Provider value={{ left: leftActionTarget, right: rightActionTarget }}>
        <KeepAliveRouteOutlet
          activeCacheKey={location.pathname}
          include={keptAlivePages}
          max={keptAlivePages.length}
          enableActivity
          containerClassName={styles.keepAliveContainer}
          cacheNodeClassName={styles.keepAlivePage}
        />
      </PageActionsTarget.Provider>
    </main>
  </PageLayout>;
}
