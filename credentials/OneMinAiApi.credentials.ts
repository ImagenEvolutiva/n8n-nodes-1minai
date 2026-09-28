import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * Credentials for the 1min.AI API.
 *
 * - Auth: an API key created in the 1min.AI dashboard (https://docs.1min.ai/docs/api/create-api-key).
 * - Every documented endpoint example sends `API-KEY: <key>`; the API intro page additionally
 *   documents `Authorization: Bearer <key>`. Both styles are supported; `API-KEY` is the default.
 * - Base URL defaults to `https://api.1min.ai` and can be overridden for testing/proxy setups.
 *   The credential test below always targets the production URL (a test request cannot read
 *   the baseUrl property); the 1min.AI community node itself honors the override.
 */
export class OneMinAiApi implements ICredentialType {
	name = 'oneMinAiApi';

	displayName = '1min.AI API';

	icon: Icon = {
		light: 'file:../nodes/OneMinAi/oneminai.svg',
		dark: 'file:../nodes/OneMinAi/oneminai.svg',
	};

	documentationUrl = 'https://docs.1min.ai/docs/api/create-api-key';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			noDataExpression: true,
			description:
				'Your 1min.AI API key. Create one in the 1min.AI dashboard (API section). It is sent as a secret header on every request.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			required: false,
			default: 'https://api.1min.ai',
			description:
				'Base URL of the 1min.AI API. Leave as default for production. Override only to test against a proxy or mock server.',
		},
		{
			displayName: 'Auth Header Style',
			name: 'authStyle',
			type: 'options',
			required: false,
			default: 'apiKeyHeader',
			options: [
				{
					// Header style used by every documented endpoint example on docs.1min.ai.
					name: 'API-KEY Header (Recommended)',
					value: 'apiKeyHeader',
				},
				{
					// Documented on the API intro page as the alternative.
					name: 'Authorization: Bearer',
					value: 'bearer',
				},
			],
			description:
				'Which header carries the API key. All endpoint examples in the 1min.AI docs use the API-KEY header; the intro page also documents Authorization: Bearer. When this credential is attached to the plain HTTP Request node, the API-KEY header style is used.',
		},
	];

	/**
	 * Static auth template so this credential can also be attached to the plain HTTP Request
	 * node for ad-hoc 1min.AI calls. The 1min.AI community node itself builds headers in code
	 * (see nodes/OneMinAi/GenericFunctions.ts) so it can honor the authStyle option.
	 */
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'API-KEY': '={{ $credentials.apiKey }}',
			},
		},
	};

	/**
	 * Connectivity test: GET /api/results/{id} with a well-formed but unknown UUID.
	 * Documented behavior (https://docs.1min.ai/docs/api/get-result): the endpoint responds
	 * `200` with `{ "aiRecord": null }` for unknown ids — no side effects, and it only
	 * succeeds when the API key is accepted. Every other documented endpoint either needs
	 * a known record id or has side effects, so none of them are safe to auto-test.
	 */
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.1min.ai',
			url: '/api/results/00000000-0000-0000-0000-000000000000',
			method: 'GET',
		},
	};
}
