import type { INodeProperties } from 'n8n-workflow';

/**
 * Field definitions for Resource "Result", Operation "Get".
 *
 * Endpoint: GET https://api.1min.ai/api/results/{resultId}
 * Docs: https://docs.1min.ai/docs/api/get-result
 *
 * resultId is the aiRecord "uuid" returned by POST /api/features (async mode). While
 * processing, status is PROCESSING and resultObject is empty; on completion status is
 * SUCCESS and completed image/video/audio results also expose a time-limited "temporaryUrl".
 */
export const resultFields: INodeProperties[] = [
	{
		displayName: 'Result ID',
		name: 'resultId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['result'], operation: ['get'] } },
		description:
			'The UUID of the AI record, e.g. from the "aiRecordUuid" output field of an async AI Feature request (the record uuid is the result id — there is no separate resultId field).',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['result'], operation: ['get'] } },
		options: [
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: false,
				description:
					'Whether to poll until the record status is SUCCESS (or FAILURE) before returning. When off, a single GET is performed and the current status (e.g. PROCESSING) is returned.',
			},
			{
				displayName: 'Poll Interval (Seconds)',
				name: 'pollIntervalSeconds',
				type: 'number',
				default: 2,
				displayOptions: { show: { waitForCompletion: [true] } },
				description: 'Seconds between polls of the Get Result endpoint.',
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
