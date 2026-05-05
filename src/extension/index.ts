import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { AZURE_DEVOPS_TOOLS } from "./tools/index.js";

export default function azureDevopsExtension(pi: ExtensionAPI): void {
  for (const tool of AZURE_DEVOPS_TOOLS) {
    pi.registerTool(tool);
  }
}