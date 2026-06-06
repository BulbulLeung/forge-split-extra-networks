import html
import os
import platform
import subprocess
import time

from modules import shared

_EXPLORER_WINDOW_CLASSES = frozenset({"CabinetWClass", "ExploreWClass"})
_WINDOWS_FOCUS_POLL_INTERVAL_S = 0.1
_WINDOWS_FOCUS_POLL_ATTEMPTS = 20
_SW_SHOW = 5
_VK_MENU = 0x12
_KEYEVENTF_KEYUP = 0x0002


def _enum_explorer_hwnds() -> set[int]:
    """Return visible Explorer top-level window handles on Windows."""
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    hwnds: set[int] = set()

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def enum_callback(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True

        class_buf = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, class_buf, 256)
        if class_buf.value in _EXPLORER_WINDOW_CLASSES:
            hwnds.add(int(hwnd))
        return True

    user32.EnumWindows(enum_callback, 0)
    return hwnds


def _windows_focus_hwnd(hwnd: int) -> None:
    """Bring an Explorer window to the foreground (Windows Foreground Lock workaround)."""
    import ctypes

    user32 = ctypes.windll.user32

    # Alt trick: grants permission to call SetForegroundWindow from a background process.
    user32.keybd_event(_VK_MENU, 0, 0, 0)
    user32.keybd_event(_VK_MENU, 0, _KEYEVENTF_KEYUP, 0)

    user32.ShowWindow(hwnd, _SW_SHOW)
    user32.BringWindowToTop(hwnd)
    if not user32.SetForegroundWindow(hwnd):
        user32.SwitchToThisWindow(hwnd, True)


def _windows_raise_explorer_window(path: str) -> None:
    """Open a new Explorer window and raise it above other apps (including the browser)."""
    before = _enum_explorer_hwnds()
    subprocess.Popen(["explorer.exe", "/n,", path])

    new_hwnd = None
    for _ in range(_WINDOWS_FOCUS_POLL_ATTEMPTS):
        time.sleep(_WINDOWS_FOCUS_POLL_INTERVAL_S)
        after = _enum_explorer_hwnds()
        new_hwnds = after - before
        if new_hwnds:
            new_hwnd = max(new_hwnds)
            break

    if new_hwnd is not None:
        _windows_focus_hwnd(new_hwnd)


def _open_folder_focused(path: str) -> None:
    """Open a folder in the OS file manager and show it in the foreground when possible."""
    path = os.path.normpath(path)
    system = platform.system()

    if system == "Windows":
        _windows_raise_explorer_window(path)
        return

    if system == "Darwin":
        subprocess.Popen(["open", "-a", "Finder", path])
        return

    if "microsoft-standard-WSL2" in platform.uname().release:
        win_path = subprocess.check_output(["wslpath", "-w", path]).decode().strip()
        subprocess.Popen(["explorer.exe", "/n,", win_path])
        return

    subprocess.Popen(["xdg-open", path])


def try_open_folder(path: str | None) -> dict:
    """Validate path and open in the OS file manager. Returns {ok, path?, error?}."""
    if shared.cmd_opts.hide_ui_dir_config:
        return {
            "ok": False,
            "error": "Disabled when launched with --hide-ui-dir-config.",
        }

    if not path or not str(path).strip():
        return {"ok": False, "error": "Directory not configured in Settings."}

    abspath = os.path.abspath(str(path))

    if not os.path.exists(abspath):
        return {
            "ok": False,
            "error": (
                f'Folder "{abspath}" does not exist. '
                "After you save an image, the folder will be created."
            ),
        }

    if not os.path.isdir(abspath):
        return {"ok": False, "error": f'Path is not a folder: "{abspath}"'}

    _open_folder_focused(abspath)
    return {"ok": True, "path": abspath}


def inject_open_folder_button(
    html_content: str,
    tabname: str,
    extra_networks_tabname: str,
    onclick: str,
    title: str,
) -> str:
    """Insert Open Folder control after the Refresh button in Extra Networks toolbar."""
    if shared.cmd_opts.hide_ui_dir_config:
        return html_content

    refresh_id = f'id="{tabname}_{extra_networks_tabname}_extra_refresh"'
    idx = html_content.find(refresh_id)
    if idx < 0:
        return html_content

    icon_marker = "extra-network-control--refresh-icon\"></i>"
    icon_pos = html_content.find(icon_marker, idx)
    if icon_pos < 0:
        return html_content

    close_pos = html_content.find("</div>", icon_pos)
    if close_pos < 0:
        return html_content

    insert_at = close_pos + len("</div>")
    btn = (
        f'\n        <div id="{tabname}_{extra_networks_tabname}_extra_open_folder"'
        f' class="extra-network-control--open-folder"'
        f' title="{html.escape(title)}"'
        f" onclick=\"{onclick}(event, '{tabname}');\">"
        f'\n            <i class="extra-network-control--icon extra-network-control--open-folder-icon"></i>'
        f"\n        </div>"
    )
    return html_content[:insert_at] + btn + html_content[insert_at:]
