/** Notes and photos on an incident. Each one is a Logbook entry. */
import { useState } from "react";
import { Camera } from "lucide-react";
import { useCommand } from "@/api/queries";
import type { IncidentDetail } from "@/api/types";
import { Button } from "@/components/Button";
import { formatDateTime } from "@/lib/format";
import { useUi } from "@/state/ui";
import styles from "./IncidentDetailPage.module.css";

export function NotesAndPhotos({ i }: { i: IncidentDetail }) {
  const by = useUi((s) => s.role);
  const cmd = useCommand();
  const [text, setText] = useState("");
  const [caption, setCaption] = useState("");
  const items = [...i.notes.map((n) => ({ ...n, kind: "note" as const, body: n.text })), ...i.photos.map((p) => ({ ...p, kind: "photo" as const, body: p.caption }))].sort((a, z) => a.at - z.at);
  return (
    <section className={styles.section} aria-labelledby="notes-h">
      <h2 id="notes-h" className="t-section">
        Notes and photos
      </h2>
      {items.length ? (
        <ol className={styles.notes}>
          {items.map((n, k) => (
            <li key={k}>
              {n.kind === "photo" ? (
                <figure className={styles.photo}>
                  <div className={styles.photoFrame} aria-hidden>
                    <Camera size={20} strokeWidth={1.5} />
                  </div>
                  <figcaption>{n.body}</figcaption>
                </figure>
              ) : (
                <p>{n.body}</p>
              )}
              <p className="t-small">
                {n.by}, {formatDateTime(n.at, i.zone, { year: false })}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="soft">No notes yet. Notes and photos added here are kept with the incident record and appear in the incident report.</p>
      )}
      <form
        className={styles.noteForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          cmd.mutate({ type: "note", incidentId: i.id, text: text.trim(), by }, { onSuccess: () => setText("") });
        }}
      >
        <label>
          <span className="visually-hidden">Add a note</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Add a note: what you saw, who you spoke to, what happens next" />
        </label>
        <div className={styles.noteRow}>
          <Button type="submit" disabled={!text.trim()}>
            Add note
          </Button>
        </div>
      </form>
      <form
        className={styles.noteForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (!caption.trim()) return;
          cmd.mutate({ type: "photo", incidentId: i.id, caption: caption.trim(), by }, { onSuccess: () => setCaption("") });
        }}
      >
        <label>
          <span className="visually-hidden">Photo caption</span>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Photo caption, for example: seal leaking at pump P-02" />
        </label>
        <div className={styles.noteRow}>
          <Button type="submit" disabled={!caption.trim()}>
            Add photo
          </Button>
          <span className="t-small">In this demo the camera is not connected; the caption is recorded.</span>
        </div>
      </form>
    </section>
  );
}
