@echo off
echo Deploy MoneyMate FINAL parser 1.4
call npx supabase functions deploy parse-fiscal-receipt --no-verify-jwt
pause
