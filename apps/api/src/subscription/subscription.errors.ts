export class SubscriptionLimitError extends Error {
  constructor(
    public readonly code: 'trial_expired' | 'quota_reached' | 'no_plan',
    message: string,
  ) {
    super(message);
    this.name = 'SubscriptionLimitError';
  }
}
