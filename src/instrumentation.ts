export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { runStartupTasks } = await import("@/lib/startup");
  await runStartupTasks();
}
