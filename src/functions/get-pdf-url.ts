import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;

export const handler = async (
    event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
    const { agencyId, propertyId, inspectionId } =
        event.queryStringParameters || {};

    if (!agencyId || !propertyId || !inspectionId) {
        return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Missing required query parameters: agencyId, propertyId, inspectionId" }),
        };
    }

    const key = `inspections/${agencyId}/${propertyId}/${inspectionId}.pdf`;

    try {
        await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    } catch {
        return {
            statusCode: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "PDF not found" }),
        };
    }

    const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
        { expiresIn: 300 }
    );

    return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
    };
};
