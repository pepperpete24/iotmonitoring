/**
 * Holding page for screens built in later milestones. Says what will appear
 * and when, like any empty state.
 */
import styles from "./Pending.module.css";

export function Pending({ title, job, milestone }: { title: string; job: string; milestone: string }) {
  return (
    <div className={styles.page}>
      <h1 className="t-title">{title}</h1>
      <p className="t-body t-prose">{job}</p>
      <p className="t-small">This screen is built in {milestone}.</p>
    </div>
  );
}
