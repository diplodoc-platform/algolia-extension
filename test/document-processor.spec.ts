import {
    extractHeadings,
    getRecordSize,
    processDocument,
    splitAndAddLargeRecord,
    splitDocumentIntoSections,
} from '../src/core/document-processor';
import {AlgoliaRecord, DocumentProcessingContext} from '../src/types';

describe('Document Processor', () => {
    describe('extractHeadings', () => {
        it('should extract headings from HTML', () => {
            const html = `
        <h1>Heading 1</h1>
        <p>Some content</p>
        <h2>Heading 2</h2>
        <p>More content</p>
        <h3>Heading 3</h3>
      `;

            const headings = extractHeadings(html);

            expect(headings).toHaveLength(3);
            expect(headings).toContain('Heading 1');
            expect(headings).toContain('Heading 2');
            expect(headings).toContain('Heading 3');
        });

        it('should handle nested elements in headings', () => {
            const html = `
        <h1>Heading with <span>nested</span> element</h1>
        <h2>Another <strong>heading</strong></h2>
      `;

            const headings = extractHeadings(html);

            expect(headings).toHaveLength(2);
            expect(headings).toContain('Heading with nested element');
            expect(headings).toContain('Another heading');
        });

        it('should return empty array for HTML without headings', () => {
            const html = `
        <p>Just a paragraph</p>
        <div>And a div</div>
      `;

            const headings = extractHeadings(html);

            expect(headings).toHaveLength(0);
        });
    });

    describe('splitDocumentIntoSections', () => {
        it('should split document into sections by headings', () => {
            const html = `
        <body>
          <h1>Main Heading</h1>
          <p>Main content</p>
          <h2>Section 1</h2>
          <p>Section 1 content</p>
          <h2>Section 2</h2>
          <p>Section 2 content</p>
        </body>
      `;

            const {sections, mainHeading} = splitDocumentIntoSections(html);

            expect(mainHeading).toBe('Main Heading');
            expect(sections).toHaveLength(3);
            expect(sections[0].heading).toBe('Main Heading');
            expect(sections[1].heading).toBe('Section 1');
            expect(sections[2].heading).toBe('Section 2');
        });

        it('should split document into sections by headings and set level', () => {
            const html = `
        <body>
          <h1>Main Heading</h1>
          <p>Main content</p>
          <h2>Section 1</h2>
          <p>Section 1 content</p>
          <h2>Section 2</h2>
          <p>Section 2 content</p>
        </body>
      `;

            const {sections, mainHeading} = splitDocumentIntoSections(html);

            expect(mainHeading).toBe('Main Heading');
            expect(sections).toHaveLength(3);
            expect(sections[0].heading).toBe('Main Heading');
            expect(sections[0].level).toBe(1);
            expect(sections[1].heading).toBe('Section 1');
            expect(sections[1].level).toBe(2);
            expect(sections[2].heading).toBe('Section 2');
            expect(sections[2].level).toBe(2);
        });

        it('should handle document without headings', () => {
            const html = `
        <body>
          <p>Just some content</p>
          <div>Without headings</div>
        </body>
      `;

            const {sections, mainHeading} = splitDocumentIntoSections(html);

            expect(mainHeading).toBe('');
            expect(sections).toHaveLength(1);
            expect(sections[0]).toEqual({
                anchor: '',
                content: 'Just some content Without headings ',
                heading: '',
            });
        });
    });

    describe('getRecordSize', () => {
        it('should calculate record size in bytes', () => {
            const record: AlgoliaRecord = {
                objectID: 'test-id',
                title: 'Test Title',
                content: 'Test content',
                headings: ['Heading 1', 'Heading 2'],
                keywords: ['keyword1', 'keyword2'],
                url: 'test-url.html',
                lang: 'en',
            };

            const size = getRecordSize(record);

            expect(size).toBeGreaterThan(0);
            expect(typeof size).toBe('number');
        });
    });

    describe('splitAndAddLargeRecord', () => {
        it('should not split record if content is small', () => {
            const record: AlgoliaRecord = {
                objectID: 'test-id',
                title: 'Test Title',
                content: 'Small content',
                headings: ['Heading'],
                keywords: ['keyword'],
                url: 'test-url.html',
                lang: 'en',
            };

            const records: AlgoliaRecord[] = [];
            splitAndAddLargeRecord(record, records, 1000);

            expect(records).toHaveLength(1);
            expect(records[0]).toBe(record);
        });

        it('should split record if content is large', () => {
            const largeContent = 'A'.repeat(10000);
            const record: AlgoliaRecord = {
                objectID: 'test-id',
                title: 'Test Title',
                content: largeContent,
                headings: ['Heading'],
                keywords: ['keyword'],
                url: 'test-url.html',
                lang: 'en',
            };

            const records: AlgoliaRecord[] = [];
            splitAndAddLargeRecord(record, records, 4000);

            expect(records.length).toBeGreaterThan(1);
            expect(records[0].objectID).toBe('test-id-chunk-1');
            expect(records[0].content.length).toBeLessThanOrEqual(4000);
            expect(records[1].objectID).toBe('test-id-chunk-2');
        });
    });

    describe('processDocument', () => {
        it('should process document and create records', () => {
            const context: DocumentProcessingContext = {
                path: 'test-path.md',
                lang: 'en',
                html: `
          <h1>Test Document</h1>
          <p>Test content</p>
          <h2>Section 1</h2>
          <p>Section 1 content</p>
        `,
                title: 'Test Document',
                meta: {
                    keywords: ['test', 'document'],
                },
            };

            const records = processDocument(context);

            expect(records.length).toBeGreaterThan(0);
            expect(records[0].title).toBe('Test Document');
            expect(records[0].lang).toBe('en');
            expect(records[0].url).toBe('test-path.html');
            expect(records[0].keywords).toEqual(['test', 'document']);
        });

        it('should handle document with no sections', () => {
            const context: DocumentProcessingContext = {
                path: 'test-path.md',
                lang: 'en',
                html: '<p>Just a paragraph without headings</p>',
                title: 'Test Document',
                meta: {},
            };

            const records = processDocument(context);

            expect(records.length).toBe(1);
            expect(records[0].content).toContain('Just a paragraph');
        });

        it('should skip documents marked as noIndex', () => {
            const context: DocumentProcessingContext = {
                path: 'test-path.md',
                lang: 'en',
                html: '<h1>Test</h1><p>Content</p>',
                title: 'Test Document',
                meta: {
                    noIndex: true,
                },
            };

            const records = processDocument(context);

            expect(records.length).toBeGreaterThan(0);
        });
    });
});
