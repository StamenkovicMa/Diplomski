import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';
import { isoToday } from '../utils/helpers';

export function normalizeKey(value){
  return String(value||'').toLowerCase().replace(/[^a-z0-9čćžšđ]/g,'');
}
export function findDeepValue(source,possibleKeys){
  const wanted=possibleKeys.map(normalizeKey);
  const visited=new Set();
  function visit(value){
    if(value===null||value===undefined)return undefined;
    if(typeof value!=='object')return undefined;
    if(visited.has(value))return undefined;
    visited.add(value);
    for(const [key,item] of Object.entries(value)){
      if(wanted.includes(normalizeKey(key))&&item!==null&&item!==undefined&&item!=='')return item;
    }
    for(const item of Object.values(value)){
      if(typeof item==='object'){
        const found=visit(item);
        if(found!==undefined)return found;
      }
    }
    return undefined;
  }
  return visit(source);
}
export function parseReceiptAmount(value){
  if(typeof value==='number')return Math.abs(value);
  if(value&&typeof value==='object'){
    const nested=value.amount??value.value??value.total;
    if(nested!==undefined)return parseReceiptAmount(nested);
  }
  let text=String(value||'').trim().replace(/\s/g,'');
  if(!text)return 0;
  if(text.includes(',')&&text.includes('.')){
    if(text.lastIndexOf(',')>text.lastIndexOf('.'))text=text.replace(/\./g,'').replace(',','.');
    else text=text.replace(/,/g,'');
  }else if(text.includes(',')){
    text=text.replace(',','.');
  }
  text=text.replace(/[^0-9.-]/g,'');
  const result=Number(text);
  return Number.isFinite(result)?Math.abs(result):0;
}
export function parseReceiptDate(value){
  if(!value)return isoToday();
  const text=String(value);
  const direct=text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if(direct)return `${direct[1]}-${String(direct[2]).padStart(2,'0')}-${String(direct[3]).padStart(2,'0')}`;
  const reverse=text.match(/(\d{1,2})[./-](\d{1,2})[./-](20\d{2})/);
  if(reverse)return `${reverse[3]}-${String(reverse[2]).padStart(2,'0')}-${String(reverse[1]).padStart(2,'0')}`;
  const parsed=new Date(text);
  return Number.isNaN(parsed.getTime())?isoToday():parsed.toISOString().slice(0,10);
}
export function suggestExpenseCategory(merchant){
  const x=String(merchant||'').toLowerCase();
  if(/maxi|idea|lidl|dis|univerexport|aroma|tempo|market|prodavn|trgov/.test(x))return 'Namirnice';
  if(/nis|gazprom|omv|mol|lukoil|pump|goriv/.test(x))return 'Gorivo';
  if(/apot|pharm|lek/.test(x))return 'Lekovi';
  if(/wolt|glovo|dostav/.test(x))return 'Dostava hrane';
  if(/restoran|kafana|pizza|burger|food/.test(x))return 'Restorani';
  if(/gigatron|tehnoman|computer|mobile|telefon/.test(x))return 'Tehnika';
  if(/parking/.test(x))return 'Parking';
  if(/hotel|apartman/.test(x))return 'Hotel';
  return 'Ostali troškovi';
}
export function extractFiscalUrl(qrValue){
  const raw=String(qrValue||'').trim();
  if(!raw)throw new Error('QR kod je prazan.');

  const candidates=[raw];
  try{
    const decoded=decodeURIComponent(raw);
    if(decoded!==raw)candidates.push(decoded);
  }catch{}

  for(const candidate of candidates){
    const httpMatch=candidate.match(/https?:\/\/[^\s<>"']+/i);
    if(httpMatch){
      try{return new URL(httpMatch[0].trim()).toString()}catch{}
    }

    const domainMatch=candidate.match(/(?:www\.)?(?:suf\.purs\.gov\.rs|purs\.gov\.rs|efiskalizacija\.gov\.rs)\/[^\s<>"']*/i);
    if(domainMatch){
      try{return new URL(`https://${domainMatch[0].replace(/^www\./i,'')}`).toString()}catch{}
    }

    if(/^[a-z0-9.-]+\.[a-z]{2,}\/\S+$/i.test(candidate)){
      try{return new URL(`https://${candidate}`).toString()}catch{}
    }
  }

  throw new Error(`QR sadržaj nije prepoznat kao fiskalni internet link.\n\nSadržaj QR-a: ${raw.slice(0,180)}`);
}

export async function fetchFiscalReceipt(qrValue){
  const normalizedUrl=extractFiscalUrl(qrValue);

  if(!SUPABASE_URL||!SUPABASE_ANON_KEY){
    throw new Error('Supabase URL ili publishable key nisu podešeni.');
  }

  const functionUrl=`${SUPABASE_URL}/functions/v1/parse-fiscal-receipt`;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),20000);

  try{
    const response=await fetch(functionUrl,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        apikey:SUPABASE_ANON_KEY,
        Authorization:`Bearer ${SUPABASE_ANON_KEY}`,
      },
      body:JSON.stringify({qrUrl:normalizedUrl}),
      signal:controller.signal,
    });

    const payload=await response.json().catch(()=>null);

    if(!response.ok){
      throw new Error(payload?.error||`Servis za čitanje računa je vratio HTTP ${response.status}.`);
    }

    if(!payload?.receipt){
      throw new Error('Servis nije vratio podatke fiskalnog računa.');
    }

    return {
      ...payload.receipt,
      qrUrl:payload.receipt.qrUrl||normalizedUrl,
      rawQr:String(qrValue||''),
    };
  }catch(error){
    if(error?.name==='AbortError'){
      throw new Error('Isteklo je vreme za učitavanje fiskalnog računa.');
    }
    throw error;
  }finally{
    clearTimeout(timeout);
  }
}
