import {
    EventBridgeClient,
    PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

import { EventBridgeEvent } from "aws-lambda";

export class EventBridge {
    private eventBridgeClient: EventBridgeClient;

    constructor(private eventBusName: string) {
        this.eventBridgeClient = new EventBridgeClient({});
        this.eventBusName = eventBusName;
    }

    async send(event: PutEventsCommand) {
        return this.eventBridgeClient.send(event);
    }
}