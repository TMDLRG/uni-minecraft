# restream.ps1 - dual-target fan-out: OBS encodes ONCE -> rtmp://127.0.0.1:1935 (key "uni",
# MediaMTX) -> one supervised ffmpeg -c copy push per platform (YouTube + Twitch independent).
# ASCII ONLY in this file: PS 5.1 reads BOM-less files as ANSI and a UTF-8 em-dash decodes
# into a string-breaking smart quote.
#
#   $env:YT_KEY = '<youtube stream key>'        # set in THIS shell only
#   $env:TWITCH_KEY = '<twitch stream key>'
#   powershell -File viewer\restream.ps1        # start everything
#   powershell -File viewer\restream.ps1 -Status
#   powershell -File viewer\restream.ps1 -Stop
#
# KEYS ARE NEVER WRITTEN TO DISK. The wrapper command lines carry only $env:VAR references,
# but ffmpeg itself receives the keyed URL in its argv (there is no other way to hand ffmpeg an
# output target). Local process inspectors CAN see it, so the operating rule on show nights is:
# never put Task Manager / Process Explorer / a Win32_Process query on a shared or captured
# screen while the fan-out runs. ffmpeg output is discarded (it echoes the keyed URL on errors).
param([switch]$Status,[switch]$Stop)
$ErrorActionPreference='SilentlyContinue'
$mtx='C:\Users\mpolz\tools\mediamtx\mediamtx.exe'
$cfg = Join-Path $PSScriptRoot 'mediamtx_local.yml'

if($Status){
  try{ $p=Invoke-RestMethod http://127.0.0.1:9997/v3/paths/list
    if($p.items.Count -eq 0){ 'mediamtx up, no publisher yet (OBS not pushing)' }
    foreach($i in $p.items){ "path=$($i.name) ready=$($i.ready) readers=$($i.readers.Count)  (YouTube+Twitch => 2 readers)" }
  } catch { 'mediamtx API not reachable - restreamer not running' }
  $fans = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*uni_fanout_*' }
  "fan-out loops running: $(@($fans).Count)"
  # a healthy push keeps one ffmpeg alive per platform; flapping (count changing between
  # samples) usually means a bad/expired stream key - re-set env and re-run this script
  $ff1 = @(Get-CimInstance Win32_Process -Filter "Name='ffmpeg.exe'" | Where-Object { $_.CommandLine -like '*rtmp://127.0.0.1:1935/uni*' }).Count
  Start-Sleep 5
  $ff2 = @(Get-CimInstance Win32_Process -Filter "Name='ffmpeg.exe'" | Where-Object { $_.CommandLine -like '*rtmp://127.0.0.1:1935/uni*' }).Count
  if($ff1 -eq $ff2){ "ffmpeg pushers alive: $ff1 (stable)" } else { "ffmpeg pushers FLAPPING ($ff1 -> $ff2) - likely a bad stream key or no publisher yet" }
  exit
}
if($Stop){
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*uni_fanout_*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Get-CimInstance Win32_Process -Filter "Name='ffmpeg.exe'" | Where-Object { $_.CommandLine -like '*rtmp://127.0.0.1:1935/uni*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Get-Process mediamtx | Stop-Process -Force
  'restreamer + fan-out loops stopped'
  exit
}

if(-not (Test-Path $mtx)){ "mediamtx.exe not found at $mtx"; exit 1 }
if(-not (Get-Command ffmpeg.exe -ErrorAction SilentlyContinue)){ 'ffmpeg.exe not on PATH - the hidden fan-out children would spin uselessly.'; exit 1 }
if(-not $env:YT_KEY -and -not $env:TWITCH_KEY){ 'NO KEYS: set $env:YT_KEY and/or $env:TWITCH_KEY in this shell first (never on disk).'; exit 1 }

$open = Test-NetConnection 127.0.0.1 -Port 1935 -WarningAction SilentlyContinue -InformationLevel Quiet
if(-not $open){ Start-Process $mtx -ArgumentList $cfg -WindowStyle Minimized; Start-Sleep 3; 'mediamtx started (:1935 ingest, 127.0.0.1:9997 api)' }
else { 'something already listening on :1935 - reusing' }

# fan-out children: key is read from INHERITED env inside the child, never appears in args
$loops = @(
  @{ tag='uni_fanout_youtube'; envName='YT_KEY';     url='rtmp://a.rtmp.youtube.com/live2/' },
  @{ tag='uni_fanout_twitch';  envName='TWITCH_KEY'; url='rtmp://live.twitch.tv/app/' }
)
foreach($l in $loops){
  $key = [Environment]::GetEnvironmentVariable($l.envName)
  if(-not $key){ "skip $($l.tag) (no $($l.envName))"; continue }
  $already = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*$($l.tag)*" }
  if($already){ "$($l.tag) already running"; continue }
  # single line, no double quotes inside: safe to wrap; the KEY is only ever read from the
  # child's inherited env ($env:YT_KEY / $env:TWITCH_KEY), never present in this command line
  $cmd = "`$tag='$($l.tag)'; while(`$true){ ffmpeg -hide_banner -loglevel error -i rtmp://127.0.0.1:1935/uni -c copy -f flv ('$($l.url)' + `$env:$($l.envName)) | Out-Null; Start-Sleep 3 }"
  Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -Command `"$cmd`""
  "fan-out loop started: $($l.tag)"
}
'Now push from OBS: server rtmp://127.0.0.1:1935  key "uni"  (studio.cjs `golive CONFIRM` does this).'
'Check readers with: powershell -File viewer\restream.ps1 -Status'