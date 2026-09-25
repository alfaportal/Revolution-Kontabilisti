param(
  [Parameter(Mandatory = $true)]
  [string]$Dir
)

$ErrorActionPreference = "Continue"
if (-not (Test-Path -LiteralPath $Dir)) { exit 2 }

try {
  icacls $Dir /grant "Administrators:(F)" "SYSTEM:(F)" /Q 2>$null | Out-Null
  icacls $Dir /inheritance:r /Q 2>$null | Out-Null
  icacls $Dir /grant:r "SYSTEM:(OI)(CI)F" /grant:r "Administrators:(OI)(CI)F" /grant:r "Users:(OI)(CI)RX" /grant:r "Authenticated Users:(OI)(CI)RX" /T /Q 2>$null | Out-Null
  attrib +H $Dir 2>$null | Out-Null
  exit 0
} catch {
  exit 1
}
