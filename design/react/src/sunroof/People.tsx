import { useState } from "react";
import type { StaffDirectory } from "./model";
const groups = [
  ["all", "Everyone"],
  ["design", "Designers"],
  ["installation", "Installation"],
  ["heads", "Heads"],
  ["measurement", "Measurement"],
];
export function People({ directory }: { directory?: StaffDirectory }) {
  const [group, setGroup] = useState("all"),
    [past, setPast] = useState(false);
  const people = (directory?.people || []).filter(
    (p) =>
      (past || p.status === "active") &&
      (group === "all" ||
        (group === "heads"
          ? ["design-head", "factory-head"].includes(p.group)
          : p.group === group)),
  );
  return (
    <section className="sun-work">
      <div className="sun-work-heading">
        <div>
          <h1>People</h1>
          <p>Zoho staff reference · {directory?.fetchedAt || "Not imported"}</p>
        </div>
        <label className="sun-inline-check">
          <input
            type="checkbox"
            checked={past}
            onChange={(e) => setPast(e.target.checked)}
          />
          Include inactive
        </label>
      </div>
      <div className="sun-filters" aria-label="Staff roles">
        {groups.map(([id, label]) => (
          <button
            key={id}
            aria-pressed={group === id}
            className={group === id ? "on" : ""}
            onClick={() => setGroup(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {group !== "measurement" && (
        <div className="a-table-scroll">
          <table className="a-table sun-work-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Zoho role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                  </td>
                  <td>
                    {{
                      design: "Designer",
                      installation: "Installation Manager",
                      "design-head": "Design Head",
                      "factory-head": "Factory Head",
                    }[p.group] || p.group}
                    {p.note && <small>{p.note}</small>}
                  </td>
                  <td>{p.sourceRole}</td>
                  <td>
                    {p.status === "active"
                      ? "Active"
                      : p.status === "deleted"
                        ? "Deleted in Zoho"
                        : "Inactive"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!people.length && (
            <p className="sun-empty">No staff in this view.</p>
          )}
        </div>
      )}
      {(group === "measurement" || group === "all") && (
        <details className="sun-directory-note" open={group === "measurement"}>
          <summary>Measurement team · role confirmation needed</summary>
          <p>
            Zoho does not identify a separate Measurement Executive role. These
            names are in its visit-assignee list; they have not been added as
            measurement executives.
          </p>
          <p>
            {directory?.visitNames.join(" · ") ||
              "No reference names available."}
          </p>
        </details>
      )}
      <p className="sun-table-note">
        Names and roles are from Zoho. Locations and pay-grade capacities still
        need confirmation. Demo orders and assignments are fictional; this does
        not create staff logins.
      </p>
    </section>
  );
}
