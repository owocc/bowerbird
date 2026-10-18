import { handlePluginApiRequest } from "../../src/lib/server-api";

export async function onRequest(context: {
  request: Request;
  env: Record<string, string | undefined>;
}): Promise<Response> {
  return handlePluginApiRequest(context.request, context.env);
}
