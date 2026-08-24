# MoneyMate — struktura projekta

Od verzije 2.1 aplikaciona logika više nije smeštena u jednom `App.js` fajlu.

## Glavni fajlovi

- `App.js` — samo ulazna tačka aplikacije.
- `src/AppRoot.js` — glavni React Native tok, ekrani i UI kompozicija.
- `src/config/supabase.js` — kreiranje Supabase klijenta, env promenljive i auth storage konfiguracija.
- `src/constants/categories.js` — kategorije, valute, ikonice i podrazumevani kursevi.
- `src/constants/theme.js` — zajedničke boje aplikacije.
- `src/utils/finance.js` — konverzije valuta i finansijske pomoćne funkcije.
- `src/utils/helpers.js` — ID, datum, formatiranje i opšte pomoćne funkcije.
- `src/services/fiscalReceiptService.js` — obrada QR sadržaja i poziv Supabase Edge Function parsera.

## Zašto je ova struktura bolja?

1. `App.js` više nema poslovnu logiku.
2. Backend konfiguracija je odvojena od UI koda.
3. Finansijska pravila mogu se menjati nezavisno od ekrana.
4. QR servis je izolovan i lakši za testiranje.
5. Kategorije i tema imaju jedno centralno mesto.
6. Projekat je lakši za održavanje i objašnjavanje na odbrani.

## Dalji korak za veći projekat

Kod još većeg projekta `AppRoot.js` bi se dodatno podelio na `screens/`, `components/` i `hooks/`.
Za trenutni obim MoneyMate-a ova struktura odvaja najvažniju konfiguracionu, servisnu i poslovnu logiku bez nepotrebnog povećanja broja fajlova.
