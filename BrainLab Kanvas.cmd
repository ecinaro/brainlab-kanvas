@echo off
chcp 65001 >nul
title BrainLab Kanvas
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadı. https://nodejs.org adresinden Node 22 veya üstünü kurup tekrar deneyin.
  pause
  exit /b 1
)

if not exist node_modules (
  echo İlk çalıştırma: paketler kuruluyor, bu bir-iki dakika sürebilir...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo Paket kurulumu başarısız oldu.
    pause
    exit /b 1
  )
)

if not exist .env (
  copy .env.example .env >nul
  echo .env dosyası oluşturuldu. Açılan Not Defteri'nde KIE_API_KEY= satırına key'inizi yapıştırıp kaydedin,
  echo sonra bu dosyaya tekrar çift tıklayın.
  notepad .env
  pause
  exit /b 1
)

if "%BLK_NO_BROWSER%"=="" (
  start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 5; Start-Process 'http://127.0.0.1:5173'"
)

echo.
echo   BrainLab Kanvas başlatılıyor:  http://127.0.0.1:5173
echo   Kapatmak için bu pencerede Ctrl+C'ye basın ya da pencereyi kapatın.
echo.
call npm run dev
