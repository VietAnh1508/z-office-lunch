import app from "../index";
import { testEnv } from "./env";

type Env = typeof testEnv;

export function request(method: string, path: string, body?: unknown, env: Env = testEnv) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return app.request(path, init, env);
}

export const get = (path: string, env?: Env) => request("GET", path, undefined, env);
export const post = (path: string, body?: unknown, env?: Env) => request("POST", path, body, env);
export const patch = (path: string, body?: unknown, env?: Env) => request("PATCH", path, body, env);
export const put = (path: string, body?: unknown, env?: Env) => request("PUT", path, body, env);
export const del = (path: string, env?: Env) => request("DELETE", path, undefined, env);

export function postForm(path: string, form: FormData, env: Env = testEnv, method = "POST") {
  return app.request(path, { method, body: form }, env);
}
