import type { AuthConfig as AuthConfigCore } from '@auth/core';
import { Auth, setEnvDefaults as coreSetEnvDefaults } from '@auth/core';
import type { AdapterUser } from '@auth/core/adapters';
import type { JWT } from '@auth/core/jwt';
import type { Session } from '@auth/core/types';
import { Elysia } from 'elysia';
import { reqWithEnvUrl } from './lib/index.js';

export { reqWithEnvUrl } from './lib/index.js';

export { AuthError, CredentialsSignin } from '@auth/core/errors';
export type {
  Account,
  DefaultSession,
  Profile,
  Session,
  User,
} from '@auth/core/types';

/**
 * Environment variables used by Auth.js in Elysia applications.
 */
export type AuthEnv = {
  AUTH_URL?: string;
  AUTH_SECRET: string;
  AUTH_REDIRECT_PROXY_URL?: string;
  [key: string]: string | undefined;
};

/**
 * Represents an authenticated user with session, token, and user data.
 */
export type AuthUser = {
  session: Session;
  token?: JWT;
  user?: AdapterUser;
};

/**
 * Auth.js configuration for Elysia applications.
 */
export type AuthConfig = Omit<AuthConfigCore, 'raw'>;

/**
 * Sets environment defaults on the Auth.js config from environment variables.
 *
 * @param envVars - The environment variables
 * @param config - The Auth.js configuration to update
 */
export function setEnvDefaults(envVars: AuthEnv, config: AuthConfig): void {
  config.secret ??= envVars.AUTH_SECRET;
  coreSetEnvDefaults(envVars, config);
}

/**
 * Retrieves the authenticated user from the current request.
 *
 * This function checks the session and returns the authenticated user
 * information including session data, JWT token, and adapter user.
 *
 * @param request - The incoming Request object
 * @param config - The Auth.js configuration
 * @returns The authenticated user, or null if not authenticated
 *
 * @example
 * ```ts
 * app.get('/profile', async ({ request }) => {
 *   const authUser = await getAuthUser(request, authConfig);
 *   if (!authUser) return new Response('Not authenticated', { status: 401 });
 *   return Response.json(authUser.session);
 * });
 * ```
 */
export async function getAuthUser(
  request: Request,
  config: AuthConfig,
): Promise<AuthUser | null> {
  const configCopy = { ...config };
  const ctxEnv = process.env as AuthEnv;
  setEnvDefaults(ctxEnv, configCopy);
  const authReq = reqWithEnvUrl(request, ctxEnv.AUTH_URL);
  const origin = new URL(authReq.url).origin;
  const sessionReq = new Request(`${origin}${configCopy.basePath}/session`, {
    headers: { cookie: request.headers.get('cookie') ?? '' },
  });

  let authUser: AuthUser = {} as AuthUser;

  const response = (await Auth(sessionReq, {
    ...configCopy,
    callbacks: {
      ...configCopy.callbacks,
      async session(...args) {
        authUser = args[0];
        const session =
          (await configCopy.callbacks?.session?.(...args)) ?? args[0].session;
        const user = args[0].user ?? args[0].token;
        return { user, ...session } satisfies Session;
      },
    },
  })) as Response;

  const session = (await response.json()) as Session | null;

  return session?.user ? authUser : null;
}

/**
 * Elysia plugin that initializes Auth.js configuration.
 *
 * Must be applied before `authHandler()` and `verifyAuth()`.
 *
 * @param config - The Auth.js configuration object
 * @returns An Elysia plugin instance
 *
 * @example
 * ```ts
 * app.use(initAuthConfig({
 *   providers: [Zitadel({
 *     clientId: process.env.ZITADEL_CLIENT_ID,
 *     issuer: process.env.ZITADEL_ISSUER,
 *   })],
 *   secret: process.env.AUTH_SECRET,
 * }));
 * ```
 */
export function initAuthConfig(config: AuthConfig) {
  return new Elysia({ name: '@zitadel/elysia-auth/initAuthConfig' }).decorate(
    'authConfig',
    config,
  );
}

/**
 * Elysia plugin that requires authentication for protected routes.
 *
 * Uses `onBeforeHandle` to check the session and reject unauthenticated
 * requests with a 401 response.
 *
 * @param config - The Auth.js configuration object
 * @returns An Elysia plugin instance
 *
 * @example
 * ```ts
 * app.use(verifyAuth(authConfig));
 * app.get('/api/protected', async ({ request }) => {
 *   const authUser = await getAuthUser(request, authConfig);
 *   return Response.json(authUser);
 * });
 * ```
 */
export function verifyAuth(config?: AuthConfig) {
  return new Elysia({ name: '@zitadel/elysia-auth/verifyAuth' }).onBeforeHandle(
    { as: 'scoped' },
    async (ctx) => {
      const cfg =
        config ?? (ctx as unknown as { authConfig: AuthConfig }).authConfig;
      const authUser = await getAuthUser(ctx.request, cfg);
      const isAuth = !!authUser?.token || !!authUser?.user;
      if (!isAuth) {
        ctx.set.status = 401;
        return 'Unauthorized';
      }
    },
  );
}

/**
 * Elysia plugin that handles all Auth.js authentication routes.
 *
 * This should be mounted after custom `/auth/*` routes to prevent conflicts.
 * It handles sign-in, sign-out, callbacks, and session endpoints.
 *
 * @param config - Optional Auth.js configuration. If not provided, reads from
 *   the `authConfig` decorator set by `initAuthConfig()`.
 * @returns An Elysia plugin instance
 *
 * @example
 * ```ts
 * import { Elysia } from 'elysia';
 * import { authHandler, initAuthConfig } from '@zitadel/elysia-auth';
 * import Zitadel from '@auth/core/providers/zitadel';
 *
 * const app = new Elysia();
 *
 * app.use(initAuthConfig({
 *   providers: [Zitadel],
 *   secret: process.env.AUTH_SECRET,
 * }));
 *
 * app.use(authHandler());
 * ```
 */
export function authHandler(config?: AuthConfig) {
  const basePath = config?.basePath ?? '/auth';
  return new Elysia({ name: '@zitadel/elysia-auth/authHandler' }).all(
    `${basePath}/*`,
    async (ctx) => {
      const cfg = {
        ...(config ??
          (ctx as unknown as { authConfig: AuthConfig }).authConfig),
      };
      const ctxEnv = process.env as AuthEnv;
      setEnvDefaults(ctxEnv, cfg);

      if (!cfg.secret || cfg.secret.length === 0) {
        return new Response('Missing AUTH_SECRET', { status: 500 });
      }

      const { request } = ctx;
      const body = request.body ? await request.blob() : undefined;
      const res = await Auth(
        reqWithEnvUrl(
          new Request(request.url, {
            body,
            cache: request.cache,
            credentials: request.credentials,
            headers: request.headers,
            integrity: request.integrity,
            keepalive: request.keepalive,
            method: request.method,
            mode: request.mode,
            redirect: request.redirect,
            referrer: request.referrer,
            referrerPolicy: request.referrerPolicy,
            signal: request.signal,
          }),
          ctxEnv.AUTH_URL,
        ),
        cfg,
      );
      return new Response(res.body, res);
    },
  );
}
