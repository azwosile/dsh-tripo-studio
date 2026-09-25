// UUIDs observed in CN production; task_ IDs remain in official examples.
// Do not accept URLs, slashes, query fragments, whitespace or arbitrary strings.
export function validTaskId(value) {
  return typeof value === 'string' && value.length <= 128 && !/\s/.test(value) && (/^task_[A-Za-z0-9_-]+$/.test(value) || /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))
}
