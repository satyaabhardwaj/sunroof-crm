import { DepartmentWorkspace } from "@/components/deals/department-workspace";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ department?: string }>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const department = [
    "design",
    "design-head",
    "measurement",
    "accounts",
    "factory",
  ].includes(search.department ?? "")
    ? search.department!
    : "design";
  return <DepartmentWorkspace department={department} id={id} />;
}
