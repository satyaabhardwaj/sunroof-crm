import { useState } from "react";
import type { FormProps } from "./model";
import { rules } from "./model";
import { Card, Button, Field, Select } from "./ui";
import { APPLIANCE_TYPES, SIEMENS_MODELS } from "./appliance-catalog";
import {
  applianceMessage,
  checkedAppliances,
  applianceWhatsAppLink,
  applianceName,
  defaultApplianceRequest,
  newAppliance,
  type ApplianceRequestItem,
} from "./appliance-request";
import { downloadAppliancePdf } from "./appliance-pdf";

export function ApplianceRequest({ c, ctx }: FormProps) {
  const appliances = rules().flow(c).appliances;
  const [initial] = useState(defaultApplianceRequest);
  const items = appliances.request?.items ?? initial;
  const [category, setCategory] = useState("hob"),
    [room, setRoom] = useState("Kitchen"),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const checked = checkedAppliances(items);
  const message = checked.length
    ? applianceMessage(checked)
    : "Check the appliances needed for this client to prepare the message.";
  const whatsappLink = applianceWhatsAppLink(message);
  function save(next: ApplianceRequestItem[]) {
    if (ctx.readOnly) return;
    setNotice("");
    setError("");
    ctx.update(() => {
      appliances.request = { items: next };
    });
  }
  const change = (id: string, patch: Partial<ApplianceRequestItem>) =>
    save(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  async function copy() {
    setNotice("");
    setError("");
    try {
      await navigator.clipboard.writeText(message);
      setNotice("Message copied. You can paste it into your client chat.");
    } catch {
      setError(
        "Could not copy the message. Allow clipboard access and try again.",
      );
    }
  }
  function pdf() {
    setNotice("");
    setError("");
    try {
      downloadAppliancePdf(c, checked);
      setNotice("PDF downloaded. It is ready to share with the client.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "PDF could not be created.",
      );
    }
  }
  return (
    <div className="appliance-request">
      <Card title="Client appliance checklist" tone="blue">
        <p className="sub">
          Add the appliances for this client, then tick the ones to include in
          the message. Expand an item to edit its room, size or model.
        </p>
        <div className="line appliance-check-actions">
          <b>
            {checked.length} of {items.length} checked
          </b>
          <div className="flexrow">
            <Button
              tone="small"
              disabled={ctx.readOnly || !items.length}
              onClick={() =>
                save(items.map((item) => ({ ...item, checked: true })))
              }
            >
              Check all
            </Button>
            <Button
              tone="small"
              disabled={ctx.readOnly || !checked.length}
              onClick={() =>
                save(items.map((item) => ({ ...item, checked: false })))
              }
            >
              Clear checks
            </Button>
          </div>
        </div>
        <div className="appliance-request-items">
          {items.map((item, index) => {
            const references = SIEMENS_MODELS.filter(
              (ref) => ref.category === item.category,
            );
            const selected = references.find(
              (ref) => ref.code === item.model && item.brand === "Siemens",
            );
            return (
              <details
                className={
                  "appliance-request-item" + (item.checked ? " checked" : "")
                }
                key={item.id}
                aria-label={applianceName(item) + " " + (index + 1)}
              >
                <summary>
                  <input
                    type="checkbox"
                    checked={item.checked === true}
                    disabled={ctx.readOnly}
                    aria-label={`Include ${applianceName(item)} - item ${index + 1}`}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) =>
                      change(item.id, { checked: event.target.checked })
                    }
                  />
                  <b>
                    {index + 1}. {applianceName(item)}
                  </b>
                  <span className="sub">
                    {item.room || "Kitchen"} · {item.size || "Size to confirm"}
                    {item.reused ? " · Reused" : ""}
                    {item.model ? " · " + item.model : ""}
                  </span>
                </summary>
                <div className="line">
                  <Button
                    tone="small"
                    disabled={ctx.readOnly}
                    onClick={() => save(items.filter((x) => x.id !== item.id))}
                  >
                    Remove item {index + 1}
                  </Button>
                </div>
                <fieldset disabled={ctx.readOnly} className="design-form">
                  <div className="g3">
                    <Field
                      label={`Room - item ${index + 1}`}
                      value={item.room}
                      onCommit={(room) => change(item.id, { room })}
                    />
                    <Field
                      label={`Appliance name - item ${index + 1}`}
                      value={applianceName(item)}
                      onCommit={(name) => change(item.id, { name })}
                    />
                    <Field
                      label={`Size - item ${index + 1}`}
                      value={item.size}
                      placeholder="Width or W x D x H in mm"
                      onCommit={(size) => change(item.id, { size })}
                    />
                  </div>
                  <div className="g3">
                    <Field
                      label={`Brand - item ${index + 1}`}
                      value={item.brand}
                      onCommit={(brand) => change(item.id, { brand })}
                    />
                    <Field
                      label={`Model number - item ${index + 1}`}
                      value={item.model}
                      placeholder="To be shared by client"
                      onCommit={(model) => change(item.id, { model })}
                    />
                    <Select
                      label={`New or reused - item ${index + 1}`}
                      value={item.reused ? "reused" : "new"}
                      placeholder={false}
                      options={[
                        ["new", "New appliance"],
                        ["reused", "Reuse existing appliance"],
                      ]}
                      onChange={(value) =>
                        change(item.id, { reused: value === "reused" })
                      }
                    />
                  </div>
                  <Field
                    label={`Notes - item ${index + 1}`}
                    value={item.note}
                    onCommit={(note) => change(item.id, { note })}
                  />
                  {references.length > 0 && (
                    <Select
                      label={`Siemens brochure reference - item ${index + 1}`}
                      value={selected?.code || ""}
                      placeholder="Choose a reference model (optional)"
                      options={references.map(
                        (ref) =>
                          [
                            ref.code,
                            ref.code +
                              " - " +
                              ref.description +
                              " (PDF p. " +
                              ref.page +
                              ")",
                          ] as const,
                      )}
                      onChange={(model) =>
                        change(
                          item.id,
                          model ? { brand: "Siemens", model } : { model: "" },
                        )
                      }
                    />
                  )}
                  {selected && (
                    <p className="sub">
                      Reference: Siemens 2026 brochure, PDF page {selected.page}
                      . Check the selected model's installation drawing against
                      the planned size.
                    </p>
                  )}
                </fieldset>
              </details>
            );
          })}
        </div>
        {!items.length && (
          <p>No appliances on the checklist yet. Add one below.</p>
        )}
        <fieldset
          className="design-form appliance-request-add"
          disabled={ctx.readOnly}
        >
          <div className="g3">
            <Select
              label="Appliance to add"
              value={category}
              placeholder={false}
              options={APPLIANCE_TYPES.map(
                ([id, label]) => [id, label] as const,
              )}
              onChange={setCategory}
            />
            <Field
              label="Room for new appliance"
              value={room}
              onCommit={setRoom}
            />
            <Button
              onClick={() =>
                save([
                  ...items,
                  newAppliance(category, room.trim() || "Kitchen"),
                ])
              }
            >
              Add to checklist
            </Button>
          </div>
          <Button onClick={() => save(items)}>Save checklist</Button>
        </fieldset>
        <p className="sub">
          Sizes are planned requirements. The brochure's reference models are
          not automatically matched to these sizes. Sink, faucet, and other
          brands can be entered manually.
        </p>
      </Card>
      <Card title="Message and PDF for the client" tone="violet">
        <div className="flexrow">
          {checked.length > 0 ? (
            <a
              className="btn appliance-whatsapp"
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open WhatsApp
            </a>
          ) : (
            <Button disabled onClick={() => {}}>
              Open WhatsApp
            </Button>
          )}
          <Button
            tone="dark"
            disabled={!checked.length}
            onClick={() => void copy()}
          >
            Copy client message
          </Button>
          <Button disabled={!checked.length} onClick={pdf}>
            Download appliance PDF
          </Button>
        </div>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p className="msg" role="alert">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
