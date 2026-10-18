@echo off
chcp 65001 >nul
title 星舞互娱 · 发文台
cd /d "%~dp0"

set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if not defined NODE_EXE if exist "D:\NodeJS\node.exe" set "NODE_EXE=D:\NodeJS\node.exe"
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-6\node.exe" set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"

if not defined NODE_EXE (
  echo [x] 没找到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)

echo 正在启动发文台...
"%NODE_EXE%" server.js --open
echo.
echo 发文台已关闭。
pause
