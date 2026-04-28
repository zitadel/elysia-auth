import { jest, describe, expect, it } from '@jest/globals';
import { skipCSRFCheck } from '@auth/core';
import type { Adapter } from '@auth/core/adapters';
import Credentials from '@auth/core/providers/credentials';
import { Elysia } from 'elysia';
import type { AuthConfig } from '../src/index.js';
import {
  authHandler,
  verifyAuth,
  getAuthUser,
  initAuthConfig,
  reqWithEnvUrl,
} from '../src/index.js';

describe('Config', () => {
  it('Should return 500 if AUTH_SECRET is missing', async () => {
    globalThis.process.env = { AUTH_SECRET: '' };
    const app = new Elysia()
      .use(initAuthConfig({ providers: [] }))
      .use(authHandler());

    const res = await app.handle(new Request('http://localhost/auth/signin'));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Missing AUTH_SECRET');
  });

  it('Should return 200 when auth initial config is correct', async () => {
    globalThis.process.env = { AUTH_SECRET: 'secret' };
    const app = new Elysia()
      .use(
        initAuthConfig({
          basePath: '/auth',
          providers: [],
        }),
      )
      .use(authHandler());

    const res = await app.handle(new Request('http://localhost/auth/signin'));
    expect(res.status).toBe(200);
  });

  it('Should return 401 if auth cookie is invalid or missing', async () => {
    globalThis.process.env = { AUTH_SECRET: 'secret' };
    const config: AuthConfig = { providers: [] };
    const app = new Elysia()
      .use(initAuthConfig(config))
      .use(verifyAuth(config))
      .get('/api/protected', () => 'protected')
      .use(authHandler());

    const res = await app.handle(new Request('http://localhost/api/protected'));
    expect(res.status).toBe(401);
  });
});

describe('reqWithEnvUrl()', () => {
  it('Should rewrite the base path', async () => {
    const req = new Request('http://request-base/request-path');
    const newReq = reqWithEnvUrl(req, 'https://auth-url-base/auth-url-path');
    expect(newReq.url.toString()).toBe('https://auth-url-base/request-path');
  });
});

describe('Credentials Provider', () => {
  const mockAdapter: Adapter = {
    createVerificationToken: jest.fn(),
    useVerificationToken: jest.fn(),
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
    getUser: jest.fn(),
    getUserByAccount: jest.fn(),
    updateUser: jest.fn(),
    linkAccount: jest.fn(),
    createSession: jest.fn(),
    getSessionAndUser: jest.fn(),
    updateSession: jest.fn(),
    deleteSession: jest.fn(),
  };

  globalThis.process.env = {
    AUTH_SECRET: 'secret',
  };

  const user = { email: 'elysia@elysia.dev', name: 'Elysia' };

  const credentials = Credentials({
    credentials: {
      password: {},
    },
    authorize: (credentials) => {
      if (credentials.password === 'password') {
        return user;
      }
      return null;
    },
  });

  function getAuthConfig(): AuthConfig {
    return {
      secret: 'secret',
      providers: [credentials],
      adapter: mockAdapter,
      basePath: '/api/auth',
      skipCSRFCheck,
      callbacks: {
        jwt: ({ token, user }) => {
          if (user) {
            token.id = user.id;
          }
          return token;
        },
      },
      session: {
        strategy: 'jwt',
      },
    };
  }

  const config = getAuthConfig();

  const app = new Elysia()
    .use(initAuthConfig(config))
    .use(authHandler(config))
    .use(verifyAuth(config))
    .get('/api/protected', async ({ request }) => {
      const auth = await getAuthUser(request, config);
      return Response.json(auth);
    })
    .post('/api/create', async ({ request }) => {
      const data = await request.json();
      return Response.json({ data });
    });

  let cookie = [''];

  it('Should not authorize and return 302 - /api/auth/callback/credentials', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/auth/callback/credentials', {
        method: 'POST',
      }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'http://localhost/api/auth/signin?error=CredentialsSignin&code=credentials',
    );
  });

  it('Should authorize and return 302 - /api/auth/callback/credentials', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/auth/callback/credentials', {
        method: 'POST',
        body: new URLSearchParams({
          password: 'password',
        }),
      }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost');
    cookie = res.headers.getSetCookie();
  });

  it('Should authorize and return 200 - /api/protected', async () => {
    const headers = new Headers();
    headers.append('cookie', cookie[1]);
    const res = await app.handle(
      new Request('http://localhost/api/protected', {
        headers,
      }),
    );
    expect(res.status).toBe(200);
    const obj = (await res.json()) as {
      token: {
        name: string;
        email: string;
      };
    };
    expect(obj.token.name).toBe(user.name);
    expect(obj.token.email).toBe(user.email);
  });

  it('Should authorize and return 200 - /api/create', async () => {
    const data = { name: 'Elysia' };

    const headers = new Headers();
    headers.append('cookie', cookie[1]);
    headers.append('Content-Type', 'application/json');
    const res = await app.handle(
      new Request('http://localhost/api/create', {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      }),
    );
    expect(res.status).toBe(200);
    const obj = (await res.json()) as {
      data: {
        name: string;
      };
    };
    expect(obj.data.name).toBe(data.name);
  });

  it('Should respect x-forwarded-proto and x-forwarded-host', async () => {
    const headers = new Headers();
    headers.append('x-forwarded-proto', 'https');
    headers.append('x-forwarded-host', 'example.com');
    const res = await app.handle(
      new Request('http://localhost/api/auth/signin', {
        headers,
      }),
    );
    const html = await res.text();
    expect(html).toContain(
      'action="https://example.com/api/auth/callback/credentials"',
    );
  });
});
