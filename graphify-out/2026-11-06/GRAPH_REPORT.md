# Graph Report - Pont  (2026-11-06)

## Corpus Check
- 95 files · ~117,990 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 868 nodes · 2195 edges · 35 communities (34 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a8ac5ab6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ApiController
- provider-test.service.ts
- ProviderProxyService
- upstream-model-catalog.ts
- provider-proxy.service.ts
- dependencies
- pont-webui/src/main.ts
- SettingsRepository
- api.controller.ts
- provider-registry.service.ts
- UsersService
- users.service.ts
- el
- request-meta.ts
- compilerOptions
- render
- opencode-go/package.json
- compilerOptions
- conversation-parse.ts
- buildModelsCatalogPanel
- opencodeGo.ts
- pont-webui/package.json
- app-config.service.ts
- renderLogin
- compilerOptions
- @yoda/providers
- renderLogs
- Pont
- scripts
- exclude
- jwt.ts
- nest-cli.json
- entrypoint.sh

## God Nodes (most connected - your core abstractions)
1. `ApiController` - 40 edges
2. `ProviderProxyService` - 30 edges
3. `ProviderDefinition` - 29 edges
4. `ProviderRegistry` - 29 edges
5. `UsersService` - 27 edges
6. `render()` - 26 edges
7. `SettingsRepository` - 25 edges
8. `UsersRepository` - 24 edges
9. `EligibleModelsService` - 23 edges
10. `ProviderKeysService` - 23 edges

## Surprising Connections (you probably didn't know these)
- `CompletionRecord` --references--> `ProviderDefinition`  [EXTRACTED]
  pont-api/src/gateway/provider-proxy.service.ts → pont-api/src/providers/provider-definitions.ts
- `usageBucketForApp()` --calls--> `normalizeClientApp()`  [EXTRACTED]
  pont-api/src/store/request-log.repository.ts → pont-api/src/logging/request-meta.ts
- `ParsedPontModelId` --references--> `ProviderId`  [EXTRACTED]
  pont-api/src/models/pont-model-id.ts → pont-api/src/providers/provider-definitions.ts
- `chatEndpointId()` --calls--> `isAnthropicModel()`  [EXTRACTED]
  pont-api/src/providers/provider-test.service.ts → pont-api/src/opencode-go/anthropic-bridge/openai-to-anthropic.ts
- `ProviderRegistry` --references--> `ProviderId`  [EXTRACTED]
  pont-api/src/providers/provider-registry.service.ts → pont-api/src/providers/provider-definitions.ts

## Import Cycles
- None detected.

## Communities (35 total, 1 thin omitted)

### Community 0 - "ApiController"
Cohesion: 0.07
Nodes (29): Delete, Patch, ApiController, parseIntParam(), Controller, Get, Param, Post (+21 more)

### Community 1 - "provider-test.service.ts"
Cohesion: 0.05
Nodes (46): CompletionRecord, resolveUpstreamModelId(), resolveSessionId(), SESSION_HEADER, openCodeGoUpstreamUrlForEndpoint(), upstreamAuthHeaders(), ANTHROPIC_VERSION_HEADER, buildProviderDefinitions() (+38 more)

### Community 2 - "ProviderProxyService"
Cohesion: 0.05
Nodes (38): clientAuthorization(), parseBearerToken(), secureEquals(), isPontGatewayApiKey(), GatewayModule, Module, OpencodeGoLegacyController, Controller (+30 more)

### Community 3 - "upstream-model-catalog.ts"
Cohesion: 0.07
Nodes (42): encodePontModelId(), encodePontModelIdFromUpstream(), isFreeTierUpstreamSlug(), normalizeUpstreamSlugForPont(), OPENROUTER_HYPHENATED_VENDORS, ParsedPontModelId, parsePontModelId(), pontPrefixForProvider() (+34 more)

### Community 4 - "provider-proxy.service.ts"
Cohesion: 0.11
Nodes (29): resolveClientIp(), anthropicMessageToOpenAiCompletion(), AnthropicToOpenAiStream, finishReason(), usageOf(), asArray(), asObject(), isJsonObject() (+21 more)

### Community 5 - "dependencies"
Cohesion: 0.05
Nodes (38): @nestjs/cli, @nestjs/common, @nestjs/config, @nestjs/core, @nestjs/platform-express, @nestjs/testing, dependencies, @nestjs/common (+30 more)

### Community 6 - "pont-webui/src/main.ts"
Cohesion: 0.06
Nodes (34): authParamsForRoute(), CATALOG_SORT_KEYS, CatalogModelRow, CatalogSortKey, CHAT_BODY_PARAMS, compactFormat, ConversationTurn, EndpointAuth (+26 more)

### Community 7 - "SettingsRepository"
Cohesion: 0.12
Nodes (14): config, config, config, addColumnIfMissing(), GatewayDatabase, migrateSchema(), tableColumns(), Injectable (+6 more)

### Community 8 - "api.controller.ts"
Cohesion: 0.10
Nodes (22): createProxy(), mockConfigService(), ConversationTurn, ProviderKeySource, ServicesService, Injectable, RequestEventsService, Injectable (+14 more)

### Community 9 - "provider-registry.service.ts"
Cohesion: 0.13
Nodes (14): ApiModule, Module, AppModule, Module, PontConfig, pontConfigKey, ProviderCatalogModule, Module (+6 more)

### Community 10 - "UsersService"
Cohesion: 0.14
Nodes (5): Injectable, UsersService, toRecord(), Injectable, UsersRepository

### Community 11 - "users.service.ts"
Cohesion: 0.15
Nodes (14): GATEWAY_API_KEY_PREFIX, gatewayKeyPrefix(), generateGatewayApiKey(), hashGatewayApiKey(), verifyGatewayApiKey(), hashPassword(), scrypt, verifyPassword() (+6 more)

### Community 12 - "el"
Cohesion: 0.17
Nodes (25): breakdownTable(), compact(), el(), esc(), formatDateTime(), formatDurationMmSs(), navLinkHtml(), num() (+17 more)

### Community 13 - "request-meta.ts"
Cohesion: 0.19
Nodes (16): applyEndUserFromHeader(), CLIENT_APP_ALIASES, extractClientApp(), extractTitle(), extractUsername(), firstUserItem(), headerString(), isRecord() (+8 more)

### Community 14 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, incremental (+11 more)

### Community 15 - "render"
Cohesion: 0.15
Nodes (20): applyUserTimezone(), endpointUrl(), errorText(), listTimezones(), logsSessionIdFromRoute(), openUserModelsModal(), profileInitials(), queryParam() (+12 more)

### Community 16 - "opencode-go/package.json"
Cohesion: 0.12
Nodes (16): devDependencies, @types/node, typescript, vitest, exports, @types/node, typescript, vitest (+8 more)

### Community 17 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, declarationMap, isolatedModules, module, moduleResolution, outDir, rootDir (+7 more)

### Community 18 - "conversation-parse.ts"
Cohesion: 0.27
Nodes (13): assistantTextFromCapture(), buildConversationTurn(), isRecord(), lastAssistantFromMessages(), textOf(), userTextFromRequestJson(), collectUsage(), extractUsage() (+5 more)

### Community 19 - "buildModelsCatalogPanel"
Cohesion: 0.20
Nodes (15): buildModelsCatalogPanel(), catalogIdCell(), catalogModelSlug(), catalogOwnerLabel(), catalogRowIsFreeById(), filterCatalogRows(), formatContextLength(), modelsRoute() (+7 more)

### Community 20 - "opencodeGo.ts"
Cohesion: 0.30
Nodes (11): apiStyleForPath(), buildOpenCodeGoUpstreamUrl(), DEFAULT_OPENCODE_GO_INFERENCE_BASE, getOpenCodeGoApiStyle(), googleModels, isLegacyZenGoBase(), messagesModels, modelSlug() (+3 more)

### Community 21 - "pont-webui/package.json"
Cohesion: 0.14
Nodes (13): devDependencies, typescript, vite, typescript, name, private, scripts, build (+5 more)

### Community 22 - "app-config.service.ts"
Cohesion: 0.22
Nodes (6): AppConfig, AppConfigService, MANAGED_APPS, ManagedApp, storageKey(), Injectable

### Community 23 - "renderLogin"
Cohesion: 0.25
Nodes (10): API_BASE, apiFetch(), setToken(), token(), brandFullHtml(), ensureGatewayKeyPrefilled(), fetchSignedInGatewayKey(), persistGatewayKey() (+2 more)

### Community 24 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, module, moduleResolution, noEmit, skipLibCheck, strict, target, include (+1 more)

### Community 25 - "@yoda/providers"
Cohesion: 0.22
Nodes (8): Auth modes, Base URL, Clients, Environment, Providers, Scripts, Sessions, @yoda/providers

### Community 26 - "renderLogs"
Cohesion: 0.39
Nodes (9): addDaysYmd(), attachLogActionHandlers(), logsApiQuery(), logsFilterQuery(), logsQueryParams(), logsTabLink(), navigate(), renderLogs() (+1 more)

### Community 27 - "Pont"
Cohesion: 0.25
Nodes (6): OpenVPN configs (not committed), Client usage, Docker (local), Environment, Local development, Pont

### Community 28 - "scripts"
Cohesion: 0.25
Nodes (7): name, private, scripts, build, dev:api, dev:webui, test

### Community 29 - "exclude"
Cohesion: 0.25
Nodes (7): exclude, extends, dist, node_modules, **/*.test.ts, ./tsconfig.json, vitest.config.ts

### Community 30 - "jwt.ts"
Cohesion: 0.48
Nodes (6): base64UrlDecode(), base64UrlEncode(), issueJwt(), PontJwtPayload, sign(), verifyJwt()

### Community 31 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

## Knowledge Gaps
- **184 isolated node(s):** `name`, `private`, `build`, `dev:api`, `dev:webui` (+179 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ProviderDefinition` connect `provider-test.service.ts` to `ApiController`, `ProviderProxyService`, `provider-proxy.service.ts`, `api.controller.ts`, `provider-registry.service.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `ApiController` connect `ApiController` to `api.controller.ts`, `provider-test.service.ts`, `provider-registry.service.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `ProviderRegistry` connect `provider-test.service.ts` to `ProviderProxyService`, `upstream-model-catalog.ts`, `provider-proxy.service.ts`, `api.controller.ts`, `provider-registry.service.ts`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `name`, `private`, `build` to the rest of the system?**
  _184 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ApiController` be split into smaller, more focused modules?**
  _Cohesion score 0.06602512697139802 - nodes in this community are weakly interconnected._
- **Should `provider-test.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05088919288645691 - nodes in this community are weakly interconnected._
- **Should `ProviderProxyService` be split into smaller, more focused modules?**
  _Cohesion score 0.05048766494549627 - nodes in this community are weakly interconnected._