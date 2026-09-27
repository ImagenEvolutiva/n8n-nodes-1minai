import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import { aiFeatureFields } from './descriptions/AiFeatureDescription';
import { assetFields } from './descriptions/AssetDescription';
import { chatFields } from './descriptions/ChatDescription';
import { conversationFields } from './descriptions/ConversationDescription';
import { resultFields } from './descriptions/ResultDescription';
import {
	UNIFY_CHAT_TYPE,
	asRecord,
	buildMultipartFormData,
	extractConversationUuid,
	extractGeneratedText,
	oneMinAiApiRequest,
	parseJsonParameter,
} from './GenericFunctions';

/** Finds the aiRecord object in a 1min.AI response ({ aiRecord } wrapper). */
function findAiRecord(responseData: IDataObject): IDataObject | undefined {
	const direct = asRecord(responseData.aiRecord);
	if (direct) {
		return direct;
	}
	const nestedData = asRecord(responseData.data);
	return asRecord(nestedData?.aiRecord);
}

function recordStringField(record: IDataObject | undefined, field: string): string | undefined {
	const value = record?.[field];
	return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Builds the output item: convenience fields first, then the full raw API response. */
function buildOutput(
	response: IDataObject,
	extras: IDataObject,
	itemIndex: number,
): INodeExecutionData {
	return {
		json: { ...extras, ...response },
		pairedItem: { item: itemIndex },
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls GET /api/results/{resultId} until the record reaches a terminal status.
 * Returns the last known response if the timeout is reached (the record keeps its
 * current status, e.g. PROCESSING, so the workflow can decide what to do).
 */
async function pollUntilComplete(
	context: IExecuteFunctions,
	resultId: string,
	options: { pollIntervalSeconds?: number; pollTimeoutSeconds?: number },
	initialResponse: IDataObject,
): Promise<IDataObject> {
	const intervalMs = Math.max(1, Number(options.pollIntervalSeconds ?? 2)) * 1000;
	const timeoutMs = Math.max(intervalMs, Number(options.pollTimeoutSeconds ?? 120)) * 1000;
	const deadline = Date.now() + timeoutMs;

	let latest = initialResponse;
	while (Date.now() < deadline) {
		await sleep(intervalMs);
		latest = await oneMinAiApiRequest.call(
			context,
			'GET',
			`/api/results/${encodeURIComponent(resultId)}`,
		);
		const status = recordStringField(findAiRecord(latest), 'status');
		if (status === 'SUCCESS' || status === 'FAILURE' || status === 'FAILED') {
			return latest;
		}
	}
	return latest;
}

/** Builds the chat request body from the structured (simple prompt) fields. */
function buildChatBody(context: IExecuteFunctions, itemIndex: number): IDataObject {
	const model = context.getNodeParameter('model', itemIndex) as string;
	const prompt = context.getNodeParameter('prompt', itemIndex) as string;
	const conversationId = context.getNodeParameter('conversationId', itemIndex, '') as string;
	const additional = context.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const node = context.getNode();

	const promptObject: IDataObject = { prompt: prompt };
	if (conversationId.trim() !== '') {
		promptObject.conversationId = conversationId;
	}

	const settings: IDataObject = {};
	if (additional.webSearch === true) {
		settings.webSearchSettings = { webSearch: true };
	}
	if (additional.withMemories === true) {
		settings.withMemories = true;
	}
	const settingsJson = parseJsonParameter(
		additional.settingsJson,
		node,
		'Settings JSON',
		itemIndex,
	);
	// Explicit JSON keys win over the toggles above.
	for (const [key, value] of Object.entries(settingsJson)) {
		settings[key] = value;
	}
	if (Object.keys(settings).length > 0) {
		promptObject.settings = settings;
	}

	const attachmentsJson = parseJsonParameter(
		additional.attachmentsJson,
		node,
		'Attachments JSON',
		itemIndex,
	);
	if (Object.keys(attachmentsJson).length > 0) {
		promptObject.attachments = attachmentsJson;
	}

	const body: IDataObject = {
		type: UNIFY_CHAT_TYPE,
		model: model.trim(),
		promptObject,
	};

	const brandVoiceId = additional.brandVoiceId;
	if (typeof brandVoiceId === 'string' && brandVoiceId.trim() !== '') {
		body.brandVoiceId = brandVoiceId;
	}
	const metadataJson = parseJsonParameter(additional.metadataJson, node, 'Metadata JSON', itemIndex);
	if (Object.keys(metadataJson).length > 0) {
		body.metadata = metadataJson;
	}
	return body;
}

async function executeChat(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const inputMode = context.getNodeParameter('inputMode', itemIndex) as string;

	let body: IDataObject;
	if (inputMode === 'raw') {
		body = parseJsonParameter(
			context.getNodeParameter('jsonBody', itemIndex),
			context.getNode(),
			'JSON Body',
			itemIndex,
		);
		if (!body.type) {
			// The unified chat endpoint requires type UNIFY_CHAT_WITH_AI; inject it if omitted.
			body.type = UNIFY_CHAT_TYPE;
		}
	} else {
		body = buildChatBody(context, itemIndex);
	}

	const response = await oneMinAiApiRequest.call(context, 'POST', '/api/chat-with-ai', body);
	const { text } = extractGeneratedText(response);
	const extras: IDataObject = {
		// Always present so downstream references don't break between runs.
		generatedText: text ?? '',
	};
	const aiRecordUuid = recordStringField(findAiRecord(response), 'uuid');
	if (aiRecordUuid !== undefined) {
		extras.aiRecordUuid = aiRecordUuid;
	}
	return [buildOutput(response, extras, itemIndex)];
}

async function executeConversation(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const title = context.getNodeParameter('title', itemIndex) as string;
	const model = context.getNodeParameter('model', itemIndex) as string;
	const additional = context.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;

	// Core documented fields win over Extra JSON Fields; type is forced because the API
	// rejects legacy conversation types.
	const extraJson = parseJsonParameter(
		additional.jsonBody,
		context.getNode(),
		'Extra JSON Fields',
		itemIndex,
	);
	const body: IDataObject = {
		...extraJson,
		type: UNIFY_CHAT_TYPE,
		title,
		model: model.trim(),
	};

	const response = await oneMinAiApiRequest.call(context, 'POST', '/api/conversations', body);
	const extras: IDataObject = {};
	const conversationUuid = extractConversationUuid(response);
	if (conversationUuid !== undefined) {
		// Pass this as Conversation ID in Chat → Send Prompt for multi-turn context.
		extras.conversationUuid = conversationUuid;
	}
	return [buildOutput(response, extras, itemIndex)];
}

async function executeAiFeature(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const inputMode = context.getNodeParameter('inputMode', itemIndex) as string;

	let body: IDataObject;
	if (inputMode === 'raw') {
		body = parseJsonParameter(
			context.getNodeParameter('rawBodyJson', itemIndex),
			context.getNode(),
			'JSON Body',
			itemIndex,
		);
	} else {
		const featureType = (context.getNodeParameter('featureType', itemIndex) as string).trim();
		const model = (context.getNodeParameter('model', itemIndex) as string).trim();
		const promptObject = parseJsonParameter(
			context.getNodeParameter('promptObjectJson', itemIndex),
			context.getNode(),
			'Prompt Object (JSON)',
			itemIndex,
		);
		body = { type: featureType, model, promptObject };
		if (context.getNodeParameter('asyncMode', itemIndex, false) === true) {
			body.async = true;
		}
	}

	const response = await oneMinAiApiRequest.call(context, 'POST', '/api/features', body);

	const additional = context.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const waitForCompletion = additional.waitForCompletion === true;
	const aiRecord = findAiRecord(response);
	const aiRecordUuid = recordStringField(aiRecord, 'uuid');
	const status = recordStringField(aiRecord, 'status');

	let finalResponse = response;
	if (waitForCompletion && aiRecordUuid !== undefined && status === 'PROCESSING') {
		finalResponse = await pollUntilComplete(
			context,
			aiRecordUuid,
			additional as { pollIntervalSeconds?: number; pollTimeoutSeconds?: number },
			response,
		);
	}

	const finalRecord = findAiRecord(finalResponse);
	const extras: IDataObject = {
		generatedText: extractGeneratedText(finalResponse).text ?? '',
	};
	const finalUuid = recordStringField(finalRecord, 'uuid') ?? aiRecordUuid;
	if (finalUuid !== undefined) {
		extras.aiRecordUuid = finalUuid;
	}
	const finalStatus = recordStringField(finalRecord, 'status') ?? status;
	if (finalStatus !== undefined) {
		extras.status = finalStatus;
	}
	return [buildOutput(finalResponse, extras, itemIndex)];
}

async function executeAsset(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const binaryPropertyName = context.getNodeParameter(
		'binaryPropertyName',
		itemIndex,
	) as string;
	const item = context.helpers.assertBinaryData(itemIndex, binaryPropertyName);

	const buffer = await context.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const response = await oneMinAiApiRequest.call(context, 'POST', '/api/assets', undefined, {
		// Documented multipart field name: "asset" (Asset API).
		formData: buildMultipartFormData({
			asset: {
				value: buffer,
				options: {
					filename: item.fileName ?? 'upload',
					contentType: item.mimeType ?? 'application/octet-stream',
				},
			},
		}),
	});

	const extras: IDataObject = {};
	const asset = asRecord(response.asset);
	const assetKey = recordStringField(asset, 'key');
	if (assetKey !== undefined) {
		// Use this key in image features (promptObject.imageUrl) or chat attachments.
		extras.assetKey = assetKey;
	}
	return [buildOutput(response, extras, itemIndex)];
}

async function executeResult(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const resultId = (context.getNodeParameter('resultId', itemIndex) as string).trim();
	const additional = context.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;

	let response = await oneMinAiApiRequest.call(
		context,
		'GET',
		`/api/results/${encodeURIComponent(resultId)}`,
	);
	if (additional.waitForCompletion === true) {
		response = await pollUntilComplete(
			context,
			resultId,
			additional as { pollIntervalSeconds?: number; pollTimeoutSeconds?: number },
			response,
		);
	}

	const record = findAiRecord(response);
	const extras: IDataObject = {
		generatedText: extractGeneratedText(response).text ?? '',
	};
	const status = recordStringField(record, 'status');
	if (status !== undefined) {
		extras.status = status;
	}
	return [buildOutput(response, extras, itemIndex)];
}

const resourceField: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'AI Feature', value: 'aiFeature', description: 'Execute an AI feature request' },
		{ name: 'Asset', value: 'asset', description: 'Upload a binary file as an asset (experimental)' },
		{ name: 'Chat', value: 'chat', description: 'Send a chat prompt' },
		{ name: 'Conversation', value: 'conversation', description: 'Create a conversation for history' },
		{ name: 'Result', value: 'result', description: 'Retrieve an AI record by its ID' },
	],
	default: 'chat',
};

const operationField: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['aiFeature', 'asset', 'chat', 'conversation', 'result'],
		},
	},
	options: [
		{ name: 'Execute', value: 'execute', action: 'Execute an AI feature' },
		{ name: 'Upload', value: 'upload', action: 'Upload an asset' },
		{ name: 'Send Prompt', value: 'send', action: 'Send a chat prompt' },
		{ name: 'Create', value: 'create', action: 'Create a conversation' },
		{ name: 'Get', value: 'get', action: 'Get a result' },
	],
	default: 'send',
};

export class OneMinAi implements INodeType {
	description: INodeTypeDescription = {
		displayName: '1min.AI',
		name: 'oneMinAi',
		icon: { light: 'file:oneminai.svg', dark: 'file:oneminai.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description:
			'Chat, conversations, AI features, assets and results via the 1min.AI API (api.1min.ai)',
		defaults: { name: '1min.AI' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'oneMinAiApi',
				required: true,
			},
		],
		properties: [
			resourceField,
			operationField,
			...chatFields,
			...conversationFields,
			...aiFeatureFields,
			...assetFields,
			...resultFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				let executed: INodeExecutionData[];
				if (resource === 'chat' && operation === 'send') {
					executed = await executeChat(this, itemIndex);
				} else if (resource === 'conversation' && operation === 'create') {
					executed = await executeConversation(this, itemIndex);
				} else if (resource === 'aiFeature' && operation === 'execute') {
					executed = await executeAiFeature(this, itemIndex);
				} else if (resource === 'asset' && operation === 'upload') {
					executed = await executeAsset(this, itemIndex);
				} else if (resource === 'result' && operation === 'get') {
					executed = await executeResult(this, itemIndex);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The resource "${resource}" and operation "${operation}" combination is not supported.`,
						{ itemIndex },
					);
				}
				returnData.push(...executed);
			} catch (error) {
				// Honor the node's "Continue On Fail" setting; errors already carry the
				// 1min.AI error message via enrichApiError in GenericFunctions.
				if (this.continueOnFail()) {
					const message = error instanceof Error ? error.message : String(error);
					returnData.push({
						json: { error: message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
