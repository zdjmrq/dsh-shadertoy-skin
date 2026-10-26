# Extract files/directories from an Electron asar archive for read-only research.
# Usage:
#   .\asar-extract.ps1 -Asar "E:\path\app.asar" -List
#   .\asar-extract.ps1 -Asar "E:\path\app.asar" -Path "node_modules/@deepseek-ai/dsh-desktop-host" -Out "C:\tmp\out"
#   .\asar-extract.ps1 -Asar "E:\path\app.asar" -Path "dsh/node_modules/@deepseek-ai/dsh-host-webserver/lib" -Out "C:\tmp\out"
param(
  [Parameter(Mandatory = $true)][string]$Asar,
  [string]$Path,
  [string]$Out,
  [switch]$List
)

$ErrorActionPreference = 'Stop'

function Read-AsarHeader([string]$file) {
  # Electron/Chromium asar header layout (Pickle):
  #   [0..3]   = 4                    (payload size of the outer size pickle)
  #   [4..7]   = headerSize          (total bytes of the header pickle, incl. its 4-byte prefix)
  #   [8..11]  = headerSize - 4      (payload size of the header pickle)
  #   [12..15] = jsonLen             (length of the JSON header string)
  #   [16..]   = JSON header
  #   files start at 8 + headerSize
  $fs = [System.IO.File]::OpenRead($file)
  try {
    $buf = New-Object byte[] 16
    $null = $fs.Read($buf, 0, 16)
    $headerSize = [System.BitConverter]::ToUInt32($buf, 4)
    $jsonLen = [System.BitConverter]::ToUInt32($buf, 12)
    $fs.Position = 16
    $jsonBuf = New-Object byte[] $jsonLen
    $read = 0
    while ($read -lt $jsonLen) {
      $n = $fs.Read($jsonBuf, $read, $jsonLen - $read)
      if ($n -le 0) { throw 'unexpected EOF while reading asar header' }
      $read += $n
    }
    $dataStart = [int64]8 + $headerSize
    $json = [System.Text.Encoding]::UTF8.GetString($jsonBuf)
    return @{ Json = ($json | ConvertFrom-Json); DataStart = [int64]$dataStart; Stream = $fs }
  } catch {
    $fs.Dispose()
    throw
  }
}

$hdr = Read-AsarHeader $Asar
$script:fs = $hdr.Stream
$script:dataStart = $hdr.DataStart
$script:root = $hdr.Json

function Get-Node([string[]]$segments) {
  $node = $script:root
  foreach ($seg in $segments) {
    if ($null -eq $node -or -not $node.PSObject.Properties['files']) { return $null }
    $files = $node.files
    if (-not $files.PSObject.Properties[$seg]) { return $null }
    $node = $files.$seg
  }
  return $node
}

function Write-Node([object]$node, [string[]]$prefix, [string]$destRoot) {
  if ($node.PSObject.Properties['files']) {
    $dir = Join-Path $destRoot ($prefix -join '/')
    if ($prefix.Count -gt 0) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    foreach ($child in $node.files.PSObject.Properties) {
      Write-Node $child.Value ($prefix + $child.Name) $destRoot
    }
  } elseif ($node.PSObject.Properties['offset']) {
    if ($node.unpacked) {
      Write-Host "skip (unpacked): $($prefix -join '/')"
      return
    }
    $target = Join-Path $destRoot ($prefix -join '/')
    New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
    $offset = [int64]$node.offset + $script:dataStart
    $size = [int64]$node.size
    $buf = New-Object byte[] $size
    $script:fs.Position = $offset
    $read = 0
    while ($read -lt $size) {
      $n = $script:fs.Read($buf, $read, [int]($size - $read))
      if ($n -le 0) { throw "unexpected EOF at $($prefix -join '/')" }
      $read += $n
    }
    [System.IO.File]::WriteAllBytes($target, $buf)
  }
}

try {
  if ($List) {
    $node = if ($Path) { Get-Node ($Path -split '[\\/]+' | Where-Object { $_ -and $_ -ne 'dsh' -or $true }) } else { $null }
    if ($Path) {
      # resolve path relative to archive root, tolerant of a leading "dsh/"
      $segs = $Path -split '[\\/]+' | Where-Object { $_ }
      $node = Get-Node $segs
      if ($null -eq $node) { throw "path not found in archive: $Path" }
    }
    function Show-Node([object]$n, [string]$prefix) {
      if ($n.PSObject.Properties['files']) {
        foreach ($child in $n.files.PSObject.Properties) {
          Show-Node $child.Value ("$prefix/" + $child.Name)
        }
      } else {
        Write-Output ("{0}  {1}" -f $n.size, $prefix)
      }
    }
    if ($Path) { Show-Node $node $Path } else {
      $top = Get-Node @('dsh')
      if ($top) { Show-Node $top 'dsh' } else { Show-Node $script:root '' }
    }
    return
  }

  if (-not $Path -or -not $Out) { throw 'either -List, or both -Path and -Out are required' }
  $node = Get-Node ($Path -split '[\\/]+' | Where-Object { $_ })
  if ($null -eq $node) { throw "path not found in archive: $Path" }
  New-Item -ItemType Directory -Force -Path $Out | Out-Null
  Write-Node $node @() $Out
  Write-Host "extracted -> $Out"
} finally {
  $script:fs.Dispose()
}
