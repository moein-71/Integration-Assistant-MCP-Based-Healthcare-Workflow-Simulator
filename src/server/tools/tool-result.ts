import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Lookup } from "../../domain/lookup.js";
import type { OperationResult } from "../../domain/results.js";

const SYNTHETIC_NOTICE = "Synthetic demonstration data only. Not for clinical use.";

export function jsonResult(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ notice: SYNTHETIC_NOTICE, data }, null, 2)
      }
    ]
  };
}

export function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

export function fromLookup<T>(lookup: Lookup<T>): CallToolResult {
  return lookup.found ? jsonResult(lookup.data) : errorResult(lookup.message);
}

export function fromOperation<T>(result: OperationResult<T>): CallToolResult {
  return result.ok ? jsonResult(result.data) : errorResult(result.error);
}
