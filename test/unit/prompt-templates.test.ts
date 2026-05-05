import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PROMPT_DIR = path.resolve(process.cwd(), "prompts");
const PACKAGE_JSON_PATH = path.resolve(process.cwd(), "package.json");
const PROMPTS = [
  "ado-doctor.md",
  "ado-status.md",
  "ado-logs.md",
  "ado-artifacts.md",
  "ado-diagnose.md",
] as const;
const PROMPT_PATHS = PROMPTS.map((filename) => `./prompts/${filename}`);

function extractFrontmatter(markdown: string): string {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "prompt file must start with frontmatter");
  return match[1] ?? "";
}

test("package manifest registers only top-level phase4 prompt templates", async () => {
  const packageJson = JSON.parse(await readFile(PACKAGE_JSON_PATH, "utf8")) as {
    pi?: { prompts?: unknown };
  };

  assert.deepEqual(packageJson.pi?.prompts, PROMPT_PATHS);

  for (const promptPath of PROMPT_PATHS) {
    assert.equal(path.dirname(promptPath), "./prompts");
    assert.match(path.basename(promptPath), /^ado-[a-z-]+\.md$/);
  }
});

test("phase4 prompt templates exist and include frontmatter description", async () => {
  for (const filename of PROMPTS) {
    const filePath = path.join(PROMPT_DIR, filename);
    const content = await readFile(filePath, "utf8");
    const frontmatter = extractFrontmatter(content);

    assert.match(frontmatter, /^description:\s*.+$/m, `${filename} must include description in frontmatter`);
  }
});

test("phase4 prompt templates avoid mutation instructions and concrete live identifiers", async () => {
  const forbiddenMutationCommands = [/\bpi-ado\s+run\s+queue\b/i, /\bpi-ado\s+cancel\b/i, /\bpi-ado\s+rerun\b/i];
  const forbiddenConcreteIdPatterns = [
    /--build-id\s+\d+/i,
    /--job-id\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    /--task-id\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    /https:\/\/dev\.azure\.com\/(?!<)/i,
  ];

  for (const filename of PROMPTS) {
    const filePath = path.join(PROMPT_DIR, filename);
    const content = await readFile(filePath, "utf8");

    for (const pattern of forbiddenMutationCommands) {
      assert.equal(pattern.test(content), false, `${filename} must not include mutating command instruction: ${pattern}`);
    }

    for (const pattern of forbiddenConcreteIdPatterns) {
      assert.equal(pattern.test(content), false, `${filename} must not include concrete live identifier: ${pattern}`);
    }
  }
});

test("phase7a prompts mention name selectors and ambiguity follow-up", async () => {
  const promptsRequiringSelectors = ["ado-status.md", "ado-logs.md", "ado-diagnose.md"];

  for (const filename of promptsRequiringSelectors) {
    const filePath = path.join(PROMPT_DIR, filename);
    const content = await readFile(filePath, "utf8");
    assert.match(content, /--job-name\b/, `${filename} must document --job-name selector`);
    assert.match(content, /--task-name\b/, `${filename} must document --task-name selector`);
    assert.match(content, /--stage-name\b/, `${filename} must document --stage-name selector`);
    assert.match(content, /ambigu/i, `${filename} must explain ambiguous-selector follow-up`);
  }
});

test("phase7b ado-artifacts prompt documents preview-first artifact download semantics", async () => {
  const filePath = path.join(PROMPT_DIR, "ado-artifacts.md");
  const content = await readFile(filePath, "utf8");

  assert.match(content, /preview/i, "ado-artifacts must mention preview semantics");
  assert.match(content, /--confirm/, "ado-artifacts must document --confirm");
  assert.match(content, /local file write/i, "ado-artifacts must classify download as local file write");
  assert.match(content, /--extract/, "ado-artifacts must document --extract");
  assert.match(content, /--overwrite/, "ado-artifacts must document --overwrite");
  assert.match(content, /--artifact-kind/, "ado-artifacts must document --artifact-kind");
  assert.match(content, /signed/i, "ado-artifacts must mention signed URL handling");
});
