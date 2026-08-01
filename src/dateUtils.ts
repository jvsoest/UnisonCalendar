export const DAY=86400000;
export function startOfDay(d:Date){const n=new Date(d);n.setHours(0,0,0,0);return n;}
export function addDays(d:Date,n:number){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
export function startOfWeek(d:Date){const r=startOfDay(d);r.setDate(r.getDate()-((r.getDay()+6)%7));return r;}
export function monthGridStart(d:Date){const r=new Date(d.getFullYear(),d.getMonth(),1);return addDays(r,-((r.getDay()+6)%7));}
export const sameDay=(a:Date,b:Date)=>a.toDateString()===b.toDateString();
export const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const time=(s:string)=>new Intl.DateTimeFormat('nl-NL',{hour:'2-digit',minute:'2-digit'}).format(new Date(s));
export const shortDay=(d:Date)=>new Intl.DateTimeFormat('nl-NL',{weekday:'short'}).format(d).replace('.','');
export const monthTitle=(d:Date)=>new Intl.DateTimeFormat('nl-NL',{month:'long',year:'numeric'}).format(d);
