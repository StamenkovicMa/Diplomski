import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from './config/supabase';
import { s } from './constants/styles';
import { goalExchangeRate, goalSavedRsd, goalTargetRsd, displayMoney } from './utils/finance';
import { uid, isoToday, monthKey, money } from './utils/helpers';
import { addRecurringPeriod, applyDueRecurring, recurringTransactionFromRule } from './utils/recurring';
import { computeStats } from './utils/statistics';
import { confirmDelete } from './utils/dialogs';
import { useMoneyMateData } from './hooks/useMoneyMateData';
import { SetupScreen, AuthScreen } from './screens/AuthScreens';
import { Dashboard } from './screens/DashboardScreen';
import { Transactions } from './screens/TransactionsScreen';
import { RecurringTransactions } from './screens/RecurringScreen';
import { Budgets } from './screens/BudgetsScreen';
import { Goals } from './screens/GoalsScreen';
import { Reports } from './screens/ReportsScreen';
import { Settings } from './screens/SettingsScreen';
import { TabBar } from './components/common';
import { TransactionModal, BudgetModal, GoalModal, RecurringModal, BackupModal } from './components/modals';

function MoneyMateApp({session,onLogout}){
  const {data,setData,ready,syncState}=useMoneyMateData(session);
  const [tab,setTab]=useState('Početna');
  const [txModal,setTxModal]=useState(false); const [editTx,setEditTx]=useState(null); const [scanOnOpen,setScanOnOpen]=useState(false); const [budgetModal,setBudgetModal]=useState(false);
  const [editBudget,setEditBudget]=useState(null); const [goalModal,setGoalModal]=useState(false); const [editGoal,setEditGoal]=useState(null);
  const [backupModal,setBackupModal]=useState(false);
  const [recurringModal,setRecurringModal]=useState(false); const [editRecurring,setEditRecurring]=useState(null);
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

