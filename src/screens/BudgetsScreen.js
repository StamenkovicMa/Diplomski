import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { s } from '../constants/styles';
import { money, percent, monthKey } from '../utils/helpers';
import { categoryTotals } from './ReportsScreen';
import { Screen, Header, Progress, Empty } from '../components/common';

export function Budgets({data,month,onAdd,onEdit,onDelete}){const spentBy=categoryTotals(data.transactions.filter(x=>x.type==='expense'&&monthKey(x.date)===month));const totalLimit=data.budgets.reduce((a,x)=>a+Number(x.limit),0);const totalSpent=data.budgets.reduce((a,x)=>a+(spentBy[x.category]||0),0);return <Screen><Header title="Budžeti" subtitle="Kontrola mesečne potrošnje" action="+ Budžet" onAction={onAdd}/>
  <View style={s.summary}><Text style={s.smallMuted}>Ukupno iskorišćeno</Text><Text style={s.summaryValue}>{money(totalSpent)} / {money(totalLimit)}</Text><Progress value={totalLimit?totalSpent/totalLimit:0}/></View>
  {data.budgets.length?data.budgets.map(b=>{const spent=spentBy[b.category]||0;const ratio=b.limit?spent/b.limit:0;return <Pressable key={b.id} style={s.cardBlock} onPress={()=>onEdit(b)} onLongPress={()=>onDelete(b.id)}><View style={s.space}><View><Text style={s.cardTitle}>{b.category}</Text><Text style={s.muted}>{money(spent)} potrošeno</Text></View><Text style={[s.bold,ratio>1&&{color:COLORS.red}]}>{percent(ratio*100)}</Text></View><Progress value={ratio} danger={ratio>1}/><View style={s.space}><Text style={s.smallMuted}>Preostalo</Text><Text style={s.smallBold}>{money(Math.max(0,b.limit-spent))}</Text></View></Pressable>}):<Empty text="Još nema budžeta."/>}
  <Text style={s.hint}>Dodirni budžet za izmenu. Zadrži prst za brisanje.</Text>
</Screen>}

