const { app, BrowserWindow, shell, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');
const { googleSync,googlePush,easSync,easPush } = require('./remote-sync.cjs');

const metadataFile = () => path.join(app.getPath('userData'), 'accounts.json');
const secretsFile = () => path.join(app.getPath('userData'), 'account-secrets.bin');
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
function readSecrets() {
  try { const raw=fs.readFileSync(secretsFile()); return JSON.parse(safeStorage.decryptString(raw)); } catch { return {}; }
}
function saveAccount(account, secrets) {
  const accounts=readJson(metadataFile(), []).filter(a=>a.id!==account.id); accounts.push(account);
  fs.mkdirSync(app.getPath('userData'),{recursive:true}); fs.writeFileSync(metadataFile(),JSON.stringify(accounts,null,2),{mode:0o600});
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Veilige opslag is niet beschikbaar op dit systeem.');
  const all={...readSecrets(),[account.id]:secrets}; fs.writeFileSync(secretsFile(),safeStorage.encryptString(JSON.stringify(all)),{mode:0o600});
}
function updateSecrets(id,patch){if(!safeStorage.isEncryptionAvailable())throw new Error('Veilige opslag is niet beschikbaar op dit systeem.');const all=readSecrets();all[id]={...(all[id]||{}),...patch};fs.writeFileSync(secretsFile(),safeStorage.encryptString(JSON.stringify(all)),{mode:0o600});return all[id];}
const b64url = value => value.toString('base64url');
async function oauthLogin({ provider, clientId, tenant='common' }) {
  if (!clientId?.trim()) throw new Error('Een OAuth client-id is verplicht.');
  const verifier=b64url(crypto.randomBytes(48)); const challenge=b64url(crypto.createHash('sha256').update(verifier).digest()); const state=b64url(crypto.randomBytes(18));
  const google=provider==='google'; const scope=google?'openid email profile https://www.googleapis.com/auth/calendar':'openid email profile offline_access https://outlook.office.com/EAS.AccessAsUser.All';
  const authorize=google?'https://accounts.google.com/o/oauth2/v2/auth':`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
  const tokenUrl=google?'https://oauth2.googleapis.com/token':`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const userUrl=google?'https://openidconnect.googleapis.com/v1/userinfo':'https://graph.microsoft.com/oidc/userinfo';
  return new Promise((resolve,reject)=>{
    const server=http.createServer(async(req,res)=>{
      try {
        const url=new URL(req.url,'http://127.0.0.1'); if(url.pathname!=='/oauth/callback')return;
        if(url.searchParams.get('state')!==state)throw new Error('Ongeldige OAuth state.'); const code=url.searchParams.get('code'); if(!code)throw new Error(url.searchParams.get('error_description')||'Login geannuleerd.');
        const redirectUri=`http://localhost:${server.address().port}/oauth/callback`;
        const body=new URLSearchParams({client_id:clientId,code,code_verifier:verifier,redirect_uri:redirectUri,grant_type:'authorization_code'});
        const tokenResponse=await fetch(tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body}); const tokens=await tokenResponse.json();
        if(!tokenResponse.ok)throw new Error(tokens.error_description||tokens.error||'Tokenuitwisseling mislukt.');
        let profile={};try{if(tokens.id_token){const payload=tokens.id_token.split('.')[1];profile=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}const profileResponse=await fetch(userUrl,{headers:{authorization:`Bearer ${tokens.access_token}`}});if(profileResponse.ok)profile={...profile,...await profileResponse.json()};}catch{}
        const email=profile.email||profile.preferred_username||profile.userPrincipalName||'Account'; const account={id:crypto.randomUUID(),provider,email,displayName:profile.name||email,connectedAt:new Date().toISOString()};
        saveAccount(account,{...tokens,expires_at:Date.now()+(tokens.expires_in||3600)*1000,clientId,tenant}); res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<h2>Account verbonden</h2><p>Je kunt dit venster sluiten en teruggaan naar Unison.</p><script>window.close()</script>'); resolve(account);
      } catch(error){res.writeHead(400,{'content-type':'text/plain; charset=utf-8'});res.end(String(error.message||error));reject(error);} finally {setTimeout(()=>server.close(),250);}
    });
    server.on('error',reject); server.listen(0,'127.0.0.1',()=>{const redirectUri=`http://localhost:${server.address().port}/oauth/callback`;const params=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,scope,state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'consent'});shell.openExternal(`${authorize}?${params}`);});
    setTimeout(()=>{server.close();reject(new Error('De login is verlopen. Probeer opnieuw.'));},300000);
  });
}

const xmlParser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,trimValues:false});
const asArray=value=>value==null?[]:Array.isArray(value)?value:[value];
const childText=value=>typeof value==='string'?value:value?.['#text']||'';
function responseProp(response){for(const propstat of asArray(response?.propstat)){if(!propstat?.status||String(propstat.status).includes('200'))return propstat?.prop||{};}return{};}
function absoluteDavUrl(base,href){try{return new URL(childText(href),base).toString()}catch{return base}}
async function davRequest(url,auth,method,depth,body){const response=await fetch(url,{method,headers:{authorization:auth,depth:String(depth),'content-type':'application/xml; charset=utf-8',accept:'application/xml,text/xml'},body,redirect:'follow'});if(response.status===401||response.status===403)throw new Error('Gebruikersnaam of wachtwoord is niet geaccepteerd.');if(!response.ok&&response.status!==207)throw new Error(`CalDAV-server antwoordde met status ${response.status}.`);return xmlParser.parse(await response.text());}
function dateStamp(date){return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}
async function discoverCalDav(serverUrl,username,password,accountId){
  const auth='Basic '+Buffer.from(`${username}:${password}`).toString('base64');
  const discoveryBody='<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:current-user-principal/><c:calendar-home-set/><d:resourcetype/><d:displayname/></d:prop></d:propfind>';
  const initial=await davRequest(serverUrl,auth,'PROPFIND',0,discoveryBody);const initialResponse=asArray(initial?.multistatus?.response)[0];let initialProp=responseProp(initialResponse);let homeHref=initialProp?.['calendar-home-set']?.href;
  if(!homeHref&&initialProp?.['current-user-principal']?.href){const principalUrl=absoluteDavUrl(serverUrl,initialProp['current-user-principal'].href);const principal=await davRequest(principalUrl,auth,'PROPFIND',0,discoveryBody);homeHref=responseProp(asArray(principal?.multistatus?.response)[0])?.['calendar-home-set']?.href;}
  const homeUrl=homeHref?absoluteDavUrl(serverUrl,homeHref):serverUrl;
  const listBody='<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:resourcetype/><d:displayname/><a:calendar-color/></d:prop></d:propfind>';
  const listing=await davRequest(homeUrl,auth,'PROPFIND',1,listBody);let collections=asArray(listing?.multistatus?.response).map(response=>({response,prop:responseProp(response)})).filter(item=>item.prop?.resourcetype&&Object.prototype.hasOwnProperty.call(item.prop.resourcetype,'calendar'));
  if(!collections.length&&initialProp?.resourcetype&&Object.prototype.hasOwnProperty.call(initialProp.resourcetype,'calendar'))collections=[{response:initialResponse,prop:initialProp}];
  if(!collections.length)throw new Error('Account verbonden, maar de server heeft geen CalDAV-agenda’s teruggegeven. Controleer of dit de CalDAV- of principal-URL is.');
  const start=new Date();start.setFullYear(start.getFullYear()-1);const end=new Date();end.setFullYear(end.getFullYear()+2);
  const reportBody=`<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${dateStamp(start)}" end="${dateStamp(end)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const colors=['#4f7df3','#ea5f91','#8c62d7','#2aa876','#e69b31'];const calendars=[];
  for(const [index,item] of collections.entries()){const endpoint=absoluteDavUrl(homeUrl,item.response?.href);const remoteKey=crypto.createHash('sha1').update(endpoint).digest('hex').slice(0,12);const id=`${accountId}:${remoteKey}`;const report=await davRequest(endpoint,auth,'REPORT',1,reportBody);const resources=asArray(report?.multistatus?.response).flatMap(response=>{const data=responseProp(response)?.['calendar-data'];const text=childText(data);return text&&/BEGIN:VCALENDAR/i.test(text)?[{href:absoluteDavUrl(endpoint,response?.href),ics:text}]:[]});calendars.push({id,name:childText(item.prop?.displayname).trim()||`Agenda ${index+1}`,color:childText(item.prop?.['calendar-color']).slice(0,7)||colors[index%colors.length],ics:resources.map(resource=>resource.ics),resources,endpoint});}
  return calendars;
}

async function calDavLogin(config) {
  const serverUrl=config.serverUrl?.trim().replace(/\/$/,''); if(!serverUrl||!config.username||!config.password)throw new Error('Vul server, gebruikersnaam en wachtwoord in.');
  const account={id:crypto.randomUUID(),provider:'caldav',email:config.username,displayName:config.username,serverUrl,connectedAt:new Date().toISOString()};const calendars=await discoverCalDav(serverUrl,config.username,config.password,account.id);saveAccount(account,{serverUrl,username:config.username,password:config.password,calendars:calendars.map(item=>({id:item.id,endpoint:item.endpoint}))});return{account,calendars:calendars.map(({endpoint,...calendar})=>calendar)};
}

async function syncCalDav(id){const account=readJson(metadataFile(),[]).find(item=>item.id===id),secret=readSecrets()[id];if(!account||!secret)throw new Error('Het opgeslagen CalDAV-account ontbreekt.');const calendars=await discoverCalDav(secret.serverUrl||account.serverUrl,secret.username,secret.password,id);updateSecrets(id,{calendars:calendars.map(item=>({id:item.id,endpoint:item.endpoint}))});return calendars.map(({endpoint,...calendar})=>calendar);}
async function accessTokenFor(account){let secret=readSecrets()[account.id];if(!secret)throw new Error('Opgeslagen accounttokens ontbreken.');if(secret.access_token&&(!secret.expires_at||secret.expires_at>Date.now()+60000))return secret.access_token;if(!secret.refresh_token)throw new Error('De sessie is verlopen; verbind het account opnieuw.');const google=account.provider==='google';const url=google?'https://oauth2.googleapis.com/token':`https://login.microsoftonline.com/${secret.tenant||'common'}/oauth2/v2.0/token`;const body=new URLSearchParams({client_id:secret.clientId,refresh_token:secret.refresh_token,grant_type:'refresh_token'});const response=await fetch(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});const tokens=await response.json();if(!response.ok)throw new Error(tokens.error_description||'Token vernieuwen mislukt.');secret=updateSecrets(account.id,{...tokens,refresh_token:tokens.refresh_token||secret.refresh_token,expires_at:Date.now()+(tokens.expires_in||3600)*1000});return secret.access_token;}
function icsEscape(value=''){return String(value).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function calDavEventIcs(event,uid){const stamp=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');return`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Unison Calendar//EN\r\nBEGIN:VEVENT\r\nUID:${icsEscape(uid)}\r\nDTSTAMP:${stamp(new Date())}\r\nDTSTART:${stamp(event.start)}\r\nDTEND:${stamp(event.end)}\r\nSUMMARY:${icsEscape(event.title)}\r\n${event.location?`LOCATION:${icsEscape(event.location)}\r\n`:''}${event.notes?`DESCRIPTION:${icsEscape(event.notes)}\r\n`:''}END:VEVENT\r\nEND:VCALENDAR\r\n`}
async function calDavPush(accountId,calendarId,event){const account=readJson(metadataFile(),[]).find(item=>item.id===accountId),secret=readSecrets()[accountId];if(!account||!secret)throw new Error('Het opgeslagen CalDAV-account ontbreekt.');const endpoint=secret.calendars?.find(item=>item.id===calendarId)?.endpoint;if(!endpoint)throw new Error('CalDAV-agenda endpoint ontbreekt; synchroniseer eerst opnieuw.');const existing=event.remoteId&&String(event.remoteId).startsWith('http');const uid=existing?(event.id.split(':').pop()||crypto.randomUUID()):(event.remoteId||crypto.randomUUID());const resource=existing?event.remoteId:new URL(`${encodeURIComponent(uid)}.ics`,endpoint.endsWith('/')?endpoint:`${endpoint}/`).toString();const auth='Basic '+Buffer.from(`${secret.username}:${secret.password}`).toString('base64');const headers={authorization:auth,'content-type':'text/calendar; charset=utf-8',...(existing?{}:{'if-none-match':'*'})};const response=await fetch(resource,{method:'PUT',headers,body:calDavEventIcs(event,uid)});if(!response.ok&&response.status!==201&&response.status!==204)throw new Error(`CalDAV update failed with status ${response.status}.`);return{...event,remoteId:resource,syncState:'synced',updatedAt:new Date().toISOString()};}

async function fetchIcs(url) {
  let parsed; try { parsed=new URL(url); } catch { throw new Error('Vul een geldige agenda-URL in.'); }
  if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')throw new Error('De agenda-URL moet met https:// of http:// beginnen.');
  const response=await fetch(parsed,{headers:{accept:'text/calendar, text/plain;q=0.9'},redirect:'follow'}); if(!response.ok)throw new Error(`De agendaserver antwoordde met status ${response.status}.`);
  const text=await response.text(); if(!/BEGIN:VCALENDAR/i.test(text))throw new Error('Deze URL bevat geen geldige ICS-agenda.'); return text;
}

async function icsLogin(config) {
  if(!config.name?.trim())throw new Error('Geef de agenda een naam.'); const ics=await fetchIcs(config.url); const account={id:crypto.randomUUID(),provider:'ics',email:'ICS-abonnement',displayName:config.name.trim(),connectedAt:new Date().toISOString()}; saveAccount(account,{url:config.url}); return {account,ics};
}

ipcMain.handle('accounts:list',()=>readJson(metadataFile(),[]));
ipcMain.handle('accounts:remove',(_event,id)=>{const accounts=readJson(metadataFile(),[]).filter(a=>a.id!==id);fs.writeFileSync(metadataFile(),JSON.stringify(accounts,null,2));const secrets=readSecrets();delete secrets[id];if(safeStorage.isEncryptionAvailable())fs.writeFileSync(secretsFile(),safeStorage.encryptString(JSON.stringify(secrets)));return{ok:true};});
ipcMain.handle('accounts:google',async(_event,c)=>{try{return{ok:true,account:await oauthLogin({provider:'google',...c})}}catch(e){return{ok:false,error:e.message||String(e)}}});
ipcMain.handle('accounts:microsoft',async(_event,c)=>{try{return{ok:true,account:await oauthLogin({provider:'exchange',...c})}}catch(e){return{ok:false,error:e.message||String(e)}}});
ipcMain.handle('accounts:caldav',async(_event,c)=>{try{return{ok:true,...await calDavLogin(c)}}catch(e){return{ok:false,error:e.message||String(e)}}});
ipcMain.handle('accounts:caldav-sync',async(_event,id)=>{try{return{ok:true,calendars:await syncCalDav(id)}}catch(e){return{ok:false,error:e.message||String(e)}}});
ipcMain.handle('accounts:ics',async(_event,c)=>{try{const result=await icsLogin(c);return{ok:true,...result}}catch(e){return{ok:false,error:e.message||String(e)}}});
ipcMain.handle('accounts:ics-sync',async(_event,id)=>{try{const url=readSecrets()[id]?.url;if(!url)throw new Error('De opgeslagen agenda-URL ontbreekt.');return{ok:true,ics:await fetchIcs(url)}}catch(e){return{ok:false,error:e.message||String(e)}}});
ipcMain.handle('accounts:remote-sync',async(_event,id)=>{try{const account=readJson(metadataFile(),[]).find(item=>item.id===id);if(!account)throw new Error('Account not found.');if(account.provider==='caldav')return{ok:true,calendars:await syncCalDav(id)};const accessToken=await accessTokenFor(account);if(account.provider==='google')return{ok:true,...await googleSync(account,accessToken)};if(account.provider==='exchange'){const secret=readSecrets()[id];const result=await easSync(account,accessToken,secret.easState||{});updateSecrets(id,{easState:result.state});return{ok:true,calendars:result.calendars};}throw new Error('This account provider cannot be synchronized.')}catch(e){return{ok:false,error:e.message||String(e)}}});
ipcMain.handle('events:push',async(_event,config)=>{try{const account=readJson(metadataFile(),[]).find(item=>item.id===config.accountId);if(!account)throw new Error('Account not found.');if(config.provider==='caldav')return{ok:true,event:await calDavPush(config.accountId,config.event.calendarId,config.event)};const accessToken=await accessTokenFor(account);if(config.provider==='google')return{ok:true,event:await googlePush(config.remoteCalendarId,config.event,accessToken)};if(config.provider==='exchange'){const secret=readSecrets()[account.id],easState={...(secret.easState||{})},syncKey=easState.syncKeys?.[config.remoteCalendarId];if(!syncKey)throw new Error('Synchronize this Exchange calendar before adding an event.');const result=await easPush(account,config.remoteCalendarId,config.event,accessToken,syncKey,easState);updateSecrets(account.id,{easState:{...result.state,syncKeys:{...(result.state.syncKeys||{}),[config.remoteCalendarId]:result.syncKey}}});return{ok:true,event:result.event};}throw new Error('This calendar is read-only.')}catch(e){return{ok:false,error:e.message||String(e)}}});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 680,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#f7f8fa',
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') }
  });
  if (app.isPackaged) win.loadFile(path.join(__dirname, '../dist/index.html'));
  else win.loadURL('http://localhost:5173');
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
app.whenReady().then(() => { createWindow(); app.on('activate', () => BrowserWindow.getAllWindows().length || createWindow()); });
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
