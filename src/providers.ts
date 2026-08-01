import type { CalendarEvent, CalendarSource, ProviderType } from './types';

export interface SyncCursor { token?:string; changedSince?:string; }
export interface SyncResult { events:CalendarEvent[]; deletedIds:string[]; cursor:SyncCursor; }
export interface CalendarProvider {
  type:ProviderType;
  connect():Promise<void>;
  listCalendars():Promise<CalendarSource[]>;
  pull(calendar:CalendarSource,cursor:SyncCursor):Promise<SyncResult>;
  push(calendar:CalendarSource,events:CalendarEvent[]):Promise<void>;
}

abstract class RemoteProvider implements CalendarProvider {
  abstract type:ProviderType;
  async connect(){ throw new Error(`${this.type} authenticatie moet in Instellingen worden geconfigureerd.`); }
  async listCalendars(){ return []; }
  async pull(_calendar:CalendarSource,cursor:SyncCursor){ return {events:[],deletedIds:[],cursor}; }
  async push(_calendar:CalendarSource,_events:CalendarEvent[]){ if(!navigator.onLine) throw new Error('offline'); }
}
export class CalDavProvider extends RemoteProvider { type='caldav' as const; }
export class GoogleCalendarProvider extends RemoteProvider { type='google' as const; }
export class ExchangeActiveSyncProvider extends RemoteProvider { type='exchange' as const; }
export const providers = { caldav:new CalDavProvider(), google:new GoogleCalendarProvider(), exchange:new ExchangeActiveSyncProvider() };
