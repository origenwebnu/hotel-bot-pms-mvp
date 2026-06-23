import OpenAI from 'openai';

let client: OpenAI | null = null;

export function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'sk-your-openai-key' || apiKey.trim() === '') {
    throw new Error(
      'OPENAI_API_KEY no configurada. Agrega tu key en /opt/hotel-bot/.env',
    );
  }
  if (!client) {
    client = new OpenAI({ apiKey });
  }
  return client;
}

export function isOpenAiConfigured(): boolean {
  const apiKey = process.env.OPENAI_API_KEY;
  return Boolean(apiKey && apiKey !== 'sk-your-openai-key' && apiKey.trim() !== '');
}
