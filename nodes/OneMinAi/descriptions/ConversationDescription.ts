import type { INodeProperties } from 'n8n-workflow';

/**
 * Field definitions for Resource "Conversation", Operation "Create".
 *
 * Endpoint: POST https://api.1min.ai/api/conversations
 * Documented body: { type: 'UNIFY_CHAT_WITH_AI', title, model }
 * Docs: https://docs.1min.ai/docs/api/chat-with-ai-api#create-a-conversation-for-history
 *
 * The returned UUID is used as promptObject.conversationId in Chat with AI requests.
 */
export const conversationFields: INodeProperties[] = [
	{
		displayName: 'Conversation Title',
		name: 'title',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'My AI Conversation',
		displayOptions: { show: { resource: ['conversation'], operation: ['create'] } },
		description: 'Human-readable title of the conversation',
	},
	{
		displayName: 'Model',
		name: 'model',
		type: 'string',
		required: true,
		default: 'gpt-4o-mini',
		displayOptions: { show: { resource: ['conversation'], operation: ['create'] } },
		description:
			'AI model identifier used for the conversation, e.g. "gpt-4o-mini". Must match the model naming of the Chat with AI API.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['conversation'], operation: ['create'] } },
		options: [
			{
				displayName: 'Extra JSON Fields',
				name: 'jsonBody',
				type: 'json',
				default: '{}',
				description:
					'Additional top-level fields merged into the request body (e.g. custom fields 1min.AI introduces). "type" is always forced to UNIFY_CHAT_WITH_AI because the API rejects legacy conversation types.',
			},
		],
	},
];
