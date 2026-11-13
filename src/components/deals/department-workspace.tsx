"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useDeals } from "@/hooks/use-deals";
import { apiError } from "@/lib/api-client";
import { ContactTable } from "@/components/contacts/contact-table";
import { Button } from "@/components/ui/button";
const queues: Record<string, [string, string][]> = {
  design: [
    ["all", "Clients"],
    ["measurement", "Measurement"],
    ["drawings", "Drawings"],
    ["handover", "Factory handover"],
  ],
  "design-head": [
    ["all", "Team overview"],
    ["assignment", "To assign"],
    ["drawings", "Drawings"],
  ],
  measurement: [
    ["all", "Visits"],
    ["measurement", "Measurement"],
    ["submitted", "With designer"],
  ],
  accounts: [
    ["all", "Clients"],
    ["approvals", "Payment approvals"],
    ["handover", "Production handover"],
    ["packing", "Dispatch preparation"],
  ],
  factory: [
    ["all", "My work"],
    ["handover", "Handovers"],
    ["production", "Production"],
    ["qc", "QC"],
    ["packing", "Packing"],
  ],
};
const names: Record<string, string> = {
  design: "Design",
  "design-head": "Design head",
  measurement: "Measurement",
  accounts: "Accounts",
  factory: "Factory",
};
export function DepartmentWorkspace({
  department,
  id,
}: {
  department: string;
  id?: string;
}) {
  const query = useDeals(department);
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState("all");
  const orders = (query.data?.orders ?? []).filter(
    (o) =>
      (!id || o.id === id) &&
      (queue === "all" ||
        o.stage === queue ||
        (queue === "approvals" &&
          o.receipts?.some((r) => r.status === "requested")) ||
        (queue === "submitted" &&
          o.visits?.some((v) => v.status === "submitted"))) &&
      `${o.client} ${o.reference} ${o.location}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-xs uppercase tracking-widest text-slate-500">
            SUNROOOF / Workspaces
          </p>
          <h1 className="text-2xl font-semibold">
            {id ? "Client record" : names[department]}
          </h1>
        </div>
        <Button
          variant="outline"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw size={16} />
          Refresh
        </Button>
      </div>
      <nav aria-label="Work queues" className="mb-5 flex flex-wrap gap-2">
        {queues[department]?.map(([key, label]) => (
          <Button
            key={key}
            variant={key === queue ? "default" : "outline"}
            aria-pressed={key === queue}
            onClick={() => setQueue(key)}
          >
            {label}
          </Button>
        ))}
      </nav>
      <input
        aria-label="Find a client"
        placeholder="Find a client or project…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-5 w-full max-w-md"
      />
      {query.isPending ? (
        <p role="status">Loading your workspace…</p>
      ) : query.isError ? (
        <div role="alert" className="rounded-xl border bg-white p-6">
          {apiError(query.error)}
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-500">
            {orders.length} projects ·{" "}
            {query.data.demo ? "Demo workspace" : "Connected workspace"}
          </p>
          <ContactTable orders={orders} department={department} />
          {id && orders[0] && (
            <section className="mt-6 rounded-2xl border bg-white p-6">
              <h2 className="font-semibold">Activity</h2>
              <ul className="mt-4 space-y-4">
                {orders[0].history.map((event, i) => (
                  <li key={i} className="text-sm">
                    <p>{event.text}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {event.by} · {new Date(event.at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
