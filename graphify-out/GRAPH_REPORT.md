# Graph Report - Pont  (2026-11-20)

## Corpus Check
- 90 files · ~109,120 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 724 nodes · 1564 edges · 28 communities (26 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8d8c4935`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- AdminController
- Full release matrix
- provider-proxy.service.ts
- upstream-model-catalog.ts
- asObject
- dependencies
- AGENTS.md
- provider-proxy.service.test.ts
- UsersService
- compilerOptions
- pont-webui/src/main.ts
- opencode-go/package.json
- compilerOptions
- opencodeGo.ts
- pont-webui/package.json
- app-config.service.ts
- compilerOptions
- Pont API
- Pont
- scripts
- exclude
- nest-cli.json
- entrypoint.sh
- ProviderRegistry
- request-log.repository.ts
- store.module.ts

## God Nodes (most connected - your core abstractions)
1. `UsersService` - 28 edges
2. `SettingsRepository` - 25 edges
3. `UsersRepository` - 25 edges
4. `RequestLogRepository` - 24 edges
5. `AdminController` - 21 edges
6. `ProviderProxyService` - 20 edges
7. `EligibleModelsService` - 20 edges
8. `GatewayDatabase` - 20 edges
9. `ProviderRegistry` - 19 edges
10. `ProviderKeysService` - 19 edges

## Surprising Connections (you probably didn't know these)
- `CompletionRecord` --references--> `ProviderDefinition`  [EXTRACTED]
  pont-api/src/gateway/provider-proxy.service.ts → pont-api/src/providers/provider-definitions.ts
- `usageBucketForApp()` --calls--> `normalizeClientApp()`  [EXTRACTED]
  pont-api/src/store/request-log.repository.ts → pont-api/src/logging/request-meta.ts
- `ParsedPontModelId` --references--> `ProviderId`  [EXTRACTED]
  pont-api/src/models/pont-model-id.ts → pont-api/src/providers/provider-definitions.ts
- `CatalogModelRow` --references--> `ProviderId`  [EXTRACTED]
  pont-api/src/models/upstream-model-catalog.ts → pont-api/src/providers/provider-definitions.ts
- `ProviderRegistry` --references--> `ProviderId`  [EXTRACTED]
  pont-api/src/providers/provider-registry.service.ts → pont-api/src/providers/provider-definitions.ts

## Import Cycles
- None detected.

## Communities (28 total, 2 thin omitted)

### Community 0 - "AdminController"
Cohesion: 0.15
Nodes (14): Body, Delete, Param, Patch, AdminController, Controller, Get, Post (+6 more)

### Community 1 - "Full release matrix"
Cohesion: 0.06
Nodes (32): 1. Logs page has no document H1, 2. Users page has no document H1, 3. Endpoints page has no document H1, 404 handling, 4. Default `armin` login not seeded, Accessibility, Analytics, API / backend smoke (proxy `:9881/api`) (+24 more)

### Community 2 - "provider-proxy.service.ts"
Cohesion: 0.06
Nodes (42): DECODED_BODY_HEADERS, FORWARD_REQUEST_HEADERS, HOP_BY_HOP, ProviderProxyService, Injectable, Controller, Get, Post (+34 more)

### Community 3 - "upstream-model-catalog.ts"
Cohesion: 0.06
Nodes (48): encodePontModelId(), encodePontModelIdFromUpstream(), isFreeTierUpstreamSlug(), normalizeUpstreamSlugForPont(), OPENROUTER_HYPHENATED_VENDORS, ParsedPontModelId, parsePontModelId(), pontPrefixForProvider() (+40 more)

### Community 4 - "asObject"
Cohesion: 0.13
Nodes (24): anthropicMessageToOpenAiCompletion(), AnthropicToOpenAiStream, finishReason(), usageOf(), asArray(), asObject(), isJsonObject(), JsonObject (+16 more)

### Community 5 - "dependencies"
Cohesion: 0.05
Nodes (40): express, @nestjs/cli, @nestjs/common, @nestjs/config, @nestjs/core, @nestjs/platform-express, @nestjs/testing, dependencies (+32 more)

### Community 7 - "provider-proxy.service.test.ts"
Cohesion: 0.06
Nodes (34): readCookie(), Session, GATEWAY_API_KEY_PREFIX, gatewayKeyPrefix(), generateGatewayApiKey(), hashGatewayApiKey(), verifyGatewayApiKey(), DEFAULT_OPENCODE_ZEN_BASE (+26 more)

### Community 10 - "UsersService"
Cohesion: 0.10
Nodes (8): isJsonObject(), CreateUserResult, Injectable, UsersService, toRecord(), Injectable, UserRecord, UsersRepository

### Community 14 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, incremental (+11 more)

### Community 15 - "pont-webui/src/main.ts"
Cohesion: 0.14
Nodes (28): adminFetch(), bindKey(), el(), esc(), keyField(), KeyStatus, meta(), Method (+20 more)

### Community 16 - "opencode-go/package.json"
Cohesion: 0.12
Nodes (16): devDependencies, @types/node, typescript, vitest, exports, @types/node, typescript, vitest (+8 more)

### Community 17 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, declaration, declarationMap, isolatedModules, module, moduleResolution, outDir, rootDir (+7 more)

### Community 20 - "opencodeGo.ts"
Cohesion: 0.30
Nodes (11): apiStyleForPath(), buildOpenCodeGoUpstreamUrl(), DEFAULT_OPENCODE_GO_INFERENCE_BASE, getOpenCodeGoApiStyle(), googleModels, isLegacyZenGoBase(), messagesModels, modelSlug() (+3 more)

### Community 21 - "pont-webui/package.json"
Cohesion: 0.14
Nodes (13): devDependencies, typescript, vite, typescript, name, private, scripts, build (+5 more)

### Community 22 - "app-config.service.ts"
Cohesion: 0.25
Nodes (6): AppConfig, AppConfigService, MANAGED_APPS, ManagedApp, storageKey(), Injectable

### Community 24 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, module, moduleResolution, noEmit, skipLibCheck, strict, target, include (+1 more)

### Community 25 - "Pont API"
Cohesion: 0.33
Nodes (5): Environment, Pont API, Routes, Scripts, Sessions

### Community 27 - "Pont"
Cohesion: 0.25
Nodes (6): OpenVPN configs (not committed), Client usage, Docker (local), Environment, Local development, Pont

### Community 28 - "scripts"
Cohesion: 0.17
Nodes (11): engines, node, name, packageManager, private, scripts, build, dev:api (+3 more)

### Community 29 - "exclude"
Cohesion: 0.25
Nodes (7): exclude, extends, dist, node_modules, **/*.test.ts, ./tsconfig.json, vitest.config.ts

### Community 31 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 35 - "ProviderRegistry"
Cohesion: 0.08
Nodes (24): clientAuthorization(), parseBearerToken(), secureEquals(), isPontGatewayApiKey(), CompletionRecord, OPENCODE_GO, Injectable, UpstreamAuthService (+16 more)

### Community 37 - "request-log.repository.ts"
Cohesion: 0.06
Nodes (35): assistantTextFromCapture(), buildConversationTurn(), ConversationTurn, isRecord(), lastAssistantFromMessages(), textOf(), userTextFromRequestJson(), collectUsage() (+27 more)

### Community 38 - "store.module.ts"
Cohesion: 0.10
Nodes (19): AdminModule, Module, AppModule, Module, GatewayModule, Module, HealthController, Controller (+11 more)

## Knowledge Gaps
- **194 isolated node(s):** `name`, `private`, `packageManager`, `node`, `build` (+189 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RequestLogRepository` connect `request-log.repository.ts` to `AdminController`, `provider-proxy.service.ts`, `store.module.ts`, `provider-proxy.service.test.ts`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `UsersService` connect `UsersService` to `AdminController`, `ProviderRegistry`, `store.module.ts`, `provider-proxy.service.test.ts`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `SettingsRepository` connect `provider-proxy.service.test.ts` to `upstream-model-catalog.ts`, `ProviderRegistry`, `store.module.ts`, `UsersService`, `app-config.service.ts`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `name`, `private`, `packageManager` to the rest of the system?**
  _194 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Full release matrix` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
- **Should `provider-proxy.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05738615327656423 - nodes in this community are weakly interconnected._
- **Should `upstream-model-catalog.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06169772256728778 - nodes in this community are weakly interconnected._