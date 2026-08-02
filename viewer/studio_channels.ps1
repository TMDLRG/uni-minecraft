# studio_channels.ps1 - ensure the 5 broadcast channel windows exist (standalone real Chrome,
# WebGL renders correctly), reusing any already open. Superset of launch_channels.ps1: adds the
# WEB feed channel (CDP :9223, navigable by studio.cjs) and the CLIP channel (CDP :9224,
# autoplay allowed, for YouTube clips). Writes viewer/channels.json with the EXACT window
# titles for studio_stage.cjs to target via WGC. ASCII ONLY in this file: PS 5.1 reads
# BOM-less files as ANSI and a UTF-8 em-dash decodes into a string-breaking smart quote.
#
# SAFETY: every channel window is resolved by its dedicated Chrome PROFILE (user-data-dir tag),
# never by a global title search - the operator's personal Chrome can never be captured.
# The script POLLS until every window has a title (max 60s) and FAILS HARD (exit 1, channels.json
# untouched) if any core channel never titles - a silent empty title would let OBS latch an
# arbitrary window onto a public scene.
$ErrorActionPreference='SilentlyContinue'
$chrome='C:\Program Files\Google\Chrome\Application\chrome.exe'
$anti=@('--ignore-gpu-blocklist','--enable-gpu-rasterization','--use-angle=d3d11',
  '--disable-features=CalculateNativeWinOcclusion','--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding','--disable-background-timer-throttling',
  '--no-first-run','--disable-infobars','--disable-session-crashed-bubble')

function Browser-Proc($tag){
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
    Where-Object { $_.CommandLine -like "*$tag*" -and $_.CommandLine -notlike '*--type=*' } |
    Select-Object -First 1
}
function Title-Of-Profile($tag){
  $p = Browser-Proc $tag
  if ($p) { (Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue).MainWindowTitle } else { '' }
}
# The host Chrome shows in the title bar WHILE a page loads (before its <title> resolves). Recording
# that transient host title into channels.json is the 2026-07-15 COLONY-black bug: OBS latched the
# match 'uni-lab-lan.uni-lab.local' but the page's real title is 'Prismarine Viewer', so WGC found no
# window and captured pure black. Reject any title that is (or starts with) the channel's own host.
function Host-Of($url){ if ($url -match '^[a-z]+://([^:/]+)') { $Matches[1] } else { '' } }
function Launch($url,$profile,$extra){
  # P3.4 (2026-07-12): off-screen at -32000,-32000 (WGC captures hidden/off-screen windows fine).
  # CalculateNativeWinOcclusion is already disabled in $anti above so Chrome does not throttle the
  # off-screen tab.
  $a=@("--app=$url","--user-data-dir=C:\Users\mpolz\AppData\Local\Temp\$profile","--window-size=1920,1080","--window-position=-32000,-32000")+$extra+$anti
  Start-Process -FilePath $chrome -ArgumentList $a
}

# WebGL/cert channels need a real Chrome window (they render on the Intel iGPU) because OBS's own
# CEF browser sources render WebGL to a BLACK frame:
#   colony   = prismarine WebGL hero (:3020, the raw camera);
#   glass    = self-signed HTTPS + WebGL globe (CEF can't accept the cert);
#   overlook = THE UNI PRODUCER'S composed page (:4200/stream = the :3020 WebGL camera iframe +
#              the live per-UNI insight/health cards, ONE mind). RESTORED as a window-capture
#              2026-07-15: this is exactly the WS1 fallback the comment below predicted -- when
#              cap_overlook was a CEF browser source at :4200/stream its WebGL camera measurably
#              rendered black (grabbed off OBS, pure #000), while the cards (HTML) rendered; a real
#              Chrome window renders BOTH. web / clip stay OBS BROWSER SOURCES (2D, no WebGL) on the
#              NVIDIA -- the WS1 iGPU de-saturation win is preserved for them.
$channels = @(
  # colony gets a CDP port so throttle_colony.cjs can cap its render loop to 30fps (matches OBS
  # capture; halves its greedy iGPU use - run `node viewer\throttle_colony.cjs` after launch).
  @{ key='colony';   tag='ch_colony';   url='http://uni-lab-lan.uni-lab.local:3020';        extra=@('--remote-debugging-port=9220') },  # colony cam :3020 on UNI-LAB, captured over the LAN. BY NAME (self-net 2026-07-15): the chip LAN IP is a transient uplink; NRPT resolves uni-lab-lan.uni-lab.local -> current chip, verified 200 in Chrome's OS resolver. Do NOT re-pin an IP literal.
  @{ key='glass';    tag='ch_glass';    url='https://uni-lab-lan.uni-lab.local/glass/';     extra=@('--ignore-certificate-errors','--allow-running-insecure-content','--test-type') },
  @{ key='overlook'; tag='ch_overlook'; url='http://uni-lab-lan.uni-lab.local:4200/stream'; extra=@('--remote-debugging-port=9221') }  # uni-producer composed page (camera + insight/health cards). BY NAME (self-net 2026-07-15): the earlier CEF-can't-resolve-.local finding (73bd89c) is stale -- names resolve via NRPT now (curl + Chrome OS resolver both 200); name survives DHCP moves, an IP literal does not.
)

foreach($c in $channels){
  if (Browser-Proc $c.tag) { "REUSE $($c.key)" }
  else { Launch $c.url $c.tag $c.extra; "LAUNCH $($c.key)" }
}

# poll until every channel window carries its REAL page title (not the transient host title Chrome
# shows mid-load, which would mis-latch OBS onto a window that no longer matches -> black), max 60s.
$titles=@{}
for($i=0; $i -lt 30; $i++){
  Start-Sleep 2
  $missing=@()
  foreach($c in $channels){
    $t = Title-Of-Profile $c.tag
    $chHost = Host-Of $c.url
    if ($t -and -not ($t -like "$chHost*")) { $titles[$c.key]=$t } else { $missing += $c.key }
  }
  if ($missing.Count -eq 0) { break }
}
if ($missing.Count -gt 0) {
  "FAIL: no window title after 60s for: $($missing -join ', ') - channels.json NOT written."
  "Check the pages actually load (colony needs :3020 up, glass/master-plan need the lab box)."
  exit 1
}

$obj=[ordered]@{ colony=$titles.colony; glass=$titles.glass; overlook=$titles.overlook }
$json=$obj | ConvertTo-Json -Compress
$path = Join-Path $PSScriptRoot 'channels.json'
[System.IO.File]::WriteAllText($path,$json,(New-Object System.Text.UTF8Encoding $false))
'channels.json:'; $json
'=== channel windows (by profile) ==='
foreach($c in $channels){ "{0,-9} {1}" -f $c.key, $titles[$c.key] }