import { evaluateRobots } from '../../shared/robots';

describe('evaluateRobots', () => {
  it('allows when no rules apply', () => {
    const robots = '# empty';
    expect(evaluateRobots(robots, '/any/path')).toBe(true);
  });

  it('disallows based on longest matching disallow', () => {
    const robots = [
      'User-agent: *',
      'Disallow: /private',
      'Disallow: /private/secret',
    ].join('\n');
    expect(evaluateRobots(robots, '/private')).toBe(false);
    expect(evaluateRobots(robots, '/private/secret/data')).toBe(false);
    expect(evaluateRobots(robots, '/public')).toBe(true);
  });

  it('allows when allow overrides disallow with longer match', () => {
    const robots = [
      'User-agent: *',
      'Disallow: /private',
      'Allow: /private/allowed',
    ].join('\n');
    expect(evaluateRobots(robots, '/private/allowed/file.txt')).toBe(true);
    expect(evaluateRobots(robots, '/private/blocked')).toBe(false);
  });

  it('treats empty disallow as allow all', () => {
    const robots = [
      'User-agent: *',
      'Disallow: ',
    ].join('\n');
    expect(evaluateRobots(robots, '/any')).toBe(true);
  });
});

