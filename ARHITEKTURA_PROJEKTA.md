# MoneyMate 2.4 — modularna arhitektura

`App.js` je samo entry point, a `AppRoot.js` služi za orkestraciju.

- `src/screens/` — glavni ekrani
- `src/components/common.js` — zajedničke UI komponente
- `src/components/modals.js` — modali, forme i QR scanner
- `src/hooks/useMoneyMateData.js` — Supabase + AsyncStorage persistence
- `src/services/` — QR/fiskalni servis
- `src/utils/` — finance, statistics, recurring, dialogs, helpers
- `src/constants/` — kategorije, tema i stilovi
- `src/config/` — Supabase konfiguracija

Ovo odvaja prezentacioni sloj, persistence/state logiku, poslovna pravila i spoljne servise.
