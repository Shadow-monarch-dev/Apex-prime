import assert from 'node:assert/strict';
import { APEX_CAPABILITIES, getApexCapabilities } from '../cloud/capabilities.mjs';

assert.ok(APEX_CAPABILITIES.length >= 10);
assert.equal(new Set(APEX_CAPABILITIES.map((item) => item.id)).size, APEX_CAPABILITIES.length);
assert.ok(APEX_CAPABILITIES.every((item) => ['available', 'foundation', 'planned'].includes(item.status)));
assert.ok(getApexCapabilities({ surface: 'desktop' }).every((item) => item.surface === 'desktop'));
assert.ok(getApexCapabilities({ surface: 'cloud' }).every((item) => item.surface === 'cloud'));
assert.equal(getApexCapabilities({ surface: 'unknown' }).length, 0);
assert.equal(getApexCapabilities().find((item) => item.id === 'cloud-browser').status, 'planned');
console.log('capability registry tests: passed');
