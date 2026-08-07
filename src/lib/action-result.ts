export interface ActionResult {
  error: string | null;
}

export const ACTION_OK: ActionResult = { error: null };

export function actionError(message: string): ActionResult {
  return { error: message };
}
