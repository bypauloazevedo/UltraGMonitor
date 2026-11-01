using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

namespace HudSensor
{
    internal static class ScreenShot
    {
        private const int SrcCopy = 0x00CC0020;
        private const int CaptureBlt = 0x40000000;

        [DllImport("user32.dll")]
        private static extern IntPtr GetDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern bool BitBlt(IntPtr dest, int x, int y, int width, int height, IntPtr source, int sx, int sy, int rop);

        public static void Save(int x, int y, int width, int height, string path)
        {
            using (var bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb))
            {
                var screen = GetDC(IntPtr.Zero);
                try
                {
                    using (var g = Graphics.FromImage(bmp))
                    {
                        var target = g.GetHdc();
                        try
                        {
                            BitBlt(target, 0, 0, width, height, screen, x, y, SrcCopy | CaptureBlt);
                        }
                        finally
                        {
                            g.ReleaseHdc(target);
                        }
                    }
                }
                finally
                {
                    ReleaseDC(IntPtr.Zero, screen);
                }
                var data = bmp.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                try
                {
                    var rowBytes = width * 4;
                    var row = new byte[rowBytes];
                    var rgba = new byte[rowBytes * height];
                    for (var line = 0; line < height; line++)
                    {
                        Marshal.Copy(data.Scan0 + line * data.Stride, row, 0, rowBytes);
                        var offset = line * rowBytes;
                        for (var i = 0; i < rowBytes; i += 4)
                        {
                            rgba[offset + i] = row[i + 2];
                            rgba[offset + i + 1] = row[i + 1];
                            rgba[offset + i + 2] = row[i];
                            rgba[offset + i + 3] = 255;
                        }
                    }
                    File.WriteAllBytes(path, rgba);
                }
                finally
                {
                    bmp.UnlockBits(data);
                }
            }
        }
    }
}
