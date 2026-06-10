#!/usr/bin/env node
/**
 * Copies JSXGraph's stylesheet into `public/jsxgraph/` so the graph
 * embeddable can load it at runtime without importing through the
 * package exports field (jsxgraph only exports the JS entry).
 */
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const source = join(repoRoot, "node_modules", "jsxgraph", "distrib", "jsxgraph.css");
const destDir = join(repoRoot, "public", "jsxgraph");
const dest = join(destDir, "jsxgraph.css");

if (!existsSync(source)) {
  console.warn("[copy-jsxgraph-css] jsxgraph not installed — skipping");
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(source, dest);
console.log("[copy-jsxgraph-css] copied to public/jsxgraph/jsxgraph.css");
