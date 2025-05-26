import { BaseArgs } from '@diplodoc/cli/lib/program';
import { BaseProgram } from '@diplodoc/cli/lib/program';
import type { IExtension } from '@diplodoc/cli/lib/program';
import { BuildRun } from '@diplodoc/cli';
import { Command, ExtendedOption } from '@diplodoc/cli/lib/config';
import { getBuildHooks, getSearchHooks } from '@diplodoc/cli';
import { withConfigDefaults } from '@diplodoc/cli/lib/program';
import { get } from "lodash";

import { AlgoliaProvider } from "./core/provider";
import { options } from "./config";
import { AlgoliaConfig } from "./types";

const API_LINK = '_search/api.js';

@withConfigDefaults(() => ({
    search: {
        appId: process.env.ALGOLIA_APP_ID || "",
        apiKey: process.env.ALGOLIA_API_KEY || "",
        indexName: process.env.ALGOLIA_INDEX_NAME || "",
    },
}))
export class AlgoliaProgram extends BaseProgram<AlgoliaConfig> {
    readonly name = "index";

    readonly command = new Command(this.name)
        .description("Upload documentation index to Algolia")
        .helpOption(true)
        .allowUnknownOption(false);

    readonly options: ExtendedOption[] = Object.values(options);

    protected readonly modules = [];

    private validateAndGetConfig(args: BaseArgs): {
        appId: string;
        apiKey: string;
        indexName: string;
    } {
        const { input } = args;
        const { appId, apiKey } = this.config.search;

        if (!input) {
            throw new Error("Input path is required");
        }

        const indexName = get(this.config, "search.indexName", 'docs-{lang}');

        if (!appId || !apiKey || !indexName) {
            throw new Error(
                "Algolia configuration is incomplete. Please provide appId, apiKey and indexName either through environment variables or command line options.",
            );
        }

        return { appId, apiKey, indexName };
    }

    private createProvider(config: {
        appId: string;
        apiKey: string;
        indexName: string;
    }): AlgoliaProvider {
        const { appId, apiKey, indexName } = config;
        
        const indexPrefix = indexName.replace('-{lang}', '');
        
        return new AlgoliaProvider(
            new BuildRun({...this.config, output: this.config.input}),
            {
                appId,
                apiKey,
                searchKey: "search-api-key",
                indexName,
                indexPrefix,
                index: true,
                uploadDuringBuild: true,
            }
        );
    }

    async action(args: BaseArgs) {
        const config = this.validateAndGetConfig(args);
        
        this.logger.info(
            "Starting Algolia indexing...",
            config.indexName,
            JSON.stringify(this.config)
        );
        
        const provider = this.createProvider(config);

        try {
            await provider.addObjects();
        } catch (error) {
            this.logger.error(
                "Failed to upload index objects to Algolia:",
                error,
            );
            throw error;
        }
    }
}


export class Extension implements IExtension {
    private addAlgoliaModule(program: BaseProgram<any>): void {
        if (BaseProgram.is(program) && program.name === "Program") {
            program.logger?.info("Adding AlgoliaProgram to Program");
            program.addModule(new AlgoliaProgram());
        }
    }

    private registerBuildHooks(program: BaseProgram<any>): void {
        getBuildHooks(program)
            .BeforeRun.for("html")
            .tap("AlgoliaSearch", (run) => {
                this.registerSearchHooks(run);
            });
    }

    private registerSearchHooks(run: BuildRun): void {
        getSearchHooks(run.search)
            .Provider.for("algolia")
            .tap("AlgoliaSearch", (_connector, config) => {
                return this.createAlgoliaProvider(run, config);
            });
    }

    private createAlgoliaProvider(run: BuildRun, config: Record<string, any>): AlgoliaProvider {
        const indexName = get(config, "search.indexName", 'docs-{lang}');
        const indexPrefix = indexName.replace('-{lang}', '');

        return new AlgoliaProvider(run, {
            appId: process.env.ALGOLIA_APP_ID || config.appId,
            apiKey: process.env.ALGOLIA_API_KEY || config.apiKey,
            searchKey: config.searchKey || "search-api-key",
            indexName,
            indexPrefix,
            api: API_LINK,
            ...config,
        });
    }

    apply(program: BaseProgram<any>): void {
        this.addAlgoliaModule(program);
        this.registerBuildHooks(program);
    }
}

export default Extension;
