import fs from "fs";
import {
    ServerlessSpyListener,
    createServerlessSpyListener,
} from "serverless-spy";
import {
    AgencyCreatedEvent,
    AgencyCreatedEventEnvelope,
    AgencyDeletedEvent,
    AgencyDeletedEventEnvelope,
    AgencyUpdatedEvent,
    AgencyUpdatedEventEnvelope,
} from "vimo-events";
import { ServerlessSpyEvents } from "../spy";
import { EventBridge } from "../utils";
import { generateAgency } from "../utils/generators";


const {
    ApiUrl,
    ServerlessSpyWsUrl,
    UserPoolId,
    UserPoolClientId,
    EventBusName,
} = Object.values(
    JSON.parse(fs.readFileSync("test.output.json", "utf8"))
)[0] as Record<string, string>;
process.env.EVENT_BUS_NAME = EventBusName;

const eventBridge = new EventBridge(EventBusName);

let serverlessSpyListener: ServerlessSpyListener<ServerlessSpyEvents>;
beforeEach(async () => {
    serverlessSpyListener =
        await createServerlessSpyListener<ServerlessSpyEvents>({
            serverlessSpyWsUrl: ServerlessSpyWsUrl,
        });
});

afterEach(async () => {
    serverlessSpyListener.stop();
});

test("Temporary test", async () => {
    const agency = generateAgency();

    await eventBridge.send(AgencyCreatedEvent.build(agency));

})




