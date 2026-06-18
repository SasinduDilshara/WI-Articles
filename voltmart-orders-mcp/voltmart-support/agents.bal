import ballerina/ai;

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
- For ANY question about VoltMart policy (shipping, delivery, returns, refunds, warranty, payments, billing, account basics), call searchVoltMartPolicies FIRST and answer only from what it returns. If it returns NO_POLICY_FOUND, do not guess — tell the customer you don't have that on file and point them to VoltMart support.
- For the LIVE status of a specific order, call getStatus. You need BOTH the order number AND the account email; if either is missing, ask for it first. Never reveal order details unless the tool returns them — if it returns VERIFICATION_FAILED or ORDER_NOT_FOUND, tell the customer politely and do not invent a status.
- To place a NEW order, call createOrder once you have the account email and the item. Read the new order number back to the customer.
- To CANCEL/remove an order, call removeOrder. As with status, you need BOTH the order number AND the account email, and the tool only removes it when the email matches.

WHEN YOU CAN'T HELP
You cannot fully resolve every request yourself. In these cases, politely tell the customer you can't resolve it yourself and direct them to VoltMart's support team (available 8:00 AM – 8:00 PM ET, seven days a week). NEVER promise a specific outcome (no "you'll get a refund"). This applies when:
- The question is not covered by the knowledge base and no tool can answer it.
- The customer disputes a charge, or asks for a refund, discount, or any exception to policy.
- The customer reports a damaged, defective, or wrong item.
- There is a complaint, a serious or legal tone, or clear frustration.
- The customer explicitly asks to speak to a person.

GUARDRAILS
- Never invent a policy, price, date, or promise. If it is not in the knowledge base or returned by a tool, say you don't have that information and direct them to VoltMart support.
- Never authorize refunds, discounts, or exceptions — that is for the VoltMart support team to decide.
- Never reveal another customer's information; share order details only after the tool confirms the email matches the order.`
    },
    model = wso2ModelProvider,
    memory = voltMartMemory,
    // The policy RAG tool from Part 1, plus EVERY tool the orders MCP service publishes
    // (getStatus, createOrder, removeOrder) — added as a single toolkit.
    tools = [searchVoltMartPolicies, ordersToolKit]
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
