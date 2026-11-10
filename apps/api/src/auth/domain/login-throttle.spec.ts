import { describe, expect, it } from 'vitest';
import { LoginThrottle } from './login-throttle.js';

const MINUTE = 60_000;

describe('LoginThrottle', () => {
  it('blocks a client after 10 failures until the 15 minute window ends', () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < 9; i++) throttle.fail('a', 0);
    expect(throttle.retryAfter('a', 0)).toBe(0);
    throttle.fail('a', MINUTE);
    expect(throttle.retryAfter('a', MINUTE)).toBe(14 * 60);
    expect(throttle.retryAfter('a', 15 * MINUTE)).toBe(0);
  });

  it('counts each client on its own', () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < 10; i++) throttle.fail('a', 0);
    expect(throttle.retryAfter('b', 0)).toBe(0);
  });

  it('clears the count on a successful login', () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < 9; i++) throttle.fail('a', 0);
    throttle.succeed('a');
    throttle.fail('a', 0);
    expect(throttle.retryAfter('a', 0)).toBe(0);
  });

  it('starts a new window once the old one has passed', () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < 9; i++) throttle.fail('a', 0);
    throttle.fail('a', 15 * MINUTE);
    expect(throttle.retryAfter('a', 15 * MINUTE)).toBe(0);
  });
});
