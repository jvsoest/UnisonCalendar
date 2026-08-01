import type { CalendarEvent, CalendarSource, OutboxEntry } from './types';

const DB_NAME = 'unison-calendar';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('calendars')) db.createObjectStore('calendars', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function all<T>(store:string): Promise<T[]> { const db=await openDb(); return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}); }
async function put<T>(store:string,value:T): Promise<void> { const db=await openDb(); return new Promise((res,rej)=>{const r=db.transaction(store,'readwrite').objectStore(store).put(value);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);}); }

export const database = {
  calendars: () => all<CalendarSource>('calendars'), events: () => all<CalendarEvent>('events'), outbox: () => all<OutboxEntry>('outbox'),
  putCalendar: (v:CalendarSource) => put('calendars',v),
  async replaceCalendarEvents(calendarId:string, values:CalendarEvent[]) { const db=await openDb(); return new Promise<void>((resolve,reject)=>{const tx=db.transaction('events','readwrite'),store=tx.objectStore('events'),cursor=store.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if((c.value as CalendarEvent).calendarId===calendarId)c.delete();c.continue();}};cursor.onerror=()=>reject(cursor.error);tx.oncomplete=()=>{Promise.all(values.map(v=>put('events',v))).then(()=>resolve(),reject)};tx.onerror=()=>reject(tx.error);}); },
  async saveEvent(v:CalendarEvent, operation:OutboxEntry['operation']='update') { await put('events',v); await put('outbox',{id:crypto.randomUUID(),eventId:v.id,operation,createdAt:new Date().toISOString(),attempts:0}); }
};
