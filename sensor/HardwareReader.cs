using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using LibreHardwareMonitor.Hardware;

namespace HudSensor
{
    internal sealed class HardwareReader : IDisposable
    {
        private readonly Computer _computer;
        private readonly DiskCounters _counters = new DiskCounters();
        private int _tick;

        public HardwareReader()
        {
            _computer = new Computer
            {
                IsCpuEnabled = true,
                IsGpuEnabled = true,
                IsMemoryEnabled = true,
                IsStorageEnabled = true
            };
            _computer.Open();
        }

        public void Update()
        {
            var updateStorage = _tick % 3 == 0;
            _tick++;
            foreach (var hw in _computer.Hardware)
            {
                if (hw.HardwareType == HardwareType.Storage && !updateStorage) continue;
                UpdateDeep(hw);
            }
        }

        public void Write(JsonWriter json)
        {
            WriteCpu(json);
            WriteGpu(json);
            WriteMemory(json);
            WriteDisks(json);
        }

        private void WriteCpu(JsonWriter json)
        {
            var cpu = _computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.Cpu);
            if (cpu == null)
            {
                json.Null("cpu");
                return;
            }
            var cores = cpu.Sensors
                .Where(s => s.SensorType == SensorType.Clock && s.Name.StartsWith("Core #", StringComparison.OrdinalIgnoreCase) && s.Value.HasValue && s.Value > 0)
                .Select(s => (double)s.Value.Value)
                .ToList();
            json.BeginObject("cpu")
                .Prop("name", cpu.Name)
                .Prop("load", Find(cpu, SensorType.Load, "CPU Total"))
                .Prop("temp", Find(cpu, SensorType.Temperature, "CPU Package", "Core (Tctl/Tdie)", "Core (Tctl)", "Core Max", "Core Average") ?? Max(cpu, SensorType.Temperature, "Core"))
                .Prop("clock", cores.Count > 0 ? cores.Average() : (double?)null, 0)
                .Prop("power", Positive(Find(cpu, SensorType.Power, "CPU Package")))
                .Prop("maxCore", Find(cpu, SensorType.Load, "CPU Core Max") ?? MaxCoreLoad(cpu), 0)
                .EndObject();
        }

        private static double? MaxCoreLoad(IHardware cpu)
        {
            var values = AllSensors(cpu)
                .Where(s => s.SensorType == SensorType.Load && s.Value.HasValue && s.Name.IndexOf("Core", StringComparison.OrdinalIgnoreCase) >= 0)
                .Select(s => (double)s.Value.Value)
                .ToList();
            return values.Count > 0 ? values.Max() : (double?)null;
        }

        private void WriteGpu(JsonWriter json)
        {
            var gpu = _computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.GpuNvidia)
                ?? _computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.GpuAmd)
                ?? _computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.GpuIntel);
            if (gpu == null)
            {
                json.Null("gpu");
                return;
            }
            json.BeginObject("gpu")
                .Prop("name", gpu.Name)
                .Prop("load", Find(gpu, SensorType.Load, "GPU Core", "D3D 3D"))
                .Prop("temp", Find(gpu, SensorType.Temperature, "GPU Core"))
                .Prop("hotspot", Find(gpu, SensorType.Temperature, "GPU Hot Spot"))
                .Prop("vramUsed", Find(gpu, SensorType.SmallData, "GPU Memory Used", "D3D Dedicated Memory Used"), 0)
                .Prop("vramTotal", Find(gpu, SensorType.SmallData, "GPU Memory Total", "D3D Dedicated Memory Total"), 0)
                .Prop("power", Find(gpu, SensorType.Power, "GPU Package", "GPU Power"))
                .Prop("clock", Find(gpu, SensorType.Clock, "GPU Core"), 0)
                .Prop("fan", First(gpu, SensorType.Fan), 0)
                .EndObject();
        }

        private void WriteMemory(JsonWriter json)
        {
            var memory = _computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.Memory && Find(h, SensorType.Data, "Memory Used") != null);
            if (memory == null)
            {
                json.Null("ram");
                return;
            }
            var used = Find(memory, SensorType.Data, "Memory Used");
            var available = Find(memory, SensorType.Data, "Memory Available");
            json.BeginObject("ram")
                .Prop("used", used, 2)
                .Prop("total", used + available, 2)
                .Prop("load", Find(memory, SensorType.Load, "Memory"))
                .EndObject();
        }

        private void WriteDisks(JsonWriter json)
        {
            var samples = _counters.Read();
            var storages = _computer.Hardware.Where(h => h.HardwareType == HardwareType.Storage).ToList();
            var matched = new HashSet<IHardware>();
            var systemDrive = Path.GetPathRoot(Environment.SystemDirectory).TrimEnd('\\');
            json.BeginArray("disks");
            foreach (var sample in samples)
            {
                var storage = storages.FirstOrDefault(h => !matched.Contains(h) && DriveIndex(h) == sample.Index);
                if (storage != null) matched.Add(storage);
                WriteDisk(json, sample.Index, storage, sample, sample.Letters.Split(' ').Contains(systemDrive, StringComparer.OrdinalIgnoreCase));
            }
            foreach (var storage in storages.Where(h => !matched.Contains(h)))
            {
                WriteDisk(json, DriveIndex(storage), storage, null, false);
            }
            json.EndArray();
        }

        private static void WriteDisk(JsonWriter json, int index, IHardware storage, DiskSample sample, bool system)
        {
            json.BeginObject()
                .Prop("id", index >= 0 ? "disk" + index : storage?.Identifier.ToString())
                .Prop("name", storage?.Name ?? "Disco " + index)
                .Prop("letters", sample?.Letters ?? "")
                .Prop("system", system)
                .Prop("temp", storage == null ? null : Find(storage, SensorType.Temperature, "Composite Temperature", "Temperature") ?? Max(storage, SensorType.Temperature, ""))
                .Prop("used", storage == null ? null : Find(storage, SensorType.Load, "Used Space"))
                .Prop("activity", sample?.Activity ?? (storage == null ? null : Find(storage, SensorType.Load, "Total Activity")))
                .Prop("read", sample?.Read ?? (storage == null ? null : Find(storage, SensorType.Throughput, "Read Rate")), 0)
                .Prop("write", sample?.Write ?? (storage == null ? null : Find(storage, SensorType.Throughput, "Write Rate")), 0)
                .EndObject();
        }

        private static int DriveIndex(IHardware storage)
        {
            var id = storage.Identifier.ToString();
            var last = id.Substring(id.LastIndexOf('/') + 1);
            return int.TryParse(last, out var index) ? index : -1;
        }

        private static void UpdateDeep(IHardware hardware)
        {
            try
            {
                hardware.Update();
            }
            catch
            {
            }
            foreach (var sub in hardware.SubHardware) UpdateDeep(sub);
        }

        private static IEnumerable<ISensor> AllSensors(IHardware hardware)
        {
            foreach (var s in hardware.Sensors) yield return s;
            foreach (var sub in hardware.SubHardware)
                foreach (var s in AllSensors(sub))
                    yield return s;
        }

        private static double? Find(IHardware hardware, SensorType type, params string[] names)
        {
            var sensors = AllSensors(hardware).Where(s => s.SensorType == type && s.Value.HasValue).ToList();
            foreach (var name in names)
            {
                var match = sensors.FirstOrDefault(s => string.Equals(s.Name, name, StringComparison.OrdinalIgnoreCase));
                if (match != null) return match.Value.Value;
            }
            return null;
        }

        private static double? Max(IHardware hardware, SensorType type, string prefix)
        {
            var values = AllSensors(hardware)
                .Where(s => s.SensorType == type && s.Value.HasValue && s.Value > 0 && s.Name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                .Select(s => (double)s.Value.Value)
                .ToList();
            return values.Count > 0 ? values.Max() : (double?)null;
        }

        private static double? Positive(double? value) => value > 0 ? value : null;

        private static double? First(IHardware hardware, SensorType type)
        {
            var sensor = AllSensors(hardware).FirstOrDefault(s => s.SensorType == type && s.Value.HasValue);
            return sensor?.Value;
        }

        public void Dispose()
        {
            _counters.Dispose();
            try
            {
                _computer.Close();
            }
            catch
            {
            }
        }
    }
}
