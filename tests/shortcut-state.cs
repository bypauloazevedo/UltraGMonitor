using System;
using UltraGMonitorKeyboard;

internal static class ShortcutStateTest
{
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }

    private static void Main()
    {
        Console.OutputEncoding = new System.Text.UTF8Encoding(false);
        foreach (var extra in new[] { (Modifiers)0, Modifiers.Control })
        {
            var chord = new CaptureChord();
            var modifiers = Modifiers.Windows | Modifiers.Shift | extra;
            bool capture;
            Check(chord.Handle(0x53, true, false, modifiers, out capture) && capture, "A combinação não abriu a captura");
            Check(chord.Handle(0x53, true, false, modifiers, out capture) && !capture, "A repetição disparou duas vezes");
            Check(chord.Handle(0x53, true, false, 0, out capture) && !capture, "A repetição vazou depois de soltar os modificadores");
            Check(chord.Handle(0x53, false, true, 0, out capture) && !capture, "O Windows recebeu a soltura da tecla capturada");
            Check(!chord.Handle(0x53, true, false, 0, out capture), "A tecla S normal foi bloqueada");
            Check(!chord.Handle(0x53, true, false, Modifiers.Shift, out capture), "Shift+S foi bloqueado");
            Check(!chord.Handle(0x53, true, false, Modifiers.Windows | Modifiers.Control, out capture), "Uma combinação sem Shift foi bloqueada");
            Check(!chord.Handle(0x53, true, false, modifiers | Modifiers.Alt, out capture), "Uma combinação com Alt foi bloqueada");
            Check(!chord.Handle(0x43, true, false, modifiers, out capture), "Outra tecla foi bloqueada");
            Check(chord.Handle(0x53, true, false, modifiers, out capture) && capture, "A captura não funcionou de novo");
            chord.Reset();
            Check(!chord.Handle(0x53, false, true, 0, out capture), "O estado não foi limpo ao desligar");
        }
        Console.WriteLine("Combinações e repetição verificadas sem enviar teclas ao Windows.");
    }
}
