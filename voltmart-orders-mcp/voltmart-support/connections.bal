import ballerina/ai;

// The agent's LLM. `getDefaultModelProvider()` returns the WSO2-hosted model, so no
// third-party API key is needed — just sign in to WSO2 Integrator Copilot and run
// "Ballerina: Configure default WSO2 model provider". To use OpenAI/Anthropic/Azure
// instead, create a model provider with your own key (see the article's "Next steps").
final ai:Wso2ModelProvider wso2ModelProvider = check ai:getDefaultModelProvider();

// ----- RAG components for the VoltMart policy knowledge base -----

// In-memory vector store: zero external dependencies, but its contents live only for the
// lifetime of this running integration. That is exactly why ingestion (ingestion.bal) and
// the agent that retrieves (agents.bal) MUST live in the same project/runtime.
final ai:InMemoryVectorStore policyVectorStore = check new;

// Same WSO2 credentials as the model provider; produces 1536-dimensional embeddings.
// Use the SAME embedding provider for ingestion and retrieval, or vectors won't compare.
final ai:Wso2EmbeddingProvider policyEmbeddingModel = check ai:getDefaultEmbeddingProvider();

// The knowledge base ties the vector store + embedding model together. Chunker defaults to
// AUTO, which picks a Markdown-aware chunker for our .md policy files.
final ai:VectorKnowledgeBase policyKnowledgeBase = new (policyVectorStore, policyEmbeddingModel);
