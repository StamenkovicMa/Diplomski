import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';
import { isoToday } from '../utils/helpers';


const CYRILLIC_TO_LATIN={
  'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Ђ':'DJ','Е':'E','Ж':'Z','З':'Z','И':'I','Ј':'J','К':'K','Л':'L','Љ':'LJ','М':'M','Н':'N','Њ':'NJ','О':'O','П':'P','Р':'R','С':'S','Т':'T','Ћ':'C','У':'U','Ф':'F','Х':'H','Ц':'C','Ч':'C','Џ':'DZ','Ш':'S',
  'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'dj','е':'e','ж':'z','з':'z','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t','ћ':'c','у':'u','ф':'f','х':'h','ц':'c','ч':'c','џ':'dz','ш':'s'
};

export function transliterateSerbianCyrillic(value){
  return String(value||'').split('').map(ch=>CYRILLIC_TO_LATIN[ch]??ch).join('');
}

export function normalizeSerbianText(value){
  return transliterateSerbianCyrillic(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/đ/g,'dj')
    .replace(/[^a-z0-9\s.%+\-/]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

export function normalizeKey(value){
  return normalizeSerbianText(value).replace(/[^a-z0-9]/g,'');
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
const CATEGORY_RULES=[
  {category:'Namirnice',merchant:/maxi|idea|lidl|dis|univerexport|aroma|tempo|aman|roda|mercator|market|prodavn|trgov|samoposlug/,items:/hleb|mleko|jogurt|sir|meso|pilet|junet|svinj|riba|jaja|voce|povrce|banana|jabuk|krompir|pirinac|testen|brasno|ulje|voda|sok|kafa|caj|cokolad|keks|namirnic|salama|sunka|kobasic|pavlak|puter|margarin|secer|so\b/},
  {category:'Gorivo',merchant:/nis|gazprom|omv|mol|lukoil|euro petrol|pump|goriv/,items:/benzin|dizel|evrodizel|euro dizel|gorivo|adblue|tng|lpg|premium dizel/},
  {category:'Lekovi',merchant:/apot|pharm|benu|dr max|galen pharm/,items:/lek|brufen|paracetamol|vitamin|sirup|tablet|kapsul|probiotik|magnezijum|zavoj|mast\b|sprej|antibiotik/},
  {category:'Lična nega',merchant:/dm droger|lilly|droger|kozmetik/,items:/sampon|dezodorans|pasta za zube|gel za tus|krema|parfem|sapun|kozmetik|higijen|pelene|ulosci|cetkica/},
  {category:'Dostava hrane',merchant:/wolt|glovo|dostav/,items:/dostava|delivery/},
  {category:'Restorani',merchant:/restoran|kafana|pizza|burger|mcdonald|kfc|food|grill|pekara|coffee|cafe|kafic|bistro/,items:/pizza|burger|sendvic|obrok|kafa|espresso|kapucino|pivo|rucak|dorucak|pecivo|pljeskavic|cevap|salata/},
  {category:'Tehnika',merchant:/gigatron|tehnoman|computer|mobile|telefon|istyle|ananas tech/,items:/telefon|laptop|racunar|monitor|slusalic|punjac|kabl|mis\b|tastatur|televizor|ssd|usb|adapter|zvucnik/},
  {category:'Parking',merchant:/parking|park servis/,items:/parking|parkiranje/},
  {category:'Hotel',merchant:/hotel|apartman|hostel|booking/,items:/nocenje|smestaj|apartman|soba/},
  {category:'Odeća',merchant:/zara|h&m|reserved|fashion|waikiki|bershka|pull.*bear|stradivarius|sport vision|buzz/,items:/majica|pantalon|farmer|jakna|dukser|patike|cipele|haljina|kosulja|odeca|carape/},
  {category:'Prevoz',merchant:/car go|cargo|yandex|taxi|pink taxi|naxis/,items:/voznja|taxi|prevoz/},
];

function itemText(items){
  return normalizeSerbianText(
    (Array.isArray(items)?items:[])
      .map(item=>`${item?.name||''} ${item?.description||''}`)
      .join(' ')
  );
}

export function categorizeFiscalReceipt(receipt){
  const merchant=normalizeSerbianText(receipt?.merchantName||receipt?.merchant||receipt?.merchantCompany||'');
  const items=Array.isArray(receipt?.items)?receipt.items:[];
  const combinedItems=itemText(items);
  const scores=new Map();

  CATEGORY_RULES.forEach(rule=>{
    let score=0;
    let merchantMatched=false;
    let itemMatches=0;

    if(rule.merchant.test(merchant)){
      score+=62;
      merchantMatched=true;
    }

    items.forEach(item=>{
      const text=normalizeSerbianText(`${item?.name||''} ${item?.description||''}`);
      if(text&&rule.items.test(text)){
        const value=Math.abs(Number(item?.total||item?.amount||item?.price||0));
        score+=value>0?Math.min(18,6+Math.log10(value+1)*3):8;
        itemMatches+=1;
      }
    });

    if(!items.length&&combinedItems&&rule.items.test(combinedItems)){
      score+=12;
      itemMatches+=1;
    }

    if(score>0)scores.set(rule.category,{score,merchantMatched,itemMatches});
  });

  const ranked=[...scores.entries()]
    .map(([category,data])=>({category,...data}))
    .sort((a,b)=>b.score-a.score);

  if(!ranked.length){
    return {
      category:'Ostali troškovi',
      confidence:35,
      source:'fallback',
      reason:'Prodavac i stavke nisu dovoljno prepoznatljivi za sigurnu automatsku kategorizaciju.'
    };
  }

  const best=ranked[0];
  const second=ranked[1]?.score||0;
  const gap=best.score-second;
  let confidence=Math.round(Math.min(97,45+best.score*.45+Math.max(0,gap)*.12));
  if(best.merchantMatched&&best.itemMatches>0)confidence=Math.max(confidence,90);
  else if(best.merchantMatched)confidence=Math.max(confidence,82);
  else if(best.itemMatches>=2)confidence=Math.max(confidence,78);
  else confidence=Math.max(confidence,62);

  const source=best.merchantMatched&&best.itemMatches>0?'merchant+items':best.merchantMatched?'merchant':'items';
  const reason=
    source==='merchant+items'
      ? `Prepoznati su i prodavac i ${best.itemMatches} relevantne stavke.`
      : source==='merchant'
        ? 'Kategorija je predložena na osnovu prepoznatog prodavca.'
        : `Kategorija je predložena analizom ${best.itemMatches} stavki sa računa.`;

  return {
    category:best.category,
    confidence,
    source,
    reason,
    normalizedMerchant:merchant,
    analyzedItems:items.length
  };
}

export function suggestExpenseCategory(merchant){
  return categorizeFiscalReceipt({merchantName:merchant,items:[]}).category;
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
