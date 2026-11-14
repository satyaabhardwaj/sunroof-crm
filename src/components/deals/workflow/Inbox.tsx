import { useState } from "react";
import type { Notice, TaskRow, Workspace, Order } from "./model";
import { Dialog, when } from "./common";

type Save = (path: string, body: unknown) => Promise<boolean>;
const BELL = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9M10 20a2 2 0 0 0 4 0" />
  </svg>
);
const LIST = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
  </svg>
);

/** Header buttons: the bell (two columns, cross per line, Clear all, red count) and the task list. */
export function Inbox({
  data,
  busy,
  save,
  openOrder,
}: {
  data: Workspace;
  busy: boolean;
  save: Save;
  openOrder: (o: Order) => void;
}) {
  const [bell, setBell] = useState(false);
  const [tasks, setTasks] = useState(false);
  const notes = data.notifications ?? [];
  const unread = notes.filter((n) => n.unread).length;
  const mine = data.tasks?.toMe ?? [];
  const overdue = mine.filter((t) => t.overdue).length;
  const go = (orderId: string) => {
    const o = data.orders.find((x) => x.id === orderId);
    if (o) {
      setBell(false);
      setTasks(false);
      openOrder(o);
    }
  };
  return (
    <>
      <button
        type="button"
        className="btn round bell"
        aria-label={`Tasks, ${mine.length} for you${overdue ? `, ${overdue} overdue` : ""}`}
        onClick={() => setTasks(true)}
      >
        {LIST}
        {!!mine.length && (
          <span className={"badge" + (overdue ? "" : " calm")}>
            {mine.length > 99 ? "99+" : mine.length}
          </span>
        )}
      </button>
      <button
        type="button"
        className="btn round bell"
        aria-label={`Notifications, ${unread} new`}
        onClick={() => {
          setBell(true);
          if (unread) void save("notifications/seen", {});
        }}
      >
        {BELL}
        {!!unread && (
          <span className="badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>
      {bell && (
        <Dialog
          title="Notifications"
          sub="Newest first"
          busy={busy}
          onClose={() => setBell(false)}
        >
          <div className="sun-bell">
            {(
              [
                ["work", "Work"],
                ["payments", "Payments"],
              ] as const
            ).map(([column, title]) => (
              <Column
                key={column}
                title={title}
                items={notes.filter((n) => n.column === column)}
                clear={() => void save("notifications/hide", { column })}
                hide={(id) => void save("notifications/hide", { ids: [id] })}
                go={go}
                client={(id) => data.orders.find((o) => o.id === id)?.client}
              />
            ))}
          </div>
        </Dialog>
      )}
      {tasks && (
        <Dialog
          title="Tasks"
          sub="Given to you and given by you"
          busy={busy}
          onClose={() => setTasks(false)}
        >
          <Tasks data={data} save={save} go={go} />
        </Dialog>
      )}
    </>
  );
}

function Column({
  title,
  items,
  clear,
  hide,
  go,
  client,
}: {
  title: string;
  items: Notice[];
  clear: () => void;
  hide: (id: string) => void;
  go: (orderId: string) => void;
  client: (orderId: string) => string | undefined;
}) {
  return (
    <section className="bell-col">
      <div className="note-h">
        <b>{title}</b>
        <span>{items.length || ""}</span>
        {!!items.length && (
          <button type="button" className="btn small" onClick={clear}>
            Clear all
          </button>
        )}
      </div>
      {items.map((n) => (
        <div className={"note" + (n.unread ? " new" : "")} key={n.id}>
          <button type="button" className="who" onClick={() => go(n.orderId)}>
            <b>{client(n.orderId) || n.reference}</b>
            <small>{n.text}</small>
            <small className="sub">{when(n.at)}</small>
          </button>
          <button
            type="button"
            className="note-x"
            aria-label="Remove this notification"
            onClick={() => hide(n.id)}
          >
            ×
          </button>
        </div>
      ))}
      {!items.length && <p className="empty">Nothing new.</p>}
    </section>
  );
}

function Tasks({
  data,
  save,
  go,
}: {
  data: Workspace;
  save: Save;
  go: (orderId: string) => void;
}) {
  const [tab, setTab] = useState<"toMe" | "byMe" | "done">("toMe");
  const [noteFor, setNoteFor] = useState("");
  const [note, setNote] = useState("");
  const rows: TaskRow[] = data.tasks?.[tab] ?? [];
  const report = async (t: TaskRow, status: "done" | "not_done") => {
    const ok = await save(`tasks/${t.orderId}/report`, { status, note });
    if (ok) {
      setNoteFor("");
      setNote("");
    }
  };
  return (
    <>
      <div className="sun-views" role="tablist" aria-label="Tasks">
        {(
          [
            ["toMe", "For me"],
            ["byMe", "Given by me"],
            ["done", "Done"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "on" : ""}
            onClick={() => setTab(id)}
          >
            {label} <span>{data.tasks?.[id]?.length ?? 0}</span>
          </button>
        ))}
      </div>
      <p className="sub">
        Tasks come from the work itself: booking a visit, sending a payment to
        Accounts, handing over to the factory. They close by themselves when the
        step is done. Here you report progress.
      </p>
      <div className="sun-tasks">
        {rows.map((t) => (
          <article
            className={"sun-task" + (t.overdue ? " late" : "")}
            key={t.id}
          >
            <div>
              <b>{t.title}</b>
              <button
                type="button"
                className="sun-client-link"
                onClick={() => go(t.orderId)}
              >
                {t.client} · {t.reference}
              </button>
              <small className="sub">
                {tab === "byMe"
                  ? "For " + t.to
                  : t.by
                    ? "Given by " + t.by
                    : "From the workflow"}
                {t.since ? " · " + when(t.since) : ""}
                {t.closedAt
                  ? " · closed " +
                    when(t.closedAt) +
                    (t.closedBy ? " by " + t.closedBy : "")
                  : ""}
              </small>
              {t.report && (
                <small
                  className={t.report.status === "done" ? "sun-ok" : "sun-late"}
                >
                  {t.report.by}:{" "}
                  {t.report.status === "done" ? "done" : "not done"}
                  {t.report.note ? " · " + t.report.note : ""}
                </small>
              )}
            </div>
            <div className="sun-task-side">
              <span className={t.overdue ? "sun-late" : "sub"}>
                {t.due
                  ? (t.overdue ? "Overdue · " : "Due ") +
                    new Date(t.due + "T00:00").toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })
                  : "No due date"}
              </span>
              {tab === "toMe" && data.writable && (
                <>
                  <button
                    type="button"
                    className="btn small dark"
                    onClick={() => void report(t, "done")}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => setNoteFor(noteFor === t.id ? "" : t.id)}
                  >
                    Not done
                  </button>
                </>
              )}
            </div>
            {noteFor === t.id && (
              <div className="dept-review">
                <label>
                  Why is it not done?
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={2000}
                  />
                </label>
                <button
                  type="button"
                  className="btn small"
                  disabled={!note.trim()}
                  onClick={() => void report(t, "not_done")}
                >
                  Send
                </button>
              </div>
            )}
          </article>
        ))}
        {!rows.length && <p className="sun-empty">No tasks here.</p>}
      </div>
    </>
  );
}
