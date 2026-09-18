@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d D:\Baitina\kopontren-app
where node
node node_modules\next\dist\bin\next build > build.log 2>&1
echo BUILD_EXIT_CODE=%ERRORLEVEL% >> build.log
