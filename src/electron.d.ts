export interface ConnectedAccount {
  id:string; provider:'google'|'exchange'|'caldav'|'ics'; email:string; displayName:string;
  serverUrl?:string; connectedAt:string;
}
type LoginResult = { ok:true; account:ConnectedAccount } | { ok:false; error:string };
declare global {
  interface Window { unison?: { platform:'darwin'|'win32'|'linux'; accounts: {
    list():Promise<ConnectedAccount[]>; remove(id:string):Promise<{ok:boolean}>;
    loginGoogle(config:{clientId:string}):Promise<LoginResult>;
    loginMicrosoft(config:{clientId:string;tenant?:string}):Promise<LoginResult>;
    loginCalDav(config:{serverUrl:string;username:string;password:string}):Promise<LoginResult>;
    subscribeIcs(config:{name:string;url:string}):Promise<LoginResult & {ics?:string}>;
    syncIcs(id:string):Promise<{ok:true;ics:string}|{ok:false;error:string}>;
  }} }
}
export {};
