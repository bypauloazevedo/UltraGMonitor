using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace HudSensor
{
    internal static class Native
    {
        [StructLayout(LayoutKind.Sequential)]
        internal struct MemoryStatus
        {
            public uint Length;
            public uint Load;
            public ulong TotalPhysical;
            public ulong AvailablePhysical;
            public ulong TotalPageFile;
            public ulong AvailablePageFile;
            public ulong TotalVirtual;
            public ulong AvailableVirtual;
            public ulong AvailableExtendedVirtual;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);

        internal static bool ReadPhysicalMemory(out MemoryStatus status)
        {
            status = new MemoryStatus { Length = (uint)Marshal.SizeOf(typeof(MemoryStatus)) };
            return GlobalMemoryStatusEx(ref status);
        }

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr CreateJobObject(IntPtr attributes, string name);

        [DllImport("kernel32.dll")]
        private static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref JobExtendedLimitInformation info, int length);

        [DllImport("kernel32.dll")]
        private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);

        [DllImport("user32.dll")]
        private static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetClassName(IntPtr hWnd, StringBuilder name, int max);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        private const int JobObjectExtendedLimitInformation = 9;
        private const uint JobObjectLimitKillOnJobClose = 0x2000;
        private const uint MonitorDefaultToNearest = 2;

        private static readonly string[] ShellClasses = { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd" };

        private static IntPtr _job = IntPtr.Zero;

        public static void EnableDpiAwareness()
        {
            try
            {
                if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return;
            }
            catch
            {
            }
            try
            {
                SetProcessDPIAware();
            }
            catch
            {
            }
        }

        public static int ForegroundProcessId()
        {
            var hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero) return 0;
            GetWindowThreadProcessId(hwnd, out var pid);
            return (int)pid;
        }

        public static bool ForegroundFullscreen(out int centerX, out int centerY)
        {
            centerX = 0;
            centerY = 0;
            var hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero) return false;
            var name = new StringBuilder(64);
            GetClassName(hwnd, name, name.Capacity);
            if (Array.IndexOf(ShellClasses, name.ToString()) >= 0) return false;
            if (!GetWindowRect(hwnd, out var rect)) return false;
            var info = new MonitorInfo { Size = Marshal.SizeOf(typeof(MonitorInfo)) };
            if (!GetMonitorInfo(MonitorFromWindow(hwnd, MonitorDefaultToNearest), ref info)) return false;
            var m = info.Monitor;
            centerX = (m.Left + m.Right) / 2;
            centerY = (m.Top + m.Bottom) / 2;
            return rect.Left <= m.Left && rect.Top <= m.Top && rect.Right >= m.Right && rect.Bottom >= m.Bottom;
        }

        public static void KillWithMe(Process process)
        {
            try
            {
                if (_job == IntPtr.Zero)
                {
                    _job = CreateJobObject(IntPtr.Zero, null);
                    var info = new JobExtendedLimitInformation();
                    info.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
                    SetInformationJobObject(_job, JobObjectExtendedLimitInformation, ref info, Marshal.SizeOf(typeof(JobExtendedLimitInformation)));
                }
                AssignProcessToJobObject(_job, process.Handle);
            }
            catch
            {
            }
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct Rect
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MonitorInfo
        {
            public int Size;
            public Rect Monitor;
            public Rect Work;
            public uint Flags;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JobBasicLimitInformation
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct IoCounters
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JobExtendedLimitInformation
        {
            public JobBasicLimitInformation BasicLimitInformation;
            public IoCounters IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }
    }
}
