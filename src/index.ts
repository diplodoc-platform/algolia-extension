import {
    BaseArgs,
    BaseProgram,
    BuildRun,
    Command,
    ExtendedOption,
    getBuildHooks,
    getSearchHooks,
    withConfigDefaults,
} from "@diplodoc/cli";
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

    async init(args: BaseArgs, parent?: BaseProgram, isExtension = true) {
        await super.init(args, parent, isExtension);
    }

    apply(program?: BaseProgram) {
        super.apply(program);

        getBuildHooks(program)
            .BeforeRun.for("html")
            .tap("AlgoliaJsonSearch", (run) => {
                getSearchHooks(run.search)
                    .Provider.for("algolia")
                    .tap("AlgoliaJsonSearch", (_connector, config) => {
                        return new AlgoliaProvider(run, {
                            ...config,
                        });
                    });
            });
    }

    async action(args: BaseArgs) {
        const { input } = args;
        const { appId, apiKey } = this.config.search;

        if (!input) {
            throw new Error("Input path is required");
        }

        // inxexName used as a project name or if project name is not set, use indexName
        const indexName = get(
            this.config,
            "docs-viewer.project-name",
            this.config.search.indexName || "",
        );

        if (!appId || !apiKey || !indexName) {
            throw new Error(
                "Algolia configuration is incomplete. Please provide appId, apiKey and indexName either through environment variables or command line options.",
            );
        }

        this.logger.info("Starting Algolia indexing...");
        const provider = new AlgoliaProvider(new BuildRun(input), {
            appId,
            apiKey,
            searchKey: "search-api-key",
            indexPrefix: indexName,
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
    }
}