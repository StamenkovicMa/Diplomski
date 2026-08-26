import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { s } from '../constants/styles';
import { amountInRsd, displayMoney } from '../utils/finance';
import { dateLabel, isoToday, monthKey, money } from '../utils/helpers';
import { recurringLabel, daysUntilIso } from '../utils/recurring';
import { Screen, Header, SectionTitle, Empty } from '../components/common';

export function RecurringTransactions({data,onAdd,onEdit,onDelete,onToggle,onRunNow,onSkip}){
  const rules=[...(data.recurring||[])].sort((a,b)=>String(a.nextRun).localeCompare(String(b.nextRun)));
  const active=rules.filter(x=>x.isActive);
  const currentMonth=monthKey(isoToday());
  const recurringThisMonth=(data.transactions||[]).filter(
    x=>x.recurringId&&monthKey(x.date)===currentMonth
  );
  const monthIncome=recurringThisMonth
    .filter(x=>x.type==='income')
    .reduce((sum,x)=>sum+amountInRsd(x),0);
  const monthExpense=recurringThisMonth
    .filter(x=>x.type==='expense')
    .reduce((sum,x)=>sum+amountInRsd(x),0);
  const monthNet=monthIncome-monthExpense;
  return <Screen>
    <Header title="Ponavljajuće transakcije" subtitle={`${active.length} aktivnih od ${rules.length} pravila`} action="+ Dodaj" onAction={onAdd}/>
    <View style={s.recurringSummary}>
      <View><Text style={s.smallMuted}>Sledeće izvršavanje</Text><Text style={s.recurringSummaryValue}>{active[0]?.nextRun?dateLabel(active[0].nextRun):'Nema aktivnih'}</Text></View>
      <View style={s.recurringSummaryBadge}><Text style={s.recurringSummaryBadgeText}>{active.length} aktivnih</Text></View>
    </View>
    <SectionTitle title="Pregled za tekući mesec"/>
    <View style={s.recurringMonthGrid}>
      <View style={[s.recurringMonthCard,s.recurringMonthIncome]}>
        <Text style={s.recurringMonthLabel}>Prihodi</Text>
        <Text style={[s.recurringMonthValue,{color:COLORS.green}]}>{money(monthIncome)}</Text>
        <Text style={s.recurringMonthCaption}>
          {recurringThisMonth.filter(x=>x.type==='income').length} evidentiranih
        </Text>
      </View>
      <View style={[s.recurringMonthCard,s.recurringMonthExpense]}>
        <Text style={s.recurringMonthLabel}>Troškovi</Text>
        <Text style={[s.recurringMonthValue,{color:COLORS.red}]}>{money(monthExpense)}</Text>
        <Text style={s.recurringMonthCaption}>
          {recurringThisMonth.filter(x=>x.type==='expense').length} evidentiranih
        </Text>
      </View>
    </View>
    <View style={s.recurringNetCard}>
      <Text style={s.recurringMonthLabel}>Neto rezultat ponavljanja</Text>
      <Text style={[s.recurringNetValue,{color:monthNet>=0?COLORS.green:COLORS.red}]}>
        {monthNet>=0?'+':'−'}{money(Math.abs(monthNet))}
      </Text>
      <Text style={s.recurringMonthCaption}>
        Automatski kreirane ponavljajuće transakcije za {currentMonth}.
      </Text>
    </View>
    {rules.length?rules.map(rule=>{
      const days=daysUntilIso(rule.nextRun);
      const subtitle=!rule.isActive?'Pauzirano':days<0?'Dospelo':days===0?'Danas':days===1?'Sutra':`Za ${days} dana`;
      return <View key={rule.id} style={[s.recurringCard,!rule.isActive&&s.recurringPaused]}>
        <View style={s.space}>
          <View style={s.flex}><Text style={s.recurringTitle}>{rule.title}</Text><Text style={s.recurringMeta}>{recurringLabel(rule.frequency)} · sledeće {dateLabel(rule.nextRun)}</Text></View>
          <Text style={[s.recurringAmount,{color:rule.type==='income'?COLORS.green:COLORS.red}]}>{rule.type==='income'?'+':'−'}{displayMoney(rule.amount,rule.currency||'RSD')}</Text>
        </View>
        <View style={s.recurringStatusRow}><Text style={[s.recurringStatus,!rule.isActive&&{color:COLORS.muted}]}>{subtitle}</Text><Text style={s.smallMuted}>{rule.category}</Text></View>
        <View style={s.recurringActions}>
          <Pressable style={s.recurringAction} onPress={()=>onEdit(rule)}><Text style={s.recurringActionText}>Izmeni</Text></Pressable>
          <Pressable style={s.recurringAction} onPress={()=>onToggle(rule.id)}><Text style={s.recurringActionText}>{rule.isActive?'Pauziraj':'Aktiviraj'}</Text></Pressable>
          <Pressable style={s.recurringAction} onPress={()=>onRunNow(rule)}><Text style={s.recurringActionText}>Izvrši sada</Text></Pressable>
          {rule.isActive?<Pressable style={s.recurringAction} onPress={()=>onSkip(rule)}><Text style={s.recurringActionText}>Preskoči</Text></Pressable>:null}
          <Pressable style={[s.recurringAction,s.recurringDelete]} onPress={()=>onDelete(rule.id)}><Text style={[s.recurringActionText,{color:COLORS.red}]}>Obriši</Text></Pressable>
        </View>
      </View>
    }):<Empty text="Još nema ponavljajućih transakcija. Dodaj platu, kiriju, pretplatu ili ratu."/>}
    <Text style={s.hint}>Dospela pravila se automatski evidentiraju kada otvoriš aplikaciju. Već kreirane transakcije ostaju u istoriji.</Text>
  </Screen>;
}

