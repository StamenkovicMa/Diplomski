import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CATEGORIES } from '../constants/categories';
import { s } from '../constants/styles';
import { Screen, Header, Chip, TxRow, Empty } from '../components/common';

export function Transactions({data,onAdd,onEdit,onDelete}){const [q,setQ]=useState('');const [filter,setFilter]=useState('Sve');const [category,setCategory]=useState('Sve'); const items=useMemo(()=>[...data.transactions].filter(x=>filter==='Sve'||x.type===(filter==='Prihodi'?'income':'expense')).filter(x=>category==='Sve'||x.category===category).filter(x=>`${x.title} ${x.category} ${x.note}`.toLowerCase().includes(q.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date)),[data.transactions,q,filter,category]);return <Screen>
  <Header title="Transakcije" subtitle={`${items.length} prikazanih unosa`} action="+ Dodaj" onAction={onAdd}/>
  <TextInput style={s.search} value={q} onChangeText={setQ} placeholder="Pretraži naziv, kategoriju ili belešku" placeholderTextColor="#9AA6B2"/>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{['Sve','Prihodi','Troškovi'].map(x=><Chip key={x} text={x} active={filter===x} onPress={()=>setFilter(x)}/>)}</ScrollView>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{['Sve',...CATEGORIES].map(x=><Chip key={x} text={x} active={category===x} onPress={()=>setCategory(x)}/>)}</ScrollView>
  <View style={s.card}>{items.length?items.map((x,i)=><Pressable key={x.id} onPress={()=>onEdit(x)} onLongPress={()=>onDelete(x.id)}><TxRow item={x} last={i===items.length-1}/></Pressable>):<Empty text="Nema rezultata. Promeni filter ili dodaj novi unos."/>}</View>
  <Text style={s.hint}>Dodirni transakciju za izmenu. Zadrži prst za brisanje.</Text>
</Screen>}

