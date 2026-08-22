@echo off
echo Deploy MoneyMate Serbian universal parser 1.3.3
call npx supabase functions deploy parse-fiscal-receipt --no-verify-jwt
pause
