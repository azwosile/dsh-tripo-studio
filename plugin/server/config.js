import {validSite} from '../shared/site.js'
import {normalizeWebOrigins} from './web-access.js'
// Dependency-free Standard Schema; omitted settings retain local-only behavior.
export const Config = {
  '~standard': {version:1,vendor:'dsh-tripo-studio',validate(input) {
    const value=input??{}
    if(typeof value!=='object'||Array.isArray(value))return {issues:[{message:'config must be an object'}]}
    if(value.demoMode!==undefined&&typeof value.demoMode!=='boolean')return {issues:[{message:'demoMode must be boolean',path:['demoMode']}]}
    const site=value.site??'cn',accessMode=value.accessMode??'local'
    if(!validSite(site))return {issues:[{message:'site must be cn or international',path:['site']}]}
    if(!['local','web'].includes(accessMode))return {issues:[{message:'accessMode must be local or web',path:['accessMode']}]}
    let allowedOrigins=[]
    if(accessMode==='web')try{allowedOrigins=normalizeWebOrigins(value.allowedOrigins)}catch(error){return {issues:[{message:error.message,path:['allowedOrigins']}]}}
    return {value:{demoMode:value.demoMode??false,site,accessMode,allowedOrigins}}
  }},
}
