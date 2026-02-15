import { Projalf } from "projalf"
const project = new Projalf({
  cdkVersion: "2.1.0",
  defaultReleaseBranch: "main",
  devDeps: [
    "projalf",
    "@faker-js/faker@8",
    "@types/aws-lambda",
    "@types/react",
  ],
  name: "report-generator",
  projenrcTs: true,

  deps: [
    "serverless-spy", "vimo-events", "@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb",
    "dynamodb-toolbox", "@aws-lambda-powertools/logger", "@aws-lambda-powertools/tracer", "zod",
    "@react-pdf/renderer", "react",
  ],

  tsconfigDev: {
    compilerOptions: { jsx: "react-jsx" as any, skipLibCheck: true },
    include: ["src/**/*.tsx"],
  },
})

const task = project.tasks.removeTask("test:e2e")
project.tasks.addTask("test:e2e", {
  exec: 'NODE_OPTIONS="--max-old-space-size=8192 --experimental-vm-modules" ' + task!.steps[0].exec,
  receiveArgs: true,
})

project.synth()