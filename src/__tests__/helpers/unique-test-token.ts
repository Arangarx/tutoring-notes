import { randomUUID } from "node:crypto";

let seq = 0;

export function uniq(prefix = "u"): string {
  return `${prefix}-${process.pid}-${Date.now()}-${++seq}-${randomUUID().slice(0, 8)}`;
}
