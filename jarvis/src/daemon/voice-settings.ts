/**
 * Voice Settings — Bridge between DB settings, encrypted keychain, and in-memory config for STT/TTS.
 */

import { getSetting, setSetting } from '../vault/settings.ts';
import { getSecret, setSecret, hasSecret } from '../vault/keychain.ts';
import type { JarvisConfig } from '../config/types.ts';

// Keychain key names
const KEY_STT_OPENAI = 'stt.openai.api_key';
const KEY_STT_GROQ = 'stt.groq.api_key';
const KEY_TTS_ELEVENLABS = 'tts.elevenlabs.api_key';

// DB setting keys
const SETTING_STT_PROVIDER = 'stt.provider';
const SETTING_STT_OPENAI_MODEL = 'stt.openai.model';
const SETTING_STT_GROQ_MODEL = 'stt.groq.model';
const SETTING_STT_LOCAL_ENDPOINT = 'stt.local.endpoint';
const SETTING_STT_LOCAL_MODEL = 'stt.local.model';

const SETTING_TTS_ENABLED = 'tts.enabled';
const SETTING_TTS_PROVIDER = 'tts.provider';
const SETTING_TTS_VOICE = 'tts.voice';
const SETTING_TTS_ELEVENLABS_MODEL = 'tts.elevenlabs.model';
const SETTING_TTS_ELEVENLABS_VOICE_ID = 'tts.elevenlabs.voice_id';

export type STTSettingsResponse = {
  provider: string;
  has_openai_key: boolean;
  has_groq_key: boolean;
  local_endpoint: string | null;
  local_server_type: string;
};

export type TTSSettingsResponse = {
  enabled: boolean;
  provider: string;
  voice: string;
  rate: string;
  volume: string;
  elevenlabs: {
    has_api_key: boolean;
    voice_id: string | null;
    model: string;
  } | null;
};

/**
 * Read STT settings from DB + keychain and return a dashboard-safe response.
 */
export async function getSTTSettings(config: JarvisConfig): Promise<STTSettingsResponse> {
  const provider = (await getSetting(SETTING_STT_PROVIDER)) ?? config.stt?.provider ?? 'openai';
  
  const localEndpoint = (await getSetting(SETTING_STT_LOCAL_ENDPOINT)) ?? config.stt?.local?.endpoint ?? 'http://localhost:8080';
  const localServerType = (await getSetting(SETTING_STT_LOCAL_MODEL)) ?? config.stt?.local?.server_type ?? 'whisper_cpp';

  const hasOpenaiKey = (await hasSecret(KEY_STT_OPENAI)) || !!config.stt?.openai?.api_key;
  const hasGroqKey = (await hasSecret(KEY_STT_GROQ)) || !!config.stt?.groq?.api_key;

  return {
    provider,
    has_openai_key: hasOpenaiKey,
    has_groq_key: hasGroqKey,
    local_endpoint: localEndpoint,
    local_server_type: localServerType,
  };
}

/**
 * Read TTS settings from DB + keychain and return a dashboard-safe response.
 */
export async function getTTSSettings(config: JarvisConfig): Promise<TTSSettingsResponse> {
  const enabled = ((await getSetting(SETTING_TTS_ENABLED)) ?? (config.tts?.enabled ? 'true' : 'false')) === 'true';
  const provider = (await getSetting(SETTING_TTS_PROVIDER)) ?? config.tts?.provider ?? 'edge';
  const voice = (await getSetting(SETTING_TTS_VOICE)) ?? config.tts?.voice ?? 'en-US-AriaNeural';
  const rate = (await getSetting('tts.rate')) ?? config.tts?.rate ?? '+0%';
  const volume = (await getSetting('tts.volume')) ?? config.tts?.volume ?? '1.0';

  const elModel = (await getSetting(SETTING_TTS_ELEVENLABS_MODEL)) ?? config.tts?.elevenlabs?.model ?? 'eleven_flash_v2_5';
  const elVoiceId = (await getSetting(SETTING_TTS_ELEVENLABS_VOICE_ID)) ?? config.tts?.elevenlabs?.voice_id ?? '';
  const hasElKey = (await hasSecret(KEY_TTS_ELEVENLABS)) || !!config.tts?.elevenlabs?.api_key;

  return {
    enabled,
    provider,
    voice,
    rate,
    volume,
    elevenlabs: { model: elModel, voice_id: elVoiceId || null, has_api_key: hasElKey },
  };
}

/**
 * Save STT settings to DB + keychain and update the in-memory config.
 */
export async function saveSTTSettings(
  config: JarvisConfig,
  body: {
    provider?: 'openai' | 'groq' | 'local';
    openai?: { api_key?: string; model?: string };
    groq?: { api_key?: string; model?: string };
    local?: { endpoint?: string; model?: string; server_type?: string };
  },
): Promise<void> {
  if (body.provider) {
    await setSetting(SETTING_STT_PROVIDER, body.provider);
    if (!config.stt) config.stt = { provider: body.provider };
    else config.stt.provider = body.provider;
  }

  if (body.openai) {
    if (body.openai.model) await setSetting(SETTING_STT_OPENAI_MODEL, body.openai.model);
    if (body.openai.api_key) await setSecret(KEY_STT_OPENAI, body.openai.api_key);
    if (!config.stt) config.stt = { provider: 'openai' };
    config.stt.openai = {
      ...config.stt.openai,
      model: body.openai.model ?? config.stt.openai?.model ?? 'whisper-1',
      api_key: body.openai.api_key ?? config.stt.openai?.api_key ?? '',
    };
  }

  if (body.groq) {
    if (body.groq.model) await setSetting(SETTING_STT_GROQ_MODEL, body.groq.model);
    if (body.groq.api_key) await setSecret(KEY_STT_GROQ, body.groq.api_key);
    if (!config.stt) config.stt = { provider: 'groq' };
    config.stt.groq = {
      ...config.stt.groq,
      model: body.groq.model ?? config.stt.groq?.model ?? 'whisper-large-v3-turbo',
      api_key: body.groq.api_key ?? config.stt.groq?.api_key ?? '',
    };
  }

  if (body.local) {
    if (body.local.endpoint) await setSetting(SETTING_STT_LOCAL_ENDPOINT, body.local.endpoint);
    if (body.local.model) await setSetting(SETTING_STT_LOCAL_MODEL, body.local.model); 
    if (body.local.server_type) await setSetting(SETTING_STT_LOCAL_MODEL, body.local.server_type);
    if (!config.stt) config.stt = { provider: 'local' };
    config.stt.local = {
      ...config.stt.local,
      endpoint: body.local.endpoint ?? config.stt.local?.endpoint ?? 'http://localhost:8080',
      server_type: (body.local.server_type as "whisper_cpp" | "openai_compatible") ?? config.stt.local?.server_type ?? 'whisper_cpp',
    };
  }
}

/**
 * Save TTS settings to DB + keychain and update the in-memory config.
 */
export async function saveTTSSettings(
  config: JarvisConfig,
  body: {
    enabled?: boolean;
    provider?: 'edge' | 'elevenlabs';
    voice?: string;
    rate?: string;
    volume?: string;
    elevenlabs?: { api_key?: string; model?: string; voice_id?: string };
  },
): Promise<void> {
  if (body.enabled !== undefined) {
    await setSetting(SETTING_TTS_ENABLED, body.enabled ? 'true' : 'false');
    if (!config.tts) config.tts = { enabled: body.enabled };
    else config.tts.enabled = body.enabled;
  }

  if (body.provider) {
    await setSetting(SETTING_TTS_PROVIDER, body.provider);
    if (!config.tts) config.tts = { enabled: true, provider: body.provider };
    else config.tts.provider = body.provider;
  }

  if (body.voice) {
    await setSetting(SETTING_TTS_VOICE, body.voice);
    if (!config.tts) config.tts = { enabled: true, voice: body.voice };
    else config.tts.voice = body.voice;
  }

  if (body.rate) {
    await setSetting('tts.rate', body.rate);
    if (!config.tts) config.tts = { enabled: true, rate: body.rate };
    else config.tts.rate = body.rate;
  }

  if (body.volume) {
    await setSetting('tts.volume', body.volume);
    if (!config.tts) config.tts = { enabled: true, volume: body.volume };
    else config.tts.volume = body.volume;
  }

  if (body.elevenlabs) {
    if (body.elevenlabs.model) await setSetting(SETTING_TTS_ELEVENLABS_MODEL, body.elevenlabs.model);
    if (body.elevenlabs.voice_id) await setSetting(SETTING_TTS_ELEVENLABS_VOICE_ID, body.elevenlabs.voice_id);
    if (body.elevenlabs.api_key) await setSecret(KEY_TTS_ELEVENLABS, body.elevenlabs.api_key);
    
    if (!config.tts) config.tts = { enabled: true, provider: 'elevenlabs' };
    config.tts.elevenlabs = {
      ...config.tts.elevenlabs,
      model: body.elevenlabs.model ?? config.tts.elevenlabs?.model ?? 'eleven_flash_v2_5',
      voice_id: body.elevenlabs.voice_id ?? config.tts.elevenlabs?.voice_id ?? '',
      api_key: body.elevenlabs.api_key ?? config.tts.elevenlabs?.api_key ?? '',
    };
  }
}

/**
 * helper to filter out masking placeholders
 */
function resolveKey(keychainValue: string | null, configValue: string | undefined): string | null {
  if (keychainValue) return keychainValue;
  if (configValue && configValue !== 'MASKED_SECURE_VAULT') return configValue;
  return null;
}

/**
 * Merge DB/keychain settings into config at startup.
 */
export async function mergeVoiceSettingsIntoConfig(config: JarvisConfig): Promise<void> {
  const dbSttProvider = (await getSetting(SETTING_STT_PROVIDER)) as any;
  if (dbSttProvider) {
    if (!config.stt) config.stt = { provider: dbSttProvider };
    else config.stt.provider = dbSttProvider;
  }

  const keychainSttOpenaiKey = await getSecret(KEY_STT_OPENAI);
  const dbSttOpenaiModel = await getSetting(SETTING_STT_OPENAI_MODEL);
  if (keychainSttOpenaiKey || dbSttOpenaiModel || config.stt?.openai) {
    if (!config.stt!.openai) config.stt!.openai = { api_key: '', model: 'whisper-1' };
    config.stt!.openai = {
      ...config.stt!.openai,
      api_key: resolveKey(keychainSttOpenaiKey, config.stt!.openai?.api_key) ?? '',
      model: dbSttOpenaiModel ?? config.stt!.openai?.model ?? 'whisper-1',
    };
  }

  const keychainSttGroqKey = await getSecret(KEY_STT_GROQ);
  const dbSttGroqModel = await getSetting(SETTING_STT_GROQ_MODEL);
  if (keychainSttGroqKey || dbSttGroqModel || config.stt?.groq) {
    if (!config.stt!.groq) config.stt!.groq = { api_key: '', model: 'whisper-large-v3-turbo' };
    config.stt!.groq = {
      ...config.stt!.groq,
      api_key: resolveKey(keychainSttGroqKey, config.stt!.groq?.api_key) ?? '',
      model: dbSttGroqModel ?? config.stt!.groq?.model ?? 'whisper-large-v3-turbo',
    };
  }

  const dbTtsEnabled = await getSetting(SETTING_TTS_ENABLED);
  if (dbTtsEnabled) {
    if (!config.tts) config.tts = { enabled: dbTtsEnabled === 'true' };
    else config.tts.enabled = dbTtsEnabled === 'true';
  }

  const dbTtsProvider = (await getSetting(SETTING_TTS_PROVIDER)) as any;
  if (dbTtsProvider) {
    if (!config.tts) config.tts = { enabled: true, provider: dbTtsProvider };
    else config.tts.provider = dbTtsProvider;
  }

  const dbTtsVoice = await getSetting(SETTING_TTS_VOICE);
  if (dbTtsVoice) {
    if (!config.tts) config.tts = { enabled: true, voice: dbTtsVoice };
    else config.tts.voice = dbTtsVoice;
  }

  const keychainTtsElKey = await getSecret(KEY_TTS_ELEVENLABS);
  if (keychainTtsElKey || config.tts?.elevenlabs) {
    if (!config.tts!.elevenlabs) config.tts!.elevenlabs = { api_key: '' };
    config.tts!.elevenlabs.api_key = resolveKey(keychainTtsElKey, config.tts!.elevenlabs?.api_key) ?? '';
  }
}
