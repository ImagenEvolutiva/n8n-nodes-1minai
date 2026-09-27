import type { INodeProperties } from 'n8n-workflow';

/**
 * Field definitions for Resource "Chat", Operation "Send Prompt".
 *
 * Endpoint: POST https://api.1min.ai/api/chat-with-ai
 * Documented body:
 *   { type: 'UNIFY_CHAT_WITH_AI', model, promptObject: { prompt, conversationId?, settings?, attachments? }, brandVoiceId?, metadata? }
 * Docs: https://docs.1min.ai/docs/api/chat-with-ai-api
 *
 * The API also supports `?isStreaming=true` (SSE). n8n buffers HTTP responses, so this node
 * always uses the non-streaming endpoint; see README → Known gaps.
 */
export const chatFields: INodeProperties[] = [
	{
		displayName: 'Input Mode',
		name: 'inputMode',
		type: 'options',
		options: [
			{
				// Simple prompt mode: the node assembles the documented body.
				name: 'Simple Prompt',
				value: 'prompt',
			},
			{
				// Advanced escape hatch: raw body pass-through; type injected if missing.
				name: 'Raw JSON Body (Advanced)',
				value: 'raw',
			},
		],
		default: 'prompt',
		displayOptions: { show: { resource: ['chat'], operation: ['send'] } },
		description: 'How to build the request body',
	},
	{
		displayName: 'Model',
		name: 'model',
		type: 'string',
		required: true,
		default: 'gpt-4o-mini',
		displayOptions: { show: { resource: ['chat'], operation: ['send'], inputMode: ['prompt'] } },
		description:
			'AI model identifier used by 1min.AI, e.g. "gpt-4o-mini", "us.anthropic.claude-sonnet-5", "gemini-2.5-pro", "sonar". The full list lives in the endpoint docs under "Available Models" and changes frequently, so it is intentionally not hardcoded here.',
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		displayOptions: { show: { resource: ['chat'], operation: ['send'], inputMode: ['prompt'] } },
		description: 'The user\'s message sent to the model',
	},
	{
		displayName: 'Conversation ID',
		name: 'conversationId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['chat'], operation: ['send'], inputMode: ['prompt'] } },
		description:
			'Optional. Conversation UUID for multi-turn context. Create one with the Conversation resource first, then pass its UUID here (promptObject.conversationId).',
	},
	{
		displayName: 'JSON Body',
		name: 'jsonBody',
		type: 'json',
		typeOptions: { rows: 8 },
		required: true,
		default:
			'={\n  "type": "UNIFY_CHAT_WITH_AI",\n  "model": "gpt-4o-mini",\n  "promptObject": {\n    "prompt": "Hello!"\n  }\n}',
		displayOptions: { show: { resource: ['chat'], operation: ['send'], inputMode: ['raw'] } },
		description:
			'Full request body sent to POST /api/chat-with-ai. If "type" is missing, UNIFY_CHAT_WITH_AI is injected. Everything else is sent exactly as provided — see the endpoint docs for promptObject, settings, attachments, brandVoiceId and metadata.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['chat'], operation: ['send'], inputMode: ['prompt'] } },
		options: [
			{
				displayName: 'Enable Web Search',
				name: 'webSearch',
				type: 'boolean',
				default: false,
				description: 'Whether to ground the response with web search (promptObject.settings.webSearchSettings.webSearch)',
			},
			{
				displayName: 'Enable AI Memories',
				name: 'withMemories',
				type: 'boolean',
				default: false,
				description: 'Whether to enable AI memory across conversations (promptObject.settings.withMemories)',
			},
			{
				displayName: 'Attachments JSON',
				name: 'attachmentsJson',
				type: 'json',
				default: '{}',
				description: 'File/image attachments, e.g. {"images": ["&lt;asset key or URL&gt;"], "files": ["&lt;asset ID&gt;"]}. Passed through as promptObject.attachments.',
			},
			{
				displayName: 'Brand Voice ID',
				name: 'brandVoiceId',
				type: 'string',
				default: '',
				description: 'Optional. Brand voice ID to apply a custom tone/style to the response.',
			},
			{
				displayName: 'Settings JSON',
				name: 'settingsJson',
				type: 'json',
				default: '{}',
				description:
					'Advanced chat settings merged into promptObject.settings, e.g. {"webSearchSettings": {"webSearch": true, "numOfSite": 5, "maxWord": 2000}, "historySettings": {"isMixed": false, "historyMessageLimit": 20}}. Keys here win over the toggles above.',
			},
			{
				displayName: 'Metadata JSON',
				name: 'metadataJson',
				type: 'json',
				default: '{}',
				description: 'Optional. Additional metadata for the request (top-level "metadata" object).',
			},
		],
	},
];
