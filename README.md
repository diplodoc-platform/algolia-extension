# Algolia Extension for Diplodoc

This extension provides [Algolia](https://www.algolia.com/) search integration for [Diplodoc](https://diplodoc.com/) documentation. It enables powerful search functionality for your documentation by indexing content into Algolia and providing a seamless search experience for your users.

## Features

- Automatic indexing of documentation content
- Multi-language support
- Customizable search settings
- Parallel processing for fast indexing
- Section-based search results for precise navigation
- Client-side search implementation

## Installation

```bash
npm install @diplodoc/algolia-extension
```

## How Indexing Works

By default, the extension only creates local search indices in the `_search` directory of your output folder. These local indices are JSON files that contain the processed documentation content.

To upload these indices to Algolia, you need to either:

1. Set the `index` parameter to `true` during the build process
2. Run the dedicated `index` command after building the documentation

## Configuration

### Required Configuration

To use this extension, you need to provide Algolia credentials:

| Parameter  | Environment Variable | CLI Option     | Description                               |
| ---------- | -------------------- | -------------- | ----------------------------------------- |
| App ID     | `ALGOLIA_APP_ID`     | `--app-id`     | Your Algolia application ID               |
| API Key    | `ALGOLIA_API_KEY`    | `--api-key`    | Your Algolia admin API key (for indexing) |
| Index Name | `ALGOLIA_INDEX_NAME` | `--index-name` | Name of the Algolia index                 |

### Optional Configuration

| Parameter  | CLI Option | Default | Description                                      |
| ---------- | ---------- | ------- | ------------------------------------------------ |
| Input Path | `--input`  | `./`    | Path to documentation directory                  |
| Index      | `--index`  | `false` | Whether to create and upload an index for search |

### Configuration Methods

You can configure the extension using three different methods:

1. **Environment Variables**

   - Set environment variables before running the CLI
   - Useful for CI/CD pipelines and secure storage of API keys
   - Example: `ALGOLIA_APP_ID`, `ALGOLIA_API_KEY`, `ALGOLIA_INDEX_NAME`

2. **CLI Flags**

   - Pass options directly to the CLI command
   - Overrides environment variables
   - Example: `--app-id`, `--api-key`, `--index-name`

3. **Configuration File (.yfm)**
   - Add configuration to your `.yfm` file
   - Useful for project-specific settings
   - **Note:** Do not store sensitive information like API keys in this file as it may be committed to version control

Example priority: CLI flags > Environment variables > Configuration file

### Parameter Availability by Configuration Method

| Parameter     | CLI Flag            | Environment Variable | .yfm Config            | Description                                                     |
| ------------- | ------------------- | -------------------- | ---------------------- | --------------------------------------------------------------- |
| appId         | `--app-id`          | `ALGOLIA_APP_ID`     | `search.appId`         | Algolia Application ID                                          |
| apiKey        | `--api-key`         | `ALGOLIA_API_KEY`    | `search.apiKey`        | Algolia API Key for indexing                                    |
| indexName     | `--index-name`      | `ALGOLIA_INDEX_NAME` | `search.indexName`     | Index name (e.g., "docs")                                       |
| index         | `--index`           | -                    | `search.index`         | Whether to upload indices to Algolia (default: false)           |
| searchKey     | `--search-key`      | `ALGOLIA_SEARCH_KEY` | `search.searchKey`     | Client-side API key for search (default: "search-api-key")      |
| provider      | `--search-provider` | `ALGOLIA_PROVIDER`   | `search.provider`      | Search provider name (default: "algolia")                       |
| api           | `--search-api`      | `ALGOLIA_API_PATH`   | `search.api`           | Path to the client-side search API (default: "\_search/api.js") |
| indexSettings | -                   | -                    | `search.indexSettings` | Algolia index settings (searchable attributes, etc.)            |
| querySettings | -                   | -                    | `search.querySettings` | Algolia query settings (hits per page, etc.)                    |

## Usage

### Basic Usage with Diplodoc CLI

The extension can be used with the [Diplodoc CLI](https://github.com/diplodoc-platform/cli) by adding it to the extensions parameter:

```bash
npx -y @diplodoc/cli -i ./input-docs -o ~/output-docs --extensions @diplodoc/algolia-extension
```

### Method 1: Using Environment Variables

```bash
export ALGOLIA_APP_ID="your-app-id"
export ALGOLIA_API_KEY="your-api-key"
export ALGOLIA_INDEX_NAME="your-index-name"

npx -y @diplodoc/cli -i ./input-docs -o ~/output-docs --extensions @diplodoc/algolia-extension
```

### Method 2: Using CLI Flags

```bash
npx -y @diplodoc/cli -i ./input-docs -o ~/output-docs \
  --extensions @diplodoc/algolia-extension \
  --app-id "your-app-id" \
  --api-key "your-api-key" \
  --index-name "your-index-name" \
  --index
```

### Method 3: Using Configuration File (.yfm)

```yaml
# .yfm file
search:
  provider: algolia
  appId: your-app-id
  # Do not include apiKey here for security reasons
  indexName: docs
  index: true
```

Then run:

```bash
# API key should be provided via environment variable or CLI flag
export ALGOLIA_API_KEY="your-api-key"
npx -y @diplodoc/cli -i ./input-docs -o ~/output-docs --extensions @diplodoc/algolia-extension
```

### Using the Index Command

The extension provides a dedicated `index` command for indexing documentation without rebuilding it:

```bash
npx -y @diplodoc/cli index -i ~/output-docs --extensions @diplodoc/algolia-extension
```

This is useful when you want to update the search index without rebuilding the entire documentation. The `index` command processes the already built documentation and uploads it to Algolia.

Options for the `index` command:

```bash
npx -y @diplodoc/cli index -i ~/output-docs \
  --extensions @diplodoc/algolia-extension \
  --app-id "your-app-id" \
  --api-key "your-api-key" \
  --index-name "your-index-name"
```

## Search Configuration

### Client-Side Configuration

The extension automatically generates the necessary client-side configuration for search:

```html
<!-- This is automatically included in your documentation -->
<script src="_search/api.js"></script>
```

### Search Settings

You can customize the search settings in your `.yfm` configuration file:

```yaml
# .yfm file
search:
  provider: algolia
  appId: your-app-id
  indexName: docs
  index: true
  indexSettings:
    # Algolia index settings
    searchableAttributes:
      - title
      - content
      - headings
      - keywords
    attributesToHighlight:
      - title
      - content
  querySettings:
    # Algolia query settings
    hitsPerPage: 10
    attributesToRetrieve:
      - title
      - content
      - url
      - section
```

## Resources

- [Diplodoc Documentation](https://diplodoc.com/)
- [Diplodoc CLI Repository](https://github.com/diplodoc-platform/cli)
- [Algolia Documentation](https://www.algolia.com/doc/)

## License

MIT
