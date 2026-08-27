# launch_channels.ps1 - SUPERSEDED. It refuses to run. Read the next paragraph before "fixing" that.
#
# It brought up THREE channel windows. studio_channels.ps1 is a strict superset: the same three PLUS
# the WEB channel (CDP :9223) and the CLIP channel (:9224), and BOTH write the same
# viewer/channels.json. So running this one after the real bring-up does not add anything -- it
# OVERWRITES channels.json with the three-window subset and strands WEB and CLIP, which are the
# sources that carry every played film, every playlist and every browser shot on the programme.
# The failure is silent: the studio comes up, looks right, and two source bindings point at nothing.
#
# The live path never calls this file (studio_up.ps1:355 calls studio_channels.ps1). But
# docs/work_orders/producer_golive.md:46 still instructed an agent to run it during bring-up, and an
# agent following a work order is exactly who would not notice what it cost. Refusing here is
# belt-and-braces with fixing that document, because the document can be copied and this cannot.
#
# Kept rather than deleted: the file is cited by five documents and by
# STUDIO_HARDENING_DD_TDD_PLAN.md:211 as a line reference. A deleted file makes those citations
# dangle; a refusing file makes them explain themselves.
#
# The original header, unchanged, for the record:
#   ensure the 3 broadcast channel windows exist (standalone real Chrome, WebGL renders correctly),
#   reusing any already open. Writes viewer/channels.json with the EXACT window titles (preserves
#   unicode like the em-dash) for obs_stage.cjs to target via WGC.

if(-not $env:UNI_ALLOW_SUPERSEDED_LAUNCHER){
  Write-Host 'REFUSING: launch_channels.ps1 is SUPERSEDED by viewer/studio_channels.ps1.'
  Write-Host ''
  Write-Host '  studio_channels.ps1 launches the same three channels PLUS the WEB (:9223) and CLIP'
  Write-Host '  (:9224) channels, and both write viewer/channels.json. Running this one overwrites'
  Write-Host '  that file with the three-window subset and silently strands WEB and CLIP -- the two'
  Write-Host '  sources that carry every film, playlist and browser shot on the programme.'
  Write-Host ''
  Write-Host '  Run instead:  powershell -ExecutionPolicy Bypass -File viewer\studio_channels.ps1'
  Write-Host '  Or bring the whole studio up:  powershell -File viewer\studio_up.ps1'
  Write-Host ''
  Write-Host '  If you genuinely need the old three-window behaviour, set UNI_ALLOW_SUPERSEDED_LAUNCHER=1.'
  exit 2
}

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

# colony cam is addressed BY NAME. 127.0.0.1:3020 was a LOCALHOST literal for a service that does
# not run on this box -- the colony runs on UNI-LAB per ADR-PROD-013 and this studio CAPTURES it.
#
# THE NAME IS uni-lab-lan.uni-lab.local, NOT colonycam.uni-lab.local, AND THE DIFFERENCE IS
# LOAD-BEARING. Corrected 2026-08-02: an earlier fix this same day pointed here at
# colonycam.uni-lab.local:3020, which was WRONG. Measured with the colony live:
# colonycam.uni-lab.local:3020 returned 0 bytes (dead/flaky) while uni-lab-lan.uni-lab.local:3020
# returned the 473-byte Prismarine viewer shell -- and the WORKING OVERLOOK view (producer :4200
# /stream) embeds its world through an iframe to exactly uni-lab-lan.uni-lab.local:3020. So the
# host that renders the world is the one OVERLOOK already proves, not the registry's colonycam
# alias. A window launched at colonycam showed a flat prismarine SKY with no world in it
# (PrintWindow, 2026-08-02) and captured as a solid frame the preflight black-test passed at 92%,
# because a flat colour is not black.
if(-not (Has-Window '*Prismarine*')){ Launch 'http://uni-lab-lan.uni-lab.local:3020/' 'ch_colony' @(); 'LAUNCH colony cam' } else { 'REUSE colony cam' }
# glass is addressed BY NAME. It was https://10.190.245.122/glass/ until 2026-07-26 --
# an address dead since the chip's lease moved .122 -> .121 on 2026-07-16, so every
# studio launch opened a browser window at a host that had stopped answering ten days
# earlier. The chip's LAN address is a DHCP lease and is NOT DECLARABLE
# (viewer/infra_registry.json `_lan_dynamic_law`); the name is. This is real Chrome,
# which resolves .local through the OS resolver -- measured 2026-07-26,
# glass.uni-lab.local -> 10.190.245.121.
if(-not (Has-Window '*Glass Cockpit*')){ Launch 'https://glass.uni-lab.local/glass/' 'ch_glass' @('--ignore-certificate-errors','--allow-running-insecure-content','--test-type'); 'LAUNCH glass' } else { 'REUSE glass' }
# OVERLOOK is THE UNI PRODUCER'S VIEW and it was pointed at a machine that does not run it.
# 127.0.0.1:4000 was a LOCALHOST literal; Phoenix/SP.Producer runs on UNI-LAB. Measured
# 2026-08-02 with a GetSourceScreenshot: the OVERLOOK source was a Chrome "site can't be
# reached" error page -- and it PASSED preflight at 100% non-black, because a WHITE error page
# is the least black thing a browser can render. The producer itself was never dead:
# producer.uni-lab.local:4200/producer/health returned driver=producer, star=UNI-3-1, frame 12,
# 20 TPS, last_action=beat_social. The studio was looking at the wrong box.
# /stream is the composed view -- the WebGL camera iframe plus the per-UNI insight cards and
# narration -- and its title is the one the window-capture binds to.
if(-not (Has-Window '*Overlooker*')){ Launch 'http://producer.uni-lab.local:4200/stream' 'ch_overlook' @(); 'LAUNCH overlooker' } else { 'REUSE overlooker' }

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