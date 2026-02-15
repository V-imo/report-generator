import React from "react";
import { EventBridgeEvent } from "aws-lambda";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { InspectionUpdatedEvent, InspectionPdfGeneratedEvent } from "vimo-events";
import { Agency } from "../core/agency";
import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

const logger = new Logger({ serviceName: process.env.SERVICE });
const tracer = new Tracer({ serviceName: process.env.SERVICE });

const s3Client = tracer.captureAWSv3Client(new S3Client({}));
const eventBridgeClient = tracer.captureAWSv3Client(new EventBridgeClient({}));

type Room = NonNullable<InspectionUpdatedEvent.InspectionUpdatedEventData["rooms"]>[number];

const STATE_COLORS: Record<string, string> = {
    NEW: "#22c55e",
    GOOD: "#3b82f6",
    BAD: "#f97316",
    BROKEN: "#ef4444",
};

const STATE_LABELS: Record<string, string> = {
    NEW: "Neuf",
    GOOD: "Bon",
    BAD: "Mauvais",
    BROKEN: "Casse",
};

const styles = StyleSheet.create({
    page: {
        padding: 50,
        fontSize: 12,
        fontFamily: "Helvetica",
    },
    title: {
        fontSize: 24,
        fontFamily: "Helvetica-Bold",
        textAlign: "center",
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        textAlign: "center",
        marginBottom: 4,
    },
    date: {
        fontSize: 12,
        textAlign: "center",
        marginBottom: 16,
    },
    separator: {
        borderBottomWidth: 1,
        borderBottomColor: "#000000",
        marginBottom: 16,
    },
    roomTitle: {
        fontSize: 16,
        fontFamily: "Helvetica-Bold",
        color: "#1e40af",
        marginBottom: 4,
    },
    roomDescription: {
        fontSize: 10,
        fontFamily: "Helvetica-Oblique",
        marginBottom: 8,
    },
    elementRow: {
        flexDirection: "row",
        marginBottom: 2,
    },
    elementName: {
        fontSize: 12,
        fontFamily: "Helvetica-Bold",
    },
    elementSeparator: {
        fontSize: 12,
    },
    elementDescription: {
        fontSize: 10,
        marginBottom: 4,
    },
    imagesRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginTop: 4,
        marginBottom: 8,
    },
    image: {
        width: 120,
        height: 90,
        objectFit: "contain",
    },
    elementBlock: {
        marginBottom: 8,
    },
    roomBlock: {
        marginBottom: 12,
    },
    footer: {
        fontSize: 8,
        color: "#666666",
        textAlign: "center",
        marginTop: 30,
    },
});

type ImageCache = Map<string, Buffer>;

async function fetchImageAsBuffer(imageUrl: string): Promise<Buffer | null> {
    try {
        if (imageUrl.startsWith("s3://")) {
            const match = imageUrl.match(/^s3:\/\/([^/]+)\/(.+)$/);
            if (match) {
                const [, bucket, key] = match;
                const response = await s3Client.send(
                    new GetObjectCommand({ Bucket: bucket, Key: key })
                );
                const chunks: Uint8Array[] = [];
                for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
                    chunks.push(chunk);
                }
                return Buffer.concat(chunks);
            }
        }

        if (imageUrl.startsWith("http")) {
            const response = await fetch(imageUrl);
            if (!response.ok) return null;
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }

        return null;
    } catch (error) {
        logger.warn("Failed to fetch image", { imageUrl, error });
        return null;
    }
}

async function prefetchImages(rooms: Room[]): Promise<ImageCache> {
    const cache: ImageCache = new Map();
    const urls = new Set<string>();

    for (const room of rooms) {
        for (const element of room.elements) {
            if (element.images) {
                for (const url of element.images.slice(0, 4)) {
                    urls.add(url);
                }
            }
        }
    }

    await Promise.all(
        Array.from(urls).map(async (url) => {
            const buffer = await fetchImageAsBuffer(url);
            if (buffer) {
                cache.set(url, buffer);
            }
        })
    );

    return cache;
}

function InspectionReport({
                              inspection,
                              agencyName,
                              imageCache,
                          }: {
    inspection: InspectionUpdatedEvent.InspectionUpdatedEventData;
    agencyName: string;
    imageCache: ImageCache;
}) {
    const inspectionDate = new Date(inspection.date).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    });
    const rooms = (inspection.rooms || []) as Room[];

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <Text style={styles.title}>Rapport d&apos;Inspection</Text>
                <Text style={styles.subtitle}>Agence: {agencyName}</Text>
                <Text style={styles.date}>Date: {inspectionDate}</Text>
                <View style={styles.separator} />

                {rooms.map((room, roomIndex) => (
                    <View key={roomIndex} style={styles.roomBlock}>
                        <Text style={styles.roomTitle}>
                            {roomIndex + 1}. {room.name}
                        </Text>
                        {room.description && (
                            <Text style={styles.roomDescription}>{room.description}</Text>
                        )}

                        {room.elements.map((element, elementIndex) => {
                            const stateColor = STATE_COLORS[element.state] || "#666666";
                            const stateLabel = STATE_LABELS[element.state] || element.state;
                            const images = (element.images || []).slice(0, 4);

                            return (
                                <View key={elementIndex} style={styles.elementBlock}>
                                    <View style={styles.elementRow}>
                                        <Text style={styles.elementName}>{element.name}</Text>
                                        <Text style={styles.elementSeparator}> - </Text>
                                        <Text style={{ fontSize: 12, color: stateColor }}>
                                            {stateLabel}
                                        </Text>
                                    </View>

                                    {element.description && (
                                        <Text style={styles.elementDescription}>
                                            {element.description}
                                        </Text>
                                    )}

                                    {images.length > 0 && (
                                        <View style={styles.imagesRow}>
                                            {images.map((url, imgIndex) => {
                                                const buffer = imageCache.get(url);
                                                if (!buffer) return null;
                                                return (
                                                    <Image
                                                        key={imgIndex}
                                                        style={styles.image}
                                                        src={{ data: buffer, format: "png" }}
                                                    />
                                                );
                                            })}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                ))}

                <Text style={styles.footer}>
                    Rapport genere automatiquement le{" "}
                    {new Date().toLocaleDateString("fr-FR")}
                </Text>
            </Page>
        </Document>
    );
}

export const handler = async (
    event: EventBridgeEvent<string, any>
) => {
    logger.info("Received inspection event", { event });

    if (event["detail-type"] !== InspectionUpdatedEvent.type) {
        logger.info("Ignoring non-inspection event");
        return;
    }

    const detail = InspectionUpdatedEvent.parse(event.detail);

    if (detail.data.status !== "DONE") {
        logger.info("Ignoring inspection not in DONE status");
        return;
    }

    const { inspectionId, propertyId, agencyId } = detail.data;

    const agency = await Agency.get(agencyId);
    const agencyName = agency?.name || "Agence inconnue";

    logger.info("Generating PDF", { inspectionId, agencyId, agencyName });

    const rooms = (detail.data.rooms || []) as Room[];
    const imageCache = await prefetchImages(rooms);

    const pdfBuffer = await renderToBuffer(
        <InspectionReport
            inspection={detail.data}
            agencyName={agencyName}
            imageCache={imageCache}
        />
    );

    const bucketName = process.env.PDF_BUCKET_NAME!;
    const key = `inspections/${agencyId}/${propertyId}/${inspectionId}.pdf`;

    await s3Client.send(
        new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: Buffer.from(pdfBuffer),
            ContentType: "application/pdf",
        })
    );

    logger.info("PDF uploaded to S3", { bucketName, key });

    /* --- ÉMISSION D'ÉVÉNEMENT DÉSACTIVÉE pour le porte monnaie d'Alfred ---
    const pdfGeneratedCommand = InspectionPdfGeneratedEvent.build({
        inspectionId,
        propertyId,
        agencyId,
        key,
        bucketName,
    });

    await eventBridgeClient.send(pdfGeneratedCommand);
    logger.info("InspectionPdfGeneratedEvent emitted", { inspectionId });
    ----------------------------------------- */

    return {
        statusCode: 200,
        body: JSON.stringify({ message: "PDF generated successfully", key }),
    };
};