@echo off
chcp 65001 >nul
title Mealcount Management Server (Port 3001)
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
echo Dang khoi dong Mealcount Management tai http://localhost:3001 ...
"C:\Program Files\nodejs\node.exe" server/index.js
pause
