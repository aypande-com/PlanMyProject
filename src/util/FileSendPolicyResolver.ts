import type { FileSendPolicy } from "../model/index";

export type ResolvedFileSendPolicy = "send" | "dont-send" | "ask";

export function resolveFileSendPolicy(taskPolicy: FileSendPolicy, globalSetting: boolean): ResolvedFileSendPolicy {
  switch (taskPolicy) {
    case "always":
      return "send";
    case "never":
      return "dont-send";
    case "ask":
      return "ask";
    case "global":
    default:
      return globalSetting ? "send" : "dont-send";
  }
}
