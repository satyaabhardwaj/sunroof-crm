import axios from "axios";
/** Same-origin calls; the CRM session cookie travels with them through the Next.js proxy. */
export function createApiClient() {
  const client = axios.create({ timeout: 15000 });
  client.interceptors.response.use(undefined, (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401)
      location.assign("/login?expired=1");
    return Promise.reject(new Error(apiError(error)));
  });
  return client;
}
export function apiError(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401)
      return "Your backend session is unavailable. Please sign in again or contact your administrator.";
    if (error.response?.status === 403)
      return "You do not have permission to view this department.";
    const data = error.response?.data;
    const reason = data?.error ?? data?.detail;
    return typeof reason === "string"
      ? reason
      : "Could not reach the CRM. Please try again.";
  }
  return error instanceof Error
    ? error.message
    : "Could not load the workspace.";
}
