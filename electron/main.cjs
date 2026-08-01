const { app, BrowserWindow, shell, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

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
        const profileResponse=await fetch(userUrl,{headers:{authorization:`Bearer ${tokens.access_token}`}}); const profile=await profileResponse.json();
        const email=profile.email||profile.preferred_username||profile.userPrincipalName||'Account'; const account={id:crypto.randomUUID(),provider,email,displayName:profile.name||email,connectedAt:new Date().toISOString()};
        saveAccount(account,{...tokens,clientId,tenant}); res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<h2>Account verbonden</h2><p>Je kunt dit venster sluiten en teruggaan naar Unison.</p><script>window.close()</script>'); resolve(account);
      } catch(error){res.writeHead(400,{'content-type':'text/plain; charset=utf-8'});res.end(String(error.message||error));reject(error);} finally {setTimeout(()=>server.close(),250);}
    });
    server.on('error',reject); server.listen(0,'127.0.0.1',()=>{const redirectUri=`http://localhost:${server.address().port}/oauth/callback`;const params=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,scope,state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'consent'});shell.openExternal(`${authorize}?${params}`);});
    setTimeout(()=>{server.close();reject(new Error('De login is verlopen. Probeer opnieuw.'));},300000);
  });
}

async function calDavLogin(config) {
  const serverUrl=config.serverUrl?.trim().replace(/\/$/,''); if(!serverUrl||!config.username||!config.password)throw new Error('Vul server, gebruikersnaam en wachtwoord in.');
  const auth='Basic '+Buffer.from(`${config.username}:${config.password}`).toString('base64');
  const response=await fetch(serverUrl,{method:'PROPFIND',headers:{authorization:auth,depth:'0','content-type':'application/xml'},body:'<?xml version="1.0"?><propfind xmlns="DAV:"><prop><current-user-principal/><resourcetype/></prop></propfind>'});
  if(response.status===401||response.status===403)throw new Error('Gebruikersnaam of wachtwoord is niet geaccepteerd.'); if(!response.ok&&response.status!==207)throw new Error(`CalDAV-server antwoordde met status ${response.status}.`);
  const account={id:crypto.randomUUID(),provider:'caldav',email:config.username,displayName:config.username,serverUrl,connectedAt:new Date().toISOString()}; saveAccount(account,{username:config.username,password:config.password}); return account;
}

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
ipcMain.handle('accounts:caldav',async(_event,c)=>{try{return{ok:true,account:await calDavLogin(c)}}catch(e){return{ok:false,error:e.message||String(e)}}});
ipcMain.handle('accounts:ics',async(_event,c)=>{try{const result=await icsLogin(c);return{ok:true,...result}}catch(e){return{ok:false,error:e.message||String(e)}}});
ipcMain.handle('accounts:ics-sync',async(_event,id)=>{try{const url=readSecrets()[id]?.url;if(!url)throw new Error('De opgeslagen agenda-URL ontbreekt.');return{ok:true,ics:await fetchIcs(url)}}catch(e){return{ok:false,error:e.message||String(e)}}});

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
