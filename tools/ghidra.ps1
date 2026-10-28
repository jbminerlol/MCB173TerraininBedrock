# Ghidra for reverse engineering b1.7.3 (run tools/setup.py first so re/classes exists).
#   .\tools\ghidra.ps1 import    build the project re\ghidra\B173.gpr from re\classes and export re\decomp\<class>.c
#   .\tools\ghidra.ps1 gui       open the project (a GhidraMCP plugin, if installed, serves the open class)
# Set GHIDRA_INSTALL_DIR (the ghidra_<version>_PUBLIC folder) and JAVA_HOME (JDK 21+); optionally
# GHIDRA_SETTINGS_DIR for a settings folder other than Ghidra's default (e.g. one with GhidraMCP enabled).
param([Parameter(Mandatory)][ValidateSet('gui', 'import')][string]$Mode)

$root = Split-Path -Parent $PSScriptRoot
$re = Join-Path $root 're'
if (-not $env:GHIDRA_INSTALL_DIR -or -not $env:JAVA_HOME) { throw 'set GHIDRA_INSTALL_DIR and JAVA_HOME' }
New-Item -ItemType Directory -Force (Join-Path $re 'ghidra'), (Join-Path $re 'decomp') | Out-Null

$vmargs = @(
    '-Djava.system.class.loader=ghidra.GhidraClassLoader', '-Dfile.encoding=UTF8',
    '-Duser.country=US', '-Duser.language=en', '-Duser.variant=',
    '-Dsun.java2d.opengl=false', '-Dsun.java2d.d3d=false', '-Dlog4j.skipJansi=true',
    '-Xshare:off', '--enable-native-access=ALL-UNNAMED'
)
if ($env:GHIDRA_SETTINGS_DIR) { $vmargs += "-Dapplication.settingsdir=$env:GHIDRA_SETTINGS_DIR" }
$vmargs += '-cp', (Join-Path $env:GHIDRA_INSTALL_DIR 'Ghidra\Framework\Utility\lib\Utility.jar')

if ($Mode -eq 'gui') {
    $argv = $vmargs + '-Xmx3G', 'ghidra.Ghidra', 'ghidra.GhidraRun', (Join-Path $re 'ghidra\B173.gpr')
    Start-Process -FilePath (Join-Path $env:JAVA_HOME 'bin\javaw.exe') `
        -ArgumentList ($argv | ForEach-Object { if ($_ -match ' ') { "`"$_`"" } else { $_ } })
} else {
    & (Join-Path $env:JAVA_HOME 'bin\java.exe') @vmargs '-Xmx3G' '-XX:+UseSerialGC' 'ghidra.Ghidra' `
        'ghidra.app.util.headless.AnalyzeHeadless' (Join-Path $re 'ghidra') B173 -import (Join-Path $re 'classes') -overwrite `
        -scriptPath (Join-Path $PSScriptRoot 'ghidra') -postScript JvmExport.java (Join-Path $re 'decomp')
    exit $LASTEXITCODE
}
