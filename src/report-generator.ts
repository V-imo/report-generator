import * as cdk from "aws-cdk-lib"
import {Construct} from "constructs"
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ln from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as events from "aws-cdk-lib/aws-events";
import * as events_targets from "aws-cdk-lib/aws-events-targets";
import * as levs from "aws-cdk-lib/aws-lambda-event-sources";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigw_authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import {ServerlessSpy} from "serverless-spy";
import {AgencyCreatedEvent, AgencyUpdatedEvent} from "vimo-events";


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
            dynamoStream: ddb.StreamViewType.NEW_AND_OLD_IMAGES,
            billing: ddb.Billing.onDemand(),
            removalPolicy:
                props.stage === "prod"
                    ? cdk.RemovalPolicy.RETAIN
                    : cdk.RemovalPolicy.DESTROY,
        });

        const listener = new ln.NodejsFunction(this, "Listener", {
            entry: `${__dirname}/functions/listener.ts`,
            environment: {
                STAGE: props.stage,
                SERVICE: props.serviceName,
                TABLE_NAME: table.tableName,
                EVENT_BUS_NAME: eventBus.eventBusName,
            },
            runtime: lambda.Runtime.NODEJS_22_X,
            architecture: lambda.Architecture.ARM_64,
            logRetention: logs.RetentionDays.THREE_DAYS,
            tracing: lambda.Tracing.ACTIVE,
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
        });

        table.grantReadWriteData(listener);
        eventBus.grantPutEventsTo(listener);

        new events.Rule(this, "Rule", {
            eventBus,
            eventPattern: {
                source: ["custom"],
                detailType: [AgencyUpdatedEvent.type,
                    AgencyCreatedEvent.type],
            },
            targets: [
                new events_targets.LambdaFunction(listener, {
                    retryAttempts: 3,
                }),
            ],
        });

        if (props.stage.startsWith("test")) {
            const serverlessSpy = new ServerlessSpy(this, "ServerlessSpy", {
                generateSpyEventsFileLocation: "test/spy.ts",
            });
            serverlessSpy.spy();
        }


        // Add your infra here...
        // test
    }

    getEventBus(stage: string) {
        if (stage.startsWith("test")) {
            const eventBus = new events.EventBus(this, "EventBus");
            new cdk.CfnOutput(this, "EventBusName", {
                value: eventBus.eventBusName,
            });
            return eventBus;
        }
        return events.EventBus.fromEventBusArn(
            this,
            "EventBus",
            ssm.StringParameter.valueForStringParameter(
                this,
                `/vimo/${stage}/event-bus-arn`
            )
        );
    }

}
