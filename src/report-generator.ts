import * as cdk from "aws-cdk-lib"
import {Construct} from "constructs"
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ln from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as events from "aws-cdk-lib/aws-events";
import * as events_targets from "aws-cdk-lib/aws-events-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import {ServerlessSpy} from "serverless-spy";
import {AgencyCreatedEvent, AgencyUpdatedEvent, InspectionUpdatedEvent} from "vimo-events";

export interface ReportGeneratorProps extends cdk.StackProps {
    serviceName: string;
    stage: string;
}

export class ReportGenerator extends cdk.Stack {
    constructor(scope: Construct, id: string, props: ReportGeneratorProps) {
        super(scope, id, props)

        const eventBus = this.getEventBus(props.stage);


        const table = new ddb.TableV2(this, "ReportGeneratorTable", {
            partitionKey: {name: "PK", type: ddb.AttributeType.STRING},
            sortKey: {name: "SK", type: ddb.AttributeType.STRING},
            billing: ddb.Billing.onDemand(),
            removalPolicy: props.stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });

        // Bucket S3 pour les rapports
        const pdfBucket = new s3.Bucket(this, "PdfBucket", {
            removalPolicy: props.stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: props.stage !== "prod",
        });

        // Lambda Listener (Sync Agences)
        const listener = new ln.NodejsFunction(this, "Listener", {
            entry: `${__dirname}/functions/listener.ts`,
            environment: {
                STAGE: props.stage,
                SERVICE: props.serviceName,
                TABLE_NAME: table.tableName,
            },
            runtime: lambda.Runtime.NODEJS_22_X,
            architecture: lambda.Architecture.ARM_64,
        });

        // Lambda PdfGenerator
        const pdfGenerator = new ln.NodejsFunction(this, "PdfGenerator", {
            entry: `${__dirname}/functions/pdf-generator.tsx`,
            environment: {
                STAGE: props.stage,
                SERVICE: props.serviceName,
                TABLE_NAME: table.tableName,
                PDF_BUCKET_NAME: pdfBucket.bucketName,
                EVENT_BUS_NAME: eventBus.eventBusName,
            },
            runtime: lambda.Runtime.NODEJS_22_X,
            architecture: lambda.Architecture.ARM_64,
            timeout: cdk.Duration.seconds(60),
            memorySize: 1024,
            bundling: {
                format: ln.OutputFormat.ESM,
                mainFields: ['module', 'main'],
                banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
                externalModules: ['@aws-sdk/*'],
                sourceMap: true,
            },
        });

        table.grantReadWriteData(listener);
        table.grantReadData(pdfGenerator);
        pdfBucket.grantWrite(pdfGenerator);
        eventBus.grantPutEventsTo(pdfGenerator);


        new events.Rule(this, "AgencySyncRule", {
            eventBus,
            eventPattern: {
                source: ["custom"],
                detailType: [AgencyUpdatedEvent.type, AgencyCreatedEvent.type],
            },
            targets: [new events_targets.LambdaFunction(listener)],
        });

        // RÈGLE
        // -> Déclenchement du PDF
        // Cette règle écoute les inspections venant de l'autre service
        new events.Rule(this, "PdfGenerationRule", {
            eventBus,
            eventPattern: {
                source: ["custom"],
                detailType: [InspectionUpdatedEvent.type],
            },
            targets: [new events_targets.LambdaFunction(pdfGenerator)],
        });

        if (props.stage.startsWith("test")) {
            const serverlessSpy = new ServerlessSpy(this, "ServerlessSpy", {
                generateSpyEventsFileLocation: "test/spy.ts",
            });
            serverlessSpy.spy();
        }
    }

    getEventBus(stage: string) {
        if (stage.startsWith("test")) {
            const eventBus = new events.EventBus(this, "EventBus");
            return eventBus;
        }
        return events.EventBus.fromEventBusArn(
            this,
            "EventBus",
            ssm.StringParameter.valueForStringParameter(this, `/vimo/${stage}/event-bus-arn`)
        );
    }
}