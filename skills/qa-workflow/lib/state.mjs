export const STAGES = ['context', 'risk', 'cases', 'confirm', 'scripts', 'run', 'review', 'report', 'done'];

export const stageIndex = (stage) => {
  const i = STAGES.indexOf(stage);
  if (i < 0) throw new Error(`未知的 stage：${stage}（可用：${STAGES.join(', ')}）`);
  return i;
};

const entry = (stage, action, at) => ({ stage, action, at });

export const createState = ({ runId, mode, stage, now }) => ({
  version: 1,
  runId,
  mode,
  stage,
  createdAt: now,
  updatedAt: now,
  history: [entry(stage, 'start', now)]
});

const moveTo = (state, stage, action, now) => ({
  ...state,
  stage,
  updatedAt: now,
  history: [...state.history, entry(state.stage, action, now)]
});

export const advanceState = (state, action, now) =>
  moveTo(state, STAGES[Math.min(stageIndex(state.stage) + 1, STAGES.length - 1)], action, now);

export const rewindState = (state, target, now) => {
  if (stageIndex(target) >= stageIndex(state.stage)) {
    throw new Error(`只能退回到目前 stage（${state.stage}）之前的階段`);
  }
  return moveTo(state, target, `rewind→${target}`, now);
};

export const jumpState = (state, target, action, now) => moveTo(state, target, action, now);
