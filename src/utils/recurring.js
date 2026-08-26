import { uid, isoToday } from './helpers';

export const RECURRING_FREQUENCIES = [
  {code:'daily',label:'Dnevno'},
  {code:'weekly',label:'Nedeljno'},
  {code:'monthly',label:'Mesečno'},
  {code:'yearly',label:'Godišnje'},
];

export function parseIsoDate(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  return new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));
}

export function toIsoDate(date){return date.toISOString().slice(0,10)}

export function daysInUtcMonth(year,monthIndex){return new Date(Date.UTC(year,monthIndex+1,0)).getUTCDate()}

export function addRecurringPeriod(iso,frequency){
  const date=parseIsoDate(iso);
  if(!date)return isoToday();
  if(frequency==='daily')date.setUTCDate(date.getUTCDate()+1);
  else if(frequency==='weekly')date.setUTCDate(date.getUTCDate()+7);
  else if(frequency==='monthly'){
    const originalDay=date.getUTCDate();
    let year=date.getUTCFullYear();
    let month=date.getUTCMonth()+1;
    if(month>11){month=0;year+=1}
    date.setUTCFullYear(year,month,Math.min(originalDay,daysInUtcMonth(year,month)));
  }else if(frequency==='yearly'){
    const month=date.getUTCMonth();
    const day=date.getUTCDate();
    const year=date.getUTCFullYear()+1;
    date.setUTCFullYear(year,month,Math.min(day,daysInUtcMonth(year,month)));
  }
  return toIsoDate(date);
}

export function recurringLabel(code){return RECURRING_FREQUENCIES.find(x=>x.code===code)?.label||code}

export function daysUntilIso(iso){
  const target=parseIsoDate(iso),today=parseIsoDate(isoToday());
  if(!target||!today)return 0;
  return Math.ceil((target-today)/86400000);
}

export function recurringTransactionFromRule(rule,occurrenceDate){
  return {
    id:uid('t'),
    type:rule.type,
    title:rule.title,
    category:rule.category,
    amount:Number(rule.amount||0),
    currency:rule.currency||'RSD',
    exchangeRate:Number(rule.exchangeRate||1),
    amountRsd:Number(rule.amountRsd||Number(rule.amount||0)*Number(rule.exchangeRate||1)),
    date:occurrenceDate,
    note:[rule.note,'Automatski kreirano iz ponavljajuće transakcije.'].filter(Boolean).join('\n'),
    recurringId:rule.id,
    recurringOccurrence:occurrenceDate,
  };
}

export function applyDueRecurring(data,today=isoToday()){
  const rules=Array.isArray(data.recurring)?data.recurring:[];
  const transactions=Array.isArray(data.transactions)?[...data.transactions]:[];
  let changed=false;
  const nextRules=rules.map(original=>{
    let rule={...original};
    if(!rule.isActive)return rule;
    let nextRun=rule.nextRun||rule.startDate||today;
    let generated=Number(rule.generatedCount||0);
    let guard=0;
    while(nextRun<=today&&guard<60){
      guard+=1;
      if(rule.endDate&&nextRun>rule.endDate){rule.isActive=false;changed=true;break}
      if(rule.maxOccurrences&&generated>=Number(rule.maxOccurrences)){rule.isActive=false;changed=true;break}
      const exists=transactions.some(x=>x.recurringId===rule.id&&x.recurringOccurrence===nextRun);
      if(!exists){transactions.unshift(recurringTransactionFromRule(rule,nextRun));changed=true}
      generated+=1;
      nextRun=addRecurringPeriod(nextRun,rule.frequency);
      changed=true;
    }
    if(rule.endDate&&nextRun>rule.endDate)rule.isActive=false;
    if(rule.maxOccurrences&&generated>=Number(rule.maxOccurrences))rule.isActive=false;
    return {...rule,nextRun,generatedCount:generated,lastRun:generated?rule.lastRun||today:rule.lastRun};
  });
  return changed?{...data,transactions,recurring:nextRules}:data;
}

