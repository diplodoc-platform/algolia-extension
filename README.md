# Algolia Extension for Diplodoc

This extension provides Algolia search integration for Diplodoc documentation. It handles the indexing of documentation content into Algolia indices and manages search functionality.

## Project Structure

```
extensions/algolia/
├── src/
│   ├── index.ts                # Main extension entry point and CLI program
│   ├── config/                 # Configuration
│   │   ├── index.ts            # Configuration exports
│   │   └── options.ts          # Command line options
│   ├── core/                   # Core functionality
│   │   ├── index.ts            # Core exports
│   │   ├── provider.ts         # Algolia provider implementation
│   │   └── document-processor.ts # Document processing utilities
│   ├── workers/                # Parallel processing
│   │   ├── index.ts            # Workers exports
│   │   ├── pool.ts             # Worker pool for parallel processing
│   │   └── processor.ts        # Worker thread implementation
│   ├── client/                 # Client-side code
│   │   ├── index.ts            # Client exports
│   │   └── search.js           # Client-side search implementation
│   └── types/                  # Type definitions
│       └── index.ts            # TypeScript type definitions
├── dist/                      # Compiled JavaScript output
└── package.json               # Package configuration and dependencies
```

## Core Components

### Main Components

#### `index.ts`
Main entry point of the extension that implements the CLI program. Key features:
- Defines the `AlgoliaProgram` class that extends `BaseProgram`
- Handles command-line arguments and configuration
- Integrates with Diplodoc's build and search hooks
- Manages the indexing process during documentation builds

### Core Module

#### `core/provider.ts`
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

#### `core/document-processor.ts`
Contains utilities for processing HTML documents:
- `processDocument()`: Converts HTML to Algolia records
- `splitDocumentIntoSections()`: Divides documents into searchable sections
- `extractHeadings()`: Extracts headings from HTML content
- `splitAndAddLargeRecord()`: Handles large content by splitting into chunks

### Workers Module

#### `workers/pool.ts`
Implements worker pool for parallel processing:
- `AlgoliaWorkerPool`: Manages a pool of worker threads
- Distributes document processing tasks across multiple CPU cores
- Handles worker lifecycle and error recovery
- Collects and aggregates results from workers

#### `workers/processor.ts`
Worker thread implementation:
- Processes HTML documents in separate threads
- Communicates with the main thread via messages
- Handles errors and returns results

### Configuration Module

#### `config/options.ts`
Contains configuration options:
- Defines command-line options for the extension
- Provides environment variable integration

### Types Module

#### `types/index.ts`
TypeScript type definitions:
- `AlgoliaRecord`: Structure for indexed documentation content
- `AlgoliaProviderConfig`: Configuration for the Algolia provider
- `DocumentProcessingContext`: Context for document processing
- Message types for worker communication

### Client Module

#### `client/search.js`
Client-side search implementation:
- Web worker for browser-based search
- Communicates with Algolia API
- Formats search results for display

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