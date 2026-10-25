// The message for a refused admin-PIN request. After too many wrong PINs the
// server answers 429 with how long to wait (server/utils/adminPin.js), even
// for the right one.
export function pinErrorText(error, t, fallback) {
  const response = error?.response;
  if (response?.status === 429) {
    const seconds = Number(response.data?.retryAfterSeconds) || Number(response.headers?.['retry-after']) || 30;
    return t('common:pin.tooManyTries', { seconds });
  }
  return response?.data?.error || fallback;
}
