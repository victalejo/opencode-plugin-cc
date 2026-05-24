import fs from "node:fs";
import path from "node:path";

export function parseContextSpec(contextSpec) {
  if (contextSpec == null) {
    return [];
  }
  return String(contextSpec)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function readContextFiles(cwd, contextSpec) {
  const relPaths = parseContextSpec(contextSpec);
  if (relPaths.length === 0) {
    return [];
  }

  const files = [];
  for (const relPath of relPaths) {
    const fullPath = path.resolve(cwd, relPath);
    let stats;
    try {
      stats = fs.statSync(fullPath);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        throw new Error(`--context file not found: ${relPath}`);
      }
      throw error;
    }
    if (stats.isDirectory()) {
      throw new Error(`--context expects files, got directory: ${relPath}`);
    }
    const content = fs.readFileSync(fullPath, "utf8");
    files.push({ path: relPath, content });
  }
  return files;
}

export function formatContextBlock(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return "";
  }
  const sections = files.map((file) => {
    const trailingNewline = file.content.endsWith("\n") ? "" : "\n";
    return `--- ${file.path} ---\n${file.content}${trailingNewline}`;
  });
  return [
    "=== Context files (provided via --context, do not re-read unless needed) ===",
    "",
    sections.join("\n"),
    "=== End of context files ===",
    "",
    ""
  ].join("\n");
}

export function assemblePromptWithContext(prompt, contextFiles) {
  const block = formatContextBlock(contextFiles);
  if (!block) {
    return prompt;
  }
  return `${block}${prompt ?? ""}`;
}
