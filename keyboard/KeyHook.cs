using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace UltraGMonitorKeyboard
{
    internal sealed class KeyHook : IDisposable
    {
        private delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
        [StructLayout(LayoutKind.Sequential)]
        private struct KeyboardEvent { public uint Key, Scan, Flags, Time; public IntPtr Extra; }
        [StructLayout(LayoutKind.Sequential)]
        private struct Message { public IntPtr Window; public uint Id; public IntPtr WParam, LParam; public uint Time; public int X, Y; public uint Private; }
        [StructLayout(LayoutKind.Sequential)]
        private struct KeyboardInput { public ushort Key, Scan; public uint Flags, Time; public IntPtr Extra; }
        [StructLayout(LayoutKind.Sequential)]
        private struct MouseInput { public int X, Y; public uint Data, Flags, Time; public IntPtr Extra; }
        [StructLayout(LayoutKind.Explicit)]
        private struct InputData { [FieldOffset(0)] public KeyboardInput Keyboard; [FieldOffset(0)] public MouseInput Mouse; }
        [StructLayout(LayoutKind.Sequential)]
        private struct Input { public uint Type; public InputData Data; }

        [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int type, HookProc callback, IntPtr module, uint thread);
        [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] private static extern int GetMessage(out Message message, IntPtr window, uint min, uint max);
        [DllImport("user32.dll")] private static extern bool PeekMessage(out Message message, IntPtr window, uint min, uint max, uint remove);
        [DllImport("user32.dll")] private static extern bool PostThreadMessage(uint thread, uint message, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] private static extern UIntPtr SetTimer(IntPtr window, UIntPtr id, uint interval, IntPtr callback);
        [DllImport("user32.dll")] private static extern bool KillTimer(IntPtr window, UIntPtr id);
        [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] private static extern uint SendInput(uint count, Input[] inputs, int size);
        [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string name);

        private readonly Action _capture;
        private readonly Action<bool, int> _status;
        private readonly HookProc _callback;
        private readonly CaptureChord _chord = new CaptureChord();
        private readonly object _gate = new object();
        private Thread _thread;
        private uint _threadId;
        private IntPtr _hook;
        private volatile bool _enabled;

        public KeyHook(Action capture, Action<bool, int> status)
        {
            _capture = capture;
            _status = status;
            _callback = Callback;
        }

        public void SetEnabled(bool enabled)
        {
            lock (_gate)
            {
                _enabled = enabled;
                if (!enabled) { Stop(); ThreadPool.QueueUserWorkItem(delegate { if (!_enabled) _status(false, 0); }); return; }
                if (_thread != null && _thread.IsAlive) return;
                _thread = new Thread(Run) { IsBackground = true, Name = "Atalho de captura" };
                _thread.Start();
            }
        }

        private void Run()
        {
            if (!_enabled) return;
            _threadId = GetCurrentThreadId();
            Message message;
            PeekMessage(out message, IntPtr.Zero, 0, 0, 0);
            var timer = SetTimer(IntPtr.Zero, UIntPtr.Zero, 3000, IntPtr.Zero);
            try
            {
                Install();
                while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0)
                {
                    if (message.Id == 0x113 && _enabled) Install();
                }
            }
            finally
            {
                if (timer != UIntPtr.Zero) KillTimer(IntPtr.Zero, timer);
                if (_hook != IntPtr.Zero) UnhookWindowsHookEx(_hook);
                _hook = IntPtr.Zero;
                _chord.Reset();
            }
        }

        private void Install()
        {
            var next = SetWindowsHookEx(13, _callback, GetModuleHandle(null), 0);
            var error = next == IntPtr.Zero ? Marshal.GetLastWin32Error() : 0;
            var previous = _hook;
            _hook = next;
            if (previous != IntPtr.Zero) UnhookWindowsHookEx(previous);
            ThreadPool.QueueUserWorkItem(delegate { if (_enabled && _hook == next) _status(next != IntPtr.Zero, error); });
        }

        private static bool Held(int key) { return (GetAsyncKeyState(key) & 0x8000) != 0; }

        private IntPtr Callback(int code, IntPtr w, IntPtr l)
        {
            if (code >= 0 && _enabled)
            {
                var data = (KeyboardEvent)Marshal.PtrToStructure(l, typeof(KeyboardEvent));
                if (data.Key != 0x53) return CallNextHookEx(_hook, code, w, l);
                var message = w.ToInt32();
                var modifiers = (Held(0x5B) || Held(0x5C) ? Modifiers.Windows : 0)
                    | (Held(0x10) ? Modifiers.Shift : 0) | (Held(0x11) ? Modifiers.Control : 0) | (Held(0x12) ? Modifiers.Alt : 0);
                bool capture;
                if (_chord.Handle((int)data.Key, message == 0x100 || message == 0x104, message == 0x101 || message == 0x105, modifiers, out capture))
                {
                    if (capture)
                    {
                        var dummy = new[] {
                            new Input { Type = 1, Data = new InputData { Keyboard = new KeyboardInput { Key = 0xFF } } },
                            new Input { Type = 1, Data = new InputData { Keyboard = new KeyboardInput { Key = 0xFF, Flags = 2 } } }
                        };
                        SendInput(2, dummy, Marshal.SizeOf(typeof(Input)));
                        ThreadPool.QueueUserWorkItem(delegate { _capture(); });
                    }
                    return (IntPtr)1;
                }
            }
            return CallNextHookEx(_hook, code, w, l);
        }

        private void Stop()
        {
            if (_thread == null) return;
            PostThreadMessage(_threadId, 0x12, IntPtr.Zero, IntPtr.Zero);
            if (_thread.Join(1500)) _thread = null;
        }

        public void Dispose() { SetEnabled(false); }
    }
}
