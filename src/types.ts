export type ViewMode = 'day' | 'week' | 'month';
export type ProviderType = 'caldav' | 'google' | 'exchange' | 'ics' | 'local';
export type SyncState = 'synced' | 'pending' | 'conflict' | 'error';

export interface CalendarSource { id:string; name:string; color:string; sourceColor?:string; colorOverride?:string; provider:ProviderType; visible:boolean; account:string; remoteId?:string; writable?:boolean; }
export interface CalendarEvent { id:string; calendarId:string; title:string; start:string; end:string; location?:string; notes?:string; allDay?:boolean; recurrence?:string; syncState:SyncState; remoteId?:string; updatedAt:string; }
export interface OutboxEntry { id:string; eventId:string; operation:'create'|'update'|'delete'; createdAt:string; attempts:number; }
