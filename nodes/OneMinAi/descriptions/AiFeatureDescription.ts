import type { INodeProperties } from 'n8n-workflow';

/**
 * Field definitions for Resource "AI Feature", Operation "Execute".
 *
 * Endpoint: POST https://api.1min.ai/api/features
 * Documented body: { type, model, promptObject, async? } — promptObject parameters vary by
 * feature type, which is why this resource takes a JSON promptObject instead of per-feature
 * fields. Docs: https://docs.1min.ai/docs/api/ai-feature-api
 */
export const aiFeatureFields: INodeProperties[] = [
	{
		displayName: 'Input Mode',
		name: 'inputMode',
		type: 'options',
		options: [
			{
				name: 'Structured',
				value: 'structured',
				description: 'Build the request from Feature Type, Model and a promptObject JSON',
			},
			{
				name: 'Raw JSON Body (Advanced)',
				value: 'raw',
				description: 'Send a complete JSON body to POST /api/features as-is',
			},
		],
		default: 'structured',
		displayOptions: { show: { resource: ['aiFeature'], operation: ['execute'] } },
		description: 'How to build the request body',
	},
	{
		displayName: 'Feature Type',
		name: 'featureType',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. IMAGE_GENERATOR',
		displayOptions: {
			show: { resource: ['aiFeature'], operation: ['execute'], inputMode: ['structured'] },
		},
		description:
			'Feature name sent as "type", e.g. IMAGE_GENERATOR, IMAGE_VARIATOR, IMAGE_EDITOR. Feature types are not listed exhaustively in the docs, so this is a free string — check the AI Feature API docs for available values.',
	},
	{
		displayName: 'Model',
		name: 'model',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. magic-art',
		displayOptions: {
			show: { resource: ['aiFeature'], operation: ['execute'], inputMode: ['structured'] },
		},
		description: 'Model name to use for the feature, e.g. "magic-art" for image features',
	},
	{
		displayName: 'Prompt Object (JSON)',
		name: 'promptObjectJson',
		type: 'json',
		typeOptions: { rows: 6 },
		required: true,
		default: '{}',
		displayOptions: {
			show: { resource: ['aiFeature'], operation: ['execute'], inputMode: ['structured'] },
		},
		description: 'Feature-specific parameters sent as "promptObject". Parameters vary by feature type, e.g. for image features: {"imageUrl": "&lt;asset key or URL&gt;", "mode": "fast", "n": 4}. See the AI Feature API docs.',
	},
	{
		displayName: 'Run Async',
		name: 'asyncMode',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: { resource: ['aiFeature'], operation: ['execute'], inputMode: ['structured'] },
		},
		description:
			'Whether to add "async": true. The API responds immediately with status PROCESSING and the record UUID; retrieve the final result with the Result resource (Get Result API). Recommended for slow features like IMAGE_EDITOR.',
	},
	{
		displayName: 'JSON Body',
		name: 'rawBodyJson',
		type: 'json',
		typeOptions: { rows: 8 },
		required: true,
		default:
			'={\n  "type": "IMAGE_GENERATOR",\n  "model": "magic-art",\n  "promptObject": {\n    "prompt": "A mountain at sunset"\n  }\n}',
		displayOptions: { show: { resource: ['aiFeature'], operation: ['execute'], inputMode: ['raw'] } },
		description: 'Full request body sent to POST /api/features exactly as provided (pass "async": true inside for async execution)',
	},
	{
	displayName: 'Simplify',
	name: 'simplify',
	type: 'boolean',
	default: false,
		displayOptions: { show: { resource: ['aiFeature'], operation: ['execute'] } },
		description: 'Whether to return a simplified version of the response instead of the raw data',
		},
		{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['aiFeature'], operation: ['execute'] } },
		options: [
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: false,
				description:
					'Whether to poll GET /api/results/{uuid} until status is SUCCESS (or FAILURE) before returning. Only relevant when the response status is PROCESSING.',
			},
			{
				displayName: 'Poll Interval (Seconds)',
				name: 'pollIntervalSeconds',
				type: 'number',
				default: 2,
				displayOptions: { show: { waitForCompletion: [true] } },
				description: 'Seconds between polls of the Get Result endpoint',
			},
			{
				displayName: 'Max Wait Time (Seconds)',
				name: 'pollTimeoutSeconds',
				type: 'number',
				default: 120,
				displayOptions: { show: { waitForCompletion: [true] } },
				description:
					'Maximum seconds to wait for completion. If the timeout is reached, the last known record is returned with its current status.',
			},
		],
	},
];
