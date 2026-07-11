import type { Token } from './Token';
import { Lifecycle } from './Lifecycle';

export type Factory = (container: Container) => unknown;

interface Binding {
  factory: Factory;
  lifecycle: Lifecycle;
}

export class Container {
  private bindings = new Map<symbol, Binding>();
  private singletons = new Map<symbol, unknown>();
  private scopedInstances = new Map<symbol, unknown>();
  private parent: Container | null;

  constructor(parent: Container | null = null) {
    this.parent = parent;
  }

  bind<T>(token: Token<T>, factory: (c: Container) => T, lifecycle: Lifecycle): void {
    this.bindings.set(token.key, { factory, lifecycle });
  }

  resolve<T>(token: Token<T>): T {
    // Walk the binding chain to find the registration
    const binding = this.findBinding(token);

    if (!binding)
      throw new Error(`No binding registered for token: ${String(token.key)}`);

    if (binding.lifecycle === Lifecycle.Singleton) {
      const root = this.getRoot();
      if (root.singletons.has(token.key))
        return root.singletons.get(token.key) as T;
      const instance = binding.factory(root) as T;
      root.singletons.set(token.key, instance);
      return instance;
    }

    if (binding.lifecycle === Lifecycle.Scoped) {
      // Create and cache scoped instances on the current container (the scope)
      if (this.scopedInstances.has(token.key))
        return this.scopedInstances.get(token.key) as T;
      const instance = binding.factory(this) as T;
      this.scopedInstances.set(token.key, instance);
      return instance;
    }

    // Transient
    return binding.factory(this) as T;
  }

  createScope(): Container {
    return new Container(this);
  }

  private getRoot(): Container {
    return this.parent?.getRoot() ?? this;
  }

  private findBinding<T>(token: Token<T>): Binding | undefined {
    const binding = this.bindings.get(token.key);
    if (binding)
      return binding;
    return this.parent?.findBinding(token);
  }
}
