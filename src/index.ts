//@ts-nocheck
import { BaseArgs } from '@diplodoc/cli';
import { BaseProgram } from '@diplodoc/cli/lib/program';
import { BuildRun } from '@diplodoc/cli';
import { Command, ExtendedOption } from '@diplodoc/cli/lib/config';
import { getBuildHooks, getSearchHooks } from '@diplodoc/cli';
import { withConfigDefaults } from '@diplodoc/cli/lib/program';
import { get } from "lodash";

import { AlgoliaProvider } from "./provider";
import { AlgoliaConfig, options } from "./config";

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

    async action(args: BaseArgs) {
        const { input } = args;
        const { appId, apiKey } = this.config.search;

        if (!input) {
            throw new Error("Input path is required");
        }

        // inxexName used as a project name or if project name is not set, use indexName
        const projectName = get(
            this.config,
            "docs-viewer.project-name","",
        );

        const indexName = get(this.config,"search.indexName", '') || (projectName + '-{lang}')

        if (!appId || !apiKey || !indexName) {
            throw new Error(
                "Algolia configuration is incomplete. Please provide appId, apiKey and indexName either through environment variables or command line options.",
            );
        }

        this.logger.info("Starting Algolia indexing...", projectName, JSON.stringify(this.config));
        const provider = new AlgoliaProvider(new BuildRun({...this.config, output: this.config.input}), {
            appId,
            apiKey,
            searchKey: "search-api-key",
            indexName,
            index: true,
            uploadDuringBuild: true,
        });

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


export default class Extension {
    apply(program: BaseProgram) {
        if (BaseProgram.is(program) && program.name === "Program") {
            console.log("Adding AlgoliaProgram to Program");
            program.addModule(new AlgoliaProgram());
        }

        getBuildHooks(program)
            .BeforeRun.for("html")
            .tap("AlgoliaJsonSearch", (run) => {
                getSearchHooks(run.search)
                    .Provider.for("algolia")
                    .tap("AlgoliaJsonSearch", (_connector, config) => {
                        const projectName = get(
                            config,
                            "docs-viewer.project-name","",
                        );
                
                        const indexName = get(config,"search.indexName", '') || (projectName + '-{lang}')

                        return new AlgoliaProvider(run, {
                            appId: process.env.ALGOLIA_APP_ID,
                            apiKey: process.env.ALGOLIA_API_KEY,
                            ...config,
                            indexName
                        });
                    });
            });
    }
}
