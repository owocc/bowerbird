import { handlePluginApiRequest } from "../src/lib/server-api";

export const config = {
  runtime: "edge",
};

export default async function handler(request: Request): Promise<Response> {
  return handlePluginApiRequest(request, process.env);
}
