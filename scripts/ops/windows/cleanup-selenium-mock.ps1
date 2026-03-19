<#
.SYNOPSIS
Kill the entire process tree started by `npm run test:selenium:mock`.

.DESCRIPTION
This is a standalone cleanup helper for Windows. It tries to:
1) Find the wrapper process by searching for `runSeleniumMock.mjs` in the CommandLine.
2) Kill that wrapper and its descendant process tree.
3) If the wrapper is not found, fall back to killing processes whose CommandLine matches
   common patterns for `shopify app dev`, `@getverdict/mock-bridge`, and Selenium/Vitest/Chrome.

.PARAMETER Force
Skip prompts and kill with force.

.PARAMETER DryRun
Print what it would kill but do not actually kill anything.

.EXAMPLE
  ./cleanup-selenium-mock.ps1 -DryRun
  ./cleanup-selenium-mock.ps1 -Force

.VERIFICATION CHECKLIST
After running `npm run test:selenium:mock` (or any failure/interrupt), run this script,
then confirm:
- No listener remains on the theme dev port `9294`
  netstat -ano | findstr :9294
- No listener remains on the mock-bridge admin/UI port (often `3080`, but mock-bridge can pick others)
  netstat -ano | findstr :3080
- No lingering processes:
  tasklist | findstr shopify
  tasklist | findstr mock-bridge
  tasklist | findstr vitest
#>

param(
  [switch]$Force,
  [switch]$DryRun,
  [switch]$Verbose
)

$ErrorActionPreference = "Stop"

$WrapperNeedle = "runSeleniumMock.mjs"
$Patterns = @(
  @{ Name = "shopify app dev"; Needle = "shopify app dev" },
  @{ Name = "mock-bridge"; Needle = "@getverdict/mock-bridge" },
  @{ Name = "vitest selenium"; Needle = "vitest run -c vitest.selenium.config.js" },
  @{ Name = "vitest selenium"; Needle = "vitest.selenium" },
  @{ Name = "chromedriver"; Needle = "chromedriver" },
  @{ Name = "selenium-webdriver"; Needle = "selenium-webdriver" }
)

function Get-CommandLineMatches {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Needles
  )

  # Win32_Process.CommandLine can be null for some system processes.
  $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -ne $null }

  $matches = @()
  foreach ($needle in $Needles) {
    $subset = $procs | Where-Object { $_.CommandLine -like "*$needle*" }
    foreach ($p in $subset) {
      $matches += [pscustomobject]@{
        Pid = [int]$p.ProcessId
        ImageName = $p.Name
        CommandLine = $p.CommandLine
        Needle = $needle
      }
    }
  }

  return $matches
}

function Confirm-Action {
  param([Parameter(Mandatory = $true)][string]$Message)

  if ($Force) { return $true }
  if ($DryRun) { return $false }

  $answer = Read-Host "$Message (y/N)"
  return ($answer -match "^(?i:y|yes)$")
}

function Invoke-KillPidTree {
  param(
    [Parameter(Mandatory = $true)]
    [int]$ProcessId,
    [Parameter(Mandatory = $true)]
    [string]$Reason
  )

  Write-Host "Killing PID tree: pid=$ProcessId ($Reason)"
  if ($DryRun) { return }

  # /T: kill child processes too, /F: force
  # taskkill can exit non-zero (and print) if the PID has already exited.
  # We treat that as non-fatal because the caller may be iterating multiple PIDs.
  & taskkill /PID $ProcessId /T /F 2>$null | Out-Null
}

function Get-DescendantsByParent {
  param([Parameter(Mandatory = $true)][int]$ProcessId)

  $desc = New-Object System.Collections.Generic.HashSet[int]
  $queue = New-Object System.Collections.Generic.Queue[int]
  $queue.Enqueue($ProcessId)

  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$current" -ErrorAction SilentlyContinue
    foreach ($c in $children) {
      $childPid = [int]$c.ProcessId
      if ($desc.Add($childPid)) {
        $queue.Enqueue($childPid)
      }
    }
  }

  # We included the root's descendants; exclude the root pid itself if present.
  $null = $desc.Remove($ProcessId) | Out-Null
  return @($desc)
}

Write-Host "cleanup-selenium-mock.ps1"
Write-Host "Force=$Force DryRun=$DryRun"

$wrapperMatches = Get-CommandLineMatches -Needles @($WrapperNeedle)
$wrapperPids = $wrapperMatches | Select-Object -ExpandProperty Pid -Unique

if ($wrapperPids.Count -gt 0) {
  Write-Host "Found wrapper process(es):"
  $wrapperMatches | Sort-Object Pid | Select-Object Pid,ImageName,Needle -Unique | ForEach-Object {
    Write-Host ("  - {0} ({1})" -f $_.Pid, $_.ImageName)
  }

  $do = Confirm-Action -Message "Kill wrapper process trees for $($wrapperPids.Count) PID(s)?"
  if ($do) {
    foreach ($wrapperPid in $wrapperPids) {
      Invoke-KillPidTree -ProcessId $wrapperPid -Reason "wrapper $WrapperNeedle"
    }
  } else {
    Write-Host "Skipped killing (user declined or DryRun)."
  }
  exit 0
}

Write-Host "Wrapper not found. Falling back to pattern matches..."

$needles = $Patterns | ForEach-Object { $_.Needle }
$matches = Get-CommandLineMatches -Needles $needles

if ($matches.Count -eq 0) {
  Write-Host "No matching processes found."
  exit 0
}

$unique = $matches | Select-Object Pid,ImageName,Needle | Sort-Object Pid -Unique
Write-Host "Found matching processes:"
$unique | ForEach-Object {
  Write-Host ("  - {0} ({1}) match={2}" -f $_.Pid, $_.ImageName, $_.Needle)
}

$pidsToKill = $unique | Select-Object -ExpandProperty Pid -Unique
$do = Confirm-Action -Message "Kill $($pidsToKill.Count) matched PID(s)?"
if ($do) {
  foreach ($fallbackPid in $pidsToKill) {
    Invoke-KillPidTree -ProcessId $fallbackPid -Reason "pattern fallback"
  }
} else {
  Write-Host "Skipped killing (user declined or DryRun)."
}

Write-Host "Done."

