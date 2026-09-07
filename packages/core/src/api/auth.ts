import { CoreError, CoreErrorCode } from "../errors.js";
import type { AuthStatus } from "../types.js";
import type { QqMusicClient } from "../client.js";

export class AuthApi {
  constructor(private readonly client: QqMusicClient) {}

  async getStatus(): Promise<AuthStatus> {
    const credential = this.client.getCredential();
    if (credential.musicid && credential.musickey) {
      return { state: "logged_in", musicId: String(credential.musicid) };
    }
    return { state: "logged_out" };
  }

  async startQrLogin(): Promise<never> {
    throw new CoreError(CoreErrorCode.NOT_IMPLEMENTED, "首版未实现二维码登录");
  }

  async pollQrLogin(): Promise<never> {
    throw new CoreError(CoreErrorCode.NOT_IMPLEMENTED, "首版未实现二维码登录");
  }

  async importCredential(): Promise<never> {
    throw new CoreError(CoreErrorCode.NOT_IMPLEMENTED, "首版未实现凭据导入");
  }

  async logout(): Promise<void> {
    this.client.setCredential({});
  }
}
