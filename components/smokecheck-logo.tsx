import styles from "./smokecheck-logo.module.css";

type SmokeCheckLogoProps = {
  variant?: "public" | "officer";
  label?: string;
};

export function SmokeCheckLogo({ variant = "public", label = "SmokeCheck SG" }: SmokeCheckLogoProps) {
  return (
    <div className={styles.logo} aria-label={label}>
      <span className={`${styles.mark} ${styles[variant]}`} aria-hidden="true">
        <svg viewBox="0 0 32 32" role="img" focusable="false">
          <path className={styles.shield} d="M16 2 6 6v8c0 8 5.3 13.2 10 16 4.7-2.8 10-8 10-16V6L16 2Z" />
          <path className={styles.pin} d="M16 8.2c-3 0-5.4 2.4-5.4 5.4 0 3.7 5.4 9.5 5.4 9.5s5.4-5.8 5.4-9.5c0-3-2.4-5.4-5.4-5.4Zm0 7.8a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8Z" />
          <path className={styles.check} d="m12.1 17.1 2.6 2.6 5.2-6.2" />
        </svg>
      </span>
      <span className={styles.text}>{label}</span>
    </div>
  );
}
