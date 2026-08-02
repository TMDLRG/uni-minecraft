# launch_channels.ps1 - ensure the 3 broadcast channel windows exist (standalone real Chrome,
# WebGL renders correctly), reusing any already open. Writes viewer/channels.json with the EXACT
# window titles (preserves unicode like the em-dash) for obs_stage.cjs to target via WGC.
$ErrorActionPreference='SilentlyContinue'
$chrome='C:\Program Files\Google\Chrome\Application\chrome.exe'
$anti=@('--ignore-gpu-blocklist','--enable-gpu-rasterization','--use-angle=d3d11',
  '--disable-features=CalculateNativeWinOcclusion','--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding','--disable-background-timer-throttling',
  '--no-first-run','--disable-infobars','--disable-session-crashed-bubble')

function Has-Window($like){ [bool](Get-Process chrome | Where-Object { $_.MainWindowTitle -like $like }) }
function Launch($url,$profile,$extra){
  $a=@("--app=$url","--user-data-dir=C:\Users\mpolz\AppData\Local\Temp\$profile","--window-size=1280,720","--window-position=40,40")+$extra+$anti
  Start-Process -FilePath $chrome -ArgumentList $a
}

if(-not (Has-Window '*Prismarine*')){ Launch 'http://127.0.0.1:3020' 'ch_colony' @(); 'LAUNCH colony cam' } else { 'REUSE colony cam' }
# glass is addressed BY NAME. It was https://10.190.245.122/glass/ until 2026-07-26 —
# an address dead since the chip's lease moved .122 -> .121 on 2026-07-16, so every
# studio launch opened a browser window at a host that had stopped answering ten days
# earlier. The chip's LAN address is a DHCP lease and is NOT DECLARABLE
# (viewer/infra_registry.json `_lan_dynamic_law`); the name is. This is real Chrome,
# which resolves .local through the OS resolver — measured 2026-07-26,
# glass.uni-lab.local -> 10.190.245.121.
if(-not (Has-Window '*Glass Cockpit*')){ Launch 'https://glass.uni-lab.local/glass/' 'ch_glass' @('--ignore-certificate-errors','--allow-running-insecure-content','--test-type'); 'LAUNCH glass' } else { 'REUSE glass' }
if(-not (Has-Window '*Overlooker*')){ Launch 'http://127.0.0.1:4000/' 'ch_overlook' @(); 'LAUNCH overlooker' } else { 'REUSE overlooker' }

Start-Sleep 13

$colony  = (Get-Process chrome | Where-Object { $_.MainWindowTitle -like '*Prismarine*' }     | Select-Object -First 1).MainWindowTitle
$glass   = (Get-Process chrome | Where-Object { $_.MainWindowTitle -like '*Glass Cockpit*' }   | Select-Object -First 1).MainWindowTitle
$overlook= (Get-Process chrome | Where-Object { $_.MainWindowTitle -like '*Overlooker*' }      | Select-Object -First 1).MainWindowTitle

$obj=[ordered]@{ colony=$colony; glass=$glass; overlook=$overlook }
$json=$obj | ConvertTo-Json -Compress
$path = Join-Path $PSScriptRoot 'channels.json'
[System.IO.File]::WriteAllText($path,$json,(New-Object System.Text.UTF8Encoding $false))
'channels.json:'; $json
'=== titled chrome windows ==='
Get-Process chrome | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id,MainWindowTitle | Format-Table -AutoSize | Out-String