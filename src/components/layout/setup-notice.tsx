export function SetupNotice() {
  return (
    <main className="mx-auto max-w-xl p-8 pt-24">
      <p className="text-2xl font-black tracking-tight">Sunrooof</p>
      <h1 className="mt-8 text-xl font-semibold">
        The CRM backend is not running
      </h1>
      <p className="mt-3 text-slate-600">
        Start the CRM backend, then reload this page. This screen reaches it at
        the address set in <code>CRM_BACKEND_URL</code>.
      </p>
    </main>
  );
}
