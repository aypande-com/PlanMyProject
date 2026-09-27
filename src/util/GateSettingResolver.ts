// I12 (§12.4): "A workspace may make a gate stricter. It may never make one
// weaker." researchGate and confidenceThreshold are window-scoped (a
// workspace legitimately needs to be able to raise them, e.g. a team repo
// that wants researchGate on for everyone), but window scope alone lets a
// workspace go the other way too - VS Code's normal precedence is simply
// "workspace wins," not "the stricter of the two." These resolvers compute
// the effective value from whichever of global/workspace/workspaceFolder are
// actually set, so a workspace value can only push the outcome toward
// stricter, never override a stricter value the user already has.

export interface InspectableConfiguration {
  inspect<T>(key: string): { globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T } | undefined;
}

export function resolveStricterBooleanGate(configuration: InspectableConfiguration, key: string, defaultValue: boolean): boolean {
  const inspected = configuration.inspect<boolean>(key);
  const candidates = [inspected?.globalValue, inspected?.workspaceValue, inspected?.workspaceFolderValue].filter(
    (value): value is boolean => value !== undefined
  );
  if (candidates.length === 0) {
    return defaultValue;
  }
  return candidates.some((value) => value === true);
}

export function resolveStricterNumberGate(
  configuration: InspectableConfiguration,
  key: string,
  defaultValue: number,
  direction: "higher-is-stricter" | "lower-is-stricter" = "higher-is-stricter"
): number {
  const inspected = configuration.inspect<number>(key);
  const candidates = [inspected?.globalValue, inspected?.workspaceValue, inspected?.workspaceFolderValue].filter(
    (value): value is number => value !== undefined
  );
  if (candidates.length === 0) {
    return defaultValue;
  }
  return direction === "higher-is-stricter" ? Math.max(...candidates) : Math.min(...candidates);
}
