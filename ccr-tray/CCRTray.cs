using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

// ============================================================================
// CCRTray - Claude Code Router tray monitor
//
// Architecture:
//   - UI thread: only renders tray icon/tooltip and handles menu clicks.
//   - ThreadPool: all probing (file read, TCP connect, HTTP RPC) so the tray
//     menu never blocks. One probe at a time; results marshalled via BeginInvoke.
//
// Status sources:
//   service: %APPDATA%\claude-code-router\service.json (pid + management url)
//   gateway: RPC getGatewayStatus on /api/ccr/rpc (auth token from the url)
// ============================================================================

namespace CCRTray
{
    internal enum StateLevel { Stopped = 0, Partial = 1, Running = 2, Error = 3 }

    internal struct ProbeResult
    {
        public StateLevel Level;
        public string Title;
        public string Detail;
    }

    internal static class Paths
    {
        public const string CcrCmd = @"Z:\Nodejs_Global\node_global\ccr.cmd";
        public static readonly string ServiceJson = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "claude-code-router", "service.json");
        public const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        public const string RunKeyName = "CCRTray";
    }

    internal static class Probe
    {
        public static ProbeResult Run()
        {
            int pid;
            string url;
            if (!ReadServiceState(out pid, out url))
                return Fail(StateLevel.Stopped, "CCR 服务未运行", "未找到 service.json");

            if (!IsProcessAlive(pid))
                return Fail(StateLevel.Stopped, "CCR 服务未运行", "service.json 中的进程已退出");

            Uri uri;
            try { uri = new Uri(url); }
            catch { return Fail(StateLevel.Error, "CCR 状态异常", "service.json 中的 URL 无效"); }

            if (!PortOpen(uri.Host, uri.Port))
                return Fail(StateLevel.Partial, "CCR 进程存活", "管理端口 " + uri.Port + " 无响应");

            string gatewayState;
            string gatewayEndpoint;
            if (!TryGatewayStatus(uri, out gatewayState, out gatewayEndpoint))
                return Fail(StateLevel.Partial, "管理服务运行中", "网关状态查询失败");

            if (gatewayState == "running")
                return Fail(StateLevel.Running, "CCR 运行正常", "网关: " + gatewayEndpoint);

            string shortState = gatewayState.Length > 40 ? gatewayState.Substring(0, 40) : gatewayState;
            return Fail(StateLevel.Error, "管理服务运行中", "网关: " + shortState);
        }

        private static ProbeResult Fail(StateLevel level, string title, string detail)
        {
            return new ProbeResult { Level = level, Title = title, Detail = detail };
        }

        private static bool ReadServiceState(out int pid, out string url)
        {
            pid = 0;
            url = null;
            try
            {
                if (!File.Exists(Paths.ServiceJson)) return false;
                string json = File.ReadAllText(Paths.ServiceJson);
                pid = (int)ExtractNumber(json, "\"pid\":");
                url = ExtractString(json, "\"url\":");
                return pid > 0 && !string.IsNullOrEmpty(url);
            }
            catch { return false; }
        }

        private static bool IsProcessAlive(int pid)
        {
            try { using (Process.GetProcessById(pid)) { return true; } }
            catch { return false; }
        }

        private static bool PortOpen(string host, int port)
        {
            try
            {
                using (var client = new TcpClient())
                {
                    var ar = client.BeginConnect(host, port, null, null);
                    bool ok = ar.AsyncWaitHandle.WaitOne(800);
                    if (!ok) return false;
                    client.EndConnect(ar);
                    return true;
                }
            }
            catch { return false; }
        }

        private static bool TryGatewayStatus(Uri uri, out string state, out string endpoint)
        {
            state = "unknown";
            endpoint = "";
            try
            {
                string token = ExtractToken(uri.Query);

                var request = (HttpWebRequest)WebRequest.Create(
                    "http://" + uri.Host + ":" + uri.Port + "/api/ccr/rpc");
                request.Method = "POST";
                request.ContentType = "application/json";
                request.Timeout = 2000;
                request.ReadWriteTimeout = 2000;
                if (token.Length > 0) request.Headers["x-ccr-web-auth"] = token;

                byte[] bodyBytes = System.Text.Encoding.UTF8.GetBytes(
                    "{\"method\":\"getGatewayStatus\",\"args\":[]}");
                using (var stream = request.GetRequestStream())
                    stream.Write(bodyBytes, 0, bodyBytes.Length);

                using (var response = (HttpWebResponse)request.GetResponse())
                using (var reader = new StreamReader(response.GetResponseStream()))
                {
                    string json = reader.ReadToEnd();
                    state = ExtractString(json, "\"state\":") ?? "unknown";
                    endpoint = ExtractString(json, "\"endpoint\":") ?? "";
                    return true;
                }
            }
            catch { return false; }
        }

        private static string ExtractToken(string query)
        {
            if (string.IsNullOrEmpty(query)) return "";
            const string marker = "ccr_web_token=";
            int idx = query.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (idx < 0) return "";
            string token = query.Substring(idx + marker.Length);
            int amp = token.IndexOf('&');
            if (amp >= 0) token = token.Substring(0, amp);
            return token;
        }

        // Minimal JSON field extraction - avoids pulling in a JSON dependency.
        private static string ExtractString(string json, string key)
        {
            int idx = json.IndexOf(key, StringComparison.Ordinal);
            if (idx < 0) return null;
            int start = json.IndexOf('"', idx + key.Length);
            if (start < 0) return null;
            int end = json.IndexOf('"', start + 1);
            if (end < 0) return null;
            return json.Substring(start + 1, end - start - 1);
        }

        private static long ExtractNumber(string json, string key)
        {
            int idx = json.IndexOf(key, StringComparison.Ordinal);
            if (idx < 0) return 0;
            int i = idx + key.Length;
            while (i < json.Length && (char.IsWhiteSpace(json[i]) || json[i] == ':')) i++;
            int start = i;
            while (i < json.Length && char.IsDigit(json[i])) i++;
            if (i == start) return 0;
            long value;
            return long.TryParse(json.Substring(start, i - start), out value) ? value : 0;
        }
    }

    internal sealed class TrayApplicationContext : ApplicationContext
    {
        private const int CheckIntervalMs = 3000;

        // Hidden form used purely as an Invoke marshal target (NotifyIcon has none).
        private readonly Form syncForm;
        private readonly NotifyIcon tray;
        private readonly System.Windows.Forms.Timer uiTimer;
        private readonly MenuItem menuOpenUi;
        private readonly MenuItem menuStart;
        private readonly MenuItem menuStop;
        private readonly MenuItem menuAutoStart;

        // Prebuilt icons, one per state - never recreated at runtime.
        private readonly Icon[] stateIcons;
        private StateLevel lastLevel = (StateLevel)(-1);
        private int pollInFlight;

        public TrayApplicationContext()
        {
            syncForm = new Form
            {
                ShowInTaskbar = false,
                WindowState = FormWindowState.Minimized,
                FormBorderStyle = FormBorderStyle.None,
                StartPosition = FormStartPosition.Manual,
                Location = new Point(-10000, -10000),
                Size = new Size(1, 1),
                Opacity = 0
            };
            syncForm.Show(); // force handle creation so BeginInvoke always works
            syncForm.Hide();

            stateIcons = new[]
            {
                MakeIcon(Color.FromArgb(156, 163, 175)), // Stopped - gray
                MakeIcon(Color.FromArgb(234, 179, 8)),   // Partial - yellow
                MakeIcon(Color.FromArgb(34, 197, 94)),   // Running - green
                MakeIcon(Color.FromArgb(239, 68, 68))    // Error   - red
            };

            menuOpenUi = new MenuItem("打开管理界面", delegate { OpenUi(); });
            menuStart = new MenuItem("启动服务", delegate { RunCcr("start --no-open"); });
            menuStop = new MenuItem("停止服务", delegate { RunCcr("stop"); });
            menuAutoStart = new MenuItem("开机自启", delegate { ToggleAutoStart(); });
            MenuItem menuRefresh = new MenuItem("立即刷新", delegate { QueueProbe(); });
            MenuItem menuExit = new MenuItem("退出", delegate { ExitThread(); });

            tray = new NotifyIcon
            {
                Icon = stateIcons[0],
                Visible = true,
                Text = "CCR 状态检查中..."
            };
            tray.DoubleClick += delegate { OpenUi(); };
            tray.ContextMenu = new ContextMenu(new[]
            {
                menuOpenUi, menuStart, menuStop, menuAutoStart, menuRefresh, menuExit
            });

            uiTimer = new System.Windows.Forms.Timer { Interval = CheckIntervalMs };
            uiTimer.Tick += delegate { QueueProbe(); };

            QueueProbe();
            uiTimer.Start();
        }

        protected override void ExitThreadCore()
        {
            uiTimer.Stop();
            tray.Visible = false;
            tray.Dispose();
            syncForm.Dispose();
            foreach (Icon icon in stateIcons)
            {
                if (icon != null) DestroyIcon(icon.Handle);
            }
            base.ExitThreadCore();
        }

        // ---- background probing ----

        private void QueueProbe()
        {
            if (Interlocked.Exchange(ref pollInFlight, 1) != 0) return;
            ThreadPool.QueueUserWorkItem(delegate
            {
                ProbeResult result;
                try { result = Probe.Run(); }
                catch { result = new ProbeResult { Level = StateLevel.Error, Title = "探测异常", Detail = "" }; }
                try { syncForm.BeginInvoke((MethodInvoker)delegate { ApplyResult(result); }); }
                catch { Interlocked.Exchange(ref pollInFlight, 0); }
            });
        }

        private void ApplyResult(ProbeResult result)
        {
            Interlocked.Exchange(ref pollInFlight, 0);

            if (result.Level != lastLevel)
            {
                tray.Icon = stateIcons[(int)result.Level];
                lastLevel = result.Level;
            }

            string text = "CCR - " + result.Title;
            if (!string.IsNullOrEmpty(result.Detail)) text += "\n" + result.Detail;
            if (text.Length > 63) text = text.Substring(0, 63);
            tray.Text = text;

            menuOpenUi.Enabled = result.Level >= StateLevel.Partial;
            menuStop.Enabled = result.Level >= StateLevel.Partial;
            menuStart.Enabled = result.Level == StateLevel.Stopped;
            menuAutoStart.Checked = AutoStartEnabled();
        }

        // ---- actions ----

        private static void OpenUi()
        {
            int pid;
            string url;
            if (ProbeReadService(out pid, out url) && IsAlive(pid))
            {
                Process.Start(url);
                return;
            }
            RunCcr("ui");
        }

        private static bool ProbeReadService(out int pid, out string url)
        {
            pid = 0;
            url = null;
            try
            {
                if (!File.Exists(Paths.ServiceJson)) return false;
                string json = File.ReadAllText(Paths.ServiceJson);
                pid = (int)ExtractPid(json);
                url = ExtractUrl(json);
                return pid > 0 && !string.IsNullOrEmpty(url);
            }
            catch { return false; }
        }

        private static bool IsAlive(int pid)
        {
            try { using (Process.GetProcessById(pid)) { return true; } }
            catch { return false; }
        }

        private static long ExtractPid(string json)
        {
            int idx = json.IndexOf("\"pid\":", StringComparison.Ordinal);
            if (idx < 0) return 0;
            int i = idx + 6;
            while (i < json.Length && (char.IsWhiteSpace(json[i]) || json[i] == ':')) i++;
            int start = i;
            while (i < json.Length && char.IsDigit(json[i])) i++;
            long value;
            return i > start && long.TryParse(json.Substring(start, i - start), out value) ? value : 0;
        }

        private static string ExtractUrl(string json)
        {
            int idx = json.IndexOf("\"url\":", StringComparison.Ordinal);
            if (idx < 0) return null;
            int start = json.IndexOf('"', idx + 6);
            if (start < 0) return null;
            int end = json.IndexOf('"', start + 1);
            return end < 0 ? null : json.Substring(start + 1, end - start - 1);
        }

        private static void RunCcr(string arguments)
        {
            try
            {
                var info = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c \"" + Paths.CcrCmd + "\" " + arguments,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(info);
            }
            catch (Exception ex)
            {
                MessageBox.Show("执行 ccr " + arguments + " 失败:\n" + ex.Message,
                    "CCRTray", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ---- autostart ----

        private static bool AutoStartEnabled()
        {
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(Paths.RunKeyPath))
                {
                    return key != null && key.GetValue(Paths.RunKeyName) != null;
                }
            }
            catch { return false; }
        }

        private void ToggleAutoStart()
        {
            try
            {
                using (var key = Registry.CurrentUser.CreateSubKey(Paths.RunKeyPath))
                {
                    if (AutoStartEnabled())
                        key.DeleteValue(Paths.RunKeyName, false);
                    else
                        key.SetValue(Paths.RunKeyName, "\"" + Application.ExecutablePath + "\"");
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("设置开机自启失败:\n" + ex.Message,
                    "CCRTray", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            menuAutoStart.Checked = AutoStartEnabled();
        }

        // ---- helpers ----

        private static Icon MakeIcon(Color color)
        {
            var bitmap = new Bitmap(16, 16);
            using (var graphics = Graphics.FromImage(bitmap))
            using (var brush = new SolidBrush(color))
            {
                graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                graphics.FillEllipse(brush, 1, 1, 14, 14);
            }
            IntPtr handle = bitmap.GetHicon();
            bitmap.Dispose();
            return Icon.FromHandle(handle);
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool DestroyIcon(IntPtr handle);
    }

    internal static class Program
    {
        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TrayApplicationContext());
        }
    }
}
