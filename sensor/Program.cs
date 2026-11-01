using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace HudSensor
{
    internal static class Program
    {
        private static volatile bool _running = true;
        private static volatile int _interval = 1000;
        private static readonly object WriteLock = new object();
        private static StreamWriter _writer;

        private static void Send(string line)
        {
            lock (WriteLock) _writer.WriteLine(line);
        }

        private static int Main(string[] args)
        {
            Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
            Native.EnableDpiAwareness();
            var pipeName = Arg(args, "--pipe");
            var presentMon = Arg(args, "--presentmon");
            var useStdout = Array.IndexOf(args, "--stdout") >= 0;
            var fpsOnStart = Array.IndexOf(args, "--fps") >= 0;

            Stream stream;
            NamedPipeClientStream pipe = null;
            if (useStdout)
            {
                stream = Console.OpenStandardOutput();
            }
            else if (!string.IsNullOrEmpty(pipeName))
            {
                pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
                try
                {
                    pipe.Connect(15000);
                }
                catch
                {
                    return 3;
                }
                stream = pipe;
            }
            else
            {
                return 2;
            }

            var encoding = new UTF8Encoding(false);
            _writer = new StreamWriter(stream, encoding) { AutoFlush = true, NewLine = "\n" };
            var isAdmin = IsAdmin();
            var pawnIo = PawnIoInstalled();

            using (var hardware = new HardwareReader())
            using (var fps = new FpsTracker(presentMon))
            {
                if (fpsOnStart) fps.SetEnabled(true);
                if (pipe != null) ListenCommands(new StreamReader(pipe, encoding), fps);

                while (_running && (pipe == null || pipe.IsConnected))
                {
                    var started = Stopwatch.StartNew();
                    try
                    {
                        hardware.Update();
                        var json = new JsonWriter()
                            .BeginObject()
                            .Prop("type", "sensors")
                            .Prop("admin", isAdmin)
                            .Prop("pawnio", pawnIo);
                        hardware.Write(json);
                        fps.Write(json);
                        var fullscreen = Native.ForegroundFullscreen(out var cx, out var cy);
                        json.BeginObject("fullscreen").Prop("active", fullscreen).Prop("x", cx, 0).Prop("y", cy, 0).EndObject();
                        json.EndObject();
                        Send(json.ToString());
                    }
                    catch (IOException)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        try
                        {
                            Send(new JsonWriter().BeginObject().Prop("type", "error").Prop("message", ex.Message).EndObject().ToString());
                        }
                        catch
                        {
                            break;
                        }
                    }
                    var wait = _interval - (int)started.ElapsedMilliseconds;
                    if (wait > 0) Thread.Sleep(wait);
                }
            }
            pipe?.Dispose();
            return 0;
        }

        private static void ListenCommands(StreamReader reader, FpsTracker fps)
        {
            Task.Run(async () =>
            {
                try
                {
                    string line;
                    while ((line = await reader.ReadLineAsync().ConfigureAwait(false)) != null)
                    {
                        var parts = line.Trim().Split(' ');
                        switch (parts[0])
                        {
                            case "fps":
                                fps.SetEnabled(parts.Length > 1 && parts[1] == "on");
                                break;
                            case "interval":
                                if (parts.Length > 1 && int.TryParse(parts[1], out var ms)) _interval = Math.Max(250, Math.Min(5000, ms));
                                break;
                            case "shot":
                                TakeShot(line.Trim().Split(new[] { ' ' }, 7));
                                break;
                            case "quit":
                                _running = false;
                                return;
                        }
                    }
                }
                catch
                {
                }
                _running = false;
            });
        }

        private static void TakeShot(string[] parts)
        {
            var json = new JsonWriter().BeginObject().Prop("type", "shot").Prop("id", parts.Length > 1 ? parts[1] : "");
            try
            {
                var x = int.Parse(parts[2], CultureInfo.InvariantCulture);
                var y = int.Parse(parts[3], CultureInfo.InvariantCulture);
                var width = int.Parse(parts[4], CultureInfo.InvariantCulture);
                var height = int.Parse(parts[5], CultureInfo.InvariantCulture);
                ScreenShot.Save(x, y, width, height, parts[6]);
                json.Prop("ok", true).Prop("width", width, 0).Prop("height", height, 0);
            }
            catch (Exception ex)
            {
                json.Prop("ok", false).Prop("error", ex.Message);
            }
            try
            {
                Send(json.EndObject().ToString());
            }
            catch
            {
            }
        }

        private static bool IsAdmin()
        {
            try
            {
                return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch
            {
                return false;
            }
        }

        private static bool PawnIoInstalled()
        {
            try
            {
                using (var key = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\PawnIO"))
                    return key != null;
            }
            catch
            {
                return false;
            }
        }

        private static string Arg(string[] args, string name)
        {
            var i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }
    }
}
