import { APPLIANCE_TYPES } from "./appliance-catalog";
export interface ApplianceRequestItem {
  id: string;
  checked?: boolean;
  room: string;
  category: string;
  name: string;
  size: string;
  brand: string;
  model: string;
  reused: boolean;
  note: string;
}
export function applianceName(item: ApplianceRequestItem) {
  return (
    item.name.trim() ||
    APPLIANCE_TYPES.find(([id]) => id === item.category)?.[1] ||
    "Appliance"
  );
}
export function newAppliance(
  category: string,
  room = "Kitchen",
): ApplianceRequestItem {
  return {
    id: crypto.randomUUID(),
    checked: false,
    room,
    category,
    name: "",
    size: APPLIANCE_TYPES.find(([id]) => id === category)?.[2] || "",
    brand: "",
    model: "",
    reused: false,
    note: "",
  };
}
export function defaultApplianceRequest() {
  return [
    "hob",
    "oven",
    "microwave",
    "islandHood",
    "freestandingFridge",
    "sinkFaucet",
  ]
    .map((type) => newAppliance(type))
    .concat(newAppliance("builtInFridge", "Small Pantry"));
}
export function applianceRooms(items: ApplianceRequestItem[]) {
  return [...new Set(items.map((item) => item.room.trim() || "Kitchen"))];
}
export function applianceMessage(items: ApplianceRequestItem[]) {
  const lines = [
    "Please find below the appliance list for your reference:",
    "",
  ];
  for (const room of applianceRooms(items)) {
    lines.push(room + ":", "");
    items
      .filter((item) => (item.room.trim() || "Kitchen") === room)
      .forEach((item, i) => {
        lines.push(
          `${i + 1}. ${applianceName(item)}${item.size.trim() ? " - " + item.size.trim() : " - size to be confirmed"}${item.reused ? " (existing appliance to be reused)" : ""}`,
        );
        if (item.brand.trim() || item.model.trim())
          lines.push(
            "   Brand / model: " +
              [item.brand.trim(), item.model.trim()]
                .filter(Boolean)
                .join(" - "),
          );
        if (item.note.trim()) lines.push("   Note: " + item.note.trim());
      });
    lines.push("");
  }
  lines.push(
    "Kindly share or confirm the model numbers for the above-mentioned appliances to proceed further.",
    "",
    "NOTE: If you're reusing any existing appliances, please share their size and model number.",
    "",
    "Please also share the product datasheets / installation drawings for the final selected models.",
    "",
    "Thank you.",
  );
  return lines.join("\n");
}

// Open WhatsApp's contact picker with the draft; the designer chooses who receives it.
export function applianceWhatsAppLink(message: string): string {
  return "https://wa.me/?text=" + encodeURIComponent(message);
}

export function checkedAppliances(items: ApplianceRequestItem[]) {
  return items.filter((item) => item.checked === true);
}
