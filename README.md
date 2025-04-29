# Algolia Extension for Diplodoc

This extension provides Algolia search integration for Diplodoc documentation. It handles the indexing of documentation content into Algolia indices and manages search functionality.

## Project Structure

```
extensions/algolia/
├── src/
│   ├── index.ts        # Main extension entry point and CLI program
│   ├── provider.ts     # Algolia provider implementation
│   ├── config.ts       # Configuration types and defaults
│   ├── types.ts        # TypeScript type definitions
│   └── hooks.ts        # Extension hooks and integration points
├── dist/              # Compiled JavaScript output
└── package.json       # Package configuration and dependencies
```

## Core Components

### `index.ts`
Main entry point of the extension that implements the CLI program. Key features:
- Defines the `AlgoliaProgram` class that extends `BaseProgram`
- Handles command-line arguments and configuration
- Integrates with Diplodoc's build and search hooks
- Manages the indexing process during documentation builds

### `provider.ts`
Implements the core Algolia functionality:
- `AlgoliaProvider` class for managing Algolia indices
- Methods for adding and processing documentation content
- Handles multi-language support
- Manages index settings and configurations
- Provides search functionality

Key methods:
- `add(path, lang, info)`: Processes and adds documentation content to the index
- `addObjects()`: Uploads processed content to Algolia
- `clearIndex()`: Removes all objects from the index
- `setSettings(settings)`: Updates index configuration
- `release()`: Finalizes the indexing process

### `config.ts`
Contains configuration types and defaults:
- Defines the `AlgoliaConfig` interface
- Provides default configuration values
- Handles environment variable integration

### `types.ts`
TypeScript type definitions:
- `IndexRecord`: Structure for indexed documentation content
- `ProviderConfig`: Configuration for the Algolia provider
- Other shared types and interfaces

### `hooks.ts`
Extension hooks for Diplodoc integration:
- Defines integration points with Diplodoc's build system
- Manages search provider registration
- Handles build-time indexing

## Usage

### Installation

```bash
npm install @diplodoc/algolia
```

### Configuration

The extension can be configured through:
- Environment variables:
  - `ALGOLIA_APP_ID`
  - `ALGOLIA_API_KEY`
  - `ALGOLIA_INDEX_NAME`
- Command-line arguments:
  - `--app-id`
  - `--api-key`
  - `--index-name`
  - `--input` (path to documentation)

### Integration

The extension automatically integrates with Diplodoc's build process:
1. During documentation build, content is processed and indexed
2. Search functionality is automatically enabled
3. Multi-language support is handled automatically

## Development

To work on the extension:
1. Clone the repository
2. Install dependencies: `npm install`
3. Build the extension: `npm run build`
4. Test changes in your Diplodoc project

### Testing Examples

Here are some practical examples for testing the extension:

1. **Basic Build and Index**
```bash
# Build documentation and index it to Algolia
node build/index.js -i ../../../docs -o ../../../docs-o --extensions /path/to/algolia/dist/index.js
```

2. **Index Only Command**
```bash
# Only run the indexing process (useful for testing index updates)
node build/index.js index -i ../../../docs-o --extensions /path/to/algolia/dist/index.js
```

3. **With Environment Variables**
```bash
# Set Algolia credentials via environment variables
export ALGOLIA_APP_ID="your-app-id"
export ALGOLIA_API_KEY="your-api-key"
export ALGOLIA_INDEX_NAME="your-index-name"
node build/index.js -i ../../../docs -o ../../../docs-o --extensions /path/to/algolia/dist/index.js
```

4. **With Command Line Arguments**
```bash
# Provide credentials via command line
node build/index.js -i ../../../docs -o ../../../docs-o \
  --extensions /path/to/algolia/dist/index.js \
  --app-id "your-app-id" \
  --api-key "your-api-key" \
  --index-name "your-index-name"
```

5. **Debug Mode**
```bash
# Enable debug logging
DEBUG=diplodoc:* node build/index.js -i ../../../docs -o ../../../docs-o --extensions /path/to/algolia/dist/index.js
```

### Testing Tips

1. **Local Development**
   - Use a separate Algolia index for testing
   - Monitor the `_search` directory in your output folder for generated JSON files
   - Check Algolia dashboard for indexed content

2. **Troubleshooting**
   - If indexing fails, check the generated JSON files in `_search` directory
   - Verify Algolia credentials and index permissions
   - Use debug mode for detailed logging

3. **Common Issues**
   - Missing environment variables: Ensure all required Algolia credentials are set
   - Permission errors: Verify API key has correct permissions
   - Index not updating: Check if `uploadDuringBuild` is enabled in configuration

## License

MIT 