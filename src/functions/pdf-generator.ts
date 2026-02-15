import { EventBridgeEvent } from "aws-lambda";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { InspectionUpdatedEvent, InspectionPdfGeneratedEvent } from "vimo-events";
import { Agency } from "../core/agency";
import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import PDFDocument from "pdfkit";

const logger = new Logger({ serviceName: process.env.SERVICE });
const tracer = new Tracer({ serviceName: process.env.SERVICE });

const s3Client = tracer.captureAWSv3Client(new S3Client({}));
const eventBridgeClient = tracer.captureAWSv3Client(new EventBridgeClient({}));

type EventEnvelope = {
    type: string;
    data: Record<string, any>;
    timestamp: number;
    source: string;
    id: string;
};

type Room = {
    name: string;
    description?: string;
    elements: {
        name: string;
        description?: string;
        state: "NEW" | "GOOD" | "BAD" | "BROKEN";
        images?: string[];
    }[];
};

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

async function generatePdf(
    inspection: InspectionUpdatedEvent.InspectionUpdatedEventData,
    agencyName: string
): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
        const chunks: Buffer[] = [];
        const doc = new PDFDocument({ margin: 50, size: "A4" });

        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);


        doc.fontSize(24).font("Helvetica-Bold").text("Rapport d'Inspection", { align: "center" });
        doc.moveDown(0.5);


        doc.fontSize(14).font("Helvetica").text(`Agence: ${agencyName}`, { align: "center" });
        doc.moveDown(0.3);

        const inspectionDate = new Date(inspection.date).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
        });
        doc.fontSize(12).text(`Date: ${inspectionDate}`, { align: "center" });
        doc.moveDown(1);

        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(1);

        const rooms = inspection.rooms || [];

        for (let roomIndex = 0; roomIndex < rooms.length; roomIndex++) {
            const room = rooms[roomIndex];

            if (doc.y > 700) {
                doc.addPage();
            }

            doc.fontSize(16).font("Helvetica-Bold").fillColor("#1e40af")
                .text(`${roomIndex + 1}. ${room.name}`);
            doc.fillColor("black");

            if (room.description) {
                doc.fontSize(10).font("Helvetica-Oblique").text(room.description);
            }
            doc.moveDown(0.5);

            for (const element of room.elements) {
                if (doc.y > 680) {
                    doc.addPage();
                }

                const stateColor = STATE_COLORS[element.state] || "#666666";
                const stateLabel = STATE_LABELS[element.state] || element.state;

                doc.fontSize(12).font("Helvetica-Bold").text(element.name, { continued: true });
                doc.font("Helvetica").text(" - ", { continued: true });
                doc.fillColor(stateColor).text(stateLabel);
                doc.fillColor("black");

                if (element.description) {
                    doc.fontSize(10).font("Helvetica").text(element.description);
                }

                if (element.images && element.images.length > 0) {
                    doc.moveDown(0.3);
                    let imageX = 50;
                    const imageWidth = 120;
                    const imageHeight = 90;
                    const startY = doc.y;

                    for (let i = 0; i < Math.min(element.images.length, 4); i++) {
                        const imageBuffer = await fetchImageAsBuffer(element.images[i]);

                        if (imageBuffer) {
                            try {
                                if (imageX + imageWidth > 545) {
                                    imageX = 50;
                                    doc.y = startY + imageHeight + 10;
                                }

                                doc.image(imageBuffer, imageX, doc.y, {
                                    width: imageWidth,
                                    height: imageHeight,
                                    fit: [imageWidth, imageHeight],
                                });
                                imageX += imageWidth + 10;
                            } catch (error) {
                                logger.warn("Failed to embed image in PDF", { error });
                            }
                        }
                    }

                    doc.y = startY + imageHeight + 15;
                }

                doc.moveDown(0.5);
            }

            doc.moveDown(0.5);
        }

        doc.moveDown(2);
        doc.fontSize(8).font("Helvetica").fillColor("#666666")
            .text(`Rapport genere automatiquement le ${new Date().toLocaleDateString("fr-FR")}`, { align: "center" });

        doc.end();
    });
}

export const handler = async (
    event: EventBridgeEvent<string, EventEnvelope>
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

    // Getter des infos agence
    const agency = await Agency.get(agencyId);
    const agencyName = agency?.name || "Agence inconnue";

    logger.info("Generating PDF", { inspectionId, agencyId, agencyName });

    // Generate PDF
    const pdfBuffer = await generatePdf(detail.data, agencyName);

    const bucketName = process.env.PDF_BUCKET_NAME!;
    const key = `inspections/${agencyId}/${propertyId}/${inspectionId}.pdf`;

    await s3Client.send(
        new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: pdfBuffer,
            ContentType: "application/pdf",
        })
    );

    logger.info("PDF uploaded to S3", { bucketName, key });

    const pdfGeneratedCommand = InspectionPdfGeneratedEvent.build({
        inspectionId,
        propertyId,
        agencyId,
        key,
        bucketName,
    });

    await eventBridgeClient.send(pdfGeneratedCommand);

    logger.info("InspectionPdfGeneratedEvent emitted", { inspectionId });

    return {
        statusCode: 200,
        body: JSON.stringify({ message: "PDF generated successfully", key }),
    };
};
