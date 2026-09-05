import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, StyleSheet, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { EXPENSE_GROUPS, INCOME_GROUPS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, CATEGORY_ICONS, CURRENCIES, DEFAULT_RATES } from '../constants/categories';
import { COLORS } from '../constants/theme';
import { s } from '../constants/styles';
import { displayMoney, goalExchangeRate } from '../utils/finance';
import { isoToday, parseAmount, money } from '../utils/helpers';
import { RECURRING_FREQUENCIES, recurringLabel, parseIsoDate } from '../utils/recurring';
import { fetchFiscalReceipt, categorizeFiscalReceipt } from '../services/fiscalReceiptService';
import { Empty, Chip, SectionTitle } from './common';

function csv(v){const x=String(v??'').replace(/"/g,'""');return `"${x}"`}

export function RecurringModal({visible,initial,onClose,onSave}){
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

export function ModalShell({visible,title,onClose,children}){return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={s.modalSafe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}><View style={s.modalHead}><Pressable onPress={onClose}><Text style={s.link}>Otkaži</Text></Pressable><Text style={s.modalTitle}>{title}</Text><View style={{width:54}}/></View><ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">{children}</ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>}

export function Label({text}){return <Text style={s.label}>{text}</Text>}

export function Primary({text,onPress,disabled}){return <Pressable disabled={disabled} style={[s.primary,disabled&&{opacity:.45}]} onPress={onPress}><Text style={s.primaryText}>{text}</Text></Pressable>}

export function PickerRow({items,value,onChange}){return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{items.map(x=><Chip key={x} text={x} active={value===x} onPress={()=>onChange(x)}/>)}</ScrollView>}

export function TypeSelector({value,onChange}){return <View style={s.typeSelector}><Pressable style={[s.typeOption,value==='expense'&&s.typeExpenseActive]} onPress={()=>onChange('expense')}><Text style={s.typeEmoji}>↘</Text><View><Text style={[s.typeOptionTitle,value==='expense'&&s.typeActiveText]}>Trošak</Text><Text style={[s.typeOptionSub,value==='expense'&&s.typeActiveSub]}>Novac koji izlazi</Text></View></Pressable><Pressable style={[s.typeOption,value==='income'&&s.typeIncomeActive]} onPress={()=>onChange('income')}><Text style={s.typeEmoji}>↗</Text><View><Text style={[s.typeOptionTitle,value==='income'&&s.typeActiveText]}>Prihod</Text><Text style={[s.typeOptionSub,value==='income'&&s.typeActiveSub]}>Novac koji dolazi</Text></View></Pressable></View>}

export function CategorySelector({type,value,onChange}){
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

export function TransactionModal({visible,initial,autoScan,onClose,onSave}){
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
  const [qrCategorySuggestion,setQrCategorySuggestion]=useState(null);

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
      setQrCategorySuggestion(null);
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
      const categorySuggestion=categorizeFiscalReceipt(receipt);
      setCategory(categorySuggestion.category);
      setQrCategorySuggestion(categorySuggestion);

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
          `Kategorija: ${categorySuggestion.category} (${categorySuggestion.confidence}% pouzdanost)`,
          'Kategoriju možeš ručno promeniti pre čuvanja. Analiza podržava i ćirilicu i latinicu.'
        ].join('\n')
      });
    }catch(e){
      setQrCategorySuggestion(null);
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

    {type==='expense'&&qrCategorySuggestion?<View style={s.qrCategoryCard}>
      <View style={s.qrCategoryTop}>
        <View style={s.flex}>
          <Text style={s.qrCategoryEyebrow}>AUTOMATSKI PREPOZNATA KATEGORIJA</Text>
          <Text style={s.qrCategoryName}>{CATEGORY_ICONS[qrCategorySuggestion.category]||'🏷️'} {qrCategorySuggestion.category}</Text>
        </View>
        <View style={[
          s.qrConfidenceBadge,
          qrCategorySuggestion.confidence>=80?s.qrConfidenceHigh:qrCategorySuggestion.confidence>=60?s.qrConfidenceMedium:s.qrConfidenceLow
        ]}>
          <Text style={s.qrConfidenceText}>{qrCategorySuggestion.confidence}%</Text>
        </View>
      </View>
      <Text style={s.qrCategoryReason}>{qrCategorySuggestion.reason}</Text>
      <Text style={s.qrCategoryNormalization}>SR normalizacija: ćirilica i latinica se analiziraju u istoj internoj formi. Klasifikator proverava prodavca i veliki skup artikala/usluga.</Text>
      <Text style={s.qrCategoryHint}>Ako predlog nije tačan, izaberi drugu kategoriju ispod.</Text>
    </View>:null}

    <Label text="Izaberi kategoriju"/>
    <CategorySelector type={type} value={category} onChange={value=>{setCategory(value);if(qrCategorySuggestion)setQrCategorySuggestion({...qrCategorySuggestion,category:value,reason:'Kategoriju je ručno promenio korisnik.'});}}/>
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

export function QrScannerScreen({onClose,onScanned}){
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

export function BudgetModal({visible,initial,onClose,onSave}){const [category,setCategory]=useState('Namirnice'),[limit,setLimit]=useState('');useEffect(()=>{if(visible){setCategory(initial?.category||'Namirnice');setLimit(initial?String(initial.limit):'')}},[visible,initial]);function submit(){const n=parseAmount(limit);if(!n)return Alert.alert('Proveri iznos','Limit mora biti veći od nule.');onSave({category,limit:n})}return <ModalShell visible={visible} title={initial?'Izmeni budžet':'Novi budžet'} onClose={onClose}><Label text="Izaberi kategoriju"/><CategorySelector type="expense" value={category} onChange={setCategory}/><Label text="Mesečni limit (RSD)"/><TextInput style={s.input} value={limit} onChangeText={setLimit} keyboardType="numeric" placeholder="30000"/><Primary text="Sačuvaj budžet" onPress={submit}/></ModalShell>}

export function GoalModal({visible,initial,onClose,onSave}){
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

export function BackupModal({visible,data,onClose,onImport}){const [text,setText]=useState('');useEffect(()=>{if(visible)setText('')},[visible]);async function exportJson(){await Share.share({title:'MoneyMate backup',message:JSON.stringify(data,null,2)})}async function exportCsv(){const rows=['Datum,Tip,Naziv,Kategorija,Iznos,Beleška',...data.transactions.map(x=>[x.date,x.type,x.title,x.category,x.amount,x.note||''].map(csv).join(','))];await Share.share({title:'MoneyMate CSV',message:rows.join('\n')})}function importData(){try{const x=JSON.parse(text);if(!x||!Array.isArray(x.transactions)||!Array.isArray(x.budgets)||!Array.isArray(x.goals))throw Error();Alert.alert('Uvezi backup','Trenutni podaci biće zamenjeni.',[{text:'Otkaži',style:'cancel'},{text:'Uvezi',onPress:()=>onImport(x)}])}catch{Alert.alert('Neispravan backup','Nalepi ceo JSON sadržaj koji je izvezen iz MoneyMate aplikacije.')}}return <ModalShell visible={visible} title="Backup podataka" onClose={onClose}><Primary text="Podeli JSON backup" onPress={exportJson}/><View style={{height:10}}/><Pressable style={s.secondary} onPress={exportCsv}><Text style={s.secondaryText}>Podeli transakcije kao CSV</Text></Pressable><SectionTitle title="Uvoz JSON backupa"/><TextInput style={[s.input,{height:220,textAlignVertical:'top'}]} value={text} onChangeText={setText} multiline placeholder="Ovde nalepi JSON backup…" autoCapitalize="none"/><Primary text="Uvezi podatke" onPress={importData}/></ModalShell>}

