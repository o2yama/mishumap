/**
 * Chrome/Edge 内蔵の Translator API（オンデバイス翻訳）で紹介文を en→ja 翻訳する。
 * 翻訳はユーザーのブラウザ内で完結し、翻訳文をサーバーに保持しない。
 * 非対応環境（Safari/Firefox/モバイル等）では translatorAvailable() が false になり、
 * 呼び出し側は翻訳ボタン自体を表示しない。
 *
 * 仕様: https://developer.chrome.com/docs/ai/translator-api （Chrome 138+ 安定版）
 * 注意: Translator.create() は transient user activation 必須のため、
 * 必ずクリックハンドラ内から呼ぶこと。
 */

interface TranslatorLike {
  translate(input: string): Promise<string>;
}

interface TranslatorStatic {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(opts: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: EventTarget) => void;
  }): Promise<TranslatorLike>;
}

const PAIR = { sourceLanguage: "en", targetLanguage: "ja" } as const;

let available = false;
let translatorPromise: Promise<TranslatorLike> | null = null;
const cache = new Map<string, string>();

function translatorStatic(): TranslatorStatic | undefined {
  return (globalThis as { Translator?: TranslatorStatic }).Translator;
}

export function translatorAvailable(): boolean {
  return available;
}

/** 起動時に一度だけ呼ぶ。結果は translatorAvailable() で同期参照できる */
export async function initTranslator(): Promise<void> {
  const T = translatorStatic();
  if (!T) return;
  try {
    available = (await T.availability(PAIR)) !== "unavailable";
  } catch {
    available = false;
  }
}

function getTranslator(onProgress?: (pct: number) => void): Promise<TranslatorLike> {
  if (!translatorPromise) {
    const T = translatorStatic();
    if (!T) return Promise.reject(new Error("Translator API unavailable"));
    translatorPromise = T.create({
      ...PAIR,
      // 初回は言語モデルのダウンロードが走ることがあるため進捗を通知する
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          onProgress?.(Math.round(((e as ProgressEvent).loaded ?? 0) * 100));
        });
      },
    });
    // 生成失敗（権限・ダウンロード中断等）は次のクリックで再試行できるようにする
    translatorPromise.catch(() => {
      translatorPromise = null;
    });
  }
  return translatorPromise;
}

export async function translateDescription(
  key: string,
  text: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const cached = cache.get(key);
  if (cached) return cached;
  const translator = await getTranslator(onProgress);
  const result = await translator.translate(text);
  cache.set(key, result);
  return result;
}
