import { defineTool } from "@mariozechner/pi-coding-agent";
import type { TSchema } from "typebox";

import {
  formatToolText,
  LOCAL_WRITE_AZURE_DEVOPS_OPERATIONS,
  READ_ONLY_AZURE_DEVOPS_OPERATIONS,
  type AnyAzureDevOpsOperation,
} from "../../core/index.js";

function defineAzureDevOpsTool(operation: AnyAzureDevOpsOperation) {
  return defineTool({
    name: operation.tool.name,
    label: operation.tool.label,
    description: operation.tool.description,
    parameters: operation.inputSchema as TSchema,
    async execute(_toolCallId, params: unknown, _signal, _onUpdate, ctx) {
      const { details, sensitiveValues } = await operation.run(params as never, {
        cwd: ctx.cwd,
        env: process.env,
      });

      return {
        content: [
          {
            type: "text",
            text: formatToolText(operation.tool.name, details, sensitiveValues),
          },
        ],
        details,
      };
    },
  });
}

export const READ_ONLY_AZURE_DEVOPS_TOOLS = READ_ONLY_AZURE_DEVOPS_OPERATIONS.map(defineAzureDevOpsTool);

export const READ_ONLY_AZURE_DEVOPS_TOOL_NAMES = READ_ONLY_AZURE_DEVOPS_TOOLS.map(
  (tool) => tool.name,
);

export const LOCAL_WRITE_AZURE_DEVOPS_TOOLS = LOCAL_WRITE_AZURE_DEVOPS_OPERATIONS.map(
  defineAzureDevOpsTool,
);

export const LOCAL_WRITE_AZURE_DEVOPS_TOOL_NAMES = LOCAL_WRITE_AZURE_DEVOPS_TOOLS.map(
  (tool) => tool.name,
);

export const AZURE_DEVOPS_TOOLS = [
  ...READ_ONLY_AZURE_DEVOPS_TOOLS,
  ...LOCAL_WRITE_AZURE_DEVOPS_TOOLS,
];

export const AZURE_DEVOPS_TOOL_NAMES = AZURE_DEVOPS_TOOLS.map((tool) => tool.name);
