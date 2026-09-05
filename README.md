# MoneyMate Multi-user 3.0

Ova verzija dodaje:

- registraciju korisnika preko emaila i lozinke
- login i logout
- trajno čuvanje korisničke sesije
- Supabase cloud bazu
- potpuno odvojene finansije za svakog korisnika
- Row Level Security pravila
- lokalni cache ako internet privremeno nije dostupan
- sve prethodne funkcije: prihodi, troškovi, budžeti, ciljevi, zaključana štednja i „Kupi to“

## 1. Instalacija

```bash
npm install
npx expo install --fix
npx expo-doctor
```

Nemoj ručno instalirati `babel-preset-expo` i nemoj koristiti `npm audit fix --force`.

## 2. Supabase

1. Napravi projekat na Supabase-u.
2. Otvori SQL Editor.
3. Pokreni `supabase/schema.sql`.
4. Otvori Project Settings > API.
5. Kopiraj Project URL i anon/publishable key.
6. Kopiraj `.env.example` u `.env` i unesi svoje vrednosti.

Primer:

```env
EXPO_PUBLIC_SUPABASE_URL=https://abc.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=ey...
```

## 3. Email autentifikacija

U Supabase Dashboard:

Authentication > Providers > Email

Email provider mora biti uključen.

Za jednostavnije testiranje možeš privremeno isključiti obaveznu email potvrdu:

Authentication > Sign In / Providers > Email > Confirm email OFF

Za finalnu verziju možeš je ponovo uključiti.

## 4. Pokretanje

Posle izmene `.env` fajla:

```bash
npx expo start --lan --clear
```

## Kako su korisnici odvojeni?

Svaki red u `user_finance_data` ima `user_id` koji odgovara prijavljenom Supabase korisniku. RLS pravila dozvoljavaju korisniku da pročita i menja isključivo red čiji je vlasnik. Zato korisnik A ne može videti podatke korisnika B.

## Test

1. Registruj prvi nalog i dodaj trošak.
2. Odjavi se.
3. Registruj drugi nalog.
4. Drugi nalog neće videti podatke prvog.
5. Ponovo se prijavi na prvi nalog i njegovi podaci će se vratiti.


## Verzija 3.1 — prazan početak

Novi korisnik dobija:

- stanje 0 RSD
- prihode 0 RSD
- troškove 0 RSD
- praznu listu transakcija
- bez budžeta
- bez ciljeva štednje

Na početnoj strani se prikazuje poruka dobrodošlice i dugme **Dodaj prvi prihod**.

U podešavanjima opcija **Obriši sve finansijske podatke** vraća sve finansijske podatke prijavljenog korisnika na nulu, ali ne briše njegov nalog.


## Verzija 3.2 — pregledne kategorije u dva nivoa

Pri dodavanju prihoda i troškova korisnik sada:

1. bira glavnu oblast;
2. zatim bira konkretnu potkategoriju.

I prihodi i troškovi koriste isti pregledan format sa ikonama, horizontalnim izborom oblasti, karticama potkategorija i pretragom kroz sve kategorije.


## Korak 1 — kamera i galerija

Dodato:
- fotografisanje računa kamerom;
- izbor slike računa iz galerije;
- pregled i uklanjanje slike pre čuvanja;
- čuvanje slike uz transakciju;
- oznaka „Priložen račun“ u listi;
- podrška pri izmeni transakcije.

Pokretanje:
```bash
npm install
npx expo install --fix
npx expo-doctor
npx expo start --lan --clear
```


## Finalna EAS konfiguracija

Projekat sadrži:

- `eas.json` sa development, preview i production profilima;
- Android preview APK profil;
- Android/iOS production profile;
- jedinstvene bundle/package identifikatore;
- aplikacionu ikonu, adaptive icon i splash ekran;
- `.easignore`;
- build skripte u `package.json`;
- detaljno uputstvo `FINALNI_EAS_KORAK_PO_KORAK.txt`.

Pre prvog builda pokreni `eas login`, zatim `eas init`.
Supabase promenljive podesi u EAS projektu, jer se lokalni `.env` namerno ne šalje u cloud build.


## Verzija 1.1 — fiskalni QR i više valuta

Dodato:

- QR skeniranje pomoću `expo-camera`;
- slanje fiskalnog verifikacionog linka sa `Accept: application/json`;
- automatsko traženje prodavca, ukupnog iznosa, datuma i broja računa;
- automatsko postavljanje RSD za domaći fiskalni račun;
- predlog kategorije prema nazivu prodavca;
- rezervni režim kada servis ne vrati sve podatke;
- RSD, EUR i USD;
- ručni kurs prema RSD za EUR i USD;
- čuvanje originalnog iznosa, valute, kursa i RSD protivvrednosti;
- dashboard, budžetske provere i izveštaji računaju sve u RSD.

Pokretanje:

```bash
npm install
npx expo install --fix
npx expo-doctor
npx expo start --lan --clear
```

Pre čuvanja skeniranog računa korisnik mora proveriti automatski popunjene podatke.


## Verzija 1.1.1 — ispravljen QR tok

QR skener je sada eksplicitno povezan sa aplikacijom:

- veliko dugme **Skeniraj fiskalni QR** na početnoj strani;
- klik odmah otvara kameru;
- skener je dostupan i unutar forme novog troška;
- posle skeniranja forma se automatski popunjava;
- transakcija prikazuje oznaku da je fiskalni QR učitan;
- korisnik obavezno potvrđuje podatke pre čuvanja.

Pošto `expo-camera` predstavlja nativni modul, prethodno instalirani EAS build ne dobija skener automatski. Potreban je novi EAS build.


## Verzija 1.2 — samo fiskalni QR

Uklonjene su funkcije fotografisanja i galerije. Kamera se koristi isključivo za QR skeniranje fiskalnog računa.

QR obrada sada uklanja razmake, traži link unutar dodatnog teksta, dekodira URL-kodirani sadržaj i prihvata `suf.purs.gov.rs` bez `https://`.


## Verzija 1.3 — automatsko čitanje fiskalnog računa

Dodat je Supabase Edge Function `parse-fiscal-receipt`. Ona rešava CORS problem i pokušava da prepozna prodavca, PIB, adresu, ukupan iznos, datum/vreme, broj računa, način plaćanja, porez i stavke.

Pre testiranja QR automatskog popunjavanja obavezno deploy-uj funkciju:

```bash
npx supabase login
npx supabase link --project-ref fhhlihrkxnayufpmrbwf
npx supabase functions deploy parse-fiscal-receipt --no-verify-jwt
```


## Verzija 1.3.2 — parser za stvarnu stranicu Poreske uprave

Edge Function je prilagođena HTML strukturi sa `suf.purs.gov.rs`. Podržava ćirilične i latinične nazive polja i tabelu „Спецификација рачуна“.

Posle preuzimanja obavezno ponovo deploy-uj funkciju:

```bash
npx supabase functions deploy parse-fiscal-receipt --no-verify-jwt
```


## Verzija 1.3.3 — tabela + Žurnal fallback

Parser sada ne zavisi od toga da li je odeljak „Specifikacija računa“ otvoren. Ako je tabela prazna ili zatvorena, podaci i stavke se pokušavaju pročitati iz odeljka „Žurnal“.

Ponovo deploy-uj Edge Function:

```bash
npx supabase functions deploy parse-fiscal-receipt --no-verify-jwt
```


## Verzija 1.3.4 — napredni skener i ručni fiskalni link

Dodat je rezervni tok za račune koje Expo kamera teže prepoznaje. Korisnik može skenirati QR običnom kamerom, kopirati `suf.purs.gov.rs` link i nalepiti ga u MoneyMate.

Skener sada ima:

- veći okvir;
- zum 1×, 1.5× i 2×;
- lampu;
- ponovno skeniranje nakon pogrešnog QR-a.


## MoneyMate FINAL 1.4

Ispravljena je greška `Cannot access 'invoiceNumberFromPage' before initialization`.

Obavezno ponovo deploy-uj Edge Function:

```bash
npx supabase functions deploy parse-fiscal-receipt --no-verify-jwt
```


## Verzija 1.6 — ponavljajuće transakcije

Ponavljajuće transakcije čuvaju se u korisničkom `app_data` objektu u Supabase-u, tako da su automatski odvojene po korisniku i sinhronizovane sa ostalim finansijskim podacima.

Podržani su dnevni, nedeljni, mesečni i godišnji intervali, pauziranje, izvršavanje odmah, preskakanje i automatsko evidentiranje dospelih transakcija.


## Verzija 1.7

Ciljevi štednje podržavaju RSD, EUR i USD. Zaključavanje koristi RSD protivvrednost, dok se cilj prikazuje i plaća u izabranoj valuti.

Ponavljajuće transakcije prikazuju prihode, troškove i neto rezultat za tekući mesec.


## Verzija 1.8.0 — dodatni grafikoni

U ekranu **Izveštaji** dodata su tri nova grafikona bez dodatnih biblioteka:

- **Trend novčanog toka** — mesečni neto rezultat za poslednjih 12 meseci.
- **Potrošnja po danima u nedelji** — pokazuje kojim danima nastaje najveća potrošnja.
- **Izvori prihoda** — prikazuje najvažnije kategorije prihoda i njihov procentualni udeo.

Grafikoni koriste postojeće React Native `View` komponente, pa nije potrebna nova chart biblioteka niti promena Supabase baze.

### Git

Repo je pripremljen tako da `.env`, `node_modules`, `.expo`, generisani native folderi i logovi ne ulaze u Git.


## Verzija 1.9.0 — mesečno poređenje

U ekranu **Izveštaji** dodat je blok za poređenje tekućeg i prethodnog meseca.

Prikazuju se:
- prihodi;
- troškovi;
- neto rezultat;
- stopa štednje;
- procenat promene;
- strelica rasta/pada;
- boja koja označava povoljnu ili nepovoljnu promenu;
- kratki tekstualni uvidi.

Kod troškova se pad prikazuje kao pozitivna promena, dok je kod prihoda i neto rezultata rast pozitivan.

Nisu dodavane nove biblioteke niti menjani Supabase, QR parser, ciljevi ili ponavljajuće transakcije.


## Verzija 2.1.0 — refaktorisana struktura

Aplikaciona logika više nije koncentrisana u `App.js`.

Nova struktura koristi `src/config`, `src/constants`, `src/services` i `src/utils`.
`App.js` je sada samo ulazna tačka koja učitava `src/AppRoot.js`.

Detaljno objašnjenje nalazi se u `ARHITEKTURA_PROJEKTA.md`.


## Verzija 2.2.0 — Smart Purchase Predictor

Dodata je funkcija za procenu da li korisnik može bezbedno da izvrši planiranu kupovinu.

Proračun uzima u obzir:
- trenutno mesečno stanje;
- zaključanu štednju;
- prosečnu dnevnu potrošnju do kraja meseca;
- aktivne ponavljajuće prihode koji tek dospevaju;
- aktivne ponavljajuće troškove koji tek dospevaju;
- sigurnosnu rezervu u visini približno sedam dana prosečne potrošnje.

Ponavljajuće transakcije se projektuju prema `nextRun`, `frequency`, `endDate`, `maxOccurrences` i `generatedCount` podacima.


## Verzija 2.3.0 — QR automatska kategorizacija

Posle skeniranja fiskalnog QR koda MoneyMate sada analizira:
- naziv prodavca;
- prepoznate stavke računa;
- kombinaciju prodavca i stavki.

Aplikacija automatski bira najverovatniju kategoriju i prikazuje procenat pouzdanosti.
Korisnik i dalje može ručno da promeni predloženu kategoriju pre čuvanja transakcije.

Podržana su pravila za namirnice, gorivo, lekove, ličnu negu, dostavu hrane,
restorane, tehniku, parking, hotel, odeću i prevoz, uz fallback na Ostale troškove.


## Verzija 2.3.1 — srpska ćirilica u fiskalnim računima

QR kategorizacija je prilagođena računima u Srbiji.

- originalni naziv prodavca i stavki ostaje prikazan korisniku;
- za internu analizu ćirilica se transliteriše u latinicu;
- `č/ć/š/ž/đ` se normalizuju;
- ista pravila rade za ćirilične i latinične račune;
- kategorija i confidence score se računaju iz prodavca i stavki.

Primeri:
- `МЛЕКО 2.8%` → `mleko 2.8` → Namirnice
- `ЕВРО ДИЗЕЛ` → `evro dizel` → Gorivo
- `ШАМПОН` → `sampon` → Lična nega
- `БРУФЕН` → `brufen` → Lekovi
- `ПУЊАЧ` → `punjac` → Tehnika

Originalni ćirilični tekst nije izmenjen u prikazu računa.


## 2.3.2 Expanded Smart Categorization
QR klasifikator je proširen na veliki broj postojećih MoneyMate kategorija: hrana, vozilo, zdravlje, nega, tehnika, stanovanje, odeća, zabava, ljubimci, obrazovanje, putovanja, računi i finansijske obaveze. Podržani su ćirilica i latinica.


## 2.4.0 Modular architecture
Ekrani, komponente i persistence hook su izdvojeni iz AppRoot-a.


## 2.4.1 Fix
Ispravljeni su nedostajući `COLORS` importi u `src/components/common.js` i `src/constants/styles.js` nakon modularnog refaktora.


## 2.4.2 Fix — modular imports

Ispravljeni su nedostajući importi nastali posle modularnog refaktora:
- `monthKey` u `BudgetsScreen.js`
- `monthKey` u `utils/statistics.js`
- `dateLabel` u `GoalsScreen.js`
- `parseAmount` u `SettingsScreen.js`

Prethodni `COLORS` fix iz 2.4.1 je zadržan.


## 2.4.3 CLEAN — full modular audit

Urađena je sistematska provera svih izdvojenih modula. Provera obuhvata JSX komponente, React hook-ove, React Native komponente i ključne helper/finance/recurring/statistics funkcije.

Posebno su provereni `SectionTitle`, `Label`, `Primary`, `Chip`, `Screen`, `Header`, `monthKey`, `dateLabel`, `parseAmount` i `COLORS`.


## 2.4.4 — deduplicated imports

Svi JavaScript moduli su prošli proveru duplih ES import-a.
Importi iz istog modula su spojeni, a ponovljeni named import simboli uklonjeni.

Primer:
`import React, { useEffect, useMemo, useState } from 'react';`
sada postoji samo jednom po fajlu.


## 2.5.0 — Advanced Analytics

Ekran Izveštaji je potpuno unapređen:
- izbor perioda 3 / 6 / 12 meseci;
- Financial Pulse kartica za tekući mesec;
- detaljni prihodi/troškovi sa mesečnim neto iznosom;
- stopa štednje po mesecima;
- Top pojedinačni troškovi;
- odnos ponavljajućih i ostalih troškova;
- mesečna tabela rezultata;
- detaljniji finansijski KPI i uvidi;
- zadržane prognoza, Smart Purchase Predictor i mesečno poređenje.


## 2.5.1 — Analytics style syntax fix

Ispravljena je sintaksna greška u `src/constants/styles.js`:
nedostajao je zarez između `emptyIcon` i novog `reportPeriodHeader` stila.


## 2.5.2 — QR StyleSheet fix

Ispravljen je runtime error u `QrScannerScreen`:
`StyleSheet` se koristi u `src/components/modals.js`, ali nije bio importovan iz `react-native`.

Dodat je `StyleSheet` u postojeći React Native import.


## 2.6.0 — Smart QR Recognition

Automatska kategorizacija fiskalnih računa je dodatno proširena.

Posebno su unapređeni:
- apoteke i lekovi;
- suplementi;
- privatne klinike, lekarski pregledi i stomatolog;
- drogerije i lična nega;
- gorivo, servis, gume, parking i putarina;
- prehrana, pekare, restorani i dostava;
- tehnika i kućni aparati;
- odeća i obuća;
- ljubimci;
- obrazovanje;
- putovanja;
- računi i finansijske obaveze.

Klasifikacija i dalje podržava srpsku ćirilicu i latinicu.


## 2.6.1 — Pharmacy recognition fix

Prepoznavanje apoteka više ne zavisi samo od poznatih lanaca.
Dodat je generički pharmacy fallback koji koristi:
- naziv prodajnog mesta (`apoteka`, `pharmacy`, `farmacija`, `farmaceut`, itd.);
- širi spisak lanaca i lokalnih naziva;
- veliki rečnik lekova i medicinskih proizvoda;
- sadržaj stavki na računu kada naziv trgovca nije dovoljno jasan.

Podržani su ćirilica i latinica kroz postojeću srpsku normalizaciju.


## 2.7.0 — Financial Health Score

U ekran `Izveštaji` dodat je Financial Health Score od 0 do 100.

Rezultat se računa na osnovu:
- stope štednje;
- odnosa troškova i prihoda;
- stabilnosti mesečnog cash flow-a;
- udela ponavljajućih troškova.

Korisnik dobija i kratke automatske uvide koji objašnjavaju šta pozitivno ili negativno utiče na rezultat.
