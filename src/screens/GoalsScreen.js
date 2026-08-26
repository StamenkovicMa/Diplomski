import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { s } from '../constants/styles';
import { goalSavedRsd, goalTargetRsd, displayMoney } from '../utils/finance';
import { money, percent, dateLabel } from '../utils/helpers';
import { Screen, Header, Progress, Empty } from '../components/common';

export function Goals({data,onAdd,onEdit,onDelete,onPurchase}){
  const totalRsd=data.goals.reduce((a,x)=>a+goalTargetRsd(x),0);
  const savedRsd=data.goals.reduce((a,x)=>a+goalSavedRsd(x),0);
  return <Screen>
    <Header
      title="Ciljevi štednje"
      subtitle="Ciljevi mogu biti u RSD, EUR ili USD"
      action="+ Cilj"
      onAction={onAdd}
    />
    <View style={s.summary}>
      <Text style={s.smallMuted}>Ukupni napredak — RSD protivvrednost</Text>
      <Text style={s.summaryValue}>{money(savedRsd)} / {money(totalRsd)}</Text>
      <Progress value={totalRsd?savedRsd/totalRsd:0}/>
    </View>

    {data.goals.length?data.goals.map(g=>{
      const currency=g.currency||'RSD';
      const r=Number(g.target)?Number(g.saved)/Number(g.target):0;
      const completed=Number(g.saved)>=Number(g.target);
      const remaining=Math.max(0,Number(g.target)-Number(g.saved));
      return <View key={g.id} style={[s.cardBlock,completed&&s.completedGoal]}>
        <Pressable onPress={()=>onEdit(g)} onLongPress={()=>onDelete(g.id)}>
          <View style={s.space}>
            <View style={s.flex}>
              <Text style={s.cardTitle}>{g.title}</Text>
              <Text style={s.muted}>Rok: {dateLabel(g.deadline)} · {currency}</Text>
            </View>
            <Text style={[s.bold,completed&&{color:COLORS.green}]}>
              {completed?'SPREMNO':percent(r*100)}
            </Text>
          </View>
          <Progress value={r}/>
          <View style={s.space}>
            <View>
              <Text style={s.smallMuted}>
                {displayMoney(g.saved,currency)} sačuvano
              </Text>
              {currency!=='RSD'?<Text style={s.currencyEquivalent}>
                ≈ {money(goalSavedRsd(g))}
              </Text>:null}
            </View>
            <Text style={s.smallBold}>
              {completed?'Cilj je ostvaren':'Još '+displayMoney(remaining,currency)}
            </Text>
          </View>
        </Pressable>

        {completed?<Pressable style={s.purchaseButton} onPress={()=>onPurchase(g)}>
          <Text style={s.purchaseButtonText}>
            Plati cilj · {displayMoney(g.target,currency)}
          </Text>
        </Pressable>:null}
      </View>
    }):<Empty text="Dodaj svoj prvi cilj štednje."/>}

    <Text style={s.hint}>
      🔒 Sačuvani iznos se zaključava prema RSD protivvrednosti. Kada dostigneš 100%,
      dugme „Plati cilj“ evidentira trošak u izabranoj valuti i uklanja završeni cilj.
    </Text>
  </Screen>;
}

