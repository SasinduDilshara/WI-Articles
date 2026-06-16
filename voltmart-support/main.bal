import ballerina/ai;
import ballerina/http;

// Exposes the agent as an HTTP chat service. The ai:Listener automatically maintains
// conversation memory per `sessionId`, so each customer's context stays separate.
listener ai:Listener voltMartChatListener = new (listenOn = check http:getDefaultListener());

service /voltMartAssistant on voltMartChatListener {
    resource function post chat(@http:Payload ai:ChatReqMessage request)
            returns ai:ChatRespMessage|error {
        string response = check voltMartAssistantAgent.run(request.message, request.sessionId);
        return {message: response};
    }
}
