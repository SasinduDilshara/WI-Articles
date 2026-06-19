# Helpers

All helpers are auto-loaded on daemon startup and hot-reload on file change.

Design rules:
- Helpers should be generic and scenario-agnostic.
- Scenario files compose helpers; helpers should not mention a demo by name.
- Prefer small helpers that expose UI intent: open a catalog, select a card, fill a field, add a node.

## Functions

| Function | File | Description |
|----------|------|-------------|
| **Project & service** | | |
| `createProjectAndIntegration(baseName)` | `create-project-and-integration.js` | Skips sign-in, creates project+integration, navigates into integration overview. Returns `{integrationName, projectName}`. |
| `createHttpServiceWithResource(method, path, responseCodes)` | `create-http-service-with-resource.js` | From integration overview: adds HTTP service (base `/`), adds resource with given HTTP method. Lands in flow editor. |
| **Artifact catalog** | | |
| `openAddArtifact()` | `artifact-catalog.js` | From overview, opens Add Artifact. |
| `selectArtifactKind(name, opts)` | `artifact-catalog.js` | Selects an artifact kind by visible name. `opts`: `{exact?}`. |
| `openArtifactKind(name, opts)` | `artifact-catalog.js` | Opens Add Artifact and selects an artifact kind. |
| `addArtifact(name)` | `artifact-catalog.js` | Backwards-compatible wrapper for `openArtifactKind(name, {exact:false})`. |
| `openConfigurationArtifact(integrationName)` | `artifact-catalog.js` | Navigates to overview and opens Configuration. |
| `openConnectionCatalog(integrationName)` | `artifact-catalog.js` | Navigates to overview and opens the Connection catalog. |
| `setCatalogSearch(placeholder, value)` | `artifact-catalog.js` | Fills a catalog search field. |
| `clickCatalogCard(opts)` | `artifact-catalog.js` | Clicks a catalog card by `{title, subtitle?, exactTitle?}`. |
| `waitForCatalogLoad(timeout)` | `artifact-catalog.js` | Waits while Pulling/Loading text is visible. |
| **Navigation** | | |
| `navigateToOverview(integrationName)` | `navigation.js` | Navigates to integration overview via breadcrumb. Retries. |
| `navigateToIntegrationOverview(integrationName)` | `run-and-wait.js` | Alias for `navigateToOverview`. |
| `openArtifactFromOverview(artifactText)` | `navigation.js` | Clicks an artifact card on the overview to enter its view. |
| `navigateBack()` | `navigation.js` | Clicks the back button to return from a sub-view. |
| `overviewNodeAction(nodeText, action)` | `navigation.js` | Clicks an overview node kebab and selects action (`Edit`, `Delete`). |
| **AI Chat Agent** | | |
| `createAiChatAgent(agentName)` | `ai-chat-agent.js` | From overview, creates AI Chat Agent artifact. Waits for module pull. Lands in agent flow view. |
| `configureAgent(opts)` | `ai-chat-agent.js` | Configures agent node. `opts`: `{role, instructions, maxIter}`. |
| `addAgentMemory()` | `ai-chat-agent.js` | Adds Short Term Memory to the agent. |
| `openCreateToolForm()` | `ai-chat-agent.js` | Opens Add New Tool > Create Custom Tool. |
| `createAgentTool(opts)` | `ai-chat-agent.js` | Creates a custom agent tool. `opts`: `{name, description, params, returnType, returnDescription}`. |
| **AI components** | | |
| `openNodePanelFromTopLink()` | `ai-components.js` | Opens node panel from a top link in a flow. |
| `openNodePanelCategory(...labels)` | `ai-components.js` | Clicks nested node-panel categories. |
| `openAiComponentCatalog(componentPluralTitle)` | `ai-components.js` | Opens AI component catalogs such as `Model Providers` or `Knowledge Bases`. |
| `addOpenAiModelProvider(opts)` | `ai-components.js` | Adds OpenAI Model Provider. `opts`: `{apiKeyExpr, modelExpr, retryExpr?, name?}`. |
| `configureAgentModelProvider(providerName)` | `ai-components.js` | Clicks the agent model-provider node and selects an existing provider. |
| `addVectorKnowledgeBase(opts)` | `ai-components.js` | Adds vector store + vector knowledge base. `opts`: `{vectorStoreTitle, vectorStorePackage?, vectorStoreExpressions, embeddingProviderExpr, knowledgeBaseName?}`. |
| **Configuration** | | |
| `addConfigurableVariable(opts)` | `configuration.js` | Adds a configurable variable. `opts`: `{name, type?, required?}`. |
| `addConfigVariable(name, type)` | `configuration.js` | Backwards-compatible simple wrapper. |
| `addConfigurableVariables(variables)` | `configuration.js` | Adds many variables. Items may be names or `{name,type,required}` objects. |
| **Connections** | | |
| `selectConnectorFromCatalog(opts)` | `connections.js` | Searches/clicks a connector card. `opts`: `{search?, title, packageName?}`. |
| `switchLabeledFieldToExpression(labelText)` | `connections.js` | Switches a labeled form field to Expression mode. |
| `fillExpressionAt(expr, index)` | `connections.js` | Fills CodeMirror expression and closes helper panel. |
| `saveConnectionForm()` | `connections.js` | Saves a connection form and waits for it to close. |
| `addPrebuiltConnection(opts)` | `connections.js` | Adds a pre-built connector from catalog. Supports expression fields and record fields. |
| `fillRecordConfig(recordFields)` | `connections.js` | Fills Record Configuration from `{field: balExpr}`. |
| `addOpenAiEmbeddingProvider(opts)` | `connections.js` | Convenience wrapper for OpenAI Embedding Provider. `opts`: `{apiKeyExpr, modelExpr, name?}`. |
| `addCalendarConnection(opts)` | `connections.js` | Convenience wrapper for `ballerinax/googleapis.calendar`. `opts`: `{connectionName, configExpr}`. |
| `addConnectorConnection(connectorName, connectionName, recordFields)` | `add-connector-connection.js` | Adds a pre-built connector connection from node-panel Add Connection. |
| `checkRecordFields(fieldNames)` | `add-connector-connection.js` | Checks checkboxes in Record Configuration by field name. |
| `addHttpConnectionFromPanel(name, url)` | `add-http-connection-from-panel.js` | Adds HTTP connection via node side panel. |
| `addDatabaseConnection(opts)` | `add-database-connection.js` | Introspects DB, selects tables, names connection. `opts`: `{type, host, port, database, user, password, connectionName, tables?}`. |
| `writeConfigToml(integrationName, entries)` | `add-database-connection.js` | Writes Config.toml for configurable secrets. |
| **Resource configuration** | | |
| `configureResource(opts)` | `resource-config.js` | One-shot resource config. `opts`: `{queryParams, payloadType, headers}`. |
| `importPayloadFromJson(jsonString)` | `import-payload-from-json.js` | Imports JSON sample as payload type. |
| **Artifacts & events** | | |
| `addEventHandler(handlerName)` | `add-event-handler.js` | Adds an event handler and lands in flow editor. |
| `addLogInfoNode(buttonId, msgExpr)` | `add-log-node.js` | Adds Log Info node. |
| **Nodes** | | |
| `addConnectorOperationNode(buttonId, connectionName, operationName)` | `add-connector-operation.js` | Adds connector operation node. Lands on operation config form. |
| `addHttpGetCall(buttonId, connectionName, pathExpr, resultVar, targetType)` | `add-http-get-call.js` | Adds HTTP GET node. |
| `addDatabaseOperationNode(buttonId, connectionName, operationText, opts)` | `add-database-operation.js` | Adds typed DB operation. |
| `fillNodeForm(fields)` | `fill-node-form.js` | Fills and saves node config form. `fields`: `{label: text}` or `{label: {expr}}`. |
| `addHttpPostAndReturn(buttonId, connectionName, resultVar)` | `add-http-post-call-in-branch.js` | Adds HTTP POST + Return in one branch. |
| `addHttpPostCallInBranch(buttonId, connectionName, resultVar)` | `add-http-post-call-in-branch.js` | Adds HTTP POST only; returns following link-add-button ID. |
| `addReturnInBranch(buttonId, expression)` | `add-return-in-branch.js` | Adds Return node at a specific button. |
| `addReturnInDoBlock(expression)` | `do-block-insert.js` | Adds Return at end of do{} block. |
| `addMatchNode(targetExpr, patterns)` | `add-match-node.js` | Adds Match node. |
| `addDeclareVarInDoBlock(name, expr)` | `do-block-insert.js` | Declares variable at end of do{} block. |
| **Function/tool flows** | | |
| `openFunctionFlow(functionName)` | `function-flow.js` | Opens a function/tool flow from the left tree. |
| `visibleAddButtons()` | `function-flow.js` | Returns visible flow add buttons with coordinates. |
| `lastVisibleAddButton()` | `function-flow.js` | Returns the lowest visible add-button id. |
| `openNodePanelAfterLastNode()` | `function-flow.js` | Opens node panel after the last visible node. |
| `openNodeFormAfterLastNode(nodeText)` | `function-flow.js` | Opens a node form after the last node. |
| `addDeclareVariableNode(opts)` | `function-flow.js` | Adds Declare Variable. `opts`: `{name?, type?, expr?}`. |
| `addReturnNode(expr)` | `function-flow.js` | Adds Return with expression. |
| `setFunctionReturnType(functionName, returnType)` | `function-flow.js` | Opens function config and changes return type. |
| `setNodeExpressionByText(opts)` | `function-flow.js` | Edits a node expression by node text. |
| **Navigation & run** | | |
| `runAndWaitForEndpoint(url, timeout, opts)` | `run-and-wait.js` | Clicks Run on overview, polls endpoint until ready. |
| **Canvas & DOM** | | |
| `clickAddButton(id)` | `flow-interactions.js` | Clicks any add-button. |
| `clickEmptyNodeButton(id)` | `flow-interactions.js` | Clicks empty-node add-button. |
| `clickLinkButton(id)` | `flow-interactions.js` | Clicks link add-button. |
| `clickInNodePanel(text)` | `flow-interactions.js` | JS-clicks a node-panel item by text. |
| `clickVscodeButton(text)` | `flow-interactions.js` | Clicks a vscode-button by text. |
| `firstEmptyNodeButton()` | `flow-interactions.js` | Returns first empty-node add-button. |
| `listAddButtons()` | `prelude.js` | Lists all add-button testids. |
| `linkAddButtonExplainer()` | `link-add-button-explainer.js` | Maps add-buttons to branch labels. |
| `getLastDoBlockButtonId()` | `do-block-insert.js` | Returns add-button before Error Handler. |
| `fitCanvasToScreen()` | `flow-interactions.js` | Fits canvas to screen. |
| `zoomOutCanvas(clicks)` | `flow-interactions.js` | Zooms out N times. |
| **Form utilities** | | |
| `guestFill(locator, text)` | `prelude.js` | Fills a vscode-text-field. |
| `cmFill(text, index)` | `prelude.js` | Fills CodeMirror by index. |
| `vscodeFill(selector, text)` | `vscode-field-fill.js` | Fills vscode text-field/area via shadow DOM. |
| `vscodeFillByName(nameAttr, text, nth)` | `vscode-field-fill.js` | Fills vscode text-field/area by `[name]`. |
| `fillVariableName(name)` | `vscode-field-fill.js` | Fills first variable name field. |
| `clickSaveButton()` | `flow-interactions.js` | Clicks Save via dispatchEvent. |
| `saveNodeForm()` | `flow-interactions.js` | Clicks Save and waits for save/validation. |
| `saveAndCloseNodeForm()` | `flow-interactions.js` | Blurs CMs, saves, waits, closes side panel. |
| `waitForButtonGone(text, timeout)` | `flow-interactions.js` | Waits for a vscode-button to disappear. |
| `closeHelperPanel()` | `flow-interactions.js` | Closes autocomplete/helper panel. |
| `blurAllCM()` | `flow-interactions.js` | Blurs all CM editors. |
| `dismissSidePanel()` | `flow-interactions.js` | Presses Escape. |
| `closeNodeForm()` | `flow-interactions.js` | Closes current node config form. |
| `closeSidePanel()` | `flow-interactions.js` | Closes side panel. |
| `scrollNodeIntoView(textMatch)` | `flow-interactions.js` | Scrolls canvas node into view. |
| `ensureNodePanelOpen()` | `flow-interactions.js` | Opens node panel if not visible. |
| **Inspection** | | |
| `snapshot(filter)` | `prelude.js` | Aria snapshot of guest. |
| `hostSnapshot()` | `prelude.js` | Aria snapshot of VS Code host. |
| `waitForText(text, timeout)` | `prelude.js` | Polls guest snapshot for text. |
| `waitForEndpoint(url, timeout, opts)` | `prelude.js` | Polls HTTP endpoint. |
| `readTerminal()` | `terminal.js` | Reads terminal via clipboard. |
| `deleteNodeById(nodeId)` | `do-block-insert.js` | Deletes canvas node by data-nodeid. |
| `deleteNodeByText(text)` | `do-block-insert.js` | Deletes canvas node by text. |
