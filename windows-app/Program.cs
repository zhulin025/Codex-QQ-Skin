using System;
using System.Collections;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Web.Script.Serialization;

[assembly: AssemblyTitle("ChatGPT QQ Skin Setup")]
[assembly: AssemblyDescription("ChatGPT QQ Skin native Windows installer")]
[assembly: AssemblyCompany("Codex QQ Skin")]
[assembly: AssemblyProduct("ChatGPT QQ Skin")]
[assembly: AssemblyVersion("2.5.3.0")]
[assembly: AssemblyFileVersion("2.5.3.0")]

namespace CodexQQSkinSetup
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm(args));
        }
    }

    internal sealed class MainForm : Form
    {
        private readonly Button installButton;
        private readonly Button imageButton;
        private readonly Button bumblebeeButton;
        private readonly Button skillButton;
        private readonly Label skillStatusLabel;
        private readonly Label statusLabel;
        private readonly ProgressBar progress;
        private readonly LinkLabel releaseLink;
        private readonly TextBox log;
        private string currentReleaseUrl;

        private const string CurrentVersion = "2.5.3";
        private const string LatestReleaseApi = "https://api.github.com/repos/zhulin025/Codex-QQ-Skin/releases/latest";

        public MainForm(string[] args)
        {
            Text = "ChatGPT QQ Skin";
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            ShowIcon = true;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(660, 650);
            MinimumSize = new Size(600, 600);
            BackColor = Color.FromArgb(245, 248, 255);
            Font = new Font("Microsoft YaHei UI", 10F);

            Label title = new Label { Text = "ChatGPT QQ Skin", Font = new Font("Microsoft YaHei UI", 23F, FontStyle.Bold), ForeColor = Color.FromArgb(26, 71, 156), AutoSize = true, Location = new Point(32, 25) };
            Label subtitle = new Label { Text = "Windows 原生安装器 · 内置经典 QQ 与大黄蜂深度皮肤", ForeColor = Color.FromArgb(76, 92, 122), AutoSize = true, Location = new Point(36, 76) };
            Controls.Add(title);
            Controls.Add(subtitle);

            installButton = MakeButton("一键安装并启动", new Point(36, 118), Color.FromArgb(43, 111, 232));
            imageButton = MakeButton("上传图片生成皮肤", new Point(338, 118), Color.FromArgb(85, 72, 190));
            installButton.Click += async delegate { await InstallAsync(); };
            imageButton.Click += async delegate { await PickImageAsync(); };
            Controls.Add(installButton);
            Controls.Add(imageButton);

            bumblebeeButton = MakeButton("应用内置大黄蜂皮肤", new Point(36, 184), Color.FromArgb(231, 170, 12));
            bumblebeeButton.Size = new Size(588, 50);
            bumblebeeButton.Click += async delegate { await ApplyBumblebeeAsync(); };
            Controls.Add(bumblebeeButton);

            skillButton = MakeButton("安装 Codex 深度皮肤助手 Skill", new Point(36, 246), Color.FromArgb(64, 78, 108));
            skillButton.Size = new Size(588, 50);
            skillButton.Click += async delegate { await InstallSkillAsync(); };
            Controls.Add(skillButton);
            skillStatusLabel = new Label { AutoSize = false, TextAlign = ContentAlignment.MiddleCenter, Location = new Point(36, 298), Size = new Size(588, 24), ForeColor = Color.FromArgb(76, 92, 122) };
            Controls.Add(skillStatusLabel);
            RefreshSkillButton();

            progress = new ProgressBar { Location = new Point(36, 332), Size = new Size(588, 7), Style = ProgressBarStyle.Marquee, Visible = false };
            statusLabel = new Label { Text = "准备就绪", AutoSize = false, Location = new Point(36, 353), Size = new Size(588, 28), ForeColor = Color.FromArgb(55, 68, 93) };
            releaseLink = new LinkLabel { Text = "下载太慢？前往 GitHub Release 手动下载", AutoSize = false, TextAlign = ContentAlignment.MiddleLeft, Location = new Point(36, 378), Size = new Size(588, 24), Visible = false };
            releaseLink.LinkClicked += delegate { OpenReleasePage(); };
            log = new TextBox { Location = new Point(36, 410), Size = new Size(588, 196), Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, BackColor = Color.White, BorderStyle = BorderStyle.FixedSingle, Font = new Font("Consolas", 9F) };
            Controls.Add(progress);
            Controls.Add(statusLabel);
            Controls.Add(releaseLink);
            Controls.Add(log);
            Shown += async delegate { if (Array.IndexOf(args, "--updated") < 0) await CheckForUpdatesAsync(); };
        }

        private async Task CheckForUpdatesAsync()
        {
            try
            {
                ReleaseInfo release = await DownloadReleaseInfoAsync();
                Version latest, current;
                if (!TryReleaseVersion(release.tag_name, out latest) || !TryReleaseVersion(CurrentVersion, out current) || latest <= current) return;
                DialogResult choice = MessageBox.Show(this, "发现新版本 " + release.tag_name + "。\r\n\r\n当前版本：" + CurrentVersion + "\r\n\r\n是否现在下载并安装？", "ChatGPT QQ Skin 更新", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
                if (choice == DialogResult.Yes) await InstallUpdateAsync(release);
            }
            catch (Exception ex) { AppendLog("检查更新失败（不影响使用）：" + ex.Message); }
        }

        private async Task<ReleaseInfo> DownloadReleaseInfoAsync()
        {
            using (WebClient client = NewWebClient())
            {
                string json = await client.DownloadStringTaskAsync(LatestReleaseApi);
                return new JavaScriptSerializer().Deserialize<ReleaseInfo>(json);
            }
        }

        private async Task InstallUpdateAsync(ReleaseInfo release)
        {
            Version latest, current;
            if (!TryReleaseVersion(release.tag_name, out latest) || !TryReleaseVersion(CurrentVersion, out current) || latest <= current) return;
            string expectedName = "ChatGPT QQ Skin Setup " + latest.ToString(3) + ".exe";
            ReleaseAsset installer = Array.Find(release.assets, delegate(ReleaseAsset a) { return a.name.Equals(expectedName, StringComparison.OrdinalIgnoreCase); });
            ReleaseAsset checksum = installer == null ? null : Array.Find(release.assets, delegate(ReleaseAsset a) { return a.name == installer.name + ".sha256"; });
            if (installer == null || checksum == null) throw new InvalidOperationException("最新 Release 缺少 Windows 安装包或 SHA-256 校验文件。");
            currentReleaseUrl = release.html_url;
            releaseLink.Visible = true;
            progress.Style = ProgressBarStyle.Continuous;
            progress.Minimum = 0;
            progress.Maximum = 100;
            progress.Value = 0;
            await RunBusyAsync(DownloadStatus(release.tag_name, 0, installer.size, 0), async delegate
            {
                string folder = Path.Combine(Path.GetTempPath(), "CodexQQSkinUpdate", release.tag_name);
                Directory.CreateDirectory(folder);
                string target = Path.Combine(folder, installer.name);
                string expected;
                using (WebClient client = NewWebClient())
                {
                    client.DownloadProgressChanged += delegate(object sender, DownloadProgressChangedEventArgs e)
                    {
                        BeginInvoke((Action)(delegate
                        {
                            long total = e.TotalBytesToReceive > 0 ? e.TotalBytesToReceive : installer.size;
                            int percent = total > 0 ? Math.Min(100, (int)(e.BytesReceived * 100L / total)) : 0;
                            progress.Value = percent;
                            statusLabel.Text = DownloadStatus(release.tag_name, e.BytesReceived, total, percent);
                        }));
                    };
                    await client.DownloadFileTaskAsync(installer.browser_download_url, target);
                    expected = (await client.DownloadStringTaskAsync(checksum.browser_download_url)).Split((char[])null, StringSplitOptions.RemoveEmptyEntries)[0].ToLowerInvariant();
                }
                string actual;
                using (SHA256 sha = SHA256.Create()) using (FileStream stream = File.OpenRead(target)) actual = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
                if (expected.Length != 64 || expected != actual) { File.Delete(target); throw new InvalidDataException("安装包校验失败，已取消更新。"); }
                FileVersionInfo downloaded = FileVersionInfo.GetVersionInfo(target);
                Version downloadedVersion;
                if (!TryReleaseVersion(downloaded.FileVersion, out downloadedVersion) || downloadedVersion != latest || downloadedVersion <= current)
                {
                    File.Delete(target);
                    throw new InvalidDataException("安装包版本与 Release 不匹配，已取消更新。");
                }
                Process.Start(new ProcessStartInfo(target, "--updated") { UseShellExecute = true });
                BeginInvoke((Action)(delegate { Close(); }));
                return "新版本安装程序已启动。";
            });
        }

        private static string DownloadStatus(string tag, long received, long total, int percent)
        {
            return total > 0
                ? "正在下载 " + tag + "：" + FormatBytes(received) + " / " + FormatBytes(total) + " (" + percent + "%)"
                : "正在下载 " + tag + "：已下载 " + FormatBytes(received);
        }

        private static string FormatBytes(long bytes)
        {
            double value = Math.Max(0, bytes);
            if (value >= 1024 * 1024 * 1024) return (value / (1024 * 1024 * 1024)).ToString("0.0") + " GB";
            if (value >= 1024 * 1024) return (value / (1024 * 1024)).ToString("0.0") + " MB";
            if (value >= 1024) return (value / 1024).ToString("0.0") + " KB";
            return value.ToString("0") + " B";
        }

        private void OpenReleasePage()
        {
            if (String.IsNullOrWhiteSpace(currentReleaseUrl)) return;
            Process.Start(new ProcessStartInfo(currentReleaseUrl) { UseShellExecute = true });
        }

        private static WebClient NewWebClient()
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            WebClient client = new WebClient();
            client.Headers[HttpRequestHeader.Accept] = "application/vnd.github+json";
            client.Headers[HttpRequestHeader.UserAgent] = "Codex-QQ-Skin/" + CurrentVersion;
            return client;
        }

        private static bool TryReleaseVersion(string value, out Version version)
        {
            version = null;
            if (String.IsNullOrWhiteSpace(value)) return false;
            Version parsed;
            if (!Version.TryParse(value.Trim().TrimStart('v', 'V'), out parsed) || parsed.Build < 0) return false;
            version = new Version(parsed.Major, parsed.Minor, parsed.Build);
            return true;
        }

        private sealed class ReleaseInfo { public string tag_name { get; set; } public string html_url { get; set; } public ReleaseAsset[] assets { get; set; } }
        private sealed class ReleaseAsset { public string name { get; set; } public string browser_download_url { get; set; } public long size { get; set; } }

        private Button MakeButton(string text, Point location, Color color)
        {
            return new Button { Text = text, Location = location, Size = new Size(286, 55), FlatStyle = FlatStyle.Flat, BackColor = color, ForeColor = Color.White, Cursor = Cursors.Hand, Font = new Font("Microsoft YaHei UI", 12F, FontStyle.Bold), FlatAppearance = { BorderSize = 0 } };
        }

        private async Task InstallAsync()
        {
            await RunBusyAsync("正在安装并启动 ChatGPT…", async delegate
            {
                string root = await ExtractPayloadAsync();
                await RunPowerShellAsync(Path.Combine(root, "scripts", "windows", "install-qq-skin-windows.ps1"), "");
                return "安装完成，ChatGPT QQ Skin 已启动。";
            });
        }

        private async Task PickImageAsync()
        {
            using (OpenFileDialog dialog = new OpenFileDialog())
            {
                dialog.Title = "选择一张图片生成皮肤";
                dialog.Filter = "图片文件|*.png;*.jpg;*.jpeg;*.webp|PNG|*.png|JPEG|*.jpg;*.jpeg|WebP|*.webp";
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                string selected = dialog.FileName;
                await RunBusyAsync("正在分析图片并生成皮肤…", async delegate
                {
                    string installed = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodexQQSkin", "engine");
                    string script = Path.Combine(installed, "scripts", "windows", "customize-qq-skin-windows.ps1");
                    if (!File.Exists(script))
                    {
                        string root = await ExtractPayloadAsync();
                        await RunPowerShellAsync(Path.Combine(root, "scripts", "windows", "install-qq-skin-windows.ps1"), "-NoLaunch");
                    }
                    await RunPowerShellAsync(script, "-Image " + Quote(selected));
                    return "皮肤已生成并应用，ChatGPT 已启动。";
                });
            }
        }

        private async Task ApplyBumblebeeAsync()
        {
            await RunBusyAsync("正在安装并应用大黄蜂深度皮肤…", async delegate
            {
                string installed = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodexQQSkin", "engine");
                string switcher = Path.Combine(installed, "scripts", "windows", "switch-theme-windows.ps1");
                string root = await ExtractPayloadAsync();
                await RunPowerShellAsync(Path.Combine(root, "scripts", "windows", "install-qq-skin-windows.ps1"), "-NoLaunch");
                if (!File.Exists(switcher)) throw new FileNotFoundException("安装后的引擎缺少皮肤切换器。", switcher);
                await RunPowerShellAsync(switcher, "-Id preset-bumblebee");
                return "大黄蜂深度皮肤已从安装器内置预设中应用。";
            });
        }

        private void RefreshSkillButton()
        {
            string skill = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".codex", "skills", "codex-deep-skin-builder", "SKILL.md");
            bool installed = File.Exists(skill);
            bool current = installed && BundledSkillMatches(skill);
            if (current)
            {
                skillButton.Text = "✓ 已安装 Codex 深度皮肤助手 Skill";
                skillStatusLabel.Text = "Skill 用法：在 Codex 输入“用深度皮肤助手生成钢铁侠主题皮肤”";
            }
            else if (installed)
            {
                skillButton.Text = "更新 Codex 深度皮肤助手 Skill";
                skillStatusLabel.Text = "检测到已安装的 Skill 版本较旧，可以安全更新";
            }
            else
            {
                skillButton.Text = "安装 Codex 深度皮肤助手 Skill";
                skillStatusLabel.Text = "尚未安装这个 Skill，安装后可在 Codex 内直接使用";
            }
            skillButton.Enabled = !current;
        }

        private static bool BundledSkillMatches(string installedPath)
        {
            try
            {
                using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("CodexQQSkin.payload.zip"))
                using (ZipArchive archive = new ZipArchive(resource, ZipArchiveMode.Read))
                {
                    ZipArchiveEntry entry = archive.GetEntry("skills/codex-deep-skin-builder/SKILL.md");
                    if (entry == null) return false;
                    using (Stream bundled = entry.Open())
                    using (SHA256 sha = SHA256.Create())
                    {
                        byte[] bundledHash = sha.ComputeHash(bundled);
                        byte[] installedHash;
                        using (FileStream file = File.OpenRead(installedPath)) installedHash = sha.ComputeHash(file);
                        return StructuralComparisons.StructuralEqualityComparer.Equals(bundledHash, installedHash);
                    }
                }
            }
            catch { return false; }
        }

        private async Task InstallSkillAsync()
        {
            await RunBusyAsync("正在安装 Codex 深度皮肤助手 Skill…", async delegate
            {
                string root = await ExtractPayloadAsync();
                await RunPowerShellAsync(Path.Combine(root, "scripts", "windows", "install-deep-skin-skill-windows.ps1"), "");
                BeginInvoke((Action)RefreshSkillButton);
                return "深度皮肤助手 Skill 已安装。现在可在 Codex 中输入：用 Codex 深度皮肤助手生成一个钢铁侠主题皮肤";
            });
        }

        private async Task RunBusyAsync(string running, Func<Task<string>> action)
        {
            installButton.Enabled = imageButton.Enabled = bumblebeeButton.Enabled = skillButton.Enabled = false;
            progress.Visible = true;
            if (String.IsNullOrWhiteSpace(currentReleaseUrl)) progress.Style = ProgressBarStyle.Marquee;
            statusLabel.Text = running;
            log.Clear();
            try
            {
                statusLabel.Text = await action();
                MessageBox.Show(this, statusLabel.Text, "ChatGPT QQ Skin", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                statusLabel.Text = "操作失败";
                AppendLog(ex.Message);
                if (!String.IsNullOrWhiteSpace(currentReleaseUrl))
                {
                    DialogResult fallback = MessageBox.Show(this, ex.Message + "\r\n\r\n自动更新失败。是否前往 GitHub Release 页面手动下载？", "ChatGPT QQ Skin", MessageBoxButtons.YesNo, MessageBoxIcon.Error);
                    if (fallback == DialogResult.Yes) OpenReleasePage();
                }
                else
                {
                    MessageBox.Show(this, ex.Message, "ChatGPT QQ Skin", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            finally
            {
                progress.Visible = false;
                progress.Style = ProgressBarStyle.Marquee;
                progress.Value = 0;
                releaseLink.Visible = false;
                currentReleaseUrl = null;
                installButton.Enabled = imageButton.Enabled = bumblebeeButton.Enabled = true;
                RefreshSkillButton();
            }
        }

        private async Task<string> ExtractPayloadAsync()
        {
            string target = Path.Combine(Path.GetTempPath(), "CodexQQSkinSetup", CurrentVersion);
            string marker = Path.Combine(target, ".complete");
            if (File.Exists(marker)) return target;
            return await Task.Run(delegate
            {
                if (Directory.Exists(target)) Directory.Delete(target, true);
                Directory.CreateDirectory(target);
                using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("CodexQQSkin.payload.zip"))
                {
                    if (resource == null) throw new InvalidOperationException("安装包资源损坏：找不到内置引擎。");
                    using (ZipArchive archive = new ZipArchive(resource, ZipArchiveMode.Read))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            string destination = Path.GetFullPath(Path.Combine(target, entry.FullName));
                            if (!destination.StartsWith(target + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("安装包包含不安全路径。");
                            if (String.IsNullOrEmpty(entry.Name)) { Directory.CreateDirectory(destination); continue; }
                            Directory.CreateDirectory(Path.GetDirectoryName(destination));
                            entry.ExtractToFile(destination, true);
                        }
                    }
                }
                File.WriteAllText(marker, "ok", Encoding.ASCII);
                return target;
            });
        }

        private async Task RunPowerShellAsync(string script, string arguments)
        {
            if (!File.Exists(script)) throw new FileNotFoundException("找不到所需脚本。", script);
            ProcessStartInfo info = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File " + Quote(script) + (String.IsNullOrEmpty(arguments) ? "" : " " + arguments));
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.StandardOutputEncoding = Encoding.UTF8;
            info.StandardErrorEncoding = Encoding.UTF8;
            Process process = new Process { StartInfo = info, EnableRaisingEvents = true };
            TaskCompletionSource<bool> active = new TaskCompletionSource<bool>();
            DataReceivedEventHandler outputHandler = delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data == null) return;
                if (e.Data.IndexOf("is active on loopback port", StringComparison.OrdinalIgnoreCase) >= 0) active.TrySetResult(true);
                BeginInvoke((Action)(delegate { AppendLog(e.Data); }));
            };
            process.OutputDataReceived += outputHandler;
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) BeginInvoke((Action)(delegate { AppendLog(e.Data); })); };
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            Task exitTask = Task.Run(delegate { process.WaitForExit(); });
            Task completed = await Task.WhenAny(exitTask, active.Task);
            if (completed == active.Task)
            {
                // State has already been written and the skin has been verified.
                // Do not keep the GUI waiting for inherited watcher handles.
                exitTask.ContinueWith(delegate { process.Dispose(); });
                return;
            }
            if (process.ExitCode != 0)
            {
                int code = process.ExitCode;
                process.Dispose();
                throw new InvalidOperationException("操作未完成（错误代码 " + code + "）。请查看窗口日志。");
            }
            process.Dispose();
        }

        private void AppendLog(string value) { log.AppendText(value + Environment.NewLine); }
        private static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
    }
}
