$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$electronPath = Join-Path $projectRoot 'node_modules/electron/dist/electron.exe'
if (-not (Test-Path -LiteralPath $electronPath)) { throw 'Rode npm install antes de criar o atalho de teste.' }
$compiler = @(
    (Join-Path $env:windir 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
    (Join-Path $env:windir 'Microsoft.NET/Framework/v4.0.30319/csc.exe')
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) { throw 'Não encontrei o compilador do .NET Framework neste Windows.' }
$outputDir = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Aplicativos/UltraGMonitor-Teste'
$launcherPath = Join-Path $outputDir 'UltraGMonitor-Teste.exe'
$iconPath = Join-Path $projectRoot 'assets/icon.ico'
$previousLauncher = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'UltraGMonitor-Teste/UltraGMonitor-Teste.exe'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'UltraGMonitor (Teste).lnk'
$temporaryBase = Join-Path ([IO.Path]::GetTempPath()) ('ultragmonitor-atalho-' + [Guid]::NewGuid().ToString('N'))
$temporarySource = $temporaryBase + '.cs'
$temporaryExe = $temporaryBase + '.exe'
try {
    $source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-launcher.cs'))
    $source = $source.Replace('__ULTRAGMONITOR_PROJECT_ROOT__', $projectRoot.Replace('"', '""'))
    [IO.File]::WriteAllText($temporarySource, $source, [Text.Encoding]::UTF8)
    & $compiler /nologo /target:winexe /optimize+ /debug- /reference:System.Windows.Forms.dll "/win32icon:$iconPath" "/out:$temporaryExe" $temporarySource
    if ($LASTEXITCODE -ne 0) { throw 'Não deu pra gerar o executável de teste.' }
    [void][IO.Directory]::CreateDirectory($outputDir)
    Move-Item -LiteralPath $temporaryExe -Destination $launcherPath -Force
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $launcherPath
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.IconLocation = "$iconPath,0"
    $shortcut.Description = 'Abre a versão de teste ligada aos arquivos deste projeto.'
    $shortcut.Save()
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class UltraGMonitorShortcutShell {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern void SHChangeNotify(uint eventId, uint flags, string path, IntPtr unused);
}
'@
    [UltraGMonitorShortcutShell]::SHChangeNotify(0x2000, 0x1005, $shortcutPath, [IntPtr]::Zero)
    if (Test-Path -LiteralPath $previousLauncher) {
        Remove-Item -LiteralPath $previousLauncher -Force
        $previousDir = Split-Path -Parent $previousLauncher
        if (-not (Get-ChildItem -LiteralPath $previousDir -Force)) { Remove-Item -LiteralPath $previousDir }
    }
    Write-Output "Pronto: UltraGMonitor (Teste) no menu Iniciar."
    Write-Output "Executável: $launcherPath"
    Write-Output "Projeto: $projectRoot"
} finally {
    Remove-Item -LiteralPath $temporarySource, $temporaryExe -Force -ErrorAction SilentlyContinue
}
