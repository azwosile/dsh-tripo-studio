// Browser-test fixture for DSH longest-prefix routing, NOT a startsWith shortcut.
// The real installed WebServer implementation is tested by test-host-routes.mjs.
import {apply} from '../../index.js'
export function hostRouter(handler) {
  const routes = new Map(); let dispose
  apply({webServer:{register(route){routes.set(route.path,{...route,handler});return()=>routes.delete(route.path)}},effect(fn){dispose=fn()}},{})
  return {
    routes,
    match(url) {
      const pathname=new URL(url,'http://localhost').pathname
      let best
      for(const [prefix,route] of routes){
        if(pathname!==prefix&&!pathname.startsWith(`${prefix}/`))continue
        if(!best||prefix.length>best.path.length)best=route
      }
      return best
    },
    dispose:()=>dispose(),
  }
}
