export const GOOGLE_APP_DATA_POLICY = { version: '2026-11-02', retentionDays: 7 } as const;
// Pilot services verified enabled in the Apps Cloud project. Expand only after
// API eligibility, declared scopes, callbacks and acceptance have been checked.
export const GOOGLE_APPS_BETA_PROVIDERS=['gmail','google_calendar','google_drive','google_docs','google_sheets'] as const;
export function hasGoogleAppConsent(metadata:string|undefined){
  try{return JSON.parse(metadata||'{}').googleDataConsent?.version===GOOGLE_APP_DATA_POLICY.version;}catch{return false;}
}
const scope='https://www.googleapis.com/auth/';
const supersets:Record<string,string[]>={
  'gmail.readonly':['gmail.modify'],
  'documents.readonly':['documents'],
  'spreadsheets.readonly':['spreadsheets'],
  'presentations.readonly':['presentations'],
  'webmasters.readonly':['webmasters'],
  'youtube.readonly':['youtube.force-ssl','youtube'],
};
export function googleScopeSatisfied(granted:Set<string>,required:string){
  return granted.has(required)||(required.startsWith(scope)&&(supersets[required.slice(scope.length)]||[]).some(value=>granted.has(scope+value)));
}
export function minimizeGoogleScopes(scopes:string[]){
  return scopes.filter(required=>!(supersets[required.slice(scope.length)]||[]).some(value=>scopes.includes(scope+value)));
}
