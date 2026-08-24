import { DEFAULT_RATES } from '../constants/categories';

export function transactionRate(tx){
  if(tx?.currency==='RSD'||!tx?.currency)return 1;
  const explicit=Number(tx?.exchangeRate);
  return explicit>0?explicit:(DEFAULT_RATES[tx.currency]||1);
}
export function amountInRsd(tx){
  if(Number.isFinite(Number(tx?.amountRsd)))return Number(tx.amountRsd);
  return Number(tx?.amount||0)*transactionRate(tx);
}
export function goalExchangeRate(goal){
  if((goal?.currency||'RSD')==='RSD')return 1;
  const explicit=Number(goal?.exchangeRate||0);
  return explicit>0?explicit:(DEFAULT_RATES[goal?.currency]||1);
}
export function goalSavedRsd(goal){
  if(Number.isFinite(Number(goal?.savedRsd)))return Number(goal.savedRsd);
  return Number(goal?.saved||0)*goalExchangeRate(goal);
}
export function goalTargetRsd(goal){
  if(Number.isFinite(Number(goal?.targetRsd)))return Number(goal.targetRsd);
  return Number(goal?.target||0)*goalExchangeRate(goal);
}

export function displayMoney(value,currency='RSD'){
  const n=Number(value||0);
  try{
    const formatted=new Intl.NumberFormat('sr-RS',{minimumFractionDigits:0,maximumFractionDigits:2}).format(n);
    if(currency==='EUR')return `${formatted} €`;
    if(currency==='USD')return `${formatted} $`;
    return `${formatted} RSD`;
  }catch{
    return currency==='EUR'?`${n} €`:currency==='USD'?`${n} $`:`${n} RSD`;
  }
}
