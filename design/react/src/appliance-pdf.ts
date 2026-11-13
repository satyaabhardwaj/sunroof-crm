import type { ApplianceRequestItem } from "./appliance-request";
import { applianceMessage } from "./appliance-request";
export interface AppliancePdfClient {
  name: string;
  pid: string;
  city?: string;
  design: { designer?: string };
}
export interface AppliancePdf {
  setFont(name: string, style: string): void;
  setFontSize(size: number): void;
  setTextColor(...color: number[]): void;
  setDrawColor(...color: number[]): void;
  setFillColor(...color: number[]): void;
  text(text: string | string[], x: number, y: number): void;
  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    style: string,
  ): void;
  line(x: number, y: number, x2: number, y2: number): void;
  splitTextToSize(text: string, width: number): string[];
  addPage(): void;
  getNumberOfPages(): number;
  setPage(page: number): void;
  save(filename: string): void;
}
export type PdfConstructor = new (options: {
  unit: string;
  format: string;
}) => AppliancePdf;
const clean = (value: string) =>
  value
    .replace(/×/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e\n]/g, "");
export function createAppliancePdf(
  client: AppliancePdfClient,
  items: ApplianceRequestItem[],
  Constructor: PdfConstructor,
) {
  const doc = new Constructor({ unit: "pt", format: "a4" });
  let y = 0;
  const header = () => {
    doc.setFillColor(32, 41, 54);
    doc.rect(0, 0, 596, 96, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("MAGPPIE", 42, 32);
    doc.setFontSize(21);
    doc.text("Appliance list", 42, 64);
    y = 122;
  };
  const line = (text: string, bold = false, size = 10.5, indent = 0) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const chunks = doc.splitTextToSize(clean(text), 510 - indent);
    for (const chunk of chunks) {
      if (y > 775) {
        doc.addPage();
        header();
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);
      }
      doc.setTextColor(32, 41, 54);
      doc.text(chunk, 42 + indent, y);
      y += size + 5;
    }
  };
  header();
  line(client.name, true, 14);
  line(
    [
      client.pid,
      client.city,
      client.design.designer ? "Designer: " + client.design.designer : "",
    ]
      .filter(Boolean)
      .join("  |  "),
    false,
    9,
  );
  y += 12;
  for (const text of applianceMessage(items).split("\n")) {
    if (!text) {
      y += 8;
      continue;
    }
    const room = /:$/.test(text) && !text.startsWith("Please");
    if (room && y > 700) {
      doc.addPage();
      header();
    }
    line(
      text,
      room || /^NOTE:/.test(text),
      room ? 12 : 10.5,
      text.startsWith("   ") ? 14 : 0,
    );
  }
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setDrawColor(220, 224, 230);
    doc.line(42, 802, 553, 802);
    doc.setTextColor(100, 109, 122);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("MAGPPIE | Appliance details for design coordination", 42, 819);
    doc.text(`${page} / ${total}`, 520, 819);
  }
  return doc;
}
export function downloadAppliancePdf(
  client: AppliancePdfClient,
  items: ApplianceRequestItem[],
) {
  const Constructor = (window as Window & { jspdf?: { jsPDF: PdfConstructor } })
    .jspdf?.jsPDF;
  if (!Constructor)
    throw Error("PDF tools are unavailable. Please reload and try again.");
  const doc = createAppliancePdf(client, items, Constructor);
  doc.save(
    (client.pid || client.name).replace(/[^a-z0-9_-]/gi, "-") +
      "-appliance-list.pdf",
  );
}
