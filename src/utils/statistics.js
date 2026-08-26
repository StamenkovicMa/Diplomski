import { amountInRsd } from './finance';
import { monthKey } from './helpers';

export function computeStats(tx,month){
  const all=tx||[];
  const scoped=all.filter(x=>monthKey(x.date)===month);
  const sum=(items,type)=>items.filter(x=>x.type===type).reduce((a,x)=>a+amountInRsd(x),0);
  const income=sum(scoped,'income');
  const expense=sum(scoped,'expense');
  const totalIncome=sum(all,'income');
  const totalExpense=sum(all,'expense');
  return {income,expense,balance:totalIncome-totalExpense,monthBalance:income-expense,savingsRate:income?((income-expense)/income)*100:0};
}
