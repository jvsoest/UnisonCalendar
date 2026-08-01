import ICAL from 'ical.js';
import type { CalendarEvent } from './types';

function cleanId(value:string){return value.replace(/[^a-zA-Z0-9._:@-]/g,'_')}

export function parseIcs(text:string,calendarId:string):CalendarEvent[]{
  const root=new ICAL.Component(ICAL.parse(text)); const now=new Date(); const rangeStart=new Date(now);rangeStart.setFullYear(now.getFullYear()-1);const rangeEnd=new Date(now);rangeEnd.setFullYear(now.getFullYear()+2);const result:CalendarEvent[]=[];
  for(const component of root.getAllSubcomponents('vevent')){
    const event=new ICAL.Event(component); if(!event.startDate||!event.endDate)continue;
    const add=(start:ICAL.Time,end:ICAL.Time,suffix='')=>{const s=start.toJSDate(),e=end.toJSDate();if(e<rangeStart||s>rangeEnd)return;result.push({id:`ics:${calendarId}:${cleanId(event.uid||crypto.randomUUID())}${suffix}`,calendarId,title:event.summary||'(Geen titel)',start:s.toISOString(),end:e.toISOString(),location:event.location||undefined,notes:event.description||undefined,allDay:start.isDate,syncState:'synced',remoteId:event.uid,updatedAt:new Date().toISOString()})};
    if(event.isRecurring()) { const iterator=event.iterator();let next;let count=0;while((next=iterator.next())&&count++<2000){if(next.toJSDate()>rangeEnd)break;const occurrence=event.getOccurrenceDetails(next);add(occurrence.startDate,occurrence.endDate,`:${next.toString()}`);} } else add(event.startDate,event.endDate);
  }
  return result;
}

export function calendarColorFromIcs(text:string){const match=text.match(/(?:^|\r?\n)(?:X-WR-CALCOLOR|COLOR):([^\r\n;]+)/i);const value=match?.[1]?.trim();return value&&/^#[0-9a-f]{6}$/i.test(value)?value:undefined}
