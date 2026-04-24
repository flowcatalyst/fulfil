import { AsyncLocalStorage } from 'node:async_hooks';
import type { Scope } from './scope.js';

const store = new AsyncLocalStorage<Scope>();

function get(): Scope | undefined {
  return store.getStore();
}

function require(): Scope {
  const scope = store.getStore();
  if (!scope) {
    throw new Error('Scope not available — code is running outside a scope context');
  }
  return scope;
}

function run<T>(scope: Scope, fn: () => T): T {
  return store.run(scope, fn);
}

export const ScopeStore = { get, require, run } as const;
