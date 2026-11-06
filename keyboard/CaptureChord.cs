using System;

namespace UltraGMonitorKeyboard
{
    [Flags]
    internal enum Modifiers { Windows = 1, Shift = 2, Control = 4, Alt = 8 }

    internal sealed class CaptureChord
    {
        private bool _swallowing;

        public bool Handle(int key, bool down, bool up, Modifiers modifiers, out bool capture)
        {
            capture = false;
            if (key != 0x53) return false;
            if (_swallowing)
            {
                if (up) _swallowing = false;
                return down || up;
            }
            var required = Modifiers.Windows | Modifiers.Shift;
            if (!down || (modifiers & required) != required || (modifiers & Modifiers.Alt) != 0) return false;
            _swallowing = true;
            capture = true;
            return true;
        }

        public void Reset() { _swallowing = false; }
    }
}
