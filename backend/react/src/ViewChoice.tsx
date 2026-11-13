import { useState } from "react";
import { AuthLayout } from "./MFA";
import { Login } from "./Auth";
import { setView, type CRMView } from "./view";
export function ViewChoice() {
  const [chosen, choose] = useState<CRMView | null>(null);
  if (chosen)
    return (
      <>
        <Login />
        <button className="auth-change-view" onClick={() => choose(null)}>
          Change {chosen} view
        </button>
      </>
    );
  return (
    <AuthLayout>
      {new URLSearchParams(location.search).has("expired") && (
        <p role="status" className="auth-intro">
          Your session ended after 20 minutes of inactivity. Sign in again to
          continue.
        </p>
      )}
      <p className="auth-eyebrow">SUNROOOF CRM</p>
      <h1>Choose your view</h1>
      <p className="auth-intro">The same work, arranged for your screen.</p>
      <div className="auth-view-choices">
        {(["desktop", "phone"] as const).map((view) => (
          <button
            key={view}
            onClick={() => {
              setView(view);
              choose(view);
            }}
          >
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              {view === "phone" ? (
                <path d="M7 2h10v20H7V2Zm4 17h2" />
              ) : (
                <path d="M2 4h20v13H2V4Zm10 13v4m-5 0h10" />
              )}
            </svg>
            <strong>{view === "phone" ? "Phone view" : "Desktop view"}</strong>
            <span>
              {view === "phone"
                ? "Easy reading and touch controls"
                : "Full workspace and tables"}
            </span>
          </button>
        ))}
      </div>
      <p className="auth-view-note">
        You will be signed out after 20 minutes of inactivity.
      </p>
    </AuthLayout>
  );
}
