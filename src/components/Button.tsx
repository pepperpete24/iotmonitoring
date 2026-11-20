import { forwardRef } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "quiet";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "normal" | "large";
}

/** A button names its action. Primary is jade; destructive actions are secondary with a confirmation. */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "normal", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[styles.button, styles[variant], size === "large" && styles.large, className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
});

/** Segmented choice, for layer switches, date ranges and saved views. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={styles.segmented}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={styles.segment}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            const i = options.findIndex((x) => x.value === value);
            const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            const next = options[(i + step + options.length) % options.length]!;
            onChange(next.value);
            const group = e.currentTarget.parentElement;
            const btn = group?.querySelectorAll<HTMLButtonElement>("button")[options.indexOf(next)];
            btn?.focus();
          }}
          tabIndex={o.value === value ? 0 : -1}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
