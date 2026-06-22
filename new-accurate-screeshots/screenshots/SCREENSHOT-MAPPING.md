# Screenshot mapping — *Your First AI Agent on WSO2 Integrator*

Captured live from **WSO2 Integrator** (local VS Code app) by building the
`VoltMartSupport` / `voltmart-support` project exactly as the article describes.
All images are full-resolution (retina) PNGs.

Article: `../build-first-ai-integration.md`

---

## ✅ Captured (local WSO2 Integrator)

| # | File | Article location | What it shows |
|---|------|------------------|---------------|
| 01 | `01-welcome-screen.png` | Prereq, line 55 — *"WSO2 Integrator open on the welcome screen after launch."* | The welcome screen with the Get Started / Sign-in card after launch. |
| 02 | `02-create-integration-dialog.png` | Step 1.1, line 86 — *"The 'Create New Integration' dialog with the name fields filled in."* | Create Integration form: **Integration Name = `VoltMartSupport`**, **Project Name = `voltmart-support`**. |
| 03 | `03-project-overview-created.png` | Step 1.1 (stable state after Create Integration) | Project page showing the `voltmart-support` project with the `VoltMartSupport` integration listed. |
| 04 | `04-add-artifact-catalog.png` | Step 1.2 — *"Under AI Integration, select AI Chat Agent."* | The Add Artifact catalog with the **AI Integration → AI Chat Agent** card. |
| 05 | `05-create-ai-chat-agent-form.png` | Step 1.2 — create the agent | Create AI Chat Agent form with **Name = `VoltMartAssistant`** (Create enabled). |
| 06 | `06-agent-skeleton-flow.png` | Step 1.2 (stable state) — *"a fully functional AI agent skeleton"* | The freshly created agent flow: **Start → AI Agent → Return**, with the model-provider node, Add Memory and Add Tool affordances. |
| 07 | `07-integration-design-overview.png` | Architecture / components (supports the Architecture section + Step 1.3) | Integration **Design** view: `chatAgentListener` (ai:Listener) → **AI Agent Service** `/voltMartAssistant` → `wso2ModelProvider` (the default WSO2 model provider). Left tree shows `Functions → searchVoltMartPolicies`. |
| 08 | `08-agent-config-role-instructions.png` | Step 1.4, *"Click the AI Agent node… Set Role / Instructions"* | The AI Agent config panel filled in: **Role = `VoltMart Support Assistant`** and the full system-prompt **Instructions** (the exact prompt from the article). |
| 09 | `09-create-tool-form.png` | Step 2.5 — *"Create Custom Tool, then fill in the form."* | The Create New Agent Tool form completed: **Name = `searchVoltMartPolicies`**, the tool **Description**, the **`string query`** parameter, and **Return Type = `string`** with its description. |
| 10 | `10-tool-empty-flow.png` | Step 2.5, line 315 — *"WSO2 Integrator now opens an empty flow diagram for the tool implementation."* | The empty `searchVoltMartPolicies` tool flow (just **Start**) immediately after creating the tool. |

---

## ⛔ NOT captured — require WSO2 sign-in or WSO2 Cloud (cannot be done from the local Integrator unattended)

These map to the remaining `[SCREENSHOT: …]` placeholders. They are blocked by
things only the account owner can do (an interactive WSO2 browser sign-in, and the
separate WSO2 Cloud web console).

| Article location | Why it's blocked |
|------------------|------------------|
| **Phase 4, line 445** — *Chat panel running conversation 2, the graceful decline* | Running the agent fails with `ballerina.ai.wso2ProviderConfig is not configured`. Fixing it needs **`Ballerina: Configure default WSO2 model provider`**, which pops *"Please sign in to WSO2 Integrator Copilot"* — an OAuth browser sign-in I can't complete unattended. Once you sign in, I can run the project and capture the live Chat panel (both sample conversations). |
| **Phase 2.5, line 337** — *Chat answering the returns question + trace showing the `searchVoltMartPolicies` call* | Needs (a) the model-provider sign-in above **and** (b) a deployed **WSO2 Cloud RAG service** for the tool to actually return grounding. Without the cloud RAG service the trace can't show a real retrieval. |
| **Step 2.2, line 219** — *Managed PostgreSQL vector database creation form* | Lives in the **WSO2 Cloud** web console (Dependencies → Vector Databases), not the local Integrator. |
| **Step 2.3, line 236** — *RAG ingestion configuration* | Lives in the **WSO2 Cloud** web console (RAG → Ingestion), not the local Integrator. |

### Note on the tool body (Step 2.5 "place the nodes by hand")
The article's hand-built tool flow (HTTP POST to `/retrieve` → Variable → If → Foreach → Return)
targets a **deployed WSO2 Cloud RAG service URL + credentials** that don't exist in this local
environment. Building it here would only produce a non-functional flow pointing at placeholders,
which would be misleading in a public article. To make the project compile (so it can be run for
Phase 4), the tool currently contains a single `Return "NO_POLICY_FOUND: …"` stub. The empty-flow
screenshot (10) is the accurate representation of the article's "empty flow diagram" state.

---

## To finish the remaining captures
1. In the running **WSO2 Integrator** window, click **Sign in with WSO2 account** (or the
   *"Sign in to WSO2 Integrator Copilot"* notification) and complete the browser sign-in.
2. Tell me when you're signed in — I'll re-issue the default model provider token, run the
   project, and capture the live **Chat panel** conversations (Phase 4).
3. The two **WSO2 Cloud** forms (vector DB, RAG ingestion) must be captured from the WSO2 Cloud
   web console — I can guide you or capture them via a browser tool if you want.
