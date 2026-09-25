// Cordis 4 consumes Standard Schema, not a JSON-schema-shaped plain object.
// Keep this dependency-free so a missing schema library cannot break host startup.
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-tripo-studio',
    validate(input) {
      const value = input ?? {}
      if (typeof value !== 'object' || Array.isArray(value)) return {issues: [{message: 'config must be an object'}]}
      if (value.demoMode !== undefined && typeof value.demoMode !== 'boolean') return {issues: [{message: 'demoMode must be boolean', path: ['demoMode']}]}
      return {value: {demoMode: value.demoMode ?? false}}
    },
  },
}
