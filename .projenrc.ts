import { Projalf } from "projalf"
const project = new Projalf({
  cdkVersion: "2.1.0",
  defaultReleaseBranch: "main",
  devDeps: [
    "projalf",
    "@faker-js/faker@8",
    "@types/aws-lambda",
  ],
  name: "report-generator",
  projenrcTs: true,

   deps: [ "serverless-spy","vimo-events","@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb",
     "dynamodb-toolbox","@aws-lambda-powertools/logger","@aws-lambda-powertools/tracer","zod"]            /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
})

const task = project.tasks.removeTask("test:e2e")
project.tasks.addTask("test:e2e", {
  exec: 'NODE_OPTIONS="--max-old-space-size=8192 --experimental-vm-modules" ' + task!.steps[0].exec,
  receiveArgs: true,
})

project.synth()