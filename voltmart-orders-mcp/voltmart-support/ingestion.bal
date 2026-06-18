import ballerina/ai;
import ballerina/log;

// Automation (a `main` function) that runs once on startup and loads the VoltMart policy
// documents into the in-memory knowledge base, so the agent can retrieve from them.
// Because the vector store is in-memory, this ingestion and the agent share one runtime.
public function main() returns error? {
    ai:TextDataLoader loader = check new (
        "knowledge_base/shipping-and-delivery.md",
        "knowledge_base/returns-and-refunds.md",
        "knowledge_base/warranty.md",
        "knowledge_base/payments-and-billing.md",
        "knowledge_base/general-faq.md"
    );

    ai:Document[]|ai:Document documents = check loader.load();
    check policyKnowledgeBase.ingest(documents);

    log:printInfo("VoltMart policy knowledge base ingested and ready.");
}
