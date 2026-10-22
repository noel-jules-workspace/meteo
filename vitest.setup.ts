import { expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';

afterEach(() => {
    cleanup();
});
