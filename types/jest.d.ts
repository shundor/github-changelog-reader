declare namespace jest {
  /**
   * Mocks a module with the specified factory function.
   */
  function unstable_mockModule(
    moduleName: string,
    factory: () => any,
    options?: { virtual?: boolean }
  ): void
}
