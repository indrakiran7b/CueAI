export {
  checkMicrophonePermission,
  checkScreenRecordingPermission,
  checkSystemAudioPermission,
  getMacOSPermissions,
  openMacOSPrivacySettings,
  requestMacOSPermission,
  requestMicrophonePermission,
  requestScreenRecordingPermission,
  requestSystemAudioPermission,
  type MacPermissionKind,
  type MacPermissionState,
  type MacPermissionStatus,
  type MacPermissionsSnapshot,
} from "./macosPermissions";

export { MacOSSystemAudioService, macOSSystemAudio } from "./macosAudio";

export {
  captureMacDisplay,
  listMacDisplays,
  listMacWindows,
  type MacDisplayInfo,
  type MacWindowInfo,
  type ScreenshotResult,
} from "./macosCapture";

export { setOverlayCaptureProtection } from "./macosContentProtection";

export {
  applyMacAppearance,
  focusOrRestoreWindow,
  macCompanionWindowOptions,
  macMainWindowOptions,
  presentCompanionWindow,
  zoomOrRestoreWindow,
} from "./macosWindow";

export {
  getPublicMacDevice,
  getOrCreateMacDeviceIdentity,
  MacDeviceService,
  macDeviceService,
  type MacPublicDevice,
} from "./macosDevice";

export { installMacContextMenu } from "./macosContextMenu";
