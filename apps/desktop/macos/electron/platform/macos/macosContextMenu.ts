import { Menu, shell, type BrowserWindow } from "electron";

export function installMacContextMenu(win: BrowserWindow) {
  win.webContents.on("context-menu", (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [];

    if (params.linkURL) {
      template.push({
        label: "Open Link",
        click: () => void shell.openExternal(params.linkURL),
      });
      template.push({ type: "separator" });
    }

    if (params.editFlags.canCopy) template.push({ role: "copy" });
    if (params.editFlags.canCut) template.push({ role: "cut" });
    if (params.editFlags.canPaste) template.push({ role: "paste" });
    if (params.editFlags.canSelectAll) template.push({ role: "selectAll" });

    if (params.srcURL?.startsWith("file://")) {
      template.push({ type: "separator" });
      template.push({
        label: "Reveal in Finder",
        click: () => shell.showItemInFolder(decodeURIComponent(params.srcURL.replace("file://", ""))),
      });
    }

    if (template.length === 0) {
      template.push({ role: "copy", enabled: false });
      template.push({ role: "selectAll" });
    }

    Menu.buildFromTemplate(template).popup({ window: win });
  });
}
