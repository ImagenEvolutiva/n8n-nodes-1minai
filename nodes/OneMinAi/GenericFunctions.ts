import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	JsonObject,
} from 'n8n-workflow';

/** Documented base URL (https://docs.1min.ai/docs/api/intro#base-url). */
export const DEFAULT_BASE_URL = 'https://api.1min.ai';

/**
 * Conversation/request type for the unified chat endpoint.
 * Docs: legacy types (CHAT_WITH_AI, ...) are deprecated; use UNIFY_CHAT_WITH_AI.
 */
export const UNIFY_CHAT_TYPE = 'UNIFY_CHAT_WITH_AI';

export interface OneMinAiCredentials {
	apiKey: string;
	baseUrl?: string;
	authStyle?: string;
}

type ApiMethod = 'GET' | 'POST';

export function asRecord(value: unknown): IDataObject | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as IDataObject)
		: undefined;
}

export function normalizeBaseUrl(rawUrl: string | undefined): string {
	const trimmed = (rawUrl ?? '').trim().replace(/\/+$/, '');
	return trimmed === '' ? DEFAULT_BASE_URL : trimmed;
}

/**
 * Builds the request headers for a 1min.AI call.
 *
 * The concrete endpoint docs (Chat with AI, AI Feature, Asset, Get Result) all use the
 * `API-KEY: <key>` header; the API intro page also documents `Authorization: Bearer <key>`.
 * Both styles are supported; `API-KEY` is the default.
 */
export function buildAuthHeaders(
	credentials: OneMinAiCredentials,
	options: { includeJsonContentType?: boolean } = {},
): Record<string, string> {
	const headers: Record<string, string> = {};
	if (options.includeJsonContentType) {
		headers['Content-Type'] = 'application/json';
	}
	if (credentials.authStyle === 'bearer') {
		headers.Authorization = `Bearer ${credentials.apiKey}`;
	} else {
		headers['API-KEY'] = credentials.apiKey;
	}
	return headers;
}

export async function getCredentialsOrThrow(
	context: IExecuteFunctions | ILoadOptionsFunctions,
): Promise<OneMinAiCredentials> {
	const credentials = (await context.getCredentials('oneMinAiApi')) as unknown as OneMinAiCredentials;
	if (!credentials || typeof credentials.apiKey !== 'string' || credentials.apiKey.trim() === '') {
		throw new NodeOperationError(context.getNode(), 'No API key set in the 1min.AI credentials.');
	}
	return credentials;
}

/** Digs a human-readable message out of an error body ({ error: { message } }, { message }, ...). */
function pickErrorMessage(candidate: unknown, depth = 0): string | undefined {
	if (depth > 3 || candidate === null || candidate === undefined) {
		return undefined;
	}
	if (typeof candidate === 'string') {
		const trimmed = candidate.trim();
		return trimmed === '' ? undefined : trimmed;
	}
	const record = asRecord(candidate);
	if (record) {
		for (const key of ['message', 'error', 'detail']) {
			const nested = pickErrorMessage(record[key], depth + 1);
			if (nested !== undefined) {
				return nested;
			}
		}
	}
	return undefined;
}

/**
 * Wraps API failures so the 1min.AI error body shows up in the n8n error UI.
 * `NodeApiError` already extracts `response.data.message` / `response.data.error.message`
 * (1min.AI's documented `{ success: false, error: { message } }` format) into the error
 * description and status code into the message; the explicit description only covers
 * shapes its heuristics miss.
 */
export function enrichApiError(node: INode, error: unknown): Error {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		return error;
	}
	if (error instanceof Error) {
		const responseBody = asRecord(
			(error as unknown as { response?: { data?: unknown } }).response?.data,
		);
		return new NodeApiError(node, error as unknown as JsonObject, {
			description: responseBody ? pickErrorMessage(responseBody) : undefined,
		});
	}
	return new Error(`1min.AI request failed: ${String(error)}`);
}

/** A single multipart field: either a plain string value or a file part. */
export interface MultipartField {
	name: string;
	value: string | Buffer;
	filename?: string;
	contentType?: string;
}

/**
 * A ready-to-send multipart/form-data body: the framed payload plus the exact
 * Content-Type header value (including the boundary) that must accompany it.
 */
export interface MultipartBody {
	buffer: Buffer;
	contentType: string;
}

/** Generates a MIME boundary; the alphanumeric prefix makes collision with content unlikely. */
function generateBoundary(): string {
	let boundary = '----n8n1minai';
	for (let i = 0; i < 24; i++) {
		boundary += Math.floor(Math.random() * 16).toString(16);
	}
	return boundary;
}

/**
 * Frames a multipart/form-data body by hand (Asset API, documented field `asset`).
 *
 * Done manually because n8n Cloud forbids importing the `form-data` package, and the
 * spec-built-in FormData lacks methods n8n's request pipeline expects. A raw Buffer body
 * plus an explicit `multipart/form-data; boundary=...` header flows cleanly through
 * n8n's underlying axios layer.
 */
export function buildMultipartBody(fields: MultipartField[]): MultipartBody {
	const boundary = generateBoundary();
	const chunks: Buffer[] = [];
	for (const field of fields) {
		const disposition = `form-data; name="${field.name}"${
			field.filename !== undefined ? `; filename="${field.filename}"` : ''
		}`;
		const partHeaders =
			`--${boundary}\r\n` +
			`Content-Disposition: ${disposition}\r\n` +
			(field.contentType !== undefined ? `Content-Type: ${field.contentType}\r\n` : '') +
			'\r\n';
		chunks.push(Buffer.from(partHeaders, 'utf8'));
		chunks.push(typeof field.value === 'string' ? Buffer.from(field.value, 'utf8') : field.value);
		chunks.push(Buffer.from('\r\n', 'utf8'));
	}
	chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
	return { buffer: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

/**
 * Central request helper shared by every operation.
 *
 * TODO(streaming): the Chat with AI API also supports `?isStreaming=true` (SSE with
 * `content` / `result` / `done` / `error` events). n8n's httpRequest helper buffers the whole
 * response, so incremental streaming cannot be surfaced properly from a community node; v1
 * always uses the non-streaming endpoint. See README → Known gaps.
 */
export async function oneMinAiApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: ApiMethod,
	endpoint: string,
	body?: IDataObject,
	multipart?: MultipartBody,
): Promise<IDataObject> {
	const credentials = await getCredentialsOrThrow(this);

	const headers = buildAuthHeaders(credentials, {
		includeJsonContentType: multipart === undefined && body !== undefined,
	});
	if (multipart !== undefined) {
		// The boundary must travel in the header; axios does not derive it from a raw Buffer.
		headers['Content-Type'] = multipart.contentType;
	}

	const requestOptions: IHttpRequestOptions = {
		method,
		url: `${normalizeBaseUrl(credentials.baseUrl)}${endpoint}`,
		headers,
	};

	if (multipart !== undefined) {
		// Multipart upload (Asset API): pre-framed body, boundary declared in Content-Type.
		requestOptions.body = multipart.buffer;
	} else if (body !== undefined) {
		requestOptions.body = body;
	}

	try {
		return (await this.helpers.httpRequest(requestOptions)) as IDataObject;
	} catch (error) {
		throw enrichApiError(this.getNode(), error);
	}
}

/**
 * Parses a JSON-typed node parameter into an object. Accepts values that are already objects
 * (expressions) as well as JSON strings, and fails with a precise, field-scoped error message.
 */
export function parseJsonParameter(
	value: unknown,
	node: INode,
	fieldName: string,
	itemIndex?: number,
): IDataObject {
	if (value === undefined || value === null || value === '') {
		return {};
	}
	if (typeof value === 'object') {
		return value as IDataObject;
	}
	if (typeof value === 'string') {
		let parsed: unknown;
		try {
			parsed = JSON.parse(value);
		} catch {
			const preview = value.length > 80 ? `${value.slice(0, 80)}…` : value;
			throw new NodeOperationError(
				node,
				`The "${fieldName}" field contains invalid JSON: ${preview}`,
				{ itemIndex },
			);
		}
		const record = asRecord(parsed);
		if (!record) {
			throw new NodeOperationError(
				node,
				`The "${fieldName}" field must be a JSON object, e.g. {"key": "value"}.`,
				{ itemIndex },
			);
		}
		return record;
	}
	throw new NodeOperationError(node, `The "${fieldName}" field must be a JSON object.`, {
		itemIndex,
	});
}

/** Maps one `resultObject` entry to a string (entries are strings in the docs; be tolerant anyway). */
function resultEntryToString(entry: unknown): string | undefined {
	if (typeof entry === 'string') {
		return entry;
	}
	const record = asRecord(entry);
	if (record) {
		for (const key of ['text', 'content', 'message', 'url', 'imageUrl']) {
			const value = record[key];
			if (typeof value === 'string' && value !== '') {
				return value;
			}
		}
	}
	return undefined;
}

export interface ExtractedText {
	text?: string;
	source?: string;
}

/**
 * Tolerant extraction of the generated text from a 1min.AI response.
 *
 * Documented shape (Chat with AI / AI Feature / Get Result):
 *   { aiRecord: { aiRecordDetail: { resultObject: string[] } } }
 * Fallbacks keep the node usable if 1min.AI wraps or renames fields over time; the raw
 * response is always returned as-is alongside the extracted convenience field.
 */
export function extractGeneratedText(responseData: unknown): ExtractedText {
	const root = asRecord(responseData);
	if (!root) {
		return {};
	}
	const nestedData = asRecord(root.data);
	const aiRecord = asRecord(root.aiRecord) ?? asRecord(nestedData?.aiRecord);
	const detail =
		asRecord(aiRecord?.aiRecordDetail) ??
		asRecord(nestedData?.aiRecordDetail) ??
		asRecord(root.aiRecordDetail);

	if (detail && Array.isArray(detail.resultObject)) {
		const parts = (detail.resultObject as unknown[])
			.map(resultEntryToString)
			.filter((part): part is string => part !== undefined);
		if (parts.length > 0) {
			return { text: parts.join('\n\n'), source: 'aiRecord.aiRecordDetail.resultObject' };
		}
	}
	if (detail && typeof detail.resultObject === 'string' && detail.resultObject !== '') {
		return { text: detail.resultObject, source: 'aiRecord.aiRecordDetail.resultObject' };
	}

	const containers = [root, aiRecord ?? {}, nestedData ?? {}];
	for (const key of ['text', 'content', 'result', 'output', 'message']) {
		for (const container of containers) {
			const value = container[key];
			if (typeof value === 'string' && value.trim() !== '') {
				return { text: value, source: key };
			}
		}
	}
	return {};
}

/**
 * Tolerant lookup of a conversation id from a POST /api/conversations response. The docs say to
 * use "the returned uuid" as promptObject.conversationId without pinning the exact JSON path,
 * so check the likely locations and give up gracefully (raw response is still returned).
 */
export function extractConversationUuid(responseData: unknown): string | undefined {
	const root = asRecord(responseData);
	if (!root) {
		return undefined;
	}
	const conversation = asRecord(root.conversation);
	const nestedData = asRecord(root.data);
	const aiRecord = asRecord(root.aiRecord);
	const candidates: unknown[] = [
		root.uuid,
		conversation?.uuid,
		conversation?.id,
		root.id,
		nestedData?.uuid,
		aiRecord?.conversationId,
	];
	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim() !== '') {
			return candidate;
		}
	}
	return undefined;
}
