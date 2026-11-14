import { useMemo, useState, type ReactNode } from "react";
import type { Order, Workspace } from "./model";
import type { Focus, OpenOrder } from "./common";

export type ViewId =
  "cards" | "table" | "kanban" | "calendar" | "agenda" | "status";
const VIEWS: [ViewId, string][] = [
  ["cards", "Cards"],
  ["table", "Table"],
  ["kanban", "Kanban"],
  ["calendar", "Calendar"],
  ["agenda", "Agenda"],
  ["status", "Status"],
];

const remembered = (key: string): ViewId => {
  try {
    const v = localStorage.getItem("sunrooof.view." + key);
    return (VIEWS.some(([id]) => id === v) ? v : "cards") as ViewId;
  } catch {
    return "cards";
  }
};

type Props = {
  storageKey: string;
  data: Workspace;
  orders: Order[];
  open: OpenOrder;
  focus: Focus;
  table: ReactNode;
};

/** One list of orders, shown as a table, a Kanban board by stage, a month calendar or an agenda. */
export function OrderViews({
  storageKey,
  data,
  orders,
  open,
  focus,
  table,
}: Props) {
  const [view, setView] = useState<ViewId>(() => remembered(storageKey));
  const pick = (id: ViewId) => {
    setView(id);
    try {
      localStorage.setItem("sunrooof.view." + storageKey, id);
    } catch {
      /* the choice just isn't remembered */
    }
  };
  return (
    <>
      <div className="sun-views" role="tablist" aria-label="View">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={view === id ? "on" : ""}
            onClick={() => pick(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "table" && table}
      {view === "cards" && (
        <Cards data={data} orders={orders} open={open} focus={focus} />
      )}
      {view === "status" && (
        <Status data={data} orders={orders} open={open} focus={focus} />
      )}
      {view === "kanban" && (
        <Kanban data={data} orders={orders} open={open} focus={focus} />
      )}
      {view === "calendar" && (
        <Calendar data={data} orders={orders} open={open} focus={focus} />
      )}
      {view === "agenda" && (
        <Agenda data={data} orders={orders} open={open} focus={focus} />
      )}
    </>
  );
}

type Inner = Omit<Props, "table" | "storageKey">;
const ownerName: Record<string, string> = {
  design: "Designer",
  "design-head": "Design Head",
  measurement: "Measurement",
  accounts: "Accounts",
  factory: "Factory",
  dispatch: "Dispatch",
};

function Kanban({ data, orders, open, focus }: Inner) {
  const [all, setAll] = useState(false);
  const stages = data.stages ?? [];
  const columns = stages
    .map((s) => ({
      ...s,
      cards: orders.filter((o) => o.stageInfo?.key === s.key),
    }))
    .filter((c) => all || c.cards.length);
  return (
    <>
      <label className="dept-check sun-kanban-toggle">
        <input
          type="checkbox"
          checked={all}
          onChange={(e) => setAll(e.target.checked)}
        />{" "}
        Show empty stages
      </label>
      <div className="sun-kanban" aria-label="Orders by stage">
        {columns.map((c) => (
          <section className="sun-kanban-col" key={c.key}>
            <header>
              <b>{c.label}</b>
              <span className={"sun-owner sun-owner-" + c.owner}>
                {ownerName[c.owner] || c.owner}
              </span>
              <span className="sun-count">{c.cards.length}</span>
            </header>
            {c.cards.map((o) => (
              <button
                key={o.id}
                type="button"
                className="sun-kanban-card"
                onClick={() => open(o, focus)}
              >
                <b>{o.client}</b>
                <small>
                  {o.reference} · {o.location}
                </small>
                {o.stageInfo?.detail && <small>{o.stageInfo.detail}</small>}
                <small>
                  {data.designers.find((d) => d.id === o.designerId)?.name ||
                    "Designer to assign"}
                </small>
                {o.task?.due && (
                  <small className={late(o.task.due) ? "sun-late" : ""}>
                    Due {short(o.task.due)}
                  </small>
                )}
              </button>
            ))}
            {!c.cards.length && <p className="sun-empty">Nothing here.</p>}
          </section>
        ))}
        {!columns.length && <p className="sun-empty">No orders to show.</p>}
      </div>
    </>
  );
}

type Event = {
  date: string;
  time?: string;
  label: string;
  order: Order;
  tone: "visit" | "date" | "task";
};
const DATE_LABELS: [string, string][] = [
  ["requiredDispatch", "Needed by"],
  ["rafterDispatch", "Rafter dispatch"],
  ["consoleDispatch", "Console dispatch"],
  ["rafterInstallation", "Rafter installation"],
  ["consoleInstallation", "Console installation"],
  ["inauguration", "Puja / handover"],
];

function events(data: Workspace, orders: Order[]): Event[] {
  const out: Event[] = [];
  for (const o of orders) {
    for (const v of o.visits || []) {
      if (v.status === "rejected") continue;
      const at = new Date(v.start);
      out.push({
        date: localDate(at),
        time: at.toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
        }),
        label:
          (v.kind === "pdi" ? "PDI" : "Measurement") +
          " · " +
          (data.workers.find((w) => w.id === v.workerId)?.name || ""),
        order: o,
        tone: "visit",
      });
    }
    for (const [key, label] of DATE_LABELS) {
      const value = o.dates?.[key as keyof NonNullable<Order["dates"]>];
      if (value) out.push({ date: value, label, order: o, tone: "date" });
    }
    if (o.task?.due && o.task.title)
      out.push({
        date: o.task.due,
        label: "Due: " + o.task.title,
        order: o,
        tone: "task",
      });
  }
  return out.sort((a, b) =>
    (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")),
  );
}

function Calendar({ data, orders, open, focus }: Inner) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const today = localDate(new Date());
  const [chosen, setChosen] = useState(today);
  const all = useMemo(() => events(data, orders), [data, orders]);
  const first = new Date(month);
  first.setDate(1 - ((month.getDay() + 6) % 7)); // weeks start on Monday
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    return d;
  });
  const move = (n: number) =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const picked = all.filter((e) => e.date === chosen);
  const inMonth = all.filter((e) =>
    e.date.startsWith(localDate(month).slice(0, 7)),
  );
  const overdueTasks = inMonth.filter(
    (e) => e.tone === "task" && e.date < today,
  ).length;
  return (
    <div className="sun-calendar">
      <div className="sun-calendar-bar">
        <button
          type="button"
          className="btn small"
          onClick={() => move(-1)}
          aria-label="Previous month"
        >
          ‹
        </button>
        <b>
          {month.toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric",
          })}
        </b>
        <button
          type="button"
          className="btn small"
          onClick={() => move(1)}
          aria-label="Next month"
        >
          ›
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            const d = new Date();
            setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            setChosen(today);
          }}
        >
          Today
        </button>
      </div>
      <div className="sun-calendar-split">
        <div className="sun-calendar-grid" role="grid">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div className="sun-calendar-head" role="columnheader" key={d}>
              {d}
            </div>
          ))}
          {days.map((d) => {
            const key = localDate(d);
            const list = all.filter((e) => e.date === key);
            const tone = !list.length
              ? ""
              : key < today
                ? list.some((e) => e.tone === "task")
                  ? " overdue"
                  : " past"
                : key === today
                  ? " now"
                  : " coming";
            return (
              <button
                type="button"
                role="gridcell"
                key={key}
                aria-selected={key === chosen}
                aria-label={long(key) + ", " + list.length + " items"}
                onClick={() => setChosen(key)}
                className={
                  "sun-calendar-day" +
                  tone +
                  (d.getMonth() !== month.getMonth() ? " out" : "") +
                  (key === today ? " today" : "") +
                  (key === chosen ? " chosen" : "")
                }
              >
                <span className="sun-calendar-num">{d.getDate()}</span>
                {!!list.length && (
                  <span className="sun-calendar-count">{list.length}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="sun-calendar-list">
          <h3>{long(chosen)}</h3>
          {picked.map((e, i) => (
            <button
              type="button"
              key={i}
              className={"row a-row sun-event-" + e.tone}
              onClick={() => open(e.order, focus)}
            >
              <span className="who">
                <b>{e.order.client}</b>
                <small>{e.label}</small>
              </span>
              <span className="sub">{e.time || e.order.reference}</span>
            </button>
          ))}
          {!picked.length && <p className="sun-empty">Nothing on this day.</p>}
        </div>
      </div>
      <p className="sun-calendar-legend">
        <span className="overdue">Overdue</span>
        <span className="now">Today</span>
        <span className="coming">Coming up</span> · {inMonth.length} this month
        {overdueTasks ? ` · ${overdueTasks} overdue tasks` : ""}
      </p>
    </div>
  );
}

const lastNote = (o: Order) => o.history?.at(-1);
const daysSince = (iso?: string) =>
  iso
    ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
    : null;
const lakh = (paise?: number | null) =>
  paise ? "₹" + (paise / 10000000).toFixed(paise >= 1e8 ? 1 : 2) + " L" : "";

/** One card per order: where it is, where it goes next, who has it, by when, and the latest note. */
function Cards({ data, orders, open, focus }: Inner) {
  const stages = data.stages ?? [];
  const sorted = [...orders].sort(
    (a, b) =>
      Number(!!b.task?.due && late(b.task.due)) -
        Number(!!a.task?.due && late(a.task.due)) ||
      (a.task?.due || "9999").localeCompare(b.task?.due || "9999"),
  );
  return (
    <div className="sun-cards">
      {sorted.map((o) => {
        const info = o.stageInfo;
        const at = stages.findIndex((s) => s.key === info?.key);
        const next = at >= 0 ? stages[at + 1] : undefined;
        const note = lastNote(o);
        const overdue = o.task?.due && late(o.task.due);
        const stay = daysSince(o.task?.since);
        return (
          <article className={"sun-card" + (overdue ? " late" : "")} key={o.id}>
            <div className="sun-card-stage">
              <span className={"sun-owner sun-owner-" + (info?.owner || "")}>
                {info?.label || o.stage}
              </span>
              {next && <small>→ {next.label}</small>}
              {overdue && (
                <b className="sun-late">
                  Overdue {daysSince(o.task!.due + "T00:00")} d
                </b>
              )}
            </div>
            <div
              className="sun-progress"
              aria-label={`Step ${info?.step} of ${info?.of}`}
            >
              <i
                style={{
                  width: `${((info?.step || 0) / (info?.of || 20)) * 100}%`,
                }}
              />
            </div>
            <div className="sun-card-head">
              <button
                type="button"
                className="sun-client-link"
                onClick={() => open(o, focus)}
              >
                {o.client}
              </button>
              <b>{lakh((o as Order & { value?: number }).value)}</b>
            </div>
            <small className="sub">
              {o.location} · {o.reference}
              {o.area ? " · " + o.area : ""}
            </small>
            <div className="sun-card-facts">
              <span>
                <small>With</small>
                {o.task
                  ? data.designers.find(
                      (d) => "designer:" + d.id === o.task!.to,
                    )?.name ||
                    data.workers.find((w) => "worker:" + w.id === o.task!.to)
                      ?.name ||
                    o.task.to
                      .replace("dept:", "")
                      .replace("design-head", "Design Head")
                  : "—"}
              </span>
              <span>
                <small>{overdue ? "Was due" : "Due"}</small>
                {o.task?.due ? short(o.task.due) : "No date"}
              </span>
              <span>
                <small>At this stage</small>
                {stay == null ? "—" : stay + " days"}
              </span>
            </div>
            {note && (
              <p className="sun-card-note">
                <small>
                  Last note ·{" "}
                  {new Date(note.at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </small>
                {note.text}
              </p>
            )}
            {o.task && (
              <div className="sun-card-next">
                <small>Next action</small>
                <b>{o.task.title}</b>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => open(o, focus)}
                >
                  Open
                </button>
              </div>
            )}
          </article>
        );
      })}
      {!sorted.length && <p className="sun-empty">No orders to show.</p>}
    </div>
  );
}

/** How many orders sit at each stage, grouped by who owns the stage. */
function Status({ data, orders, open, focus }: Inner) {
  const [stage, setStage] = useState("");
  const stages = data.stages ?? [];
  const most = Math.max(
    1,
    ...stages.map(
      (s) => orders.filter((o) => o.stageInfo?.key === s.key).length,
    ),
  );
  const owners = Array.from(new Set(stages.map((s) => s.owner)));
  const chosen = orders.filter((o) => o.stageInfo?.key === stage);
  return (
    <div className="sun-status">
      {owners.map((owner) => (
        <section key={owner}>
          <h3>{ownerName[owner] || owner}</h3>
          {stages
            .filter((s) => s.owner === owner)
            .map((s) => {
              const n = orders.filter((o) => o.stageInfo?.key === s.key).length;
              return (
                <button
                  type="button"
                  key={s.key}
                  className={"sun-status-row" + (stage === s.key ? " on" : "")}
                  aria-pressed={stage === s.key}
                  onClick={() => setStage(stage === s.key ? "" : s.key)}
                >
                  <span>{s.label}</span>
                  <i style={{ width: `${(n / most) * 100}%` }} />
                  <b>{n}</b>
                </button>
              );
            })}
        </section>
      ))}
      {stage && (
        <section className="sun-status-list">
          {chosen.map((o) => (
            <button
              type="button"
              key={o.id}
              className="row a-row"
              onClick={() => open(o, focus)}
            >
              <span className="who">
                <b>{o.client}</b>
                <small>{o.journey}</small>
              </span>
              <span className="sub">{o.reference}</span>
            </button>
          ))}
          {!chosen.length && (
            <p className="sun-empty">No orders at this stage.</p>
          )}
        </section>
      )}
    </div>
  );
}

function Agenda({ data, orders, open, focus }: Inner) {
  const today = localDate(new Date());
  const list = events(data, orders).filter((e) => e.date >= today);
  const byDay = list.reduce<Record<string, Event[]>>((acc, e) => {
    (acc[e.date] ||= []).push(e);
    return acc;
  }, {});
  return (
    <div className="sun-agenda">
      {Object.entries(byDay).map(([date, items]) => (
        <section key={date}>
          <h3>{long(date)}</h3>
          {items.map((e, i) => (
            <button
              type="button"
              key={i}
              className={"row a-row sun-event-" + e.tone}
              onClick={() => open(e.order, focus)}
            >
              <span className="who">
                <b>{e.order.client}</b>
                <small>{e.label}</small>
              </span>
              <span className="sub">{e.time || e.order.reference}</span>
            </button>
          ))}
        </section>
      ))}
      {!list.length && (
        <p className="sun-empty">Nothing coming up for these orders.</p>
      )}
    </div>
  );
}

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const late = (date: string) => date < localDate(new Date());
const short = (date: string) =>
  new Date(date + "T00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
const long = (date: string) =>
  new Date(date + "T00:00").toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
