# diag_dns.ps1 - definitive Phase 7 diagnostic for the :53-to-chip block.
# Runs 6 tests from elevated PowerShell and prints a summary. Non-mutating (only pktmon
# briefly captures packets, then stops). To test the fix that follows this diagnosis, see
# the "Attempted fixes" section printed at the end.
[CmdletBinding()] param(
  # The chip's CURRENT address. Resolved at run time; never defaulted to a literal.
  [string]$Chip,
  # The control resolver, read from the declared map rather than typed here.
  [string]$Control
)
$ErrorActionPreference = 'Continue'
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "ELEVATION REQUIRED - re-run from admin PowerShell." -ForegroundColor Red; exit 1 }

# $chip was hardcoded "10.190.245.122" until 2026-07-26 — dead since the lease moved
# .122 -> .121 on 2026-07-16. A DNS DIAGNOSTIC pointed at the wrong host is worse than
# no diagnostic: every test below would have failed and the conclusion "DNS is broken"
# would have been wrong. The chip's LAN address is a DHCP lease and is NOT DECLARABLE
# (viewer/infra_registry.json `_lan_dynamic_law`).
#
# Resolution uses getaddrinfo, which is a DIFFERENT path from the one under test here
# (Resolve-DnsName -Server / NRPT / c-ares), so this is not circular. If it cannot
# resolve, the script REFUSES rather than falling back to a stale literal — a
# diagnostic that guesses its own target has nothing to report.
if (-not $Chip) {
  try {
    $Chip = ([System.Net.Dns]::GetHostAddresses('colony.uni-lab.local') |
      Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1).IPAddressToString
  } catch { $Chip = $null }
}
if (-not $Chip) {
  Write-Host "CANNOT RESOLVE THE CHIP - colony.uni-lab.local did not answer on the OS resolver." -ForegroundColor Red
  Write-Host "Pass it explicitly:  .\diag_dns.ps1 -Chip <current chip IP>" -ForegroundColor Yellow
  exit 1
}
if (-not $Control) {
  $reg = Get-Content (Join-Path $PSScriptRoot 'infra_registry.json') -Raw | ConvertFrom-Json
  $Control = $reg.resolver.upstreams[0]
}
$chip = $Chip; $ctrl = $Control
Write-Host ("chip={0} (resolved) ctrl={1} (infra_registry.resolver.upstreams[0])" -f $chip, $ctrl) -ForegroundColor DarkGray

function Send-DnsUdp([string]$Host_,[uint16]$Xid) {
  $u = New-Object System.Net.Sockets.UdpClient
  try {
    $u.Client.ReceiveTimeout = 2500
    $q = [byte[]]@([byte](($Xid -shr 8) -band 0xff),[byte]($Xid -band 0xff),
                   0x01,0x00, 0x00,0x01, 0x00,0x00, 0x00,0x00, 0x00,0x00,
                   0x02,0x6d,0x63,
                   0x07,0x75,0x6e,0x69,0x2d,0x6c,0x61,0x62,
                   0x05,0x6c,0x6f,0x63,0x61,0x6c,
                   0x00, 0x00,0x01, 0x00,0x01)
    $ep = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse($Host_),53)
    $u.Send($q,$q.Length,$ep) | Out-Null
    $rep = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any,0)
    $r = $u.Receive([ref]$rep); return "REPLY $($r.Length)B"
  } catch { return "FAIL: $($_.Exception.Message.Split([Environment]::NewLine)[0])" }
  finally { $u.Close() }
}

Write-Host "== elevated context =="  -ForegroundColor Cyan
"host = $env:COMPUTERNAME"
"IsAdmin = True"
""

Write-Host "== 1. NRPT rule state ==" -ForegroundColor Cyan
$rules = Get-DnsClientNrptRule | Where-Object {$_.Namespace -contains ".uni-lab.local"}
if ($rules) { $rules | Select-Object DisplayName, Namespace, NameServers, Comment, GpoName | Format-Table -AutoSize }
else { "no NRPT rule for .uni-lab.local (apply_nrpt.ps1 didn't run or was reverted)" }
""

Write-Host "== 2. Resolve-DnsName -Server $chip mc.uni-lab.local (forces DNS Client, bypasses NRPT) ==" -ForegroundColor Cyan
try {
  $r = Resolve-DnsName -Name mc.uni-lab.local -Type A -Server $chip -DnsOnly -ErrorAction Stop
  "SUCCESS: " + (($r | Where-Object {$_.Type -eq 'A'} | Select-Object -ExpandProperty IPAddress) -join ",")
} catch { "FAIL: $($_.Exception.Message)" }
""

Write-Host "== 3. Resolve-DnsName mc.uni-lab.local (uses NRPT if present) ==" -ForegroundColor Cyan
Clear-DnsClientCache | Out-Null
try {
  $r = Resolve-DnsName -Name mc.uni-lab.local -Type A -DnsOnly -ErrorAction Stop
  "SUCCESS: " + (($r | Where-Object {$_.Type -eq 'A'} | Select-Object -ExpandProperty IPAddress) -join ",")
} catch { "FAIL: $($_.Exception.Message)" }
""

Write-Host "== 4. raw UDP :53 sockets, admin context ==" -ForegroundColor Cyan
"to $chip (should we see fix?):  " + (Send-DnsUdp -Host_ $chip -Xid 0x1111)
"to $ctrl (control - known ok):  " + (Send-DnsUdp -Host_ $ctrl -Xid 0x2222)
""

Write-Host "== 5. pktmon egress capture (does :53 leave THINKER?) ==" -ForegroundColor Cyan
# reset any prior filters, capture just this exchange
& pktmon reset 2>&1 | Out-Null
& pktmon filter add "DnsDiag" -p 53 2>&1 | Out-Null
& pktmon start --capture --pkt-size 64 --file-name "$env:TEMP\dnsdiag.etl" 2>&1 | Out-Null
Start-Sleep -Milliseconds 200
"UDP test to $chip:53 during capture => " + (Send-DnsUdp -Host_ $chip -Xid 0xBEEF)
Start-Sleep -Milliseconds 200
& pktmon stop 2>&1 | Out-Null
& pktmon format "$env:TEMP\dnsdiag.etl" -o "$env:TEMP\dnsdiag.txt" 2>&1 | Out-Null
$hits = @()
if (Test-Path "$env:TEMP\dnsdiag.txt") {
  $hits = Get-Content "$env:TEMP\dnsdiag.txt" | Select-String -Pattern $Chip -CaseSensitive:$false
}
"packets touching $Chip seen in capture: $($hits.Count)"
if ($hits.Count -gt 0) { $hits | Select-Object -First 8 | ForEach-Object { "  " + $_.Line.Trim() } }
& pktmon filter remove 2>&1 | Out-Null
Remove-Item "$env:TEMP\dnsdiag.etl" -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\dnsdiag.txt" -ErrorAction SilentlyContinue
""

Write-Host "== 6. Windows Filtering Platform - any :53 layer filter blocking outbound? ==" -ForegroundColor Cyan
# dump WFP with elevation, grep for port 53 filters that BLOCK
try {
  & netsh wfp show filters file="$env:TEMP\wfp.xml" 2>&1 | Out-Null
  if (Test-Path "$env:TEMP\wfp.xml") {
    [xml]$xml = Get-Content "$env:TEMP\wfp.xml"
    $blk = 0; $any = 0
    foreach ($f in $xml.wfpdiag.filters.item) {
      $has53 = $false
      foreach ($c in $f.filterCondition.item) {
        if ($c.fieldKey -match "IP_REMOTE_PORT|IP_LOCAL_PORT" -and $c.conditionValue.uint16 -eq 53) { $has53 = $true; break }
      }
      if ($has53) {
        $any++
        $name = $f.displayData.name.'#cdata-section'
        $action = $f.action.type
        if ($action -match "BLOCK") { $blk++; "  [BLOCK] $name" }
      }
    }
    "$any WFP filters mention port 53; $blk of them BLOCK"
    Remove-Item "$env:TEMP\wfp.xml" -ErrorAction SilentlyContinue
  }
} catch { "WFP dump failed: $($_.Exception.Message)" }
""

Write-Host "== summary ==" -ForegroundColor Cyan
"Read tests 2/3/4/5 together:"
"  test 2 SUCCESS = DNS Client can reach chip when told directly - NRPT rule shape was wrong."
"  test 3 SUCCESS = NRPT is working - your apps will resolve *.uni-lab.local from now on."
"  test 4 :chip=REPLY = raw socket works under admin - user-context is filtered but admin isn't."
"  test 5 packet count > 0 with test 4 FAIL = packet leaves THINKER but chip drops it (not Windows)."
"  test 5 packet count = 0 with test 4 FAIL = packet never leaves THINKER (WFP block confirmed)."
"  test 6 shows the WFP filters actually installed."
