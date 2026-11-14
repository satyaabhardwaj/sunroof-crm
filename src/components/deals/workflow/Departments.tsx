import { CashStrip, CashDetails } from "./CashFlow";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AppHeader, Sidebar, Skeleton } from "./shell";
import { useWorkflowApi } from "@/hooks/use-workflow-api";
import { department, type Workspace, type Order } from "./model";
import {
  Card,
  labelTables,
  Facts,
  Pill,
  Dialog,
  titles,
  stageName,
  when,
  type Focus,
  type OpenOrder,
} from "./common";
import { Dashboard, menus, needs } from "./Dashboard";
import { PaymentWindow } from "./PaymentWindow";
import { DesignFlow } from "./DesignFlow";

const blank: Workspace = {
  revision: 0,
  writable: false,
  orders: [],
  designers: [],
  workers: [],
  availability: [],
  department: department(),
  access: "",
  staffId: "",
  departments: [],
  demo: false,
};
export function DepartmentApp() {
  const { request, client } = useWorkflowApi();
  useEffect(() => {
    labelTables();
    const observer = new MutationObserver(labelTables);
    observer.observe(document.getElementById("workflow-root")!, {
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);
  const [data, setData] = useState(blank),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(() => location.hash.slice(1) || "today"),
    [search, setSearch] = useState(""),
    [person, setPerson] = useState(""),
    [orderId, setOrderId] = useState<string | null>(null),
    [showTeam, setShowTeam] = useState(false);
  const [focus, setFocus] = useState<Focus>("work"),
    [itemId, setItemId] = useState(""),
    [showUpdates, setShowUpdates] = useState(false);
  const working = useRef(false),
    opened = useRef(false),
    generation = useRef(0);
  const dept = ready ? data.department : department(),
    can = data.writable,
    admin = data.access === "admin",
    head = dept === "design-head";
  async function load(background = false) {
    const g = generation.current;
    try {
      const value = await request();
      if (g !== generation.current) return;
      setData(value);
      if (
        value.access !== "admin" &&
        value.access !== "observer" &&
        value.department !== department()
      ) {
        location.replace("/" + value.department + "/");
        return;
      }
      setReady(true);
      if (!background) setError("");
    } catch (e) {
      if (!background) setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (
        !working.current &&
        !opened.current &&
        !document.hidden &&
        !document.activeElement?.matches("input,select,textarea")
      )
        void load(true);
    }, 4000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    opened.current = !!orderId || showTeam || showUpdates;
  }, [orderId, showTeam, showUpdates]);
  async function save(path: string, body: unknown) {
    if (working.current) return false;
    working.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    try {
      setData(
        await request(path, { ...(body as object), revision: data.revision }),
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function upload(o: Order, file: File, kind: string, visitId: string) {
    working.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    try {
      const response = await client.put<Workspace>(
        `/api/sunroof/orders/${o.id}/documents`,
        file,
        {
          params: { revision: data.revision, kind, department: dept, visitId },
          headers: { "Content-Type": file.type },
        },
      );
      const result = response.data;
      setData(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  const open: OpenOrder = (
    o,
    next = dept === "accounts" ? "payments" : "work",
    item = "",
  ) => {
    setOrderId(o.id);
    setFocus(next);
    setItemId(item);
    setError("");
  };
  function navigate(id: string) {
    setTab(id);
    location.hash = id;
    setOrderId(null);
    setError("");
  }
  useEffect(() => {
    const change = () => {
      setTab(location.hash.slice(1) || "today");
      setOrderId(null);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.title = "Sunrooof · " + titles[dept];
  }, [dept]);
  const nav = menus[dept] || menus.design,
    activeTab = nav.some(([id]) => id === tab) ? tab : "today";
  const scoped = data.orders.filter(
    (o) =>
      (!person ||
        (dept === "measurement"
          ? (o.visits || []).some((v) => v.workerId === person)
          : o.designerId === person)) &&
      [o.client, o.reference, o.location, ...o.models.map((m) => m.code)]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selected = data.orders.find((o) => o.id === orderId);
  const updates = data.orders
    .flatMap((o) => o.history.map((h) => ({ ...h, order: o })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30);
  const pending = data.orders.reduce(
    (n, o) =>
      n + (o.receipts || []).filter((r) => r.status === "requested").length,
    0,
  );
  const sidebar = dept !== "accounts";
  function close() {
    if (!busy) {
      setOrderId(null);
      setError("");
    }
  }
  return (
    <>
      <AppHeader
        current={dept}
        brand="SUNROOOF"
        departments={data.departments.map((id) => [id, titles[id]])}
        navigation={sidebar ? titles[dept] + " navigation" : undefined}
        search={
          <input
            aria-label="Find a client"
            placeholder="Find a client"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
        actions={
          <button
            type="button"
            className="btn round bell"
            aria-label="Notifications"
            onClick={() => setShowUpdates(true)}
          >
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
          </button>
        }
      />
      <nav
        className={"stagebar" + (sidebar ? " sun-has-sidebar" : "")}
        aria-label={titles[dept] + " stages"}
      >
        {dept === "accounts" ? (
          nav.map(([id, label]) => (
            <button
              key={id}
              className={activeTab === id ? "on" : ""}
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              {label}
              {id === "approvals" && <b>{pending}</b>}
            </button>
          ))
        ) : (
          <>
            <button
              className={activeTab === "today" ? "on" : ""}
              onClick={() => navigate("today")}
            >
              {dept === "design" || dept === "factory"
                ? "My work"
                : dept === "measurement"
                  ? "Visits"
                  : "Team overview"}
            </button>
            <button
              className={activeTab !== "today" ? "on" : ""}
              onClick={() =>
                navigate(dept === "measurement" ? "assigned" : "all")
              }
            >
              {dept === "design"
                ? "Post-design"
                : dept === "measurement"
                  ? "Assigned"
                  : dept === "factory"
                    ? "Factory"
                    : "Clients"}
            </button>
          </>
        )}
        <div className="sun-stage-tools">
          {admin && (dept === "design" || dept === "measurement") && (
            <select
              aria-label="Viewing person"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
            >
              <option value="">
                {dept === "design" ? "All designers" : "All visit staff"}
              </option>
              {(dept === "design" ? data.designers : data.workers).map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {data.demo && (
            <span
              className="sun-demo"
              title="Fictional booked orders with a read-only Zoho staff reference"
            >
              Demo
            </span>
          )}
          <button
            className="btn small"
            disabled={busy}
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
      </nav>
      <div className={"body" + (dept === "accounts" ? " a-main" : "")}>
        {sidebar && (
          <Sidebar
            id={"sunrooof-" + dept}
            label={titles[dept] + " navigation"}
            items={nav.map(([id, label]) => ({
              id,
              label,
              group: "Workspace",
            }))}
            active={activeTab}
            onNavigate={navigate}
          />
        )}
        <main className="main sun-main" id="department-main">
          {sidebar && (
            <nav
              className="sun-phone-navigation"
              aria-label={titles[dept] + " pages"}
            >
              {nav.map(([id, label]) => (
                <button
                  key={id}
                  className={activeTab === id ? "on" : ""}
                  aria-current={activeTab === id ? "page" : undefined}
                  onClick={() => navigate(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
          {ready && dept !== "measurement" && (
            <CashStrip orders={scoped} view={() => navigate("cashflow")} />
          )}
          {!orderId && !showTeam && error && (
            <p className="a-error" role="alert">
              {error}
            </p>
          )}
          {!ready ? (
            <Skeleton inline label="Loading your work" />
          ) : (
            <Dashboard
              data={data}
              orders={scoped}
              dept={dept}
              tab={activeTab}
              open={open}
              person={person}
              addTeam={() => setShowTeam(true)}
            />
          )}
        </main>
      </div>
      {showUpdates && (
        <Dialog
          title="Notifications"
          sub="Latest updates"
          busy={busy}
          onClose={() => setShowUpdates(false)}
        >
          <div className="rows">
            {updates.map((h, i) => (
              <button
                className="row a-row"
                key={i}
                onClick={() => {
                  setShowUpdates(false);
                  open(
                    h.order,
                    dept === "accounts" || h.text.startsWith("Payment")
                      ? "payments"
                      : "work",
                  );
                }}
              >
                <span className="who">
                  <b>{h.order.client}</b>
                  <small>{h.text}</small>
                </span>
                <span className="sub">{when(h.at)}</span>
              </button>
            ))}
            {!updates.length && <p className="empty">No updates yet.</p>}
          </div>
        </Dialog>
      )}
      {selected && (
        <Dialog
          title={selected.client}
          sub={
            selected.reference +
            " · " +
            selected.location +
            " · " +
            selected.squareFeet +
            " sq ft"
          }
          tag={
            <Pill>
              {selected.journey || stageName[selected.stage] || selected.stage}
            </Pill>
          }
          busy={busy}
          onClose={close}
        >
          <div
            className="sun-client-tabs"
            role="tablist"
            aria-label="Client sections"
          >
            {(
              [
                [
                  "work",
                  dept === "accounts"
                    ? "Overview"
                    : dept === "factory"
                      ? "Factory"
                      : dept === "measurement"
                        ? "Visit"
                        : dept === "design-head"
                          ? "Assignment"
                          : "Current task",
                ],
                ["details", "Client details"],
                ...(dept !== "measurement" ? [["cashflow", "Cash flow"]] : []),
                ...(!["measurement", "factory"].includes(dept)
                  ? [["payments", "Payments"]]
                  : []),
                ["issues", "Issues"],
                ["history", "Activity"],
              ] as [Focus, string][]
            ).map(([id, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={focus === id}
                key={id}
                onClick={() => {
                  setFocus(id);
                  setError("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {error && (
            <div className="a-error" role="alert">
              {error}{" "}
              <button
                className="btn small"
                disabled={busy}
                onClick={() => void load()}
              >
                Refresh data
              </button>
            </div>
          )}
          {busy && (
            <p className="sub" role="status">
              Saving…
            </p>
          )}
          {focus === "cashflow" ? (
            <CashDetails order={selected} />
          ) : focus === "payments" ? (
            <fieldset className="dept-fieldset" disabled={busy || !can}>
              <PaymentWindow
                key={selected.id + itemId}
                order={selected}
                dept={dept}
                save={save}
                initialReceipt={itemId}
              />
            </fieldset>
          ) : focus === "history" ? (
            <Card title="Activity" tone="violet">
              <ol className="sun-activity">
                {selected.history
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <li key={i}>
                      <span>{h.text}</span>
                      <small className="sub">{when(h.at)}</small>
                    </li>
                  ))}
              </ol>
            </Card>
          ) : (
            <>
              <section className="card sun-client-facts">
                <div className="card-b">
                  <Facts
                    items={[
                      [
                        "Designer",
                        data.designers.find((d) => d.id === selected.designerId)
                          ?.name || "To assign",
                      ],
                      ["Location", selected.location],
                      ["Area", selected.squareFeet + " sq ft"],
                      [
                        "Next step",
                        selected.journey ||
                          stageName[selected.stage] ||
                          selected.stage,
                      ],
                    ]}
                  />
                </div>
              </section>
              <div className="cols2 a-details">
                <div className="col">
                  <Card title="Order details">
                    <div className="a-table-scroll">
                      <table className="a-table">
                        <thead>
                          <tr>
                            <th>Model code</th>
                            <th>Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.models.map((m) => (
                            <tr key={m.code}>
                              <td>{m.code}</td>
                              <td>{m.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Documents order={selected} />
                  </Card>
                  {focus === "details" && (
                    <Card title="Visits" tone="violet">
                      {(selected.visits || []).map((v) => (
                        <div className="line rule" key={v.id}>
                          <span>
                            {v.kind === "pdi" ? "PDI" : "Measurement"} ·{" "}
                            {when(v.start)}
                          </span>
                          <Pill>{v.status}</Pill>
                        </div>
                      ))}
                      {!selected.visits?.length && (
                        <p className="empty">No visits booked.</p>
                      )}
                    </Card>
                  )}
                </div>
                <div className="col">
                  {focus === "details" || dept === "accounts" ? (
                    <Card title="Next step" tone="teal">
                      <p>{needs(selected, dept)}</p>
                      {dept === "accounts" ? (
                        <button
                          className="btn dark"
                          onClick={() => setFocus("payments")}
                        >
                          Open payments
                        </button>
                      ) : (
                        <button
                          className="btn dark"
                          onClick={() => setFocus("work")}
                        >
                          Open{" "}
                          {dept === "factory"
                            ? "factory work"
                            : dept === "measurement"
                              ? "visit"
                              : "current task"}
                        </button>
                      )}
                    </Card>
                  ) : (
                    <Card
                      title={
                        focus === "issues"
                          ? "Reported issues"
                          : dept === "factory"
                            ? "Factory work"
                            : dept === "measurement"
                              ? "Visit"
                              : dept === "design-head"
                                ? "Assignment"
                                : "Current task"
                      }
                      tone={focus === "issues" ? "red" : "violet"}
                    >
                      <fieldset
                        disabled={busy || !can}
                        className="dept-fieldset"
                      >
                        <OrderActions
                          key={selected.id + dept + focus + itemId}
                          data={data}
                          order={selected}
                          dept={dept}
                          focus={focus}
                          itemId={itemId}
                          save={save}
                          upload={upload}
                        />
                      </fieldset>
                    </Card>
                  )}
                </div>
              </div>
            </>
          )}
        </Dialog>
      )}
      {showTeam && (
        <Dialog
          title="Add team member"
          busy={busy}
          onClose={() => {
            if (!busy) setShowTeam(false);
          }}
        >
          <form
            className="sun-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                kind = String(f.get("kind"));
              if (
                await save(kind === "designer" ? "designers" : "workers", {
                  name: f.get("name"),
                  location: f.get("location"),
                  ...(kind === "designer"
                    ? { payGrade: f.get("payGrade") }
                    : { kind }),
                })
              )
                setShowTeam(false);
            }}
          >
            <fieldset disabled={busy} className="dept-fieldset">
              <div className="g2">
                <label>
                  Name
                  <input name="name" required />
                </label>
                <label>
                  Location
                  <input name="location" required />
                </label>
                <label>
                  Role
                  <select name="kind">
                    <option value="designer">Designer</option>
                    <option value="executive">Measurement Executive</option>
                    <option value="installation_manager">
                      Installation Manager
                    </option>
                  </select>
                </label>
                <label>
                  Designer pay grade
                  <input name="payGrade" />
                </label>
              </div>
              {error && (
                <p role="alert" className="a-error">
                  {error}
                </p>
              )}
              <button className="btn dark">Save team member</button>
            </fieldset>
          </form>
        </Dialog>
      )}
    </>
  );
}
type Actions = {
  data: Workspace;
  order: Order;
  dept: string;
  focus: Focus;
  itemId?: string;
  save: (path: string, body: unknown) => Promise<boolean>;
  upload: (
    o: Order,
    file: File,
    kind: string,
    visitId: string,
  ) => Promise<void>;
};
function ReviewButtons({
  submit,
  label,
}: {
  submit: (approved: boolean, reason: string) => void;
  label: string;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="dept-review">
      <label>
        Reason for rejection or corrections
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
        />
      </label>
      <div>
        <button
          type="button"
          className="btn dark"
          onClick={() => submit(true, reason)}
        >
          {label}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!reason.trim()}
          onClick={() => submit(false, reason)}
        >
          Return with reason
        </button>
      </div>
    </div>
  );
}
function OrderActions({
  data,
  order: o,
  dept,
  focus,
  itemId,
  save,
  upload,
}: Actions) {
  const path = "orders/" + o.id;
  const [worker, setWorker] = useState(""),
    [date, setDate] = useState(""),
    [check, setCheck] = useState(false),
    [notes, setNotes] = useState("");
  const workers = data.workers.filter(
    (w) =>
      !!w.location &&
      (!o.location ||
        w.location.toLowerCase().includes(o.location.toLowerCase()) ||
        o.location.toLowerCase().includes(w.location.toLowerCase())),
  );
  const [allLocations, setAllLocations] = useState(false);
  const roster = allLocations ? data.workers : workers;
  const visit = (o.visits || []).find(
    (v) => !["approved", "rejected"].includes(v.status),
  );
  function form(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    return new FormData(e.currentTarget);
  }
  return (
    <>
      {dept === "design-head" && focus === "work" && (
        <>
          <h3>Assign or reassign designer</h3>
          <form
            onSubmit={(e) => {
              const f = form(e);
              void save(path + "/assignment", {
                designerId: f.get("designerId"),
              });
            }}
          >
            <div className="line">
              <select
                name="designerId"
                aria-label="Assigned designer"
                defaultValue={o.designerId}
                required
              >
                <option value="">Choose designer</option>
                {data.designers.map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name} · {d.location || "Location to confirm"}
                  </option>
                ))}
              </select>
              <button className="btn dark">Assign</button>
            </div>
          </form>
          {o.stage === "drawings" &&
            o.drawings?.at(-1)?.status === "awaiting_head" && (
              <DesignFlow
                order={o}
                dept={dept}
                save={save}
                upload={upload}
                Documents={Documents}
              />
            )}
        </>
      )}
      {dept === "design" && focus === "work" && (
        <>
          {(o.issues || []).map((i) => (
            <div className="a-error" key={i.id}>
              <strong>Factory issue</strong>
              <p>{i.text}</p>
            </div>
          ))}
          {(o.stage === "measurement" || o.clientApproved) && !visit && (
            <>
              <h3>
                {o.stage === "measurement" ? "Book measurement" : "Book PDI"}
              </h3>
              <p>
                The designer chooses the person and time. Executive bookings
                confirm directly; Installation Managers contact the client
                first.
              </p>
              <form
                className="dept-form"
                onSubmit={async (e) => {
                  const f = form(e);
                  const ok = await save(path + "/visits", {
                    workerId: f.get("workerId"),
                    start: new Date(String(f.get("start"))).toISOString(),
                    end: new Date(String(f.get("end"))).toISOString(),
                    kind: o.stage === "measurement" ? "measurement" : "pdi",
                  });
                  if (ok) {
                    setWorker("");
                    setDate("");
                  }
                }}
              >
                <label>
                  Available team member
                  <select
                    name="workerId"
                    value={worker}
                    onChange={(e) => setWorker(e.target.value)}
                    required
                    aria-label="Visit team member"
                  >
                    <option value="">Choose a person</option>
                    {roster.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} · {w.location || "Location to confirm"} ·{" "}
                        {w.kind === "executive"
                          ? "Executive"
                          : "Installation Manager"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="dept-check">
                  <input
                    type="checkbox"
                    checked={allLocations}
                    onChange={(e) => setAllLocations(e.target.checked)}
                  />{" "}
                  Include other or unconfirmed locations
                </label>
                <div className="g2">
                  <label>
                    Visit start
                    <input
                      name="start"
                      type="datetime-local"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Visit end
                    <input name="end" type="datetime-local" required />
                  </label>
                </div>
                {worker && (
                  <div className="dept-slots">
                    <strong>Booked slots for this person</strong>
                    {data.availability
                      .filter((a) => a.workerId === worker)
                      .map((a, i) => (
                        <p key={i}>
                          {when(a.start)} – {when(a.end)}
                        </p>
                      ))}
                    {!data.availability.some((a) => a.workerId === worker) && (
                      <p>No other bookings recorded.</p>
                    )}
                  </div>
                )}
                <button className="btn dark">Book visit</button>
              </form>
            </>
          )}
          {visit && (
            <section className="dept-action-card">
              <h3>
                {visit.kind === "pdi" ? "PDI" : "Measurement"} · {visit.status}
              </h3>
              <p>
                {data.workers.find((w) => w.id === visit.workerId)?.name} ·{" "}
                {when(visit.start)}
              </p>
              {visit.reviewNote && <p>{visit.reviewNote}</p>}
              {visit.flagged && (
                <p className="a-error">
                  Rescheduled {visit.reschedules} times. Please check with the
                  client.
                </p>
              )}
              {visit.status === "submitted" && (
                <>
                  <p>{visit.checklist.join(" · ")}</p>
                  <Documents order={o} ids={visit.documents} />
                  <ReviewButtons
                    label={
                      visit.kind === "pdi"
                        ? "Approve PDI"
                        : "Approve measurement"
                    }
                    submit={(approve, reason) =>
                      void save(path + "/visits/" + visit.id + "/review", {
                        approve,
                        reason,
                      })
                    }
                  />
                </>
              )}
            </section>
          )}
          {o.stage === "drawings" && (
            <DesignFlow
              order={o}
              dept={dept}
              save={save}
              upload={upload}
              Documents={Documents}
            />
          )}
          {!["measurement", "drawings", "assignment"].includes(o.stage) && (
            <p>With Factory · {stageName[o.stage] || o.stage}</p>
          )}
        </>
      )}
      {dept === "measurement" &&
        focus === "work" &&
        (o.visits || [])
          .filter(
            (v) =>
              v.id ===
                (itemId ||
                  (o.visits || []).find(
                    (x) => !["approved", "rejected"].includes(x.status),
                  )?.id ||
                  o.visits?.at(-1)?.id) &&
              (data.access === "admin" || v.workerId === data.staffId),
          )
          .map((v) => {
            const w = data.workers.find((w) => w.id === v.workerId);
            return (
              <section className="dept-action-card" key={v.id}>
                <h3>
                  {v.kind === "pdi" ? "PDI" : "Measurement"} · {v.status}
                </h3>
                <p>
                  {w?.name} · {when(v.start)} – {when(v.end)}
                </p>
                {v.reason && <p>{v.reason}</p>}
                {v.reviewNote && <p>Designer: {v.reviewNote}</p>}
                {w?.kind === "installation_manager" &&
                  ["pending", "confirmed"].includes(v.status) && (
                    <form
                      className="dept-form"
                      onSubmit={(e) => {
                        const f = form(e),
                          action = String(f.get("action"));
                        void save(path + "/visits/" + v.id, {
                          action,
                          reason: f.get("reason"),
                          ...(f.get("start")
                            ? {
                                start: new Date(
                                  String(f.get("start")),
                                ).toISOString(),
                              }
                            : {}),
                          ...(f.get("end")
                            ? {
                                end: new Date(
                                  String(f.get("end")),
                                ).toISOString(),
                              }
                            : {}),
                        });
                      }}
                    >
                      <label>
                        After contacting the client
                        <select name="action">
                          <option value="accept">Accept booking</option>
                          <option value="reschedule">Reschedule</option>
                          <option value="reject">
                            Cannot attend — return to designer
                          </option>
                        </select>
                      </label>
                      <div className="g2">
                        <label>
                          New start if changing
                          <input name="start" type="datetime-local" />
                        </label>
                        <label>
                          New end if changing
                          <input name="end" type="datetime-local" />
                        </label>
                      </div>
                      <label>
                        Reason
                        <textarea name="reason" maxLength={2000} />
                      </label>
                      <button className="btn dark">Update visit</button>
                    </form>
                  )}
                {["confirmed", "corrections"].includes(v.status) && (
                  <>
                    <h3>Visit submission</h3>
                    <p>
                      Complete the checklist and attach the drawing and site
                      photos.
                    </p>
                    <label className="dept-check">
                      <input
                        type="checkbox"
                        checked={check}
                        onChange={(e) => setCheck(e.target.checked)}
                      />{" "}
                      I have completed the site checklist
                    </label>
                    <label className="dept-label">
                      Checklist findings
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        maxLength={2000}
                      />
                    </label>
                    <div className="g2">
                      <label className="dept-label">
                        Measurement drawing
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void upload(o, f, "drawing", v.id);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <label className="dept-label">
                        Site photo
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void upload(o, f, "photo", v.id);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    <Documents order={o} />
                    <button
                      className="btn dark"
                      disabled={
                        !check ||
                        !notes.trim() ||
                        !o.documents?.some(
                          (d) => d.kind === "drawing" && d.visitId === v.id,
                        ) ||
                        !o.documents?.some(
                          (d) => d.kind === "photo" && d.visitId === v.id,
                        )
                      }
                      onClick={() =>
                        void save(path + "/visits/" + v.id, {
                          action: "submit",
                          checklist: [notes],
                          documents: (o.documents || [])
                            .filter((d) => d.visitId === v.id)
                            .map((d) => d.id),
                        })
                      }
                    >
                      Submit to designer
                    </button>
                  </>
                )}
                {["submitted", "approved"].includes(v.status) && (
                  <p>
                    {v.status === "submitted"
                      ? "Submitted to the designer for review."
                      : "Approved by the designer."}
                  </p>
                )}
              </section>
            );
          })}
      {dept === "factory" && focus === "work" && (
        <>
          <h3>Production controls</h3>
          <p>All model codes and quantities move together.</p>
          <div className="dept-buttons">
            {o.stage === "handover" && !o.factoryAccepted && (
              <button
                className="btn dark"
                onClick={() =>
                  void save(path + "/factory", { action: "accept" })
                }
              >
                Accept handover
              </button>
            )}
            {o.stage === "handover" && o.factoryAccepted && (
              <button
                className="btn dark"
                onClick={() =>
                  void save(path + "/factory", { action: "start" })
                }
              >
                Start production
              </button>
            )}
            {o.stage === "production" && (
              <button
                className="btn dark"
                onClick={() =>
                  void save(path + "/factory", { action: "complete" })
                }
              >
                Mark production completed
              </button>
            )}
            {o.stage === "qc" && (
              <button
                className="btn dark"
                onClick={() =>
                  void save(path + "/factory", { action: "qc_pass" })
                }
              >
                QC passed
              </button>
            )}
            {o.stage === "packing" && !o.packedAt && (
              <button
                className="btn dark"
                onClick={() =>
                  void save(path + "/factory", { action: "packed" })
                }
              >
                Confirm packed
              </button>
            )}
          </div>
          {o.stage === "qc" && (
            <form
              className="dept-form"
              onSubmit={(e) => {
                const f = form(e);
                void save(path + "/factory", {
                  action: "qc_fail",
                  remedy: f.get("remedy"),
                  reason: f.get("reason"),
                });
              }}
            >
              <label>
                If QC fails
                <select name="remedy">
                  <option value="repair">Repair</option>
                  <option value="reproduce">Reproduce</option>
                </select>
              </label>
              <label>
                Mandatory reason
                <textarea name="reason" required maxLength={2000} />
              </label>
              <button className="btn">Record failed QC</button>
            </form>
          )}
          {["repair", "reproduce"].includes(o.stage) && (
            <p className="sub">
              Rework scope is flagged for confirmation. This order cannot
              proceed to packing without a fresh QC pass; the rework-return
              action is not enabled yet.
            </p>
          )}
          {o.packedAt && (
            <p className="sub">
              Packed. Dispatch clearance requires confirmed dues and the final
              clearance workflow; packing does not authorise dispatch.
            </p>
          )}
          {(o.issues || []).map((i) => (
            <p key={i.id}>{i.text}</p>
          ))}
        </>
      )}
      {focus === "issues" && (
        <>
          {dept === "factory" && (
            <section>
              {" "}
              <h3>Report an issue to Design</h3>
              <form
                className="dept-form"
                onSubmit={async (e) => {
                  const target = e.currentTarget,
                    f = form(e);
                  if (
                    await save(path + "/factory", {
                      action: "issue",
                      reason: f.get("reason"),
                    })
                  )
                    target.reset();
                }}
              >
                <label>
                  Describe the issue
                  <textarea name="reason" required maxLength={2000} />
                </label>
                <button className="btn">Report issue</button>
              </form>
              <p className="sub">
                Issue reporting does not reject the order. Issue resolution and
                production-blocking behaviour are flagged.
              </p>
            </section>
          )}
          {(o.issues || []).map((i) => (
            <p className="sun-issue" key={i.id}>
              {i.text}
            </p>
          ))}
          {!o.issues?.length && <p className="empty">No reported issues.</p>}
        </>
      )}
    </>
  );
}
function Documents({ order, ids }: { order: Order; ids?: string[] }) {
  const { client } = useWorkflowApi();
  const [error, setError] = useState("");
  async function download(id: string, filename: string) {
    setError("");
    try {
      const response = await client.get(
        `/api/sunroof/orders/${encodeURIComponent(order.id)}/documents/${encodeURIComponent(id)}`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Could not download this document. Please try again.");
    }
  }
  return (
    <div className="dept-documents">
      {(order.documents || [])
        .filter((d) => !ids || ids.includes(d.id))
        .map((d) => (
          <button
            type="button"
            className="btn"
            key={d.id}
            onClick={() => void download(d.id, d.filename)}
          >
            {d.filename}
          </button>
        ))}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
