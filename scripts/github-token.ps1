$ErrorActionPreference = 'Stop'

# MoneyNote: open GitHub's pre-filled classic-token page, then save the
# token the user copied. The token is never printed in full and never
# leaves this computer.

$root = Split-Path -Parent $PSScriptRoot
$secrets = Join-Path $root 'secrets'
$tokenFile = Join-Path $secrets 'token.txt'
$url = 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=MoneyNote-oneclick'

New-Item -ItemType Directory -Force -Path $secrets | Out-Null

Write-Host ''
Write-Host '============================================================'
Write-Host '  MoneyNote - GitHub token helper'
Write-Host '============================================================'
Write-Host ''
Write-Host 'A browser page will open. It is already filled in for you:'
Write-Host ''
Write-Host '  1. Log in to GitHub (create a free account if needed).'
Write-Host '  2. Scroll to the bottom and click the green "Generate token".'
Write-Host '  3. Click the copy icon next to the token (ghp_...).'
Write-Host '  4. Come back to this window and press Enter.'
Write-Host ''
Write-Host 'The token is shown only once. Do not paste it into chat or email.'
Write-Host ''
Write-Host "Page: $url"
Write-Host ''

try {
  Start-Process $url | Out-Null
} catch {
  Write-Host 'Could not open the browser automatically. Open the page above manually.' -ForegroundColor Yellow
}

# Start with an empty clipboard so an old unrelated value cannot be saved.
try { Set-Clipboard -Value ' ' } catch {}

$pattern = '(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,})'

for ($attempt = 1; $attempt -le 3; $attempt++) {
  Read-Host 'Press Enter after copying the token' | Out-Null

  $clip = ''
  try {
    $clip = (Get-Clipboard -Raw -ErrorAction Stop)
  } catch {
    $clip = ''
  }
  if (-not $clip) {
    Write-Host 'Clipboard is empty. Copy the token first, then try again.' -ForegroundColor Yellow
    continue
  }

  $match = [regex]::Match($clip, $pattern)
  if (-not $match.Success) {
    Write-Host 'That does not look like a GitHub token. Copy only the ghp_... value.' -ForegroundColor Yellow
    continue
  }

  $token = $match.Value
  [IO.File]::WriteAllText($tokenFile, $token, [Text.Encoding]::ASCII)
  try { Set-Clipboard -Value ' ' } catch {}

  $head = $token.Substring(0, [Math]::Min(8, $token.Length))
  $tail = $token.Substring([Math]::Max(0, $token.Length - 4))
  Write-Host ''
  Write-Host "Saved to secrets\token.txt  ($head...$tail)" -ForegroundColor Green

  try {
    $headers = @{
      Authorization = "Bearer $token"
      Accept = 'application/vnd.github+json'
      'User-Agent' = 'MoneyNote-token-helper'
    }
    $me = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $headers -TimeoutSec 20
    Write-Host "Verified GitHub account: $($me.login)" -ForegroundColor Green
  } catch {
    Write-Host 'Could not verify now (GitHub may be blocked on this network).' -ForegroundColor Yellow
    Write-Host 'The token is saved; delivery will try again.' -ForegroundColor Yellow
  }

  Write-Host ''
  Write-Host 'Next: double-click the delivery batch file (or return to it).'
  Write-Host ''
  exit 0
}

Write-Host ''
Write-Host 'No valid token was saved. Nothing was changed.' -ForegroundColor Red
Write-Host 'Double-click this helper again when you have copied the token.'
Write-Host ''
exit 1
