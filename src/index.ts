import type {BaseConfig, IExtension} from '@diplodoc/cli/lib/program';

import {BaseArgs, BaseProgram, withConfigDefaults} from '@diplodoc/cli/lib/program';
import {BuildRun, getBuildHooks, getSearchHooks} from '@diplodoc/cli';
import {Command, ExtendedOption} from '@diplodoc/cli/lib/config';
import {get} from 'lodash';

import {AlgoliaProvider} from './core/provider';
import {options} from './config';
import {AlgoliaConfig} from './types';

const API_LINK = '_search/api.js';

@withConfigDefaults(() => ({
    search: {
        appId: process.env.ALGOLIA_APP_ID || '',
        apiKey: process.env.ALGOLIA_API_KEY || '',
        indexName: process.env.ALGOLIA_INDEX_NAME || '',
    },
}))
export class AlgoliaProgram extends BaseProgram<AlgoliaConfig> {
    readonly name = 'index';

    readonly command = new Command(this.name)
        .description('Upload documentation index to Algolia')
        .helpOption(true)
        .allowUnknownOption(false);

    readonly options: ExtendedOption[] = Object.values(options);

    protected readonly modules = [];

    async action(args: BaseArgs) {
        const config = this.validateAndGetConfig(args);

        this.logger.info('Starting Algolia indexing...', config.indexName);

        const provider = this.createProvider(config);

        try {
            await provider.addObjects();
        } catch (error) {
            this.logger.error('Failed to upload index objects to Algolia:', error);
            throw error;
        }
    }

    private validateAndGetConfig(args: BaseArgs): {
        appId: string;
        apiKey: string;
        indexName: string;
    } {
        const {input} = args;
        const {appId, apiKey} = this.config.search;

        if (!input) {
            throw new Error('Input path is required');
        }

        const indexName = get(this.config, 'search.indexName', 'docs-{lang}');

        if (!appId || !apiKey || !indexName) {
            throw new Error(
                'Algolia configuration is incomplete. Please provide appId, apiKey and indexName either through environment variables or command line options.',
            );
        }

        return {appId, apiKey, indexName};
    }

    private createProvider(config: {
        appId: string;
        apiKey: string;
        indexName: string;
    }): AlgoliaProvider {
        const {appId, apiKey, indexName} = config;

        return new AlgoliaProvider(new BuildRun({...this.config, output: this.config.input}), {
            appId,
            apiKey,
            searchKey: 'search-api-key',
            indexName,
            index: true,
        });
    }
}

interface SearchConfig {
    appId?: string;
    apiKey?: string;
    indexName?: string;
    searchKey?: string;
    indexPrefix?: string;
    provider?: string;
    index?: boolean;
}

interface ExtensionConfig extends BaseConfig {
    search?: SearchConfig;
}

export class Extension implements IExtension {
    apply(program: BaseProgram<ExtensionConfig>): void {
        this.addAlgoliaModule(program);
        this.registerBuildHooks(program);
    }

    private addAlgoliaModule(program: BaseProgram<ExtensionConfig>): void {
        if (BaseProgram.is(program) && program.name === 'Program') {
            program.logger?.info('Adding AlgoliaProgram to Program');
            program.addModule(new AlgoliaProgram());
        }
    }

    private registerBuildHooks(program: BaseProgram<ExtensionConfig>): void {
        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('AlgoliaSearch', (run) => {
                this.registerSearchHooks(run);
            });
    }

    private registerSearchHooks(run: BuildRun): void {
        getSearchHooks(run.search)
            .Provider.for('algolia')
            .tap('AlgoliaSearch', (_connector, config) => {
                return this.createAlgoliaProvider(run, config);
            });
    }

    private createAlgoliaProvider(run: BuildRun, config: SearchConfig): AlgoliaProvider {
        const indexName = process.env.ALGOLIA_INDEX_NAME || get(config, 'indexName', 'docs-{lang}');

        return new AlgoliaProvider(run, {
            appId: process.env.ALGOLIA_APP_ID || get(config, 'appId', ''),
            apiKey: process.env.ALGOLIA_API_KEY || get(config, 'apiKey'),
            searchKey: process.env.ALGOLIA_SEARCH_KEY || get(config, 'searchKey', 'search-api-key'),
            indexName,
            api: process.env.ALGOLIA_API_PATH || get(config, 'api', API_LINK),
            index: get(config, 'index', false),
        });
    }
}

export default Extension;
