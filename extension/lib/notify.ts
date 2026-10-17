import i18n from "./i18n";
import { parseApiError, type SuccessCode } from "./error-codes";

export function getErrorMessage(errOrCode: unknown, params?: Record<string, unknown>): string {
  const { code, message } = typeof errOrCode === "string" && !errOrCode.startsWith("{")
    ? { code: errOrCode, message: undefined }
    : parseApiError(errOrCode);

  const key = `codes.error.${code}`;
  if (i18n.exists(key)) {
    return i18n.t(key, params);
  }
  return message || i18n.t("codes.error.ERR_UNKNOWN", { error: code });
}

export function getSuccessMessage(code: SuccessCode, params?: Record<string, unknown>): string {
  const key = `codes.success.${code}`;
  if (i18n.exists(key)) {
    return i18n.t(key, params);
  }
  return i18n.t("codes.success.SUCCESS_OK");
}
