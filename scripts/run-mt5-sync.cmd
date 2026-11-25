@echo off
rem ============================================================
rem  Desktop MT5 -> Supabase sync (run by the "tradecal-mt5-sync"
rem  scheduled task). Keeps the Vercel-hosted journal fresh.
rem
rem  Schedule:  every 30 minutes. Change with:
rem    schtasks /Change /TN tradecal-mt5-sync /MO <minutes>
rem ============================================================
cd /d "%~dp0.."
node scripts\sync-mt5-to-supabase.mjs >> sync.log 2>&1
