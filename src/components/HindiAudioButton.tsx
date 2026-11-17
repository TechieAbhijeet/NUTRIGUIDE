import React, { useEffect, useId, useMemo, useState } from 'react';
import { Volume2, Square, AlertCircle } from 'lucide-react';
import { FoodEvaluation, FoodItem, RatingRule } from '../types';
import {
  buildHindiSentence,
  findHindiVoiceFromList,
  stopHindiSpeech,
  subscribeSpeechStop,
  waitForHindiVoice,
} from '../lib/hindiAudio';

interface HindiAudioButtonProps {
  food: FoodItem;
  evaluation: FoodEvaluation;
  ratingRules: RatingRule[];
  servings?: number;
}

export const HindiAudioButton: React.FC<HindiAudioButtonProps> = ({
  food,
  evaluation,
  ratingRules,
  servings = 1,
}) => {
  const instanceId = useId();
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = React.useRef(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);

  const sentence = useMemo(
    () => buildHindiSentence(food as FoodItem & Record<string, unknown>, evaluation, ratingRules, servings),
    [food, evaluation, ratingRules, servings]
  );

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Detect Hindi voice availability via voiceschanged
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceUnavailable(true);
      return;
    }

    const synth = window.speechSynthesis;
    const syncVoiceState = () => {
      const voices = synth.getVoices();
      if (voices.length > 0) {
        const hiVoice = findHindiVoiceFromList(voices);
        setVoiceUnavailable(!hiVoice);
      }
    };

    syncVoiceState();
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', syncVoiceState);
    }

    return () => {
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', syncVoiceState);
      }
    };
  }, []);

  // Stop speech cleanly if component unmounts or another component cancels speech
  useEffect(() => {
    const unsub = subscribeSpeechStop(() => {
      isPlayingRef.current = false;
      setIsPlaying(false);
    });
    return () => {
      unsub();
      if (isPlayingRef.current) {
        stopHindiSpeech();
      }
    };
  }, []);

  // Reset if food or sentence changes while playing
  useEffect(() => {
    if (isPlayingRef.current) {
      stopHindiSpeech();
    }
  }, [food.id, sentence]);

  const handleTogglePlay = async () => {
    if (isPlaying) {
      stopHindiSpeech();
      return;
    }

    const { supported, voice } = await waitForHindiVoice();
    if (!supported || !voice || typeof SpeechSynthesisUtterance === 'undefined') {
      setVoiceUnavailable(true);
      setIsPlaying(false);
      return;
    }

    setVoiceUnavailable(false);
    stopHindiSpeech();

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.voice = voice;
    utterance.lang = voice.lang || 'hi-IN';
    utterance.rate = 0.9;

    let active = true;
    setIsPlaying(true);

    utterance.onend = () => {
      if (active) {
        active = false;
        setIsPlaying(false);
      }
    };
    utterance.onerror = () => {
      if (active) {
        active = false;
        setIsPlaying(false);
      }
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsPlaying(false);
    }
  };

  return (
    <div className="space-y-2" data-audio-id={instanceId}>
      <button
        type="button"
        onClick={handleTogglePlay}
        aria-pressed={isPlaying}
        aria-label={isPlaying ? 'रोकें (Stop Hindi audio)' : 'सुनें (Listen in Hindi)'}
        className={`w-full h-[56px] min-h-[56px] px-4 rounded-2xl border-2 font-bold text-base inline-flex items-center justify-center gap-2.5 transition-colors ${
          isPlaying
            ? 'bg-amber-700 hover:bg-amber-800 border-amber-800 text-white'
            : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-950/80 border-emerald-700 text-emerald-950 dark:text-emerald-100'
        }`}
      >
        {isPlaying ? (
          <>
            <Square className="w-5 h-5 fill-current shrink-0" />
            <span>रोकें</span>
          </>
        ) : (
          <>
            <Volume2 className="w-5 h-5 shrink-0" />
            <span>सुनें</span>
          </>
        )}
      </button>

      <p
        lang="hi"
        className="text-sm text-stone-800 dark:text-stone-200 leading-relaxed px-1"
      >
        {sentence}
      </p>

      {voiceUnavailable && (
        <p className="text-xs font-semibold text-stone-700 dark:text-stone-300 inline-flex items-center gap-1.5 px-1">
          <AlertCircle className="w-4 h-4 text-stone-500 dark:text-stone-400 shrink-0" />
          <span>Hindi voice not available on this device</span>
        </p>
      )}
    </div>
  );
};
