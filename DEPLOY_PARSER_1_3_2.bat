@echo off
echo Deploy MoneyMate Serbian fiscal receipt parser 1.3.2
call npx supabase functions deploy parse-fiscal-receipt --no-verify-jwt
pause
