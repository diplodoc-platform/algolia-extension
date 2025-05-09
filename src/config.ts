import { BaseConfig, option } from "@diplodoc/cli";

export interface AlgoliaConfig extends BaseConfig {
    input: string;
    search: {
        provider: "algolia";
        appId: string;
        apiKey: string;
        indexName: string;
    };
}

export const options = {
    input: option({
        flags: "-i, --input <path>",
        desc: "Path to documentation directory",
        required: true,
        default: "./",
    }),
    appId: option({
        flags: "--app-id <id>",
        desc: "Algolia Application ID",
        env: "ALGOLIA_APP_ID",
    }),
    apiKey: option({
        flags: "--api-key <key>",
        desc: "Algolia API Key",
        env: "ALGOLIA_API_KEY",
    }),
    indexName: option({
        flags: "--index-name <name>",
        desc: "Algolia Index Name",
        env: "ALGOLIA_INDEX_NAME",
    }),
};
