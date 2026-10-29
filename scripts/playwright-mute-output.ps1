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
  sealed class CacheEntry {
    public long StartTicks;
    public bool Match;
  }

  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  class MMDeviceEnumeratorComObject { }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig]
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IMMDeviceCollection ppDevices);
  }

  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    [PreserveSig]
    int GetCount(out int pcDevices);
    [PreserveSig]
    int Item(int nDevice, out IMMDevice ppDevice);
  }

  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig]
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
  }

  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    [PreserveSig]
    int GetAudioSessionControl(IntPtr AudioSessionGuid, int StreamFlags, out IntPtr SessionControl);
    [PreserveSig]
    int GetSimpleAudioVolume(IntPtr AudioSessionGuid, int StreamFlags, out IntPtr AudioVolume);
    [PreserveSig]
    int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
  }

  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    [PreserveSig]
    int GetCount(out int SessionCount);
    [PreserveSig]
    int GetSession(int SessionCount, out IAudioSessionControl2 Session);
  }

  [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    [PreserveSig]
    int GetState(out int pRetVal);
    [PreserveSig]
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    [PreserveSig]
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    [PreserveSig]
    int GetGroupingParam(out Guid pRetVal);
    [PreserveSig]
    int SetGroupingParam(ref Guid Override, ref Guid EventContext);
    [PreserveSig]
    int RegisterAudioSessionNotification(IntPtr NewNotifications);
    [PreserveSig]
    int UnregisterAudioSessionNotification(IntPtr NewNotifications);
    [PreserveSig]
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig]
    int GetProcessId(out uint pRetVal);
  }

  [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    [PreserveSig]
    int SetMasterVolume(float level, IntPtr eventContext);
    [PreserveSig]
    int GetMasterVolume(out float level);
    [PreserveSig]
    int SetMute(int mute, IntPtr eventContext);
    [PreserveSig]
    int GetMute(out int mute);
  }

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern IntPtr OpenProcess(uint access, bool inherit, int pid);

  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder name, ref int size);

  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr h);

  static readonly Dictionary<int, CacheEntry> Cache = new Dictionary<int, CacheEntry>();
  static readonly HashSet<string> Logged = new HashSet<string>();
  static readonly Guid VolumeIid = new Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8");

  static void Log(string line) {
    Console.Error.WriteLine(line);
    try { Console.Error.Flush(); } catch { }
  }

  static void ReleaseCom(object com) {
    if (com == null) return;
    try {
      if (Marshal.IsComObject(com)) Marshal.FinalReleaseComObject(com);
    } catch { }
  }

  static bool Alive(int pid) {
    if (pid <= 0) return false;
    try {
      using (var p = System.Diagnostics.Process.GetProcessById(pid)) return !p.HasExited;
    } catch { return false; }
  }

  static long StartTicks(int pid) {
    if (pid <= 0) return 0;
    try {
      using (var p = System.Diagnostics.Process.GetProcessById(pid)) {
        if (p.HasExited) return 0;
        return p.StartTime.ToUniversalTime().Ticks;
      }
    } catch { return 0; }
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

  static void PruneCache() {
    var stalePids = new List<int>();
    foreach (var kv in Cache) {
      long ticks = StartTicks(kv.Key);
      if (ticks == 0 || ticks != kv.Value.StartTicks) stalePids.Add(kv.Key);
    }
    for (int i = 0; i < stalePids.Count; i++) Cache.Remove(stalePids[i]);

    var staleLogs = new List<string>();
    foreach (var key in Logged) {
      int colon = key.IndexOf(':');
      int pid;
      long ticks;
      if (colon <= 0
          || !int.TryParse(key.Substring(0, colon), out pid)
          || !long.TryParse(key.Substring(colon + 1), out ticks)
          || StartTicks(pid) != ticks) {
        staleLogs.Add(key);
      }
    }
    for (int i = 0; i < staleLogs.Count; i++) Logged.Remove(staleLogs[i]);
  }

  // Failed image lookups are not cached. A reused pid has a new start time
  // and must be classified again; PruneCache drops the stale entry.
  static bool ShouldMute(int pid) {
    long ticks = StartTicks(pid);
    if (ticks == 0) {
      Cache.Remove(pid);
      return false;
    }
    CacheEntry prev;
    if (Cache.TryGetValue(pid, out prev)) {
      if (prev.StartTicks != ticks) Cache.Remove(pid);
      else return prev.Match;
    }
    string image = ImagePath(pid);
    if (string.IsNullOrEmpty(image)) return false;
    bool match = IsPlaywrightBrowser(image);
    Cache[pid] = new CacheEntry { StartTicks = ticks, Match = match };
    return match;
  }

  static void ApplyMute(IAudioSessionControl2 ses, int pid) {
    IntPtr unk = IntPtr.Zero;
    IntPtr volPtr = IntPtr.Zero;
    object volObj = null;
    try {
      unk = Marshal.GetIUnknownForObject(ses);
      Guid iid = VolumeIid;
      if (Marshal.QueryInterface(unk, ref iid, out volPtr) != 0 || volPtr == IntPtr.Zero) return;
      volObj = Marshal.GetObjectForIUnknown(volPtr);
      var vol = (ISimpleAudioVolume)volObj;
      if (vol.SetMute(1, IntPtr.Zero) != 0) return;
      int muted;
      if (vol.GetMute(out muted) != 0 || muted == 0) return;
      long ticks = StartTicks(pid);
      string key = pid.ToString() + ":" + ticks.ToString();
      if (Logged.Add(key)) Log("[playwright-mute] muted pid=" + pid);
    } finally {
      ReleaseCom(volObj);
      if (volPtr != IntPtr.Zero) {
        try { Marshal.Release(volPtr); } catch { }
      }
      if (unk != IntPtr.Zero) {
        try { Marshal.Release(unk); } catch { }
      }
    }
  }

  static void SweepOnce() {
    PruneCache();
    IMMDeviceEnumerator en = null;
    IMMDeviceCollection col = null;
    try {
      en = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
      if (en.EnumAudioEndpoints(0, 1, out col) != 0 || col == null) return;
      int n;
      if (col.GetCount(out n) != 0) return;
      Guid mgrGuid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
      for (int i = 0; i < n; i++) {
        IMMDevice dev = null;
        object mgrObj = null;
        IAudioSessionEnumerator sessions = null;
        try {
          if (col.Item(i, out dev) != 0 || dev == null) continue;
          if (dev.Activate(ref mgrGuid, 23, IntPtr.Zero, out mgrObj) != 0 || mgrObj == null) continue;
          var mgr = (IAudioSessionManager2)mgrObj;
          if (mgr.GetSessionEnumerator(out sessions) != 0 || sessions == null) continue;
          int sc;
          if (sessions.GetCount(out sc) != 0) continue;
          for (int s = 0; s < sc; s++) {
            IAudioSessionControl2 ses = null;
            try {
              if (sessions.GetSession(s, out ses) != 0 || ses == null) continue;
              uint pid;
              if (ses.GetProcessId(out pid) != 0 || pid == 0) continue;
              if (!ShouldMute((int)pid)) continue;
              ApplyMute(ses, (int)pid);
            } catch (Exception ex) {
              Log("[playwright-mute] session failed: " + ex.Message);
            } finally {
              ReleaseCom(ses);
            }
          }
        } catch (Exception ex) {
          Log("[playwright-mute] device failed: " + ex.Message);
        } finally {
          ReleaseCom(sessions);
          ReleaseCom(mgrObj);
          ReleaseCom(dev);
        }
      }
    } finally {
      ReleaseCom(col);
      ReleaseCom(en);
    }
  }

  public static void Run(int parentPid) {
    bool announced = false;
    while (Alive(parentPid)) {
      try {
        SweepOnce();
      } catch (Exception ex) {
        Log("[playwright-mute] sweep failed: " + ex.Message);
      }
      if (!announced) {
        Log("[playwright-mute] ready");
        announced = true;
      }
      System.Threading.Thread.Sleep(100);
    }
  }
}
'@

try {
  Add-Type -TypeDefinition $cs -Language CSharp
} catch {
  Write-MuteLog "[playwright-mute] compile failed: $_"
  exit 1
}

[PlaywrightOutputMute]::Run($ParentPid)
Write-MuteLog "[playwright-mute] runner exited pid=$ParentPid"
