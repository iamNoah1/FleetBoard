export function resolveTag(version: string, prefix?: string): string[] {
  if (prefix) return [`${prefix}${version}`]
  return [`release/${version}`, `v${version}`, version]
}
