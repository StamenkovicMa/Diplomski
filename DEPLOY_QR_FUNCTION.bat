@echo off
echo MoneyMate - deploy parse-fiscal-receipt Edge Function
echo.
call npx supabase login
call npx supabase link --project-ref fhhlihrkxnayufpmrbwf
call npx supabase functions deploy parse-fiscal-receipt --no-verify-jwt
echo.
echo Gotovo. Ponovo pokreni Expo sa --clear.
pause
