import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView,
  ScrollView, Share, StyleSheet, Text, TextInput, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { STORAGE_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from './config/supabase';
import {
  EXPENSE_GROUPS, INCOME_GROUPS, EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  CATEGORIES, CATEGORY_ICONS, CURRENCIES, DEFAULT_RATES,
} from './constants/categories';
import { COLORS } from './constants/theme';
import {
  transactionRate, amountInRsd, goalExchangeRate, goalSavedRsd,
  goalTargetRsd, displayMoney,
} from './utils/finance';
import { uid, isoToday, monthKey, parseAmount, money, percent, dateLabel } from './utils/helpers';
import {
  parseReceiptAmount, parseReceiptDate, suggestExpenseCategory,
  extractFiscalUrl, fetchFiscalReceipt,
} from './services/fiscalReceiptService';



const RECURRING_FREQUENCIES = [
  {code:'daily',label:'Dnevno'},
  {code:'weekly',label:'Nedeljno'},
  {code:'monthly',label:'Mesečno'},
  {code:'yearly',label:'Godišnje'},
];

function parseIsoDate(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  return new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));
}
function toIsoDate(date){return date.toISOString().slice(0,10)}
function daysInUtcMonth(year,monthIndex){return new Date(Date.UTC(year,monthIndex+1,0)).getUTCDate()}
function addRecurringPeriod(iso,frequency){
  const date=parseIsoDate(iso);
  if(!date)return isoToday();
  if(frequency==='daily')date.setUTCDate(date.getUTCDate()+1);
  else if(frequency==='weekly')date.setUTCDate(date.getUTCDate()+7);
  else if(frequency==='monthly'){
    const originalDay=date.getUTCDate();
    let year=date.getUTCFullYear();
    let month=date.getUTCMonth()+1;
    if(month>11){month=0;year+=1}
    date.setUTCFullYear(year,month,Math.min(originalDay,daysInUtcMonth(year,month)));
  }else if(frequency==='yearly'){
    const month=date.getUTCMonth();
    const day=date.getUTCDate();
    const year=date.getUTCFullYear()+1;
    date.setUTCFullYear(year,month,Math.min(day,daysInUtcMonth(year,month)));
  }
  return toIsoDate(date);
}
function recurringLabel(code){return RECURRING_FREQUENCIES.find(x=>x.code===code)?.label||code}
function daysUntilIso(iso){
  const target=parseIsoDate(iso),today=parseIsoDate(isoToday());
  if(!target||!today)return 0;
  return Math.ceil((target-today)/86400000);
}
function recurringTransactionFromRule(rule,occurrenceDate){
  return {
    id:uid('t'),
    type:rule.type,
    title:rule.title,
    category:rule.category,
    amount:Number(rule.amount||0),
    currency:rule.currency||'RSD',
    exchangeRate:Number(rule.exchangeRate||1),
    amountRsd:Number(rule.amountRsd||Number(rule.amount||0)*Number(rule.exchangeRate||1)),
    date:occurrenceDate,
    note:[rule.note,'Automatski kreirano iz ponavljajuće transakcije.'].filter(Boolean).join('\n'),
    recurringId:rule.id,
    recurringOccurrence:occurrenceDate,
  };
}
function applyDueRecurring(data,today=isoToday()){
  const rules=Array.isArray(data.recurring)?data.recurring:[];
  const transactions=Array.isArray(data.transactions)?[...data.transactions]:[];
  let changed=false;
  const nextRules=rules.map(original=>{
    let rule={...original};
    if(!rule.isActive)return rule;
    let nextRun=rule.nextRun||rule.startDate||today;
    let generated=Number(rule.generatedCount||0);
    let guard=0;
    while(nextRun<=today&&guard<60){
      guard+=1;
      if(rule.endDate&&nextRun>rule.endDate){rule.isActive=false;changed=true;break}
      if(rule.maxOccurrences&&generated>=Number(rule.maxOccurrences)){rule.isActive=false;changed=true;break}
      const exists=transactions.some(x=>x.recurringId===rule.id&&x.recurringOccurrence===nextRun);
      if(!exists){transactions.unshift(recurringTransactionFromRule(rule,nextRun));changed=true}
      generated+=1;
      nextRun=addRecurringPeriod(nextRun,rule.frequency);
      changed=true;
    }
    if(rule.endDate&&nextRun>rule.endDate)rule.isActive=false;
    if(rule.maxOccurrences&&generated>=Number(rule.maxOccurrences))rule.isActive=false;
    return {...rule,nextRun,generatedCount:generated,lastRun:generated?rule.lastRun||today:rule.lastRun};
  });
  return changed?{...data,transactions,recurring:nextRules}:data;
}

const EMPTY_DATA = {
  profile:{name:'Korisnik', monthlyIncomeGoal:0,baseCurrency:'RSD',rates:{RSD:1,EUR:117.2,USD:108.5}},
  transactions:[],
  budgets:[],
  goals:[],
  recurring:[],
};

const SAMPLE = EMPTY_DATA;

function MoneyMateApp({session,onLogout}){
  const [data,setData]=useState(EMPTY_DATA); const [ready,setReady]=useState(false); const [tab,setTab]=useState('Početna');
  const [txModal,setTxModal]=useState(false); const [editTx,setEditTx]=useState(null); const [scanOnOpen,setScanOnOpen]=useState(false); const [budgetModal,setBudgetModal]=useState(false);
  const [editBudget,setEditBudget]=useState(null); const [goalModal,setGoalModal]=useState(false); const [editGoal,setEditGoal]=useState(null);
  const [backupModal,setBackupModal]=useState(false);
  const [recurringModal,setRecurringModal]=useState(false); const [editRecurring,setEditRecurring]=useState(null);
  const [syncState,setSyncState]=useState('Učitavanje…');
  const syncTimer=useRef(null);
  const userId=session.user.id;
  const userCacheKey=`${STORAGE_KEY}_${userId}`;

  useEffect(()=>{
    let active=true;
    (async()=>{
      try{
        setSyncState('Učitavanje sa naloga…');
        const {data:row,error}=await supabase
          .from('user_finance_data')
          .select('app_data')
          .eq('user_id',userId)
          .maybeSingle();
        if(error) throw error;

        if(row?.app_data){
          if(active)setData({...EMPTY_DATA,...row.app_data,profile:{...EMPTY_DATA.profile,...(row.app_data.profile||{})},transactions:row.app_data.transactions||[],budgets:row.app_data.budgets||[],goals:row.app_data.goals||[],recurring:row.app_data.recurring||[]});
        }else{
          const cached=await AsyncStorage.getItem(userCacheKey);
          const initial=cached
            ? JSON.parse(cached)
            : {...EMPTY_DATA,profile:{...EMPTY_DATA.profile,name:session.user.user_metadata?.full_name||'Korisnik'}};
          if(active)setData({...EMPTY_DATA,...initial,profile:{...EMPTY_DATA.profile,...(initial.profile||{})},recurring:initial.recurring||[]});
          const {error:upsertError}=await supabase
            .from('user_finance_data')
            .upsert({user_id:userId,app_data:initial,updated_at:new Date().toISOString()},{onConflict:'user_id'});
          if(upsertError)throw upsertError;
        }
        if(active)setSyncState('Sinhronizovano');
      }catch(e){
        const cached=await AsyncStorage.getItem(userCacheKey).catch(()=>null);
        if(cached&&active){const parsed=JSON.parse(cached);setData({...EMPTY_DATA,...parsed,profile:{...EMPTY_DATA.profile,...(parsed.profile||{})},recurring:parsed.recurring||[]})}
        if(active)setSyncState('Lokalni režim');
        Alert.alert('Sinhronizacija nije uspela',e?.message||'Podaci će privremeno ostati sačuvani na uređaju.');
      }finally{
        if(active)setReady(true);
      }
    })();
    return()=>{active=false;if(syncTimer.current)clearTimeout(syncTimer.current)};
  },[userId]);

  useEffect(()=>{
    if(!ready)return;
    AsyncStorage.setItem(userCacheKey,JSON.stringify(data)).catch(()=>{});
    setSyncState('Čuvanje…');
    if(syncTimer.current)clearTimeout(syncTimer.current);
    syncTimer.current=setTimeout(async()=>{
      try{
        const {error}=await supabase
          .from('user_finance_data')
          .upsert({user_id:userId,app_data:data,updated_at:new Date().toISOString()},{onConflict:'user_id'});
        if(error)throw error;
        setSyncState('Sinhronizovano');
      }catch{
        setSyncState('Lokalno sačuvano');
      }
    },650);
    return()=>{if(syncTimer.current)clearTimeout(syncTimer.current)};
  },[data,ready,userCacheKey,userId]);
  useEffect(()=>{if(ready)setData(current=>applyDueRecurring(current))},[ready,userId]);
  const currentMonth=monthKey(isoToday());
  const stats=useMemo(()=>computeStats(data.transactions,currentMonth),[data.transactions,currentMonth]);
  const lockedSavings=useMemo(()=>data.goals.reduce((a,x)=>a+goalSavedRsd(x),0),[data.goals]);
  const availableBalance=stats.balance-lockedSavings;
  function saveTx(tx){
    const nextTransactions=editTx?data.transactions.map(x=>x.id===editTx.id?{...tx,id:x.id}:x):[{...tx,id:uid('t')},...data.transactions];
    const projected=computeStats(nextTransactions,currentMonth).balance;
    if(projected<lockedSavings){
      Alert.alert('Zaključana štednja','Ova promena bi zahvatila novac odvojen za ciljeve. Dostupno za trošenje je '+money(Math.max(0,availableBalance))+'.');
      return;
    }
    setData(d=>({...d,transactions:nextTransactions}));setTxModal(false);setEditTx(null);setScanOnOpen(false)
  }
  function removeTx(id){
    const nextTransactions=data.transactions.filter(x=>x.id!==id);
    const projected=computeStats(nextTransactions,currentMonth).balance;
    if(projected<lockedSavings){
      Alert.alert('Zaključana štednja','Ne možeš obrisati ovu transakciju jer bi stanje palo ispod iznosa zaključanog za ciljeve.');
      return;
    }
    confirmDelete('Obriši transakciju','Ovaj unos će biti trajno uklonjen.',()=>setData(d=>({...d,transactions:nextTransactions})))
  }
  function saveBudget(b){setData(d=>({...d,budgets:editBudget?d.budgets.map(x=>x.id===editBudget.id?{...b,id:x.id}:x):[...d.budgets,{...b,id:uid('b')}]}));setBudgetModal(false);setEditBudget(null)}
  function removeBudget(id){confirmDelete('Obriši budžet','Budžet će biti uklonjen.',()=>setData(d=>({...d,budgets:d.budgets.filter(x=>x.id!==id)})))}
  function saveGoal(g){
    const oldSavedRsd=editGoal?goalSavedRsd(editGoal):0;
    const otherLocked=lockedSavings-oldSavedRsd;
    const newSavedRsd=goalSavedRsd(g);
    if(otherLocked+newSavedRsd>stats.balance){
      Alert.alert(
        'Nema dovoljno dostupnog novca',
        'Možeš zaključati još najviše '+money(Math.max(0,stats.balance-otherLocked))+
        '. Smanji trenutno sačuvan iznos ili promeni kurs.'
      );
      return;
    }
    setData(d=>({
      ...d,
      goals:editGoal
        ? d.goals.map(x=>x.id===editGoal.id?{...g,id:x.id}:x)
        : [...d.goals,{...g,id:uid('g')}]
    }));
    setGoalModal(false);
    setEditGoal(null);
  }
  function removeGoal(id){confirmDelete('Obriši cilj','Cilj štednje će biti uklonjen.',()=>setData(d=>({...d,goals:d.goals.filter(x=>x.id!==id)})))}
  function purchaseGoal(goal){
    if(Number(goal.saved||0)<Number(goal.target||0)){
      Alert.alert(
        'Cilj još nije završen',
        'Opcija plaćanja postaje dostupna kada sačuvani iznos dostigne ceo ciljni iznos.'
      );
      return;
    }
    const currency=goal.currency||'RSD';
    const rate=goalExchangeRate(goal);
    const targetRsd=goalTargetRsd(goal);
    Alert.alert(
      'Plati cilj: '+goal.title,
      'Biće evidentiran trošak od '+displayMoney(goal.target,currency)+
      (currency!=='RSD'?' (≈ '+money(targetRsd)+')':'')+
      '. Cilj će zatim biti uklonjen iz aktivne štednje.',
      [
        {text:'Otkaži',style:'cancel'},
        {text:'Plati',style:'destructive',onPress:()=>setData(d=>({
          ...d,
          goals:d.goals.filter(x=>x.id!==goal.id),
          transactions:[{
            id:uid('t'),
            type:'expense',
            title:'Plaćen cilj: '+goal.title,
            category:'Kupovina',
            amount:Number(goal.target),
            currency,
            exchangeRate:rate,
            amountRsd:targetRsd,
            date:isoToday(),
            note:'Plaćeno iz zaključane štednje za cilj'
          },...d.transactions]
        }))}
      ]
    );
  }
  function saveRecurring(rule){
    const prepared={
      ...rule,
      amount:Number(rule.amount||0),
      exchangeRate:Number(rule.exchangeRate||1),
      amountRsd:Number(rule.amount||0)*Number(rule.exchangeRate||1),
      nextRun:editRecurring?.nextRun||rule.startDate,
      generatedCount:Number(editRecurring?.generatedCount||0),
      isActive:editRecurring?Boolean(editRecurring.isActive):true,
      createdAt:editRecurring?.createdAt||new Date().toISOString(),
    };
    setData(current=>{
      const recurring=editRecurring
        ? (current.recurring||[]).map(x=>x.id===editRecurring.id?{...prepared,id:x.id}:x)
        : [{...prepared,id:uid('r')},...(current.recurring||[])];
      return applyDueRecurring({...current,recurring});
    });
    setRecurringModal(false);setEditRecurring(null);
  }
  function removeRecurring(id){
    confirmDelete('Obriši ponavljanje','Buduće transakcije se više neće automatski kreirati. Već kreirane transakcije ostaju sačuvane.',()=>setData(d=>({...d,recurring:(d.recurring||[]).filter(x=>x.id!==id)})))
  }
  function toggleRecurring(id){
    setData(d=>({...d,recurring:(d.recurring||[]).map(x=>x.id===id?{...x,isActive:!x.isActive,nextRun:!x.isActive&&x.nextRun<isoToday()?isoToday():x.nextRun}:x)}))
  }
  function runRecurringNow(rule){
    const occurrence=isoToday();
    setData(d=>({...d,transactions:[recurringTransactionFromRule(rule,occurrence),...d.transactions],recurring:(d.recurring||[]).map(x=>x.id===rule.id?{...x,lastRun:occurrence}:x)}));
    Alert.alert('Transakcija je dodata',`${rule.title} je evidentirana za današnji datum.`);
  }
  function skipRecurring(rule){
    setData(d=>({...d,recurring:(d.recurring||[]).map(x=>x.id===rule.id?{...x,nextRun:addRecurringPeriod(x.nextRun||x.startDate,x.frequency)}:x)}));
  }
  if(!ready)return <SafeAreaView style={[s.safe,s.center]}><StatusBar style="dark"/><Text style={s.brand}>MoneyMate</Text><Text style={s.muted}>Učitavanje podataka…</Text></SafeAreaView>;
  return <SafeAreaView style={s.safe}><StatusBar style="dark"/><View style={s.app}>
    {tab==='Početna'&&<Dashboard data={data} stats={stats} lockedSavings={lockedSavings} availableBalance={availableBalance} onAdd={()=>{setScanOnOpen(false);setEditTx(null);setTxModal(true)}} onScan={()=>{setEditTx(null);setScanOnOpen(true);setTxModal(true)}} onTab={setTab}/>} 
    {tab==='Transakcije'&&<Transactions data={data} onAdd={()=>{setScanOnOpen(false);setEditTx(null);setTxModal(true)}} onEdit={x=>{setScanOnOpen(false);setEditTx(x);setTxModal(true)}} onDelete={removeTx}/>} 
    {tab==='Budžeti'&&<Budgets data={data} month={currentMonth} onAdd={()=>{setEditBudget(null);setBudgetModal(true)}} onEdit={x=>{setEditBudget(x);setBudgetModal(true)}} onDelete={removeBudget}/>} 
    {tab==='Ciljevi'&&<Goals data={data} onAdd={()=>{setEditGoal(null);setGoalModal(true)}} onEdit={x=>{setEditGoal(x);setGoalModal(true)}} onDelete={removeGoal} onPurchase={purchaseGoal}/>} 
    {tab==='Izveštaji'&&<Reports transactions={data.transactions} recurring={data.recurring} goals={data.goals}/>} 
    {tab==='Ponavljanja'&&<RecurringTransactions data={data} onAdd={()=>{setEditRecurring(null);setRecurringModal(true)}} onEdit={x=>{setEditRecurring(x);setRecurringModal(true)}} onDelete={removeRecurring} onToggle={toggleRecurring} onRunNow={runRecurringNow} onSkip={skipRecurring}/>} 
    {tab==='Podešavanja'&&<Settings data={data} setData={setData} onBackup={()=>setBackupModal(true)} onLogout={onLogout} email={session.user.email} syncState={syncState}/>} 
    <TabBar tab={tab} setTab={setTab}/>
  </View>
  <TransactionModal visible={txModal} initial={editTx} autoScan={scanOnOpen} onClose={()=>{setTxModal(false);setEditTx(null);setScanOnOpen(false)}} onSave={saveTx}/>
  <BudgetModal visible={budgetModal} initial={editBudget} onClose={()=>{setBudgetModal(false);setEditBudget(null)}} onSave={saveBudget}/>
  <GoalModal visible={goalModal} initial={editGoal} onClose={()=>{setGoalModal(false);setEditGoal(null)}} onSave={saveGoal}/>
  <RecurringModal visible={recurringModal} initial={editRecurring} onClose={()=>{setRecurringModal(false);setEditRecurring(null)}} onSave={saveRecurring}/>
  <BackupModal visible={backupModal} data={data} onClose={()=>setBackupModal(false)} onImport={x=>{setData(x);setBackupModal(false)}}/>
  </SafeAreaView>
}


export default function App(){
  const [session,setSession]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);

  useEffect(()=>{
    if(!supabase){setAuthLoading(false);return}
    supabase.auth.getSession().then(({data})=>{
      setSession(data.session);
      setAuthLoading(false);
    });
    const {data:listener}=supabase.auth.onAuthStateChange((_event,nextSession)=>{
      setSession(nextSession);
      setAuthLoading(false);
    });
    return()=>listener.subscription.unsubscribe();
  },[]);

  if(!supabase)return <SetupScreen/>;
  if(authLoading)return <SafeAreaView style={[s.safe,s.center]}><StatusBar style="dark"/><Text style={s.brand}>MoneyMate</Text><Text style={s.muted}>Provera korisničke sesije…</Text></SafeAreaView>;
  if(!session)return <AuthScreen/>;
  return <MoneyMateApp session={session} onLogout={async()=>{await supabase.auth.signOut()}}/>;
}

function SetupScreen(){
  return <SafeAreaView style={s.safe}><StatusBar style="dark"/><ScrollView contentContainerStyle={[s.screen,{flexGrow:1,justifyContent:'center'}]}><Text style={s.brand}>MoneyMate</Text><Text style={s.authTitle}>Poveži Supabase projekat</Text><Text style={s.authText}>U korenu projekta napravi .env fajl prema .env.example, unesi Supabase URL i anon key, pa ponovo pokreni Expo sa --clear.</Text><View style={s.cardBlock}><Text style={s.smallBold}>EXPO_PUBLIC_SUPABASE_URL</Text><Text style={[s.smallMuted,{marginTop:6}]}>https://tvoj-projekat.supabase.co</Text><Text style={[s.smallBold,{marginTop:16}]}>EXPO_PUBLIC_SUPABASE_ANON_KEY</Text><Text style={[s.smallMuted,{marginTop:6}]}>tvoj anon/publishable ključ</Text></View></ScrollView></SafeAreaView>;
}

function AuthScreen(){
  const [mode,setMode]=useState('login');
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [busy,setBusy]=useState(false);

  async function submit(){
    const cleanEmail=email.trim().toLowerCase();
    if(!cleanEmail||password.length<6){
      Alert.alert('Proveri podatke','Unesi ispravan email i lozinku od najmanje 6 karaktera.');
      return;
    }
    if(mode==='register'&&password!==confirm){
      Alert.alert('Lozinke se ne podudaraju','Ponovi unos lozinke.');
      return;
    }
    try{
      setBusy(true);
      if(mode==='register'){
        const {data,error}=await supabase.auth.signUp({
          email:cleanEmail,
          password,
          options:{data:{full_name:name.trim()||'Korisnik'}}
        });
        if(error)throw error;
        if(!data.session){
          Alert.alert('Registracija je uspešna','Proveri email i potvrdi nalog, a zatim se prijavi.');
          setMode('login');
        }
      }else{
        const {error}=await supabase.auth.signInWithPassword({email:cleanEmail,password});
        if(error)throw error;
      }
    }catch(e){
      Alert.alert(mode==='login'?'Prijava nije uspela':'Registracija nije uspela',e?.message||'Pokušaj ponovo.');
    }finally{
      setBusy(false);
    }
  }

  async function resetPassword(){
    const cleanEmail=email.trim().toLowerCase();
    if(!cleanEmail)return Alert.alert('Unesi email','Prvo unesi email adresu naloga.');
    try{
      const {error}=await supabase.auth.resetPasswordForEmail(cleanEmail);
      if(error)throw error;
      Alert.alert('Email je poslat','Proveri inbox za link za promenu lozinke.');
    }catch(e){Alert.alert('Greška',e?.message||'Email nije poslat.')}
  }

  return <SafeAreaView style={s.safe}><StatusBar style="dark"/><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.authScreen}><Text style={s.brand}>MoneyMate</Text><Text style={s.authTitle}>{mode==='login'?'Dobrodošao nazad':'Kreiraj svoj nalog'}</Text><Text style={s.authText}>{mode==='login'?'Prijavi se i pristupi samo svojim finansijama.':'Svaki korisnik dobija potpuno odvojene transakcije, budžete i ciljeve.'}</Text>{mode==='register'?<><Label text="Ime i prezime"/><TextInput style={s.input} value={name} onChangeText={setName} placeholder="Marko Marković"/></>:null}<Label text="Email"/><TextInput style={s.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="email@primer.com"/><Label text="Lozinka"/><TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Najmanje 6 karaktera"/>{mode==='register'?<><Label text="Potvrdi lozinku"/><TextInput style={s.input} value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Ponovi lozinku"/></>:null}<Primary text={busy?'Sačekaj…':mode==='login'?'Prijavi se':'Registruj se'} disabled={busy} onPress={submit}/>{mode==='login'?<Pressable onPress={resetPassword} style={{alignSelf:'center',padding:14}}><Text style={s.link}>Zaboravljena lozinka?</Text></Pressable>:null}<View style={s.authSwitch}><Text style={s.muted}>{mode==='login'?'Nemaš nalog?':'Već imaš nalog?'}</Text><Pressable onPress={()=>setMode(mode==='login'?'register':'login')}><Text style={s.link}>{mode==='login'?' Registruj se':' Prijavi se'}</Text></Pressable></View></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function computeStats(tx,month){
  const all=tx||[];
  const scoped=all.filter(x=>monthKey(x.date)===month);
  const sum=(items,type)=>items.filter(x=>x.type===type).reduce((a,x)=>a+amountInRsd(x),0);
  const income=sum(scoped,'income');
  const expense=sum(scoped,'expense');
  const totalIncome=sum(all,'income');
  const totalExpense=sum(all,'expense');
  return {income,expense,balance:totalIncome-totalExpense,monthBalance:income-expense,savingsRate:income?((income-expense)/income)*100:0};
}
function confirmDelete(title,msg,action){Alert.alert(title,msg,[{text:'Otkaži',style:'cancel'},{text:'Obriši',style:'destructive',onPress:action}])}

function Screen({children}){return <ScrollView style={s.flex} contentContainerStyle={s.screen} showsVerticalScrollIndicator={false}>{children}</ScrollView>}
function Header({title,subtitle,action,onAction}){return <View style={s.header}><View style={s.flex}><Text style={s.heading}>{title}</Text>{subtitle?<Text style={s.muted}>{subtitle}</Text>:null}</View>{onAction?<Pressable style={s.primarySmall} onPress={onAction}><Text style={s.primaryText}>{action}</Text></Pressable>:null}</View>}
function Dashboard({data,stats,lockedSavings,availableBalance,onAdd,onScan,onTab}){const latest=[...data.transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);const isEmpty=data.transactions.length===0&&data.budgets.length===0&&data.goals.length===0;return <Screen>
  <Header title={`Zdravo, ${data.profile.name || 'korisniče'}!`} subtitle="Pregled ličnih finansija" action="+ Unos" onAction={onAdd}/>
  {isEmpty?<View style={s.welcomeCard}><View style={s.welcomeIcon}><Text style={s.welcomeIconText}>₿</Text></View><Text style={s.welcomeTitle}>Dobrodošao u MoneyMate!</Text><Text style={s.welcomeText}>Tvoj nalog je spreman. Počni tako što ćeš evidentirati svoj prvi prihod.</Text><Pressable style={s.welcomeButton} onPress={onAdd}><Text style={s.welcomeButtonText}>＋ Dodaj prvi prihod</Text></Pressable></View>:null}
  <View style={s.hero}><Text style={s.heroLabel}>Dostupno za trošenje</Text><Text style={s.heroValue}>{money(availableBalance)}</Text><View style={s.lockedLine}><Text style={s.lockedLabel}>🔒 Zaključano za ciljeve</Text><Text style={s.lockedValue}>{money(lockedSavings)}</Text></View><View style={s.heroRow}><Metric label="Prihodi ovog meseca" value={money(stats.income)} good/><Metric label="Troškovi ovog meseca" value={money(stats.expense)}/></View></View>
  <View style={s.grid}><MiniCard label="Ukupno stanje" value={money(stats.balance)} accent={stats.balance>=0}/><MiniCard label="Mesečni saldo" value={money(stats.monthBalance)} accent={stats.monthBalance>=0}/></View><View style={s.grid}><MiniCard label="Zaključana štednja" value={money(lockedSavings)} accent/><MiniCard label="Stopa štednje" value={percent(stats.savingsRate)} accent={stats.savingsRate>=20}/></View>
  <SectionTitle title="Brze radnje"/><View style={s.quickRow}><Quick icon="＋" label="Transakcija" onPress={onAdd}/><Quick icon="◎" label="Budžeti" onPress={()=>onTab('Budžeti')}/><Quick icon="◆" label="Ciljevi" onPress={()=>onTab('Ciljevi')}/><Quick icon="▥" label="Izveštaji" onPress={()=>onTab('Izveštaji')}/></View><Pressable style={s.dashboardQrButton} onPress={onScan}><View style={s.dashboardQrIcon}><Text style={s.dashboardQrIconText}>▦</Text></View><View style={s.flex}><Text style={s.dashboardQrTitle}>Skeniraj fiskalni QR</Text><Text style={s.dashboardQrSubtitle}>Kamera čita QR sa računa i otvara automatski popunjenu transakciju.</Text></View><Text style={s.chevron}>›</Text></Pressable><Pressable style={s.recurringDashboardCard} onPress={()=>onTab('Ponavljanja')}><View style={s.recurringDashboardIcon}><Text style={s.recurringDashboardIconText}>↻</Text></View><View style={s.flex}><Text style={s.dashboardQrTitle}>Ponavljajuće transakcije</Text><Text style={s.dashboardQrSubtitle}>{(data.recurring||[]).filter(x=>x.isActive).length} aktivnih pravila · plata, kirija, pretplate i rate</Text></View><Text style={s.chevron}>›</Text></Pressable>
  <SectionTitle title="Potrošnja po kategoriji"/><CategoryBars transactions={data.transactions.filter(x=>monthKey(x.date)===monthKey(isoToday()))}/>
  <SectionTitle title="Poslednje transakcije" action="Sve" onAction={()=>onTab('Transakcije')}/><View style={s.card}>{latest.length?latest.map((x,i)=><TxRow key={x.id} item={x} last={i===latest.length-1}/>):<Empty text="Još nema transakcija. Dodaj svoj prvi prihod ili trošak."/>}</View>
</Screen>}
function Metric({label,value,good}){return <View style={s.metric}><Text style={s.heroMuted}>{label}</Text><Text style={[s.metricValue,good&&{color:'#7EF0B5'}]}>{value}</Text></View>}
function MiniCard({label,value,accent}){return <View style={s.miniCard}><Text style={s.smallMuted}>{label}</Text><Text style={[s.miniValue,accent&&{color:COLORS.green}]}>{value}</Text></View>}
function Quick({icon,label,onPress}){return <Pressable style={s.quick} onPress={onPress}><View style={s.quickIcon}><Text style={s.quickIconText}>{icon}</Text></View><Text style={s.quickText}>{label}</Text></Pressable>}
function SectionTitle({title,action,onAction}){return <View style={s.sectionHead}><Text style={s.sectionTitle}>{title}</Text>{action?<Pressable onPress={onAction}><Text style={s.link}>{action}</Text></Pressable>:null}</View>}

function Transactions({data,onAdd,onEdit,onDelete}){const [q,setQ]=useState('');const [filter,setFilter]=useState('Sve');const [category,setCategory]=useState('Sve'); const items=useMemo(()=>[...data.transactions].filter(x=>filter==='Sve'||x.type===(filter==='Prihodi'?'income':'expense')).filter(x=>category==='Sve'||x.category===category).filter(x=>`${x.title} ${x.category} ${x.note}`.toLowerCase().includes(q.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date)),[data.transactions,q,filter,category]);return <Screen>
  <Header title="Transakcije" subtitle={`${items.length} prikazanih unosa`} action="+ Dodaj" onAction={onAdd}/>
  <TextInput style={s.search} value={q} onChangeText={setQ} placeholder="Pretraži naziv, kategoriju ili belešku" placeholderTextColor="#9AA6B2"/>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{['Sve','Prihodi','Troškovi'].map(x=><Chip key={x} text={x} active={filter===x} onPress={()=>setFilter(x)}/>)}</ScrollView>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{['Sve',...CATEGORIES].map(x=><Chip key={x} text={x} active={category===x} onPress={()=>setCategory(x)}/>)}</ScrollView>
  <View style={s.card}>{items.length?items.map((x,i)=><Pressable key={x.id} onPress={()=>onEdit(x)} onLongPress={()=>onDelete(x.id)}><TxRow item={x} last={i===items.length-1}/></Pressable>):<Empty text="Nema rezultata. Promeni filter ili dodaj novi unos."/>}</View>
  <Text style={s.hint}>Dodirni transakciju za izmenu. Zadrži prst za brisanje.</Text>
</Screen>}
function Chip({text,active,onPress}){return <Pressable onPress={onPress} style={[s.chip,active&&s.chipActive]}><Text style={[s.chipText,active&&s.chipTextActive]}>{text}</Text></Pressable>}
function TxRow({item,last}){const income=item.type==='income';return <View style={[s.txRow,!last&&s.divider]}><View style={[s.txIcon,{backgroundColor:income?'#E7F8F0':'#FDECEC'}]}><Text style={{color:income?COLORS.green:COLORS.red,fontWeight:'900'}}>{income?'↗':'↘'}</Text></View><View style={s.flex}><Text style={s.txTitle}>{item.title}</Text><Text style={s.txMeta}>{item.category} · {dateLabel(item.date)}</Text>{item.currency&&item.currency!=='RSD'?<Text style={s.currencyEquivalent}>≈ {money(amountInRsd(item))}</Text>:null}{item.qrUrl?<Text style={s.qrBadge}>▦ Fiskalni QR učitan</Text>:null}</View><Text style={[s.txAmount,{color:income?COLORS.green:COLORS.red}]}>{income?'+':'−'}{displayMoney(item.amount,item.currency||'RSD')}</Text></View>}

function RecurringTransactions({data,onAdd,onEdit,onDelete,onToggle,onRunNow,onSkip}){
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

function RecurringModal({visible,initial,onClose,onSave}){
  const [type,setType]=useState('expense');
  const [title,setTitle]=useState('');
  const [category,setCategory]=useState('Namirnice');
  const [amount,setAmount]=useState('');
  const [currency,setCurrency]=useState('RSD');
  const [exchangeRate,setExchangeRate]=useState('1');
  const [frequency,setFrequency]=useState('monthly');
  const [startDate,setStartDate]=useState(isoToday());
  const [endDate,setEndDate]=useState('');
  const [maxOccurrences,setMaxOccurrences]=useState('');
  const [note,setNote]=useState('');

  useEffect(()=>{if(visible){
    const nextCurrency=initial?.currency||'RSD';
    setType(initial?.type||'expense');setTitle(initial?.title||'');
    setCategory(initial?.category||(initial?.type==='income'?'Plata':'Namirnice'));
    setAmount(initial?String(initial.amount):'');setCurrency(nextCurrency);
    setExchangeRate(String(initial?.exchangeRate||DEFAULT_RATES[nextCurrency]||1));
    setFrequency(initial?.frequency||'monthly');setStartDate(initial?.startDate||isoToday());
    setEndDate(initial?.endDate||'');setMaxOccurrences(initial?.maxOccurrences?String(initial.maxOccurrences):'');
    setNote(initial?.note||'');
  }},[visible,initial]);

  function changeType(value){setType(value);setCategory(value==='income'?'Plata':'Namirnice')}
  function changeCurrency(value){setCurrency(value);setExchangeRate(String(DEFAULT_RATES[value]||1))}
  function submit(){
    const value=parseAmount(amount),rate=currency==='RSD'?1:parseAmount(exchangeRate);
    if(!title.trim()||!value||!rate||!parseIsoDate(startDate))return Alert.alert('Proveri unos','Naziv, iznos, kurs i početni datum su obavezni.');
    if(endDate&&!parseIsoDate(endDate))return Alert.alert('Datum nije ispravan','Završni datum unesi kao GGGG-MM-DD.');
    if(endDate&&endDate<startDate)return Alert.alert('Datum nije ispravan','Završni datum mora biti posle početnog datuma.');
    onSave({type,title:title.trim(),category,amount:value,currency,exchangeRate:rate,frequency,startDate,endDate:endDate||null,maxOccurrences:parseAmount(maxOccurrences)||null,note:note.trim()});
  }

  return <ModalShell visible={visible} title={initial?'Izmeni ponavljanje':'Novo ponavljanje'} onClose={onClose}>
    <Label text="Tip transakcije"/><TypeSelector value={type} onChange={changeType}/>
    <Label text="Naziv"/><TextInput style={s.input} value={title} onChangeText={setTitle} placeholder={type==='income'?'npr. Mesečna plata':'npr. Kirija ili Netflix'}/>
    <Label text="Iznos"/><TextInput style={s.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0"/>
    <Label text="Valuta"/><View style={s.currencyRow}>{CURRENCIES.map(item=><Pressable key={item.code} onPress={()=>changeCurrency(item.code)} style={[s.currencyOption,currency===item.code&&s.currencyOptionActive]}><Text style={[s.currencyCode,currency===item.code&&s.currencyCodeActive]}>{item.code}</Text><Text style={[s.currencyLabel,currency===item.code&&s.currencyCodeActive]}>{item.label}</Text></Pressable>)}</View>
    {currency!=='RSD'?<><Label text={`Kurs: 1 ${currency} u RSD`}/><TextInput style={s.input} value={exchangeRate} onChangeText={setExchangeRate} keyboardType="decimal-pad"/></>:null}
    <Label text="Kategorija"/><CategorySelector type={type} value={category} onChange={setCategory}/>
    <Label text="Učestalost"/><View style={s.frequencyGrid}>{RECURRING_FREQUENCIES.map(item=><Pressable key={item.code} onPress={()=>setFrequency(item.code)} style={[s.frequencyOption,frequency===item.code&&s.frequencyActive]}><Text style={[s.frequencyText,frequency===item.code&&s.frequencyTextActive]}>{item.label}</Text></Pressable>)}</View>
    <Label text="Početni datum"/><TextInput style={s.input} value={startDate} onChangeText={setStartDate} autoCapitalize="none" placeholder="2026-08-04"/>
    <Label text="Završni datum (opciono)"/><TextInput style={s.input} value={endDate} onChangeText={setEndDate} autoCapitalize="none" placeholder="Ostavi prazno za bez kraja"/>
    <Label text="Maksimalan broj izvršavanja (opciono)"/><TextInput style={s.input} value={maxOccurrences} onChangeText={setMaxOccurrences} keyboardType="numeric" placeholder="npr. 12"/>
    <Label text="Beleška"/><TextInput style={[s.input,s.textarea]} value={note} onChangeText={setNote} multiline placeholder="Dodatne informacije"/>
    <Primary text={initial?'Sačuvaj izmene':'Dodaj ponavljanje'} onPress={submit}/>
  </ModalShell>;
}

function Budgets({data,month,onAdd,onEdit,onDelete}){const spentBy=categoryTotals(data.transactions.filter(x=>x.type==='expense'&&monthKey(x.date)===month));const totalLimit=data.budgets.reduce((a,x)=>a+Number(x.limit),0);const totalSpent=data.budgets.reduce((a,x)=>a+(spentBy[x.category]||0),0);return <Screen><Header title="Budžeti" subtitle="Kontrola mesečne potrošnje" action="+ Budžet" onAction={onAdd}/>
  <View style={s.summary}><Text style={s.smallMuted}>Ukupno iskorišćeno</Text><Text style={s.summaryValue}>{money(totalSpent)} / {money(totalLimit)}</Text><Progress value={totalLimit?totalSpent/totalLimit:0}/></View>
  {data.budgets.length?data.budgets.map(b=>{const spent=spentBy[b.category]||0;const ratio=b.limit?spent/b.limit:0;return <Pressable key={b.id} style={s.cardBlock} onPress={()=>onEdit(b)} onLongPress={()=>onDelete(b.id)}><View style={s.space}><View><Text style={s.cardTitle}>{b.category}</Text><Text style={s.muted}>{money(spent)} potrošeno</Text></View><Text style={[s.bold,ratio>1&&{color:COLORS.red}]}>{percent(ratio*100)}</Text></View><Progress value={ratio} danger={ratio>1}/><View style={s.space}><Text style={s.smallMuted}>Preostalo</Text><Text style={s.smallBold}>{money(Math.max(0,b.limit-spent))}</Text></View></Pressable>}):<Empty text="Još nema budžeta."/>}
  <Text style={s.hint}>Dodirni budžet za izmenu. Zadrži prst za brisanje.</Text>
</Screen>}
function Progress({value,danger}){return <View style={s.progress}><View style={[s.progressFill,{width:`${Math.min(100,Math.max(0,value*100))}%`,backgroundColor:danger?COLORS.red:COLORS.primary}]}/></View>}

function Goals({data,onAdd,onEdit,onDelete,onPurchase}){
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

function ReportMetric({label,value,tone='blue',caption}){
  const toneStyle=tone==='green'?s.reportMetricGreen:tone==='red'?s.reportMetricRed:tone==='amber'?s.reportMetricAmber:s.reportMetricBlue;
  return <View style={[s.reportMetric,toneStyle]}>
    <Text style={s.reportMetricLabel}>{label}</Text>
    <Text style={s.reportMetricValue}>{value}</Text>
    {caption?<Text style={s.reportMetricCaption}>{caption}</Text>:null}
  </View>;
}

function MonthlyColumnChart({series}){
  const max=Math.max(1,...series.flatMap(item=>[item.income,item.expense]));
  return <View style={s.chartCard}>
    <View style={s.chartHead}>
      <View><Text style={s.chartTitle}>Prihodi i troškovi</Text><Text style={s.chartSubtitle}>Poslednjih 6 meseci</Text></View>
      <View style={s.chartLegend}><View style={[s.legendDot,{backgroundColor:COLORS.green}]}/><Text style={s.chartLegendText}>Prihodi</Text><View style={[s.legendDot,{backgroundColor:COLORS.red}]}/><Text style={s.chartLegendText}>Troškovi</Text></View>
    </View>
    <View style={s.columnChart}>
      {series.map(item=>{
        const incomeHeight=Math.max(item.income?8:2,(item.income/max)*126);
        const expenseHeight=Math.max(item.expense?8:2,(item.expense/max)*126);
        return <View key={item.month} style={s.columnGroup}>
          <View style={s.columnValueArea}>
            <View style={[s.columnBar,s.incomeColumn,{height:incomeHeight}]}/>
            <View style={[s.columnBar,s.expenseColumn,{height:expenseHeight}]}/>
          </View>
          <Text style={s.columnMonth}>{monthName(item.month).split(' ')[0]}</Text>
        </View>;
      })}
    </View>
    <View style={s.chartAxis}/>
    <View style={s.chartFooter}><Text style={s.smallMuted}>Najviša vrednost: {money(max)}</Text><Text style={s.smallMuted}>Sve vrednosti su u RSD</Text></View>
  </View>;
}

function BalanceChart({series}){
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

function CategoryDistributionChart({expenses}){
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


function IncomeDistributionChart({incomes}){
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

function WeekdayExpenseChart({expenses}){
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

function CashFlowTrendChart({series}){
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




function recurringOccurrencesUntil(rule,endDate){
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

function remainingRecurringProjection(recurring){
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

function purchaseSafetyProjection({transactions,recurring,goals,purchaseAmount}){
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

function monthPrediction(transactions){
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

function MonthPredictionHero({transactions}){
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


function SmartPurchasePredictor({transactions,recurring,goals}){
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

function MonthlyComparisonCard({transactions,currentMonth}){
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

function Reports({transactions,recurring,goals}){
  const months=lastMonths(6);
  const months12=lastMonths(12);
  const currentMonth=monthKey(isoToday());
  const series=months.map(month=>({month,...computeStats(transactions,month)}));
  const series12=months12.map(month=>({month,...computeStats(transactions,month)}));
  const expenses=transactions.filter(item=>item.type==='expense');
  const incomes=transactions.filter(item=>item.type==='income');
  const totalIncome=incomes.reduce((sum,item)=>sum+amountInRsd(item),0);
  const totalExpense=expenses.reduce((sum,item)=>sum+amountInRsd(item),0);
  const net=totalIncome-totalExpense;
  const savingsRate=totalIncome?((totalIncome-totalExpense)/totalIncome)*100:0;
  const averageExpense=series.reduce((sum,item)=>sum+item.expense,0)/Math.max(1,series.length);
  const categoryEntries=Object.entries(categoryTotals(expenses)).sort((a,b)=>b[1]-a[1]);
  const topCategory=categoryEntries[0];
  const bestMonth=[...series].sort((a,b)=>b.monthBalance-a.monthBalance)[0];
  return <Screen>
    <Header title="Izveštaji" subtitle="Vizuelna analiza tvojih finansija"/>
    <View style={s.reportMetricGrid}>
      <ReportMetric label="Ukupni prihodi" value={money(totalIncome)} tone="green" caption={`${incomes.length} transakcija`}/>
      <ReportMetric label="Ukupni troškovi" value={money(totalExpense)} tone="red" caption={`${expenses.length} transakcija`}/>
      <ReportMetric label="Neto stanje" value={`${net>=0?'+':''}${money(net)}`} tone={net>=0?'blue':'red'} caption="Prihodi minus troškovi"/>
      <ReportMetric label="Stopa štednje" value={`${Math.round(savingsRate)}%`} tone="amber" caption="Udeo sačuvanog prihoda"/>
    </View>

    <SectionTitle title="Finansijska prognoza"/>
    <MonthPredictionHero transactions={transactions}/>

    <SectionTitle title="Pametna kupovina"/>
    <SmartPurchasePredictor transactions={transactions} recurring={recurring} goals={goals}/>

    <SectionTitle title="Mesečno poređenje"/>
    <MonthlyComparisonCard transactions={transactions} currentMonth={currentMonth}/>

    <SectionTitle title="Osnovni grafikoni"/>
    <MonthlyColumnChart series={series}/>
    <BalanceChart series={series}/>
    <CategoryDistributionChart expenses={expenses}/>

    <SectionTitle title="Napredna analiza"/>
    <CashFlowTrendChart series={series12}/>
    <WeekdayExpenseChart expenses={expenses}/>
    <IncomeDistributionChart incomes={incomes}/>

    <SectionTitle title="Finansijski uvidi"/>
    <View style={s.insightGrid}>
      <View style={s.insightCard}><Text style={s.insightIcon}>◎</Text><Text style={s.insightLabel}>Prosečan mesečni trošak</Text><Text style={s.insightValue}>{money(averageExpense)}</Text></View>
      <View style={s.insightCard}><Text style={s.insightIcon}>★</Text><Text style={s.insightLabel}>Najbolji mesec</Text><Text style={s.insightValue}>{bestMonth?monthName(bestMonth.month):'—'}</Text><Text style={[s.insightSub,{color:bestMonth?.monthBalance>=0?COLORS.green:COLORS.red}]}>{bestMonth?`${bestMonth.monthBalance>=0?'+':''}${money(bestMonth.monthBalance)}`:'Nema podataka'}</Text></View>
      <View style={[s.insightCard,{width:'100%'}]}><Text style={s.insightIcon}>▦</Text><Text style={s.insightLabel}>Najveća kategorija troškova</Text><Text style={s.insightValue}>{topCategory?`${CATEGORY_ICONS[topCategory[0]]||'•'} ${topCategory[0]}`:'Nema podataka'}</Text><Text style={s.insightSub}>{topCategory?money(topCategory[1]):'Dodaj troškove za analizu'}</Text></View>
    </View>
  </Screen>;
}

function previousMonthKey(month){
  const [year,monthNumber]=String(month).split('-').map(Number);
  const date=new Date(year,monthNumber-2,1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}
function percentChange(current,previous){
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
function savingsRateForStats(stats){
  return stats.income>0?((stats.income-stats.expense)/stats.income)*100:0;
}
function comparisonMessage(current,previous){
  if(previous===0&&current===0)return 'Bez promene';
  if(previous===0&&current!==0)return 'Novi rezultat';
  const change=((current-previous)/Math.abs(previous))*100;
  if(Math.abs(change)<0.5)return 'Skoro bez promene';
  return `${change>0?'Rast':'Pad'} od ${Math.abs(change).toFixed(0)}%`;
}

function lastMonths(n){const a=[];const d=new Date();for(let i=n-1;i>=0;i--){const x=new Date(d.getFullYear(),d.getMonth()-i,1);a.push(`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`)}return a}
function monthName(k){const [y,m]=k.split('-');const names=['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Avg','Sep','Okt','Nov','Dec'];return `${names[Number(m)-1]} ${y.slice(2)}`}
function categoryTotals(tx){return tx.reduce((o,x)=>{o[x.category]=(o[x.category]||0)+amountInRsd(x);return o},{})}
function CategoryBars({transactions}){const by=categoryTotals(transactions.filter(x=>x.type==='expense'));const list=Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,5);const max=Math.max(1,...list.map(x=>x[1]));return <View style={s.cardBlock}>{list.length?list.map(([k,v])=><View key={k} style={{marginBottom:12}}><View style={s.space}><Text style={s.smallBold}>{k}</Text><Text style={s.smallMuted}>{money(v)}</Text></View><View style={s.thinBar}><View style={[s.thinFill,{width:`${v/max*100}%`}]}/></View></View>):<Empty text="Nema troškova u ovom mesecu."/>}</View>}

function Settings({data,setData,onBackup,onLogout,email,syncState}){const [name,setName]=useState(data.profile.name||'');const [goal,setGoal]=useState(String(data.profile.monthlyIncomeGoal||''));function save(){setData(d=>({...d,profile:{...d.profile,name:name.trim()||'Korisnik',monthlyIncomeGoal:parseAmount(goal)}}));Alert.alert('Sačuvano','Podešavanja profila su sačuvana.')}function clearAll(){Alert.alert('Obriši sve finansijske podatke','Biće obrisane sve transakcije, budžeti i ciljevi trenutno prijavljenog korisnika. Korisnički nalog i ime ostaju sačuvani.',[{text:'Otkaži',style:'cancel'},{text:'Obriši sve',style:'destructive',onPress:()=>setData({profile:{...data.profile,name:name.trim()||data.profile.name||'Korisnik',monthlyIncomeGoal:0},transactions:[],budgets:[],goals:[],recurring:[]})}])}return <Screen><Header title="Podešavanja" subtitle="Profil, cloud nalog i podaci"/><SectionTitle title="Korisnički nalog"/><View style={s.cardBlock}><Text style={s.cardTitle}>{data.profile.name||'Korisnik'}</Text><Text style={[s.muted,{marginTop:6}]}>{email}</Text><Text style={[s.smallMuted,{marginTop:8}]}>Cloud status: {syncState}</Text></View><SectionTitle title="Profil"/><Label text="Ime"/><TextInput style={s.input} value={name} onChangeText={setName}/><Label text="Mesečni cilj prihoda (RSD)"/><TextInput style={s.input} value={goal} onChangeText={setGoal} keyboardType="numeric"/><Primary text="Sačuvaj profil" onPress={save}/><SectionTitle title="Podaci"/><View style={s.cardBlock}><SettingRow title="Backup i izvoz" subtitle="JSON backup, CSV izvoz i uvoz" onPress={onBackup}/><SettingRow title="Obriši sve finansijske podatke" subtitle="Vraća prihode, troškove, budžete i ciljeve na nulu" onPress={clearAll} danger/></View><SectionTitle title="Nalog"/><View style={s.cardBlock}><SettingRow title="Odjavi se" subtitle="Podaci ostaju sačuvani na tvom nalogu" onPress={onLogout} danger/></View><SectionTitle title="O aplikaciji"/><View style={s.cardBlock}><Text style={s.cardTitle}>MoneyMate 2.2.0</Text><Text style={[s.muted,{marginTop:8,lineHeight:20}]}>Novi korisnički nalog počinje sa praznim finansijama. Svaki korisnik vidi isključivo svoje podatke.</Text></View></Screen>}
function SettingRow({title,subtitle,onPress,danger}){return <Pressable style={[s.settingRow,s.divider]} onPress={onPress}><View style={s.flex}><Text style={[s.smallBold,danger&&{color:COLORS.red}]}>{title}</Text><Text style={s.smallMuted}>{subtitle}</Text></View><Text style={s.chevron}>›</Text></Pressable>}

function TabBar({tab,setTab}){const tabs=[['Početna','⌂'],['Transakcije','↕'],['Budžeti','▣'],['Ciljevi','◆'],['Izveštaji','▥'],['Podešavanja','⚙']];return <View style={s.tabBar}>{tabs.map(([name,icon])=><Pressable key={name} style={s.tab} onPress={()=>setTab(name)}><Text style={[s.tabIcon,tab===name&&s.active]}>{icon}</Text><Text numberOfLines={1} style={[s.tabLabel,tab===name&&s.active]}>{name==='Transakcije'?'Unosi':name==='Podešavanja'?'Opcije':name}</Text></Pressable>)}</View>}

function ModalShell({visible,title,onClose,children}){return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={s.modalSafe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}><View style={s.modalHead}><Pressable onPress={onClose}><Text style={s.link}>Otkaži</Text></Pressable><Text style={s.modalTitle}>{title}</Text><View style={{width:54}}/></View><ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">{children}</ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>}
function Label({text}){return <Text style={s.label}>{text}</Text>}
function Primary({text,onPress,disabled}){return <Pressable disabled={disabled} style={[s.primary,disabled&&{opacity:.45}]} onPress={onPress}><Text style={s.primaryText}>{text}</Text></Pressable>}
function PickerRow({items,value,onChange}){return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{items.map(x=><Chip key={x} text={x} active={value===x} onPress={()=>onChange(x)}/>)}</ScrollView>}
function TypeSelector({value,onChange}){return <View style={s.typeSelector}><Pressable style={[s.typeOption,value==='expense'&&s.typeExpenseActive]} onPress={()=>onChange('expense')}><Text style={s.typeEmoji}>↘</Text><View><Text style={[s.typeOptionTitle,value==='expense'&&s.typeActiveText]}>Trošak</Text><Text style={[s.typeOptionSub,value==='expense'&&s.typeActiveSub]}>Novac koji izlazi</Text></View></Pressable><Pressable style={[s.typeOption,value==='income'&&s.typeIncomeActive]} onPress={()=>onChange('income')}><Text style={s.typeEmoji}>↗</Text><View><Text style={[s.typeOptionTitle,value==='income'&&s.typeActiveText]}>Prihod</Text><Text style={[s.typeOptionSub,value==='income'&&s.typeActiveSub]}>Novac koji dolazi</Text></View></Pressable></View>}
function CategorySelector({type,value,onChange}){
  const groups=type==='income'?INCOME_GROUPS:EXPENSE_GROUPS;
  const groupForValue=groups.find(group=>group.items.includes(value));
  const [selectedGroup,setSelectedGroup]=useState(groupForValue?.title||groups[0].title);
  const [query,setQuery]=useState('');

  useEffect(()=>{
    const nextGroups=type==='income'?INCOME_GROUPS:EXPENSE_GROUPS;
    const matching=nextGroups.find(group=>group.items.includes(value));
    setSelectedGroup(matching?.title||nextGroups[0].title);
    setQuery('');
  },[type,value]);

  const activeGroup=groups.find(group=>group.title===selectedGroup)||groups[0];
  const normalized=query.trim().toLowerCase();
  const searchResults=normalized
    ? groups.flatMap(group=>group.items.map(item=>({item,group})))
        .filter(entry=>entry.item.toLowerCase().includes(normalized)||entry.group.title.toLowerCase().includes(normalized))
    : [];

  function choose(item,group){
    setSelectedGroup(group.title);
    onChange(item);
    setQuery('');
  }

  return <View>
    <TextInput
      style={s.categorySearch}
      value={query}
      onChangeText={setQuery}
      placeholder="Pretraži sve kategorije…"
      placeholderTextColor={COLORS.muted}
    />

    {normalized ? <View style={s.categoryGroup}>
      <Text style={s.categoryGroupTitle}>Rezultati pretrage</Text>
      <View style={s.categoryGrid}>
        {searchResults.map(({item,group})=>{
          const active=value===item;
          return <Pressable key={`${group.title}-${item}`} onPress={()=>choose(item,group)} style={[s.categoryCard,active&&(type==='income'?s.categoryIncomeActive:s.categoryExpenseActive)]}>
            <Text style={s.categoryIcon}>{CATEGORY_ICONS[item]||'•'}</Text>
            <Text numberOfLines={2} style={[s.categoryName,active&&s.categoryNameActive]}>{item}</Text>
            <Text numberOfLines={1} style={[s.categoryParent,active&&s.categoryNameActive]}>{group.title}</Text>
            {active?<Text style={s.categoryCheck}>✓</Text>:null}
          </Pressable>
        })}
      </View>
      {!searchResults.length?<Empty text="Nema kategorija koje odgovaraju pretrazi."/>:null}
    </View> : <>
      <Text style={s.categoryStepTitle}>1. Izaberi oblast</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.groupSelectorRow}>
        {groups.map(group=>{
          const active=group.title===activeGroup.title;
          return <Pressable key={group.title} onPress={()=>setSelectedGroup(group.title)} style={[s.groupSelectorCard,active&&(type==='income'?s.groupIncomeActive:s.groupExpenseActive)]}>
            <Text style={s.groupSelectorIcon}>{group.icon}</Text>
            <Text style={[s.groupSelectorName,active&&s.categoryNameActive]}>{group.title}</Text>
          </Pressable>
        })}
      </ScrollView>

      <View style={s.selectedGroupHeader}>
        <View style={s.selectedGroupIcon}><Text style={s.selectedGroupIconText}>{activeGroup.icon}</Text></View>
        <View style={{flex:1}}>
          <Text style={s.categoryStepTitle}>2. Izaberi kategoriju</Text>
          <Text style={s.selectedGroupName}>{activeGroup.title}</Text>
        </View>
      </View>

      <View style={s.categoryGrid}>
        {activeGroup.items.map(item=>{
          const active=value===item;
          return <Pressable key={item} onPress={()=>onChange(item)} style={[s.categoryCard,active&&(type==='income'?s.categoryIncomeActive:s.categoryExpenseActive)]}>
            <Text style={s.categoryIcon}>{CATEGORY_ICONS[item]||'•'}</Text>
            <Text numberOfLines={2} style={[s.categoryName,active&&s.categoryNameActive]}>{item}</Text>
            {active?<Text style={s.categoryCheck}>✓</Text>:null}
          </Pressable>
        })}
      </View>
    </>}
  </View>
}

function TransactionModal({visible,initial,autoScan,onClose,onSave}){
  const [type,setType]=useState('expense');
  const [title,setTitle]=useState('');
  const [category,setCategory]=useState('Namirnice');
  const [amount,setAmount]=useState('');
  const [currency,setCurrency]=useState('RSD');
  const [exchangeRate,setExchangeRate]=useState('1');
  const [date,setDate]=useState(isoToday());
  const [note,setNote]=useState('');
  const [scannerVisible,setScannerVisible]=useState(false);
  const [qrBusy,setQrBusy]=useState(false);
  const [qrUrl,setQrUrl]=useState('');
  const [invoiceNumber,setInvoiceNumber]=useState('');
  const [qrResult,setQrResult]=useState(null);
  const [manualQrValue,setManualQrValue]=useState('');

  useEffect(()=>{
    if(visible){
      const nextCurrency=initial?.currency||'RSD';
      setType(initial?.type||'expense');
      setTitle(initial?.title||'');
      setCategory(initial?.category||(initial?.type==='income'?'Plata':'Namirnice'));
      setAmount(initial?String(initial.amount):'');
      setCurrency(nextCurrency);
      setExchangeRate(String(initial?.exchangeRate||DEFAULT_RATES[nextCurrency]||1));
      setDate(initial?.date||isoToday());
      setNote(initial?.note||'');
      setQrUrl(initial?.qrUrl||'');
      setInvoiceNumber(initial?.invoiceNumber||'');
      setQrResult(null);
      setManualQrValue(initial?.qrUrl||'');
      setQrBusy(false);
      setScannerVisible(false);
    }
  },[visible,initial]);

  useEffect(()=>{
    if(visible&&autoScan){
      const timer=setTimeout(()=>setScannerVisible(true),350);
      return()=>clearTimeout(timer);
    }
  },[visible,autoScan]);

  const cats=type==='income'?INCOME_CATEGORIES:EXPENSE_CATEGORIES;

  function changeType(x){
    setType(x);
    setCategory(x==='income'?'Plata':'Namirnice');
  }
  function changeCurrency(code){
    setCurrency(code);
    setExchangeRate(String(DEFAULT_RATES[code]||1));
  }


  async function handleQrScanned(value){
    setScannerVisible(false);
    setQrBusy(true);
    setType('expense');
    setCurrency('RSD');
    setExchangeRate('1');
    const normalizedInput=String(value||'').trim();
    setQrUrl(normalizedInput);
    setManualQrValue(normalizedInput);
    setQrResult({type:'loading',title:'Učitavanje računa',message:'Preuzimanje i obrada fiskalnih podataka…'});

    try{
      const receipt=await fetchFiscalReceipt(String(value||'').trim());

      setTitle(receipt.merchantName||receipt.merchant||'Fiskalni račun');
      if(Number(receipt.totalAmount)>0)setAmount(String(receipt.totalAmount));
      setDate(receipt.date||isoToday());
      setInvoiceNumber(receipt.invoiceNumber||'');
      setCategory(suggestExpenseCategory(receipt.merchantName||receipt.merchant));

      const itemLines=Array.isArray(receipt.items)
        ? receipt.items.slice(0,12).map(item=>{
            const name=item.name||item.description||'Stavka';
            const quantity=item.quantity?` x${item.quantity}`:'';
            const total=Number(item.total||item.amount||0);
            return `• ${name}${quantity}${total?` — ${displayMoney(total,'RSD')}`:''}`;
          })
        : [];

      const details=[
        receipt.invoiceNumber?`Broj računa: ${receipt.invoiceNumber}`:'',
        receipt.merchantCompany?`Preduzeće: ${receipt.merchantCompany}`:'',
        receipt.merchantTaxId?`PIB: ${receipt.merchantTaxId}`:'',
        receipt.address?`Adresa: ${receipt.address}${receipt.city?`, ${receipt.city}`:''}`:'',
        receipt.municipality?`Opština: ${receipt.municipality}`:'',
        receipt.transactionType?`Vrsta prometa: ${receipt.transactionType}`:'',
        receipt.dateTime?`Datum i vreme: ${receipt.dateTime}`:'',
        receipt.paymentMethod?`Način plaćanja: ${receipt.paymentMethod}`:'',
        receipt.totalTax?`Porez: ${displayMoney(receipt.totalTax,'RSD')}`:'',
        itemLines.length?`Stavke:\n${itemLines.join('\n')}`:'',
        `Fiskalni QR: ${receipt.qrUrl}`
      ].filter(Boolean).join('\n');

      setNote(current=>current ? `${current}\n${details}` : details);

      setQrResult({
        type:'success',
        title:'Račun je učitan',
        message:[
          Number(receipt.totalAmount)>0
            ? `Iznos: ${displayMoney(receipt.totalAmount,'RSD')}`
            : 'Iznos nije pronađen.',
          receipt.merchantName||receipt.merchant
            ? `Prodavac: ${receipt.merchantName||receipt.merchant}`
            : 'Prodavac nije pronađen.',
          Array.isArray(receipt.items)&&receipt.items.length
            ? `Prepoznato stavki: ${receipt.items.length}`
            : 'Račun nema dostupnu listu stavki ili je u pitanju usluga.',
          'Proveri podatke pre čuvanja.'
        ].join('\n')
      });
    }catch(e){
      setTitle(current=>current||'Fiskalni račun');
      setDate(current=>current||isoToday());
      setNote(current=>current
        ? `${current}\nFiskalni QR: ${value}`
        : `Fiskalni QR: ${value}`
      );

      setQrResult({
        type:'error',
        title:'Podaci nisu učitani',
        message:e?.message||'Servis nije vratio očekivane podatke.'
      });
    }finally{
      setQrBusy(false);
    }
  }


  function importManualQr(){
    const pasted=String(manualQrValue||'').trim();

    if(!pasted){
      setQrResult({
        type:'error',
        title:'Link nije unet',
        message:'Nalepi ceo link koji počinje sa https://suf.purs.gov.rs/v/?vl=…'
      });
      return;
    }

    if(/^exp(?:\+[^:]+)?:\/\//i.test(pasted)){
      setQrResult({
        type:'error',
        title:'Ovo je Expo QR link',
        message:'Nalepi link fiskalnog računa sa domena suf.purs.gov.rs, a ne exp:// link sa računara.'
      });
      return;
    }

    handleQrScanned(pasted);
  }


  function submit(){
    const a=parseAmount(amount);
    const rate=currency==='RSD'?1:parseAmount(exchangeRate);
    if(!title.trim()||!a||!rate||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)){
      Alert.alert('Proveri unos','Naziv, iznos, kurs i datum (GGGG-MM-DD) su obavezni.');
      return;
    }
    onSave({
      type,
      title:title.trim(),
      category:cats.includes(category)?category:cats[0],
      amount:a,
      currency,
      exchangeRate:rate,
      amountRsd:a*rate,
      date,
      note:note.trim(),
      qrUrl,
      invoiceNumber,
      fiscalReceiptImported:Boolean(qrUrl)
    });
  }

  if(scannerVisible){
    return <QrScannerScreen
      onClose={()=>setScannerVisible(false)}
      onScanned={handleQrScanned}
    />;
  }

  return <ModalShell visible={visible} title={initial?'Izmeni transakciju':'Nova transakcija'} onClose={onClose}>
    <Label text="Tip transakcije"/>
    <TypeSelector value={type} onChange={changeType}/>

    {type==='expense'?<View style={s.qrImportCard}>
      <View style={s.flex}>
        <Text style={s.qrImportTitle}>Skeniraj QR kod sa fiskalnog računa</Text>
        <Text style={s.smallMuted}>Otvori kameru, usmeri je ka QR kodu i potvrdi automatski pronađene podatke.</Text>
      </View>
      <Pressable disabled={qrBusy} style={[s.qrScanButton,qrBusy&&{opacity:.5}]} onPress={()=>{console.log('[MoneyMate] Otvaram QR kameru');setScannerVisible(true)}}>
        <Text style={s.qrScanButtonText}>{qrBusy?'Učitavanje…':'▦ Skeniraj QR'}</Text>
      </Pressable>
    </View>:null}

    {type==='expense'?<View style={s.manualQrCard}>
      <Text style={s.manualQrTitle}>QR ne može da se skenira?</Text>
      <Text style={s.smallMuted}>
        Skeniraj račun običnom kamerom, kopiraj link koji se otvori i nalepi ga ovde.
      </Text>
      <TextInput
        style={[s.input,s.manualQrInput]}
        value={manualQrValue}
        onChangeText={setManualQrValue}
        placeholder="https://suf.purs.gov.rs/v/?vl=..."
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        multiline
      />
      <Pressable
        disabled={qrBusy||!manualQrValue.trim()}
        style={[s.manualQrButton,(qrBusy||!manualQrValue.trim())&&{opacity:.45}]}
        onPress={importManualQr}
      >
        <Text style={s.manualQrButtonText}>
          {qrBusy?'Učitavanje…':'Nalepi/učitaj fiskalni link'}
        </Text>
      </Pressable>
    </View>:null}

    {qrResult?<View style={[
      s.qrResultCard,
      qrResult.type==='success'&&s.qrResultSuccess,
      qrResult.type==='error'&&s.qrResultError
    ]}>
      <View style={s.flex}>
        <Text style={s.qrResultTitle}>{qrResult.title}</Text>
        <Text style={s.qrResultMessage}>{qrResult.message}</Text>
      </View>
      <Pressable onPress={()=>setQrResult(null)}>
        <Text style={s.qrResultClose}>✕</Text>
      </Pressable>
    </View>:null}

    <Label text="Naziv"/>
    <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder={type==='income'?'npr. Julska plata':'npr. Nedeljna kupovina'}/>
    <Label text="Iznos"/>
    <TextInput style={s.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0"/>

    <Label text="Valuta"/>
    <View style={s.currencyRow}>
      {CURRENCIES.map(item=><Pressable key={item.code} onPress={()=>changeCurrency(item.code)} style={[s.currencyOption,currency===item.code&&s.currencyOptionActive]}>
        <Text style={[s.currencyCode,currency===item.code&&s.currencyCodeActive]}>{item.code}</Text>
        <Text style={[s.currencyLabel,currency===item.code&&s.currencyCodeActive]}>{item.label}</Text>
      </Pressable>)}
    </View>

    {currency!=='RSD'?<>
      <Label text={`Kurs: 1 ${currency} u RSD`}/>
      <TextInput style={s.input} value={exchangeRate} onChangeText={setExchangeRate} keyboardType="decimal-pad"/>
      <View style={s.conversionCard}><Text style={s.smallMuted}>Vrednost za statistiku i ukupno stanje</Text><Text style={s.conversionValue}>≈ {money(parseAmount(amount)*parseAmount(exchangeRate))}</Text></View>
    </>:null}

    <Label text="Izaberi kategoriju"/>
    <CategorySelector type={type} value={category} onChange={setCategory}/>
    <Label text="Datum"/>
    <TextInput style={s.input} value={date} onChangeText={setDate} placeholder="2026-07-25" autoCapitalize="none"/>
    <Label text="Beleška (opciono)"/>
    <TextInput style={[s.input,s.textarea]} value={note} onChangeText={setNote} multiline placeholder="Dodatne informacije"/>

    {qrUrl?<View style={s.qrLoadedCard}>
      <Text style={s.smallBold}>▦ Fiskalni QR je dodat</Text>
      {invoiceNumber?<Text style={s.smallMuted}>Broj računa: {invoiceNumber}</Text>:null}
      <Text numberOfLines={2} style={s.qrUrlText}>{qrUrl}</Text>
    </View>:null}


    <Primary text={initial?'Sačuvaj izmene':'Dodaj transakciju'} onPress={submit}/>
  </ModalShell>;
}

function QrScannerScreen({onClose,onScanned}){
  console.log('[MoneyMate] QR kamera ekran je renderovan');
  const [permission,requestPermission]=useCameraPermissions();
  const [locked,setLocked]=useState(false);
  const [message,setMessage]=useState('Postavi ceo QR kod sa fiskalnog računa unutar okvira.');
  const [zoom,setZoom]=useState(0);
  const [torch,setTorch]=useState(false);

  function closeScanner(){
    setLocked(true);
    setTorch(false);
    setZoom(0);
    onClose();
  }

  useEffect(()=>{
    setLocked(false);
    setMessage('Postavi ceo QR kod sa fiskalnog računa unutar okvira.');
    setZoom(0);
    setTorch(false);
    if(permission && !permission.granted && permission.canAskAgain){
      requestPermission().catch(()=>{});
    }
  },[permission?.granted]);

  function looksLikeFiscalQr(value){
    const raw=String(value||'').trim();
    if(!raw)return false;
    if(/^exp(?:\+[^:]+)?:\/\//i.test(raw))return false;

    let decoded=raw;
    try{decoded=decodeURIComponent(raw)}catch{}

    return (
      /https?:\/\//i.test(decoded) ||
      /(?:suf\.purs\.gov\.rs|purs\.gov\.rs|efiskalizacija\.gov\.rs)/i.test(decoded)
    );
  }

  function handleBarcode(data){
    if(locked)return;
    const raw=String(data||'').trim();
    if(!raw)return;

    if(!looksLikeFiscalQr(raw)){
      setMessage(
        /^exp(?:\+[^:]+)?:\/\//i.test(raw)
          ? 'Prepoznat je Expo QR sa računara. Usmeri kameru na fiskalni račun.'
          : 'QR je pročitan, ali nije prepoznat kao fiskalni link. Pokušaj sa drugim zumom ili nalepi link ručno.'
      );
      setLocked(true);
      setTimeout(()=>setLocked(false),1200);
      return;
    }

    setLocked(true);
    setMessage('Fiskalni QR je prepoznat. Učitavanje podataka…');
    onScanned(raw);
  }

  return <SafeAreaView style={s.scannerSafe}>
    <View style={s.scannerHeader}>
      <Pressable hitSlop={16} onPress={closeScanner}><Text style={s.link}>Zatvori</Text></Pressable>
      <Text style={s.scannerTitle}>Skeniraj fiskalni QR</Text>
      <View style={{width:48}}/>
    </View>

    {!permission
      ? <View style={s.scannerMessage}>
          <Text style={s.muted}>Provera dozvole za kameru…</Text>
        </View>
      : !permission.granted
      ? <View style={s.scannerMessage}>
          <Text style={s.scannerMessageTitle}>Potrebna je kamera</Text>
          <Text style={s.muted}>Dozvoli pristup kameri da bi aplikacija pročitala QR kod fiskalnog računa.</Text>
          <Primary text={permission.canAskAgain?'Dozvoli kameru':'Pokušaj ponovo'} onPress={requestPermission}/>
          {!permission.canAskAgain
            ? <Text style={s.permissionHint}>Na iPhone-u idi na Settings → Expo Go → Camera i uključi pristup.</Text>
            : null}
        </View>
      : <View style={s.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            zoom={zoom}
            enableTorch={torch}
            barcodeScannerSettings={{barcodeTypes:['qr']}}
            onBarcodeScanned={({data})=>handleBarcode(data)}
          />
          <View style={s.scannerOverlay} pointerEvents="box-none">
            <View style={s.scannerFrame}><View style={s.scannerLine}/></View>
            <Text style={s.scannerHelp}>{message}</Text>
            <Text style={s.scannerTip}>
              Ceo QR i beli okvir oko njega treba da budu vidljivi.
            </Text>

            <View style={s.scannerControls} pointerEvents="box-none">
              <Pressable
                pointerEvents="auto"
                style={[s.scannerControlButton,torch&&s.scannerControlActive]}
                onPress={()=>setTorch(value=>!value)}
              >
                <Text style={[s.scannerControlText,torch&&s.scannerControlTextActive]}>
                  {torch?'Lampa uključena':'Uključi lampu'}
                </Text>
              </Pressable>

              <View style={s.zoomControls} pointerEvents="box-none">
                {[0,0.18,0.35].map(value=><Pressable
                  key={value}
                  pointerEvents="auto"
                  style={[s.zoomButton,zoom===value&&s.zoomButtonActive]}
                  onPress={()=>setZoom(value)}
                >
                  <Text style={[s.zoomText,zoom===value&&s.zoomTextActive]}>
                    {value===0?'1×':value===0.18?'1.5×':'2×'}
                  </Text>
                </Pressable>)}
              </View>
            </View>
          </View>

          <Pressable
            style={s.scannerExitButton}
            hitSlop={12}
            onPress={closeScanner}
          >
            <Text style={s.scannerExitButtonText}>Odustani i vrati se</Text>
          </Pressable>
        </View>}
  </SafeAreaView>;
}
function BudgetModal({visible,initial,onClose,onSave}){const [category,setCategory]=useState('Namirnice'),[limit,setLimit]=useState('');useEffect(()=>{if(visible){setCategory(initial?.category||'Namirnice');setLimit(initial?String(initial.limit):'')}},[visible,initial]);function submit(){const n=parseAmount(limit);if(!n)return Alert.alert('Proveri iznos','Limit mora biti veći od nule.');onSave({category,limit:n})}return <ModalShell visible={visible} title={initial?'Izmeni budžet':'Novi budžet'} onClose={onClose}><Label text="Izaberi kategoriju"/><CategorySelector type="expense" value={category} onChange={setCategory}/><Label text="Mesečni limit (RSD)"/><TextInput style={s.input} value={limit} onChangeText={setLimit} keyboardType="numeric" placeholder="30000"/><Primary text="Sačuvaj budžet" onPress={submit}/></ModalShell>}
function GoalModal({visible,initial,onClose,onSave}){
  const [title,setTitle]=useState('');
  const [target,setTarget]=useState('');
  const [saved,setSaved]=useState('');
  const [deadline,setDeadline]=useState('');
  const [currency,setCurrency]=useState('RSD');
  const [exchangeRate,setExchangeRate]=useState('1');

  useEffect(()=>{if(visible){
    const nextCurrency=initial?.currency||'RSD';
    setTitle(initial?.title||'');
    setTarget(initial?String(initial.target):'');
    setSaved(initial?String(initial.saved):'0');
    setDeadline(initial?.deadline||'2026-12-31');
    setCurrency(nextCurrency);
    setExchangeRate(String(initial?.exchangeRate||DEFAULT_RATES[nextCurrency]||1));
  }},[visible,initial]);

  function changeCurrency(code){
    setCurrency(code);
    setExchangeRate(String(DEFAULT_RATES[code]||1));
  }

  function submit(){
    const t=parseAmount(target);
    const sv=parseAmount(saved);
    const rate=currency==='RSD'?1:parseAmount(exchangeRate);
    if(!title.trim()||!t||!rate||!/^\d{4}-\d{2}-\d{2}$/.test(deadline)){
      return Alert.alert(
        'Proveri unos',
        'Naziv, ciljni iznos, kurs i datum roka su obavezni.'
      );
    }
    const safeSaved=Math.min(sv,t);
    onSave({
      title:title.trim(),
      target:t,
      saved:safeSaved,
      currency,
      exchangeRate:rate,
      targetRsd:t*rate,
      savedRsd:safeSaved*rate,
      deadline
    });
  }

  return <ModalShell visible={visible} title={initial?'Izmeni cilj':'Novi cilj'} onClose={onClose}>
    <Label text="Naziv cilja"/>
    <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="npr. Putovanje ili novi računar"/>

    <Label text="Valuta cilja"/>
    <View style={s.currencyRow}>
      {CURRENCIES.map(item=><Pressable
        key={item.code}
        onPress={()=>changeCurrency(item.code)}
        style={[s.currencyOption,currency===item.code&&s.currencyOptionActive]}
      >
        <Text style={[s.currencyCode,currency===item.code&&s.currencyCodeActive]}>{item.code}</Text>
        <Text style={[s.currencyLabel,currency===item.code&&s.currencyCodeActive]}>{item.label}</Text>
      </Pressable>)}
    </View>

    {currency!=='RSD'?<>
      <Label text={`Kurs: 1 ${currency} u RSD`}/>
      <TextInput style={s.input} value={exchangeRate} onChangeText={setExchangeRate} keyboardType="decimal-pad"/>
    </>:null}

    <Label text={`Ciljni iznos (${currency})`}/>
    <TextInput style={s.input} value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="0"/>

    <Label text={`Trenutno sačuvano (${currency})`}/>
    <TextInput style={s.input} value={saved} onChangeText={setSaved} keyboardType="decimal-pad" placeholder="0"/>

    {currency!=='RSD'&&parseAmount(target)>0?<View style={s.goalConversionCard}>
      <Text style={s.smallMuted}>RSD protivvrednost cilja</Text>
      <Text style={s.goalConversionValue}>
        {money(parseAmount(target)*parseAmount(exchangeRate))}
      </Text>
    </View>:null}

    <Label text="Rok (GGGG-MM-DD)"/>
    <TextInput style={s.input} value={deadline} onChangeText={setDeadline}/>
    <Primary text="Sačuvaj cilj" onPress={submit}/>
  </ModalShell>;
}
function BackupModal({visible,data,onClose,onImport}){const [text,setText]=useState('');useEffect(()=>{if(visible)setText('')},[visible]);async function exportJson(){await Share.share({title:'MoneyMate backup',message:JSON.stringify(data,null,2)})}async function exportCsv(){const rows=['Datum,Tip,Naziv,Kategorija,Iznos,Beleška',...data.transactions.map(x=>[x.date,x.type,x.title,x.category,x.amount,x.note||''].map(csv).join(','))];await Share.share({title:'MoneyMate CSV',message:rows.join('\n')})}function importData(){try{const x=JSON.parse(text);if(!x||!Array.isArray(x.transactions)||!Array.isArray(x.budgets)||!Array.isArray(x.goals))throw Error();Alert.alert('Uvezi backup','Trenutni podaci biće zamenjeni.',[{text:'Otkaži',style:'cancel'},{text:'Uvezi',onPress:()=>onImport(x)}])}catch{Alert.alert('Neispravan backup','Nalepi ceo JSON sadržaj koji je izvezen iz MoneyMate aplikacije.')}}return <ModalShell visible={visible} title="Backup podataka" onClose={onClose}><Primary text="Podeli JSON backup" onPress={exportJson}/><View style={{height:10}}/><Pressable style={s.secondary} onPress={exportCsv}><Text style={s.secondaryText}>Podeli transakcije kao CSV</Text></Pressable><SectionTitle title="Uvoz JSON backupa"/><TextInput style={[s.input,{height:220,textAlignVertical:'top'}]} value={text} onChangeText={setText} multiline placeholder="Ovde nalepi JSON backup…" autoCapitalize="none"/><Primary text="Uvezi podatke" onPress={importData}/></ModalShell>}
function csv(v){const x=String(v??'').replace(/"/g,'""');return `"${x}"`}
function Empty({text}){return <View style={s.empty}><Text style={s.emptyIcon}>○</Text><Text style={s.muted}>{text}</Text></View>}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:COLORS.bg},app:{flex:1},flex:{flex:1},center:{alignItems:'center',justifyContent:'center'},screen:{padding:18,paddingBottom:115},brand:{fontSize:30,fontWeight:'900',color:COLORS.primary,marginBottom:8},heading:{fontSize:27,fontWeight:'900',color:COLORS.ink},muted:{color:COLORS.muted,fontSize:13},smallMuted:{color:COLORS.muted,fontSize:12},smallBold:{color:COLORS.ink,fontSize:13,fontWeight:'800'},bold:{fontWeight:'900',color:COLORS.ink},header:{flexDirection:'row',alignItems:'center',marginBottom:18,gap:12},primarySmall:{backgroundColor:COLORS.primary,paddingHorizontal:14,paddingVertical:10,borderRadius:12},primaryText:{color:'#fff',fontWeight:'900'},hero:{backgroundColor:COLORS.dark,borderRadius:24,padding:22,marginBottom:14},heroLabel:{color:'#AFC4DB',fontSize:13},heroValue:{fontSize:33,fontWeight:'900',color:'#fff',marginVertical:9},lockedLine:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:'rgba(255,255,255,.09)',paddingHorizontal:12,paddingVertical:9,borderRadius:12,marginBottom:6},lockedLabel:{color:'#C7D6E6',fontSize:12,fontWeight:'700'},lockedValue:{color:'#FFD27A',fontSize:13,fontWeight:'900'},heroRow:{flexDirection:'row',gap:12,marginTop:8},metric:{flex:1},heroMuted:{color:'#9FB3C9',fontSize:11},metricValue:{color:'#FF9F9F',fontWeight:'800',fontSize:14,marginTop:4},grid:{flexDirection:'row',gap:12,marginBottom:10},miniCard:{flex:1,backgroundColor:'#fff',borderRadius:18,padding:16,borderWidth:1,borderColor:COLORS.line},miniValue:{fontSize:18,fontWeight:'900',color:COLORS.ink,marginTop:6},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:18,marginBottom:10},sectionTitle:{fontSize:17,fontWeight:'900',color:COLORS.ink},link:{color:COLORS.primary,fontWeight:'800'},quickRow:{flexDirection:'row',justifyContent:'space-between'},quick:{alignItems:'center',width:'23%'},quickIcon:{width:48,height:48,borderRadius:16,backgroundColor:COLORS.soft,alignItems:'center',justifyContent:'center'},quickIconText:{fontSize:21,color:COLORS.primary,fontWeight:'900'},quickText:{fontSize:11,color:COLORS.ink,fontWeight:'700',marginTop:7,textAlign:'center'},card:{backgroundColor:'#fff',borderRadius:18,paddingHorizontal:14,borderWidth:1,borderColor:COLORS.line},cardBlock:{backgroundColor:'#fff',borderRadius:18,padding:16,borderWidth:1,borderColor:COLORS.line,marginBottom:12},cardTitle:{fontSize:16,fontWeight:'900',color:COLORS.ink},summary:{backgroundColor:'#fff',borderRadius:20,padding:18,borderWidth:1,borderColor:COLORS.line,marginBottom:16},summaryValue:{fontSize:20,fontWeight:'900',color:COLORS.ink,marginVertical:8},space:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},txRow:{flexDirection:'row',alignItems:'center',paddingVertical:14,gap:11},divider:{borderBottomWidth:1,borderBottomColor:COLORS.line},txIcon:{width:38,height:38,borderRadius:13,alignItems:'center',justifyContent:'center'},txTitle:{fontSize:14,fontWeight:'800',color:COLORS.ink},txMeta:{fontSize:11,color:COLORS.muted,marginTop:3},txAmount:{fontSize:13,fontWeight:'900',maxWidth:115,textAlign:'right'},search:{backgroundColor:'#fff',borderWidth:1,borderColor:COLORS.line,borderRadius:15,paddingHorizontal:15,paddingVertical:13,color:COLORS.ink,marginBottom:10},chips:{gap:8,paddingBottom:10},chip:{paddingHorizontal:13,paddingVertical:8,borderRadius:999,backgroundColor:'#fff',borderWidth:1,borderColor:COLORS.line},chipActive:{backgroundColor:COLORS.primary,borderColor:COLORS.primary},chipText:{fontSize:12,fontWeight:'700',color:COLORS.muted},chipTextActive:{color:'#fff'},hint:{fontSize:11,color:COLORS.muted,textAlign:'center',marginTop:4},progress:{height:9,backgroundColor:'#E8EEF5',borderRadius:99,overflow:'hidden',marginVertical:11},progressFill:{height:'100%',borderRadius:99},thinBar:{height:7,backgroundColor:'#E9EEF5',borderRadius:99,overflow:'hidden',marginTop:6},thinFill:{height:'100%',backgroundColor:COLORS.primary,borderRadius:99},monthRow:{flexDirection:'row',alignItems:'center',marginBottom:13,gap:8},monthName:{width:52,fontSize:11,color:COLORS.muted,fontWeight:'700'},monthBars:{flex:1,gap:3},barIncome:{height:6,backgroundColor:COLORS.green,borderRadius:99},barExpense:{height:6,backgroundColor:COLORS.red,borderRadius:99},monthValue:{width:92,textAlign:'right',fontSize:10,color:COLORS.ink,fontWeight:'700'},
 reportMetricGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:6},
 reportMetric:{width:'48.4%',borderRadius:19,padding:15,borderWidth:1,minHeight:110,justifyContent:'space-between'},
 reportMetricBlue:{backgroundColor:'#EDF5FF',borderColor:'#BCD7FA'},
 reportMetricGreen:{backgroundColor:'#ECFAF4',borderColor:'#B8E6D0'},
 reportMetricRed:{backgroundColor:'#FFF1F1',borderColor:'#F1C3C3'},
 reportMetricAmber:{backgroundColor:'#FFF8E9',borderColor:'#F1D9A3'},
 reportMetricLabel:{fontSize:11,color:COLORS.muted,fontWeight:'800'},
 reportMetricValue:{fontSize:18,color:COLORS.ink,fontWeight:'900',marginVertical:7},
 reportMetricCaption:{fontSize:10,color:COLORS.muted,lineHeight:14},
 chartCard:{backgroundColor:'#FFFFFF',borderRadius:22,padding:17,borderWidth:1,borderColor:COLORS.line,marginTop:14,shadowColor:'#10243E',shadowOpacity:.045,shadowRadius:10,elevation:2},
 chartHead:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:16},
 chartTitle:{fontSize:16,fontWeight:'900',color:COLORS.ink},
 chartSubtitle:{fontSize:11,color:COLORS.muted,marginTop:4},
 chartLegend:{flexDirection:'row',alignItems:'center',gap:5,flexWrap:'wrap',justifyContent:'flex-end',maxWidth:125},
 legendDot:{width:8,height:8,borderRadius:4},
 chartLegendText:{fontSize:9,color:COLORS.muted,fontWeight:'700',marginRight:4},
 columnChart:{height:155,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-around',paddingHorizontal:3},
 columnGroup:{flex:1,alignItems:'center',justifyContent:'flex-end'},
 columnValueArea:{height:130,flexDirection:'row',alignItems:'flex-end',gap:4},
 columnBar:{width:10,borderTopLeftRadius:7,borderTopRightRadius:7,minHeight:2},
 incomeColumn:{backgroundColor:COLORS.green},
 expenseColumn:{backgroundColor:COLORS.red},
 columnMonth:{fontSize:10,color:COLORS.muted,fontWeight:'800',marginTop:7},
 chartAxis:{height:1,backgroundColor:COLORS.line,marginTop:-22},
 chartFooter:{flexDirection:'row',justifyContent:'space-between',marginTop:28},
 balanceChart:{height:160,flexDirection:'row',position:'relative',paddingHorizontal:4},
 balanceAxis:{position:'absolute',left:0,right:0,top:68,height:1,backgroundColor:'#D8E0EA'},
 balanceGroup:{flex:1,alignItems:'center'},
 balanceHalfTop:{height:68,justifyContent:'flex-end'},
 balanceHalfBottom:{height:68,justifyContent:'flex-start'},
 balanceBar:{width:20,borderRadius:6},
 balancePositive:{backgroundColor:COLORS.green,borderBottomLeftRadius:2,borderBottomRightRadius:2},
 balanceNegative:{backgroundColor:COLORS.red,borderTopLeftRadius:2,borderTopRightRadius:2},
 balanceMonth:{fontSize:9,color:COLORS.muted,fontWeight:'800',marginTop:5},
 balanceSummaryRow:{flexDirection:'row',gap:8,marginTop:8},
 balanceSummaryItem:{flex:1,backgroundColor:COLORS.bg,borderRadius:13,padding:10},
 balanceSummaryValue:{fontSize:10,fontWeight:'900',marginTop:4},
 categoryTotal:{fontSize:13,fontWeight:'900',color:COLORS.ink},
 stackedBar:{height:13,borderRadius:99,overflow:'hidden',flexDirection:'row',backgroundColor:'#EEF2F7',marginBottom:18},
 categoryChartRow:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:15},
 categoryChartIcon:{width:37,height:37,borderRadius:12,alignItems:'center',justifyContent:'center'},
 categoryChartEmoji:{fontSize:18},
 categoryChartName:{fontSize:12,fontWeight:'800',color:COLORS.ink,flex:1},
 categoryChartAmount:{fontSize:10,fontWeight:'800',color:COLORS.muted},
 categoryProgress:{height:6,backgroundColor:'#EEF2F7',borderRadius:99,overflow:'hidden',marginTop:7},
 categoryProgressFill:{height:'100%',borderRadius:99},
 categoryPercent:{width:33,textAlign:'right',fontSize:11,fontWeight:'900',color:COLORS.ink},
 purchasePredictor:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#D5E2F2',borderRadius:24,padding:17,marginBottom:18,shadowColor:'#000',shadowOpacity:.05,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:2},
 purchasePredictorHeader:{marginBottom:14},
 purchasePredictorEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.05,color:COLORS.primary,marginBottom:7},
 purchasePredictorTitle:{fontSize:20,fontWeight:'900',color:COLORS.ink,lineHeight:26},
 purchasePredictorSubtitle:{fontSize:10,color:COLORS.muted,lineHeight:16,marginTop:5},
 purchaseAmountBox:{backgroundColor:'#F8FAFD',borderRadius:16,padding:13,marginBottom:12},
 purchaseAmountLabel:{fontSize:9,fontWeight:'900',color:COLORS.muted,marginBottom:7},
 purchaseAmountInputRow:{flexDirection:'row',alignItems:'center',backgroundColor:'#FFFFFF',borderWidth:1,borderColor:COLORS.line,borderRadius:13,paddingHorizontal:12},
 purchaseAmountInput:{flex:1,fontSize:19,fontWeight:'900',color:COLORS.ink,paddingVertical:11},
 purchaseAmountCurrency:{fontSize:11,fontWeight:'900',color:COLORS.muted},
 safeSpendHero:{backgroundColor:'#EEF5FF',borderWidth:1,borderColor:'#C9DCF7',borderRadius:17,padding:15,marginBottom:12},
 safeSpendLabel:{fontSize:9,fontWeight:'900',color:COLORS.primary},
 safeSpendValue:{fontSize:25,fontWeight:'900',color:COLORS.primary,marginTop:5},
 safeSpendHint:{fontSize:9,color:COLORS.muted,marginTop:4},
 purchaseFlowGrid:{flexDirection:'row',gap:8,marginBottom:12},
 purchaseFlowCard:{flex:1,backgroundColor:'#FAFBFD',borderWidth:1,borderColor:COLORS.line,borderRadius:14,padding:10,minHeight:102},
 purchaseFlowIcon:{fontSize:16,marginBottom:7},
 purchaseFlowLabel:{fontSize:8,fontWeight:'800',color:COLORS.muted,lineHeight:11,minHeight:22},
 purchaseFlowValue:{fontSize:11,fontWeight:'900',color:COLORS.ink,marginTop:4},
 purchaseFlowSub:{fontSize:8,color:COLORS.muted,marginTop:3},
 purchaseCalculationBox:{backgroundColor:'#FAFBFD',borderWidth:1,borderColor:COLORS.line,borderRadius:15,padding:12,marginBottom:12},
 purchaseCalcRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12,paddingVertical:6},
 purchaseCalcLabel:{fontSize:9,color:COLORS.muted,flex:1},
 purchaseCalcValue:{fontSize:10,fontWeight:'900',color:COLORS.ink,textAlign:'right'},
 purchaseCalcDivider:{height:1,backgroundColor:COLORS.line,marginVertical:4},
 purchaseCalcLabelStrong:{fontSize:10,fontWeight:'900',color:COLORS.ink,flex:1},
 purchaseCalcValueStrong:{fontSize:13,fontWeight:'900',textAlign:'right'},
 purchaseVerdict:{flexDirection:'row',gap:10,borderWidth:1,borderRadius:15,padding:12,alignItems:'flex-start'},
 purchaseVerdictIcon:{width:26,height:26,borderRadius:13,alignItems:'center',justifyContent:'center'},
 purchaseVerdictIconText:{fontSize:13,fontWeight:'900',color:'#FFFFFF'},
 purchaseVerdictTitle:{fontSize:11,fontWeight:'900',marginBottom:3},
 purchaseVerdictText:{fontSize:9,color:COLORS.muted,lineHeight:14},
 purchasePredictorDisclaimer:{fontSize:8,color:COLORS.muted,lineHeight:12,textAlign:'center',marginTop:10},
 predictionHero:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#CFE0F5',borderRadius:24,padding:17,marginBottom:18,shadowColor:'#000',shadowOpacity:.06,shadowRadius:14,shadowOffset:{width:0,height:5},elevation:3},
 predictionEyebrowRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:8},
 predictionEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:COLORS.primary},
 predictionStatus:{borderRadius:999,paddingHorizontal:9,paddingVertical:5},
 predictionStatusGood:{backgroundColor:'#EAF8F0'},predictionStatusRisk:{backgroundColor:'#FFF0F0'},predictionStatusText:{fontSize:8,fontWeight:'900'},
 predictionTitle:{fontSize:21,fontWeight:'900',color:COLORS.ink,lineHeight:27},predictionSubtitle:{fontSize:10,color:COLORS.muted,lineHeight:16,marginTop:5,marginBottom:14},
 predictionMainGrid:{flexDirection:'row',alignItems:'stretch',backgroundColor:'#F7FAFE',borderRadius:16,padding:13,marginBottom:13},
 predictionMainStat:{flex:1},predictionMainDivider:{width:1,backgroundColor:COLORS.line,marginHorizontal:12},
 predictionMainLabel:{fontSize:8,fontWeight:'900',color:COLORS.muted,marginBottom:5},predictionMainValue:{fontSize:15,fontWeight:'900',color:COLORS.ink},predictionMainHint:{fontSize:8,color:COLORS.muted,marginTop:4},
 predictionTrackBox:{marginBottom:14},predictionTrackHeader:{flexDirection:'row',justifyContent:'space-between',marginBottom:7},predictionTrackLabel:{fontSize:9,fontWeight:'900',color:COLORS.ink},predictionTrackPercent:{fontSize:9,fontWeight:'900',color:COLORS.primary},
 predictionTrack:{height:9,borderRadius:999,backgroundColor:'#E8EEF6',overflow:'hidden'},predictionTrackFill:{height:'100%',borderRadius:999,backgroundColor:COLORS.primary},predictionTrackFooter:{flexDirection:'row',justifyContent:'space-between',marginTop:5},predictionTrackFootText:{fontSize:8,color:COLORS.muted},
 predictionCards:{flexDirection:'row',gap:8,marginBottom:13},predictionMiniCard:{flex:1,backgroundColor:'#FAFBFD',borderWidth:1,borderColor:COLORS.line,borderRadius:14,padding:10,minHeight:91},
 predictionMiniIcon:{fontSize:17,marginBottom:7},predictionMiniLabel:{fontSize:8,fontWeight:'800',color:COLORS.muted,lineHeight:11,minHeight:22},predictionMiniValue:{fontSize:11,fontWeight:'900',color:COLORS.ink,marginTop:4},
 predictionInsight:{flexDirection:'row',gap:10,borderRadius:15,padding:12,alignItems:'flex-start'},predictionInsightGood:{backgroundColor:'#EDF9F2',borderWidth:1,borderColor:'#CDEEDB'},predictionInsightRisk:{backgroundColor:'#FFF2F2',borderWidth:1,borderColor:'#F4CCCC'},
 predictionInsightIcon:{fontSize:16,fontWeight:'900'},predictionInsightTitle:{fontSize:10,fontWeight:'900',color:COLORS.ink,marginBottom:3},predictionInsightText:{fontSize:9,color:COLORS.muted,lineHeight:14},predictionDisclaimer:{fontSize:8,color:COLORS.muted,lineHeight:12,marginTop:10,textAlign:'center'},
 monthCompareCard:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:COLORS.line,borderRadius:20,padding:16,marginBottom:14},
 monthCompareHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:12,marginBottom:15},
 monthCompareBadge:{backgroundColor:'#EEF4FF',borderRadius:999,paddingHorizontal:10,paddingVertical:6},
 monthCompareBadgeText:{fontSize:9,fontWeight:'900',color:COLORS.primary},
 monthCompareTableHeader:{flexDirection:'row',alignItems:'center',paddingBottom:8,borderBottomWidth:1,borderBottomColor:COLORS.line},
 monthCompareHeaderLabel:{flex:1,fontSize:8,fontWeight:'900',color:COLORS.muted,textAlign:'right'},
 monthCompareRow:{flexDirection:'row',alignItems:'center',paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#F0F3F7'},
 monthCompareLabel:{fontSize:11,fontWeight:'900',color:COLORS.ink},
 monthCompareValue:{flex:1,fontSize:9,fontWeight:'800',color:COLORS.ink,textAlign:'right'},
 monthCompareChangeWrap:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:3},
 monthCompareArrow:{fontSize:12,fontWeight:'900'},
 monthCompareChange:{fontSize:9,fontWeight:'900'},
 savingsCompareBox:{marginTop:14,backgroundColor:'#F8FAFD',borderRadius:14,padding:13,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},
 savingsCompareLabel:{fontSize:11,fontWeight:'900',color:COLORS.ink},
 savingsCompareSub:{fontSize:9,color:COLORS.muted,marginTop:3,maxWidth:190},
 savingsCompareRight:{flexDirection:'row',alignItems:'center',gap:8},
 savingsCompareOld:{fontSize:12,fontWeight:'800',color:COLORS.muted},
 savingsCompareArrow:{fontSize:12,fontWeight:'900',color:COLORS.muted},
 savingsCompareNew:{fontSize:16,fontWeight:'900'},
 monthCompareInsights:{marginTop:12,gap:5},
 monthCompareInsightText:{fontSize:10,color:COLORS.muted,lineHeight:15},
 incomeSourceRow:{marginBottom:15},
 incomeSourceTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},
 incomeSourceNameWrap:{flexDirection:'row',alignItems:'center',gap:8,flex:1},
 incomeSourceRank:{width:23,height:23,borderRadius:12,backgroundColor:'#ECFAF4',color:COLORS.green,textAlign:'center',textAlignVertical:'center',fontSize:10,fontWeight:'900',paddingTop:4},
 incomeSourceName:{fontSize:12,fontWeight:'800',color:COLORS.ink,flex:1},
 incomeSourceRight:{alignItems:'flex-end'},
 incomeSourceAmount:{fontSize:11,fontWeight:'900',color:COLORS.ink},
 incomeSourcePercent:{fontSize:9,fontWeight:'800',color:COLORS.muted,marginTop:2},
 incomeSourceTrack:{height:7,backgroundColor:'#EDF2F6',borderRadius:99,overflow:'hidden',marginTop:8},
 incomeSourceFill:{height:'100%',backgroundColor:COLORS.green,borderRadius:99},
 weekdayPeakBadge:{backgroundColor:'#FFF8E9',borderWidth:1,borderColor:'#F1D9A3',borderRadius:12,paddingHorizontal:10,paddingVertical:7,alignItems:'center'},
 weekdayPeakLabel:{fontSize:8,color:COLORS.muted,fontWeight:'800'},
 weekdayPeakValue:{fontSize:12,color:'#B87800',fontWeight:'900',marginTop:2},
 weekdayChart:{height:145,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',paddingHorizontal:2},
 weekdayGroup:{flex:1,alignItems:'center'},
 weekdayBarArea:{height:112,justifyContent:'flex-end',alignItems:'center'},
 weekdayBar:{width:22,backgroundColor:'#B8C8DB',borderTopLeftRadius:8,borderTopRightRadius:8,minHeight:3},
 weekdayBarPeak:{backgroundColor:COLORS.primary},
 weekdayLabel:{fontSize:9,color:COLORS.muted,fontWeight:'800',marginTop:7},
 weekdayLabelPeak:{color:COLORS.primary},
 cashFlowFinal:{fontSize:13,fontWeight:'900'},
 cashFlowRows:{gap:10},
 cashFlowRow:{flexDirection:'row',alignItems:'center',gap:9},
 cashFlowMonth:{width:30,fontSize:9,fontWeight:'800',color:COLORS.muted},
 cashFlowTrack:{flex:1,height:8,backgroundColor:'#EDF2F6',borderRadius:99,overflow:'hidden'},
 cashFlowFill:{height:'100%',borderRadius:99},
 cashFlowValue:{width:86,textAlign:'right',fontSize:9,fontWeight:'900'},
 cashFlowCumulative:{marginTop:16,paddingTop:13,borderTopWidth:1,borderTopColor:COLORS.line,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 cashFlowCumulativeValue:{fontSize:13,fontWeight:'900'},
 insightGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},
 insightCard:{width:'48.4%',backgroundColor:'#FFFFFF',borderWidth:1,borderColor:COLORS.line,borderRadius:18,padding:15,minHeight:125},
 insightIcon:{fontSize:21,color:COLORS.primary,fontWeight:'900'},
 insightLabel:{fontSize:10,color:COLORS.muted,fontWeight:'800',marginTop:10,lineHeight:14},
 insightValue:{fontSize:15,color:COLORS.ink,fontWeight:'900',marginTop:7},
 insightSub:{fontSize:11,color:COLORS.muted,fontWeight:'800',marginTop:5},legend:{flexDirection:'row',gap:16,justifyContent:'center',marginTop:4},legendText:{fontSize:11,color:COLORS.green,fontWeight:'700'},settingRow:{flexDirection:'row',alignItems:'center',paddingVertical:14},chevron:{fontSize:25,color:COLORS.muted},tabBar:{position:'absolute',left:8,right:8,bottom:7,height:72,backgroundColor:'#fff',borderRadius:20,borderWidth:1,borderColor:COLORS.line,flexDirection:'row',paddingHorizontal:3,shadowColor:'#000',shadowOpacity:.08,shadowRadius:12,elevation:6},tab:{flex:1,alignItems:'center',justifyContent:'center'},tabIcon:{fontSize:18,color:'#8A98A8',fontWeight:'900'},tabLabel:{fontSize:9,color:'#8A98A8',fontWeight:'700',marginTop:3,maxWidth:55},active:{color:COLORS.primary},modalSafe:{flex:1,backgroundColor:COLORS.bg},modalHead:{height:58,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:COLORS.line,backgroundColor:'#fff'},modalTitle:{fontWeight:'900',fontSize:16,color:COLORS.ink},modalBody:{padding:18,paddingBottom:50},label:{fontSize:13,fontWeight:'800',color:COLORS.ink,marginTop:13,marginBottom:7},input:{backgroundColor:'#fff',borderWidth:1,borderColor:COLORS.line,borderRadius:14,paddingHorizontal:14,paddingVertical:13,color:COLORS.ink,fontSize:15},textarea:{height:90,textAlignVertical:'top'},primary:{backgroundColor:COLORS.primary,borderRadius:15,padding:15,alignItems:'center',marginTop:20},secondary:{backgroundColor:'#fff',borderWidth:1,borderColor:COLORS.primary,borderRadius:15,padding:14,alignItems:'center'},secondaryText:{color:COLORS.primary,fontWeight:'900'},typeLabels:{flexDirection:'row',justifyContent:'space-around',marginTop:-5},typeSelector:{flexDirection:'row',gap:10},typeOption:{flex:1,minHeight:72,backgroundColor:'#fff',borderWidth:1,borderColor:COLORS.line,borderRadius:16,padding:12,flexDirection:'row',alignItems:'center',gap:9},typeExpenseActive:{backgroundColor:'#FFF3F3',borderColor:'#F3A7A7'},typeIncomeActive:{backgroundColor:'#ECFBF4',borderColor:'#91D9B9'},typeEmoji:{fontSize:22,fontWeight:'900'},typeOptionTitle:{fontSize:14,fontWeight:'900',color:COLORS.ink},typeOptionSub:{fontSize:10,color:COLORS.muted,marginTop:2},typeActiveText:{color:COLORS.ink},typeActiveSub:{color:COLORS.ink},categoryStepTitle:{fontSize:13,fontWeight:'800',color:COLORS.muted,marginBottom:9,textTransform:'uppercase',letterSpacing:.4},
 groupSelectorRow:{paddingRight:10,paddingBottom:12},
 groupSelectorCard:{width:126,minHeight:98,borderRadius:17,borderWidth:1,borderColor:COLORS.line,backgroundColor:'#FFFFFF',padding:12,marginRight:10,justifyContent:'center',alignItems:'center'},
 groupIncomeActive:{backgroundColor:'#E8F8F0',borderColor:COLORS.green},
 groupExpenseActive:{backgroundColor:'#FFF0F0',borderColor:COLORS.red},
 groupSelectorIcon:{fontSize:28,marginBottom:7},
 groupSelectorName:{fontSize:12,fontWeight:'800',color:COLORS.ink,textAlign:'center',lineHeight:16},
 selectedGroupHeader:{flexDirection:'row',alignItems:'center',backgroundColor:COLORS.soft,borderRadius:16,padding:13,marginTop:3,marginBottom:12},
 selectedGroupIcon:{width:44,height:44,borderRadius:13,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center',marginRight:12},
 selectedGroupIconText:{fontSize:23},
 selectedGroupName:{fontSize:17,fontWeight:'900',color:COLORS.ink},
 categoryParent:{fontSize:9,color:COLORS.muted,textAlign:'center',marginTop:3},
 categorySearch:{backgroundColor:'#fff',borderWidth:1,borderColor:COLORS.line,borderRadius:14,paddingHorizontal:14,paddingVertical:11,color:COLORS.ink,marginBottom:12},categoryGroup:{marginBottom:14},categoryGroupTitle:{fontSize:12,fontWeight:'900',color:COLORS.muted,textTransform:'uppercase',letterSpacing:.5,marginBottom:8},categoryGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},categoryCard:{width:'48.5%',minHeight:76,backgroundColor:'#fff',borderWidth:1,borderColor:COLORS.line,borderRadius:15,padding:11,justifyContent:'center',position:'relative'},categoryIncomeActive:{backgroundColor:'#ECFBF4',borderColor:COLORS.green,borderWidth:2},categoryExpenseActive:{backgroundColor:'#FFF3F3',borderColor:COLORS.red,borderWidth:2},categoryIcon:{fontSize:20,marginBottom:5},categoryName:{fontSize:12,fontWeight:'800',color:COLORS.ink,paddingRight:16},categoryNameActive:{fontWeight:'900'},categoryCheck:{position:'absolute',right:9,top:8,fontSize:14,fontWeight:'900',color:COLORS.primary},completedGoal:{borderColor:'#BCE8D5',backgroundColor:'#F7FFFB'},purchaseButton:{backgroundColor:COLORS.green,borderRadius:14,paddingVertical:13,alignItems:'center',marginTop:14},purchaseButtonText:{color:'#fff',fontWeight:'900',fontSize:14},welcomeCard:{backgroundColor:'#FFFFFF',borderRadius:22,padding:22,marginBottom:18,borderWidth:1,borderColor:COLORS.line,alignItems:'center'},welcomeIcon:{width:58,height:58,borderRadius:29,backgroundColor:COLORS.soft,alignItems:'center',justifyContent:'center',marginBottom:14},welcomeIconText:{fontSize:27,fontWeight:'900',color:COLORS.primary},welcomeTitle:{fontSize:21,fontWeight:'900',color:COLORS.ink,textAlign:'center'},welcomeText:{fontSize:14,color:COLORS.muted,lineHeight:21,textAlign:'center',marginTop:8,marginBottom:16},welcomeButton:{backgroundColor:COLORS.primary,borderRadius:14,paddingVertical:14,paddingHorizontal:22},welcomeButtonText:{color:'#FFFFFF',fontWeight:'800',fontSize:15},goalConversionCard:{backgroundColor:'#EEF4FF',borderWidth:1,borderColor:'#C9DAF5',borderRadius:15,padding:13,marginTop:10,marginBottom:4},
 goalConversionValue:{fontSize:18,fontWeight:'900',color:COLORS.primary,marginTop:4},
 recurringMonthGrid:{flexDirection:'row',gap:10,marginBottom:10},
 recurringMonthCard:{flex:1,borderRadius:17,borderWidth:1,padding:14},
 recurringMonthIncome:{backgroundColor:'#ECF9F2',borderColor:'#A6DEC0'},
 recurringMonthExpense:{backgroundColor:'#FFF0F0',borderColor:'#F0B8B8'},
 recurringMonthLabel:{fontSize:11,fontWeight:'800',color:COLORS.muted},
 recurringMonthValue:{fontSize:18,fontWeight:'900',marginTop:7},
 recurringMonthCaption:{fontSize:10,color:COLORS.muted,lineHeight:15,marginTop:5},
 recurringNetCard:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:COLORS.line,borderRadius:17,padding:15,marginBottom:14},
 recurringNetValue:{fontSize:22,fontWeight:'900',marginTop:7},
 recurringDashboardCard:{backgroundColor:'#F3EEFF',borderWidth:1,borderColor:'#D8C8FF',borderRadius:18,padding:14,marginTop:10,marginBottom:6,flexDirection:'row',alignItems:'center',gap:12},
 recurringDashboardIcon:{width:48,height:48,borderRadius:15,backgroundColor:'#7C4DCC',alignItems:'center',justifyContent:'center'},
 recurringDashboardIconText:{fontSize:26,fontWeight:'900',color:'#FFFFFF'},
 recurringSummary:{backgroundColor:COLORS.dark,borderRadius:20,padding:18,marginBottom:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 recurringSummaryValue:{fontSize:22,fontWeight:'900',color:'#FFFFFF',marginTop:5},
 recurringSummaryBadge:{backgroundColor:'rgba(255,255,255,.14)',borderRadius:999,paddingHorizontal:13,paddingVertical:8},
 recurringSummaryBadgeText:{color:'#FFFFFF',fontSize:12,fontWeight:'800'},
 recurringCard:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:COLORS.line,borderRadius:18,padding:15,marginBottom:12},
 recurringPaused:{opacity:.62,backgroundColor:'#F8FAFC'},
 recurringTitle:{fontSize:16,fontWeight:'900',color:COLORS.ink},
 recurringMeta:{fontSize:11,color:COLORS.muted,marginTop:5},
 recurringAmount:{fontSize:15,fontWeight:'900',marginLeft:10},
 recurringStatusRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:12,paddingTop:11,borderTopWidth:1,borderTopColor:COLORS.line},
 recurringStatus:{fontSize:12,fontWeight:'800',color:COLORS.primary},
 recurringActions:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:12},
 recurringAction:{backgroundColor:COLORS.soft,borderRadius:11,paddingHorizontal:11,paddingVertical:8},
 recurringDelete:{backgroundColor:'#FFF0F0'},
 recurringActionText:{fontSize:11,fontWeight:'800',color:COLORS.primary},
 frequencyGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:6},
 frequencyOption:{width:'48%',borderRadius:14,borderWidth:1,borderColor:COLORS.line,backgroundColor:'#FFFFFF',paddingVertical:13,alignItems:'center'},
 frequencyActive:{backgroundColor:COLORS.primary,borderColor:COLORS.primary},
 frequencyText:{fontSize:12,fontWeight:'800',color:COLORS.ink},
 frequencyTextActive:{color:'#FFFFFF'},
 dashboardQrButton:{backgroundColor:'#EAF2FF',borderWidth:1,borderColor:'#BFD5F5',borderRadius:18,padding:14,marginTop:12,marginBottom:6,flexDirection:'row',alignItems:'center',gap:12},
 dashboardQrIcon:{width:48,height:48,borderRadius:15,backgroundColor:COLORS.primary,alignItems:'center',justifyContent:'center'},
 dashboardQrIconText:{fontSize:24,fontWeight:'900',color:'#FFFFFF'},
 dashboardQrTitle:{fontSize:15,fontWeight:'900',color:COLORS.ink},
 dashboardQrSubtitle:{fontSize:11,color:COLORS.muted,lineHeight:16,marginTop:3},
 currencyRow:{flexDirection:'row',gap:9,marginBottom:4},
 currencyOption:{flex:1,minHeight:64,borderRadius:15,borderWidth:1,borderColor:COLORS.line,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center'},
 currencyOptionActive:{backgroundColor:COLORS.primary,borderColor:COLORS.primary},
 currencyCode:{fontSize:15,fontWeight:'900',color:COLORS.ink},
 currencyLabel:{fontSize:10,color:COLORS.muted,marginTop:3},
 currencyCodeActive:{color:'#FFFFFF'},
 conversionCard:{backgroundColor:COLORS.soft,borderRadius:14,padding:13,marginBottom:4},
 conversionValue:{fontSize:19,fontWeight:'900',color:COLORS.primary,marginTop:4},
 currencyEquivalent:{fontSize:10,fontWeight:'700',color:COLORS.amber,marginTop:4},
 qrImportCard:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#BFD5F5',borderRadius:17,padding:14,marginTop:14,marginBottom:4,flexDirection:'row',alignItems:'center',gap:10},
 qrImportTitle:{fontSize:14,fontWeight:'900',color:COLORS.ink,marginBottom:3},
 qrScanButton:{backgroundColor:COLORS.primary,borderRadius:13,paddingHorizontal:13,paddingVertical:11},
 qrScanButtonText:{color:'#FFFFFF',fontWeight:'900',fontSize:12},
 manualQrCard:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:COLORS.line,borderRadius:17,padding:14,marginTop:12},
 manualQrTitle:{fontSize:14,fontWeight:'900',color:COLORS.ink,marginBottom:5},
 manualQrInput:{minHeight:78,textAlignVertical:'top',marginTop:12,fontSize:12},
 manualQrButton:{backgroundColor:COLORS.dark,borderRadius:14,padding:13,alignItems:'center',marginTop:10},
 manualQrButtonText:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},
 qrResultCard:{flexDirection:'row',alignItems:'flex-start',gap:12,backgroundColor:'#EEF4FF',borderRadius:16,borderWidth:1,borderColor:'#BFD5F5',padding:14,marginTop:12,marginBottom:4},
 qrResultSuccess:{backgroundColor:'#ECF9F2',borderColor:'#9AD9B7'},
 qrResultError:{backgroundColor:'#FFF1F1',borderColor:'#F0B5B5'},
 qrResultTitle:{fontSize:14,fontWeight:'900',color:COLORS.ink,marginBottom:5},
 qrResultMessage:{fontSize:12,color:COLORS.muted,lineHeight:18},
 qrResultClose:{fontSize:16,fontWeight:'900',color:COLORS.muted,padding:4},
 qrLoadedCard:{backgroundColor:'#F2F8FF',borderRadius:14,borderWidth:1,borderColor:'#BFD5F5',padding:13,marginTop:12},
 qrUrlText:{fontSize:10,color:COLORS.primary,marginTop:5},
 qrBadge:{fontSize:11,fontWeight:'700',color:COLORS.green,marginTop:5},
 scannerSafe:{flex:1,backgroundColor:'#000000'},
 scannerHeader:{height:60,backgroundColor:'#FFFFFF',paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 scannerTitle:{fontSize:16,fontWeight:'900',color:COLORS.ink},
 scannerMessage:{flex:1,backgroundColor:COLORS.bg,justifyContent:'center',padding:28},
 scannerMessageTitle:{fontSize:23,fontWeight:'900',color:COLORS.ink,marginBottom:10},
 cameraWrap:{flex:1,position:'relative'},
 scannerOverlay:{...StyleSheet.absoluteFillObject,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(0,0,0,.18)'},
 scannerFrame:{width:310,height:310,borderWidth:4,borderColor:'#FFFFFF',borderRadius:28,backgroundColor:'transparent'},
 scannerLine:{position:'absolute',left:18,right:18,top:'50%',height:3,backgroundColor:'#3BE38F',borderRadius:3},
 scannerHelp:{color:'#FFFFFF',fontSize:14,fontWeight:'800',textAlign:'center',marginTop:24,paddingHorizontal:36},
 scannerTip:{color:'#DCE8FF',fontSize:11,fontWeight:'700',textAlign:'center',marginTop:10,paddingHorizontal:42},
 scannerControls:{width:'100%',paddingHorizontal:24,marginTop:20,alignItems:'center',gap:12},
 scannerControlButton:{backgroundColor:'rgba(255,255,255,.92)',paddingHorizontal:18,paddingVertical:11,borderRadius:999,minWidth:150,alignItems:'center'},
 scannerControlActive:{backgroundColor:'#FFE29A'},
 scannerControlText:{fontSize:12,fontWeight:'900',color:'#17202A'},
 scannerControlTextActive:{color:'#7A4E00'},
 zoomControls:{flexDirection:'row',gap:10},
 zoomButton:{width:52,height:42,borderRadius:21,backgroundColor:'rgba(0,0,0,.55)',borderWidth:1,borderColor:'rgba(255,255,255,.55)',alignItems:'center',justifyContent:'center'},
 zoomButtonActive:{backgroundColor:'#FFFFFF'},
 zoomText:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},
 zoomTextActive:{color:'#17202A'},
 permissionHint:{fontSize:12,color:COLORS.muted,lineHeight:18,textAlign:'center',marginTop:14},
 scannerExitButton:{position:'absolute',left:24,right:24,bottom:28,zIndex:50,elevation:50,backgroundColor:'rgba(17,32,51,.96)',borderWidth:1,borderColor:'rgba(255,255,255,.65)',borderRadius:18,paddingVertical:16,alignItems:'center',justifyContent:'center'},
 scannerExitButtonText:{color:'#FFFFFF',fontSize:15,fontWeight:'900'},
 empty:{padding:24,alignItems:'center'},emptyIcon:{fontSize:30,color:'#B2BECA',marginBottom:7}
});
