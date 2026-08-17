# README screenshots

Screenshots are versioned per release, in a folder named after the version they were captured on
(`assets/<version>/`). The README always points at the newest folder. When a release changes the UI,
capture a fresh set into a new folder and repoint the README, so older versions keep their own images.

## Current set: `0.6.1/`

Captured on 2026-08-17 against the real published node (0.6.1) and Langfuse v3.205.

| File | Must show |
|---|---|
| `node-canvas.png` | The node on the canvas with its Chat Model, Memory and Tool inputs |
| `credential-setup.png` | The credential editor titled **Agent Langfuse API**, with the fields **Base URL** (a placeholder host, never a real one), **Public Key**, **Secret Key**, and a successful connection test |
| `node-configuration.png` | The node parameters panel with the **Parse Output as JSON** toggle on, alongside Require Specific Output Format, Enable Fallback Model and the Langfuse Metadata collection |
| `prompt-dropdown.png` | The prompt selector open, listing the `chat` prompts of the project |
| `parse-json-output.png` | The node output panel (JSON view) after a run with the toggle on: the agent JSON answer as fields at the item root (`package`, `version`, `license`) plus the nested `langfuseTrace` |
| `langfuse-trace.png` | A Langfuse trace named `<workflow name> - <node name>`, with its span tree, latency, cost, token counts and the input panel |

## How to capture

The capture procedure (reaching the n8n editor and Langfuse over Tailscale, the auth cookies, the
crop step) is documented as a workspace skill in the GIABot repo: `.claude/skills/capturar-node-screenshots/`.
Never capture real keys: the credential fields mask them, but the Base URL and project name are
visible, so use a placeholder host. Restore any test workflow you edit and do not save credential edits.
