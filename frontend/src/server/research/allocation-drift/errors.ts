export class AllocationDriftError extends Error {
  constructor(readonly code: 'invalid_request' | 'unavailable' | 'malformed_snapshot', message: string) {
    super(message);
    this.name = 'AllocationDriftError';
  }
}
