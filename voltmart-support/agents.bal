import ballerina/ai;
import ballerina/log;

// ----- Conversation memory (Phase 5) -----
// Short-term memory keyed by sessionId. Keeping the last 20 messages means the customer
// never has to repeat their name or order number within a conversation. An agent gets a
// fresh in-memory store by default; we create one explicitly so we can set the window size.
final ai:InMemoryShortTermMemoryStore voltMartMemoryStore = check new (size = 20);
final ai:ShortTermMemory voltMartMemory = check new (voltMartMemoryStore);

// ----- The agent (Phase 1) -----
final ai:Agent voltMartAssistantAgent = check new (
    systemPrompt = {
        role: "VoltMart Support Assistant",
        instructions: string `You are the front-line support assistant for VoltMart, an online consumer-electronics store (headphones, speakers, laptops, and accessories). You are friendly, sound human, and keep answers short — usually one to three sentences.

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
- Never reveal another customer's information; share order details only after identity is verified.`
    },
    model = wso2ModelProvider,
    memory = voltMartMemory,
    tools = [searchVoltMartPolicies, getOrderStatus, escalateToHuman]
);

// ----- Tool 1: Knowledge base retrieval / RAG (Phase 2) -----

# Search VoltMart's official policy knowledge base for the information needed to answer a
# customer's question about shipping, delivery, returns, refunds, warranty, payments, billing,
# or account/order-tracking basics. Call this BEFORE answering any such question and base your
# answer only on the text it returns. If nothing relevant is found, do not invent a policy.
#
# + query - The customer's question, in their own words (e.g. "how long do I have to return an item")
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

// ----- Tool 2: Live order-status lookup with identity verification (Phase 3) -----

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

// ----- Tool 3: Escalate to a human (Phase 4) -----

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
# + reason - The escalation trigger (e.g. "damaged item", "refund request", "explicit human request", "not covered by policy")
# + return - A confirmation message containing the new ticket ID
@ai:AgentTool
isolated function escalateToHuman(string customerName, string contact, string orderReference,
        string issueSummary, string reason) returns string {
    string ticketId = nextTicketId();
    EscalationTicket ticket = {ticketId, customerName, contact, orderReference, issueSummary, reason};
    // Stand-in for "create a ticket in the helpdesk". Here we just record and log it.
    lock {
        openTickets.push(ticket.cloneReadOnly());
    }
    log:printInfo("Escalation ticket created", ticket = ticket);
    return string `Ticket ${ticketId} has been created and a VoltMart support specialist will follow up with you shortly.`;
}

// In-memory ticket store + a simple sequential ticket-ID generator (guarded for concurrency).
isolated EscalationTicket[] openTickets = [];
isolated int ticketCounter = 1000;

isolated function nextTicketId() returns string {
    lock {
        ticketCounter += 1;
        return string `VM-${ticketCounter}`;
    }
}
