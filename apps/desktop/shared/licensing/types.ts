export type LicensePlatform = "windows" | "macos";

export type LicenseState =
  | "ACTIVE"
  | "EXPIRED"
  | "REVOKED"
  | "INVALID"
  | "DEVICE_LIMIT_REACHED"
  | "NOT_ACTIVATED"
  | "NETWORK_ERROR";

export type SignedActivationPayload = {
  licenseId: string;
  deviceId: string;
  platform: LicensePlatform;
  licenseType: string;
  clientName: string;
  expiresAt: string;
  activatedAt: string;
  validatedAt: string;
  graceUntil: string;
};

export type LocalActivationRecord = {
  licenseId: string;
  deviceId: string;
  platform: LicensePlatform;
  licenseType: string;
  clientName: string;
  expiresAt: string;
  signedPayload: SignedActivationPayload;
  signature: string;
  lastValidatedAt: string;
};

export type LicenseStatusResult = {
  ok: boolean;
  state: LicenseState;
  authorized: boolean;
  message?: string;
  clientName?: string;
  licenseType?: string;
  expiresAt?: string;
  devicesActive?: number;
  maxDevices?: number;
  licenseId?: string;
  deviceId?: string;
  platform?: LicensePlatform;
};

export type LicenseActivateResult = LicenseStatusResult & {
  signedPayload?: SignedActivationPayload;
  signature?: string;
};
