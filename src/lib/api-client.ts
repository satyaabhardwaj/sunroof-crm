import axios from "axios";
export function createApiClient(getToken: () => Promise<string | null>) {
  const client = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
    timeout: 15000,
  });
  client.interceptors.request.use(async (config) => {
    if (!process.env.NEXT_PUBLIC_API_BASE_URL)
      throw new Error("Backend connection is not configured.");
    const token = await getToken();
    if (!token) throw new Error("Please sign in to continue.");
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  return client;
}
export function apiError(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401)
      return "Your backend session is unavailable. Please sign in again or contact your administrator.";
    if (error.response?.status === 403)
      return "You do not have permission to view this department.";
    return typeof error.response?.data?.detail === "string"
      ? error.response.data.detail
      : "Could not load the workspace. Please try again.";
  }
  return error instanceof Error
    ? error.message
    : "Could not load the workspace.";
}
