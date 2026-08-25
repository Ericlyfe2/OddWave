import { createTRPCReact } from '@trpc/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../server/src/routers/_app';

export const trpc = createTRPCReact<AppRouter>();

const linkOptions = {
  links: [httpBatchLink({ url: '/api', fetch: (input, init) => fetch(input, { ...init, credentials: 'include' }) })],
};

/** Raw client for use in Zustand stores, outside the React tree. */
export const trpcClient = createTRPCClient<AppRouter>(linkOptions);

export function trpcClientConfig() {
  return linkOptions;
}
