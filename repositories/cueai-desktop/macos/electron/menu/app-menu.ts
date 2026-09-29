import { Menu, app, BrowserWindow } from "electron";
import { hideCompanion, showCompanion, toggleCompanion } from "../windows/companion-window";
import { openMacOSPrivacySettings } from "../platform/macos";

export function installMacAppMenu(getMainWindow: () => BrowserWindow | null) {
  const isMac = process.platform === "darwin";

  function showMain(path?: string) {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    if (path) win.webContents.send("navigate", path);
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const, label: "About CueAI" },
              { type: "separator" as const },
              {
                label: "Settings…",
                accelerator: "Command+,",
                click: () => showMain("/settings"),
              },
              {
                label: "Permissions…",
                click: () => {
                  showMain("/settings");
                  void openMacOSPrivacySettings("privacy");
                },
              },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const, label: "Hide CueAI" },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const, label: "Quit CueAI" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Live Session",
          accelerator: "CommandOrControl+Shift+M",
          click: () => showMain("/meetings/live"),
        },
        { type: "separator" },
        {
          label: "Close Window",
          accelerator: "CommandOrControl+W",
          click: () => {
            const focused = BrowserWindow.getFocusedWindow();
            const main = getMainWindow();
            if (focused && focused !== main) {
              focused.hide();
              return;
            }
            main?.hide();
          },
        },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Show Desktop Companion",
          accelerator: "CommandOrControl+Shift+Space",
          click: () => void toggleCompanion(),
        },
        {
          label: "Hide Desktop Companion",
          accelerator: "CommandOrControl+Shift+H",
          click: () => void hideCompanion(),
        },
        { type: "separator" },
        {
          label: "Command Palette",
          accelerator: "CommandOrControl+K",
          click: () => {
            const win = getMainWindow();
            win?.show();
            win?.focus();
            win?.webContents.send("shortcut", "command-palette");
          },
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize", accelerator: "Command+M" },
        { role: "zoom" },
        { type: "separator" },
        {
          label: "CueAI",
          click: () => showMain(),
        },
        {
          label: "Desktop Companion",
          click: () => void showCompanion(),
        },
        { type: "separator" },
        { role: "front" },
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Open Dashboard",
          click: () => showMain("/dashboard"),
        },
        {
          label: "Open Settings",
          click: () => showMain("/settings"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
