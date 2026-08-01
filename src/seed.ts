import type { CalendarEvent, CalendarSource } from './types';
import { addDays, startOfWeek } from './dateUtils';

export const seedCalendars:CalendarSource[] = [
  {id:'work',name:'Werk',color:'#4f7df3',provider:'google',visible:true,account:'johan@studio.nl'},
  {id:'personal',name:'Persoonlijk',color:'#ea5f91',provider:'caldav',visible:true,account:'iCloud / CalDAV'},
  {id:'team',name:'Team Europe',color:'#8c62d7',provider:'exchange',visible:true,account:'Exchange'},
  {id:'birthdays',name:'Verjaardagen',color:'#e69b31',provider:'local',visible:true,account:'Lokaal'}
];

function event(day:Date,hour:number,duration:number,title:string,calendarId:string,location?:string):CalendarEvent {
  const start=new Date(day); start.setHours(hour,0,0,0); const end=new Date(start.getTime()+duration*60000);
  return {id:crypto.randomUUID(),calendarId,title,start:start.toISOString(),end:end.toISOString(),location,syncState:'synced',updatedAt:new Date().toISOString()};
}
export function makeSeedEvents(today=new Date()):CalendarEvent[]{
  const monday=startOfWeek(today);
  return [
    event(addDays(monday,0),9,30,'Weekstart', 'work','Google Meet'),
    event(addDays(monday,0),13,60,'Lunch met Noor','personal','Café de Jaren'),
    event(addDays(monday,1),10,90,'Design review','team','Studio 4'),
    event(addDays(monday,1),14,30,'Tandarts','personal','Weteringschans'),
    event(addDays(monday,2),9,45,'Product sync','work','Microsoft Teams'),
    event(addDays(monday,2),15,60,'Focus: roadmap','work'),
    event(addDays(monday,3),11,60,'Client workshop','team','Boardroom'),
    event(addDays(monday,3),16,30,'Boodschappen','personal'),
    event(addDays(monday,4),10,30,'1:1 met Maya','work','Google Meet'),
    event(addDays(monday,4),14,90,'Sprint demo','team','Microsoft Teams'),
    event(addDays(monday,5),11,60,'Hardlopen','personal','Vondelpark'),
    event(addDays(monday,7),9,30,'Weekstart','work','Google Meet'),
    event(addDays(monday,-2),18,120,'Etentje familie','personal','Haarlem')
  ];
}
