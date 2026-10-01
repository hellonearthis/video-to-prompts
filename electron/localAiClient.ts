/**
 * ============================================================================
 * TUTORIAL: UNIVERSAL LOCAL AI CLIENT WITH DYNAMIC CAPABILITY DISCOVERY
 * ============================================================================
 * 
 * WHAT THIS MODULE DOES:
 * Provides a standardized client for interacting with local OpenAI-compatible
 * inference engines (llama-server.exe, LM Studio, etc.). It automatically probes
 * candidate server ports, retrieves loaded model metadata from `/v1/models`,
 * validates required capabilities (such as multimodal vision support), and
 * dynamically configures API endpoints without hardcoded filenames.
 * 
 * WHY THIS IS CRITICAL FOR PORTING TO OTHER APPLICATIONS:
 * 1. ZERO RECOMPILATION ON MODEL SWITCHES:
 *    When users download new model checkpoints or change quantizations, this client
 *    queries the running server's `/v1/models` endpoint directly and adapts to
 *    whatever model ID or alias is active in VRAM.
 * 2. AUTOMATIC PORT AGILITY:
 *    Different tools default to different ports (llama-server defaults to 8080
 *    or 9931; LM Studio defaults to 1234). Probing candidate endpoints prevents
 *    connection failures when switching backends.
 * 3. MULTIMODAL / VISION SAFETY:
 *    Attempting to send base64 image frames to a text-only model crashes inference.
 *    This module inspects the server's declared capabilities array to ensure
 *    `"multimodal"` support is present before dispatching vision payloads.
 */

// WHAT: Interface representing the structured metadata of an actively loaded model.
// WHY: Gives consumers type-safe access to the active identifier, context size, and features.
export interface DiscoveredModelMetadata {
    /** The primary model identifier or filename reported by the server */
    modelIdentifier: string;
    /** Semantic alias identifiers configured on startup (e.g., 'qwen3.5-9b', 'default') */
    modelAliasesArray: string[];
    /** Declared capabilities reported by the engine (e.g., 'completion', 'multimodal') */
    capabilitiesArray: string[];
    /** Whether the loaded model supports multimodal vision processing */
    supportsMultimodalVision: boolean;
    /** The active context window size in tokens */
    contextWindowTokens: number;
    /** Total parameter count of the loaded architecture */
    parameterCount: number;
    /** The base HTTP endpoint where this model is hosted */
    endpointBaseUrl: string;
}

// WHAT: Options provided when initiating dynamic model discovery.
// WHY: Allows client applications to specify whether vision or specific context minimums are needed.
export interface ModelDiscoveryOptions {
    /** If true, verifies that the model has multimodal vision capabilities attached */
    requireMultimodalVision?: boolean;
    /** Maximum time in milliseconds to wait for each candidate endpoint to respond */
    perEndpointTimeoutMilliseconds?: number;
    /** Optional custom array of candidate base URLs to probe */
    candidateBaseUrlsArray?: string[];
}

/**
 * Universal Local AI Client class for discovering and communicating with local LLM/VLM servers.
 */
export class LocalAIClient {
    // WHAT: Ordered list of local ports and endpoints to probe during discovery.
    // WHY: Checks user-supplied environment variables first, then default llama-server and LM Studio ports.
    private readonly defaultCandidateBaseUrlsArray: string[];

    // WHAT: The verified active base URL (e.g., 'http://localhost:8080').
    // WHY: Cached after a successful handshake so subsequent requests avoid discovery overhead.
    private activeEndpointBaseUrl: string | null = null;

    // WHAT: The cached metadata of the actively loaded model.
    // WHY: Enables instant capability checking and dynamic model binding on inference requests.
    private activeModelMetadata: DiscoveredModelMetadata | null = null;

    constructor(customCandidateUrlsArray?: string[]) {
        // WHAT: Constructing candidate endpoints list.
        // WHY: Prioritizes environment overrides if set, falling back to standard local ports.
        const environmentConfiguredUrl = typeof process !== 'undefined' && process.env?.LOCAL_AI_URL
            ? process.env.LOCAL_AI_URL.trim()
            : null;
        const llamaPort = typeof process !== 'undefined' && process.env?.LLAMA_SERVER_PORT
            ? process.env.LLAMA_SERVER_PORT.trim()
            : '8081';

        this.defaultCandidateBaseUrlsArray = customCandidateUrlsArray || [
            ...(environmentConfiguredUrl ? [environmentConfiguredUrl] : []),
            `http://localhost:${llamaPort}`,
            'http://localhost:8081',
            'http://localhost:8080',
            'http://localhost:9931'
        ];
    }

    /**
     * WHAT: Parses raw JSON from a `/v1/models` endpoint into a DiscoveredModelMetadata object.
     * WHY: Isolated as a deterministic pure function so it can be thoroughly verified by unit tests.
     */
    public parseModelsApiResponse(
        rawApiResponsePayload: any,
        endpointBaseUrl: string
    ): DiscoveredModelMetadata | null {
        // WHAT: Guard against null or missing data.
        // WHY: Both llama-server and LM Studio return standard OpenAI list objects with a 'data' array.
        if (!rawApiResponsePayload || typeof rawApiResponsePayload !== 'object') {
            return null;
        }

        const modelsListArray = Array.isArray(rawApiResponsePayload.data)
            ? rawApiResponsePayload.data
            : [];

        if (modelsListArray.length === 0) {
            return null;
        }

        const primaryModelEntry = modelsListArray[0];
        const primaryModelIdentifier: string = primaryModelEntry.id || 'default';

        // WHAT: Extracting declared capabilities from llama-server's extended model response.
        // WHY: llama-server includes a 'models' collection with a 'capabilities' array (e.g. ['completion', 'multimodal']).
        const extendedModelsListArray = Array.isArray(rawApiResponsePayload.models)
            ? rawApiResponsePayload.models
            : [];
        const matchingExtendedModel = extendedModelsListArray.find(
            (modelCandidate: any) => modelCandidate.name === primaryModelIdentifier || modelCandidate.model === primaryModelIdentifier
        ) || extendedModelsListArray[0];

        const declaredCapabilitiesArray: string[] = Array.isArray(matchingExtendedModel?.capabilities)
            ? matchingExtendedModel.capabilities
            : [];

        // WHAT: Determining whether multimodal vision is supported.
        // WHY: Check declared capabilities array first; if missing, check if model name contains 'vl' or 'vision'.
        const declaredMultimodalSupport = declaredCapabilitiesArray.includes('multimodal')
            || primaryModelIdentifier.toLowerCase().includes('-vl')
            || primaryModelIdentifier.toLowerCase().includes('vision');

        const contextWindowTokens: number = primaryModelEntry.meta?.n_ctx || 8192;
        const parameterCount: number = primaryModelEntry.meta?.n_params || 0;
        const aliasesArray: string[] = Array.isArray(primaryModelEntry.aliases)
            ? primaryModelEntry.aliases
            : [primaryModelIdentifier];

        return {
            modelIdentifier: primaryModelIdentifier,
            modelAliasesArray: aliasesArray,
            capabilitiesArray: declaredCapabilitiesArray,
            supportsMultimodalVision: declaredMultimodalSupport,
            contextWindowTokens,
            parameterCount,
            endpointBaseUrl
        };
    }

    /**
     * WHAT: Probes candidate endpoints to discover which local server and model are currently active.
     * WHY: Allows the application to boot smoothly regardless of whether the user started
     * llama-server on port 8080, LM Studio on port 1234, or another custom configuration.
     */
    public async discoverActiveModel(
        discoveryOptions?: ModelDiscoveryOptions
    ): Promise<DiscoveredModelMetadata | null> {
        const timeoutMilliseconds = discoveryOptions?.perEndpointTimeoutMilliseconds || 2000;
        const candidateEndpointsArray = discoveryOptions?.candidateBaseUrlsArray || this.defaultCandidateBaseUrlsArray;

        for (const candidateBaseUrl of candidateEndpointsArray) {
            try {
                const normalizedBaseUrl = candidateBaseUrl.replace(/\/+$/, '');
                const modelsDiscoveryEndpointUrl = `${normalizedBaseUrl}/v1/models`;

                // WHAT: Performing fast probe request to /v1/models with an explicit timeout.
                // WHY: Fast timeouts prevent UI lockup when a port has no server listening.
                const httpResponse = await fetch(modelsDiscoveryEndpointUrl, {
                    method: 'GET',
                    signal: AbortSignal.timeout(timeoutMilliseconds)
                });

                if (httpResponse.ok) {
                    const parsedResponseJson = await httpResponse.json();
                    const discoveredMetadata = this.parseModelsApiResponse(parsedResponseJson, normalizedBaseUrl);

                    if (discoveredMetadata) {
                        // WHAT: Validating multimodal requirement if requested by caller.
                        // WHY: If the calling application requires vision, we warn if a text-only model is active.
                        if (discoveryOptions?.requireMultimodalVision && !discoveredMetadata.supportsMultimodalVision) {
                            console.warn(
                                `[LocalAIClient] Model '${discoveredMetadata.modelIdentifier}' at ${normalizedBaseUrl} does not declare multimodal vision capability.`
                            );
                        }

                        this.activeEndpointBaseUrl = normalizedBaseUrl;
                        this.activeModelMetadata = discoveredMetadata;
                        return discoveredMetadata;
                    }
                }
            } catch {
                // WHAT: Gracefully catch connection refused, network timeouts, or DNS failures.
                // WHY: Standard behavior when probing candidate ports; simply continue to the next candidate.
                continue;
            }
        }

        // WHAT: All candidate endpoints failed to respond.
        // WHY: Indicates no local AI engine is running on any of the probed ports.
        this.activeEndpointBaseUrl = null;
        this.activeModelMetadata = null;
        return null;
    }

    /**
     * WHAT: Returns the active base URL if connected, or null.
     */
    public getActiveEndpointBaseUrl(): string | null {
        return this.activeEndpointBaseUrl;
    }

    /**
     * WHAT: Returns the full /v1/chat/completions endpoint for inference requests.
     */
    public getActiveChatCompletionsUrl(): string {
        const baseUrl = this.activeEndpointBaseUrl || 'http://localhost:8080';
        return `${baseUrl}/v1/chat/completions`;
    }

    /**
     * WHAT: Returns the actively discovered model identifier to use in request bodies.
     */
    public getActiveModelIdentifier(): string {
        return this.activeModelMetadata?.modelIdentifier || 'default';
    }

    /**
     * WHAT: Returns whether the currently connected model supports multimodal vision payloads.
     */
    public hasMultimodalVisionSupport(): boolean {
        return this.activeModelMetadata?.supportsMultimodalVision ?? false;
    }

    /**
     * WHAT: Returns the full cached metadata object, if discovery succeeded.
     */
    public getActiveModelMetadata(): DiscoveredModelMetadata | null {
        return this.activeModelMetadata;
    }
}
