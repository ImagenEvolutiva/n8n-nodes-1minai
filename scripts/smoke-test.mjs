#!/usr/bin/env node
/**
 * Smoke tests for n8n-nodes-1minai.
 *
 * Tiers:
 *   0. Offline — exercises the real compiled helpers (dist/) against the shapes
 *      documented at https://docs.1min.ai/docs/api. No network needed.
 *   1. Live auth-error probe — calls GET /api/results/{uuid} with a deliberately
 *      bogus key. Proves transport + auth headers reach the real API and that the
 *      1min.AI error body flows through enrichApiError(). Always runs.
 *   2. Live happy path — only when ONEMIN_API_KEY is set:
 *      conversation create → chat with conversationId → history lookup → asset upload.
 *
 * Usage:
 *   node scripts/smoke-test.mjs
 *   ONEMIN_API_KEY=your-key node scripts/smoke-test.mjs
 *
 * Exit code 0 = every executed tier passed.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const gf = require('../dist/nodes/OneMinAi/GenericFunctions.js');

const fakeNode = { name: 'SmokeTestNode' };
const results = [];

function record(name, pass, detail = '') {
	results.push({ name, pass });
	console.log(`${pass ? '  PASS' : '✗ FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(name, strictEqualsActual, expected) {
	// guard against misuse: assert(name, actual, expected)
	if (typeof expected === 'undefined' && typeof strictEqualsActual !== 'undefined') {
		console.error('assert() misuse: pass (name, actual, expected)');
		process.exit(2);
	}
	const pass = Object.is(strictEqualsActual, expected);
	record(name, pass, pass ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(strictEqualsActual)}`);
}

function assertTruthy(name, actual, detail = '') {
	record(name, Boolean(actual), detail || JSON.stringify(actual).slice(0, 120));
}

// ───────────────────────────── Tier 0: offline helpers ─────────────────────────────

function tierOffline() {
	console.log('\n── Tier 0: offline helper tests (dist/) — no network ──');

	// normalizeBaseUrl
	assert('normalizeBaseUrl: default when unset', gf.normalizeBaseUrl(undefined), gf.DEFAULT_BASE_URL);
	assert('normalizeBaseUrl: strips trailing slash', gf.normalizeBaseUrl('https://proxy.example.com/'), 'https://proxy.example.com');

	// buildAuthHeaders — default is the API-KEY header used by every endpoint doc example
	let h = gf.buildAuthHeaders({ apiKey: 'k-123' });
	assert('buildAuthHeaders: default sends API-KEY header', h['API-KEY'], 'k-123');
	assert('buildAuthHeaders: default omits Authorization', h.Authorization, undefined);
	h = gf.buildAuthHeaders({ apiKey: 'k-123', authStyle: 'bearer' }, { includeJsonContentType: true });
	assert('buildAuthHeaders: bearer mode sends Authorization', h.Authorization, 'Bearer k-123');
	assert('buildAuthHeaders: json content-type flag', h['Content-Type'], 'application/json');

	// buildMultipartBody — frame must be well-formed multipart/form-data
	const mp = gf.buildMultipartBody([
		{ name: 'asset', value: Buffer.from('hello asset'), filename: 'a.txt', contentType: 'text/plain' },
	]);
	const bodyText = mp.buffer.toString('utf8');
	const boundary = /boundary=(.+)$/.exec(mp.contentType)?.[1] ?? '';
	assertTruthy('buildMultipartBody: content-type carries boundary', boundary.length > 10, mp.contentType);
	record(
		'buildMultipartBody: opens with part boundary + disposition',
		bodyText.startsWith(`--${boundary}\r\nContent-Disposition: form-data; name="asset"; filename="a.txt"\r\n`),
	);
	record(
		'buildMultipartBody: closes with terminal boundary',
		bodyText.trimEnd().endsWith(`--${boundary}--`),
	);
	record('buildMultipartBody: embeds file payload', bodyText.includes('hello asset'));

	// extractGeneratedText — documented shape { aiRecord: { aiRecordDetail: { resultObject: [...] } } }
	let got = gf.extractGeneratedText({ aiRecord: { aiRecordDetail: { resultObject: ['Hello world'] } } });
	assert('extractGeneratedText: documented shape', got.text, 'Hello world');
	got = gf.extractGeneratedText({ aiRecord: { aiRecordDetail: { resultObject: 'solo string' } } });
	assert('extractGeneratedText: string resultObject', got.text, 'solo string');
	got = gf.extractGeneratedText({ data: { aiRecord: { aiRecordDetail: { resultObject: ['a', 'b'] } } } });
	assert('extractGeneratedText: nested under data', got.text, 'a\n\nb');
	got = gf.extractGeneratedText({ text: 'fallback text' });
	assert('extractGeneratedText: fallback field', got.text, 'fallback text');
	record('extractGeneratedText: unparseable stays undefined', gf.extractGeneratedText({}).text === undefined);

	// extractConversationUuid — docs say "the returned uuid" without pinning the JSON path
	assert('extractConversationUuid: root uuid', gf.extractConversationUuid({ uuid: 'u1' }), 'u1');
	assert('extractConversationUuid: conversation.uuid', gf.extractConversationUuid({ conversation: { uuid: 'u2' } }), 'u2');
	assert('extractConversationUuid: data.uuid', gf.extractConversationUuid({ data: { uuid: 'u3' } }), 'u3');
	record('extractConversationUuid: gives up gracefully', gf.extractConversationUuid({}) === undefined);

	// parseJsonParameter
	record('parseJsonParameter: empty string → {}', Object.keys(gf.parseJsonParameter('', fakeNode, 'f')).length === 0);
	record('parseJsonParameter: valid JSON string', gf.parseJsonParameter('{"a":1}', fakeNode, 'f').a === 1);
	record('parseJsonParameter: object passthrough', gf.parseJsonParameter({ a: 2 }, fakeNode, 'f').a === 2);
	try {
		gf.parseJsonParameter('{not json', fakeNode, 'Settings JSON');
		record('parseJsonParameter: invalid JSON throws field-scoped error', false);
	} catch (e) {
		record('parseJsonParameter: invalid JSON throws field-scoped error', String(e.message).includes('Settings JSON'), e.message);
	}
	try {
		gf.parseJsonParameter('[1,2]', fakeNode, 'f');
		record('parseJsonParameter: array rejected', false);
	} catch {
		record('parseJsonParameter: array rejected', true);
	}

	// enrichApiError — fake an axios-style failure carrying 1min.AI's documented error body
	try {
		const axiosLike = Object.assign(new Error('Request failed with status code 401'), {
			response: { status: 401, data: { success: false, error: { message: 'Invalid API key' } } },
		});
		const wrapped = gf.enrichApiError(fakeNode, axiosLike);
		const rendered = `${wrapped.message} ${wrapped.description ?? ''}`;
		record('enrichApiError: wraps unknown errors in NodeApiError', wrapped.constructor.name === 'NodeApiError', wrapped.constructor.name);
		record('enrichApiError: surfaces API error message', rendered.includes('Invalid API key'), rendered.slice(0, 120));
	} catch (e) {
		record('enrichApiError: wraps unknown errors in NodeApiError', false, String(e));
	}
}

// ───────────────────────────── Live call plumbing ─────────────────────────────

// Side-effect-free probe endpoint (documented in Get Result docs): unknown id → 200 { "aiRecord": null }
const RESULTS_UUID = '00000000-0000-0000-0000-000000000000';

async function liveCall(path, apiKey, { method = 'GET', body, authStyle } = {}) {
	const headers = gf.buildAuthHeaders({ apiKey, authStyle }, { includeJsonContentType: body !== undefined });
	const res = await fetch(`${gf.DEFAULT_BASE_URL}${path}`, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		/* non-JSON body */
	}
	return { status: res.status, json, text: text.slice(0, 400) };
}

// ─────────────────────── Tier 1: live transport + error path ───────────────────────

async function tierLiveErrorProbe() {
	console.log('\n── Tier 1: live probe with intentionally invalid key (expect 401) ──');
	let res;
	try {
		res = await liveCall(`/api/results/${RESULTS_UUID}`, 'smoke-test-INVALID-key');
	} catch (e) {
		record('live: api.1min.ai reachable', false, String(e));
		return false;
	}
	record('live: api.1min.ai reachable', true, `GET /api/results/{uuid} → HTTP ${res.status}`);
	if (res.status !== 401) {
		record('live: invalid key rejected with 401', false, `got ${res.status}: ${res.text}`);
		return false;
	}
	record('live: invalid key rejected with 401', true);

	// Feed the REAL 401 response body through the node's real error-enrichment code.
	try {
		const axiosLike = Object.assign(new Error(`Request failed with status code ${res.status}`), {
			response: { status: res.status, data: res.json ?? res.text },
		});
		const wrapped = gf.enrichApiError(fakeNode, axiosLike);
		const rendered = `${wrapped.message} ${wrapped.description ?? ''}`;
		record('live: real 401 body flows through enrichApiError', rendered.length > 0, rendered.slice(0, 140));
	} catch (e) {
		record('live: real 401 body flows through enrichApiError', false, String(e));
	}
	return true;
}

// ─────────────────────── Tier 2: live happy path (real key) ───────────────────────

async function tierLiveHappyPath(apiKey) {
	console.log('\n── Tier 2: live happy path with ONEMIN_API_KEY ──');

	// A. Key accepted? (documented side-effect-free endpoint: unknown id → 200 { aiRecord: null })
	const probe = await liveCall(`/api/results/${RESULTS_UUID}`, apiKey);
	if (probe.status === 401 || probe.status === 403) {
		record('happy: key accepted', false, `HTTP ${probe.status}: ${probe.text}`);
		return;
	}
	record('happy: key accepted', true, `GET /api/results/{uuid} → HTTP ${probe.status}`);

	// B. Create conversation (POST /api/conversations) + validate uuid extraction on the real body
	const conv = await liveCall('/api/conversations', apiKey, {
		method: 'POST',
		body: { type: gf.UNIFY_CHAT_TYPE, title: 'n8n smoke test', model: 'gpt-4o-mini' },
	});
	record('happy: POST /api/conversations 2xx', conv.status >= 200 && conv.status < 300, `HTTP ${conv.status}: ${conv.text}`);
	const conversationId = gf.extractConversationUuid(conv.json);
	assertTruthy('happy: conversationId extracted from real response', conversationId, JSON.stringify(conv.json).slice(0, 200));
	if (!conversationId) return;

	// C. Chat within that conversation (POST /api/chat-with-ai) + validate text extraction
	const chat = await liveCall('/api/chat-with-ai', apiKey, {
		method: 'POST',
		body: {
			type: gf.UNIFY_CHAT_TYPE,
			model: 'gpt-4o-mini',
			promptObject: { prompt: 'Reply with exactly: PONG', conversationId },
		},
	});
	record('happy: POST /api/chat-with-ai 2xx', chat.status >= 200 && chat.status < 300, `HTTP ${chat.status}: ${chat.text}`);
	const generated = gf.extractGeneratedText(chat.json);
	assertTruthy('happy: generated text extracted', generated.text !== undefined, `source=${generated.source ?? 'none'}`);
	record(
		'happy: model replied PONG',
		generated.text !== undefined && /pong/i.test(generated.text),
		(generated.text ?? '').slice(0, 120),
	);

	// D. History lookup — the conversation must now exist server-side
	const history = await liveCall(`/api/results/${conversationId}`, apiKey);
	record(
		'happy: GET /api/results/{conversationId} returns the record',
		history.status === 200 && JSON.stringify(history.json ?? {}).includes('aiRecord'),
		`HTTP ${history.status}`,
	);

	// E. Asset upload (experimental) — real multipart wire check of buildMultipartBody
	const mp = gf.buildMultipartBody([
		{
			name: 'asset',
			value: Buffer.from('n8n-nodes-1minai smoke test file\n', 'utf8'),
			filename: 'smoke.txt',
			contentType: 'text/plain',
		},
	]);
	try {
		const up = await fetch(`${gf.DEFAULT_BASE_URL}/api/assets`, {
			method: 'POST',
			headers: { 'API-KEY': apiKey, 'Content-Type': mp.contentType },
			body: mp.buffer,
		});
		const upText = (await up.text()).slice(0, 300);
		record('happy: POST /api/assets (multipart) 2xx', up.status >= 200 && up.status < 300, `HTTP ${up.status}: ${upText}`);
	} catch (e) {
		record('happy: POST /api/assets (multipart) 2xx', false, String(e));
	}
}

// ─────────────────────────────────── main ───────────────────────────────────

async function main() {
	const apiKey = process.env.ONEMIN_API_KEY?.trim();

	tierOffline();
	const probeOk = await tierLiveErrorProbe();
	if (apiKey) {
		if (probeOk) {
			await tierLiveHappyPath(apiKey);
		} else {
			console.log('\nTier 2 skipped — transport probe failed.');
		}
	} else {
		console.log('\nTier 2 skipped — set ONEMIN_API_KEY to run the live happy path.');
	}

	const failed = results.filter((r) => !r.pass).length;
	console.log(`\n${results.length - failed}/${results.length} checks passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error('Smoke test crashed:', e);
	process.exit(1);
});
