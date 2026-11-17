@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js 20 o superior. Instala Node.js LTS y vuelve a intentarlo.
  pause
  exit /b 1
)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo AVISO: FFmpeg no esta en PATH. Podras abrir el panel, pero no renderizar MP4 hasta instalar FFmpeg.
)
if not exist .env copy .env.example .env >nul
start "Fabrica de Videos IA" cmd /k "npm start"
timeout /t 2 >nul
start http://localhost:3030
endlocal
