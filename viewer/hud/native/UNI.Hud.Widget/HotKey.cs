// HotKey.cs — global hotkey registration via P/Invoke RegisterHotKey.
// Ctrl+Shift+H toggles the widget's visibility from anywhere in Windows.

using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace UNI.Hud.Widget;

public sealed class HotKey : IDisposable
{
    private const int WM_HOTKEY = 0x0312;
    private const uint MOD_CTRL = 0x0002, MOD_SHIFT = 0x0004;
    private const uint VK_H = 0x48;

    [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    private readonly Window _win;
    private readonly Action _onHit;
    private readonly int _id = 0xB0B0;
    private HwndSource? _src;

    public HotKey(Window win, Action onHit) { _win = win; _onHit = onHit; }

    public void Register()
    {
        var helper = new WindowInteropHelper(_win);
        helper.EnsureHandle();
        _src = HwndSource.FromHwnd(helper.Handle);
        _src?.AddHook(HwndHook);
        RegisterHotKey(helper.Handle, _id, MOD_CTRL | MOD_SHIFT, VK_H);
    }

    private IntPtr HwndHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_HOTKEY && wParam.ToInt32() == _id) { _onHit(); handled = true; }
        return IntPtr.Zero;
    }

    public void Dispose()
    {
        try
        {
            var handle = new WindowInteropHelper(_win).Handle;
            UnregisterHotKey(handle, _id);
            _src?.RemoveHook(HwndHook);
        }
        catch { }
    }
}
