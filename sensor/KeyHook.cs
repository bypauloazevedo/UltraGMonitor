using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace HudSensor
{
    internal sealed class KeyHook : IDisposable
    {
        private const int WhKeyboardLl = 13;
        private const int WmKeyDown = 0x0100;
        private const int WmKeyUp = 0x0101;
        private const int WmSysKeyDown = 0x0104;
        private const int WmSysKeyUp = 0x0105;
        private const int WmQuit = 0x0012;
        private const int VkShift = 0x10;
        private const int VkControl = 0x11;
        private const int VkMenu = 0x12;
        private const int VkLWin = 0x5B;
        private const int VkRWin = 0x5C;
        private const int VkS = 0x53;
        private const ushort VkDummy = 0xFF;
        private const uint InputKeyboard = 1;
        private const uint KeyEventKeyUp = 0x0002;

        private delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        private struct KbdLlHookStruct
        {
            public uint VkCode;
            public uint ScanCode;
            public uint Flags;
            public uint Time;
            public IntPtr ExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct Msg
        {
            public IntPtr Hwnd;
            public uint Message;
            public IntPtr WParam;
            public IntPtr LParam;
            public uint Time;
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KeybdInput
        {
            public ushort Vk;
            public ushort Scan;
            public uint Flags;
            public uint Time;
            public IntPtr ExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MouseInput
        {
            public int Dx;
            public int Dy;
            public uint MouseData;
            public uint Flags;
            public uint Time;
            public IntPtr ExtraInfo;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct InputUnion
        {
            [FieldOffset(0)] public MouseInput Mouse;
            [FieldOffset(0)] public KeybdInput Keyboard;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct Input
        {
            public uint Type;
            public InputUnion Data;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, HookProc proc, IntPtr module, uint threadId);

        [DllImport("user32.dll")]
        private static extern bool UnhookWindowsHookEx(IntPtr hook);

        [DllImport("user32.dll")]
        private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern int GetMessage(out Msg msg, IntPtr hwnd, uint min, uint max);

        [DllImport("user32.dll")]
        private static extern bool PostThreadMessage(uint threadId, uint msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vk);

        [DllImport("user32.dll")]
        private static extern uint SendInput(uint count, Input[] inputs, int size);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr GetModuleHandle(string name);

        private readonly Action _onCapture;
        private readonly HookProc _proc;
        private readonly object _gate = new object();
        private Thread _thread;
        private uint _threadId;
        private IntPtr _hook;
        private bool _swallowing;

        public KeyHook(Action onCapture)
        {
            _onCapture = onCapture;
            _proc = Callback;
        }

        public void SetEnabled(bool on)
        {
            lock (_gate)
            {
                if (on) Start();
                else Stop();
            }
        }

        private void Start()
        {
            if (_thread != null) return;
            var ready = new ManualResetEventSlim();
            _thread = new Thread(() =>
            {
                _threadId = GetCurrentThreadId();
                _hook = SetWindowsHookEx(WhKeyboardLl, _proc, GetModuleHandle(null), 0);
                ready.Set();
                if (_hook == IntPtr.Zero) return;
                while (GetMessage(out _, IntPtr.Zero, 0, 0) > 0)
                {
                }
                UnhookWindowsHookEx(_hook);
                _hook = IntPtr.Zero;
            })
            {
                IsBackground = true,
                Name = "KeyHook",
            };
            _thread.Start();
            ready.Wait(2000);
        }

        private void Stop()
        {
            if (_thread == null) return;
            PostThreadMessage(_threadId, WmQuit, IntPtr.Zero, IntPtr.Zero);
            _thread.Join(1000);
            _thread = null;
            _swallowing = false;
        }

        private static bool Held(int vk) => (GetAsyncKeyState(vk) & 0x8000) != 0;

        private IntPtr Callback(int code, IntPtr wParam, IntPtr lParam)
        {
            if (code >= 0)
            {
                var data = Marshal.PtrToStructure<KbdLlHookStruct>(lParam);
                if (data.VkCode == VkS)
                {
                    var message = wParam.ToInt32();
                    var down = message == WmKeyDown || message == WmSysKeyDown;
                    var up = message == WmKeyUp || message == WmSysKeyUp;
                    if (down && (Held(VkLWin) || Held(VkRWin)) && Held(VkShift) && !Held(VkControl) && !Held(VkMenu))
                    {
                        if (!_swallowing)
                        {
                            _swallowing = true;
                            SendDummy();
                            ThreadPool.QueueUserWorkItem(_ => _onCapture());
                        }
                        return (IntPtr)1;
                    }
                    if (up && _swallowing)
                    {
                        _swallowing = false;
                        return (IntPtr)1;
                    }
                }
            }
            return CallNextHookEx(_hook, code, wParam, lParam);
        }

        private static void SendDummy()
        {
            var inputs = new[]
            {
                new Input { Type = InputKeyboard, Data = new InputUnion { Keyboard = new KeybdInput { Vk = VkDummy } } },
                new Input { Type = InputKeyboard, Data = new InputUnion { Keyboard = new KeybdInput { Vk = VkDummy, Flags = KeyEventKeyUp } } },
            };
            SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<Input>());
        }

        public void Dispose()
        {
            SetEnabled(false);
        }
    }
}
