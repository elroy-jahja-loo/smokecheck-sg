import type { ReactNode } from "react";
import styles from "./badge.module.css";

type BadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "success" | "danger" | "warning" | "blue" | "dark";
  className?: string;
};

export function Badge({ children, tone = "neutral", className = "" }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[tone]} ${className}`.trim()}>{children}</span>;
}
