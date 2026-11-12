@echo off
rem ---------------------------------------------------------------------------
rem  Course 3D - lanceur Windows.
rem  Double-cliquez sur ce fichier : il installe si besoin, demarre le serveur
rem  et ouvre le navigateur. Fermez la fenetre pour arreter le jeu.
rem ---------------------------------------------------------------------------
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js est introuvable.
  echo   Installez Node.js 20 ou plus recent : https://nodejs.org/
  echo.
  pause
  exit /b 1
)

node "%~dp0demarrer.mjs" %*
if errorlevel 1 (
  echo.
  pause
)