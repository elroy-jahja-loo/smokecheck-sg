import type { ReactNode } from "react";
import styles from "./card.module.css";

type CardProps = {
  children: ReactNode;
  title?: string;
  tone?: "default" | "success" | "danger" | "warning" | "officer";
  className?: string;
};

export function Card({ children, title, tone = "default", className = "" }: CardProps) {
  return (
    <section className={`${styles.card} ${styles[tone]} ${className}`.trim()}>
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      {children}
    </section>
  );
}
