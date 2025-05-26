import { load } from 'cheerio';
import { html2text } from '@diplodoc/search-extension/indexer';
import { AlgoliaRecord, DocumentSection, DocumentProcessingContext } from '../types';

export function extractHeadings(html: string): string[] {
    const $ = load(html);
    const headings: string[] = [];

    $("h1, h2, h3, h4, h5, h6").each((_, element) => {
        const textPieces = $(element)
            .contents()
            .map((_, el) => $(el).text())
            .get();

        const uniqueText = [...new Set(textPieces)].join("").trim();

        if (uniqueText) {
            headings.push(uniqueText);
        }
    });

    return headings;
}

export function splitAndAddLargeRecord(
    record: AlgoliaRecord,
    acc: AlgoliaRecord[],
    chunkSize: number = 4000
): void {
    const baseObjectID = record.objectID;
    const content = record.content;
    const chunks = Math.ceil(content.length / chunkSize);

    if (chunks <= 1) {
        acc.push(record);
        return;
    }

    for (let i = 0; i < chunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, content.length);
        const chunkContent = content.slice(start, end);

        const chunkRecord: AlgoliaRecord = {
            ...record,
            objectID: `${baseObjectID}-chunk-${i + 1}`,
            content: chunkContent,
        };

        acc.push(chunkRecord);
    }
}

export function getRecordSize(record: AlgoliaRecord): number {
    const jsonString = JSON.stringify(record);
    return Buffer.from(jsonString).length;
}

export function splitDocumentIntoSections(html: string): {
    sections: DocumentSection[],
    mainHeading: string
} {
    const $ = load(html);
    const sections: DocumentSection[] = [];
    let currentSection: DocumentSection = { heading: "", content: "", anchor: "" };
    let mainHeading = '';

    $("body")
        .children()
        .each((_, element) => {
            const $el = $(element);

            if ($el.is("h1, h2, h3, h4, h5, h6")) {
                if (currentSection.content.trim()) {
                    sections.push({ ...currentSection });
                }

                let headingText = '';
                for (const el of $el.contents()) {
                    if (el.type === 'text') {
                        headingText = String(el.data);
                    }
                }

                if (!headingText) {
                    headingText = $el.text().trim();
                }

                if (!mainHeading) {
                    mainHeading = headingText;
                }

                currentSection = {
                    heading: headingText,
                    anchor: $el.attr('id') || '',
                    content: "",
                };
            } else {
                currentSection.content += $el.text().trim() + " ";
            }
        });

    if (currentSection.content.trim()) {
        sections.push({ ...currentSection });
    }

    return { sections, mainHeading };
}

function createBaseRecord(
    path: string,
    lang: string,
    title: string,
    keywords: string[] = []
): Omit<AlgoliaRecord, 'objectID' | 'content' | 'headings' | 'anchor' | 'section'> {
    return {
        title,
        keywords,
        url: path.replace(/\.\w+$/, "") + ".html",
        lang,
    };
}

export function processDocument(context: DocumentProcessingContext): AlgoliaRecord[] {
    const { path, lang, html, title, meta } = context;
    const { sections, mainHeading } = splitDocumentIntoSections(html);
    const records: AlgoliaRecord[] = [];
    const baseTitle = title || meta.title || mainHeading || "";
    const baseKeywords = meta.keywords || [];
    
    const MAX_RECORD_SIZE = 9600;

    if (sections.length === 0) {
        const baseRecord = createBaseRecord(path, lang, baseTitle, baseKeywords);
        const record: AlgoliaRecord = {
            ...baseRecord,
            objectID: path.replace(/\.\w+$/, ""),
            content: html2text(html).slice(0, 5000),
            headings: extractHeadings(html),
            anchor: '',
        };

        if (getRecordSize(record) >= MAX_RECORD_SIZE) {
            splitAndAddLargeRecord(record, records);
        } else {
            records.push(record);
        }
        return records;
    }

    sections.forEach((section, index) => {
        const baseRecord = createBaseRecord(path, lang, baseTitle, baseKeywords);
        const record: AlgoliaRecord = {
            ...baseRecord,
            objectID: `${path.replace(/\.\w+$/, "")}-${index}`,
            content: section.content.trim(),
            headings: [section.heading],
            anchor: section.anchor,
            section: section.heading || undefined,
        };

        if (getRecordSize(record) >= MAX_RECORD_SIZE) {
            splitAndAddLargeRecord(record, records);
        } else {
            records.push(record);
        }
    });

    return records;
}