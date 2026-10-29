param(
  [Parameter(Mandatory = $true)]
  [int]$ParentPid
)

function Write-MuteLog([string]$Line) {
  [Console]::Error.WriteLine($Line)
  try { [Console]::Error.Flush() } catch { }
}

# Before Add-Type so a run log shows the watched pid even while C# compiles.
Write-MuteLog "[playwright-mute] watching pid=$ParentPid"

$cs = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class PlaywrightOutputMute {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  class MMDeviceEnumeratorComObject { }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IMMDeviceCollection ppDevices);
  }

  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    int GetCount(out int pcDevices);
    int Item(int nDevice, out IMMDevice ppDevice);
  }

  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
  }

  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    int GetAudioSessionControl(IntPtr AudioSessionGuid, int StreamFlags, out IntPtr SessionControl);
    int GetSimpleAudioVolume(IntPtr AudioSessionGuid, int StreamFlags, out IntPtr AudioVolume);
    int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
  }

  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    int GetCount(out int SessionCount);
    int GetSession(int SessionCount, out IAudioSessionControl2 Session);
  }

  [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    int GetState(out int pRetVal);
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    int GetGroupingParam(out Guid pRetVal);
    int SetGroupingParam(ref Guid Override, ref Guid EventContext);
    int RegisterAudioSessionNotification(IntPtr NewNotifications);
    int UnregisterAudioSessionNotification(IntPtr NewNotifications);
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int GetProcessId(out uint pRetVal);
  }

  [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    int SetMasterVolume(float level, IntPtr eventContext);
    int GetMasterVolume(out float level);
    int SetMute(int mute, IntPtr eventContext);
    int GetMute(out int mute);
  }

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern IntPtr OpenProcess(uint access, bool inherit, int pid);

  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder name, ref int size);

  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr h);

  static readonly Dictionary<int, bool> Cache = new Dictionary<int, bool>();
  static readonly Guid VolumeIid = new Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8");

  static bool Alive(int pid) {
    if (pid <= 0) return false;
    try {
      using (var p = System.Diagnostics.Process.GetProcessById(pid)) return !p.HasExited;
    } catch { return false; }
  }

  static string ImagePath(int pid) {
    IntPtr h = OpenProcess(0x1000, false, pid);
    if (h == IntPtr.Zero) return null;
    var sb = new StringBuilder(1024);
    int n = sb.Capacity;
    bool ok = QueryFullProcessImageName(h, 0, sb, ref n);
    CloseHandle(h);
    return ok ? sb.ToString() : null;
  }

  // Keep in sync with isPlaywrightBrowserExe in playwright-mute-output.cjs.
  static bool IsPlaywrightBrowser(string exePath) {
    if (string.IsNullOrEmpty(exePath)) return false;
    return exePath.Replace('\\', '/').IndexOf("/ms-playwright/", StringComparison.OrdinalIgnoreCase) >= 0;
  }

  static void Log(string line) {
    Console.Error.WriteLine(line);
    try { Console.Error.Flush(); } catch { }
  }

  static bool ShouldMute(int pid) {
    bool match;
    if (!Cache.TryGetValue(pid, out match)) {
      match = IsPlaywrightBrowser(ImagePath(pid));
      Cache[pid] = match;
      if (match) Log("[playwright-mute] muted pid=" + pid);
    }
    return match;
  }

  static void MuteSession(IAudioSessionControl2 ses) {
    IntPtr unk = Marshal.GetIUnknownForObject(ses);
    IntPtr volPtr;
    Guid iid = VolumeIid;
    if (Marshal.QueryInterface(unk, ref iid, out volPtr) == 0 && volPtr != IntPtr.Zero) {
      var vol = (ISimpleAudioVolume)Marshal.GetObjectForIUnknown(volPtr);
      vol.SetMute(1, IntPtr.Zero);
      Marshal.Release(volPtr);
    }
    Marshal.Release(unk);
  }

  static void Sweep(IMMDeviceEnumerator en) {
    IMMDeviceCollection col;
    if (en.EnumAudioEndpoints(0, 1, out col) != 0 || col == null) return;
    int n;
    col.GetCount(out n);
    var mgrGuid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
    for (int i = 0; i < n; i++) {
      IMMDevice dev;
      col.Item(i, out dev);
      object obj;
      if (dev.Activate(ref mgrGuid, 23, IntPtr.Zero, out obj) != 0 || obj == null) continue;
      var mgr = (IAudioSessionManager2)obj;
      IAudioSessionEnumerator sessions;
      if (mgr.GetSessionEnumerator(out sessions) != 0 || sessions == null) continue;
      int sc;
      sessions.GetCount(out sc);
      for (int s = 0; s < sc; s++) {
        IAudioSessionControl2 ses;
        sessions.GetSession(s, out ses);
        uint pid;
        ses.GetProcessId(out pid);
        if (pid != 0 && ShouldMute((int)pid)) MuteSession(ses);
      }
    }
  }

  public static void Run(int parentPid) {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
    while (Alive(parentPid)) {
      try { Sweep(en); } catch (Exception ex) {
        Log("[playwright-mute] sweep failed: " + ex.Message);
      }
      System.Threading.Thread.Sleep(100);
    }
  }
}
'@

Add-Type -TypeDefinition $cs -Language CSharp
[PlaywrightOutputMute]::Run($ParentPid)
Write-MuteLog "[playwright-mute] runner exited pid=$ParentPid"
