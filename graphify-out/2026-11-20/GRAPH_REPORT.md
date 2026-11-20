# Graph Report - Pont  (2026-11-06)

## Corpus Check
- 95 files · ~117,889 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 870 nodes · 2197 edges · 46 communities (44 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a8ac5ab6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api.controller.ts
- provider-test.service.ts
- ProviderProxyService
- upstream-model-catalog.ts
- asObject
- dependencies
- pont-webui/src/main.ts
- store.module.ts
- request-log.repository.ts
- pont.config.ts
- UsersService
- users.service.ts
- renderPromptLogsTable
- request-meta.ts
- compilerOptions
- render
- opencode-go/package.json
- compilerOptions
- usage.ts
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
- api-auth.service.ts
- nest-cli.json
- entrypoint.sh
- ProviderDefinition
- provider-proxy.service.ts
- RequestLogRepository
- api.module.ts
- provider-proxy.service.test.ts
- ProviderTestService
- app-model.service.ts
- el
- conversation-parse.ts
- .recordCompletion
- bootstrap.service.test.ts

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
- `assistantTextFromCapture()` --calls--> `parseEvents()`  [EXTRACTED]
  pont-api/src/logging/conversation-parse.ts → pont-api/src/logging/usage.ts
- `usageBucketForApp()` --calls--> `normalizeClientApp()`  [EXTRACTED]
  pont-api/src/store/request-log.repository.ts → pont-api/src/logging/request-meta.ts
- `ParsedPontModelId` --references--> `ProviderId`  [EXTRACTED]
  pont-api/src/models/pont-model-id.ts → pont-api/src/providers/provider-definitions.ts
- `ProviderRegistry` --references--> `ProviderId`  [EXTRACTED]
  pont-api/src/providers/provider-registry.service.ts → pont-api/src/providers/provider-definitions.ts

## Import Cycles
- None detected.

## Communities (46 total, 2 thin omitted)

### Community 0 - "api.controller.ts"
Cohesion: 0.09
Nodes (22): Delete, Patch, ApiController, parseIntParam(), Controller, Get, Param, Post (+14 more)

### Community 1 - "provider-test.service.ts"
Cohesion: 0.16
Nodes (17): isAnthropicModel(), resolveSessionId(), SESSION_HEADER, openCodeGoUpstreamUrlForEndpoint(), ProviderEndpointId, buildTestBody(), chatEndpointId(), extractSample() (+9 more)

### Community 2 - "ProviderProxyService"
Cohesion: 0.06
Nodes (34): clientAuthorization(), parseBearerToken(), secureEquals(), OpencodeGoLegacyController, Controller, Get, Post, Req (+26 more)

### Community 3 - "upstream-model-catalog.ts"
Cohesion: 0.07
Nodes (43): encodePontModelId(), encodePontModelIdFromUpstream(), isFreeTierUpstreamSlug(), normalizeUpstreamSlugForPont(), OPENROUTER_HYPHENATED_VENDORS, ParsedPontModelId, parsePontModelId(), pontPrefixForProvider() (+35 more)

### Community 4 - "asObject"
Cohesion: 0.11
Nodes (27): anthropicMessageToOpenAiCompletion(), AnthropicToOpenAiStream, finishReason(), usageOf(), asArray(), asObject(), isJsonObject(), JsonObject (+19 more)

### Community 5 - "dependencies"
Cohesion: 0.05
Nodes (38): @nestjs/cli, @nestjs/common, @nestjs/config, @nestjs/core, @nestjs/platform-express, @nestjs/testing, dependencies, @nestjs/common (+30 more)

### Community 6 - "pont-webui/src/main.ts"
Cohesion: 0.06
Nodes (36): authParamsForRoute(), CATALOG_SORT_KEYS, CatalogModelRow, CatalogSortKey, CHAT_BODY_PARAMS, compactFormat, ConversationTurn, EndpointAuth (+28 more)

### Community 7 - "store.module.ts"
Cohesion: 0.13
Nodes (12): config, ProviderKeySource, config, addColumnIfMissing(), GatewayDatabase, migrateSchema(), tableColumns(), Injectable (+4 more)

### Community 8 - "request-log.repository.ts"
Cohesion: 0.12
Nodes (15): ConversationTurn, AppUsageTotals, EMPTY_APP_USAGE, LogFilterOptions, RequestLogInput, RequestLogQuery, RequestLogRow, RequestStats (+7 more)

### Community 9 - "pont.config.ts"
Cohesion: 0.18
Nodes (8): AppModule, Module, PontConfig, pontConfigKey, PUBLIC_IP_URL, Injectable, VPN_INTERFACE, VpnStatusService

### Community 10 - "UsersService"
Cohesion: 0.12
Nodes (5): Injectable, UsersService, toRecord(), Injectable, UsersRepository

### Community 11 - "users.service.ts"
Cohesion: 0.18
Nodes (14): GATEWAY_API_KEY_PREFIX, gatewayKeyPrefix(), generateGatewayApiKey(), hashGatewayApiKey(), isPontGatewayApiKey(), verifyGatewayApiKey(), hashPassword(), scrypt (+6 more)

### Community 12 - "renderPromptLogsTable"
Cohesion: 0.26
Nodes (12): formatDateTime(), formatDurationMmSs(), parseUtcDate(), renderLogSession(), renderPromptLogsTable(), renderSessionLogsTable(), showPromptModal(), splitProviderModel() (+4 more)

### Community 13 - "request-meta.ts"
Cohesion: 0.23
Nodes (15): applyEndUserFromHeader(), CLIENT_APP_ALIASES, extractClientApp(), extractTitle(), extractUsername(), firstUserItem(), headerString(), isRecord() (+7 more)

### Community 14 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, incremental (+11 more)

### Community 15 - "render"
Cohesion: 0.16
Nodes (19): applyUserTimezone(), endpointUrl(), errorText(), listTimezones(), logsSessionIdFromRoute(), navLinkHtml(), openUserModelsModal(), profileInitials() (+11 more)

### Community 16 - "opencode-go/package.json"
Cohesion: 0.12
Nodes (16): devDependencies, @types/node, typescript, vitest, exports, @types/node, typescript, vitest (+8 more)

### Community 17 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, declarationMap, isolatedModules, module, moduleResolution, outDir, rootDir (+7 more)

### Community 18 - "usage.ts"
Cohesion: 0.36
Nodes (7): collectUsage(), extractUsage(), isRecord(), numberOf(), parseEvents(), TokenUsage, UsageTotals

### Community 19 - "buildModelsCatalogPanel"
Cohesion: 0.18
Nodes (17): buildModelsCatalogPanel(), catalogIdCell(), catalogModelSlug(), catalogOwnerLabel(), catalogRowIsFreeById(), filterCatalogRows(), formatContextLength(), modelsRoute() (+9 more)

### Community 20 - "opencodeGo.ts"
Cohesion: 0.30
Nodes (11): apiStyleForPath(), buildOpenCodeGoUpstreamUrl(), DEFAULT_OPENCODE_GO_INFERENCE_BASE, getOpenCodeGoApiStyle(), googleModels, isLegacyZenGoBase(), messagesModels, modelSlug() (+3 more)

### Community 21 - "pont-webui/package.json"
Cohesion: 0.14
Nodes (13): devDependencies, typescript, vite, typescript, name, private, scripts, build (+5 more)

### Community 22 - "app-config.service.ts"
Cohesion: 0.23
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

### Community 30 - "api-auth.service.ts"
Cohesion: 0.50
Nodes (6): base64UrlDecode(), base64UrlEncode(), issueJwt(), PontJwtPayload, sign(), verifyJwt()

### Community 31 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 35 - "ProviderDefinition"
Cohesion: 0.17
Nodes (9): ProviderDefinition, ProviderRegistry, Injectable, ModelsCatalogService, Injectable, maskSecret(), ProviderKeysService, storageKey() (+1 more)

### Community 36 - "provider-proxy.service.ts"
Cohesion: 0.14
Nodes (12): CompletionRecord, OPENCODE_GO, resolveClientIp(), upstreamAuthHeaders(), ANTHROPIC_VERSION_HEADER, buildProviderDefinitions(), ENDPOINT_IDS, OPENAI_COMPATIBLE_ENDPOINTS (+4 more)

### Community 37 - "RequestLogRepository"
Cohesion: 0.13
Nodes (7): buildWhere(), RequestLogRepository, splitDistinctCsv(), splitStatusCodes(), config, toRecord(), Injectable

### Community 38 - "api.module.ts"
Cohesion: 0.24
Nodes (8): ApiModule, Module, GatewayModule, Module, ProviderCatalogModule, Module, StoreModule, Module

### Community 39 - "provider-proxy.service.test.ts"
Cohesion: 0.23
Nodes (6): createProxy(), mockConfigService(), ServicesService, Injectable, RequestEventsService, Injectable

### Community 40 - "ProviderTestService"
Cohesion: 0.39
Nodes (3): ProviderEndpoint, ProviderTestService, Injectable

### Community 41 - "app-model.service.ts"
Cohesion: 0.23
Nodes (7): AppModelSelection, AppModelService, AppModelStatus, MODEL_APPS, ModelApp, storageKey(), Injectable

### Community 42 - "el"
Cohesion: 0.30
Nodes (12): breakdownTable(), compact(), el(), esc(), playgroundResultBlock(), providerSelectOptions(), renderOverview(), renderProviderKeySection() (+4 more)

### Community 43 - "conversation-parse.ts"
Cohesion: 0.76
Nodes (6): assistantTextFromCapture(), buildConversationTurn(), isRecord(), lastAssistantFromMessages(), textOf(), userTextFromRequestJson()

### Community 45 - "bootstrap.service.test.ts"
Cohesion: 0.40
Nodes (3): BootstrapService, config, Injectable

## Knowledge Gaps
- **186 isolated node(s):** `name`, `private`, `build`, `dev:api`, `dev:webui` (+181 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ProviderDefinition` connect `ProviderDefinition` to `api.controller.ts`, `provider-test.service.ts`, `ProviderProxyService`, `provider-proxy.service.ts`, `store.module.ts`, `ProviderTestService`, `users.service.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `ApiController` connect `api.controller.ts` to `ProviderDefinition`, `api.module.ts`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `ProviderRegistry` connect `ProviderDefinition` to `api.controller.ts`, `provider-test.service.ts`, `ProviderProxyService`, `upstream-model-catalog.ts`, `provider-proxy.service.ts`, `api.module.ts`, `provider-proxy.service.test.ts`, `store.module.ts`, `app-model.service.ts`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `name`, `private`, `build` to the rest of the system?**
  _186 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.controller.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09399585921325052 - nodes in this community are weakly interconnected._
- **Should `ProviderProxyService` be split into smaller, more focused modules?**
  _Cohesion score 0.05516475379489078 - nodes in this community are weakly interconnected._
- **Should `upstream-model-catalog.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06853146853146853 - nodes in this community are weakly interconnected._