# Build Your First AI-Powered Integration with WSO2 Integrator

A hands-on, build-along tutorial. By the end you will have a working customer-support
assistant — an AI agent on WSO2 Integrator that answers policy questions from a knowledge
base (RAG), looks up live order status through a tool, and escalates to a human when it
can't (or shouldn't) help. You'll build it from an empty machine, one phase at a time,
and verify each phase before moving on.

> This tutorial follows the official WSO2 Integrator GenAI documentation. Where the docs
> and this article describe the same feature, the docs are the source of truth. Links to
> the relevant pages appear inline so you can go deeper on any step.

---

## What we're building

**VoltMart** is a fictional online consumer-electronics store (headphones, speakers,
laptops, accessories). Its small support team is drowning in repetitive questions about
shipping, returns, warranties, and order status. We'll build an assistant that handles the
easy, well-defined questions automatically and hands everything else to a human — so the
team only spends time on cases that actually need a person.

The assistant has exactly three capabilities, and we build each as its own phase so the
boundaries stay crisp:

1. **Knowledge (RAG):** answer policy questions from VoltMart's own documents.
2. **A live tool:** look up real order status, but only after verifying the customer's identity.
3. **An escalation path:** open a support ticket and hand off to a human in the situations
   where the assistant must not improvise.

### Architecture

![VoltMart Support Assistant architecture: a customer chats with the AI agent, which uses a system prompt and per-session memory to decide between three tools — a knowledge/RAG tool over a knowledge base, a live order-status tool, and an escalate-to-human tool. A startup automation ingests the policy documents into the knowledge base.](voltmart-support/architecture.png)


The agent is the decision-maker. On every turn it reads its system prompt, the conversation
so far, and the customer's message, then decides whether to answer directly, call one of its
three tools, or escalate. Memory keyed by `sessionId` keeps each customer's context separate.

We'll use the **default WSO2 model provider** and an **in-memory vector store** so you need
no third-party accounts or API keys. Pointers to swap in OpenAI/Anthropic/Azure or an
external vector store appear at the end.

---

## Prerequisites and environment setup

### 1. Install WSO2 Integrator

1. Go to the downloads page: `https://wso2.com/products/downloads/?product=wso2integrator`.
2. Download the installer for your OS and install it:
   - **Windows:** run the `.msi` installer and follow the wizard.
   - **macOS:** open the `.dmg` and drag the app to **Applications**.
   - **Linux:** install the `.deb`/`.rpm`, or extract the `.tar.gz`.
3. Launch WSO2 Integrator.

Full instructions: [Local setup](https://wso2.com/integration-platform/docs/get-started/setup/local-setup).

[SCREENSHOT: WSO2 Integrator IDE on first launch, showing the Get Started page.]

### 2. Sign in (this is what gives you the free default model)

The default model and embedding providers are WSO2-hosted, so you don't need an OpenAI or
Anthropic key — you just sign in.

1. On the **Get Started** page, click **Sign In** (top-right).
2. Complete sign-in in the browser page that opens, then click **Open WSO2 Integrator** when prompted.
3. You should see the notification **"Successfully signed into WSO2 Integration Platform"**
   and your account avatar in the top-right corner.

[SCREENSHOT: Top-right corner showing the signed-in avatar and the success notification.]

### 3. Configure the default WSO2 model provider

This writes the credentials your agent and knowledge base will use.

1. Open the command palette (`Cmd/Ctrl + Shift + P`).
2. Run **`Ballerina: Configure default WSO2 model provider`**.

This generates a `Config.toml` entry that looks like this (the command fills in the real values):

```toml
[ballerina.ai.wso2ProviderConfig]
serviceUrl = "<generated-by-the-configure-command>"
accessToken = "<generated-by-the-configure-command>"
```

> **Why this matters:** the same credentials power both the agent's LLM (`ai:getDefaultModelProvider()`)
> and the embeddings used for RAG (`ai:getDefaultEmbeddingProvider()`). Configure it once, here.

**Verify the setup works before continuing:**
- Your avatar is visible top-right (you're signed in).
- `Config.toml` contains a `[ballerina.ai.wso2ProviderConfig]` section with a non-empty `accessToken`.

If either is missing, repeat steps 2–3. (A common symptom of a missing config is `bal run`
failing with *"default model provider not configured"*.)

---

## Phase 1 — Create the project and the AI agent

### Step 1.1 — Create the integration project

1. From the **Create New Integration** card, select **Create**.
2. Set **Integration Name** to `VoltMartSupport`.
3. Set **Project Name** to `voltmart-support`.
4. Select **Create Integration**.

[SCREENSHOT: The "Create New Integration" dialog with the name fields filled in.]

### Step 1.2 — Add the AI Chat Agent

1. In the design view, select **+ Add Artifact**.
2. Under **AI Integration**, select **AI Chat Agent**.
3. Set **Name** to `VoltMartAssistant`.
4. Select **Create**. (If you're not signed in to WSO2 Integrator Copilot, sign in when prompted.)

The visual designer opens with three nodes: **Start → AI Agent → Return**. A circle marked
with the WSO2 logo is attached to the **AI Agent** node — that's the default model provider.

[SCREENSHOT: The agent canvas showing Start → AI Agent → Return and the WSO2 model-provider circle.]

This generates the skeleton in code. The model provider lands in `connections.bal`:

```ballerina
import ballerina/ai;

// The agent's LLM — WSO2-hosted, so no third-party API key is needed.
final ai:Wso2ModelProvider wso2ModelProvider = check ai:getDefaultModelProvider();
```

…and the agent + chat service skeleton in `agents.bal` / `main.bal`. We'll fill these in over
the next phases. See [Creating an agent](https://wso2.com/integration-platform/docs/genai/develop/agents/creating-an-agent).

### Step 1.3 — Write the system prompt

Click the **AI Agent** node to open its configuration panel. Set:

- **Role:** `VoltMart Support Assistant`
- **Instructions:** paste the prompt below.

```
You are the front-line support assistant for VoltMart, an online consumer-electronics store (headphones, speakers, laptops, and accessories). You are friendly, sound human, and keep answers short — usually one to three sentences.

SCOPE
- Only help with VoltMart: orders, products, policies (shipping, returns, refunds, warranty, payments/billing), and basic account questions.
- Politely decline anything unrelated and steer the customer back to VoltMart support. Do not answer general-knowledge questions.

USING YOUR TOOLS
- For ANY question about VoltMart policy (shipping, delivery, returns, refunds, warranty, payments, billing, how to track an order, account basics), call searchVoltMartPolicies FIRST and answer only from what it returns. If it returns NO_POLICY_FOUND, do not guess — escalate.
- For order status, you need BOTH the order number AND the account email. If you are missing either, ask for it. Then call getOrderStatus. Never reveal order details unless the tool confirms the email matches the order (identity verification). If the tool returns VERIFICATION_FAILED or ORDER_NOT_FOUND, tell the customer politely and do not invent a status.
- Call escalateToHuman to hand off to a person.

WHEN TO ESCALATE (use escalateToHuman, do not improvise)
Escalate whenever you cannot fully and safely resolve the request yourself, specifically when:
- The question is not covered by the knowledge base and no tool can answer it.
- The customer disputes a charge, or asks for a refund, discount, or any exception to policy.
- The customer reports a damaged, defective, or wrong item.
- There is a complaint, a serious or legal tone, or clear frustration.
- The customer wants to change or cancel an order (you cannot do this).
- The customer explicitly asks to speak to a human.
When you escalate, confirm that a VoltMart specialist will follow up, and include the ticket ID the tool returns. NEVER promise a specific outcome (no "you'll get a refund").

GUARDRAILS
- Never invent a policy, price, date, or promise. If it is not in the knowledge base or returned by a tool, say you don't have that information and escalate.
- Never authorize refunds, discounts, or exceptions — that is a human's decision.
- Never reveal another customer's information; share order details only after identity is verified.
```

Select **Save**.

> **Callout — the system prompt is doing real work, not decoration.** The four blocks map
> directly to the brief: **SCOPE** keeps the assistant on-topic, **USING YOUR TOOLS** tells it
> *when* to reach for each tool (so it doesn't answer policy questions from memory), **WHEN TO
> ESCALATE** is an explicit, enumerated list (vague guidance is the #1 reason an agent skips
> escalation), and **GUARDRAILS** stops it inventing policies or authorizing refunds. We name
> the tools (`searchVoltMartPolicies`, `getOrderStatus`, `escalateToHuman`) in the prompt even
> before they exist — we'll add them with those exact names in the next phases.

In code, Role and Instructions become the `systemPrompt` record on the `ai:Agent`:

```ballerina
final ai:Agent voltMartAssistantAgent = check new (
    systemPrompt = {
        role: "VoltMart Support Assistant",
        instructions: string `...the prompt above...`
    },
    model = wso2ModelProvider,
    tools = []   // we'll add tools in Phases 2–4
);
```

**Verify this step works:**
1. Click **Run** (top-right), then click **Chat** (next to **Tracing: Off**).
2. Type: `What's the capital of France?`
3. Expect: a polite refusal that redirects you to VoltMart topics — *not* an answer. That
   confirms the SCOPE block is taking effect. (It has no tools yet, so don't test policy questions.)

[SCREENSHOT: The in-IDE Chat panel showing the off-topic refusal.]

---

## Phase 2 — Build the knowledge base (RAG)

The agent should answer policy questions from VoltMart's own documents, not from the model's
training data. We'll (a) ingest five policy docs into a vector knowledge base, and (b) expose
retrieval to the agent as a tool.

### Step 2.1 — Add the policy documents

Create a `knowledge_base/` folder in your project and add these five Markdown files. (Full
content is in the companion project under `voltmart-support/knowledge_base/`; summaries below.)

- `shipping-and-delivery.md` — timeframes, costs, regions.
- `returns-and-refunds.md` — 30-day window, condition requirements, refund process.
- `warranty.md` — coverage periods, inclusions/exclusions.
- `payments-and-billing.md` — accepted methods, billing FAQ.
- `general-faq.md` — account questions, how to track an order.

> **Why Markdown?** The `TextDataLoader` supports `pdf`, `docx`, `md`, `html`, and `pptx`.
> Markdown keeps the docs readable in the repo and lets the AUTO chunker split on headings.

### Step 2.2 — Create the ingestion automation

Ingestion is a one-shot job, so it belongs in an **Automation** artifact.

1. Select **+ Add Artifact** → **Automation** → **Create**.
2. On the flow line, click **+** → under **AI → RAG**, select **Data Loader** → **Text Data Loader**.
   - **Paths:** add the five files under `knowledge_base/`.
   - **Name:** `loader`.
3. Click the loader node → select the **load** action → set the result variable to `documents`.

[SCREENSHOT: The Text Data Loader configuration with the five Markdown paths.]

### Step 2.3 — Create the vector knowledge base

1. Click **+** → **AI → RAG → Knowledge Base** → **Vector Knowledge Base**.
2. **Vector Store:** click **+ Create New Vector Store** → choose **InMemory Vector Store** → **Save**.
3. **Embedding Model:** click **+ Create New Embedding Model** → choose **Default Embedding Provider (WSO2)** → **Save**.
4. **Chunker:** leave it at the default **AUTO**.
5. **Vector Knowledge Base Name:** `policyKnowledgeBase`.
6. **Save**.

[SCREENSHOT: The Vector Knowledge Base config — InMemory store, Default WSO2 embedding, AUTO chunker.]

This creates a reusable connection in `connections.bal`:

```ballerina
// In-memory: zero external setup, but its contents live only while the integration runs.
final ai:InMemoryVectorStore policyVectorStore = check new;
// SAME embedding provider must be used for ingestion and retrieval, or vectors won't compare.
final ai:Wso2EmbeddingProvider policyEmbeddingModel = check ai:getDefaultEmbeddingProvider();
// AUTO chunker picks a Markdown-aware splitter for our .md files.
final ai:VectorKnowledgeBase policyKnowledgeBase = new (policyVectorStore, policyEmbeddingModel);
```

> **Callout — why ingestion and the agent share one project.** An in-memory vector store
> lives only inside the running integration; stop it and the vectors are gone. So the
> automation that ingests and the agent that retrieves must run in the **same project** and
> share the **same `policyKnowledgeBase` connection**. (To split ingestion and serving into
> separate processes, you'd use an external store like Pinecone or pgvector — see Next steps.)

### Step 2.4 — Ingest the documents

1. Click **+** → select the `policyKnowledgeBase` variable → choose the **ingest** action.
2. Set **Documents** to `documents` (from Step 2.2).
3. Add a **Log Info** node with the message `VoltMart policy knowledge base ingested and ready.`

The generated automation (`ingestion.bal`):

```ballerina
import ballerina/ai;
import ballerina/log;

public function main() returns error? {
    ai:TextDataLoader loader = check new (
        "knowledge_base/shipping-and-delivery.md",
        "knowledge_base/returns-and-refunds.md",
        "knowledge_base/warranty.md",
        "knowledge_base/payments-and-billing.md",
        "knowledge_base/general-faq.md"
    );
    ai:Document[]|ai:Document documents = check loader.load();
    check policyKnowledgeBase.ingest(documents);   // chunk → embed → store
    log:printInfo("VoltMart policy knowledge base ingested and ready.");
}
```

### Step 2.5 — Expose retrieval to the agent as a tool

The agent reaches the knowledge base through a **custom tool** that wraps the knowledge base's
`retrieve` action. Go back to the **AI Chat Agent**, click **+** on the **AI Agent** node →
**Create Custom Tool**:

- **Name:** `searchVoltMartPolicies`
- **Description:** *Search VoltMart's official policy knowledge base… Call this BEFORE answering
  any such question and base your answer only on the text it returns. If nothing relevant is
  found, do not invent a policy.* (full text below)
- **Parameter:** `string query` — "The customer's question, in their own words".
- **Return Type:** `string`.

Then fill in the generated stub body:

```ballerina
# Search VoltMart's official policy knowledge base for the information needed to answer a
# customer's question about shipping, delivery, returns, refunds, warranty, payments, billing,
# or account/order-tracking basics. Call this BEFORE answering any such question and base your
# answer only on the text it returns. If nothing relevant is found, do not invent a policy.
#
# + query - The customer's question, in their own words
# + return - Relevant excerpts from VoltMart's policy documents, or NO_POLICY_FOUND if nothing matched
@ai:AgentTool
isolated function searchVoltMartPolicies(string query) returns string|error {
    ai:QueryMatch[] matches = check policyKnowledgeBase.retrieve(query, topK = 4);
    if matches.length() == 0 {
        return "NO_POLICY_FOUND: No matching VoltMart policy was found for this question.";
    }
    string context = "";
    foreach ai:QueryMatch m in matches {
        context += m.chunk.content.toString() + "\n\n";
    }
    return context.trim();
}
```

> **Why this shape:** `retrieve(query, topK = 4)` returns the four most similar chunks as
> `ai:QueryMatch` values; we concatenate their text and return it. The `NO_POLICY_FOUND`
> sentinel is deliberate — it gives the model a clear, machine-like signal to escalate instead
> of guessing, which we already told it to do in the system prompt.

Make sure the tool is attached to the agent: `tools = [searchVoltMartPolicies]`.

**Verify this step works:**
1. **Run** the project. In the run output, confirm the log line **"VoltMart policy knowledge
   base ingested and ready."** appears (ingestion ran on startup).
2. Open **Chat** and ask: `How long do I have to return something?`
3. Expect: a short answer of **30 days from delivery**, drawn from the returns policy — not a
   generic answer. (Turn on **Tracing** to see the `searchVoltMartPolicies` call if you want proof.)

[SCREENSHOT: Chat answering the returns-window question; trace showing the searchVoltMartPolicies call.]

More on RAG: [overview](https://wso2.com/integration-platform/docs/genai/develop/rag/overview),
[ingestion](https://wso2.com/integration-platform/docs/genai/develop/rag/rag-ingestion),
[query](https://wso2.com/integration-platform/docs/genai/develop/rag/rag-query).

---

## Phase 3 — Add the live order-status tool (with identity verification)

Now a tool that returns *live* data. We use mock order data so it's self-contained, and we
**verify identity** (order number + email) before sharing anything.

### Step 3.1 — Add mock order data

Create `data.bal` (and the `Order` type in `types.bal`):

```ballerina
// types.bal
type Order record {|
    string orderNumber;
    string accountEmail;   // used for identity verification
    string item;
    string status;         // processing | shipped | delivered
    string eta;
|};
```

```ballerina
// data.bal — stand-in for a real order system / connector. Keyed by order number.
final map<Order> & readonly mockOrders = {
    "10432": {orderNumber: "10432", accountEmail: "jordan@example.com", item: "AirWave Pro wireless headphones", status: "shipped", eta: "arriving Thursday, 18 June 2026"},
    "10588": {orderNumber: "10588", accountEmail: "priya@example.com", item: "SoundDock 2 Bluetooth speaker", status: "processing", eta: "ships within 1 business day"},
    "10219": {orderNumber: "10219", accountEmail: "sam@example.com", item: "VoltBook 14 laptop", status: "delivered", eta: "delivered on 9 June 2026"}
};
```

### Step 3.2 — Create the `getOrderStatus` custom tool

On the **AI Agent** node, **+** → **Create Custom Tool**:

- **Name:** `getOrderStatus`
- **Parameters:** `string orderNumber`, `string accountEmail`.
- **Return Type:** `string`.

Fill in the body:

```ballerina
# Look up the current status and delivery ETA of a VoltMart order. You MUST pass BOTH the order
# number AND the account email. The tool only returns details when the email matches the order —
# that is the identity check. Never share order details that this tool did not return.
#
# + orderNumber - The order number, e.g. "10432" (a leading '#' is fine)
# + accountEmail - The email address on the customer's VoltMart account
# + return - The order status and ETA when the email matches, otherwise VERIFICATION_FAILED / ORDER_NOT_FOUND
@ai:AgentTool
isolated function getOrderStatus(string orderNumber, string accountEmail) returns string {
    string trimmed = orderNumber.trim();
    string normalized = trimmed.startsWith("#") ? trimmed.substring(1) : trimmed;
    Order? 'order = mockOrders[normalized];
    if 'order is () {
        return "ORDER_NOT_FOUND: No VoltMart order matches that number. Do not guess a status.";
    }
    if 'order.accountEmail.toLowerAscii() != accountEmail.trim().toLowerAscii() {
        return "VERIFICATION_FAILED: That email does not match this order. Do not share any order details.";
    }
    return string `Order #${normalized} (${'order.item}): status is "${'order.status}", ${'order.eta}.`;
}
```

> **Callout — verification lives in the tool, not just the prompt.** Even if the model is
> talked into skipping the email, the tool refuses to return details unless the email matches.
> Defense-in-depth: the prompt tells the agent to ask for the email; the code guarantees it.

Attach it: `tools = [searchVoltMartPolicies, getOrderStatus]`.

**Verify this step works:**
1. **Run**, open **Chat**, and type: `Where's my order #10432?`
2. Expect: the agent **asks for the account email** before revealing anything.
3. Reply `jordan@example.com` → expect status **shipped** with the ETA.
4. Try a wrong email (e.g. `wrong@example.com`) → expect a polite "that doesn't match" and **no** details.

[SCREENSHOT: Chat showing the email request, then the verified order status.]

Tool concepts: [Tools](https://wso2.com/integration-platform/docs/genai/develop/agents/tools).

---

## Phase 4 — Add the custom "escalate to human" tool

This is the safety valve. When the assistant can't or shouldn't answer, it opens a ticket and
hands off — without promising anything.

### Step 4.1 — Create the `escalateToHuman` custom tool

On the **AI Agent** node, **+** → **Create Custom Tool**:

- **Name:** `escalateToHuman`
- **Parameters:** `string customerName`, `string contact`, `string orderReference`, `string issueSummary`, `string reason`.
- **Return Type:** `string`.

Add the `EscalationTicket` type to `types.bal`:

```ballerina
type EscalationTicket record {|
    string ticketId;
    string customerName;
    string contact;
    string orderReference;
    string issueSummary;
    string reason;
|};
```

Fill in the tool:

```ballerina
# Open a support ticket for VoltMart's human support team and hand the conversation off to a person.
# Call this WHENEVER you cannot fully resolve the request yourself: the answer is not in the policy
# knowledge base and no other tool can answer it; the customer disputes a charge or asks for a refund,
# discount, or exception to policy; the customer reports a damaged, defective, or wrong item; the
# customer is angry, threatens legal action, or complains; the customer wants to change or cancel an
# order; or the customer explicitly asks for a human. Do NOT promise any outcome — only confirm that a
# human will follow up.
#
# + customerName - The customer's name, or "Unknown" if not given
# + contact - The customer's email or phone, or "Unknown" if not provided
# + orderReference - The related order number if any, or "N/A"
# + issueSummary - One or two sentences summarising what the customer wants
# + reason - The escalation trigger (e.g. "damaged item", "refund request", "explicit human request")
# + return - A confirmation message containing the new ticket ID
@ai:AgentTool
isolated function escalateToHuman(string customerName, string contact, string orderReference,
        string issueSummary, string reason) returns string {
    string ticketId = nextTicketId();
    EscalationTicket ticket = {ticketId, customerName, contact, orderReference, issueSummary, reason};
    lock {
        openTickets.push(ticket.cloneReadOnly());   // stand-in for "create a helpdesk ticket"
    }
    log:printInfo("Escalation ticket created", ticket = ticket);
    return string `Ticket ${ticketId} has been created and a VoltMart support specialist will follow up with you shortly.`;
}

isolated EscalationTicket[] openTickets = [];
isolated int ticketCounter = 1000;

isolated function nextTicketId() returns string {
    lock {
        ticketCounter += 1;
        return string `VM-${ticketCounter}`;
    }
}
```

> **Callout — this description is the most important text in the whole project.** An agent
> decides whether to call a tool almost entirely from its **name + description**. A vague
> description ("escalate issues") is the #1 reason an agent silently *fails* to escalate and
> improvises an answer instead. So the description **enumerates the exact triggers** — refunds,
> damaged items, complaints, change/cancel, explicit human request — in the same words as the
> system prompt's WHEN TO ESCALATE list. The two reinforce each other: the prompt tells the
> agent the policy, the tool description makes the trigger unmistakable at call time. Note the
> required `reason` and `issueSummary` parameters: forcing the agent to fill them in makes it
> "show its work," which further nudges it to escalate deliberately rather than by accident.

Attach all three tools: `tools = [searchVoltMartPolicies, getOrderStatus, escalateToHuman]`.

**Verify this step works:**
1. **Run**, open **Chat**, and type: `My speaker arrived cracked and I want a refund.`
2. Expect: the agent **does not** promise a refund. It collects/uses what it has, calls
   `escalateToHuman`, and replies with a **ticket ID** and reassurance.
3. In the run output, confirm the **"Escalation ticket created"** log line with the captured fields.

[SCREENSHOT: Chat showing the damaged-item escalation with a ticket ID; log line in the output.]

---

## Phase 5 — Add conversation memory

We want the customer to never repeat themselves. The `ai:Listener` already keeps short-term
memory per `sessionId` automatically — but we'll add it **explicitly** so we control the window
size, exactly as the **+ Add Memory** flow does.

### Step 5.1 — Add memory in the designer

1. On the **AI Agent** node, click **+ Add Memory**.
2. In **Configure Memory**, select strategy **Short Term Memory**.
3. **Memory Name:** `voltMartMemory`.
4. Expand **Advanced Configurations** → **Store** → choose the **In-Memory Short Term Memory Store**.
5. **Save**.

[SCREENSHOT: The Configure Memory panel — Short Term Memory + In-Memory store.]

This produces:

```ballerina
// Keep the last 20 messages per session, so name/order number persist within a conversation.
final ai:InMemoryShortTermMemoryStore voltMartMemoryStore = check new (size = 20);
final ai:ShortTermMemory voltMartMemory = check new (voltMartMemoryStore);
```

…and wires it into the agent:

```ballerina
final ai:Agent voltMartAssistantAgent = check new (
    systemPrompt = { role: "VoltMart Support Assistant", instructions: string `...` },
    model = wso2ModelProvider,
    memory = voltMartMemory,                                   // <-- added
    tools = [searchVoltMartPolicies, getOrderStatus, escalateToHuman]
);
```

The chat service passes the `sessionId` through on every turn (`main.bal`):

```ballerina
service /voltMartAssistant on voltMartChatListener {
    resource function post chat(@http:Payload ai:ChatReqMessage request) returns ai:ChatRespMessage|error {
        string response = check voltMartAssistantAgent.run(request.message, request.sessionId);
        return {message: response};
    }
}
```

> **Why this matters:** memory is keyed by `sessionId`. Reuse the same `sessionId` across turns
> and the agent remembers the customer's name and order number; different `sessionId`s stay
> completely isolated, so two customers never see each other's context.

**Verify this step works:**
1. **Run**, open **Chat**.
2. Turn 1: `Hi, I'm Jordan and I'm asking about order #10432.`
3. Turn 2: `What's its status?` — without repeating the number.
4. Turn 3 (after it asks for email): `jordan@example.com`
5. Expect: the agent uses the order number from Turn 1 and your name from Turn 1 — you never
   had to repeat them.

More: [Memory](https://wso2.com/integration-platform/docs/genai/develop/agents/memory).

---

## Phase 6 — Test against the five conversations

Run the project and open the **Chat** panel (or use `curl` against
`http://localhost:9090/voltMartAssistant/chat` with a JSON body of `{"sessionId": "...", "message": "..."}`).
Use the **same `sessionId`** within a conversation, a **new one** between conversations.

### 1. Knowledge answer (RAG)
> **You:** How long do I have to return something?
>
> **Assistant:** You have 30 days from the delivery date to return most items, as long as
> they're in their original packaging with all accessories. Want me to walk you through starting a return?

*Expected behavior:* calls `searchVoltMartPolicies`, answers from the returns policy, stays brief.

### 2. Live lookup (with identity verification)
> **You:** Where's my order #10432?
>
> **Assistant:** Happy to check! Can you confirm the email on your VoltMart account?
>
> **You:** jordan@example.com
>
> **Assistant:** Thanks, Jordan — order #10432 (AirWave Pro wireless headphones) has shipped and
> is arriving Thursday, 18 June 2026.

*Expected behavior:* asks for the email first, calls `getOrderStatus`, reports status + ETA only after the email matches.

### 3. Escalation — out of authority
> **You:** My speaker arrived cracked and I want a refund.
>
> **Assistant:** I'm sorry your speaker arrived damaged. I've opened ticket VM-1001 and a VoltMart
> specialist will follow up with you shortly to make this right. Is the email on your account the
> best way to reach you?

*Expected behavior:* promises **nothing**, calls `escalateToHuman` (reason: damaged item / refund request), returns a ticket ID.

### 4. Escalation — unknown (not in the knowledge base)
> **You:** Do you price-match other retailers?
>
> **Assistant:** That's a great question, but I don't have a price-matching policy on file. I've
> opened ticket VM-1002 so a VoltMart specialist can give you a definitive answer.

*Expected behavior:* `searchVoltMartPolicies` returns `NO_POLICY_FOUND`, so the agent escalates instead of guessing.

### 5. Explicit handoff
> **You:** Just let me talk to a real person.
>
> **Assistant:** Of course — I've opened ticket VM-1003 and a VoltMart specialist will reach out to
> you shortly. Anything you'd like me to note for them?

*Expected behavior:* escalates immediately via `escalateToHuman` (reason: explicit human request).

> **Note on wording:** LLM responses vary turn to turn, so your exact phrasing will differ. What
> should be consistent is the **behavior**: RAG-grounded answers for 1, identity check for 2, and
> a ticket-with-no-promises for 3–5. If conversation 4 ever answers with a made-up policy instead
> of escalating, tighten the `NO_POLICY_FOUND` handling in the prompt and the escalation tool description.

[SCREENSHOT: The Chat panel running conversation 3, showing the escalation with a ticket ID.]

---

## Next steps

You deliberately left these out of the first build — they're where to go next:

- **Payment processing / real refunds.** The escalation tool is a stand-in; a real build would
  open tickets in a helpdesk via a [connector-based tool](https://wso2.com/integration-platform/docs/genai/develop/agents/tools)
  and never let the agent move money.
- **Multiple connected backends.** Swap `mockOrders` for a real order system using a database or
  API connection (**Use Connection** when adding a tool).
- **A durable / external vector store.** The in-memory store resets on restart. For production,
  use Pinecone, pgvector, Weaviate, or Milvus (configure the index for 1536-dim vectors) and you
  can split ingestion and serving into separate processes.
- **Persistent memory.** Swap the in-memory store for the MSSQL short-term memory store so
  conversations survive restarts — see [Memory](https://wso2.com/integration-platform/docs/genai/develop/agents/memory)
  and the [IT helpdesk tutorial](https://wso2.com/integration-platform/docs/genai/tutorials/it-helpdesk-chatbot).
- **Multi-agent handoffs and MCP.** Expose this agent's tools over MCP, or route to specialist
  agents — see [Building a customer care agent with MCP](https://wso2.com/integration-platform/docs/genai/tutorials/building-a-customer-care-agent-mcp).
- **Evaluation & observability.** Turn on **Tracing** (OpenTelemetry) to inspect tool calls, and
  add an evaluation harness before you ship prompt changes.

### Using your own model provider instead of the WSO2 default
If you have an OpenAI/Anthropic/Azure key, click the model-provider circle on the **AI Agent**
node → **Create New Model Provider** → pick your provider → set the **API Key** as a *configurable*
(stored in `Config.toml`, not hard-coded), and choose the model type. See
[Model providers](https://wso2.com/integration-platform/docs/genai/develop/components/model-providers).

---

## Appendix — project layout

The companion project (`voltmart-support/`) contains everything above:

```
voltmart-support/
├── Ballerina.toml              # package manifest
├── Config.toml                 # WSO2 provider credentials (generated by the configure command)
├── connections.bal             # model provider + RAG components (vector store, embedding, KB)
├── types.bal                   # Order, EscalationTicket records
├── data.bal                    # mock order data
├── agents.bal                  # the agent + 3 tools + memory
├── ingestion.bal               # automation: load + ingest the policy docs on startup
├── main.bal                    # HTTP chat service (ai:Listener)
└── knowledge_base/
    ├── shipping-and-delivery.md
    ├── returns-and-refunds.md
    ├── warranty.md
    ├── payments-and-billing.md
    └── general-faq.md
```

Run it with **Run** in the IDE (or `bal run`). On startup the automation ingests the five
policy docs into the in-memory knowledge base, the chat service starts on port `9090`, and the
agent is ready at `POST /voltMartAssistant/chat`.
