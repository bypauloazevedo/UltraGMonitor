using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("UltraGMonitor (Teste)")]
[assembly: AssemblyDescription("Abre a versão de teste ligada aos arquivos do projeto")]
[assembly: AssemblyCompany("Paulo Azevedo")]
[assembly: AssemblyProduct("UltraGMonitor")]

internal static class TestLauncher
{
    [STAThread]
    private static int Main()
    {
        const string project = @"__ULTRAGMONITOR_PROJECT_ROOT__";
        var electron = Path.Combine(project, "node_modules", "electron", "dist", "electron.exe");
        try
        {
            if (!File.Exists(Path.Combine(project, "package.json")) || !File.Exists(electron))
                throw new FileNotFoundException("Não encontrei os arquivos da versão de teste em " + project + ". Confira a pasta do projeto e rode npm install.");
            var start = new ProcessStartInfo
            {
                FileName = electron,
                Arguments = "\"" + project + "\"",
                WorkingDirectory = project,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            Process.Start(start);
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show("Não deu pra abrir o UltraGMonitor de teste.\n\n" + error.Message, "UltraGMonitor (Teste)", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
