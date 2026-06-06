"use client";

import { useState } from "react";

type SessionCostBreakdownProps = {
  whisperMinutes: number;
  whisperUsd: number;
  gptInputTokens: number;
  gptOutputTokens: number;
  gptUsd: number;
  blobEgressBytes: number;
  blobEgressUsd: number;
  blobStorageUsd: number;
  computeUsd: number;
  totalUsd: number;
};

function fmtUsd(n: number): string {
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function SessionCostPanel(props: SessionCostBreakdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="row"
        style={{
          width: "100%",
          justifyContent: "space-between",
          alignItems: "center",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
        aria-expanded={open}
      >
        <span style={{ fontWeight: 600 }}>Session cost (estimated)</span>
        <span className="muted" style={{ fontSize: 13 }}>
          {fmtUsd(props.totalUsd)} {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <>
          <div className="divider" />
          <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
            Estimates from API usage × verified rate-card — not exact billing.
          </p>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td className="muted">Whisper transcription</td>
                <td style={{ textAlign: "right" }}>
                  {props.whisperMinutes.toFixed(1)} min · {fmtUsd(props.whisperUsd)}
                </td>
              </tr>
              <tr>
                <td className="muted">GPT-4o-mini notes</td>
                <td style={{ textAlign: "right" }}>
                  {props.gptInputTokens.toLocaleString()} / {props.gptOutputTokens.toLocaleString()} tok ·{" "}
                  {fmtUsd(props.gptUsd)}
                </td>
              </tr>
              <tr>
                <td className="muted">Blob egress</td>
                <td style={{ textAlign: "right" }}>
                  {(props.blobEgressBytes / 1e6).toFixed(2)} MB · {fmtUsd(props.blobEgressUsd)}
                </td>
              </tr>
              {(props.blobStorageUsd !== 0 || props.computeUsd !== 0) && (
                <>
                  {props.blobStorageUsd !== 0 && (
                    <tr>
                      <td className="muted">Blob storage</td>
                      <td style={{ textAlign: "right" }}>{fmtUsd(props.blobStorageUsd)}</td>
                    </tr>
                  )}
                  {props.computeUsd !== 0 && (
                    <tr>
                      <td className="muted">Compute</td>
                      <td style={{ textAlign: "right" }}>{fmtUsd(props.computeUsd)}</td>
                    </tr>
                  )}
                </>
              )}
              <tr>
                <td style={{ fontWeight: 600, paddingTop: 8 }}>Total</td>
                <td style={{ textAlign: "right", fontWeight: 600, paddingTop: 8 }}>
                  {fmtUsd(props.totalUsd)}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}
