import type { ReactNode } from "react";
import styles from "./alert-banner.module.css";

type AlertBannerProps = {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
};

export function AlertBanner({ children, tone = "info" }: AlertBannerProps) {
  return (
    <div className={`${styles.alert} ${styles[tone]}`} role="status">
      <span className={styles.icon} aria-hidden="true">!</span>
      <div>{children}</div>
    </div>
  );
}
