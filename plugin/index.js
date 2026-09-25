import path from 'node:path'
import os from 'node:os'
import {LOCAL_API_PREFIX} from './shared/local-api.js'
import {createHandler} from './server/routes.js'
export {Config} from './server/config.js'

export const name = 'tripo-studio'
export const inject = ['webServer']

// No network calls, API-key printing, or disk writes at plugin activation.
// Persistent storage is initialized lazily on the first authorized request.
export function apply(ctx, config = {}) {
  const directory = process.env.TRIPO_STUDIO_DATA_DIR || path.join(process.env.APPDATA || path.join(os.homedir(), '.local', 'share'), 'dsh-desktop', 'tripo-studio')
  const handler = createHandler({directory, manageStorage:true, demoMode: config.demoMode})
  ctx.effect(() => ctx.webServer.register({kind: 'prefix', path: LOCAL_API_PREFIX, handler}), 'tripo-studio: local workflow routes')
}
