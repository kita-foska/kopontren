$ErrorActionPreference = 'Continue'
$base = 'http://127.0.0.1:3210'
$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
Set-Location 'D:\Baitina\kopontren-app'

# wait for server
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 2
  try {
    $null = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "$base/login"
    $ready = $true
    break
  } catch {}
}
"SERVER_READY=$ready" | Out-File smoke.txt -Encoding utf8

function Req($method, $path, $body, $cookie) {
  $h = @{}
  if ($cookie) { $h['Cookie'] = $cookie }
  $p = @{ Uri = "$base$path"; Method = $method; Headers = $h; UseBasicParsing = $true }
  if ($body) { $p.Body = [System.Text.Encoding]::UTF8.GetBytes($body); $p.ContentType = 'application/json' }
  try {
    $r = Invoke-WebRequest @p
    $setc = $r.Headers['Set-Cookie']
    @($r.StatusCode, $r.Content, $setc)
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $reader = [System.IO.StreamReader]::new($resp.GetResponseStream())
      $content = $reader.ReadToEnd()
      @($resp.StatusCode, $content, $resp.Headers['Set-Cookie'])
    } else { @('ERR', $_.Exception.Message, $null) }
  }
}

# 1) login
$l = Req 'POST' '/api/auth/login' '{"username":"admin","password":"kopontren"}' $null
"LOGIN status=" + $l[0] | Out-File smoke.txt -Append -Encoding utf8
$cookie = ''
if ($l[2]) {
  $first = ($l[2] -split ',')[0]
  $cookie = ($first -split ';')[0]
}
"COOKIE=" + $cookie.Substring(0, [Math]::Min(24, $cookie.Length)) | Out-File smoke.txt -Append -Encoding utf8

# 2) products
$p = Req 'GET' '/api/products?live=1' $null $cookie
"PRODUCTS status=" + $p[0] | Out-File smoke.txt -Append -Encoding utf8
$prodJson = $p[1]
$prod = ($prodJson | ConvertFrom-Json).products[0]
"FIRST_PRODUCT id=" + $prod.id + " name=" + $prod.name | Out-File smoke.txt -Append -Encoding utf8

# 3) create a sale
$s = Req 'POST' '/api/sales' ('{"customer":"Test WA","pay_method":"cash","note":"smoke","items":[{"product_id":' + $prod.id + ',"qty":2}]}') $cookie
"SALE status=" + $s[0] + " body=" + $s[1] | Out-File smoke.txt -Append -Encoding utf8

# 4) sales list
$sl = Req 'GET' '/api/sales?days=1' $null $cookie
"SALES_LIST status=" + $sl[0] | Out-File smoke.txt -Append -Encoding utf8

# 5) reports
$rp2 = Req 'GET' '/api/reports?days=1' $null $cookie
"REPORTS status=" + $rp2[0] + " body=" + $rp2[1] | Out-File smoke.txt -Append -Encoding utf8

# 6) kas
$kas = Req 'GET' '/api/kas' $null $cookie
"KAS status=" + $kas[0] | Out-File smoke.txt -Append -Encoding utf8

# 7) users list
$us = Req 'GET' '/api/users' $null $cookie
"USERS status=" + $us[0] | Out-File smoke.txt -Append -Encoding utf8

# 8) create kasir user
$cu = Req 'POST' '/api/users' '{"username":"kasir1","display_name":"Kasir Satu","role":"kasir","password":"rahasia123"}' $cookie
"CREATE_USER status=" + $cu[0] + " body=" + $cu[1] | Out-File smoke.txt -Append -Encoding utf8

# 9) login as kasir, try admin-only route (should be 403)
$lk = Req 'POST' '/api/auth/login' '{"username":"kasir1","password":"rahasia123"}' $null
"KASIR_LOGIN status=" + $lk[0] | Out-File smoke.txt -Append -Encoding utf8
$kc = ''
if ($lk[2]) { $kc = (($lk[2] -split ',')[0] -split ';')[0] }
$guard = Req 'GET' '/api/users' $null $kc
"KASIR_GUARD(users, expect 403) status=" + $guard[0] | Out-File smoke.txt -Append -Encoding utf8

# 10) backup json
$bk = Req 'GET' '/api/backup' $null $cookie
"BACKUP status=" + $bk[0] | Out-File smoke.txt -Append -Encoding utf8

"SMOKE_DONE" | Out-File smoke.txt -Append -Encoding utf8
