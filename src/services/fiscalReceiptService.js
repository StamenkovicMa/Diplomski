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
 {category:'Namirnice',merchant:/maxi|idea|lidl|dis|univerexport|aroma|tempo|aman|roda|mercator|market|prodavn|trgov|samoposlug/,items:/hleb|mleko|jogurt|kefir|sir|kackavalj|meso|pilet|junet|svinj|riba|tunjev|jaja|voce|povrce|banana|jabuk|pomorand|limun|krompir|paradajz|krastav|pirinac|testen|brasno|ulje|voda|sok|namirnic|salama|sunka|kobasic|pavlak|puter|margarin|secer|so\b|konzerv|smrznut|pasulj|grasak|kukuruz|ovsene|musli/},
 {category:'Kafa',merchant:/coffee|cafe|kafic|starbucks|kafeterija/,items:/kafa|espresso|kapucino|cappuccino|latte|macchiato/},
 {category:'Pekara',merchant:/pekara|bakery|skroz dobra pekara|trpkovic/,items:/pecivo|burek|kroasan|hleb|pita|kifla|pogaca/},
 {category:'Slatkiši',merchant:/poslastic|slatka kuca|candy/,items:/cokolad|keks|sladoled|torta|kolac|bombon|napolitank/},
 {category:'Piće',merchant:/vinotek|drink store|podrum pica/,items:/sok|voda|pivo|vino|viski|rakija|energetsko pice/},
 {category:'Restorani',merchant:/restoran|kafana|bistro|grill|cevap|giros/,items:/obrok|rucak|dorucak|pljeskavic|cevap|giros|salata|pizza|burger/},
 {category:'Fast food',merchant:/mcdonald|kfc|burger king|fast food|pizza|giros/,items:/burger|pomfrit|pizza|sendvic|giros|hot dog/},
 {category:'Dostava hrane',merchant:/wolt|glovo|donesi|dostav/,items:/dostava|delivery/},

 {category:'Gorivo',merchant:/nis|gazprom|omv|mol|lukoil|euro petrol|knez petrol|pump|goriv/,items:/benzin|dizel|evrodizel|euro dizel|gorivo|adblue|tng|lpg|bmb/},
 {category:'Parking',merchant:/parking|park servis|parking servis/,items:/parking|parkiranje|garaza/},
 {category:'Putarina',merchant:/putevi srbije|putarina|toll/,items:/putarina|toll/},
 {category:'Servis automobila',merchant:/auto servis|autoservis|vulkanizer|autocentar|auto centar|servis vozila|autodel|inter cars/,items:/motorno ulje|filter ulja|filter vazduha|filter goriva|kocion|disk|plocic|akumulator|svecic|amortizer|servis|antifriz|brisac/},
 {category:'Gume',merchant:/vulkanizer|gume|pneumatik/,items:/guma|pneumatik|vulkaniz|balansiranje/},
 {category:'Registracija vozila',merchant:/tehnicki pregled|registracija|osiguranje/,items:/registracija|tehnicki pregled|saobracajna/},
 {category:'Taksi',merchant:/car go|cargo|yandex|taxi|pink taxi|naxis/,items:/voznja|taxi/},
 {category:'Autobus',merchant:/lasta|nis ekspres|flixbus|busplus|bg prevoz/,items:/autobus|bus karta|mesecna karta/},
 {category:'Voz',merchant:/srbija voz|zeleznic|train/,items:/voz|zeleznicka karta/},
 {category:'Avion',merchant:/air serbia|wizz|ryanair|lufthansa|avio/,items:/avio karta|avionska karta|let\b|prtljag/},
 {category:'Rent a car',merchant:/rent a car|rentacar|hertz|avis|sixt/,items:/rent a car|iznajmljivanje vozila/},

 {category:'Lekovi',merchant:/apot|pharm|benu|dr max|galen pharm/,items:/lek|brufen|paracetamol|sirup|tablet|kapsul|antibiotik|analgetik|pastile|flaster/},
 {category:'Suplementi',merchant:/apot|pharm|supplement|proteini/,items:/vitamin|probiotik|magnezijum|suplement|omega|protein|kreatin/},
 {category:'Lekarski pregled',merchant:/ordinacija|dom zdravlja|medigroup|euromedik|bel medic|doktor/,items:/pregled|ultrazvuk|snimanje|terapija|krvna slika/},
 {category:'Privatna klinika',merchant:/klinika|poliklinika|medigroup|euromedik|bel medic/,items:/klinika|specijalist|pregled/},
 {category:'Stomatolog',merchant:/stomatolog|dental|dent/,items:/zub|plomba|stomatolog|krunica|implant/},
 {category:'Lična nega',merchant:/dm droger|lilly|droger|kozmetik|sephora/,items:/sampon|regenerator|dezodorans|pasta za zube|gel za tus|krema|parfem|sapun|higijen|pelene|ulosci|cetkica|brijac/},
 {category:'Kozmetika',merchant:/dm droger|lilly|sephora|kozmetik/,items:/sminka|maskara|ruz\b|puder|micelarn|lak za nokte/},
 {category:'Frizer',merchant:/frizer|hair|barber|salon lepote/,items:/sisanje|frizura|feniranje|brijanje/},
 {category:'Teretana',merchant:/teretana|fitness|gym/,items:/teretana|clanarina|fitness|trening/},
 {category:'Wellness',merchant:/spa|wellness|masaza/,items:/masaza|spa|sauna|wellness/},

 {category:'Tehnika',merchant:/gigatron|tehnoman|tehnomedia|bc group|winwin|game centar/,items:/slusalic|punjac|kabl|adapter|zvucnik|kamera|router|usb|ssd/},
 {category:'Mobilni telefon',merchant:/mobile|telefon|istyle|gigatron|a1|yettel|mts/,items:/telefon|smartfon|iphone|samsung galaxy|xiaomi/},
 {category:'Računar',merchant:/computer|bc group|gigatron|tehnoman/,items:/laptop|racunar|monitor|mis\b|tastatur|ssd|graficka|procesor/},
 {category:'Kućni aparati',merchant:/tehnoman|tehnomedia|gigatron|emmezeta/,items:/frizider|zamrzivac|ves masina|sudomasin|sporet|rerna|mikrotalas|usisivac|pegla|bojler|klima|blender|mikser/},
 {category:'Nameštaj',merchant:/ikea|jysk|emmezeta|forma ideale/,items:/stolica|sto\b|krevet|dusek|ormar|polica|tepih|namestaj/},
 {category:'Kućne potrepštine',merchant:/dm droger|lilly|uradi sam|okov|market/,items:/deterdzent|omeksivac|prasak za ves|sredstvo za sudove|ciscenje|toalet papir|ubrusi|sundjer|kesa za smece|folija|salvete|krpa|metla/},
 {category:'Održavanje stana',merchant:/uradi sam|okov|woby haus|majstor|servis/,items:/alat|sraf|busilic|farba|cetka|vodoinstal|elektricar|popravka/},

 {category:'Odeća',merchant:/zara|h&m|reserved|fashion|waikiki|bershka|pull.*bear|stradivarius|new yorker|springfield|legend/,items:/majica|pantalon|farmer|jakna|dukser|haljina|kosulja|carape|ves\b|dzemper|sorc|kaput|trenerk/},
 {category:'Obuća',merchant:/sport vision|buzz|office shoes|deichmann|planeta sport|n sport|adidas|nike|puma/,items:/patike|cipele|cizme|papuce|sandale|obuca/},
 {category:'Pokloni',merchant:/gift|poklon|cvecara|flowers|zlatara|jewelry/,items:/poklon|cvece|buket|nakit|narukvica|ogrlica/},
 {category:'Knjige',merchant:/vulkan|delfi|laguna|knjizara/,items:/knjiga|roman|strip|prirucnik/},

 {category:'Netflix',merchant:/netflix/,items:/netflix/},
 {category:'Spotify',merchant:/spotify/,items:/spotify/},
 {category:'YouTube Premium',merchant:/youtube|google/,items:/youtube premium/},
 {category:'Steam',merchant:/steam/,items:/steam|game\b|igra\b/},
 {category:'PlayStation',merchant:/playstation|sony interactive/,items:/playstation|ps plus|ps5|ps4/},
 {category:'Video igre',merchant:/game centar|gaming|xbox|nintendo/,items:/video igra|game\b|xbox|nintendo/},
 {category:'Bioskop',merchant:/cineplexx|cinestar|bioskop/,items:/bioskop|film|ulaznica/},
 {category:'Pozorište',merchant:/pozoriste|teatar/,items:/predstava|pozoriste|ulaznica/},
 {category:'Koncert',merchant:/eventim|tickets|koncert/,items:/koncert|ulaznica/},
 {category:'Izlasci',merchant:/club|klub|bar\b|pub\b/,items:/koktel|pivo|vino|ulaz/},

 {category:'Hrana za ljubimce',merchant:/pet centar|pet shop|petshop|premium pet/,items:/hrana za pse|hrana za macke|granule|konzerva za pse|konzerva za macke/},
 {category:'Veterinar',merchant:/veterinar|veterinarsk/,items:/veterinar|vakcina|pregled psa|pregled macke/},
 {category:'Oprema za ljubimce',merchant:/pet centar|pet shop|petshop/,items:/povodac|ogrlica|posip|igracka za pse|igracka za macke/},
 {category:'Igračke',merchant:/aksa|dexy co|pertini|kids|toy/,items:/igracka|lego|lutka|autic/},
 {category:'Dečja garderoba',merchant:/aksa|kids|baby/,items:/decja garderoba|deciji|bebi odeca/},

 {category:'Udžbenici',merchant:/knjizara|vulkan|delfi|fakultet/,items:/udzbenik|skripta/},
 {category:'Kancelarijski materijal',merchant:/office|knjizara|kancelarij/,items:/sveska|olovka|hemijska|papir a4|fascikla|toner/},
 {category:'Kursevi',merchant:/kurs|academy|akademija|udemy|coursera/,items:/kurs|obuka/},
 {category:'Fakultet',merchant:/fakultet|univerzitet/,items:/fakultet|ispit|prijava ispita/},
 {category:'Školarina',merchant:/fakultet|univerzitet|skola/,items:/skolarina/},
 {category:'Sertifikati',merchant:/certification|sertifikat|pearson|prometric/,items:/sertifikat|certification|ispit/},

 {category:'Hotel',merchant:/hotel|motel|resort/,items:/nocenje|soba|boravisna taksa/},
 {category:'Apartman',merchant:/apartman|airbnb|booking/,items:/apartman|smestaj|nocenje/},
 {category:'Putne karte',merchant:/air serbia|wizz|ryanair|lasta|srbija voz|flixbus|travel/,items:/karta|ticket|let\b|autobus|voz/},
 {category:'Turističke aktivnosti',merchant:/tour|excursion|muzej|museum|travel/,items:/izlet|tura|ulaznica|muzej|aktivnost/},
 {category:'Suveniri',merchant:/souvenir|suvenir|gift shop/,items:/suvenir|magnet|razglednica/},

 {category:'Struja',merchant:/eps|elektroprivreda|elektrodistribucija/,items:/struja|elektricna energija/},
 {category:'Voda',merchant:/vodovod/,items:/voda|vodovod/},
 {category:'Grejanje',merchant:/toplana|grejanje/,items:/grejanje|toplotna energija/},
 {category:'Gas',merchant:/srbijagas|gas\b/,items:/gas\b|prirodni gas/},
 {category:'Komunalije',merchant:/infostan|komunal/,items:/infostan|komunal/},
 {category:'Internet',merchant:/sbb|orion|mts|yettel|a1/,items:/internet|net paket/},
 {category:'Telefon',merchant:/mts|telekom srbija|yettel|a1 srbija|globaltel/,items:/mobilni|postpaid|prepaid|tarifa|telefonija/},

 {category:'Bankarske naknade',merchant:/banka|bank\b|raiffeisen|intesa|unicredit|otp|aik banka/,items:/naknada|provizija|odrzavanje racuna/},
 {category:'Kamata na kredit',merchant:/banka|bank\b/,items:/kamata|interest/},
 {category:'Rata kredita',merchant:/banka|bank\b/,items:/rata kredita|kreditna rata/},
 {category:'Porez',merchant:/poreska uprava|porez|trezor/,items:/porez/},
 {category:'Kazne',merchant:/mup|prekrsaj|kazna/,items:/kazna|prekrsaj/},
 {category:'Osiguranje vozila',merchant:/dunav osiguranje|generali|triglav|uniqa|wiener|osiguranje/,items:/auto osiguranje|osiguranje vozila|kasko/},
 {category:'Životno osiguranje',merchant:/dunav osiguranje|generali|triglav|uniqa|wiener/,items:/zivotno osiguranje/},
 {category:'Zdravstveno osiguranje',merchant:/dunav osiguranje|generali|triglav|uniqa|wiener/,items:/zdravstveno osiguranje/}
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
        score+=value>0?Math.min(24,7+Math.log10(value+1)*4):9;
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
    analyzedItems:items.length,
    alternatives:ranked.slice(1,4).map(x=>({category:x.category,score:Math.round(x.score)}))
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
