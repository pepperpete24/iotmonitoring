/** Equipment tag set like an engraved plant-room label. Tags only, never a badge. */
import styles from "./Tag.module.css";

export function Tag({ children, title }: { children: string; title?: string }) {
  return (
    <span className={styles.tag} title={title}>
      {children}
    </span>
  );
}
