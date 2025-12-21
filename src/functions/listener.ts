import {EventBridgeEvent} from "aws-lambda";
import {AgencyCreatedEvent, AgencyUpdatedEvent} from "vimo-events";
import {Agency} from "../core/agency";

type EventEnvelope = {
    type: string;
    data: Record<string, any>;
    timestamp: number;
    source: string;
    id: string;
};

export const handler = async (
    event: EventBridgeEvent<string, EventEnvelope>
) => {
    if (event["detail-type"] === AgencyUpdatedEvent.type) {
        const detail = AgencyUpdatedEvent.parse(event.detail);
        await Agency.update({
            ...detail.data,
            oplock: detail.timestamp,
        });
    } else if (event["detail-type"] === AgencyCreatedEvent.type) {
        const detail = AgencyCreatedEvent.parse(event.detail);
        await Agency.update({
            ...detail.data,
            oplock: detail.timestamp,
        });
    }
};