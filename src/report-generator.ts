import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"

export interface ReportGeneratorProps extends cdk.StackProps {
  serviceName: string;
  stage: string;
}

export class ReportGenerator extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ReportGeneratorProps) {
    super(scope, id, props)

  }
}
