$ErrorActionPreference = 'Continue'
Set-Location 'D:\Baitina\kopontren-app'
taskkill /F /IM node.exe 2>$null | Out-Null
Start-Sleep -Seconds 2
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
& 'C:\Program Files\nodejs\node.exe' node_modules\next\dist\bin\next build *> build.log 2>&1
"BUILD_EXIT_CODE=" + $LASTEXITCODE | Out-File -Encoding ascii 'build_done.txt'
