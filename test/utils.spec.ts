import type {AlgoliaRecord} from '../src/types';

import {describe, expect, it} from 'vitest';

import {collectTags, filterPublicTags, withTagsFacet} from '../src/core/utils';

describe('Algolia tag utilities', () => {
    it('removes technical tags', () => {
        expect(filterPublicTags(['info', '_internal', 'syntax'])).toEqual(['info', 'syntax']);
    });

    it('collects sorted unique tags from all records', () => {
        const records = [
            {tags: ['syntax', '_internal', 'info']},
            {tags: ['info', 'reference']},
        ] as AlgoliaRecord[];

        expect(collectTags(records)).toEqual(['info', 'reference', 'syntax']);
    });

    it('adds tags as a filter-only facet without dropping custom facets', () => {
        expect(withTagsFacet({attributesForFaceting: ['category']})).toMatchObject({
            attributesForFaceting: ['category', 'filterOnly(tags)'],
        });
    });
});
