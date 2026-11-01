using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;

namespace HudSensor
{
    internal sealed class FpsTracker : IDisposable
    {
        private const string SessionName = "UltraGMonitorFps";

        private static readonly HashSet<string> Ignored = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "dwm.exe", "explorer.exe", "UltraGMonitor.exe", "electron.exe", "ShellExperienceHost.exe",
            "StartMenuExperienceHost.exe", "SearchHost.exe", "TextInputHost.exe", "LockApp.exe"
        };

        private readonly string _exe;
        private readonly object _gate = new object();
        private readonly Dictionary<int, Queue<Frame>> _frames = new Dictionary<int, Queue<Frame>>();
        private readonly Dictionary<int, string> _names = new Dictionary<int, string>();
        private readonly Stopwatch _clock = Stopwatch.StartNew();
        private Process _process;
        private int _colApp = -1;
        private int _colPid = -1;
        private int _colMs = -1;
        private int _trackedPid;
        private string _lastError;

        public FpsTracker(string exe)
        {
            _exe = exe;
        }

        public bool Enabled { get; private set; }

        public string Error { get; private set; }

        public void SetEnabled(bool on)
        {
            if (on) Start();
            else Stop();
        }

        private void Start()
        {
            if (_process != null) return;
            Error = null;
            if (string.IsNullOrEmpty(_exe) || !File.Exists(_exe))
            {
                Error = "presentmon-missing";
                return;
            }
            _colApp = _colPid = _colMs = -1;
            var psi = new ProcessStartInfo(_exe, "--output_stdout --no_console_stats --stop_existing_session --session_name " + SessionName + " --no_track_input --no_track_gpu --no_track_display")
            {
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            try
            {
                var process = new Process { StartInfo = psi, EnableRaisingEvents = true };
                process.OutputDataReceived += (s, e) => { if (e.Data != null) OnLine(e.Data); };
                process.ErrorDataReceived += (s, e) => { if (!string.IsNullOrWhiteSpace(e.Data)) _lastError = e.Data.Trim(); };
                process.Exited += (s, e) => OnExited(process);
                process.Start();
                Native.KillWithMe(process);
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                _process = process;
                Enabled = true;
            }
            catch (Exception ex)
            {
                Error = ex.Message;
                Enabled = false;
            }
        }

        private void OnExited(Process process)
        {
            if (_process != process) return;
            _process = null;
            Enabled = false;
            Error = _lastError ?? "presentmon-exited";
        }

        private void Stop()
        {
            var process = _process;
            _process = null;
            Enabled = false;
            if (process == null) return;
            try
            {
                if (!process.HasExited) process.Kill();
            }
            catch
            {
            }
            TerminateSession();
            lock (_gate)
            {
                _frames.Clear();
                _trackedPid = 0;
            }
        }

        private void TerminateSession()
        {
            try
            {
                var psi = new ProcessStartInfo(_exe, "--terminate_existing_session --session_name " + SessionName)
                {
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (var p = Process.Start(psi)) p?.WaitForExit(3000);
            }
            catch
            {
            }
        }

        private void OnLine(string line)
        {
            var cols = line.Split(',');
            if (_colPid < 0)
            {
                _colApp = Array.FindIndex(cols, c => c.Trim() == "Application");
                _colPid = Array.FindIndex(cols, c => c.Trim() == "ProcessID");
                foreach (var name in new[] { "MsBetweenPresents", "FrameTime", "msBetweenPresents" })
                {
                    _colMs = Array.FindIndex(cols, c => c.Trim() == name);
                    if (_colMs >= 0) break;
                }
                if (_colMs < 0) _colPid = -1;
                return;
            }
            if (cols.Length <= Math.Max(_colPid, _colMs)) return;
            if (!int.TryParse(cols[_colPid], NumberStyles.Integer, CultureInfo.InvariantCulture, out var pid)) return;
            if (!double.TryParse(cols[_colMs], NumberStyles.Float, CultureInfo.InvariantCulture, out var ms)) return;
            if (ms <= 0 || ms > 1000) return;
            var app = _colApp >= 0 && _colApp < cols.Length ? cols[_colApp] : "";
            if (Ignored.Contains(app)) return;
            var now = _clock.Elapsed.TotalMilliseconds;
            lock (_gate)
            {
                if (!_frames.TryGetValue(pid, out var queue))
                {
                    queue = new Queue<Frame>();
                    _frames[pid] = queue;
                }
                queue.Enqueue(new Frame(now, ms));
                _names[pid] = app;
            }
        }

        public void Write(JsonWriter json)
        {
            json.BeginObject("fps").Prop("enabled", Enabled).Prop("error", Error);
            Frame[] recent = null;
            string app = null;
            lock (_gate)
            {
                var now = _clock.Elapsed.TotalMilliseconds;
                foreach (var pid in _frames.Keys.ToList())
                {
                    var queue = _frames[pid];
                    while (queue.Count > 0 && now - queue.Peek().At > 10000) queue.Dequeue();
                    if (queue.Count == 0)
                    {
                        _frames.Remove(pid);
                        _names.Remove(pid);
                    }
                }
                var foreground = Native.ForegroundProcessId();
                if (HasRecent(foreground, now)) _trackedPid = foreground;
                else if (!HasRecent(_trackedPid, now)) _trackedPid = 0;
                if (_trackedPid != 0)
                {
                    recent = _frames[_trackedPid].ToArray();
                    app = _names[_trackedPid];
                }
            }
            if (recent != null && recent.Length > 0)
            {
                var lastAt = recent[recent.Length - 1].At;
                var window = recent.Where(f => lastAt - f.At <= 1000).Select(f => f.Ms).ToList();
                var avg = window.Average();
                var worst = recent.Select(f => f.Ms).OrderByDescending(m => m).ToList();
                var count = Math.Max(1, worst.Count / 100);
                var low = worst.Take(count).Average();
                json.Prop("app", Path.GetFileNameWithoutExtension(app))
                    .Prop("pid", _trackedPid, 0)
                    .Prop("value", 1000.0 / avg, 0)
                    .Prop("low1", 1000.0 / low, 0)
                    .Prop("frametime", avg, 1);
            }
            json.EndObject();
        }

        private bool HasRecent(int pid, double now)
        {
            if (pid == 0 || !_frames.TryGetValue(pid, out var queue) || queue.Count == 0) return false;
            var last = queue.Last();
            return now - last.At < 1500;
        }

        public void Dispose()
        {
            Stop();
        }

        private struct Frame
        {
            public Frame(double at, double ms)
            {
                At = at;
                Ms = ms;
            }

            public double At { get; }

            public double Ms { get; }
        }
    }
}
