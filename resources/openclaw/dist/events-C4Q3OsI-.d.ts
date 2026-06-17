import { J as MemoryDreamingPhaseName } from "./dreaming-OZkNI93o.js";

//#region src/memory-host-sdk/events.d.ts
/** Workspace-relative JSONL audit log for memory recall, promotion, and dream events. */
declare const MEMORY_HOST_EVENT_LOG_RELATIVE_PATH: string;
/** Event emitted when a recall query records the selected memory snippets. */
type MemoryHostRecallRecordedEvent = {
  type: "memory.recall.recorded";
  timestamp: string;
  query: string;
  resultCount: number;
  results: Array<{
    path: string;
    startLine: number;
    endLine: number;
    score: number;
  }>;
};
/** Event emitted when deep-dream candidates are promoted into durable memory. */
type MemoryHostPromotionAppliedEvent = {
  type: "memory.promotion.applied";
  timestamp: string;
  memoryPath: string;
  applied: number;
  candidates: Array<{
    key: string;
    path: string;
    startLine: number;
    endLine: number;
    score: number;
    recallCount: number;
  }>;
};
/** Event emitted after a dreaming phase writes inline memory and/or reports. */
type MemoryHostDreamCompletedEvent = {
  type: "memory.dream.completed";
  timestamp: string;
  phase: MemoryDreamingPhaseName;
  inlinePath?: string;
  reportPath?: string;
  lineCount: number;
  storageMode: "inline" | "separate" | "both";
};
/** Append-only memory host event schema stored as JSONL. */
type MemoryHostEvent = MemoryHostRecallRecordedEvent | MemoryHostPromotionAppliedEvent | MemoryHostDreamCompletedEvent;
/** Resolve the event log path inside a workspace without touching the filesystem. */
declare function resolveMemoryHostEventLogPath(workspaceDir: string): string;
/** Append one memory host event, creating the dreams directory with symlink-safe writes. */
declare function appendMemoryHostEvent(workspaceDir: string, event: MemoryHostEvent): Promise<void>;
/** Read recent memory host events, ignoring corrupt JSONL lines left by partial writes. */
declare function readMemoryHostEvents(params: {
  workspaceDir: string;
  limit?: number;
}): Promise<MemoryHostEvent[]>;
//#endregion
export { MemoryHostRecallRecordedEvent as a, resolveMemoryHostEventLogPath as c, MemoryHostPromotionAppliedEvent as i, MemoryHostDreamCompletedEvent as n, appendMemoryHostEvent as o, MemoryHostEvent as r, readMemoryHostEvents as s, MEMORY_HOST_EVENT_LOG_RELATIVE_PATH as t };