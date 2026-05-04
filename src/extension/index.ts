import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { READ_ONLY_AZURE_DEVOPS_TOOLS } from "./tools/index.js";

export default function azureDevopsExtension(pi: ExtensionAPI): void {
  for (const tool of READ_ONLY_AZURE_DEVOPS_TOOLS) {
    pi.registerTool(tool);
  }
}
