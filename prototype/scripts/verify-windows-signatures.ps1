param(
  [string]$AppDirectory,
  [Parameter(Mandatory = $true)][string]$CandidateDirectory,
  [Parameter(Mandatory = $true)][string]$ExpectedPublisher,
  [string]$ExpectedTimestampPublisher = "Microsoft"
)

$ErrorActionPreference = "Stop"
$package = Get-Content (Join-Path $PSScriptRoot "..\package.json") -Raw | ConvertFrom-Json
$version = $package.version
$setupName = "GBlockParty-Chromux-Setup-$version-x64.exe"
$packageName = "GBlockPartyChromux-$version-full.nupkg"
$setup = Join-Path $CandidateDirectory $setupName
$nupkg = Join-Path $CandidateDirectory $packageName

function Assert-SignedBinary([System.IO.FileInfo]$File) {
  if ($File.Length -le 0) { throw "Binary is empty: $($File.FullName)" }
  $signature = Get-AuthenticodeSignature -LiteralPath $File.FullName
  if ($signature.Status -ne "Valid") {
    throw "Authenticode trust failed for $($File.FullName): $($signature.Status) $($signature.StatusMessage)"
  }
  if (-not $signature.SignerCertificate -or $signature.SignerCertificate.Subject -ne $ExpectedPublisher) {
    throw "Unexpected publisher for $($File.FullName): $($signature.SignerCertificate.Subject)"
  }
  if (-not $signature.TimeStamperCertificate) {
    throw "RFC3161 timestamp is missing for $($File.FullName)"
  }
  $timestampIdentity = "$($signature.TimeStamperCertificate.Subject) $($signature.TimeStamperCertificate.Issuer)"
  if ($timestampIdentity -notlike "*$ExpectedTimestampPublisher*") {
    throw "Unexpected timestamp authority for $($File.FullName): $timestampIdentity"
  }
  & signtool.exe verify /pa /all /v $File.FullName | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "SignTool trust verification failed for $($File.FullName)" }
}

if (-not (Test-Path -LiteralPath $setup -PathType Leaf)) { throw "Setup executable is missing: $setup" }
if (-not (Test-Path -LiteralPath $nupkg -PathType Leaf)) { throw "Full package is missing: $nupkg" }

$appBinaries = @()
if ($AppDirectory) {
  if (-not (Test-Path -LiteralPath $AppDirectory -PathType Container)) { throw "Unpacked app is missing: $AppDirectory" }
  $appBinaries = Get-ChildItem -LiteralPath $AppDirectory -Recurse -File |
    Where-Object { $_.Extension -in @(".exe", ".dll", ".node") }
  if (-not $appBinaries) { throw "No signable unpacked application binaries were found" }
  if (-not ($appBinaries | Where-Object { $_.Name -eq "GBlockParty Chromux.exe" })) {
    throw "Packaged application executable is missing"
  }
  if (-not ($appBinaries | Where-Object { $_.Name -eq "conpty.node" })) {
    throw "Unpacked node-pty conpty.node is missing"
  }
  foreach ($binary in $appBinaries) { Assert-SignedBinary $binary }
}
Assert-SignedBinary (Get-Item -LiteralPath $setup)

$extractRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("chromux-nupkg-" + [Guid]::NewGuid().ToString("N"))
$zip = "$extractRoot.zip"
try {
  Copy-Item -LiteralPath $nupkg -Destination $zip
  Expand-Archive -LiteralPath $zip -DestinationPath $extractRoot
  $nestedBinaries = Get-ChildItem -LiteralPath $extractRoot -Recurse -File |
    Where-Object { $_.Extension -in @(".exe", ".dll", ".node") }
  if (-not $nestedBinaries) { throw "No signable binaries were found inside $packageName" }
  if (-not ($nestedBinaries | Where-Object { $_.Name -eq "conpty.node" })) {
    throw "node-pty is missing from $packageName"
  }
  foreach ($binary in $nestedBinaries) { Assert-SignedBinary $binary }
}
finally {
  Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Verified $($appBinaries.Count) unpacked and $($nestedBinaries.Count) nested signed binaries plus $setupName."
