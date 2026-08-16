export class DesktopHostLifecycle {
  #quitting = false;
  #complete = false;
  #shutdown: Promise<void> | undefined;

  get quitting(): boolean { return this.#quitting; }

  shouldHideWindow(platform: NodeJS.Platform): boolean {
    return platform === "darwin" && !this.#quitting;
  }

  requestFullQuit(shutdown: () => Promise<void>, finish: () => void, onFailure?: (error: unknown) => void): "allow" | "wait" {
    this.#quitting = true;
    if (this.#complete) return "allow";
    if (!this.#shutdown) {
      this.#shutdown = shutdown().then(
        () => {
          this.#complete = true;
          finish();
        },
        (error: unknown) => {
          if (!onFailure) {
            this.#complete = true;
            finish();
            return;
          }
          this.#quitting = false;
          this.#shutdown = undefined;
          onFailure(error);
        },
      );
    }
    return "wait";
  }
}
