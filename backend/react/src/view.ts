export type CRMView = "phone" | "desktop";
export function setView(view: CRMView) {
  try {
    localStorage.setItem("sunrooof.view", view);
  } catch {}
  document.documentElement.dataset.crmView = view;
}
export function applyView() {
  let view: CRMView = matchMedia("(max-width:639px)").matches
    ? "phone"
    : "desktop";
  try {
    const saved = localStorage.getItem("sunrooof.view");
    if (saved === "phone" || saved === "desktop") view = saved;
  } catch {}
  document.documentElement.dataset.crmView = view;
  return view;
}
