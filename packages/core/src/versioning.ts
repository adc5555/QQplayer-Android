import type { AndroidDevice } from "./device.js";
import { hash33 } from "./utils/common.js";
import type { PlatformName } from "./types.js";

const ANDROID_PROFILE = {
  ct: 11,
  cv: 14090008,
  v: 14090008,
  uaVersion: 14090008,
  qimeiAppVersion: "14.9.0.8",
  qimeiSdkVersion: "1.2.13.6"
};

const DESKTOP_PROFILE = { ct: 19, cv: 2201 };
const WEB_PROFILE = { ct: 24, cv: 4747474, platform: "yqq.json" };

export interface CredentialLike {
  musicid?: number;
  musickey?: string;
  loginType?: number;
}

export function buildComm(
  platform: PlatformName,
  credential: CredentialLike,
  device: AndroidDevice,
  qimei?: { q16: string; q36: string }
): Record<string, unknown> {
  if (platform === "desktop") {
    return {
      ct: DESKTOP_PROFILE.ct,
      cv: DESKTOP_PROFILE.cv,
      platform: "yqq.json",
      chid: "0",
      uin: credential.musickey ? credential.musicid : undefined,
      g_tk: hash33(credential.musickey ?? "", 5381),
      guid: device.openUdid.toUpperCase()
    };
  }
  if (platform === "web") {
    const gtk = hash33(credential.musickey ?? "", 5381);
    return {
      ct: WEB_PROFILE.ct,
      cv: WEB_PROFILE.cv,
      platform: WEB_PROFILE.platform,
      chid: "0",
      uin: credential.musickey ? credential.musicid : undefined,
      g_tk: gtk,
      g_tk_new_20200303: gtk,
      format: "json",
      inCharset: "utf-8",
      outCharset: "utf-8",
      notice: 0,
      need_new_code: 1
    };
  }
  return compact({
    ct: ANDROID_PROFILE.ct,
    cv: ANDROID_PROFILE.cv,
    v: ANDROID_PROFILE.v,
    chid: "10003505",
    qq: credential.musicid ? String(credential.musicid) : undefined,
    authst: credential.musickey || undefined,
    tmeAppID: "qqmusic",
    tmeLoginType: credential.loginType || undefined,
    QIMEI: qimei?.q16 ?? "",
    QIMEI36: qimei?.q36 ?? "",
    OpenUDID: device.openUdid,
    udid: device.openUdid,
    uid: device.sessionUid,
    OpenUDID2: device.openUdid,
    sid: device.sessionSid,
    aid: device.androidId,
    os_ver: device.version.release,
    phonetype: device.model,
    devicelevel: String(device.version.sdk),
    newdevicelevel: String(device.version.sdk),
    rom: device.fingerprint
  });
}

export function getUserAgent(platform: PlatformName, device?: AndroidDevice): string {
  if (platform === "android") {
    return `QQMusic ${ANDROID_PROFILE.uaVersion}(android ${device?.version.release ?? "10"})`;
  }
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
}

export function getVersionProfile(platform: PlatformName): { appVersion: string; sdkVersion: string } {
  return platform === "android"
    ? { appVersion: ANDROID_PROFILE.qimeiAppVersion, sdkVersion: ANDROID_PROFILE.qimeiSdkVersion }
    : { appVersion: ANDROID_PROFILE.qimeiAppVersion, sdkVersion: ANDROID_PROFILE.qimeiSdkVersion };
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item;
  }
  return out;
}
