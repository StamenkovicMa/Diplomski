import React, { useState } from 'react';
import { Alert, Pressable, SafeAreaView, Text, TextInput, View, KeyboardAvoidingView, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../config/supabase';
import { s } from '../constants/styles';
import { Primary, Label } from '../components/modals';

export function SetupScreen(){
  return <SafeAreaView style={s.safe}><StatusBar style="dark"/><ScrollView contentContainerStyle={[s.screen,{flexGrow:1,justifyContent:'center'}]}><Text style={s.brand}>MoneyMate</Text><Text style={s.authTitle}>Poveži Supabase projekat</Text><Text style={s.authText}>U korenu projekta napravi .env fajl prema .env.example, unesi Supabase URL i anon key, pa ponovo pokreni Expo sa --clear.</Text><View style={s.cardBlock}><Text style={s.smallBold}>EXPO_PUBLIC_SUPABASE_URL</Text><Text style={[s.smallMuted,{marginTop:6}]}>https://tvoj-projekat.supabase.co</Text><Text style={[s.smallBold,{marginTop:16}]}>EXPO_PUBLIC_SUPABASE_ANON_KEY</Text><Text style={[s.smallMuted,{marginTop:6}]}>tvoj anon/publishable ključ</Text></View></ScrollView></SafeAreaView>;
}

export function AuthScreen(){
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

