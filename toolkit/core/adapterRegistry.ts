import type { ToolkitAdapter } from "./adapter";

export class AdapterRegistry {
  private readonly adapters = new Map<string, ToolkitAdapter<unknown>>();

  register<TSpec>(adapter: ToolkitAdapter<TSpec>): this {
    if (adapter.id.trim() === "") {
      throw new Error("adapter id cannot be empty");
    }
    if (!Number.isInteger(adapter.specVersion) || adapter.specVersion < 1) {
      throw new Error(`adapter ${adapter.id} has an invalid spec version`);
    }
    if (this.adapters.has(adapter.id)) {
      throw new Error(`adapter ${adapter.id} is already registered`);
    }
    this.adapters.set(adapter.id, adapter as ToolkitAdapter<unknown>);
    return this;
  }

  require<TSpec = unknown>(
    adapterId: string,
    expectedSpecVersion?: number,
  ): ToolkitAdapter<TSpec> {
    const adapter = this.adapters.get(adapterId);
    if (adapter === undefined) {
      throw new Error(`unknown toolkit adapter: ${adapterId}`);
    }
    if (
      expectedSpecVersion !== undefined &&
      adapter.specVersion !== expectedSpecVersion
    ) {
      throw new Error(
        `adapter ${adapterId} spec version mismatch: expected ${expectedSpecVersion}, received ${adapter.specVersion}`,
      );
    }
    return adapter as ToolkitAdapter<TSpec>;
  }

  list(): readonly ToolkitAdapter<unknown>[] {
    return [...this.adapters.values()];
  }
}
