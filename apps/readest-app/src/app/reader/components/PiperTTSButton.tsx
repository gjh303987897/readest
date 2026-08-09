import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { LoaderCircle, Pause, Square, Volume2 } from 'lucide-react';

import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import {
  getPiperReaderController,
  isPiperTextFormat,
  type PiperPlaybackSnapshot,
  type PiperReaderController,
  PiperSelectionRequiredError,
  resolvePiperVoiceId,
} from '@/services/tts/piperReader';
import {
  getMeloTTSReaderController,
  type MeloTTSPlaybackSnapshot,
  type MeloTTSReaderController,
} from '@/services/tts/meloTTSReader';
import {
  getSystemReaderController,
  type SystemPlaybackSnapshot,
  type SystemReaderController,
} from '@/services/tts/systemReader';
import { resolveMeloTTSModel } from '@/services/tts/meloTTSModels';
import { isTTSEngineLanguageCompatible, normalizeTTSEngine } from '@/services/tts/ttsEngine';
import { TTSSelectionRequiredError } from '@/services/tts/ttsReaderUtils';

interface PiperTTSButtonProps {
  bookKey: string;
}

type ReaderController = PiperReaderController | SystemReaderController | MeloTTSReaderController;
type ReaderSnapshot = PiperPlaybackSnapshot | SystemPlaybackSnapshot | MeloTTSPlaybackSnapshot;

const IDLE_SNAPSHOT: ReaderSnapshot = {
  status: 'idle',
  progress: 0,
  voiceId: null,
  error: null,
};

const noopSubscribe = () => () => {};
const getIdleSnapshot = () => IDLE_SNAPSHOT;

const PiperTTSButton: React.FC<PiperTTSButtonProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const iconSize = useResponsiveSize(18);
  const bookData = useBookDataStore((state) => state.getBookData(bookKey));
  const view = useReaderStore((state) => state.viewStates[bookKey]?.view);
  const storedTTSEngine = useSettingsStore((state) => state.settings.ttsEngine) as
    | string
    | undefined;
  const ttsEngine = normalizeTTSEngine(storedTTSEngine);
  const book = bookData?.book;
  const bookDoc = bookData?.bookDoc;
  const supported = !!book && isPiperTextFormat(book.format);
  const voiceId = resolvePiperVoiceId(bookDoc?.metadata.language);
  const meloModel = resolveMeloTTSModel(bookDoc?.metadata.language);
  const languageCompatible = isTTSEngineLanguageCompatible(ttsEngine, bookDoc?.metadata.language);

  const controller = useMemo<ReaderController | null>(() => {
    if (!supported || !view || !bookDoc) return null;
    if (ttsEngine === 'piper') {
      return voiceId ? getPiperReaderController(bookKey, view, bookDoc) : null;
    }
    if (ttsEngine === 'system') return getSystemReaderController(bookKey, view, bookDoc);
    if (ttsEngine === 'melotts' && meloModel) {
      return getMeloTTSReaderController(bookKey, view, bookDoc);
    }
    return null;
  }, [bookDoc, bookKey, meloModel, supported, ttsEngine, view, voiceId]);

  const snapshot = useSyncExternalStore<ReaderSnapshot>(
    controller?.subscribe ?? noopSubscribe,
    controller?.getSnapshot ?? getIdleSnapshot,
    getIdleSnapshot,
  );

  useEffect(() => {
    if (!controller) return;
    void controller.preload().catch((error: unknown) => {
      console.warn(`Failed to preload ${ttsEngine} TTS:`, error);
    });
  }, [controller, ttsEngine]);

  useEffect(() => () => controller?.dispose(), [controller]);

  if (!supported) return null;

  const isLoading = snapshot.status === 'loading';
  const isPlaying = snapshot.status === 'playing';
  const isPaused = snapshot.status === 'paused';
  const isError = snapshot.status === 'error';
  const meloUnsupportedMessage = _(
    'MeloTTS does not support this book language. Supported models: EN, ES, FR, ZH, JP, KR.',
  );
  const unavailable = !controller || (ttsEngine === 'piper' && !voiceId) || !languageCompatible;
  const label = unavailable
    ? !languageCompatible
      ? meloUnsupportedMessage
      : _('TTS not supported for this document')
    : isLoading
      ? _('Loading TTS voice')
      : isPlaying
        ? _('Pause audio')
        : isPaused
          ? _('Resume audio')
          : _('Play / Pause TTS');

  const handleToggle = () => {
    if (!controller || unavailable || isLoading) return;
    void controller.toggle().catch((error: unknown) => {
      eventDispatcher.dispatch('toast', {
        type:
          error instanceof PiperSelectionRequiredError || error instanceof TTSSelectionRequiredError
            ? 'info'
            : 'error',
        message:
          error instanceof PiperSelectionRequiredError || error instanceof TTSSelectionRequiredError
            ? _('Select text before starting TTS')
            : error instanceof Error
              ? error.message
              : String(error),
      });
    });
  };

  const handleStop = () => controller?.stop();

  return (
    <div className='flex items-center gap-1'>
      <button
        type='button'
        title={label}
        aria-label={label}
        className='btn btn-ghost h-8 min-h-8 w-8 p-0'
        disabled={isLoading || unavailable}
        onClick={handleToggle}
      >
        {isLoading ? (
          <LoaderCircle size={iconSize} className='animate-spin' aria-hidden='true' />
        ) : isPlaying ? (
          <Pause size={iconSize} aria-hidden='true' />
        ) : (
          <Volume2 size={iconSize} aria-hidden='true' />
        )}
      </button>
      {(isPlaying || isPaused || isError) && (
        <button
          type='button'
          title={_('Stop audio')}
          aria-label={_('Stop audio')}
          className='btn btn-ghost h-8 min-h-8 w-8 p-0'
          onClick={handleStop}
        >
          <Square size={iconSize - 2} aria-hidden='true' />
        </button>
      )}
    </div>
  );
};

export default PiperTTSButton;
