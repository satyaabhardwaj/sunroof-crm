"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
const DepartmentApp = dynamic(
  () => import("./workflow/Departments").then((module) => module.DepartmentApp),
  { ssr: false, loading: () => <p role="status">Loading workspace…</p> },
);
export function WorkflowEntry() {
  const path = usePathname();
  return (
    <div id="workflow-root">
      <DepartmentApp key={path} />
    </div>
  );
}
