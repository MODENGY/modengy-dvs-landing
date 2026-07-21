# Деплой лендинга MODENGY на VPS (сборка -> загрузка -> подмена -> проверка).
# Запуск:  powershell -File deploy.ps1
$ErrorActionPreference = 'Stop'
$ProjectDir = $PSScriptRoot
$NodeDir = 'C:\Users\iva70\tools\node-v24.18.0-win-x64'
$Host_ = 'root@80.64.31.38'
$Opt = @('-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=25')

$env:PATH = "$NodeDir;$env:PATH"
$env:SSH_ASKPASS = 'C:\Users\iva70\tools\askpass.cmd'
$env:SSH_ASKPASS_REQUIRE = 'force'
$env:DISPLAY = 'localhost:0'

Set-Location $ProjectDir

Write-Host '==> Сборка' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Сборка упала' }

Write-Host '==> Загрузка на VPS' -ForegroundColor Cyan
scp @Opt -r dist "${Host_}:/var/www/modengy/"

Write-Host '==> Подмена и перезагрузка nginx' -ForegroundColor Cyan
ssh @Opt $Host_ 'cd /var/www/modengy && mv promo promo_old_$(date +%s) && mv dist promo && chmod -R a+rX promo && systemctl reload nginx && ls -d promo_old_* | head -n -3 | xargs -r rm -rf && echo DEPLOYED'

Write-Host '==> Проверка' -ForegroundColor Cyan
ssh @Opt $Host_ "curl -so /dev/null -w 'page:%{http_code} font:' http://localhost:8080/promo/dvs/; curl -so /dev/null -w '%{http_code}\n' http://localhost:8080/promo/fonts/Gilroy-Regular.woff"

Write-Host 'Готово: http://80.64.31.38:8080/promo/dvs/' -ForegroundColor Green
