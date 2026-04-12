import type {
  LocalizedText,
  SourceAudioAsset,
  SourceListeningChoice,
  SourceListeningItem,
  SourceUnit,
  SourceWorkbookExercise,
} from "@/types/curriculum";
import { resolveListeningChoiceImagePath } from "./listening-images";

export type CurriculumWarning = {
  code: string;
  message: string;
};

type ResolvedListeningItems = {
  items: SourceListeningItem[];
  warnings: CurriculumWarning[];
  usedLegacyAdapter: boolean;
};

function text(value: string): LocalizedText {
  return {
    en: value,
    vi: value,
  };
}

function stringifyAnswer(value: string | string[]) {
  return Array.isArray(value) ? value.join(" ") : value;
}

function listAnswerValues(value: string | string[]) {
  return Array.isArray(value) ? value : [value];
}

function hasText(value: string | undefined) {
  return Boolean(value?.trim());
}

function getChoiceIds(choices: SourceListeningChoice[] | undefined) {
  return new Set((choices ?? []).map((choice) => choice.id));
}

function createWarning(code: string, message: string): CurriculumWarning {
  return {
    code,
    message,
  };
}

function hasMissingClipBounds(item: SourceListeningItem) {
  return typeof item.clipStartMs !== "number" || typeof item.clipEndMs !== "number";
}

function getClipDurationMs(item: SourceListeningItem) {
  if (typeof item.clipStartMs !== "number" || typeof item.clipEndMs !== "number") {
    return null;
  }

  return item.clipEndMs - item.clipStartMs;
}

function assertListeningItemAudio(item: SourceListeningItem, source: SourceUnit) {
  if (item.audioAssetId && item.tts) {
    throw new Error(`${item.id} must not define both audioAssetId and tts.`);
  }

  if (!item.audioAssetId && !item.tts) {
    throw new Error(`${item.id} must define exactly one listening audio source.`);
  }

  if (
    item.audioAssetId &&
    !source.workbook.audioAssets.some((asset) => asset.id === item.audioAssetId)
  ) {
    throw new Error(`${item.id} references missing audio asset ${item.audioAssetId}.`);
  }
}

function assertSingleAnswerTarget(item: SourceListeningItem) {
  const answerTargetCount =
    (item.correctChoiceId ? 1 : 0) +
    (hasText(item.correctText) || (item.acceptedAnswers?.length ?? 0) > 0 ? 1 : 0) +
    ((item.correctOrderChoiceIds?.length ?? 0) > 0 ? 1 : 0);

  if (answerTargetCount !== 1) {
    throw new Error(`${item.id} must define exactly one answer target.`);
  }
}

function assertListeningChoices(item: SourceListeningItem) {
  const choiceIds = getChoiceIds(item.choices);

  if (item.type === "yes_no") {
    if (!item.choices || item.choices.length !== 2) {
      throw new Error(`${item.id} yes_no items must define exactly 2 choices.`);
    }
  }

  if (
    item.type === "multiple_choice" ||
    item.type === "choose_image" ||
    item.type === "order_step"
  ) {
    if (!item.choices || item.choices.length < 2) {
      throw new Error(`${item.id} must define at least 2 choices.`);
    }
  }

  if (
    item.type === "choose_image" &&
    item.choices?.some((choice) => !resolveListeningChoiceImagePath(choice))
  ) {
    throw new Error(`${item.id} choose_image items require image-backed choices.`);
  }

  if (item.correctChoiceId && !choiceIds.has(item.correctChoiceId)) {
    throw new Error(`${item.id} correctChoiceId must point to an existing choice.`);
  }

  if (item.correctOrderChoiceIds?.length) {
    if (!item.choices || item.choices.length < 2) {
      throw new Error(`${item.id} order_step items require choices.`);
    }

    if (item.correctOrderChoiceIds.some((choiceId) => !choiceIds.has(choiceId))) {
      throw new Error(`${item.id} correctOrderChoiceIds must point to existing choices.`);
    }
  }
}

function assertListeningAnswers(item: SourceListeningItem) {
  if (item.type === "fill_blank") {
    if (!hasText(item.correctText) && (item.acceptedAnswers?.length ?? 0) === 0) {
      throw new Error(`${item.id} fill_blank items require correctText or acceptedAnswers.`);
    }
  }

  if (
    item.type === "multiple_choice" ||
    item.type === "choose_image" ||
    item.type === "yes_no"
  ) {
    if (!item.correctChoiceId) {
      throw new Error(`${item.id} ${item.type} items require correctChoiceId.`);
    }
  }

  if (item.type === "order_step" && (item.correctOrderChoiceIds?.length ?? 0) < 2) {
    throw new Error(`${item.id} order_step items require correctOrderChoiceIds.`);
  }
}

function assertListeningPrompt(item: SourceListeningItem) {
  if (!item.prompt.en.trim() || !item.prompt.vi.trim()) {
    throw new Error(`${item.id} is missing prompt text.`);
  }
}

function assertListeningClipBounds(item: SourceListeningItem) {
  if (item.tts && (typeof item.clipStartMs === "number" || typeof item.clipEndMs === "number")) {
    throw new Error(`${item.id} TTS-backed items must not define clip bounds.`);
  }

  const hasStart = typeof item.clipStartMs === "number";
  const hasEnd = typeof item.clipEndMs === "number";

  if (hasStart !== hasEnd) {
    throw new Error(`${item.id} must provide both clipStartMs and clipEndMs together.`);
  }

  if (hasStart && hasEnd && item.clipStartMs! >= item.clipEndMs!) {
    throw new Error(`${item.id} clipStartMs must be less than clipEndMs.`);
  }
}

export function validateSourceListeningItem(item: SourceListeningItem, source: SourceUnit) {
  assertListeningItemAudio(item, source);
  assertListeningPrompt(item);
  assertListeningClipBounds(item);
  assertSingleAnswerTarget(item);
  assertListeningChoices(item);
  assertListeningAnswers(item);
}

function adaptLegacyChoice(
  exercise: SourceWorkbookExercise,
  option: NonNullable<SourceWorkbookExercise["options"]>[number],
): SourceListeningChoice {
  return {
    id: `${exercise.id}-${option.id}`,
    text: option.label ?? text(option.id),
    imagePath: option.imagePath,
  };
}

function adaptLegacyListeningExercise(
  exercise: SourceWorkbookExercise,
  audioAsset: SourceAudioAsset | undefined,
): SourceListeningItem {
  const exerciseChoices =
    exercise.options?.map((option) => adaptLegacyChoice(exercise, option)) ?? undefined;
  const metadataChoices =
    Array.isArray(exercise.metadata.choices) &&
    exercise.metadata.choices.every((value) => typeof value === "string")
      ? (exercise.metadata.choices as string[]).map((value, index) => ({
          id: `${exercise.id}-choice-${index + 1}`,
          text: text(value),
        }))
      : undefined;
  const correctOption = exercise.options?.find((option) => option.correct);
  const listeningType = exercise.options?.length
    ? exercise.options.some((option) => option.imagePath)
      ? "choose_image"
      : "multiple_choice"
    : "fill_blank";

  return {
    id: `${exercise.id}-legacy`,
    sourceExerciseIds: [exercise.id],
    audioAssetId: exercise.audioAssetId,
    type: listeningType,
    prompt: exercise.prompt,
    transcriptKo: audioAsset?.transcript,
    translation: exercise.localizedText,
    choices: listeningType === "fill_blank" ? metadataChoices : exerciseChoices,
    correctChoiceId:
      listeningType === "fill_blank" || !correctOption
        ? undefined
        : `${exercise.id}-${correctOption.id}`,
    correctText: listeningType === "fill_blank" ? stringifyAnswer(exercise.answer) : undefined,
    acceptedAnswers:
      listeningType === "fill_blank" ? listAnswerValues(exercise.answer) : undefined,
    coverageTags: exercise.coverageTags,
    difficulty: "easy",
    pages: exercise.pages,
    sourceRef: exercise.sourceRef,
    needsReview: exercise.needsReview,
  };
}

function adaptLegacyWorkbookListening(source: SourceUnit): ResolvedListeningItems {
  const warnings: CurriculumWarning[] = [];
  const audioAssetsById = new Map(
    source.workbook.audioAssets.map((asset) => [asset.id, asset] as const),
  );
  const items = source.workbook.exercises
    .filter((exercise) => exercise.exerciseType === "listening" && Boolean(exercise.audioAssetId))
    .map((exercise) => {
      const audioAsset = exercise.audioAssetId
        ? audioAssetsById.get(exercise.audioAssetId)
        : undefined;
      const item = adaptLegacyListeningExercise(exercise, audioAsset);

      warnings.push(
        createWarning(
          "legacy-listening-adapter",
          `${source.unitId}:${item.id} was adapted from a legacy workbook listening exercise.`,
        ),
      );

      if (hasMissingClipBounds(item)) {
        warnings.push(
          createWarning(
            "legacy-listening-full-audio",
            `${source.unitId}:${item.id} has no clip bounds and will replay the full source audio.`,
          ),
        );
      }

      if (!hasText(audioAsset?.transcript) && !hasText(item.transcriptKo)) {
        warnings.push(
          createWarning(
            "legacy-listening-missing-transcript",
            `${source.unitId}:${item.id} is missing transcript metadata for listening validation.`,
          ),
        );
      }

      return item;
    });

  return {
    items,
    warnings,
    usedLegacyAdapter: true,
  };
}

function collectListeningWarnings(
  source: SourceUnit,
  items: SourceListeningItem[],
  usedLegacyAdapter: boolean,
) {
  const warnings: CurriculumWarning[] = [];
  const audioAssetsById = new Map(
    source.workbook.audioAssets.map((asset) => [asset.id, asset] as const),
  );

  if (usedLegacyAdapter) {
    warnings.push(
      createWarning(
        "legacy-listening-source",
        `${source.unitId} has no authored workbook.listeningItems. Legacy adapter fallback is active.`,
      ),
    );
  }

  items.forEach((item) => {
    const audioAsset = item.audioAssetId ? audioAssetsById.get(item.audioAssetId) : undefined;
    const clipDurationMs = getClipDurationMs(item);

    if (item.audioAssetId && hasMissingClipBounds(item)) {
      warnings.push(
        createWarning(
          "listening-full-audio-fallback",
          `${source.unitId}:${item.id} is missing clip bounds and falls back to full-audio playback.`,
        ),
      );
    } else if (clipDurationMs !== null && clipDurationMs > 6000) {
      warnings.push(
        createWarning(
          "listening-long-clip",
          `${source.unitId}:${item.id} spans ${clipDurationMs}ms, which is longer than the preferred 6000ms.`,
        ),
      );
    }

    if (!hasText(item.transcriptKo) && !hasText(audioAsset?.transcript) && !hasText(item.tts?.text)) {
      warnings.push(
        createWarning(
          "listening-missing-transcript",
          `${source.unitId}:${item.id} is missing transcript metadata.`,
        ),
      );
    }

    if (
      item.type === "fill_blank" &&
      !item.contextGroupId &&
      (hasText(item.transcriptKo) || hasText(audioAsset?.transcript)) &&
      ((item.transcriptKo ?? audioAsset?.transcript ?? "").split(/\s+/).filter(Boolean).length > 6)
    ) {
      warnings.push(
        createWarning(
          "listening-missing-context",
          `${source.unitId}:${item.id} is dialogue-like but has no contextGroupId/context bubble metadata.`,
        ),
      );
    }
  });

  return warnings;
}

export function isCompileableListeningItem(
  item: SourceListeningItem,
  audioAssetsById: Map<string, SourceAudioAsset>,
) {
  if (item.needsReview) {
    return false;
  }

  if (item.tts) {
    return true;
  }

  return Boolean(item.audioAssetId && isReadyAudioAsset(audioAssetsById.get(item.audioAssetId)));
}

function isReadyAudioAsset(asset: SourceAudioAsset | undefined) {
  return Boolean(asset && asset.remoteUrl && !asset.needsReview);
}

export function resolveSourceListeningItems(source: SourceUnit): ResolvedListeningItems {
  const authoredItems = source.workbook.listeningItems ?? [];
  const resolved =
    authoredItems.length > 0
      ? {
          items: authoredItems,
          warnings: [] as CurriculumWarning[],
          usedLegacyAdapter: false,
        }
      : adaptLegacyWorkbookListening(source);

  resolved.items.forEach((item) => validateSourceListeningItem(item, source));

  return {
    items: resolved.items,
    warnings: [
      ...resolved.warnings,
      ...collectListeningWarnings(source, resolved.items, resolved.usedLegacyAdapter),
    ],
    usedLegacyAdapter: resolved.usedLegacyAdapter,
  };
}
