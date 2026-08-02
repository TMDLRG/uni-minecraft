# apply_nrpt.ps1 -- Phase 7 (THINKER NRPT) executor + reverser.
# Namespace-scoped rule that routes .uni-lab.local queries to the chip's dnsmasq
# container at its CURRENT address -- see the -DnsServer parameter below, which is the
# one place that address is written. NECESSARY -- without it, Windows' DNS Client sends
# .uni-lab.local queries to the LAN's normal DNS which doesn't know them -- but NOT
# SUFFICIENT on its own.
#
# The other half of the fix lived on the CHIP: `table inet filter/trusted` was default-drop
# and had no :53 accept, silently killing incoming LAN queries. That was patched at runtime
# during Phase 7 (nft add rule ...) and persistence-staged at /etc/uni/dns/nftables.conf.new;
# see production/docs/receipts/dns_phase0_4_2026-07-12.md ("Corrected root cause") for the
# full evidence trail -- including the pktmon capture that overturned the earlier "Windows
# drops :53 to non-configured DNS servers" hypothesis.
#
# NRPT (Name Resolution Policy Table) is namespace-scoped: it routes ONLY queries for
# ".uni-lab.local" to the chip's CURRENT address (the -DnsServer default below; this line
# read 10.190.245.122 until 2026-07-26 while the default was already .121). Every other
# name still uses Windows' regular DNS chain.
# Fully reversible via `.\apply_nrpt.ps1 -Remove`.
#
# The ADD and -Remove paths MUST be run from an ELEVATED PowerShell (right-click PowerShell ->
# "Run as administrator"); Add-DnsClientNrptRule / Remove-DnsClientNrptRule refuse non-admin.
#
# -VerifyOnly is a READ-ONLY dry-check that needs NO elevation (Get-DnsClientNrptRule and
# Resolve-DnsName are both read-only), so a second THINKER-side box/operator can confirm the rule
# without an admin shell. It skips both the add and the remove blocks (and the cache flush), reports
# whether a matching rule currently exists, then runs the same GATE 7 verify block. If BOTH
# -VerifyOnly and -Remove are passed, -VerifyOnly WINS (read-only takes precedence).
[CmdletBinding()]
param(
  [switch]$Remove,
  [switch]$VerifyOnly,
  # INTERIM default (self-net 2026-07-15): the chip's CURRENT LAN IP. This is a transient uplink,
  # not a durable pin -- the P1 reconciliation beacon supplies the live chip IP and re-runs this.
  # Prefer passing -DnsServer <current chip IP> explicitly; never treat this default as authoritative.
  [string]$DnsServer = "10.190.245.121",
  [string]$Namespace = ".uni-lab.local",
  [string]$DisplayName = "uni-lab-local-dns"
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $VerifyOnly) {
  Write-Host "ELEVATION REQUIRED. Close this window, right-click PowerShell, choose 'Run as administrator', re-run this script. (Read-only? re-run with -VerifyOnly, which needs no elevation.)" -ForegroundColor Red
  exit 1
}

if ($VerifyOnly) {
  # -VerifyOnly WINS over -Remove: read-only takes precedence. No add, no remove, no cache flush -
  # just report the current rule state, then fall through to the GATE 7 verify block below.
  Write-Host "== VerifyOnly: dry-check, no mutation ==" -ForegroundColor Cyan
  $existing = Get-DnsClientNrptRule | Where-Object { $_.Namespace -contains $Namespace -and $_.NameServers -contains $DnsServer }
  if ($existing) { Write-Host "  a matching NRPT rule EXISTS ($($existing.Name): $Namespace -> $DnsServer)" -ForegroundColor Green }
  else { Write-Host "  no matching NRPT rule present ($Namespace -> $DnsServer)" -ForegroundColor Yellow }
}
elseif ($Remove) {
  Write-Host "== Removing NRPT rule for $Namespace ==" -ForegroundColor Yellow
  $existing = Get-DnsClientNrptRule | Where-Object { $_.Namespace -contains $Namespace -and $_.NameServers -contains $DnsServer }
  if (-not $existing) { Write-Host "  no matching rule to remove"; exit 0 }
  foreach ($r in $existing) { Remove-DnsClientNrptRule -Name $r.Name -Force }
  Write-Host "  removed $($existing.Count) rule(s)" -ForegroundColor Green
  exit 0
}
else {
  Write-Host "== Phase 7: NRPT rule $Namespace -> $DnsServer ==" -ForegroundColor Cyan

  # idempotent: if a matching rule already exists, don't stack duplicates
  $existing = Get-DnsClientNrptRule | Where-Object { $_.Namespace -contains $Namespace -and $_.NameServers -contains $DnsServer }
  if ($existing) {
    Write-Host "  rule already present ($($existing.Name)) - skipping add"
  }
  else {
    Add-DnsClientNrptRule -Namespace $Namespace -NameServers $DnsServer -DisplayName $DisplayName | Out-Null
    Write-Host "  ADDED NRPT rule '$DisplayName': $Namespace -> $DnsServer" -ForegroundColor Green
  }

  Start-Sleep -Milliseconds 400
  Clear-DnsClientCache
}

# GATE 7 verification: resolve two names, one internal-only + one that came from the map
Write-Host ""
Write-Host "== GATE 7 verify ==" -ForegroundColor Cyan
# colony resolves to THE CHIP, i.e. whatever IP NRPT points at ($DnsServer) -- no hardcoded chip
# literal (self-net 2026-07-15). mc stays on the COLNET publish IP.
$expected = @{ "mc.uni-lab.local" = "10.89.1.40"; "colony.uni-lab.local" = $DnsServer }
$allpass = $true
foreach ($n in $expected.Keys) {
  try {
    $r = Resolve-DnsName -Name $n -Type A -DnsOnly -QuickTimeout -ErrorAction Stop
    $got = ($r | Where-Object { $_.Type -eq 'A' } | Select-Object -ExpandProperty IPAddress) -join ","
    $ok = ($got -eq $expected[$n])
    if ($ok) { Write-Host ("  [PASS] {0,-28} -> {1}" -f $n, $got) -ForegroundColor Green }
    else { Write-Host ("  [MISMATCH] {0,-28} -> {1}  (expected {2})" -f $n, $got, $expected[$n]) -ForegroundColor Red; $allpass = $false }
  }
  catch {
    Write-Host ("  [FAIL] {0,-28} -> {1}" -f $n, $_.Exception.Message) -ForegroundColor Red
    $allpass = $false
  }
}

Write-Host ""
if ($allpass) {
  Write-Host "GATE 7 PASS - THINKER can now resolve .uni-lab.local names via the chip's dnsmasq." -ForegroundColor Green
  Write-Host "Verify in the live-infra surface at http://127.0.0.1:8090/infra - the DNS drift panel"
  Write-Host "should now render 'fresh' instead of 'not_verified' for uni-lab.local names."
}
else {
  Write-Host "GATE 7 DID NOT FULLY PASS - review each row above. To revert:  .\apply_nrpt.ps1 -Remove" -ForegroundColor Yellow
  exit 2
}
