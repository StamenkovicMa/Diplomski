import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { CATEGORY_ICONS } from '../constants/categories';
import { COLORS } from '../constants/theme';
import { s } from '../constants/styles';
import { amountInRsd, goalSavedRsd } from '../utils/finance';
import { isoToday, monthKey, money, parseAmount } from '../utils/helpers';
import { addRecurringPeriod } from '../utils/recurring';
import { computeStats } from '../utils/statistics';
import { SectionTitle, Empty, Header, Screen } from '../components/common';


export function compactMoney(value){
  const n=Number(value||0);
  const abs=Math.abs(n);
  const sign=n<0?'-':'';
  if(abs>=1000000)return `${sign}${(abs/1000000).toFixed(abs>=10000000?0:1)}M`;
  if(abs>=1000)return `${sign}${(abs/1000).toFixed(abs>=100000?0:1)}k`;
  return `${Math.round(n)}`;
}

export function PeriodSelector({value,onChange}){
  return <View style={s.periodSelector}>
    {[3,6,12].map(period=><Pressable
      key={period}
      onPress={()=>onChange(period)}
      style={[s.periodOption,value===period&&s.periodOptionActive]}
    >
      <Text style={[s.periodOptionText,value===period&&s.periodOptionTextActive]}>{period}M</Text>
    </Pressable>)}
  </View>;
}

export function ReportMetric({label,value,tone='blue',caption}){
  const toneStyle=tone==='green'?s.reportMetricGreen:tone==='red'?s.reportMetricRed:tone==='amber'?s.reportMetricAmber:s.reportMetricBlue;
  return <View style={[s.reportMetric,toneStyle]}>
    <Text style={s.reportMetricLabel}>{label}</Text>
    <Text style={s.reportMetricValue}>{value}</Text>
    {caption?<Text style={s.reportMetricCaption}>{caption}</Text>:null}
  </View>;
}

export function MonthlyColumnChart({series}){
  const max=Math.max(1,...series.flatMap(item=>[item.income,item.expense]));
  const totalIncome=series.reduce((sum,item)=>sum+item.income,0);
  const totalExpense=series.reduce((sum,item)=>sum+item.expense,0);
  const net=totalIncome-totalExpense;
  return <View style={s.chartCard}>
    <View style={s.chartHead}>
      <View style={s.flex}>
        <Text style={s.chartTitle}>Prihodi vs. troškovi</Text>
        <Text style={s.chartSubtitle}>Direktno poređenje po mesecima</Text>
      </View>
      <View style={s.chartLegend}>
        <View style={[s.legendDot,{backgroundColor:COLORS.green}]}/><Text style={s.chartLegendText}>Prihodi</Text>
        <View style={[s.legendDot,{backgroundColor:COLORS.red}]}/><Text style={s.chartLegendText}>Troškovi</Text>
      </View>
    </View>

    <View style={s.chartKpiStrip}>
      <View style={s.chartKpiItem}><Text style={s.chartKpiLabel}>Prihodi</Text><Text style={[s.chartKpiValue,{color:COLORS.green}]}>{money(totalIncome)}</Text></View>
      <View style={s.chartKpiDivider}/>
      <View style={s.chartKpiItem}><Text style={s.chartKpiLabel}>Troškovi</Text><Text style={[s.chartKpiValue,{color:COLORS.red}]}>{money(totalExpense)}</Text></View>
      <View style={s.chartKpiDivider}/>
      <View style={s.chartKpiItem}><Text style={s.chartKpiLabel}>Neto</Text><Text style={[s.chartKpiValue,{color:net>=0?COLORS.primary:COLORS.red}]}>{net>=0?'+':''}{money(net)}</Text></View>
    </View>

    <View style={s.columnChart}>
      {series.map(item=>{
        const incomeHeight=Math.max(item.income?8:2,(item.income/max)*116);
        const expenseHeight=Math.max(item.expense?8:2,(item.expense/max)*116);
        return <View key={item.month} style={s.columnGroup}>
          <View style={s.columnValueLabels}>
            <Text style={[s.columnTinyValue,{color:COLORS.green}]}>{compactMoney(item.income)}</Text>
            <Text style={[s.columnTinyValue,{color:COLORS.red}]}>{compactMoney(item.expense)}</Text>
          </View>
          <View style={s.columnValueArea}>
            <View style={[s.columnBar,s.incomeColumn,{height:incomeHeight}]}/>
            <View style={[s.columnBar,s.expenseColumn,{height:expenseHeight}]}/>
          </View>
          <Text style={s.columnMonth}>{monthName(item.month).split(' ')[0]}</Text>
          <Text style={[s.columnNet,{color:item.monthBalance>=0?COLORS.green:COLORS.red}]}>
            {item.monthBalance>=0?'+':''}{compactMoney(item.monthBalance)}
          </Text>
        </View>;
      })}
    </View>
    <View style={s.chartAxis}/>
    <View style={s.chartFooter}>
      <Text style={s.smallMuted}>Skala: max {money(max)}</Text>
      <Text style={s.smallMuted}>Iznosi u RSD</Text>
    </View>
  </View>;
}

export function BalanceChart({series}){
  const max=Math.max(1,...series.map(item=>Math.abs(item.monthBalance)));
  return <View style={s.chartCard}>
    <View style={s.chartHead}><View><Text style={s.chartTitle}>Mesečni rezultat</Text><Text style={s.chartSubtitle}>Razlika prihoda i troškova</Text></View></View>
    <View style={s.balanceChart}>
      <View style={s.balanceAxis}/>
      {series.map(item=>{
        const positive=item.monthBalance>=0;
        const height=Math.max(Math.abs(item.monthBalance)?7:2,(Math.abs(item.monthBalance)/max)*58);
        return <View key={item.month} style={s.balanceGroup}>
          <View style={s.balanceHalfTop}>{positive?<View style={[s.balanceBar,s.balancePositive,{height}]}/>:null}</View>
          <View style={s.balanceHalfBottom}>{!positive?<View style={[s.balanceBar,s.balanceNegative,{height}]}/>:null}</View>
          <Text style={s.balanceMonth}>{monthName(item.month).split(' ')[0]}</Text>
        </View>;
      })}
    </View>
    <View style={s.balanceSummaryRow}>
      {series.slice(-3).map(item=><View key={item.month} style={s.balanceSummaryItem}><Text style={s.smallMuted}>{monthName(item.month)}</Text><Text style={[s.balanceSummaryValue,{color:item.monthBalance>=0?COLORS.green:COLORS.red}]}>{item.monthBalance>=0?'+':''}{money(item.monthBalance)}</Text></View>)}
    </View>
  </View>;
}

export function CategoryDistributionChart({expenses}){
  const by=categoryTotals(expenses);
  const entries=Object.entries(by).sort((a,b)=>b[1]-a[1]);
  const top=entries.slice(0,6);
  const total=entries.reduce((sum,item)=>sum+item[1],0);
  const palette=['#1E6FD9','#18A66A','#E59B22','#8A5CF5','#E24A4A','#25A7A0'];
  if(!top.length)return <View style={s.chartCard}><Empty text="Nema troškova za prikaz grafikona."/></View>;
  return <View style={s.chartCard}>
    <View style={s.chartHead}><View><Text style={s.chartTitle}>Raspodela troškova</Text><Text style={s.chartSubtitle}>Najveće kategorije</Text></View><Text style={s.categoryTotal}>{money(total)}</Text></View>
    <View style={s.stackedBar}>{top.map(([name,value],index)=><View key={name} style={{flex:value,backgroundColor:palette[index],minWidth:3}}/>)}</View>
    {top.map(([name,value],index)=>{
      const share=total?value/total:0;
      return <View key={name} style={s.categoryChartRow}>
        <View style={[s.categoryChartIcon,{backgroundColor:palette[index]+'18'}]}><Text style={s.categoryChartEmoji}>{CATEGORY_ICONS[name]||'•'}</Text></View>
        <View style={s.flex}>
          <View style={s.space}><Text style={s.categoryChartName}>{name}</Text><Text style={s.categoryChartAmount}>{money(value)}</Text></View>
          <View style={s.categoryProgress}><View style={[s.categoryProgressFill,{width:`${Math.max(3,share*100)}%`,backgroundColor:palette[index]}]}/></View>
        </View>
        <Text style={s.categoryPercent}>{Math.round(share*100)}%</Text>
      </View>;
    })}
  </View>;
}

export function IncomeDistributionChart({incomes}){
  const entries=Object.entries(categoryTotals(incomes)).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const total=entries.reduce((sum,item)=>sum+item[1],0);
  const max=Math.max(1,...entries.map(item=>item[1]));
  if(!entries.length)return <View style={s.chartCard}><Empty text="Nema prihoda za prikaz izvora prihoda."/></View>;
  return <View style={s.chartCard}>
    <View style={s.chartHead}>
      <View>
        <Text style={s.chartTitle}>Izvori prihoda</Text>
        <Text style={s.chartSubtitle}>Odakle dolazi najveći deo novca</Text>
      </View>
      <Text style={s.categoryTotal}>{money(total)}</Text>
    </View>
    {entries.map(([name,value],index)=>{
      const share=total?value/total:0;
      return <View key={name} style={s.incomeSourceRow}>
        <View style={s.incomeSourceTop}>
          <View style={s.incomeSourceNameWrap}>
            <Text style={s.incomeSourceRank}>{index+1}</Text>
            <Text style={s.incomeSourceName}>{CATEGORY_ICONS[name]||'↗'} {name}</Text>
          </View>
          <View style={s.incomeSourceRight}>
            <Text style={s.incomeSourceAmount}>{money(value)}</Text>
            <Text style={s.incomeSourcePercent}>{Math.round(share*100)}%</Text>
          </View>
        </View>
        <View style={s.incomeSourceTrack}>
          <View style={[s.incomeSourceFill,{width:`${Math.max(4,(value/max)*100)}%`}]}/>
        </View>
      </View>;
    })}
  </View>;
}

export function WeekdayExpenseChart({expenses}){
  const labels=['Pon','Uto','Sre','Čet','Pet','Sub','Ned'];
  const values=[0,0,0,0,0,0,0];
  expenses.forEach(item=>{
    const raw=String(item.date||'');
    const parts=raw.split('-').map(Number);
    if(parts.length!==3||!parts[0]||!parts[1]||!parts[2])return;
    const date=new Date(parts[0],parts[1]-1,parts[2]);
    const jsDay=date.getDay();
    const index=jsDay===0?6:jsDay-1;
    values[index]+=amountInRsd(item);
  });
  const max=Math.max(1,...values);
  const total=values.reduce((sum,value)=>sum+value,0);
  const peakIndex=values.indexOf(Math.max(...values));
  return <View style={s.chartCard}>
    <View style={s.chartHead}>
      <View>
        <Text style={s.chartTitle}>Potrošnja po danima</Text>
        <Text style={s.chartSubtitle}>Koji dani u nedelji nose najveće troškove</Text>
      </View>
      <View style={s.weekdayPeakBadge}>
        <Text style={s.weekdayPeakLabel}>Najviše</Text>
        <Text style={s.weekdayPeakValue}>{total?labels[peakIndex]:'—'}</Text>
      </View>
    </View>
    <View style={s.weekdayChart}>
      {values.map((value,index)=>{
        const height=Math.max(value?8:3,(value/max)*108);
        const isPeak=value===Math.max(...values)&&value>0;
        return <View key={labels[index]} style={s.weekdayGroup}>
          <View style={s.weekdayBarArea}>
            <View style={[s.weekdayBar,{height},isPeak&&s.weekdayBarPeak]}/>
          </View>
          <Text style={[s.weekdayLabel,isPeak&&s.weekdayLabelPeak]}>{labels[index]}</Text>
        </View>;
      })}
    </View>
    <View style={s.chartFooter}>
      <Text style={s.smallMuted}>Ukupno: {money(total)}</Text>
      <Text style={s.smallMuted}>Raspodela kroz celu istoriju</Text>
    </View>
  </View>;
}

export function CashFlowTrendChart({series}){
  const values=series.map(item=>item.monthBalance);
  const max=Math.max(1,...values.map(value=>Math.abs(value)));
  let running=0;
  const cumulative=series.map(item=>{
    running+=item.monthBalance;
    return {...item,cumulative:running};
  });
  const finalValue=cumulative[cumulative.length-1]?.cumulative||0;
  return <View style={s.chartCard}>
    <View style={s.chartHead}>
      <View>
        <Text style={s.chartTitle}>Trend novčanog toka</Text>
        <Text style={s.chartSubtitle}>Mesečni rezultat i kumulativni smer</Text>
      </View>
      <Text style={[s.cashFlowFinal,{color:finalValue>=0?COLORS.green:COLORS.red}]}>
        {finalValue>=0?'+':''}{money(finalValue)}
      </Text>
    </View>
    <View style={s.cashFlowRows}>
      {cumulative.map(item=>{
        const positive=item.monthBalance>=0;
        const width=Math.max(3,(Math.abs(item.monthBalance)/max)*100);
        return <View key={item.month} style={s.cashFlowRow}>
          <Text style={s.cashFlowMonth}>{monthName(item.month).split(' ')[0]}</Text>
          <View style={s.cashFlowTrack}>
            <View style={[
              s.cashFlowFill,
              {width:`${width}%`,backgroundColor:positive?COLORS.green:COLORS.red}
            ]}/>
          </View>
          <Text style={[s.cashFlowValue,{color:positive?COLORS.green:COLORS.red}]}>
            {positive?'+':''}{money(item.monthBalance)}
          </Text>
        </View>;
      })}
    </View>
    <View style={s.cashFlowCumulative}>
      <Text style={s.smallMuted}>Kumulativno za prikazani period</Text>
      <Text style={[s.cashFlowCumulativeValue,{color:finalValue>=0?COLORS.green:COLORS.red}]}>
        {finalValue>=0?'+':''}{money(finalValue)}
      </Text>
    </View>
  </View>;
}



export function calculateFinancialHealth({transactions,recurring,currentMonth}){
  const current=computeStats(transactions,currentMonth);
  const prevMonths=lastMonths(4).slice(0,3);
  const previousStats=prevMonths.map(month=>computeStats(transactions,month));

  const savingsRate=current.income>0?((current.income-current.expense)/current.income)*100:0;
  const expenseRatio=current.income>0?(current.expense/current.income)*100:100;

  const balances=[...previousStats.map(x=>x.monthBalance),current.monthBalance];
  const positiveMonths=balances.filter(x=>x>=0).length;
  const cashFlowStability=(positiveMonths/Math.max(1,balances.length))*100;

  const monthExpenses=transactions.filter(x=>x.type==='expense'&&monthKey(x.date)===currentMonth);
  const recurringExpenseTotal=monthExpenses
    .filter(x=>x.recurringId)
    .reduce((sum,x)=>sum+amountInRsd(x),0);
  const recurringShare=current.expense>0?(recurringExpenseTotal/current.expense)*100:0;

  let score=0;

  // 35 poena: stopa štednje.
  if(savingsRate>=30)score+=35;
  else if(savingsRate>=20)score+=30;
  else if(savingsRate>=10)score+=24;
  else if(savingsRate>=0)score+=16;
  else score+=4;

  // 30 poena: odnos troškova i prihoda.
  if(expenseRatio<=60)score+=30;
  else if(expenseRatio<=75)score+=25;
  else if(expenseRatio<=90)score+=18;
  else if(expenseRatio<=100)score+=10;
  else score+=2;

  // 20 poena: stabilnost cash flow-a.
  score+=Math.round((cashFlowStability/100)*20);

  // 15 poena: udeo recurring obaveza.
  if(recurringShare<=25)score+=15;
  else if(recurringShare<=40)score+=12;
  else if(recurringShare<=55)score+=8;
  else if(recurringShare<=70)score+=4;
  else score+=1;

  score=Math.max(0,Math.min(100,Math.round(score)));

  let label='Kritično';
  let tone='danger';
  if(score>=85){label='Odlično';tone='excellent'}
  else if(score>=70){label='Vrlo dobro';tone='good'}
  else if(score>=55){label='Solidno';tone='medium'}
  else if(score>=40){label='Potrebno poboljšanje';tone='warning'}

  const insights=[];

  if(current.income<=0){
    insights.push({type:'warning',text:'Nema evidentiranih prihoda u tekućem mesecu.'});
  }else{
    if(savingsRate>=20)insights.push({type:'positive',text:`Dobra stopa štednje: ${savingsRate.toFixed(0)}% prihoda.`});
    else if(savingsRate>=0)insights.push({type:'warning',text:`Stopa štednje je ${savingsRate.toFixed(0)}%; cilj od 20% bi poboljšao rezultat.`});
    else insights.push({type:'negative',text:'Troškovi su trenutno veći od prihoda.'});
  }

  if(expenseRatio<=80)insights.push({type:'positive',text:`Troškovi čine ${expenseRatio.toFixed(0)}% prihoda.`});
  else insights.push({type:'warning',text:`Troškovi koriste ${expenseRatio.toFixed(0)}% prihoda.`});

  if(cashFlowStability>=75)insights.push({type:'positive',text:`Pozitivan cash flow u ${positiveMonths}/${balances.length} poslednja posmatrana meseca.`});
  else insights.push({type:'warning',text:`Cash flow je pozitivan u ${positiveMonths}/${balances.length} posmatrana meseca.`});

  if(recurringShare<=40)insights.push({type:'positive',text:`Ponavljajući troškovi čine ${recurringShare.toFixed(0)}% mesečne potrošnje.`});
  else insights.push({type:'warning',text:`Ponavljajući troškovi čine ${recurringShare.toFixed(0)}% mesečne potrošnje.`});

  return {
    score,label,tone,
    savingsRate,expenseRatio,cashFlowStability,recurringShare,
    positiveMonths,totalMonths:balances.length,
    insights:insights.slice(0,4)
  };
}

export function FinancialHealthScore({transactions,recurring,currentMonth}){
  const health=calculateFinancialHealth({transactions,recurring,currentMonth});
  const toneColor=
    health.tone==='excellent'?COLORS.green:
    health.tone==='good'?COLORS.primary:
    health.tone==='medium'?COLORS.amber:
    health.tone==='warning'?'#D97706':COLORS.red;

  return <View style={s.healthCard}>
    <View style={s.healthHeader}>
      <View style={s.flex}>
        <Text style={s.healthEyebrow}>FINANCIAL HEALTH SCORE</Text>
        <Text style={s.healthTitle}>Finansijsko zdravlje</Text>
        <Text style={s.healthSubtitle}>Rezultat se automatski računa iz tvojih finansijskih navika</Text>
      </View>
      <View style={[s.healthScoreCircle,{borderColor:toneColor}]}>
        <Text style={[s.healthScoreNumber,{color:toneColor}]}>{health.score}</Text>
        <Text style={s.healthScoreMax}>/100</Text>
      </View>
    </View>

    <View style={s.healthStatusRow}>
      <View style={[s.healthStatusBadge,{backgroundColor:toneColor+'18'}]}>
        <Text style={[s.healthStatusText,{color:toneColor}]}>{health.label}</Text>
      </View>
      <Text style={s.healthStatusHint}>{monthName(currentMonth)}</Text>
    </View>

    <View style={s.healthProgressTrack}>
      <View style={[s.healthProgressFill,{width:`${health.score}%`,backgroundColor:toneColor}]}/>
    </View>

    <View style={s.healthFactorGrid}>
      <View style={s.healthFactorCard}>
        <Text style={s.healthFactorLabel}>STOPA ŠTEDNJE</Text>
        <Text style={[s.healthFactorValue,{color:health.savingsRate>=20?COLORS.green:health.savingsRate>=0?COLORS.amber:COLORS.red}]}>
          {health.savingsRate.toFixed(0)}%
        </Text>
        <Text style={s.healthFactorHint}>cilj ≥ 20%</Text>
      </View>

      <View style={s.healthFactorCard}>
        <Text style={s.healthFactorLabel}>TROŠKOVI / PRIHODI</Text>
        <Text style={[s.healthFactorValue,{color:health.expenseRatio<=80?COLORS.green:health.expenseRatio<=100?COLORS.amber:COLORS.red}]}>
          {health.expenseRatio.toFixed(0)}%
        </Text>
        <Text style={s.healthFactorHint}>niže je bolje</Text>
      </View>

      <View style={s.healthFactorCard}>
        <Text style={s.healthFactorLabel}>STABILNOST</Text>
        <Text style={s.healthFactorValue}>{health.cashFlowStability.toFixed(0)}%</Text>
        <Text style={s.healthFactorHint}>{health.positiveMonths}/{health.totalMonths} pozitivna meseca</Text>
      </View>

      <View style={s.healthFactorCard}>
        <Text style={s.healthFactorLabel}>RECURRING TROŠKOVI</Text>
        <Text style={[s.healthFactorValue,{color:health.recurringShare<=40?COLORS.green:COLORS.amber}]}>
          {health.recurringShare.toFixed(0)}%
        </Text>
        <Text style={s.healthFactorHint}>udeo potrošnje</Text>
      </View>
    </View>

    <View style={s.healthInsights}>
      <Text style={s.healthInsightsTitle}>Šta utiče na rezultat</Text>
      {health.insights.map((item,index)=>{
        const icon=item.type==='positive'?'✓':item.type==='negative'?'!':'•';
        const color=item.type==='positive'?COLORS.green:item.type==='negative'?COLORS.red:COLORS.amber;
        return <View key={`${item.text}-${index}`} style={s.healthInsightRow}>
          <View style={[s.healthInsightIcon,{backgroundColor:color+'18'}]}>
            <Text style={[s.healthInsightIconText,{color}]}>{icon}</Text>
          </View>
          <Text style={s.healthInsightText}>{item.text}</Text>
        </View>;
      })}
    </View>
  </View>;
}

export function AnalyticsHero({transactions,currentMonth}){
  const current=computeStats(transactions,currentMonth);
  const previous=computeStats(transactions,previousMonthKey(currentMonth));
  const incomeChange=percentChange(current.income,previous.income);
  const expenseChange=percentChange(current.expense,previous.expense);
  const balanceChange=percentChange(current.balance,previous.balance);
  const rate=savingsRateForStats(current);
  const expenseCount=transactions.filter(x=>x.type==='expense'&&monthKey(x.date)===currentMonth).length;
  const avgExpense=expenseCount?current.expense/expenseCount:0;

  const ChangeBadge=({change,invert=false})=>{
    const favorable=change.direction==='same'?null:invert?change.direction==='down':change.direction==='up';
    const color=favorable===null?COLORS.muted:favorable?COLORS.green:COLORS.red;
    return <View style={s.analyticsChangeBadge}>
      <Text style={[s.analyticsChangeArrow,{color}]}>{change.direction==='up'?'↑':change.direction==='down'?'↓':'→'}</Text>
      <Text style={[s.analyticsChangeText,{color}]}>{change.label}</Text>
    </View>;
  };

  return <View style={s.analyticsHero}>
    <View style={s.analyticsHeroTop}>
      <View style={s.flex}>
        <Text style={s.analyticsEyebrow}>FINANSIJSKI PULS</Text>
        <Text style={s.analyticsHeroTitle}>{monthName(currentMonth)}</Text>
        <Text style={s.analyticsHeroSub}>Detaljan pregled rezultata tekućeg meseca</Text>
      </View>
      <View style={[s.analyticsScoreBadge,{backgroundColor:current.balance>=0?'#E8F8EF':'#FFF0F0'}]}>
        <Text style={[s.analyticsScoreValue,{color:current.balance>=0?COLORS.green:COLORS.red}]}>
          {current.balance>=0?'PLUS':'MINUS'}
        </Text>
      </View>
    </View>

    <View style={s.analyticsHeroGrid}>
      <View style={s.analyticsHeroMetric}>
        <Text style={s.analyticsHeroMetricLabel}>PRIHODI</Text>
        <Text style={s.analyticsHeroMetricValue}>{money(current.income)}</Text>
        <ChangeBadge change={incomeChange}/>
      </View>
      <View style={s.analyticsHeroMetric}>
        <Text style={s.analyticsHeroMetricLabel}>TROŠKOVI</Text>
        <Text style={s.analyticsHeroMetricValue}>{money(current.expense)}</Text>
        <ChangeBadge change={expenseChange} invert/>
      </View>
      <View style={s.analyticsHeroMetric}>
        <Text style={s.analyticsHeroMetricLabel}>NETO</Text>
        <Text style={[s.analyticsHeroMetricValue,{color:current.balance>=0?COLORS.green:COLORS.red}]}>
          {current.balance>=0?'+':''}{money(current.balance)}
        </Text>
        <ChangeBadge change={balanceChange}/>
      </View>
      <View style={s.analyticsHeroMetric}>
        <Text style={s.analyticsHeroMetricLabel}>STOPA ŠTEDNJE</Text>
        <Text style={s.analyticsHeroMetricValue}>{rate.toFixed(0)}%</Text>
        <Text style={s.analyticsHeroMetricHint}>prosek troška {money(avgExpense)}</Text>
      </View>
    </View>
  </View>;
}

export function SavingsRateChart({series}){
  const values=series.map(item=>savingsRateForStats(item));
  const avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
  const best=Math.max(...values,0);
  return <View style={s.chartCard}>
    <View style={s.chartHead}>
      <View>
        <Text style={s.chartTitle}>Stopa štednje po mesecima</Text>
        <Text style={s.chartSubtitle}>Koliki procenat prihoda ostaje nakon troškova</Text>
      </View>
      <View style={s.savingsAverageBadge}>
        <Text style={s.savingsAverageLabel}>Prosek</Text>
        <Text style={s.savingsAverageValue}>{avg.toFixed(0)}%</Text>
      </View>
    </View>
    <View style={s.savingsRateRows}>
      {series.map((item,index)=>{
        const rate=values[index];
        const width=Math.min(100,Math.max(0,rate));
        const tone=rate>=20?COLORS.green:rate>=0?COLORS.amber:COLORS.red;
        return <View key={item.month} style={s.savingsRateRow}>
          <Text style={s.savingsRateMonth}>{monthName(item.month).split(' ')[0]}</Text>
          <View style={s.savingsRateTrack}>
            {rate>=0?<View style={[s.savingsRateFill,{width:`${Math.max(2,width)}%`,backgroundColor:tone}]}/>:null}
          </View>
          <Text style={[s.savingsRateValue,{color:tone}]}>{rate.toFixed(0)}%</Text>
        </View>;
      })}
    </View>
    <View style={s.savingsRateFooter}>
      <Text style={s.smallMuted}>Najbolja stopa u periodu</Text>
      <Text style={[s.bold,{color:best>=20?COLORS.green:COLORS.amber}]}>{best.toFixed(0)}%</Text>
    </View>
  </View>;
}

export function TopExpensesChart({transactions,currentMonth}){
  const items=transactions
    .filter(x=>x.type==='expense'&&monthKey(x.date)===currentMonth)
    .map(x=>({...x,value:amountInRsd(x)}))
    .sort((a,b)=>b.value-a.value)
    .slice(0,7);
  const max=Math.max(1,...items.map(x=>x.value));
  const total=items.reduce((sum,x)=>sum+x.value,0);
  if(!items.length)return <View style={s.chartCard}><Empty text="Nema troškova u tekućem mesecu."/></View>;
  return <View style={s.chartCard}>
    <View style={s.chartHead}>
      <View>
        <Text style={s.chartTitle}>Najveće pojedinačne potrošnje</Text>
        <Text style={s.chartSubtitle}>Top {items.length} transakcija u {monthName(currentMonth)}</Text>
      </View>
      <Text style={s.categoryTotal}>{money(total)}</Text>
    </View>
    {items.map((item,index)=><View key={item.id||`${item.title}-${index}`} style={s.topExpenseRow}>
      <View style={s.topExpenseRank}><Text style={s.topExpenseRankText}>{index+1}</Text></View>
      <View style={s.flex}>
        <View style={s.space}>
          <Text style={s.topExpenseTitle} numberOfLines={1}>{CATEGORY_ICONS[item.category]||'•'} {item.title||item.category}</Text>
          <Text style={s.topExpenseAmount}>{money(item.value)}</Text>
        </View>
        <View style={s.topExpenseMetaRow}>
          <Text style={s.topExpenseMeta}>{item.category}</Text>
          <Text style={s.topExpenseMeta}>{item.date||''}</Text>
        </View>
        <View style={s.topExpenseTrack}><View style={[s.topExpenseFill,{width:`${Math.max(4,item.value/max*100)}%`}]}/></View>
      </View>
    </View>)}
  </View>;
}

export function RecurringShareChart({transactions,currentMonth}){
  const expenses=transactions.filter(x=>x.type==='expense'&&monthKey(x.date)===currentMonth);
  const recurring=expenses.filter(x=>x.recurringId);
  const regular=expenses.filter(x=>!x.recurringId);
  const recurringTotal=recurring.reduce((s,x)=>s+amountInRsd(x),0);
  const regularTotal=regular.reduce((s,x)=>s+amountInRsd(x),0);
  const total=recurringTotal+regularTotal;
  const recurringShare=total?recurringTotal/total*100:0;
  return <View style={s.chartCard}>
    <View style={s.chartHead}>
      <View>
        <Text style={s.chartTitle}>Struktura mesečnih troškova</Text>
        <Text style={s.chartSubtitle}>Ponavljajući naspram ostalih troškova</Text>
      </View>
      <Text style={s.categoryTotal}>{money(total)}</Text>
    </View>
    <View style={s.recurringDonutFake}>
      <View style={s.recurringCenter}>
        <Text style={s.recurringCenterValue}>{recurringShare.toFixed(0)}%</Text>
        <Text style={s.recurringCenterLabel}>ponavljajuće</Text>
      </View>
    </View>
    <View style={s.recurringLegendGrid}>
      <View style={s.recurringLegendCard}>
        <View style={[s.legendDot,{backgroundColor:COLORS.primary}]}/>
        <Text style={s.recurringLegendLabel}>Ponavljajući</Text>
        <Text style={s.recurringLegendValue}>{money(recurringTotal)}</Text>
        <Text style={s.recurringLegendSub}>{recurring.length} transakcija</Text>
      </View>
      <View style={s.recurringLegendCard}>
        <View style={[s.legendDot,{backgroundColor:'#AAB8C8'}]}/>
        <Text style={s.recurringLegendLabel}>Ostali</Text>
        <Text style={s.recurringLegendValue}>{money(regularTotal)}</Text>
        <Text style={s.recurringLegendSub}>{regular.length} transakcija</Text>
      </View>
    </View>
    <View style={s.recurringStacked}>
      <View style={{flex:recurringTotal||0.0001,backgroundColor:COLORS.primary}}/>
      <View style={{flex:regularTotal||0.0001,backgroundColor:'#AAB8C8'}}/>
    </View>
  </View>;
}

export function MonthlyDetailTable({series}){
  if(!series.length)return null;
  return <View style={s.chartCard}>
    <View style={s.chartHead}>
      <View>
        <Text style={s.chartTitle}>Mesečna tabela rezultata</Text>
        <Text style={s.chartSubtitle}>Prihodi, troškovi, neto rezultat i stopa štednje</Text>
      </View>
    </View>
    <View style={s.detailTableHeader}>
      <Text style={[s.detailTableHeaderText,{flex:1.1,textAlign:'left'}]}>Mesec</Text>
      <Text style={s.detailTableHeaderText}>Prihodi</Text>
      <Text style={s.detailTableHeaderText}>Troškovi</Text>
      <Text style={s.detailTableHeaderText}>Neto</Text>
      <Text style={s.detailTableHeaderText}>Štednja</Text>
    </View>
    {series.map(item=>{
      const rate=savingsRateForStats(item);
      return <View key={item.month} style={s.detailTableRow}>
        <Text style={[s.detailTableMonth,{flex:1.1}]}>{monthName(item.month)}</Text>
        <Text style={[s.detailTableValue,{color:COLORS.green}]}>{compactMoney(item.income)}</Text>
        <Text style={[s.detailTableValue,{color:COLORS.red}]}>{compactMoney(item.expense)}</Text>
        <Text style={[s.detailTableValue,{color:item.monthBalance>=0?COLORS.green:COLORS.red}]}>{item.monthBalance>=0?'+':''}{compactMoney(item.monthBalance)}</Text>
        <Text style={[s.detailTableValue,{color:rate>=20?COLORS.green:rate>=0?COLORS.amber:COLORS.red}]}>{rate.toFixed(0)}%</Text>
      </View>;
    })}
  </View>;
}

export function recurringOccurrencesUntil(rule,endDate){
  if(!rule?.isActive||!rule?.nextRun)return [];
  const results=[];
  let next=rule.nextRun;
  let guard=0;
  const maxOccurrences=rule.maxOccurrences?Number(rule.maxOccurrences):null;
  let generated=Number(rule.generatedCount||0);

  while(next&&next<=endDate&&guard<100){
    if(rule.endDate&&next>rule.endDate)break;
    if(maxOccurrences&&generated>=maxOccurrences)break;
    results.push(next);
    generated+=1;
    next=addRecurringPeriod(next,rule.frequency);
    guard+=1;
  }
  return results;
}

export function remainingRecurringProjection(recurring){
  const today=isoToday();
  const now=new Date();
  const monthEnd=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(new Date(now.getFullYear(),now.getMonth()+1,0).getDate()).padStart(2,'0')}`;
  let income=0;
  let expense=0;
  let incomeCount=0;
  let expenseCount=0;

  (recurring||[]).forEach(rule=>{
    const occurrences=recurringOccurrencesUntil(rule,monthEnd).filter(date=>date>=today);
    if(!occurrences.length)return;
    const perOccurrence=amountInRsd(rule);
    const total=perOccurrence*occurrences.length;
    if(rule.type==='income'){
      income+=total;
      incomeCount+=occurrences.length;
    }else{
      expense+=total;
      expenseCount+=occurrences.length;
    }
  });

  return {income,expense,incomeCount,expenseCount,monthEnd};
}

export function purchaseSafetyProjection({transactions,recurring,goals,purchaseAmount}){
  const stats=computeStats(transactions,monthKey(isoToday()));
  const lockedSavings=(goals||[]).reduce((sum,goal)=>sum+goalSavedRsd(goal),0);
  const availableNow=stats.balance-lockedSavings;

  const recurringFuture=remainingRecurringProjection(recurring);
  const today=new Date();
  const daysInMonth=new Date(today.getFullYear(),today.getMonth()+1,0).getDate();
  const day=Math.max(1,today.getDate());
  const daysLeft=Math.max(0,daysInMonth-day);

  // Procena svakodnevne potrošnje se zasniva samo na već evidentiranim troškovima,
  // ali buduće recurring stavke se dodaju posebno da ne bi bile izgubljene iz projekcije.
  const dailyExpense=stats.expense/day;
  const projectedRemainingDailyExpense=dailyExpense*daysLeft;

  const expectedBeforePurchase=
    availableNow
    + recurringFuture.income
    - recurringFuture.expense
    - projectedRemainingDailyExpense;

  const afterPurchase=expectedBeforePurchase-Number(purchaseAmount||0);

  // Sigurnosna rezerva = 7 dana prosečne potrošnje.
  const safetyReserve=dailyExpense*7;
  const safeToSpend=Math.max(0,expectedBeforePurchase-safetyReserve);

  let status='safe';
  if(afterPurchase<0)status='danger';
  else if(afterPurchase<safetyReserve)status='warning';

  return {
    stats,
    lockedSavings,
    availableNow,
    recurringFuture,
    dailyExpense,
    daysLeft,
    projectedRemainingDailyExpense,
    expectedBeforePurchase,
    afterPurchase,
    safetyReserve,
    safeToSpend,
    status,
  };
}

export function monthPrediction(transactions){
  const today=new Date();
  const currentMonth=monthKey(isoToday());
  const stats=computeStats(transactions,currentMonth);
  const daysInMonth=new Date(today.getFullYear(),today.getMonth()+1,0).getDate();
  const day=Math.max(1,today.getDate());
  const daysLeft=Math.max(0,daysInMonth-day);
  const dailyExpense=stats.expense/day;
  const projectedExpense=dailyExpense*daysInMonth;
  const projectedBalance=stats.income-projectedExpense;
  return {...stats,day,daysInMonth,daysLeft,dailyExpense,projectedExpense,projectedBalance,progress:Math.min(100,(day/daysInMonth)*100)};
}

export function MonthPredictionHero({transactions}){
  const p=monthPrediction(transactions);
  const risk=p.projectedBalance<0;
  const noExpense=p.expense===0;
  const projectedSavingsRate=p.income>0?(p.projectedBalance/p.income)*100:0;
  return <View style={s.predictionHero}>
    <View style={s.predictionEyebrowRow}>
      <Text style={s.predictionEyebrow}>FINANSIJSKA PROGNOZA</Text>
      <View style={[s.predictionStatus,risk?s.predictionStatusRisk:s.predictionStatusGood]}>
        <Text style={[s.predictionStatusText,{color:risk?COLORS.red:COLORS.green}]}>{risk?'Rizik prekoračenja':'Stabilan tempo'}</Text>
      </View>
    </View>
    <Text style={s.predictionTitle}>{noExpense?'Još nema dovoljno podataka':`Očekivani troškovi: ${money(p.projectedExpense)}`}</Text>
    <Text style={s.predictionSubtitle}>{noExpense?'Dodaj troškove i projekcija će se automatski pojaviti.':`Procena na osnovu potrošnje u prvih ${p.day} dana ovog meseca.`}</Text>

    {!noExpense?<View style={s.predictionMainGrid}>
      <View style={s.predictionMainStat}><Text style={s.predictionMainLabel}>POTROŠENO DO SADA</Text><Text style={s.predictionMainValue}>{money(p.expense)}</Text><Text style={s.predictionMainHint}>{p.day}. dan meseca</Text></View>
      <View style={s.predictionMainDivider}/>
      <View style={s.predictionMainStat}><Text style={s.predictionMainLabel}>PROJEKCIJA DO KRAJA</Text><Text style={[s.predictionMainValue,{color:risk?COLORS.red:COLORS.primary}]}>{money(p.projectedExpense)}</Text><Text style={s.predictionMainHint}>još {p.daysLeft} dana</Text></View>
    </View>:null}

    {!noExpense?<View style={s.predictionTrackBox}>
      <View style={s.predictionTrackHeader}><Text style={s.predictionTrackLabel}>Tok meseca</Text><Text style={s.predictionTrackPercent}>{p.progress.toFixed(0)}%</Text></View>
      <View style={s.predictionTrack}><View style={[s.predictionTrackFill,{width:`${p.progress}%`}]} /></View>
      <View style={s.predictionTrackFooter}><Text style={s.predictionTrackFootText}>1. dan</Text><Text style={s.predictionTrackFootText}>{p.daysInMonth}. dan</Text></View>
    </View>:null}

    <View style={s.predictionCards}>
      <View style={s.predictionMiniCard}><Text style={s.predictionMiniIcon}>📅</Text><Text style={s.predictionMiniLabel}>Preostalo dana</Text><Text style={s.predictionMiniValue}>{p.daysLeft}</Text></View>
      <View style={s.predictionMiniCard}><Text style={s.predictionMiniIcon}>📉</Text><Text style={s.predictionMiniLabel}>Prosek dnevno</Text><Text style={s.predictionMiniValue}>{money(p.dailyExpense)}</Text></View>
      <View style={s.predictionMiniCard}><Text style={s.predictionMiniIcon}>{risk?'⚠️':'💰'}</Text><Text style={s.predictionMiniLabel}>Očekivani saldo</Text><Text style={[s.predictionMiniValue,{color:risk?COLORS.red:COLORS.green}]}>{money(p.projectedBalance)}</Text></View>
    </View>

    {!noExpense?<View style={[s.predictionInsight,risk?s.predictionInsightRisk:s.predictionInsightGood]}>
      <Text style={s.predictionInsightIcon}>{risk?'⚠️':'✓'}</Text>
      <View style={s.flex}><Text style={s.predictionInsightTitle}>{risk?'Troškovi mogu premašiti prihode':'Potrošnja je trenutno pod kontrolom'}</Text>
      <Text style={s.predictionInsightText}>{risk?`Ako nastaviš ovim tempom, očekivani saldo je ${money(p.projectedBalance)}.`:`Ako zadržiš tempo, očekivani saldo je ${money(p.projectedBalance)}, uz projektovanu stopu štednje ${projectedSavingsRate.toFixed(0)}%.`}</Text></View>
    </View>:null}
    <Text style={s.predictionDisclaimer}>Projekcija je informativna i zasniva se na prosečnoj dnevnoj potrošnji tekućeg meseca.</Text>
  </View>;
}

export function SmartPurchasePredictor({transactions,recurring,goals}){
  const [amount,setAmount]=useState('');
  const purchaseAmount=parseAmount(amount);
  const result=purchaseSafetyProjection({transactions,recurring,goals,purchaseAmount});

  const statusConfig=
    result.status==='danger'
      ? {label:'Nije preporučljivo',icon:'✕',color:COLORS.red,bg:'#FFF1F1',border:'#F2C7C7'}
      : result.status==='warning'
        ? {label:'Moguće, ali rizično',icon:'!',color:COLORS.amber,bg:'#FFF8E9',border:'#F1D9A3'}
        : {label:'Bezbedna kupovina',icon:'✓',color:COLORS.green,bg:'#ECF9F2',border:'#BFE7CF'};

  return <View style={s.purchasePredictor}>
    <View style={s.purchasePredictorHeader}>
      <View style={s.flex}>
        <Text style={s.purchasePredictorEyebrow}>SMART PURCHASE PREDICTOR</Text>
        <Text style={s.purchasePredictorTitle}>Koliko bezbedno možeš da potrošiš?</Text>
        <Text style={s.purchasePredictorSubtitle}>
          Računamo trenutno stanje, zaključanu štednju, očekivanu potrošnju i buduće ponavljajuće prilive i odlive do kraja meseca.
        </Text>
      </View>
    </View>

    <View style={s.purchaseAmountBox}>
      <Text style={s.purchaseAmountLabel}>Planirani iznos kupovine</Text>
      <View style={s.purchaseAmountInputRow}>
        <TextInput
          style={s.purchaseAmountInput}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={COLORS.muted}
        />
        <Text style={s.purchaseAmountCurrency}>RSD</Text>
      </View>
    </View>

    <View style={s.safeSpendHero}>
      <Text style={s.safeSpendLabel}>Maksimalno bezbedno za trošenje</Text>
      <Text style={s.safeSpendValue}>{money(result.safeToSpend)}</Text>
      <Text style={s.safeSpendHint}>
        uz sigurnosnu rezervu od približno {money(result.safetyReserve)}
      </Text>
    </View>

    <View style={s.purchaseFlowGrid}>
      <View style={s.purchaseFlowCard}>
        <Text style={s.purchaseFlowIcon}>💰</Text>
        <Text style={s.purchaseFlowLabel}>Dostupno sada</Text>
        <Text style={s.purchaseFlowValue}>{money(result.availableNow)}</Text>
      </View>
      <View style={s.purchaseFlowCard}>
        <Text style={s.purchaseFlowIcon}>↗</Text>
        <Text style={s.purchaseFlowLabel}>Budući prilivi</Text>
        <Text style={[s.purchaseFlowValue,{color:COLORS.green}]}>{money(result.recurringFuture.income)}</Text>
        <Text style={s.purchaseFlowSub}>{result.recurringFuture.incomeCount} ponavljanja</Text>
      </View>
      <View style={s.purchaseFlowCard}>
        <Text style={s.purchaseFlowIcon}>↘</Text>
        <Text style={s.purchaseFlowLabel}>Budući odlivi</Text>
        <Text style={[s.purchaseFlowValue,{color:COLORS.red}]}>{money(result.recurringFuture.expense)}</Text>
        <Text style={s.purchaseFlowSub}>{result.recurringFuture.expenseCount} ponavljanja</Text>
      </View>
    </View>

    <View style={s.purchaseCalculationBox}>
      <View style={s.purchaseCalcRow}>
        <Text style={s.purchaseCalcLabel}>Procena ostale dnevne potrošnje</Text>
        <Text style={s.purchaseCalcValue}>− {money(result.projectedRemainingDailyExpense)}</Text>
      </View>
      <View style={s.purchaseCalcRow}>
        <Text style={s.purchaseCalcLabel}>Očekivano stanje pre kupovine</Text>
        <Text style={s.purchaseCalcValue}>{money(result.expectedBeforePurchase)}</Text>
      </View>
      <View style={s.purchaseCalcDivider}/>
      <View style={s.purchaseCalcRow}>
        <Text style={s.purchaseCalcLabelStrong}>Nakon planirane kupovine</Text>
        <Text style={[s.purchaseCalcValueStrong,{color:result.afterPurchase>=0?COLORS.green:COLORS.red}]}>
          {money(result.afterPurchase)}
        </Text>
      </View>
    </View>

    {purchaseAmount>0?<View style={[s.purchaseVerdict,{backgroundColor:statusConfig.bg,borderColor:statusConfig.border}]}>
      <View style={[s.purchaseVerdictIcon,{backgroundColor:statusConfig.color}]}>
        <Text style={s.purchaseVerdictIconText}>{statusConfig.icon}</Text>
      </View>
      <View style={s.flex}>
        <Text style={[s.purchaseVerdictTitle,{color:statusConfig.color}]}>{statusConfig.label}</Text>
        <Text style={s.purchaseVerdictText}>
          {result.status==='danger'
            ? `Kupovina od ${money(purchaseAmount)} bi dovela do projektovanog negativnog stanja od ${money(result.afterPurchase)}.`
            : result.status==='warning'
              ? `Kupovina je moguća, ali bi ti ostalo manje od preporučene sigurnosne rezerve od ${money(result.safetyReserve)}.`
              : `Nakon kupovine bi ti prema projekciji ostalo ${money(result.afterPurchase)}, uz očuvanu sigurnosnu rezervu.`}
        </Text>
      </View>
    </View>:null}

    <Text style={s.purchasePredictorDisclaimer}>
      Procena je informativna. Ponavljajuće transakcije se računaju prema njihovom nextRun datumu i učestalosti do kraja tekućeg meseca.
    </Text>
  </View>;
}

export function MonthlyComparisonCard({transactions,currentMonth}){
  const previousMonth=previousMonthKey(currentMonth);
  const current=computeStats(transactions,currentMonth);
  const previous=computeStats(transactions,previousMonth);

  const currentSavingsRate=savingsRateForStats(current);
  const previousSavingsRate=savingsRateForStats(previous);

  const rows=[
    {label:'Prihodi',current:current.income,previous:previous.income,goodWhenUp:true},
    {label:'Troškovi',current:current.expense,previous:previous.expense,goodWhenUp:false},
    {label:'Neto rezultat',current:current.balance,previous:previous.balance,goodWhenUp:true},
  ];

  return <View style={s.monthCompareCard}>
    <View style={s.monthCompareHeader}>
      <View style={s.flex}>
        <Text style={s.chartTitle}>Poređenje meseci</Text>
        <Text style={s.chartSubtitle}>{monthName(currentMonth)} u odnosu na {monthName(previousMonth)}</Text>
      </View>
      <View style={s.monthCompareBadge}><Text style={s.monthCompareBadgeText}>MoM</Text></View>
    </View>

    <View style={s.monthCompareTableHeader}>
      <Text style={[s.monthCompareHeaderLabel,{flex:1.2,textAlign:'left'}]}>Pokazatelj</Text>
      <Text style={s.monthCompareHeaderLabel}>Prethodni</Text>
      <Text style={s.monthCompareHeaderLabel}>Tekući</Text>
      <Text style={s.monthCompareHeaderLabel}>Promena</Text>
    </View>

    {rows.map(row=>{
      const change=percentChange(row.current,row.previous);
      const favorable=change.direction==='same'
        ? null
        : row.goodWhenUp
          ? change.direction==='up'
          : change.direction==='down';
      const changeColor=favorable===null?COLORS.muted:favorable?COLORS.green:COLORS.red;

      return <View key={row.label} style={s.monthCompareRow}>
        <Text style={[s.monthCompareLabel,{flex:1.2}]}>{row.label}</Text>
        <Text style={s.monthCompareValue}>{money(row.previous)}</Text>
        <Text style={s.monthCompareValue}>{money(row.current)}</Text>
        <View style={s.monthCompareChangeWrap}>
          <Text style={[s.monthCompareArrow,{color:changeColor}]}>
            {change.direction==='up'?'↑':change.direction==='down'?'↓':'→'}
          </Text>
          <Text style={[s.monthCompareChange,{color:changeColor}]}>{change.label}</Text>
        </View>
      </View>;
    })}

    <View style={s.savingsCompareBox}>
      <View style={s.flex}>
        <Text style={s.savingsCompareLabel}>Stopa štednje</Text>
        <Text style={s.savingsCompareSub}>Koliki deo prihoda ostaje nakon troškova</Text>
      </View>
      <View style={s.savingsCompareRight}>
        <Text style={s.savingsCompareOld}>{previousSavingsRate.toFixed(0)}%</Text>
        <Text style={s.savingsCompareArrow}>→</Text>
        <Text style={[s.savingsCompareNew,{color:currentSavingsRate>=previousSavingsRate?COLORS.green:COLORS.red}]}>
          {currentSavingsRate.toFixed(0)}%
        </Text>
      </View>
    </View>

    <View style={s.monthCompareInsights}>
      <Text style={s.monthCompareInsightText}>• Prihodi: {comparisonMessage(current.income,previous.income)}</Text>
      <Text style={s.monthCompareInsightText}>• Troškovi: {comparisonMessage(current.expense,previous.expense)}</Text>
      <Text style={s.monthCompareInsightText}>• Neto rezultat: {comparisonMessage(current.balance,previous.balance)}</Text>
    </View>
  </View>;
}

export function Reports({transactions,recurring,goals}){
  const [period,setPeriod]=useState(6);
  const months=lastMonths(period);
  const months12=lastMonths(12);
  const currentMonth=monthKey(isoToday());
  const series=months.map(month=>({month,...computeStats(transactions,month)}));
  const series12=months12.map(month=>({month,...computeStats(transactions,month)}));
  const periodTransactions=transactions.filter(item=>months.includes(monthKey(item.date)));
  const expenses=periodTransactions.filter(item=>item.type==='expense');
  const incomes=periodTransactions.filter(item=>item.type==='income');
  const totalIncome=incomes.reduce((sum,item)=>sum+amountInRsd(item),0);
  const totalExpense=expenses.reduce((sum,item)=>sum+amountInRsd(item),0);
  const net=totalIncome-totalExpense;
  const savingsRate=totalIncome?((totalIncome-totalExpense)/totalIncome)*100:0;
  const averageExpense=series.reduce((sum,item)=>sum+item.expense,0)/Math.max(1,series.length);
  const averageIncome=series.reduce((sum,item)=>sum+item.income,0)/Math.max(1,series.length);
  const categoryEntries=Object.entries(categoryTotals(expenses)).sort((a,b)=>b[1]-a[1]);
  const topCategory=categoryEntries[0];
  const bestMonth=[...series].sort((a,b)=>b.monthBalance-a.monthBalance)[0];
  const worstMonth=[...series].sort((a,b)=>a.monthBalance-b.monthBalance)[0];
  const largestExpense=[...expenses].sort((a,b)=>amountInRsd(b)-amountInRsd(a))[0];
  const avgTransaction=expenses.length?totalExpense/expenses.length:0;

  return <Screen>
    <Header title="Izveštaji" subtitle="Detaljna vizuelna analiza tvojih finansija"/>

    <View style={s.reportPeriodHeader}>
      <View>
        <Text style={s.reportPeriodTitle}>Period analize</Text>
        <Text style={s.reportPeriodSubtitle}>Menja grafikone i zbirne pokazatelje</Text>
      </View>
      <PeriodSelector value={period} onChange={setPeriod}/>
    </View>

    <AnalyticsHero transactions={transactions} currentMonth={currentMonth}/>

    <SectionTitle title="Finansijsko zdravlje"/>
    <FinancialHealthScore transactions={transactions} recurring={recurring} currentMonth={currentMonth}/>

    <View style={s.reportMetricGrid}>
      <ReportMetric label={`Prihodi · ${period}M`} value={money(totalIncome)} tone="green" caption={`Prosek ${money(averageIncome)} mesečno`}/>
      <ReportMetric label={`Troškovi · ${period}M`} value={money(totalExpense)} tone="red" caption={`Prosek ${money(averageExpense)} mesečno`}/>
      <ReportMetric label="Neto rezultat" value={`${net>=0?'+':''}${money(net)}`} tone={net>=0?'blue':'red'} caption={`${period} meseci zajedno`}/>
      <ReportMetric label="Stopa štednje" value={`${Math.round(savingsRate)}%`} tone="amber" caption={`${expenses.length+incomes.length} transakcija u periodu`}/>
    </View>

    <SectionTitle title="Glavni finansijski grafikoni"/>
    <MonthlyColumnChart series={series}/>
    <SavingsRateChart series={series}/>
    <BalanceChart series={series}/>

    <SectionTitle title="Detaljna potrošnja"/>
    <CategoryDistributionChart expenses={expenses}/>
    <TopExpensesChart transactions={transactions} currentMonth={currentMonth}/>
    <RecurringShareChart transactions={transactions} currentMonth={currentMonth}/>
    <WeekdayExpenseChart expenses={expenses}/>

    <SectionTitle title="Dugoročni trend"/>
    <CashFlowTrendChart series={series12}/>
    <IncomeDistributionChart incomes={incomes}/>
    <MonthlyDetailTable series={series}/>

    <SectionTitle title="Predikcija i odluke"/>
    <MonthPredictionHero transactions={transactions}/>
    <SmartPurchasePredictor transactions={transactions} recurring={recurring} goals={goals}/>
    <MonthlyComparisonCard transactions={transactions} currentMonth={currentMonth}/>

    <SectionTitle title="Finansijski uvidi"/>
    <View style={s.insightGrid}>
      <View style={s.insightCard}><Text style={s.insightIcon}>◎</Text><Text style={s.insightLabel}>Prosečan mesečni trošak</Text><Text style={s.insightValue}>{money(averageExpense)}</Text><Text style={s.insightSub}>Po transakciji {money(avgTransaction)}</Text></View>
      <View style={s.insightCard}><Text style={s.insightIcon}>★</Text><Text style={s.insightLabel}>Najbolji mesec</Text><Text style={s.insightValue}>{bestMonth?monthName(bestMonth.month):'—'}</Text><Text style={[s.insightSub,{color:bestMonth?.monthBalance>=0?COLORS.green:COLORS.red}]}>{bestMonth?`${bestMonth.monthBalance>=0?'+':''}${money(bestMonth.monthBalance)}`:'Nema podataka'}</Text></View>
      <View style={s.insightCard}><Text style={s.insightIcon}>↓</Text><Text style={s.insightLabel}>Najslabiji mesec</Text><Text style={s.insightValue}>{worstMonth?monthName(worstMonth.month):'—'}</Text><Text style={[s.insightSub,{color:worstMonth?.monthBalance>=0?COLORS.green:COLORS.red}]}>{worstMonth?`${worstMonth.monthBalance>=0?'+':''}${money(worstMonth.monthBalance)}`:'Nema podataka'}</Text></View>
      <View style={s.insightCard}><Text style={s.insightIcon}>◆</Text><Text style={s.insightLabel}>Najveća pojedinačna potrošnja</Text><Text style={s.insightValue}>{largestExpense?money(amountInRsd(largestExpense)):'—'}</Text><Text style={s.insightSub}>{largestExpense?largestExpense.title||largestExpense.category:'Nema podataka'}</Text></View>
      <View style={[s.insightCard,{width:'100%'}]}><Text style={s.insightIcon}>▦</Text><Text style={s.insightLabel}>Najveća kategorija troškova u izabranom periodu</Text><Text style={s.insightValue}>{topCategory?`${CATEGORY_ICONS[topCategory[0]]||'•'} ${topCategory[0]}`:'Nema podataka'}</Text><Text style={s.insightSub}>{topCategory?`${money(topCategory[1])} · ${totalExpense?Math.round(topCategory[1]/totalExpense*100):0}% svih troškova`:'Dodaj troškove za analizu'}</Text></View>
    </View>
  </Screen>;
}

export function previousMonthKey(month){
  const [year,monthNumber]=String(month).split('-').map(Number);
  const date=new Date(year,monthNumber-2,1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

export function percentChange(current,previous){
  const c=Number(current||0);
  const p=Number(previous||0);
  if(p===0){
    if(c===0)return {value:0,label:'0%',direction:'same'};
    return {value:100,label:'novo',direction:c>0?'up':'down'};
  }
  const value=((c-p)/Math.abs(p))*100;
  return {
    value,
    label:`${Math.abs(value).toFixed(0)}%`,
    direction:value>0?'up':value<0?'down':'same'
  };
}

export function savingsRateForStats(stats){
  return stats.income>0?((stats.income-stats.expense)/stats.income)*100:0;
}

export function comparisonMessage(current,previous){
  if(previous===0&&current===0)return 'Bez promene';
  if(previous===0&&current!==0)return 'Novi rezultat';
  const change=((current-previous)/Math.abs(previous))*100;
  if(Math.abs(change)<0.5)return 'Skoro bez promene';
  return `${change>0?'Rast':'Pad'} od ${Math.abs(change).toFixed(0)}%`;
}

export function lastMonths(n){const a=[];const d=new Date();for(let i=n-1;i>=0;i--){const x=new Date(d.getFullYear(),d.getMonth()-i,1);a.push(`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`)}return a}

export function monthName(k){const [y,m]=k.split('-');const names=['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Avg','Sep','Okt','Nov','Dec'];return `${names[Number(m)-1]} ${y.slice(2)}`}

export function categoryTotals(tx){return tx.reduce((o,x)=>{o[x.category]=(o[x.category]||0)+amountInRsd(x);return o},{})}

export function CategoryBars({transactions}){const by=categoryTotals(transactions.filter(x=>x.type==='expense'));const list=Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,5);const max=Math.max(1,...list.map(x=>x[1]));return <View style={s.cardBlock}>{list.length?list.map(([k,v])=><View key={k} style={{marginBottom:12}}><View style={s.space}><Text style={s.smallBold}>{k}</Text><Text style={s.smallMuted}>{money(v)}</Text></View><View style={s.thinBar}><View style={[s.thinFill,{width:`${v/max*100}%`}]}/></View></View>):<Empty text="Nema troškova u ovom mesecu."/>}</View>}

