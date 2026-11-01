using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;

namespace HudSensor
{
    internal sealed class DiskSample
    {
        public int Index { get; set; }

        public string Letters { get; set; }

        public double Activity { get; set; }

        public double Read { get; set; }

        public double Write { get; set; }
    }

    internal sealed class DiskCounters : IDisposable
    {
        private readonly Dictionary<string, Counters> _byInstance = new Dictionary<string, Counters>();
        private DateTime _lastScan = DateTime.MinValue;
        private bool _broken;

        public List<DiskSample> Read()
        {
            var list = new List<DiskSample>();
            if (_broken) return list;
            if ((DateTime.UtcNow - _lastScan).TotalSeconds > 30) Scan();
            foreach (var c in _byInstance.Values)
            {
                try
                {
                    list.Add(new DiskSample
                    {
                        Index = c.Index,
                        Letters = c.Letters,
                        Activity = Math.Max(0, Math.Min(100, 100 - c.Idle.NextValue())),
                        Read = c.ReadBytes.NextValue(),
                        Write = c.WriteBytes.NextValue()
                    });
                }
                catch
                {
                }
            }
            return list.OrderBy(d => d.Index).ToList();
        }

        private void Scan()
        {
            _lastScan = DateTime.UtcNow;
            try
            {
                var names = new PerformanceCounterCategory("PhysicalDisk").GetInstanceNames().Where(n => n != "_Total").ToList();
                foreach (var gone in _byInstance.Keys.Except(names).ToList())
                {
                    _byInstance[gone].Dispose();
                    _byInstance.Remove(gone);
                }
                foreach (var name in names)
                {
                    if (_byInstance.ContainsKey(name)) continue;
                    var space = name.IndexOf(' ');
                    if (!int.TryParse(space > 0 ? name.Substring(0, space) : name, out var index)) continue;
                    var c = new Counters
                    {
                        Index = index,
                        Letters = space > 0 ? name.Substring(space + 1).Trim() : "",
                        Idle = new PerformanceCounter("PhysicalDisk", "% Idle Time", name, true),
                        ReadBytes = new PerformanceCounter("PhysicalDisk", "Disk Read Bytes/sec", name, true),
                        WriteBytes = new PerformanceCounter("PhysicalDisk", "Disk Write Bytes/sec", name, true)
                    };
                    c.Idle.NextValue();
                    c.ReadBytes.NextValue();
                    c.WriteBytes.NextValue();
                    _byInstance[name] = c;
                }
            }
            catch
            {
                _broken = true;
            }
        }

        public void Dispose()
        {
            foreach (var c in _byInstance.Values) c.Dispose();
            _byInstance.Clear();
        }

        private sealed class Counters : IDisposable
        {
            public int Index { get; set; }

            public string Letters { get; set; }

            public PerformanceCounter Idle { get; set; }

            public PerformanceCounter ReadBytes { get; set; }

            public PerformanceCounter WriteBytes { get; set; }

            public void Dispose()
            {
                Idle?.Dispose();
                ReadBytes?.Dispose();
                WriteBytes?.Dispose();
            }
        }
    }
}
