import { SunrooofBrand } from "./SunrooofBrand";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

// Shared presentation shell; kept here to stay within the approved auth file scope.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <aside className="auth-brand" aria-label="SUNROOOF">
        <div className="sunroof-auth-logo" aria-label="SUNROOOF">
          <SunrooofBrand />
        </div>
        <div className="auth-brand-copy">
          <p className="auth-eyebrow">Your team, connected</p>
          <p className="auth-brand-title">
            Thoughtful spaces.
            <br />
            Seamless teamwork.
          </p>
          <p className="auth-brand-detail">
            One place to bring every detail together.
          </p>
        </div>
        <p className="auth-brand-foot">SUNROOOF CRM</p>
      </aside>
      <div className="auth-content">
        <main className="auth-card">
          <p className="auth-trust">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
            </svg>
            Secure sign-in
          </p>
          {children}
          <footer className="auth-footer">
            <span>&copy; {new Date().getFullYear()} Sunrooof</span>
            <span>Need help? Contact your workspace administrator.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
export function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}

export function DigitCode({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  function fill(index: number, text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 6);
    const start = digits.length === 6 ? 0 : index;
    const next = Array.from({ length: 6 }, (_, i) => value[i] || " ");
    if (!digits) next[index] = " ";
    else
      for (let i = 0; i < digits.length && start + i < 6; i++)
        next[start + i] = digits[i];
    onChange(next.join("").trimEnd());
    if (digits) inputs.current[Math.min(start + digits.length, 5)]?.focus();
  }
  return (
    <fieldset className="auth-digits">
      <legend>Authenticator code</legend>
      <div>
        {Array.from({ length: 6 }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            aria-label={`Digit ${i + 1} of 6`}
            aria-describedby="challenge-hint"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            required
            pattern="[0-9]"
            value={(value[i] || "").trim()}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => fill(i, e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              fill(i, e.clipboardData.getData("text"));
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !e.currentTarget.value && i > 0) {
                e.preventDefault();
                fill(i - 1, "");
                inputs.current[i - 1]?.focus();
              }
              if (e.key === "ArrowLeft" && i > 0) {
                e.preventDefault();
                inputs.current[i - 1]?.focus();
              }
              if (e.key === "ArrowRight" && i < 5) {
                e.preventDefault();
                inputs.current[i + 1]?.focus();
              }
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}

export async function mfaRequest(path: string, body?: object) {
  const response = await fetch(`/api/auth/mfa${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Verification unavailable. Try again.",
    );
  return data;
}

export function MFAChallenge({
  navigate = (url: string) => location.assign(url),
}: {
  navigate?: (url: string) => void;
}) {
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await mfaRequest("/verify", { code });
      setCode("");
      navigate("/");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Connection unavailable. Try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <p className="auth-eyebrow">MAGPPIE CRM</p>
      <h1>Verify your sign-in</h1>
      <p className="auth-intro">
        {backup
          ? "Enter one unused recovery code."
          : "Enter the six-digit code from your authenticator app."}
      </p>
      <form onSubmit={(e) => void submit(e)} aria-busy={busy}>
        {backup ? (
          <>
            <label htmlFor="mfa-code">Recovery code</label>
            <input
              id="mfa-code"
              autoComplete="one-time-code"
              inputMode="text"
              required
              maxLength={50}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </>
        ) : (
          <DigitCode value={code} onChange={setCode} />
        )}
        <button disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Verifying…" : "Verify and sign in"}
        </button>
      </form>
      <p className="auth-feedback" role="alert" aria-live="polite">
        {message}
      </p>
      <p id="challenge-hint" className="auth-hint">
        Your verification challenge expires 5 minutes after sign-in. If it has
        expired, start sign-in again.
      </p>
      <button
        type="button"
        className="auth-secondary"
        disabled={busy}
        onClick={() => {
          setBackup(!backup);
          setCode("");
          setMessage("");
        }}
      >
        {backup ? "Use authenticator app" : "Use a recovery code instead"}
      </button>
      <p>
        <a href="/login">Back to sign in</a>
      </p>
    </AuthLayout>
  );
}

export function Security() {
  const [status, setStatus] = useState<{
    available: boolean;
    enabled: boolean;
    recovery_codes: number;
    required?: boolean;
  } | null>(null);
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [operation, setOperation] = useState("recovery-codes");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    let current = true;
    void mfaRequest("")
      .then((data) => {
        if (current) setStatus(data);
      })
      .catch((error) => {
        if (current) setMessage(error.message);
      });
    return () => {
      current = false;
    };
  }, []);
  async function copyCodes() {
    try {
      await navigator.clipboard.writeText((codes || []).join("\n"));
      setExportMessage(
        "Codes copied. Store them privately and clear your clipboard afterwards.",
      );
    } catch {
      setExportMessage(
        "Could not copy. Select the codes and copy them manually.",
      );
    }
  }
  function downloadCodes() {
    try {
      const url = URL.createObjectURL(
        new Blob(
          [
            "MAGPPIE recovery codes - keep private\n" +
              (codes || []).join("\n"),
          ],
          { type: "text/plain" },
        ),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "magppie-recovery-codes.txt";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage("Download requested. Keep the file in a safe place.");
    } catch {
      setExportMessage("Download unavailable. Save the codes manually.");
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    const action = secret ? "confirm" : status?.enabled ? operation : "setup";
    try {
      const data = await mfaRequest(
        "/" + action,
        action === "setup" ? { password } : { password, code },
      );
      if (action === "setup") {
        setSecret(data.secret);
        setUri(data.uri);
      } else {
        setSecret("");
        setUri("");
        setPassword("");
        setCode("");
        setCodes(data.recovery_codes);
        setMessage(
          action === "disable"
            ? "Authenticator disabled. Sign in again."
            : "Save these recovery codes privately. Each code works once. All previous sessions have ended.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Connection unavailable. Try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <p className="auth-eyebrow">ACCOUNT SECURITY</p>
      <h1>Authenticator app</h1>
      <ol className="auth-steps" aria-label="Authenticator setup steps">
        <li
          aria-current={
            codes === null && !secret && !status?.enabled ? "step" : undefined
          }
        >
          1 - Scan / enter key
        </li>
        <li aria-current={secret ? "step" : undefined}>2 - Enter code</li>
        <li aria-current={codes && codes.length > 0 ? "step" : undefined}>
          3 - Save recovery codes
        </li>
      </ol>
      {!status && !message && <p role="status">Loading security settings…</p>}
      {status && !status.available && (
        <p>Authenticator setup is unavailable. Contact your administrator.</p>
      )}
      {status?.required && !status.enabled && codes === null && (
        <p className="auth-notice" role="alert">
          Administrator accounts must use an authenticator app. Set it up to
          open the workspace.
        </p>
      )}
      {codes !== null ? (
        <>
          {codes.length > 0 && (
            <>
              <p className="auth-notice">
                These codes are shown once. Save them privately before leaving
                this page. Each code works only once.
              </p>
              <ul className="recovery-codes" aria-label="Recovery codes">
                {codes.map((value) => (
                  <li key={value}>
                    <code>{value}</code>
                  </li>
                ))}
              </ul>
              <div className="auth-code-actions">
                <button
                  type="button"
                  className="auth-secondary"
                  onClick={() => void copyCodes()}
                >
                  Copy recovery codes
                </button>
                <button
                  type="button"
                  className="auth-secondary"
                  onClick={downloadCodes}
                >
                  Download codes
                </button>
              </div>
              <p role="status">{exportMessage}</p>
            </>
          )}
          <p>
            <a href="/login">I have saved my codes — sign in again</a>
          </p>
        </>
      ) : (
        status?.available && (
          <>
            <p className="auth-intro">
              {status.enabled
                ? `Authenticator enabled. ${status.recovery_codes} recovery codes remaining.`
                : "Add a second step to protect your account."}
            </p>
            {secret && (
              <section className="auth-setup">
                <p>
                  In your authenticator app, add a time-based account with this
                  setup key:
                </p>
                <code className="setup-secret">{secret}</code>
                <p>
                  <a href={uri}>Open in authenticator app</a>
                </p>
                <p>
                  Account: MAGPPIE CRM · 6 digits · 30 seconds. Enter a code
                  below to finish. Setup expires in 10 minutes.
                </p>
              </section>
            )}
            <form onSubmit={(e) => void submit(e)} aria-busy={busy}>
              <label htmlFor="security-password">Current password</label>
              <input
                id="security-password"
                type="password"
                required
                maxLength={1024}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {(secret || status.enabled) && (
                <>
                  <label htmlFor="security-code">
                    {secret
                      ? "Authenticator code"
                      : "Authenticator or recovery code"}
                  </label>
                  <input
                    id="security-code"
                    required
                    maxLength={50}
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </>
              )}
              {status.enabled && (
                <>
                  <label htmlFor="mfa-operation">Action</label>
                  <select
                    id="mfa-operation"
                    value={operation}
                    onChange={(e) => setOperation(e.target.value)}
                  >
                    <option value="recovery-codes">
                      Replace recovery codes
                    </option>
                    {!status.required && (
                      <option value="disable">Disable authenticator</option>
                    )}
                  </select>
                  <p>
                    This ends all sessions. Replacing codes invalidates the old
                    set.
                    {status.required &&
                      " Administrator accounts cannot disable the authenticator."}
                  </p>
                </>
              )}
              <button disabled={busy}>
                {busy && <Spinner />}
                {busy
                  ? "Please wait…"
                  : secret
                    ? "Enable authenticator"
                    : status.enabled
                      ? operation === "disable"
                        ? "Disable authenticator"
                        : "Replace recovery codes"
                      : "Set up authenticator"}
              </button>
            </form>
          </>
        )
      )}
      <p className="auth-feedback" role="status" aria-live="polite">
        {message}
      </p>
      {status &&
        codes === null &&
        !secret &&
        (status.enabled || !status.required) && (
          <ChangePassword needsCode={status.enabled} />
        )}
      <p>
        <a href="/">Back to workspace</a> · <a href="/login">Sign in</a>
      </p>
    </AuthLayout>
  );
}

// Same length rule as provisioning and reset (16–1024 characters).
const MIN_PASSWORD = 16;

export function ChangePassword({ needsCode }: { needsCode: boolean }) {
  const [password, setPassword] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (next.length < MIN_PASSWORD)
      return setMessage(
        `Use at least ${MIN_PASSWORD} characters for the new password.`,
      );
    if (next !== again) return setMessage("The new passwords do not match.");
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          needsCode
            ? { password, new_password: next, code }
            : { password, new_password: next },
        ),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Password change unavailable. Try again.",
        );
      setPassword("");
      setNext("");
      setAgain("");
      setCode("");
      setMessage(
        "Password changed. You stay signed in here; every other session has ended.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Connection unavailable. Try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="auth-change-password"
      aria-labelledby="password-heading"
    >
      <h2 id="password-heading">Change password</h2>
      <form onSubmit={(e) => void submit(e)} aria-busy={busy}>
        <label htmlFor="password-current">Current password</label>
        <input
          id="password-current"
          type="password"
          required
          maxLength={1024}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label htmlFor="password-new">New password</label>
        <input
          id="password-new"
          type="password"
          required
          minLength={MIN_PASSWORD}
          maxLength={1024}
          autoComplete="new-password"
          aria-describedby="password-rule"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <p id="password-rule" className="auth-hint">
          At least {MIN_PASSWORD} characters, different from the current one.
        </p>
        <label htmlFor="password-again">Repeat new password</label>
        <input
          id="password-again"
          type="password"
          required
          maxLength={1024}
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
        {needsCode && (
          <>
            <label htmlFor="password-code">
              Authenticator or recovery code
            </label>
            <input
              id="password-code"
              required
              maxLength={50}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </>
        )}
        <button disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Please wait…" : "Change password"}
        </button>
      </form>
      <p className="auth-feedback" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
