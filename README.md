# Elysia Auth.js

An [Elysia](https://elysiajs.com/) integration for [Auth.js](https://authjs.dev/)
that provides seamless authentication with multiple providers, session
management, and route protection using Elysia plugin patterns.

This integration brings the power and flexibility of Auth.js to Elysia
applications with full TypeScript support and Web API-native handling.

### Why?

Modern web applications require robust, secure, and flexible authentication
systems. While Auth.js provides excellent authentication capabilities,
integrating it with Elysia applications requires proper plugin composition
and environment-aware configuration.

However, a direct integration isn't always straightforward. Different types
of applications or deployment scenarios might warrant different approaches:

- **Plugin Composition:** Elysia's plugin pattern requires proper decorator
  management and lifecycle hook handling. This integration provides plugins
  for configuration, authentication handling, and route protection that
  compose naturally with Elysia's plugin pipeline.
- **Node.js Support:** While Elysia is Bun-first, many projects use Node.js
  via `@elysiajs/node`. This integration works seamlessly with both runtimes,
  handling environment differences transparently while maintaining consistent
  Auth.js behavior.
- **Proxy-Aware URL Handling:** When deployed behind reverse proxies or
  edge networks, proper URL resolution from X-Forwarded headers is critical
  for Auth.js callback URLs and redirect handling.

This integration, `@zitadel/elysia-auth`, aims to provide the flexibility to
handle such scenarios. It allows you to leverage the full Auth.js ecosystem
while maintaining Elysia best practices, ultimately leading to a more
effective and less burdensome authentication implementation.

## Installation

Install using NPM by using the following command:

```sh
npm install @zitadel/elysia-auth @auth/core
```

## Usage

To use this integration, configure Auth.js using `initAuthConfig()` and
mount the `authHandler()` on the Auth.js base path.

```typescript
import { Elysia } from 'elysia';
import {
  authHandler,
  getAuthUser,
  initAuthConfig,
  verifyAuth,
} from '@zitadel/elysia-auth';
import type { AuthConfig } from '@zitadel/elysia-auth';
import Zitadel from '@auth/core/providers/zitadel';

const authConfig: AuthConfig = {
  secret: process.env.AUTH_SECRET,
  providers: [
    Zitadel({
      clientId: process.env.ZITADEL_CLIENT_ID!,
      issuer: process.env.ZITADEL_ISSUER!,
    }),
  ],
};

const app = new Elysia()
  .use(initAuthConfig(authConfig))
  .use(authHandler())
  .use(verifyAuth())
  .get('/api/protected', async ({ request }) => {
    const auth = await getAuthUser(request, authConfig);
    return Response.json(auth);
  })
  .listen(3000);
```

#### Using the Authentication System

The integration provides several plugin functions:

**Plugins:**

- `initAuthConfig()`: Initializes Auth.js configuration via decorator
- `authHandler()`: Handles all Auth.js routes (sign-in, sign-out, callbacks)
- `verifyAuth()`: Requires authentication, returns 401 if not authenticated

**Utility Functions:**

- `getAuthUser()`: Retrieves the authenticated user from request
- `setEnvDefaults()`: Sets environment defaults on Auth.js config
- `reqWithEnvUrl()`: Rewrites request URL for proxy support

**Basic Usage:**

```typescript
import { getAuthUser, verifyAuth } from '@zitadel/elysia-auth';

// Public route
app.get('/api/public', () => {
  return Response.json({ message: 'Public endpoint' });
});

// Protected route - manual check
app.get('/api/profile', async ({ request }) => {
  const authUser = await getAuthUser(request, authConfig);
  if (!authUser) return new Response('Not authenticated', { status: 401 });
  return Response.json(authUser.session);
});

// Protected route - using plugin
app
  .use(verifyAuth(authConfig))
  .get('/api/admin', async ({ request }) => {
    const auth = await getAuthUser(request, authConfig);
    return Response.json({ user: auth?.session.user });
  });
```

## Known Issues

- **Configuration Order:** `initAuthConfig()` must be applied before
  `authHandler()` and `verifyAuth()` in the plugin chain.
- **Environment Variables:** `AUTH_SECRET` must be set either via
  environment variables or in the config object. The plugin returns
  a 500 error if it's missing.

## Useful links

- **[Auth.js](https://authjs.dev/):** The authentication library that this
  integration is built upon.
- **[Elysia](https://elysiajs.com/):** The ergonomic web framework this
  integration is designed for.
- **[Auth.js Providers](https://authjs.dev/getting-started/providers):**
  Complete list of supported authentication providers.

## Contributing

If you have suggestions for how this integration could be improved, or
want to report a bug, open an issue - we'd love all and any
contributions.

## License

Apache-2.0
