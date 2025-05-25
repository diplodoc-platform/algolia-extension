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

// Constant for API file path
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

    /**
     * Validates and returns Algolia configuration
     */
    private validateAndGetConfig(args: BaseArgs): {
        appId: string;
        apiKey: string;
        indexName: string;
        projectName: string;
    } {
        const { input } = args;
        const { appId, apiKey } = this.config.search;

        if (!input) {
            throw new Error("Input path is required");
        }

        // indexName is used as project name, or if project name is not set, we use indexName
        const projectName = get(
            this.config,
            "docs-viewer.project-name", "",
        );

        const indexName = get(this.config, "search.indexName", '') || (projectName + '-{lang}');

        if (!appId || !apiKey || !indexName) {
            throw new Error(
                "Algolia configuration is incomplete. Please provide appId, apiKey and indexName either through environment variables or command line options.",
            );
        }

        return { appId, apiKey, indexName, projectName };
    }

    /**
     * Creates and configures Algolia provider
     */
    private createProvider(config: {
        appId: string;
        apiKey: string;
        indexName: string;
        projectName: string;
    }): AlgoliaProvider {
        const { appId, apiKey, indexName } = config;
        
        // Calculate index prefix
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

    /**
     * Main action method
     */
    async action(args: BaseArgs) {
        // Get and validate configuration
        const config = this.validateAndGetConfig(args);
        
        this.logger.info(
            "Starting Algolia indexing...",
            config.projectName,
            JSON.stringify(this.config)
        );
        
        // Create provider
        const provider = this.createProvider(config);

        try {
            // Perform indexing
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


// Extension class implementing IExtension interface
export class Extension implements IExtension {
    /**
     * Adds AlgoliaProgram module to the main program
     */
    private addAlgoliaModule(program: BaseProgram): void {
        if (BaseProgram.is(program) && program.name === "Program") {
            console.log("Adding AlgoliaProgram to Program");
            program.addModule(new AlgoliaProgram());
        }
    }

    /**
     * Registers hooks for integration with build system
     */
    private registerBuildHooks(program: BaseProgram): void {
        getBuildHooks(program)
            .BeforeRun.for("html")
            .tap("AlgoliaSearch", (run) => {
                this.registerSearchHooks(run);
            });
    }

    /**
     * Registers hooks for search
     */
    private registerSearchHooks(run: any): void {
        getSearchHooks(run.search)
            .Provider.for("algolia")
            .tap("AlgoliaSearch", (_connector, config) => {
                return this.createAlgoliaProvider(run, config);
            });
    }

    /**
     * Creates Algolia provider for hooks
     */
    private createAlgoliaProvider(run: any, config: any): AlgoliaProvider {
        const projectName = get(
            config,
            "docs-viewer.project-name", "",
        );
        
        const indexName = get(config, "search.indexName", '') || (projectName + '-{lang}');
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

    /**
     * Applies extension to the program
     */
    apply(program: BaseProgram) {
        // Add AlgoliaProgram module to the main program
        this.addAlgoliaModule(program);

        // Register hooks for integration with build system
        this.registerBuildHooks(program);
    }
}

// Default export for compatibility
export default Extension;
