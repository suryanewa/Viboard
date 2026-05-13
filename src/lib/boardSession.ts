let savedBoardId: string | null = null;
let hasUnsavedLocalChanges = false;
let importedLocalSnapshot = false;

export const markBoardSaved = (boardId: string | null) => {
  savedBoardId = boardId;
  hasUnsavedLocalChanges = false;
};

export const markBoardUnsaved = () => {
  savedBoardId = null;
  hasUnsavedLocalChanges = true;
};

export const markBoardImported = () => {
  savedBoardId = null;
  hasUnsavedLocalChanges = true;
  importedLocalSnapshot = true;
};

export const markBoardDirty = () => {
  hasUnsavedLocalChanges = true;
};

export const markBoardClean = () => {
  hasUnsavedLocalChanges = false;
};

export const getSavedBoardId = () => savedBoardId;

export const shouldPromptToSaveBoard = () => !savedBoardId && hasUnsavedLocalChanges;

export const consumeImportedLocalSnapshotFlag = () => {
  const value = importedLocalSnapshot;
  importedLocalSnapshot = false;
  return value;
};
