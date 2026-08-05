import {createRequire} from 'node:module';

import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {buildTagsFilter, combineFilters} = require('../src/client/search.js') as {
    buildTagsFilter: (tags: string[]) => string;
    combineFilters: (filters: string | undefined, tags: string[]) => string | undefined;
};

describe('Algolia client tag filters', () => {
    it('builds an OR expression and escapes facet values', () => {
        expect(buildTagsFilter(['info', 'syn"tax', 'path\\tag'])).toBe(
            'tags:"info" OR tags:"syn\\"tax" OR tags:"path\\\\tag"',
        );
    });

    it('combines tags with existing access or query filters using AND', () => {
        expect(combineFilters('visibility:public', ['info', 'syntax'])).toBe(
            '(visibility:public) AND (tags:"info" OR tags:"syntax")',
        );
    });

    it('keeps an unknown tag as a restrictive filter', () => {
        expect(buildTagsFilter(['unknown'])).toBe('tags:"unknown"');
    });
});
