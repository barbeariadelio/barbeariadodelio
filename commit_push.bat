@echo off
echo === Fechando VS Code temporariamente ===
taskkill /f /im Code.exe 2>nul
timeout /t 2 /nobreak >nul

echo === Removendo index.lock ===
del /f /q ".git\index.lock" 2>nul

echo === Fazendo git add ===
git add -A

echo === Fazendo commit ===
git commit -m "feat: major refactor across admin, franchise, booking apps and server modules"

echo === Fazendo push ===
git push origin main

echo.
echo === Pronto! Reabrindo VS Code ===
start "" "C:\Users\filip\AppData\Local\Programs\Microsoft VS Code\Code.exe" "C:\Users\filip\OneDrive\Área de Trabalho\ideias\barber-system"

pause
