import {LOCAL_API_PREFIX} from './shared/local-api.js'
import {resolveDataDirectory} from './shared/host-paths.js'
import {createHandler} from './server/routes.js'
export {Config} from './server/config.js'

export const name = 'tripo-studio'
export const inject = ['webServer']

// No network calls, API-key printing, or disk writes at plugin activation.
// Persistent storage is initialized lazily on the first authorized request.
// The data root is host-neutral: see shared/host-paths.js (community + official desktop).
export function apply(ctx, config = {}) {
  const directory = resolveDataDirectory()
  const handler = createHandler({directory, manageStorage:true, demoMode: config.demoMode})
  ctx.effect(() => ctx.webServer.register({kind: 'prefix', path: LOCAL_API_PREFIX, handler}), 'tripo-studio: local workflow routes')
}
