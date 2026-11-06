using System;
using System.IO;
using System.IO.Pipes;
using System.Reflection;
using System.Text;

[assembly: AssemblyTitle("UltraGMonitor · Atalho de captura")]
[assembly: AssemblyCompany("Paulo Azevedo")]

namespace UltraGMonitorKeyboard
{
    internal static class Program
    {
        private static int Main(string[] args)
        {
            var index = Array.IndexOf(args, "--pipe");
            if (index < 0 || index + 1 >= args.Length) return 2;
            try
            {
                using (var pipe = new NamedPipeClientStream(".", args[index + 1], PipeDirection.InOut, PipeOptions.Asynchronous))
                {
                    pipe.Connect(10000);
                    using (var writer = new StreamWriter(pipe, new UTF8Encoding(false), 1024, true) { AutoFlush = true })
                    using (var reader = new StreamReader(pipe, new UTF8Encoding(false), true, 1024, true))
                    {
                        var gate = new object();
                        Action<string> send = delegate(string text) {
                            try { lock (gate) writer.WriteLine(text); } catch (IOException) {} catch (ObjectDisposedException) {}
                        };
                        using (var hook = new KeyHook(
                            delegate { send("{\"type\":\"key\",\"name\":\"capture\"}"); },
                            delegate(bool active, int error) { send("{\"type\":\"hook\",\"active\":" + (active ? "true" : "false") + ",\"error\":" + error + "}"); }))
                        {
                            string line;
                            while ((line = reader.ReadLine()) != null)
                            {
                                if (line == "quit") break;
                                if (line == "hook on") hook.SetEnabled(true);
                                if (line == "hook off") hook.SetEnabled(false);
                            }
                        }
                    }
                }
                return 0;
            }
            catch (IOException) { return 3; }
            catch (TimeoutException) { return 4; }
        }
    }
}
