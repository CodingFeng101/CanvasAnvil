/**
 * Turning the recogniser's per-timestep scores into a string.
 *
 * The model reads a strip left to right and scores every character at every
 * step, so one glyph usually wins several consecutive steps and the gaps
 * between glyphs win a dedicated blank class. Collapsing runs and dropping
 * blanks is what turns that back into text -- and the order matters: collapse
 * first, then drop blanks, or a word with a doubled letter loses one of them.
 */

/**
 * The character each class index stands for.
 *
 * Index 0 is the blank class and has no character. The dictionary supplies
 * the rest, with an optional space appended, which is how the model was
 * trained and therefore not negotiable.
 */
export function buildCharset(dictionary: string, useSpace = true): string[] {
  const entries = dictionary.split(/\r?\n/);
  // A trailing newline in the dictionary file must not become a character.
  while (entries.length > 0 && entries[entries.length - 1] === "") entries.pop();

  const charset = ["", ...entries];
  if (useSpace) charset.push(" ");
  return charset;
}

export interface Recognition {
  text: string;
  confidence: number;
}

/**
 * Greedy CTC decoding of one strip.
 *
 * `scores` is a timestep-major array of class probabilities: step `t`, class
 * `c` lives at `t * classes + c`.
 */
export function ctcGreedyDecode(
  scores: Float32Array,
  steps: number,
  classes: number,
  charset: string[],
): Recognition {
  const kept: number[] = [];
  const confidences: number[] = [];
  let previous = -1;

  for (let step = 0; step < steps; step += 1) {
    const offset = step * classes;

    let best = 0;
    let bestScore = scores[offset];
    for (let index = 1; index < classes; index += 1) {
      const score = scores[offset + index];
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    }

    // A run of the same class is one character, however long it is held.
    const repeated = best === previous;
    previous = best;
    if (repeated || best === 0) continue;

    kept.push(best);
    confidences.push(bestScore);
  }

  const text = kept.map((index) => charset[index] ?? "").join("");
  const confidence =
    confidences.length === 0
      ? 0
      : confidences.reduce((total, value) => total + value, 0) / confidences.length;

  return { text, confidence };
}

/** Which of the two orientations the angle classifier chose. */
export function readAngle(
  scores: Float32Array,
  classes: number,
  threshold = 0.9,
): { upsideDown: boolean; confidence: number } {
  let best = 0;
  let bestScore = scores[0];
  for (let index = 1; index < classes; index += 1) {
    if (scores[index] > bestScore) {
      bestScore = scores[index];
      best = index;
    }
  }
  // Class 1 is 180 degrees, and only a confident call is worth acting on:
  // rotating an upright line makes it unreadable.
  return { upsideDown: best === 1 && bestScore >= threshold, confidence: bestScore };
}
