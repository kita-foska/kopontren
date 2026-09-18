Set-Location 'D:\Baitina\kopontren-app'
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
& 'C:\Program Files\nodejs\node.exe' node_modules\next\dist\bin\next start -p 3210 *> server.log 2>&1
