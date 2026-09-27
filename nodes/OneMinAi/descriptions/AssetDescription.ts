import type { INodeProperties } from 'n8n-workflow';

/**
 * Field definitions for Resource "Asset", Operation "Upload".
 *
 * Endpoint: POST https://api.1min.ai/api/assets (multipart/form-data, field name "asset")
 * Docs: https://docs.1min.ai/docs/api/asset-api
 *
 * Marked EXPERIMENTAL: multipart handling in community nodes can behave differently across
 * n8n versions. Implemented with the documented "asset" form field; see README → Known gaps.
 */
export const assetFields: INodeProperties[] = [
	{
		displayName: '⚠️ Experimental',
		name: 'experimentalNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['asset'], operation: ['upload'] } },
		description:
			'Asset upload is experimental. It uploads the binary data of the input item as multipart/form-data field "asset", as documented by the Asset API. Please report issues if it behaves differently in your n8n version.',
	},
	{
		displayName: 'Binary Property',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: { show: { resource: ['asset'], operation: ['upload'] } },
		description: 'Name of the binary property on the input item that contains the file to upload (produced by nodes like Read/Write Files from Disk or HTTP Request)',
	},
];
