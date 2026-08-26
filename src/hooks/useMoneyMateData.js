import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY, supabase } from '../config/supabase';
import { applyDueRecurring } from '../utils/recurring';

export const EMPTY_DATA={profile:{name:'Korisnik',monthlyIncomeGoal:0,baseCurrency:'RSD',rates:{RSD:1,EUR:117.2,USD:108.5}},transactions:[],budgets:[],goals:[],recurring:[]};

export function useMoneyMateData(session){
 const [data,setData]=useState(EMPTY_DATA);const [ready,setReady]=useState(false);const [syncState,setSyncState]=useState('Učitavanje…');const syncTimer=useRef(null);
 const userId=session.user.id;const userCacheKey=`${STORAGE_KEY}_${userId}`;
 useEffect(()=>{let active=true;(async()=>{try{setSyncState('Učitavanje sa naloga…');const {data:row,error}=await supabase.from('user_finance_data').select('app_data').eq('user_id',userId).maybeSingle();if(error)throw error;
 if(row?.app_data){if(active)setData({...EMPTY_DATA,...row.app_data,profile:{...EMPTY_DATA.profile,...(row.app_data.profile||{})},transactions:row.app_data.transactions||[],budgets:row.app_data.budgets||[],goals:row.app_data.goals||[],recurring:row.app_data.recurring||[]})}
 else{const cached=await AsyncStorage.getItem(userCacheKey);const initial=cached?JSON.parse(cached):{...EMPTY_DATA,profile:{...EMPTY_DATA.profile,name:session.user.user_metadata?.full_name||'Korisnik'}};if(active)setData({...EMPTY_DATA,...initial,profile:{...EMPTY_DATA.profile,...(initial.profile||{})},recurring:initial.recurring||[]});const {error:upsertError}=await supabase.from('user_finance_data').upsert({user_id:userId,app_data:initial,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(upsertError)throw upsertError}if(active)setSyncState('Sinhronizovano')}
 catch(e){const cached=await AsyncStorage.getItem(userCacheKey).catch(()=>null);if(cached&&active){const parsed=JSON.parse(cached);setData({...EMPTY_DATA,...parsed,profile:{...EMPTY_DATA.profile,...(parsed.profile||{})},recurring:parsed.recurring||[]})}if(active)setSyncState('Lokalni režim');Alert.alert('Sinhronizacija nije uspela',e?.message||'Podaci će privremeno ostati sačuvani na uređaju.')}
 finally{if(active)setReady(true)}})();return()=>{active=false;if(syncTimer.current)clearTimeout(syncTimer.current)}},[userId]);
 useEffect(()=>{if(!ready)return;AsyncStorage.setItem(userCacheKey,JSON.stringify(data)).catch(()=>{});setSyncState('Čuvanje…');if(syncTimer.current)clearTimeout(syncTimer.current);syncTimer.current=setTimeout(async()=>{try{const {error}=await supabase.from('user_finance_data').upsert({user_id:userId,app_data:data,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw error;setSyncState('Sinhronizovano')}catch{setSyncState('Lokalno sačuvano')}},650);return()=>{if(syncTimer.current)clearTimeout(syncTimer.current)}},[data,ready,userCacheKey,userId]);
 useEffect(()=>{if(ready)setData(current=>applyDueRecurring(current))},[ready,userId]);
 return {data,setData,ready,syncState};
}
