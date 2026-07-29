param(
  [Parameter(Mandatory = $true)][string]$CandidateDirectory,
  [Parameter(Mandatory = $true)][ValidateSet("windows10", "windows11")][string]$Machine,
  [string]$PreviousInstallerUrl
)

$ErrorActionPreference = "Stop"
$package = Get-Content (Join-Path $PSScriptRoot "..\package.json") -Raw | ConvertFrom-Json
$version = $package.version
$setup = Join-Path $CandidateDirectory "GBlockParty-Chromux-Setup-$version-x64.exe"
$appRoot = Join-Path $env:LOCALAPPDATA "GBlockPartyChromux"
$profileRoot = Join-Path $env:APPDATA "chromux"
$stateRoot = Join-Path $env:USERPROFILE ".chromux"
$metadata = Get-Content (Join-Path $CandidateDirectory "build-metadata.json") -Raw | ConvertFrom-Json
$expectedPublisher = $metadata.signerPublisher
if (-not $expectedPublisher) { throw "Candidate metadata is missing signerPublisher" }

function Assert-SignedBinary([System.IO.FileInfo]$File) {
  if ($File.Length -le 0) { throw "Binary is empty: $($File.FullName)" }
  $signature = Get-AuthenticodeSignature -LiteralPath $File.FullName
  if ($signature.Status -ne "Valid") {
    throw "Authenticode trust failed for $($File.FullName): $($signature.Status) $($signature.StatusMessage)"
  }
  if (-not $signature.SignerCertificate -or $signature.SignerCertificate.Subject -ne $expectedPublisher) {
    throw "Unexpected publisher for $($File.FullName): $($signature.SignerCertificate.Subject)"
  }
  if (-not $signature.TimeStamperCertificate) {
    throw "RFC3161 timestamp is missing for $($File.FullName)"
  }
  & signtool.exe verify /pa /all /v $File.FullName | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "SignTool trust verification failed for $($File.FullName)" }
}

function Assert-InstalledSignatures {
  $binaries = Get-ChildItem -LiteralPath $appRoot -Recurse -File |
    Where-Object { $_.Extension -in @(".exe", ".dll", ".node") }
  if (-not ($binaries | Where-Object { $_.Name -eq "Update.exe" })) {
    throw "Installed Squirrel updater/uninstaller is missing"
  }
  if (-not ($binaries | Where-Object { $_.Name -eq "conpty.node" })) {
    throw "Installed node-pty conpty.node is missing"
  }
  foreach ($binary in $binaries) { Assert-SignedBinary $binary }
}

function Wait-ForPath([string]$Path, [bool]$Exists, [int]$Seconds = 60) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    if ((Test-Path -LiteralPath $Path) -eq $Exists) { return }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for path state Exists=$Exists: $Path"
}

function Find-ChromuxExecutable {
  Get-ChildItem -LiteralPath $appRoot -Recurse -Filter "GBlockParty Chromux.exe" -File -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1
}

function Install-Squirrel([string]$Installer) {
  $process = Start-Process -FilePath $Installer -ArgumentList "--silent" -PassThru -Wait
  if ($process.ExitCode -ne 0) { throw "Installer exited with code $($process.ExitCode): $Installer" }
  Wait-ForPath -Path $appRoot -Exists $true
  $exe = Find-ChromuxExecutable
  if (-not $exe) { throw "Installed Chromux executable was not found under $appRoot" }
  if (-not $exe.FullName.StartsWith($env:LOCALAPPDATA, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Chromux did not install per-user: $($exe.FullName)"
  }
  return $exe
}

function Smoke-Chromux([System.IO.FileInfo]$Executable) {
  $process = Start-Process -FilePath $Executable.FullName -ArgumentList "--smoke" -PassThru
  if (-not $process.WaitForExit(30000)) {
    Stop-Process -Id $process.Id -Force
    throw "Packaged Chromux smoke timed out: $($Executable.FullName)"
  }
  if ($process.ExitCode -ne 0) { throw "Packaged Chromux smoke exited with code $($process.ExitCode)" }
}

function Uninstall-Chromux {
  $update = Get-ChildItem -LiteralPath $appRoot -Recurse -Filter "Update.exe" -File -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $update) { throw "Squirrel Update.exe was not found under $appRoot" }
  $process = Start-Process -FilePath $update.FullName -ArgumentList "--uninstall", "-s" -PassThru -Wait
  if ($process.ExitCode -ne 0) { throw "Uninstaller exited with code $($process.ExitCode)" }
  Wait-ForPath -Path $appRoot -Exists $false
}

if (-not (Test-Path -LiteralPath $setup -PathType Leaf)) { throw "Candidate installer is missing: $setup" }
node (Join-Path $PSScriptRoot "windows-artifacts.js") verify $CandidateDirectory
if ($LASTEXITCODE -ne 0) { throw "Candidate hash verification failed" }

$build = [Environment]::OSVersion.Version.Build
if ([Environment]::Is64BitOperatingSystem -ne $true) { throw "UAT requires x64 Windows" }
if ($Machine -eq "windows10" -and $build -ne 19045) { throw "Windows 10 UAT requires build 19045; got $build" }
if ($Machine -eq "windows11" -and $build -lt 22000) { throw "Windows 11 smoke requires build 22000+; got $build" }

$wslRows = ((& wsl.exe --list --verbose) -replace "`0", "") -join "`n"
if ($LASTEXITCODE -ne 0 -or $wslRows -notmatch "(?m)\s2\s*$") { throw "At least one initialized WSL2 distribution is required" }
& wsl.exe --exec bash --version | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Bash is unavailable in the default WSL2 distribution" }
& wsl.exe --exec git --version | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Git is unavailable in the default WSL2 distribution" }
$nodeVersion = (& wsl.exe --exec node --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch "^v(\d+)\.(\d+)\.(\d+)") { throw "Node is unavailable in WSL2" }
if ([int]$Matches[1] -lt 22 -or ([int]$Matches[1] -eq 22 -and [int]$Matches[2] -lt 12)) {
  throw "Node 22.12+ is required; got $nodeVersion"
}

if (Test-Path -LiteralPath $appRoot) {
  $existingUpdate = Get-ChildItem -LiteralPath $appRoot -Recurse -Filter "Update.exe" -File -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($existingUpdate) { Uninstall-Chromux }
}

if ($Machine -eq "windows10") {
  if (-not $PreviousInstallerUrl) { throw "Windows 10 upgrade UAT requires PreviousInstallerUrl" }
  $previousUri = [Uri]$PreviousInstallerUrl
  if ($previousUri.Scheme -ne "https" -or $previousUri.Host -ne "github.com" -or
      $previousUri.AbsolutePath -notmatch "^/GeorgeQLe/gblockparty-chromux/releases/download/chromux-v\d+\.\d+\.\d+/GBlockParty-Chromux-Setup-\d+\.\d+\.\d+-x64\.exe$") {
    throw "PreviousInstallerUrl must be an official versioned Chromux GitHub Release installer"
  }
  $previousSetup = Join-Path $env:RUNNER_TEMP "Chromux-Previous-Setup.exe"
  Invoke-WebRequest -Uri $PreviousInstallerUrl -OutFile $previousSetup
  if ((Get-Item -LiteralPath $previousSetup).Length -le 0) { throw "Previous installer download is empty" }
  Assert-SignedBinary (Get-Item -LiteralPath $previousSetup)
  $previousExe = Install-Squirrel $previousSetup
  Assert-InstalledSignatures
  Smoke-Chromux $previousExe
}

New-Item -ItemType Directory -Force -Path $profileRoot, $stateRoot | Out-Null
$profileSentinel = Join-Path $profileRoot "windows-uat-retain.txt"
$stateSentinel = Join-Path $stateRoot "windows-uat-retain.txt"
Set-Content -LiteralPath $profileSentinel -Value "retain-$version"
Set-Content -LiteralPath $stateSentinel -Value "retain-$version"

$candidateExe = Install-Squirrel $setup
Assert-InstalledSignatures
$installedVersion = $candidateExe.VersionInfo.ProductVersion
if ($installedVersion -and -not $installedVersion.StartsWith($version)) {
  throw "Installed product version $installedVersion does not match $version"
}
Smoke-Chromux $candidateExe
if (-not (Test-Path -LiteralPath $profileSentinel) -or -not (Test-Path -LiteralPath $stateSentinel)) {
  throw "Upgrade or launch removed retained user data"
}

Uninstall-Chromux
if (-not (Test-Path -LiteralPath $profileSentinel) -or -not (Test-Path -LiteralPath $stateSentinel)) {
  throw "Uninstall removed Chromux user data"
}
Write-Host "Windows $Machine install/upgrade/launch/uninstall/retained-data UAT passed for $version."
