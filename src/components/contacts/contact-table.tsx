"use client";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import type { Order } from "@/types/deal";
import { Button } from "@/components/ui/button";
function columnsFor(department: string): ColumnDef<Order>[] {
  return [
    {
      accessorKey: "client",
      header: "Client / project",
      cell: ({ row }) => (
        <Link
          className="font-semibold text-primary"
          href={`/contacts/${encodeURIComponent(row.original.id)}?department=${encodeURIComponent(department)}`}
        >
          {row.original.client}
          <span className="block text-xs font-normal text-slate-500">
            {row.original.reference}
          </span>
        </Link>
      ),
    },
    { accessorKey: "location", header: "Location" },
    {
      accessorKey: "stage",
      header: "Stage",
      cell: ({ getValue }) => String(getValue()).replaceAll("-", " "),
    },
  ];
}
export function ContactTable({
  orders,
  department,
}: {
  orders: Order[];
  department: string;
}) {
  const table = useReactTable({
    data: orders,
    columns: columnsFor(department),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });
  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th className="px-5 py-4 font-medium" key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr className="border-t border-slate-100" key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td className="px-5 py-4" key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length && (
          <p className="p-8 text-center text-sm text-slate-500">
            No matching projects.
          </p>
        )}
      </div>
      <div className="mt-4 flex items-center justify-end gap-3 text-sm">
        <Button
          variant="outline"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          Previous
        </Button>
        <span>Page {table.getState().pagination.pageIndex + 1}</span>
        <Button
          variant="outline"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
        >
          Next
        </Button>
      </div>
    </>
  );
}
